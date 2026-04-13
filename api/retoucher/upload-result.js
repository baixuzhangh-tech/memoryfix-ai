/**
 * Retoucher uploads restored photo → system auto-delivers to customer.
 *
 * POST /api/retoucher/upload-result
 * Headers: x-retoucher-token or Authorization: Bearer <token>
 * Body: multipart/form-data with fields: jobId, file (the restored image)
 *
 * Flow:
 * 1. Authenticate retoucher
 * 2. Validate job belongs to retoucher and is in 'assigned' status
 * 3. Store result in Supabase storage
 * 4. Generate comparison image (before/after)
 * 5. Send delivery email to customer
 * 6. Update job status to 'delivered'
 * 7. Record all delivery metadata for quality tracking
 */

import { requireRetoucher } from '../_lib/retoucher-auth.js'
import { escapeHtml, json, sendEmail } from '../_lib/human-restore.js'
import {
  emailCtaButton,
  emailCtaFallback,
  emailInfoBox,
  emailParagraph,
  emailShell,
} from '../_lib/email-templates.js'
import {
  createSignedUrl,
  downloadObject,
  getDeliveryDownloadUrlSeconds,
  getHumanRestoreBuckets,
  getJob,
  insertEvent,
  updateJob,
  updateOrderByJobId,
  uploadObject,
} from '../_lib/supabase.js'
import { buildComparisonImage } from '../_lib/comparison-image.js'

export const config = {
  api: {
    bodyParser: false,
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return json(res, 405, { error: 'Method not allowed.' })
  }

  const retoucher = await requireRetoucher(req, res)

  if (!retoucher) {
    return
  }

  const resendApiKey = process.env.RESEND_API_KEY
  const fromEmail =
    process.env.HUMAN_RESTORE_FROM_EMAIL ||
    'MemoryFix AI <onboarding@resend.dev>'
  const supportEmail =
    process.env.HUMAN_RESTORE_SUPPORT_EMAIL || process.env.HUMAN_RESTORE_INBOX

  if (!resendApiKey || !supportEmail) {
    return json(res, 503, { error: 'Delivery email is not configured.' })
  }

  try {
    const { fields, fileBuffer, fileContentType } = await parseMultipart(req)
    const jobId = fields.jobId

    if (!jobId) {
      return json(res, 400, { error: 'jobId is required.' })
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      return json(res, 400, { error: 'Restored photo file is required.' })
    }

    const job = await getJob(jobId)

    if (!job) {
      return json(res, 404, { error: 'Job not found.' })
    }

    if (job.retoucher_id !== retoucher.id) {
      return json(res, 403, { error: 'This job is not assigned to you.' })
    }

    if (job.status !== 'assigned') {
      return json(res, 400, {
        error: `Job status is "${job.status}". Only assigned jobs can receive uploads.`,
      })
    }

    // 1. Store result in Supabase storage
    const buckets = getHumanRestoreBuckets()
    const ext = getExtension(fileContentType)
    const resultPath = `${
      job.submission_reference
    }/retoucher-result-${Date.now()}.${ext}`

    await uploadObject({
      bucket: buckets.results,
      contentType: fileContentType,
      data: fileBuffer,
      path: resultPath,
    })

    const now = new Date().toISOString()

    // 2. Update job with result path + retoucher upload timestamp
    await updateJob(jobId, {
      result_storage_bucket: buckets.results,
      result_storage_path: resultPath,
      result_file_type: fileContentType,
      retoucher_uploaded_at: now,
      status: 'delivered',
      auto_delivered: true,
      delivery_method: 'auto_retoucher',
      delivered_at: now,
    })

    // 3. Generate comparison image
    const expiresIn = getDeliveryDownloadUrlSeconds()
    const expiresDays = Math.max(1, Math.round(expiresIn / (24 * 60 * 60)))

    const downloadUrl = await createSignedUrl({
      bucket: buckets.results,
      expiresIn,
      path: resultPath,
    })

    let comparisonUrl = ''

    try {
      const [originalObj, resultObj] = await Promise.all([
        downloadObject({
          bucket: job.original_storage_bucket,
          path: job.original_storage_path,
        }),
        Promise.resolve({ buffer: fileBuffer }),
      ])
      const comparisonBuffer = await buildComparisonImage({
        originalBuffer: originalObj.buffer,
        resultBuffer: resultObj.buffer,
      })
      const comparisonPath = `${
        job.submission_reference
      }/comparison-${Date.now()}.jpg`

      await uploadObject({
        bucket: buckets.results,
        contentType: 'image/jpeg',
        data: comparisonBuffer,
        path: comparisonPath,
      })
      comparisonUrl = await createSignedUrl({
        bucket: buckets.results,
        expiresIn,
        path: comparisonPath,
      })
    } catch {
      // Comparison is optional; proceed without it
    }

    // 4. Send delivery email
    const emailContent = buildAutoDeliveryEmail({
      comparisonUrl,
      downloadUrl,
      expiresDays,
      job,
      supportEmail,
    })

    const emailPayload = await sendEmail({
      resendApiKey,
      payload: {
        from: fromEmail,
        to: [job.checkout_email],
        reply_to: supportEmail,
        subject: `Your MemoryFix AI restored photo is ready - ${job.submission_reference}`,
        html: emailContent.html,
        text: emailContent.text,
      },
    })

    // 5. Record delivery metadata
    await updateJob(jobId, {
      delivery_email_id: emailPayload?.id || null,
    })

    await updateOrderByJobId(jobId, { status: 'delivered' }).catch(() => null)

    await insertEvent(jobId, 'retoucher_upload_and_auto_deliver', {
      retoucher_id: retoucher.id,
      retoucher_name: retoucher.name,
      delivery_email_id: emailPayload?.id || null,
      result_path: resultPath,
      comparison_generated: Boolean(comparisonUrl),
      expires_in_seconds: expiresIn,
    })

    // 6. Notify admin inbox
    try {
      const inboxEmail = process.env.HUMAN_RESTORE_INBOX
      if (inboxEmail) {
        await sendEmail({
          resendApiKey,
          payload: {
            from: fromEmail,
            to: [inboxEmail],
            subject: `[Auto-delivered] ${job.submission_reference} by ${retoucher.name}`,
            text: [
              `Job ${job.submission_reference} auto-delivered by retoucher "${retoucher.name}".`,
              `Customer: ${job.checkout_email}`,
              `Retoucher ID: ${retoucher.id}`,
              `Result file: ${resultPath}`,
              `Delivery email ID: ${emailPayload?.id || 'unknown'}`,
            ].join('\n'),
          },
        })
      }
    } catch {
      // Admin notification is best-effort
    }

    json(res, 200, {
      ok: true,
      delivered: true,
      submissionReference: job.submission_reference,
      deliveryEmailId: emailPayload?.id || null,
    })
  } catch (error) {
    json(res, 500, {
      error:
        error instanceof Error
          ? error.message
          : 'Could not upload and deliver result.',
    })
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getExtension(contentType) {
  const map = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  }

  return map[contentType] || 'jpg'
}

function buildAutoDeliveryEmail({
  comparisonUrl,
  downloadUrl,
  expiresDays,
  job,
  supportEmail,
}) {
  const esc = escapeHtml

  const comparisonSection = comparisonUrl
    ? [
        `<tr><td align="center" style="padding:0 0 8px 0"><table border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto"><tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#9b6b3c;padding-bottom:12px" align="center">BEFORE &amp; AFTER</td></tr></table></td></tr>`,
        `<tr><td align="center" style="padding:0 0 6px 0"><img src="${esc(
          comparisonUrl
        )}" alt="Before and after comparison" width="520" style="display:block;max-width:100%;height:auto;border-radius:8px;border:1px solid #e6d2b7" /></td></tr>`,
        `<tr><td align="center" style="padding:0 0 28px 0"><a href="${esc(
          comparisonUrl
        )}" style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9b6b3c;text-decoration:underline" download>Save comparison image</a></td></tr>`,
      ].join('')
    : ''

  const bodyRows = [
    emailParagraph(
      'Thank you for choosing MemoryFix AI. Our team has carefully reviewed and restored your photo. We hope the result brings back wonderful memories.'
    ),
    comparisonSection,
    emailCtaButton(downloadUrl, 'Download Restored Photo'),
    emailCtaFallback(downloadUrl, 'Click here to download'),
    emailInfoBox(
      `This private download link expires in <strong style="color:#4a3728">${expiresDays} days</strong>.<br/>If it expires before you download, just reply to this email.`
    ),
  ].join('')

  const html = emailShell({
    title: 'Your restored photo is ready',
    heroTitle: 'Your restored photo<br/>is ready',
    heroSubtitle: `Order ${esc(job.submission_reference)}`,
    bodyRows,
    footerRef: job.submission_reference,
    supportEmail,
  })

  const text = [
    'YOUR RESTORED PHOTO IS READY',
    '',
    'Thank you for choosing MemoryFix AI. Our team has carefully reviewed and restored your photo.',
    '',
    `Download restored photo: ${downloadUrl}`,
    '',
    comparisonUrl ? `Before & after comparison: ${comparisonUrl}` : '',
    `This private link expires in about ${expiresDays} days. If it expires, reply to this email.`,
    '',
    `Ref: ${job.submission_reference}`,
    `Support: ${supportEmail}`,
    `\u00a9 ${new Date().getFullYear()} MemoryFix AI`,
  ]
    .filter(Boolean)
    .join('\n')

  return { html, text }
}

// Simple multipart/form-data parser (no external dependency)
async function parseMultipart(req) {
  const contentType = req.headers['content-type'] || ''

  if (!contentType.includes('multipart/form-data')) {
    throw new Error('Content-Type must be multipart/form-data.')
  }

  const boundaryMatch = contentType.match(/boundary=(.+?)(?:;|$)/)

  if (!boundaryMatch) {
    throw new Error('Missing multipart boundary.')
  }

  const boundary = boundaryMatch[1].replace(/^["']|["']$/g, '')

  const chunks = []

  for await (const chunk of req) {
    chunks.push(chunk)
  }

  const body = Buffer.concat(chunks)
  const parts = splitMultipartBody(body, boundary)
  const fields = {}
  let fileBuffer = null
  let fileContentType = 'image/jpeg'

  for (const part of parts) {
    const headerEnd = part.indexOf('\r\n\r\n')

    if (headerEnd === -1) {
      continue
    }

    const headerSection = part.slice(0, headerEnd).toString('utf8')
    const content = part.slice(headerEnd + 4)

    const nameMatch = headerSection.match(/name="([^"]+)"/)
    const filenameMatch = headerSection.match(/filename="([^"]*)"/)
    const ctMatch = headerSection.match(/Content-Type:\s*(.+)/i)

    if (!nameMatch) {
      continue
    }

    const fieldName = nameMatch[1]

    if (filenameMatch) {
      // Trim trailing \r\n from file content
      fileBuffer =
        content.length >= 2 &&
        content[content.length - 2] === 13 &&
        content[content.length - 1] === 10
          ? content.slice(0, content.length - 2)
          : content
      fileContentType = ctMatch ? ctMatch[1].trim() : 'image/jpeg'
    } else {
      fields[fieldName] = content.toString('utf8').replace(/\r\n$/, '')
    }
  }

  return { fields, fileBuffer, fileContentType }
}

function splitMultipartBody(body, boundary) {
  const delimiter = Buffer.from(`--${boundary}`)
  const parts = []
  let start = 0

  while (true) {
    const idx = body.indexOf(delimiter, start)

    if (idx === -1) {
      break
    }

    if (start > 0) {
      // Content between previous delimiter end and this delimiter
      const partContent = body.slice(start, idx)
      if (partContent.length > 2) {
        // Remove leading \r\n
        const trimmed =
          partContent[0] === 13 && partContent[1] === 10
            ? partContent.slice(2)
            : partContent
        if (trimmed.length > 0) {
          parts.push(trimmed)
        }
      }
    }

    start = idx + delimiter.length

    // Check for closing --
    if (body[start] === 45 && body[start + 1] === 45) {
      break
    }
  }

  return parts
}

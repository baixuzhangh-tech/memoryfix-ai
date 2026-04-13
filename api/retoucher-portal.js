/**
 * Unified retoucher portal API.
 *
 * POST /api/retoucher-portal  body: { action: "jobs" | "upload_result" }
 *
 * - action=jobs         → list assigned jobs (GET-like, token auth)
 * - action=upload_result → upload restored photo + auto-deliver (multipart)
 */

import { requireRetoucher } from './_lib/retoucher-auth.js'
import {
  escapeHtml,
  json,
  readRawBody,
  sendEmail,
} from './_lib/human-restore.js'
import {
  emailCtaButton,
  emailCtaFallback,
  emailInfoBox,
  emailParagraph,
  emailShell,
} from './_lib/email-templates.js'
import {
  createSignedUrl,
  downloadObject,
  getDeliveryDownloadUrlSeconds,
  getHumanRestoreBuckets,
  getJob,
  insertEvent,
  listJobsByRetoucher,
  updateJob,
  updateOrderByJobId,
  uploadObject,
} from './_lib/supabase.js'
import { buildComparisonImage } from './_lib/comparison-image.js'

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

  // Peek at content-type to decide routing
  const contentType = req.headers['content-type'] || ''
  const isMultipart = contentType.includes('multipart/form-data')

  try {
    if (isMultipart) {
      // Multipart upload → upload_result action
      return await handleUploadResult(req, res, retoucher)
    }

    // JSON body → route by action
    const rawBody = await readRawBody(req)
    const body = rawBody.length ? JSON.parse(rawBody.toString('utf8')) : {}
    const action = body.action || req.query?.action || 'jobs'

    switch (action) {
      case 'jobs':
        return await handleListJobs(req, res, retoucher, body)
      case 'upload_result':
        return json(res, 400, {
          error: 'upload_result requires multipart/form-data.',
        })
      default:
        return json(res, 400, {
          error: 'Unknown action. Supported: jobs, upload_result (multipart).',
        })
    }
  } catch (error) {
    json(res, 500, {
      error: error instanceof Error ? error.message : 'Retoucher portal error.',
    })
  }
}

// ---------------------------------------------------------------------------
// Action: list jobs
// ---------------------------------------------------------------------------

async function handleListJobs(req, res, retoucher, body) {
  const status = body.status || req.query?.status || undefined
  const jobs = await listJobsByRetoucher(retoucher.id, { status })

  const jobsWithUrls = await Promise.all(
    (jobs || []).map(async job => {
      const originalSignedUrl = await createSignedUrl({
        bucket: job.original_storage_bucket,
        path: job.original_storage_path,
      })

      return {
        id: job.id,
        submissionReference: job.submission_reference,
        status: job.status,
        notes: job.notes || '',
        originalFileName: job.original_file_name,
        originalFileSize: job.original_file_size,
        originalDownloadUrl: originalSignedUrl,
        assignedAt: job.retoucher_assigned_at,
        uploadedAt: job.retoucher_uploaded_at,
        createdAt: job.created_at,
      }
    })
  )

  json(res, 200, {
    ok: true,
    retoucherName: retoucher.name,
    jobs: jobsWithUrls,
  })
}

// ---------------------------------------------------------------------------
// Action: upload result + auto-deliver
// ---------------------------------------------------------------------------

async function handleUploadResult(req, res, retoucher) {
  const resendApiKey = process.env.RESEND_API_KEY
  const fromEmail =
    process.env.HUMAN_RESTORE_FROM_EMAIL ||
    'MemoryFix AI <onboarding@resend.dev>'
  const supportEmail =
    process.env.HUMAN_RESTORE_SUPPORT_EMAIL || process.env.HUMAN_RESTORE_INBOX

  if (!resendApiKey || !supportEmail) {
    return json(res, 503, { error: 'Delivery email is not configured.' })
  }

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

  // 2. Update job with result + retoucher upload timestamp
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

  // 3. Generate comparison image + signed URLs
  const expiresIn = getDeliveryDownloadUrlSeconds()
  const expiresDays = Math.max(1, Math.round(expiresIn / (24 * 60 * 60)))

  const downloadUrl = await createSignedUrl({
    bucket: buckets.results,
    expiresIn,
    path: resultPath,
  })

  let comparisonUrl = ''

  try {
    const originalObj = await downloadObject({
      bucket: job.original_storage_bucket,
      path: job.original_storage_path,
    })
    const comparisonBuffer = await buildComparisonImage({
      originalBuffer: originalObj.buffer,
      resultBuffer: fileBuffer,
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

  // 4. Send delivery email to customer
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

  // 5. Record delivery metadata for quality tracking
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

  // 6. Notify admin inbox (best-effort)
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
      fields[nameMatch[1]] = content.toString('utf8').replace(/\r\n$/, '')
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
      const partContent = body.slice(start, idx)
      if (partContent.length > 2) {
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

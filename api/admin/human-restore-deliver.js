import { requireAdmin } from '../_lib/admin.js'
import {
  escapeHtml,
  json,
  readRawBody,
  sendEmail,
} from '../_lib/human-restore.js'
import {
  emailCtaButton,
  emailCtaFallback,
  emailInfoBox,
  emailNoteBox,
  emailParagraph,
  emailShell,
} from '../_lib/email-templates.js'
import {
  createJobSignedUrls,
  createSignedUrl,
  downloadObject,
  getAiDraftStorage,
  getDeliveryDownloadUrlSeconds,
  getFinalStorage,
  getHumanRestoreBuckets,
  getJob,
  insertEvent,
  updateOrderByJobId,
  updateJob,
  uploadObject,
} from '../_lib/supabase.js'
import { buildComparisonImage } from '../_lib/comparison-image.js'

export const config = {
  api: {
    bodyParser: false,
  },
}

function buildDeliveryEmail({
  comparisonUrl,
  deliverySource,
  downloadUrl,
  expiresDays,
  job,
  reviewNote,
  supportEmail,
}) {
  const esc = escapeHtml

  const comparisonSection = comparisonUrl
    ? [
        `<tr><td align="center" style="padding:0 0 8px 0"><table border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto"><tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#9b6b3c;padding-bottom:12px" align="center">BEFORE &amp; AFTER</td></tr></table></td></tr>`,
        `<tr><td align="center" style="padding:0 0 6px 0"><img src="${esc(comparisonUrl)}" alt="Before and after comparison" width="520" style="display:block;max-width:100%;height:auto;border-radius:8px;border:1px solid #e6d2b7" /></td></tr>`,
        `<tr><td align="center" style="padding:0 0 28px 0"><a href="${esc(comparisonUrl)}" style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9b6b3c;text-decoration:underline" download>Save comparison image</a></td></tr>`,
      ].join('')
    : ''

  const reviewSection = reviewNote
    ? emailNoteBox(
        `<strong style="color:#211915">Note from our team:</strong><br/>${esc(reviewNote).replace(/\n/g, '<br/>')}`
      )
    : ''
  const deliveryContext =
    deliverySource === 'human_uploaded_final'
      ? emailParagraph(
          'Your photo was manually refined and reviewed by our team before delivery.'
        )
      : emailParagraph(
          'We prepared an AI restoration draft, then reviewed and approved it before delivery.'
        )

  const bodyRows = [
    emailParagraph(
      'Thank you for choosing MemoryFix AI. Our team has carefully reviewed and restored your photo. We hope the result brings back wonderful memories.'
    ),
    deliveryContext,
    comparisonSection,
    emailCtaButton(downloadUrl, 'Download Restored Photo'),
    emailCtaFallback(downloadUrl, 'Click here to download'),
    emailInfoBox(
      `This private download link expires in <strong style="color:#4a3728">${expiresDays} days</strong>.<br/>If it expires before you download, just reply to this email.`
    ),
    reviewSection,
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
    reviewNote ? `Note from our team: ${reviewNote}\n` : '',
    `Ref: ${job.submission_reference}`,
    `Support: ${supportEmail}`,
    `© ${new Date().getFullYear()} MemoryFix AI`,
  ]
    .filter(Boolean)
    .join('\n')

  return { html, text }
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) {
    return
  }

  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed.' })
    return
  }

  const resendApiKey = process.env.RESEND_API_KEY
  const fromEmail =
    process.env.HUMAN_RESTORE_FROM_EMAIL ||
    'MemoryFix AI <onboarding@resend.dev>'
  const supportEmail =
    process.env.HUMAN_RESTORE_SUPPORT_EMAIL || process.env.HUMAN_RESTORE_INBOX

  if (!resendApiKey || !supportEmail) {
    json(res, 503, { error: 'Delivery email is not configured yet.' })
    return
  }

  try {
    const rawBody = await readRawBody(req)
    const body = rawBody.length ? JSON.parse(rawBody.toString('utf8')) : {}
    const jobId = body.jobId
    const requestedDeliverySource = String(body.deliverySource || '').trim()
    const reviewNote = String(body.reviewNote || '').trim()

    if (!jobId) {
      json(res, 400, { error: 'jobId is required.' })
      return
    }

    const job = await getJob(jobId)

    if (!job) {
      json(res, 404, { error: 'Restore job not found.' })
      return
    }

    const aiDraftStorage = getAiDraftStorage(job)
    const explicitFinalStorage = getFinalStorage(job)
    const deliverySource =
      requestedDeliverySource ||
      (job.final_storage_bucket && job.final_storage_path
        ? 'human_uploaded_final'
        : 'ai_draft_human_approved')
    const deliveryStorage =
      deliverySource === 'human_uploaded_final'
        ? explicitFinalStorage
        : aiDraftStorage

    if (!deliveryStorage) {
      json(res, 400, {
        error:
          deliverySource === 'human_uploaded_final'
            ? 'This job does not have a final reviewed result ready for delivery.'
            : 'This job does not have an AI draft ready for approval and delivery.',
      })
      return
    }

    const expiresIn = getDeliveryDownloadUrlSeconds()
    const expiresDays = Math.max(1, Math.round(expiresIn / (24 * 60 * 60)))
    const downloadUrl = await createSignedUrl({
      bucket: deliveryStorage.bucket,
      expiresIn,
      path: deliveryStorage.path,
    })

    let comparisonUrl = ''

    try {
      const [originalObj, resultObj] = await Promise.all([
        downloadObject({
          bucket: job.original_storage_bucket,
          path: job.original_storage_path,
        }),
        downloadObject({
          bucket: deliveryStorage.bucket,
          path: deliveryStorage.path,
        }),
      ])
      const comparisonBuffer = await buildComparisonImage({
        originalBuffer: originalObj.buffer,
        resultBuffer: resultObj.buffer,
      })
      const buckets = getHumanRestoreBuckets()
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
    } catch (comparisonError) {
      // Comparison image is optional; proceed without it.
    }

    const emailContent = buildDeliveryEmail({
      comparisonUrl,
      deliverySource,
      downloadUrl,
      expiresDays,
      job,
      reviewNote,
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
    const deliveredAt = new Date().toISOString()
    const finalPatch =
      deliverySource === 'ai_draft_human_approved'
        ? {
            final_file_type:
              deliveryStorage.contentType || job.ai_draft_file_type || null,
            final_source: 'ai_draft_human_approved',
            final_storage_bucket: deliveryStorage.bucket,
            final_storage_path: deliveryStorage.path,
            final_uploaded_at: deliveredAt,
            final_uploaded_by: 'admin_review',
          }
        : {
            final_source: job.final_source || 'human_uploaded_final',
          }
    const updatedJob = await updateJob(jobId, {
      ...finalPatch,
      delivery_source: deliverySource,
      delivered_at: new Date().toISOString(),
      delivery_email_id: emailPayload?.id || null,
      review_note: reviewNote,
      status: 'delivered',
    })
    await updateOrderByJobId(jobId, {
      status: 'delivered',
    }).catch(() => null)

    await insertEvent(jobId, 'delivery_email_sent', {
      delivery_source: deliverySource,
      delivery_email_id: emailPayload?.id || null,
      expires_in_seconds: expiresIn,
    })

    json(res, 200, {
      job: await createJobSignedUrls(updatedJob),
      ok: true,
    })
  } catch (error) {
    json(res, 500, {
      error:
        error instanceof Error
          ? error.message
          : 'Could not deliver restored result.',
    })
  }
}

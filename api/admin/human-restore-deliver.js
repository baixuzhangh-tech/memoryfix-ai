import { requireAdmin } from '../_lib/admin.js'
import {
  escapeHtml,
  json,
  readRawBody,
  sendEmail,
} from '../_lib/human-restore.js'
import {
  createSignedUrl,
  getDeliveryDownloadUrlSeconds,
  getJob,
  insertEvent,
  updateJob,
} from '../_lib/supabase.js'

export const config = {
  api: {
    bodyParser: false,
  },
}

function buildDeliveryEmail({
  downloadUrl,
  expiresDays,
  job,
  reviewNote,
  supportEmail,
}) {
  const html = `
    <h1>Your restored photo is ready</h1>
    <p>Thank you for using MemoryFix AI Human-assisted Restore.</p>
    <p>Your reviewed result is ready here:</p>
    <p><a href="${escapeHtml(downloadUrl)}">${escapeHtml(downloadUrl)}</a></p>
    <p>This private download link expires in about ${expiresDays} days. If it expires before you download, reply to this email and we can resend it during the 30-day beta retention window.</p>
    ${
      reviewNote
        ? `<p><strong>Review note:</strong><br />${escapeHtml(
            reviewNote
          ).replace(/\n/g, '<br />')}</p>`
        : ''
    }
    <p>Submission reference: ${escapeHtml(job.submission_reference)}</p>
    <p>Support: ${escapeHtml(supportEmail)}</p>
  `
  const text = [
    'Your restored photo is ready.',
    `Download: ${downloadUrl}`,
    `This private download link expires in about ${expiresDays} days.`,
    reviewNote ? `Review note: ${reviewNote}` : '',
    `Submission reference: ${job.submission_reference}`,
    `Support: ${supportEmail}`,
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

    if (!job.result_storage_bucket || !job.result_storage_path) {
      json(res, 400, {
        error: 'This job does not have an AI result ready for delivery.',
      })
      return
    }

    const expiresIn = getDeliveryDownloadUrlSeconds()
    const expiresDays = Math.max(1, Math.round(expiresIn / (24 * 60 * 60)))
    const downloadUrl = await createSignedUrl({
      bucket: job.result_storage_bucket,
      expiresIn,
      path: job.result_storage_path,
    })
    const emailContent = buildDeliveryEmail({
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
    const updatedJob = await updateJob(jobId, {
      delivered_at: new Date().toISOString(),
      delivery_email_id: emailPayload?.id || null,
      review_note: reviewNote,
      status: 'delivered',
    })

    await insertEvent(jobId, 'delivery_email_sent', {
      delivery_email_id: emailPayload?.id || null,
      expires_in_seconds: expiresIn,
    })

    json(res, 200, {
      job: updatedJob,
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

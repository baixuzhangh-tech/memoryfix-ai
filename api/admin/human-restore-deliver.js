import { requireAdmin } from '../_lib/admin.js'
import {
  escapeHtml,
  json,
  readRawBody,
  sendEmail,
} from '../_lib/human-restore.js'
import {
  createSignedUrl,
  downloadObject,
  getDeliveryDownloadUrlSeconds,
  getHumanRestoreBuckets,
  getJob,
  insertEvent,
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
  downloadUrl,
  expiresDays,
  job,
  reviewNote,
  supportEmail,
}) {
  const comparisonSection = comparisonUrl
    ? `
      <div style="margin:24px 0;text-align:center">
        <p style="font-size:14px;color:#9b6b3c;font-weight:bold;letter-spacing:2px;text-transform:uppercase">Before & After</p>
        <img src="${escapeHtml(comparisonUrl)}" alt="Before and after comparison" style="max-width:100%;border-radius:12px;border:2px solid #e6d2b7" />
        <p style="margin-top:8px;font-size:13px"><a href="${escapeHtml(comparisonUrl)}" style="color:#9b6b3c" download>Download comparison image</a></p>
      </div>
    `
    : ''

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#211915">
      <h1 style="color:#211915;font-size:24px">Your restored photo is ready ✨</h1>
      <p>Thank you for using MemoryFix AI Human-assisted Restore.</p>
      ${comparisonSection}
      <p><strong>Download your restored photo:</strong></p>
      <p style="margin:16px 0"><a href="${escapeHtml(downloadUrl)}" style="display:inline-block;background:#211915;color:#fff;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:bold">Download restored photo</a></p>
      <p style="font-size:13px;color:#66574d">Or copy this link: <a href="${escapeHtml(downloadUrl)}" style="color:#9b6b3c">${escapeHtml(downloadUrl)}</a></p>
      <p style="font-size:13px;color:#66574d">This private link expires in about ${expiresDays} days. If it expires before you download, reply to this email and we can resend it.</p>
      ${
        reviewNote
          ? `<div style="margin:16px 0;padding:12px 16px;background:#fffaf3;border:1px solid #e6d2b7;border-radius:12px"><strong>Note from our team:</strong><br />${escapeHtml(
              reviewNote
            ).replace(/\n/g, '<br />')}</div>`
          : ''
      }
      <hr style="border:none;border-top:1px solid #e6d2b7;margin:24px 0" />
      <p style="font-size:12px;color:#9b6b3c">Ref: ${escapeHtml(job.submission_reference)} · Support: ${escapeHtml(supportEmail)}</p>
    </div>
  `
  const text = [
    'Your restored photo is ready.',
    `Download restored photo: ${downloadUrl}`,
    comparisonUrl ? `Before & after comparison: ${comparisonUrl}` : '',
    `This private link expires in about ${expiresDays} days.`,
    reviewNote ? `Note from our team: ${reviewNote}` : '',
    `Ref: ${job.submission_reference} · Support: ${supportEmail}`,
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

    let comparisonUrl = ''

    try {
      const [originalObj, resultObj] = await Promise.all([
        downloadObject({
          bucket: job.original_storage_bucket,
          path: job.original_storage_path,
        }),
        downloadObject({
          bucket: job.result_storage_bucket,
          path: job.result_storage_path,
        }),
      ])
      const comparisonBuffer = await buildComparisonImage({
        originalBuffer: originalObj.buffer,
        resultBuffer: resultObj.buffer,
      })
      const buckets = getHumanRestoreBuckets()
      const comparisonPath = `${job.submission_reference}/comparison-${Date.now()}.jpg`

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

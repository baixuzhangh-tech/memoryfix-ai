/**
 * Programmatic AI HD auto-delivery.
 *
 * Mirrors the happy path of `api/admin/human-restore-deliver.js`
 * (approve the existing AI draft, email the customer, flip job +
 * order to `delivered`) but as a function so the upload and
 * webhook handlers can fire it automatically for AI HD tier jobs.
 *
 * This is intentionally scoped to `ai_draft_human_approved`
 * deliveries — AI HD orders never have a retoucher-uploaded final,
 * so we only need to sign the existing AI draft and send the
 * delivery email.
 */

import { escapeHtml, sendEmail } from './human-restore.js'
import {
  emailCtaButton,
  emailCtaFallback,
  emailInfoBox,
  emailParagraph,
  emailShell,
} from './email-templates.js'
import { buildComparisonImage } from './comparison-image.js'
import {
  createSignedUrl,
  downloadObject,
  getAiDraftStorage,
  getDeliveryDownloadUrlSeconds,
  getHumanRestoreBuckets,
  insertEvent,
  updateJob,
  updateOrderByJobId,
  uploadObject,
} from './supabase.js'

function buildAiHdDeliveryEmail({
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
      'Thank you for choosing MemoryFix AI HD. Your restored photo is ready to download.'
    ),
    emailParagraph(
      'This is an AI-only restoration focused on color, clarity, and damage repair. Faces may vary slightly from the original — if you would like a face-accurate, human-retouched version, just reply to this email.'
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
    heroTitle: 'Your AI HD restore<br/>is ready',
    heroSubtitle: `Order ${esc(job.submission_reference)}`,
    bodyRows,
    footerRef: job.submission_reference,
    supportEmail,
  })

  const text = [
    'YOUR AI HD RESTORED PHOTO IS READY',
    '',
    'Thank you for choosing MemoryFix AI HD.',
    'This is an AI-only restoration focused on color, clarity, and damage repair.',
    'Faces may vary slightly. For a face-accurate, human-retouched version, reply to this email.',
    '',
    `Download restored photo: ${downloadUrl}`,
    '',
    comparisonUrl ? `Before & after comparison: ${comparisonUrl}` : '',
    `This private link expires in about ${expiresDays} days.`,
    '',
    `Ref: ${job.submission_reference}`,
    `Support: ${supportEmail}`,
    `© ${new Date().getFullYear()} MemoryFix AI`,
  ]
    .filter(Boolean)
    .join('\n')

  return { html, text }
}

/**
 * Auto-deliver an AI HD job. Safe to call idempotently — if the
 * job is already delivered or missing a draft we return the input
 * job untouched. Throws only on infrastructure / email errors.
 */
export async function autoDeliverAiHdJob({
  job,
  resendApiKey,
  fromEmail,
  supportEmail,
}) {
  if (!job) {
    return { delivered: false, reason: 'missing_job', job: null }
  }

  if (job.status === 'delivered') {
    return { delivered: false, reason: 'already_delivered', job }
  }

  const aiDraftStorage = getAiDraftStorage(job)

  if (!aiDraftStorage?.bucket || !aiDraftStorage?.path) {
    return { delivered: false, reason: 'no_ai_draft', job }
  }

  if (!resendApiKey || !fromEmail || !supportEmail) {
    return { delivered: false, reason: 'email_not_configured', job }
  }

  if (!job.checkout_email) {
    return { delivered: false, reason: 'no_checkout_email', job }
  }

  const expiresIn = getDeliveryDownloadUrlSeconds()
  const expiresDays = Math.max(1, Math.round(expiresIn / (24 * 60 * 60)))
  const downloadUrl = await createSignedUrl({
    bucket: aiDraftStorage.bucket,
    expiresIn,
    path: aiDraftStorage.path,
  })

  let comparisonUrl = ''

  try {
    const [originalObj, resultObj] = await Promise.all([
      downloadObject({
        bucket: job.original_storage_bucket,
        path: job.original_storage_path,
      }),
      downloadObject({
        bucket: aiDraftStorage.bucket,
        path: aiDraftStorage.path,
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
  } catch {
    // Comparison image is optional.
  }

  const emailContent = buildAiHdDeliveryEmail({
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
      subject: `Your MemoryFix AI HD restored photo is ready - ${job.submission_reference}`,
      html: emailContent.html,
      text: emailContent.text,
    },
  })

  const deliveredAt = new Date().toISOString()
  const updatedJob = await updateJob(job.id, {
    delivered_at: deliveredAt,
    delivery_email_id: emailPayload?.id || null,
    delivery_source: 'ai_draft_human_approved',
    final_file_type:
      aiDraftStorage.contentType || job.ai_draft_file_type || null,
    final_source: 'ai_hd_auto_delivered',
    final_storage_bucket: aiDraftStorage.bucket,
    final_storage_path: aiDraftStorage.path,
    final_uploaded_at: deliveredAt,
    final_uploaded_by: 'ai_hd_auto_delivery',
    status: 'delivered',
  })

  await updateOrderByJobId(job.id, { status: 'delivered' }).catch(() => null)

  await insertEvent(job.id, 'ai_hd_auto_delivered', {
    delivery_email_id: emailPayload?.id || null,
    expires_in_seconds: expiresIn,
  })

  return { delivered: true, job: updatedJob || job }
}

import {
  createSubmissionReference,
  escapeHtml,
  getBoundary,
  json,
  parseMultipartForm,
  readRawBody,
  sendEmail,
  verifyOrderUploadToken,
} from './_lib/human-restore.js'
import {
  emailCtaButton,
  emailCtaFallback,
  emailDetailBlock,
  emailInfoBox,
  emailNoteBox,
  emailParagraph,
  emailShell,
  emailStepsList,
} from './_lib/email-templates.js'
import {
  countJobsByOrderId,
  countRecentJobsByEmail,
  getOrder,
  getOrderByProviderOrderId,
  getHumanRestoreBuckets,
  insertEvent,
  insertJob,
  isSupabaseConfigured,
  uploadObject,
} from './_lib/supabase.js'
import { runRestoreJob } from './_lib/ai-restore.js'
import {
  validateContentPolicyAcceptance,
  validateHumanRestoreSubmissionText,
} from './_lib/content-policy.js'

export const config = {
  api: {
    bodyParser: false,
  },
}

const maxUploadSizeBytes = 15 * 1024 * 1024
const maxSubmissionsPerOrder = 1
const maxFallbackSubmissionsPerDay = 2

const allowedImageTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
])

function shouldAutoProcessAfterUpload() {
  return process.env.HUMAN_RESTORE_AUTO_PROCESS_AFTER_UPLOAD !== 'false'
}

function normalizeEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function isPaidOrderStatus(status) {
  return [
    'paid',
    'uploaded',
    'processing',
    'ai_queued',
    'ai_failed',
    'needs_review',
    'manual_review',
    'delivered',
  ].includes(status)
}

function looksLikeUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || '')
  )
}

function localOrderToUploadOrder(localOrder) {
  if (!localOrder) {
    return null
  }

  return {
    checkoutEmail: localOrder.checkout_email || '',
    customerName: localOrder.customer_name || '',
    localOrderId: localOrder.id,
    orderId: localOrder.payment_provider_order_id || localOrder.id,
    orderNumber:
      localOrder.order_number ||
      localOrder.payment_provider_order_id ||
      localOrder.id,
    productName: localOrder.product_name || 'Human-assisted Restore',
    receiptUrl: localOrder.receipt_url || '',
    testMode: Boolean(localOrder.test_mode),
  }
}

async function verifyPaddlePaidOrder({ email, orderReference }) {
  const normalizedEmail = normalizeEmail(email)
  const reference = String(orderReference || '').trim()
  let localOrder = null

  if (reference) {
    if (looksLikeUuid(reference)) {
      localOrder = await getOrder(reference)
    }

    if (!localOrder) {
      localOrder = await getOrderByProviderOrderId(reference)
    }
  }

  if (!localOrder) {
    return {
      verified: false,
      reason:
        'No paid order matched this checkout email and transaction reference. Please use the secure upload link from your payment confirmation or contact support.',
    }
  }

  if (normalizeEmail(localOrder.checkout_email) !== normalizedEmail) {
    return {
      verified: false,
      reason: 'Checkout email does not match this paid order.',
    }
  }

  if (!isPaidOrderStatus(localOrder.status)) {
    return {
      verified: false,
      reason:
        'This order is not paid yet. Please wait for payment confirmation and try again.',
    }
  }

  const configuredPriceId = process.env.PADDLE_HUMAN_RESTORE_PRICE_ID

  if (
    configuredPriceId &&
    localOrder.variant_id &&
    String(localOrder.variant_id) !== String(configuredPriceId)
  ) {
    return {
      verified: false,
      reason: 'This paid order is not for Human-assisted Restore.',
    }
  }

  if (localOrder.job_id) {
    return {
      verified: false,
      reason:
        'This order already has a photo submission. If you need to replace the photo, please contact support.',
    }
  }

  return {
    verified: true,
    localOrder,
    order: localOrderToUploadOrder(localOrder),
  }
}

async function sendMerchantNotificationEmail({
  adminUrl,
  resendApiKey,
  fromEmail,
  inboxEmail,
  supportEmail,
  jobId,
  submissionReference,
  uploadSource,
  checkoutEmail,
  orderReference,
  notes,
  photo,
}) {
  const subjectSuffix = orderReference
    ? `Order ${orderReference}`
    : `Checkout ${checkoutEmail}`

  const bodyRows = [
    emailDetailBlock([
      ['Submission reference', submissionReference],
      ['Upload source', uploadSource],
      ['Checkout email', checkoutEmail],
      ['Payment reference', orderReference || 'Not provided'],
      ['Job ID', jobId],
      ['Stored file', photo.filename],
    ]),
    emailNoteBox(
      `<strong style="color:#211915">Repair notes:</strong><br/>${escapeHtml(
        notes || 'No extra notes provided.'
      ).replace(/\n/g, '<br/>')}`
    ),
    emailCtaButton(adminUrl, 'Open Admin Review'),
    emailCtaFallback(adminUrl, 'Open admin review page'),
  ].join('')

  const html = emailShell({
    title: 'New upload received',
    heroTitle: 'New photo upload<br/>received',
    heroSubtitle: submissionReference,
    bodyRows,
    footerRef: submissionReference,
    supportEmail,
  })

  const text = [
    'New Human-assisted Restore upload',
    `Submission reference: ${submissionReference}`,
    `Upload source: ${uploadSource}`,
    `Checkout email: ${checkoutEmail}`,
    `Payment reference: ${orderReference || 'Not provided'}`,
    `Job ID: ${jobId}`,
    `Stored file: ${photo.filename}`,
    `Repair notes: ${notes || 'No extra notes provided.'}`,
    `Admin review: ${adminUrl}`,
    `Support contact: ${supportEmail}`,
  ].join('\n')

  await sendEmail({
    resendApiKey,
    payload: {
      from: fromEmail,
      to: [inboxEmail],
      reply_to: checkoutEmail,
      subject: `MemoryFix AI upload - ${subjectSuffix}`,
      html,
      text,
    },
  })
}

async function sendCustomerConfirmationEmail({
  resendApiKey,
  fromEmail,
  supportEmail,
  submissionReference,
  checkoutEmail,
  orderReference,
}) {
  const bodyRows = [
    emailParagraph(
      'Thank you for submitting your paid Human-assisted Restore order to MemoryFix AI. We have received your photo.'
    ),
    emailDetailBlock([
      ['Submission reference', submissionReference],
      ['Checkout email', checkoutEmail],
      ['Payment reference', orderReference || 'Not provided'],
    ]),
    emailParagraph('<strong style="color:#211915">What happens next:</strong>'),
    emailStepsList([
      'We match this upload to your paid order.',
      'We review the image and your notes.',
      'We deliver the restored result by email within 48 hours during beta.',
    ]),
    emailInfoBox(
      'Need to update the photo or add details? Just reply to this email and include your submission reference.'
    ),
  ].join('')

  const html = emailShell({
    title: 'We received your photo',
    heroTitle: 'We received<br/>your photo',
    heroSubtitle: submissionReference,
    bodyRows,
    footerRef: submissionReference,
    supportEmail,
  })

  const text = [
    'We received your photo for MemoryFix AI Human-assisted Restore.',
    `Submission reference: ${submissionReference}`,
    `Checkout email: ${checkoutEmail}`,
    `Payment reference: ${orderReference || 'Not provided'}`,
    'Next steps:',
    '- We match this upload to your paid order.',
    '- We review the image and your notes.',
    '- We deliver the restored result by email within 48 hours during beta.',
    `If you need help, reply to this email or contact ${supportEmail}.`,
  ].join('\n')

  await sendEmail({
    resendApiKey,
    payload: {
      from: fromEmail,
      to: [checkoutEmail],
      reply_to: supportEmail,
      subject: `We received your photo - ${submissionReference}`,
      html,
      text,
    },
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed.' })
    return
  }

  const resendApiKey = process.env.RESEND_API_KEY
  const inboxEmail = process.env.HUMAN_RESTORE_INBOX
  const supportEmail = process.env.HUMAN_RESTORE_SUPPORT_EMAIL || inboxEmail
  const uploadTokenSecret = process.env.HUMAN_RESTORE_UPLOAD_TOKEN_SECRET
  const siteUrl = process.env.SITE_URL || 'https://artgen.site'
  const fromEmail =
    process.env.HUMAN_RESTORE_FROM_EMAIL ||
    'MemoryFix AI <onboarding@resend.dev>'

  if (!resendApiKey || !inboxEmail || !isSupabaseConfigured()) {
    json(res, 503, {
      error:
        'Upload is not configured yet. Please try again later or use your order email as fallback.',
    })
    return
  }

  const contentType = req.headers['content-type'] || ''
  const boundary = getBoundary(contentType)

  if (!boundary) {
    json(res, 400, { error: 'Invalid upload request.' })
    return
  }

  try {
    const rawBody = await readRawBody(req)
    const { fields, file } = parseMultipartForm(rawBody, boundary)
    const submissionReference = createSubmissionReference()
    const token = (fields.token || '').trim()
    const tokenVerification = token
      ? verifyOrderUploadToken({ token, tokenSecret: uploadTokenSecret })
      : null
    const isSecureUpload = Boolean(tokenVerification?.valid)
    const checkoutEmail = isSecureUpload
      ? tokenVerification.payload.checkoutEmail
      : (fields.checkoutEmail || '').trim()
    const orderReference = isSecureUpload
      ? String(
          tokenVerification.payload.orderNumber ||
            tokenVerification.payload.orderId
        )
      : (fields.orderReference || '').trim()
    const notes = (fields.notes || '').trim()

    if (token && !isSecureUpload) {
      json(res, 400, {
        error:
          tokenVerification?.error ||
          'This secure upload link is invalid or has expired.',
      })
      return
    }

    if (
      !isSecureUpload &&
      process.env.HUMAN_RESTORE_ALLOW_FALLBACK_UPLOAD === 'false'
    ) {
      json(res, 403, {
        error:
          'Direct uploads are disabled. Please use the secure upload link from your payment confirmation email.',
      })
      return
    }

    if (!checkoutEmail) {
      json(res, 400, { error: 'Checkout email is required.' })
      return
    }

    let verifiedOrder = null

    if (isSecureUpload && tokenVerification?.payload?.orderId) {
      const existingCount = await countJobsByOrderId(
        String(tokenVerification.payload.orderId)
      )

      if (existingCount >= maxSubmissionsPerOrder) {
        json(res, 409, {
          error: `This order already has a photo submission. Each order includes ${maxSubmissionsPerOrder} photo restoration. If you need to replace your photo, please contact support.`,
        })
        return
      }
    }

    if (!isSecureUpload) {
      if (!orderReference) {
        json(res, 400, {
          error:
            'Payment transaction reference is required. You can find it in your payment confirmation email.',
        })
        return
      }

      const verification = await verifyPaddlePaidOrder({
        email: checkoutEmail,
        orderReference,
      })

      if (!verification.verified) {
        json(res, 403, {
          error:
            verification.reason ||
            'Order could not be verified. Please check your email and order number.',
        })
        return
      }

      verifiedOrder = verification.order

      const existingCount = await countJobsByOrderId(verifiedOrder.orderId)

      if (existingCount >= maxSubmissionsPerOrder) {
        json(res, 409, {
          error: `This order already has a photo submission. Each order includes ${maxSubmissionsPerOrder} photo restoration. If you need to replace your photo, please contact support.`,
        })
        return
      }

      const recentCount = await countRecentJobsByEmail(checkoutEmail, 24)

      if (recentCount >= maxFallbackSubmissionsPerDay) {
        json(res, 429, {
          error:
            'You have reached the upload limit for today. Please try again in 24 hours or contact support.',
        })
        return
      }
    }

    if (!/^\S+@\S+\.\S+$/.test(checkoutEmail)) {
      json(res, 400, { error: 'Please enter a valid checkout email.' })
      return
    }

    if (!file || file.fieldName !== 'photo') {
      json(res, 400, { error: 'Please attach the photo you want restored.' })
      return
    }

    if (!allowedImageTypes.has(file.contentType)) {
      json(res, 400, {
        error: 'Please upload a JPG, PNG, WebP, HEIC, or HEIF image.',
      })
      return
    }

    if (file.data.length > maxUploadSizeBytes) {
      json(res, 400, {
        error: 'Please keep the upload under 15 MB for this beta form.',
      })
      return
    }

    const policyError =
      validateContentPolicyAcceptance(fields) ||
      validateHumanRestoreSubmissionText({
        fileName: file.filename,
        notes,
      })

    if (policyError) {
      json(res, 400, { error: policyError })
      return
    }

    const buckets = getHumanRestoreBuckets()
    const safeSubmissionReference = submissionReference.replace(
      /[^A-Z0-9-]/g,
      ''
    )
    const storagePath = `${safeSubmissionReference}/${file.filename}`
    const orderPayload = isSecureUpload
      ? tokenVerification.payload
      : verifiedOrder || null

    await uploadObject({
      bucket: buckets.originals,
      contentType: file.contentType,
      data: file.data,
      path: storagePath,
    })

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30)

    const job = await insertJob({
      checkout_email: checkoutEmail,
      customer_name: orderPayload?.customerName || '',
      expires_at: expiresAt.toISOString(),
      notes,
      order_bound: isSecureUpload || Boolean(verifiedOrder),
      order_id: orderPayload?.orderId || null,
      order_number: orderPayload?.orderNumber || orderReference || null,
      original_file_name: file.filename,
      original_file_size: file.data.length,
      original_file_type: file.contentType,
      original_storage_bucket: buckets.originals,
      original_storage_path: storagePath,
      product_name: orderPayload?.productName || 'Human-assisted Restore',
      receipt_url: orderPayload?.receiptUrl || '',
      status: 'uploaded',
      submission_reference: submissionReference,
      test_mode: Boolean(orderPayload?.testMode),
      upload_source: isSecureUpload
        ? 'secure_link'
        : verifiedOrder
        ? 'verified_fallback'
        : 'fallback_form',
    })

    await insertEvent(job.id, 'photo_uploaded', {
      file_name: file.filename,
      file_size: file.data.length,
      order_bound: isSecureUpload || Boolean(verifiedOrder),
      upload_source: isSecureUpload
        ? 'secure_link'
        : verifiedOrder
        ? 'verified_fallback'
        : 'fallback_form',
    })

    let currentJob = job

    if (shouldAutoProcessAfterUpload()) {
      currentJob = await runRestoreJob({ job }).catch(async error => {
        await insertEvent(job.id, 'ai_restore_auto_start_failed', {
          error:
            error instanceof Error ? error.message : 'Auto restore failed.',
        })
        return job
      })
      await insertEvent(currentJob.id, 'ai_restore_auto_started', {
        provider: currentJob.ai_provider,
        status: currentJob.status,
      })
    }

    const adminUrl = new URL('/admin/review', siteUrl)
    adminUrl.searchParams.set('job', currentJob.id)

    let merchantEmailSent = true

    try {
      await sendMerchantNotificationEmail({
        adminUrl: adminUrl.toString(),
        resendApiKey,
        fromEmail,
        inboxEmail,
        supportEmail,
        jobId: currentJob.id,
        submissionReference,
        uploadSource: isSecureUpload ? 'secure_link' : 'fallback_form',
        checkoutEmail,
        orderReference,
        notes,
        photo: file,
      })
    } catch (error) {
      merchantEmailSent = false
      await insertEvent(currentJob.id, 'merchant_notification_failed', {
        error:
          error instanceof Error
            ? error.message
            : 'Merchant notification failed.',
      })
    }

    let confirmationEmailSent = true

    try {
      await sendCustomerConfirmationEmail({
        resendApiKey,
        fromEmail,
        supportEmail,
        submissionReference,
        checkoutEmail,
        orderReference,
      })
    } catch {
      confirmationEmailSent = false
    }

    json(res, 200, {
      ok: true,
      orderBound: isSecureUpload || Boolean(verifiedOrder),
      submissionReference,
      confirmationEmailSent,
      merchantEmailSent,
      supportEmail,
    })
  } catch {
    json(res, 500, {
      error:
        'We could not receive your photo just now. Please retry in a moment or use your order email as fallback.',
    })
  }
}

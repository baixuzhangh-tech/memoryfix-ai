export const config = {
  api: {
    bodyParser: false,
  },
}

import {
  createOrderUploadToken,
  createSecureUploadUrl,
  escapeHtml,
  json,
  readRawBody,
  sendEmail,
  verifyWebhookSignature,
} from './_lib/human-restore.js'
import { runRestoreJob } from './_lib/ai-restore.js'
import {
  getJob,
  getOrder,
  getOrderByCheckoutRef,
  getOrderByProviderOrderId,
  insertEvent,
  insertJob,
  updateOrder,
} from './_lib/supabase.js'

const defaultSiteUrl = 'https://artgen.site'

function normalizeCustomData(payload, attributes) {
  return (
    payload?.meta?.custom_data ||
    attributes?.meta?.custom_data ||
    attributes?.custom_data ||
    null
  )
}

function getOrderDetails(payload) {
  const attributes = payload?.data?.attributes
  const firstOrderItem = attributes?.first_order_item

  if (!payload?.data?.id || !attributes || !firstOrderItem) {
    return null
  }

  return {
    checkoutEmail: attributes.user_email || '',
    createdAt: attributes.created_at || new Date().toISOString(),
    customData: normalizeCustomData(payload, attributes),
    customerName: attributes.user_name || '',
    identifier: attributes.identifier || '',
    orderId: payload.data.id,
    orderNumber: attributes.order_number,
    productName: firstOrderItem.product_name || 'Human-assisted Restore',
    receiptUrl: attributes.urls?.receipt || '',
    status: attributes.status || '',
    testMode: Boolean(attributes.test_mode),
    variantId: firstOrderItem.variant_id,
  }
}

function shouldHandleOrder({ order, configuredVariantId }) {
  if (!order || order.status !== 'paid' || !order.checkoutEmail) {
    return false
  }

  if (!configuredVariantId) {
    return true
  }

  return String(order.variantId) === String(configuredVariantId)
}

function mapJobStatusToOrderStatus(status) {
  const supportedStatuses = new Set([
    'uploaded',
    'processing',
    'ai_queued',
    'ai_failed',
    'needs_review',
    'manual_review',
    'delivered',
    'failed',
  ])

  return supportedStatuses.has(status) ? status : 'paid'
}

function shouldAutoProcessAfterPayment() {
  return process.env.HUMAN_RESTORE_AUTO_PROCESS_AFTER_UPLOAD !== 'false'
}

function getPaidOrderExpiresAt() {
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30)
  return expiresAt.toISOString()
}

async function findLocalOrder(order) {
  const customData = order?.customData || {}
  const localOrderId =
    customData.human_restore_order_id ||
    customData.local_order_id ||
    customData.order_id ||
    ''
  const checkoutRef = customData.checkout_ref || ''

  if (localOrderId) {
    const localOrder = await getOrder(String(localOrderId))

    if (localOrder) {
      return localOrder
    }
  }

  if (checkoutRef) {
    const localOrder = await getOrderByCheckoutRef(String(checkoutRef))

    if (localOrder) {
      return localOrder
    }
  }

  return getOrderByProviderOrderId(String(order.orderId))
}

function buildLegacySecureUploadEmail({ uploadUrl, order, supportEmail }) {
  const customerName = order.customerName
    ? escapeHtml(order.customerName)
    : 'there'
  const orderNumber = order.orderNumber
    ? String(order.orderNumber)
    : 'your paid order'
  const productName = escapeHtml(order.productName)
  const safeUploadUrl = escapeHtml(uploadUrl)
  const safeSupportEmail = escapeHtml(supportEmail)

  const html = `
    <h1>Your secure photo upload link</h1>
    <p>Hi ${customerName},</p>
    <p>Thanks for purchasing ${productName}. Use the secure link below to upload the photo for your paid order ${escapeHtml(
    orderNumber
  )}.</p>
    <p><a href="${safeUploadUrl}">${safeUploadUrl}</a></p>
    <p>This link is tied to your paid order and is intended only for your restoration upload.</p>
    <p>If the link does not open or you need help, contact ${safeSupportEmail}.</p>
  `

  const text = [
    'Your secure MemoryFix AI upload link is ready.',
    `Order: ${orderNumber}`,
    `Product: ${order.productName}`,
    `Upload link: ${uploadUrl}`,
    `If you need help, contact ${supportEmail}.`,
  ].join('\n')

  return { html, text }
}

function buildPaymentConfirmedEmail({
  order,
  localOrder,
  submissionReference,
  supportEmail,
}) {
  const orderNumber = order.orderNumber || order.orderId
  const customerName = order.customerName
    ? escapeHtml(order.customerName)
    : 'there'
  const safeSupportEmail = escapeHtml(supportEmail)
  const html = `
    <h1>Your MemoryFix AI order is confirmed</h1>
    <p>Hi ${customerName},</p>
    <p>We received your payment and the photo you uploaded before checkout. Your restoration is now in our AI draft plus human review workflow.</p>
    <p><strong>Order:</strong> ${escapeHtml(orderNumber)}</p>
    <p><strong>Submission reference:</strong> ${escapeHtml(
      submissionReference
    )}</p>
    <p><strong>What happens next:</strong></p>
    <ul>
      <li>We prepare an AI restoration draft from your source photo.</li>
      <li>A human reviews the before and after result before delivery.</li>
      <li>During beta, approved restores are usually delivered within 48 hours.</li>
    </ul>
    <p>Your result will be sent to this checkout email. If you need help, contact ${safeSupportEmail}.</p>
  `
  const text = [
    'Your MemoryFix AI order is confirmed.',
    `Order: ${orderNumber}`,
    `Submission reference: ${submissionReference}`,
    '',
    'We received your payment and the photo you uploaded before checkout.',
    'Next, we prepare an AI restoration draft, review it, and deliver the approved result by email.',
    `Support: ${supportEmail}`,
  ].join('\n')

  return { html, text }
}

function buildMerchantPaidOrderEmail({
  adminUrl,
  currentJob,
  localOrder,
  order,
  supportEmail,
}) {
  const html = `
    <h1>Paid Human-assisted Restore order is ready for review</h1>
    <p><strong>Submission reference:</strong> ${escapeHtml(
      localOrder.submission_reference
    )}</p>
    <p><strong>Checkout email:</strong> ${escapeHtml(order.checkoutEmail)}</p>
    <p><strong>Lemon order:</strong> ${escapeHtml(
      order.orderNumber || order.orderId
    )}</p>
    <p><strong>Job ID:</strong> ${escapeHtml(currentJob.id)}</p>
    <p><strong>Status:</strong> ${escapeHtml(currentJob.status)}</p>
    <p><strong>Repair notes:</strong></p>
    <p>${escapeHtml(localOrder.notes || 'No extra notes provided.').replace(
      /\n/g,
      '<br />'
    )}</p>
    <p><strong>Admin review:</strong> <a href="${escapeHtml(
      adminUrl
    )}">${escapeHtml(adminUrl)}</a></p>
    <p><strong>Support contact:</strong> ${escapeHtml(supportEmail)}</p>
  `
  const text = [
    'Paid Human-assisted Restore order is ready for review',
    `Submission reference: ${localOrder.submission_reference}`,
    `Checkout email: ${order.checkoutEmail}`,
    `Lemon order: ${order.orderNumber || order.orderId}`,
    `Job ID: ${currentJob.id}`,
    `Status: ${currentJob.status}`,
    `Repair notes: ${localOrder.notes || 'No extra notes provided.'}`,
    `Admin review: ${adminUrl}`,
    `Support contact: ${supportEmail}`,
  ].join('\n')

  return { html, text }
}

async function sendPaidOrderEmails({
  currentJob,
  fromEmail,
  inboxEmail,
  localOrder,
  order,
  resendApiKey,
  siteUrl,
  supportEmail,
}) {
  if (!resendApiKey || !supportEmail) {
    return { customerEmailSent: false, merchantEmailSent: false }
  }

  const adminUrl = new URL('/admin/review', siteUrl)
  adminUrl.searchParams.set('job', currentJob.id)

  let merchantEmailSent = false
  let customerEmailSent = false

  if (inboxEmail) {
    const merchantEmail = buildMerchantPaidOrderEmail({
      adminUrl: adminUrl.toString(),
      currentJob,
      localOrder,
      order,
      supportEmail,
    })

    try {
      await sendEmail({
        resendApiKey,
        payload: {
          from: fromEmail,
          to: [inboxEmail],
          reply_to: order.checkoutEmail,
          subject: `Paid MemoryFix AI order - ${localOrder.submission_reference}`,
          html: merchantEmail.html,
          text: merchantEmail.text,
        },
      })
      merchantEmailSent = true
    } catch (error) {
      await insertEvent(currentJob.id, 'merchant_notification_failed', {
        error:
          error instanceof Error
            ? error.message
            : 'Merchant notification failed.',
      })
    }
  }

  const customerEmail = buildPaymentConfirmedEmail({
    localOrder,
    order,
    submissionReference: localOrder.submission_reference,
    supportEmail,
  })

  try {
    await sendEmail({
      resendApiKey,
      payload: {
        from: fromEmail,
        to: [order.checkoutEmail],
        reply_to: supportEmail,
        subject: `Your MemoryFix AI order is confirmed - ${localOrder.submission_reference}`,
        html: customerEmail.html,
        text: customerEmail.text,
      },
    })
    customerEmailSent = true
  } catch (error) {
    await insertEvent(currentJob.id, 'customer_payment_email_failed', {
      error:
        error instanceof Error
          ? error.message
          : 'Customer payment confirmation email failed.',
    })
  }

  return { customerEmailSent, merchantEmailSent }
}

async function handlePreuploadedPaidOrder({
  fromEmail,
  inboxEmail,
  localOrder,
  order,
  resendApiKey,
  siteUrl,
  supportEmail,
}) {
  const paidExpiresAt = getPaidOrderExpiresAt()
  const paymentPatch = {
    checkout_email: order.checkoutEmail,
    customer_name: order.customerName || '',
    expires_at: paidExpiresAt,
    order_number: order.orderNumber ? String(order.orderNumber) : null,
    payment_confirmed_at: new Date().toISOString(),
    payment_provider_order_id: String(order.orderId),
    payment_provider_order_identifier: order.identifier || null,
    product_name: order.productName,
    receipt_url: order.receiptUrl || '',
    status: 'paid',
    test_mode: Boolean(order.testMode),
    variant_id: order.variantId
      ? String(order.variantId)
      : localOrder.variant_id,
  }

  await updateOrder(localOrder.id, paymentPatch)

  if (localOrder.job_id) {
    const existingJob = await getJob(localOrder.job_id)

    if (existingJob) {
      await updateOrder(localOrder.id, {
        ...paymentPatch,
        status: mapJobStatusToOrderStatus(existingJob.status),
      })

      return {
        customerEmailSent: false,
        job: existingJob,
        merchantEmailSent: false,
      }
    }
  }

  const job = await insertJob({
    checkout_email: order.checkoutEmail,
    customer_name: order.customerName || '',
    expires_at: paidExpiresAt,
    human_restore_order_id: localOrder.id,
    notes: localOrder.notes || '',
    order_bound: true,
    order_id: String(order.orderId),
    order_number: order.orderNumber ? String(order.orderNumber) : null,
    original_file_name: localOrder.original_file_name,
    original_file_size: localOrder.original_file_size,
    original_file_type: localOrder.original_file_type,
    original_storage_bucket: localOrder.original_storage_bucket,
    original_storage_path: localOrder.original_storage_path,
    product_name: order.productName,
    receipt_url: order.receiptUrl || '',
    status: 'uploaded',
    submission_reference: localOrder.submission_reference,
    test_mode: Boolean(order.testMode),
    upload_source: 'pre_checkout_upload',
  })

  await insertEvent(job.id, 'payment_confirmed_preuploaded_photo', {
    checkout_ref: localOrder.checkout_ref,
    local_order_id: localOrder.id,
    order_number: order.orderNumber || null,
    payment_provider_order_id: String(order.orderId),
  })

  let currentJob = job

  if (shouldAutoProcessAfterPayment()) {
    currentJob = await runRestoreJob({ job }).catch(async error => {
      await insertEvent(job.id, 'ai_restore_auto_start_failed', {
        error: error instanceof Error ? error.message : 'Auto restore failed.',
      })
      return job
    })

    await insertEvent(currentJob.id, 'ai_restore_auto_started_after_payment', {
      provider: currentJob.ai_provider,
      status: currentJob.status,
    })
  }

  await updateOrder(localOrder.id, {
    ...paymentPatch,
    job_id: currentJob.id,
    status: mapJobStatusToOrderStatus(currentJob.status),
  })

  const emailStatus = await sendPaidOrderEmails({
    currentJob,
    fromEmail,
    inboxEmail,
    localOrder,
    order,
    resendApiKey,
    siteUrl,
    supportEmail,
  })

  return {
    ...emailStatus,
    job: currentJob,
  }
}

async function sendLegacySecureUploadLink({
  fromEmail,
  order,
  resendApiKey,
  siteUrl,
  supportEmail,
  uploadTokenSecret,
}) {
  if (!uploadTokenSecret || !resendApiKey || !supportEmail) {
    throw new Error('Legacy secure upload email is not configured.')
  }

  const token = createOrderUploadToken({
    tokenSecret: uploadTokenSecret,
    order,
  })
  const uploadUrl = createSecureUploadUrl({ siteUrl, token })
  const emailContent = buildLegacySecureUploadEmail({
    uploadUrl,
    order,
    supportEmail,
  })

  await sendEmail({
    resendApiKey,
    payload: {
      from: fromEmail,
      to: [order.checkoutEmail],
      reply_to: supportEmail,
      subject: `Secure upload link for order ${
        order.orderNumber || order.orderId
      }`,
      html: emailContent.html,
      text: emailContent.text,
    },
  })

  return uploadUrl
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed.' })
    return
  }

  const webhookSecret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET
  const uploadTokenSecret = process.env.HUMAN_RESTORE_UPLOAD_TOKEN_SECRET
  const resendApiKey = process.env.RESEND_API_KEY
  const fromEmail =
    process.env.HUMAN_RESTORE_FROM_EMAIL ||
    'MemoryFix AI <onboarding@resend.dev>'
  const inboxEmail = process.env.HUMAN_RESTORE_INBOX
  const supportEmail =
    process.env.HUMAN_RESTORE_SUPPORT_EMAIL || process.env.HUMAN_RESTORE_INBOX
  const siteUrl = process.env.SITE_URL || defaultSiteUrl
  const configuredVariantId = process.env.LEMON_SQUEEZY_HUMAN_RESTORE_VARIANT_ID

  if (!webhookSecret) {
    json(res, 503, { error: 'Webhook integration is not configured.' })
    return
  }

  try {
    const rawBody = await readRawBody(req)
    const signature = req.headers['x-signature']

    if (
      !verifyWebhookSignature({
        rawBody,
        secret: webhookSecret,
        signature,
      })
    ) {
      json(res, 401, { error: 'Invalid webhook signature.' })
      return
    }

    const payload = JSON.parse(rawBody.toString('utf8'))
    const eventName = payload?.meta?.event_name || req.headers['x-event-name']

    if (eventName !== 'order_created') {
      json(res, 200, { ok: true, ignored: true, reason: 'Unhandled event.' })
      return
    }

    const order = getOrderDetails(payload)

    if (!shouldHandleOrder({ order, configuredVariantId })) {
      json(res, 200, { ok: true, ignored: true, reason: 'Order not targeted.' })
      return
    }

    const localOrder = await findLocalOrder(order)

    if (localOrder) {
      const result = await handlePreuploadedPaidOrder({
        fromEmail,
        inboxEmail,
        localOrder,
        order,
        resendApiKey,
        siteUrl,
        supportEmail,
      })

      json(res, 200, {
        customerEmailSent: result.customerEmailSent,
        jobId: result.job?.id,
        localOrderId: localOrder.id,
        merchantEmailSent: result.merchantEmailSent,
        ok: true,
        preuploadedOrderProcessed: true,
      })
      return
    }

    await sendLegacySecureUploadLink({
      fromEmail,
      order,
      resendApiKey,
      siteUrl,
      supportEmail,
      uploadTokenSecret,
    })

    json(res, 200, { ok: true, uploadLinkSent: true })
  } catch (error) {
    json(res, 500, {
      error:
        error instanceof Error ? error.message : 'Webhook processing failed.',
    })
  }
}

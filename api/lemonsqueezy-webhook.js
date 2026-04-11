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

const defaultSiteUrl = 'https://artgen.site'

function getOrderDetails(payload) {
  const attributes = payload?.data?.attributes
  const firstOrderItem = attributes?.first_order_item

  if (!attributes || !firstOrderItem) {
    return null
  }

  return {
    checkoutEmail: attributes.user_email || '',
    createdAt: attributes.created_at || new Date().toISOString(),
    customerName: attributes.user_name || '',
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

function buildSecureUploadEmail({ uploadUrl, order, supportEmail }) {
  const customerName = order.customerName ? escapeHtml(order.customerName) : 'there'
  const orderNumber = order.orderNumber ? String(order.orderNumber) : 'your paid order'
  const productName = escapeHtml(order.productName)
  const safeUploadUrl = escapeHtml(uploadUrl)
  const safeSupportEmail = escapeHtml(supportEmail)

  const html = `
    <h1>Your secure photo upload link</h1>
    <p>Hi ${customerName},</p>
    <p>Thanks for purchasing ${productName}. Use the secure link below to upload the photo for your paid order ${escapeHtml(orderNumber)}.</p>
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
  const supportEmail =
    process.env.HUMAN_RESTORE_SUPPORT_EMAIL || process.env.HUMAN_RESTORE_INBOX
  const siteUrl = process.env.SITE_URL || defaultSiteUrl
  const configuredVariantId = process.env.LEMON_SQUEEZY_HUMAN_RESTORE_VARIANT_ID

  if (!webhookSecret || !uploadTokenSecret || !resendApiKey || !supportEmail) {
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

    const token = createOrderUploadToken({
      tokenSecret: uploadTokenSecret,
      order,
    })
    const uploadUrl = createSecureUploadUrl({ siteUrl, token })
    const emailContent = buildSecureUploadEmail({
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
        subject: `Secure upload link for order ${order.orderNumber || order.orderId}`,
        html: emailContent.html,
        text: emailContent.text,
      },
    })

    json(res, 200, { ok: true, uploadLinkSent: true })
  } catch {
    json(res, 500, { error: 'Webhook processing failed.' })
  }
}

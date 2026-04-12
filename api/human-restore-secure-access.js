import {
  createOrderUploadToken,
  createSecureUploadUrl,
  json,
  maskEmail,
} from './_lib/human-restore.js'
import {
  getOrder,
  getOrderByCheckoutRef,
  getOrderByProviderOrderId,
  getRecentPaidOrderByEmail,
} from './_lib/supabase.js'

const defaultSiteUrl = 'https://artgen.site'

function normalizeEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function isPaidStatus(status) {
  const paidStatuses = new Set([
    'paid',
    'uploaded',
    'processing',
    'ai_queued',
    'ai_failed',
    'needs_review',
    'manual_review',
    'delivered',
  ])

  return paidStatuses.has(status)
}

function localOrderToOrderDetails(localOrder) {
  if (!localOrder) {
    return null
  }

  return {
    checkoutEmail: localOrder.checkout_email || '',
    createdAt: localOrder.created_at || new Date().toISOString(),
    customerName: localOrder.customer_name || '',
    orderId: localOrder.payment_provider_order_id || localOrder.id,
    orderNumber: localOrder.order_number || localOrder.payment_provider_order_id || localOrder.id,
    productName: localOrder.product_name || 'Human-assisted Restore',
    receiptUrl: localOrder.receipt_url || '',
    status: isPaidStatus(localOrder.status) ? 'paid' : localOrder.status,
    testMode: Boolean(localOrder.test_mode),
    variantId: localOrder.variant_id || '',
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    json(res, 405, { error: 'Method not allowed.' })
    return
  }

  const orderId = Array.isArray(req.query.orderId)
    ? req.query.orderId[0]
    : req.query.orderId
  const orderIdentifier = Array.isArray(req.query.orderIdentifier)
    ? req.query.orderIdentifier[0]
    : req.query.orderIdentifier
  const checkoutRef = Array.isArray(req.query.checkoutRef)
    ? req.query.checkoutRef[0]
    : req.query.checkoutRef
  const checkoutEmail = Array.isArray(req.query.checkoutEmail)
    ? req.query.checkoutEmail[0]
    : req.query.checkoutEmail
  const mode = Array.isArray(req.query.mode)
    ? req.query.mode[0]
    : req.query.mode
  const uploadTokenSecret = process.env.HUMAN_RESTORE_UPLOAD_TOKEN_SECRET
  const siteUrl = process.env.SITE_URL || defaultSiteUrl
  const configuredPriceId = process.env.PADDLE_HUMAN_RESTORE_PRICE_ID

  if (!orderId && !orderIdentifier && !checkoutRef && mode !== 'recent') {
    json(res, 400, {
      error: 'Order reference is required for secure upload access.',
    })
    return
  }

  if (!uploadTokenSecret) {
    json(res, 503, {
      error: 'Direct secure upload access is not configured yet.',
    })
    return
  }

  try {
    let localOrder = null

    if (orderId) {
      localOrder = await getOrder(orderId)

      if (!localOrder) {
        localOrder = await getOrderByProviderOrderId(orderId)
      }
    }

    if (!localOrder && checkoutRef) {
      localOrder = await getOrderByCheckoutRef(checkoutRef)
    }

    if (!localOrder && orderIdentifier) {
      localOrder = await getOrderByProviderOrderId(orderIdentifier)
    }

    if (!localOrder && mode === 'recent' && checkoutEmail) {
      localOrder = await getRecentPaidOrderByEmail(
        normalizeEmail(checkoutEmail)
      )
    }

    const order = localOrderToOrderDetails(localOrder)

    if (!order || !order.checkoutEmail || order.status !== 'paid') {
      json(res, 404, {
        error:
          'This paid order could not be verified for direct secure upload.',
      })
      return
    }

    if (
      checkoutEmail &&
      normalizeEmail(order.checkoutEmail) !== normalizeEmail(checkoutEmail)
    ) {
      json(res, 403, {
        error: 'Checkout email does not match this paid order.',
      })
      return
    }

    if (
      configuredPriceId &&
      order.variantId &&
      String(order.variantId) !== String(configuredPriceId)
    ) {
      json(res, 403, {
        error: 'This order is not eligible for Human-assisted Restore upload.',
      })
      return
    }

    const token = createOrderUploadToken({
      tokenSecret: uploadTokenSecret,
      order,
    })
    const uploadUrl = createSecureUploadUrl({ siteUrl, token })

    json(res, 200, {
      ok: true,
      uploadUrl,
      order: {
        checkoutEmailMasked: maskEmail(order.checkoutEmail),
        orderId: order.orderId,
        orderNumber: order.orderNumber,
      },
    })
  } catch {
    json(res, 500, {
      error: 'Direct secure upload access could not be prepared right now.',
    })
  }
}

import {
  createOrderUploadToken,
  createSecureUploadUrl,
  json,
  maskEmail,
} from './_lib/human-restore.js'

const defaultSiteUrl = 'https://artgen.site'

function normalizeEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function getOrderDetails(payload) {
  const attributes = payload?.data?.attributes
  const firstOrderItem = attributes?.first_order_item

  if (!payload?.data?.id || !attributes) {
    return null
  }

  return {
    checkoutEmail: attributes.user_email || '',
    createdAt: attributes.created_at || new Date().toISOString(),
    customerName: attributes.user_name || '',
    orderId: payload.data.id,
    orderNumber: attributes.order_number,
    productName: firstOrderItem?.product_name || 'Human-assisted Restore',
    receiptUrl: attributes.urls?.receipt || '',
    status: attributes.status || '',
    testMode: Boolean(attributes.test_mode),
    variantId: firstOrderItem?.variant_id,
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
  const checkoutEmail = Array.isArray(req.query.checkoutEmail)
    ? req.query.checkoutEmail[0]
    : req.query.checkoutEmail
  const apiKey = process.env.LEMON_SQUEEZY_API_KEY
  const uploadTokenSecret = process.env.HUMAN_RESTORE_UPLOAD_TOKEN_SECRET
  const siteUrl = process.env.SITE_URL || defaultSiteUrl
  const configuredVariantId = process.env.LEMON_SQUEEZY_HUMAN_RESTORE_VARIANT_ID

  if (!orderId || !checkoutEmail) {
    json(res, 400, {
      error: 'Order ID and checkout email are required for secure upload access.',
    })
    return
  }

  if (!apiKey || !uploadTokenSecret) {
    json(res, 503, {
      error: 'Direct secure upload access is not configured yet.',
    })
    return
  }

  try {
    const response = await fetch(
      `https://api.lemonsqueezy.com/v1/orders/${encodeURIComponent(orderId)}`,
      {
        headers: {
          Accept: 'application/vnd.api+json',
          'Content-Type': 'application/vnd.api+json',
          Authorization: `Bearer ${apiKey}`,
        },
      }
    )

    if (!response.ok) {
      json(res, 404, {
        error: 'We could not confirm this order for direct secure upload.',
      })
      return
    }

    const payload = await response.json().catch(() => null)
    const order = getOrderDetails(payload)

    if (!order || !order.checkoutEmail || order.status !== 'paid') {
      json(res, 404, {
        error: 'This paid order could not be verified for direct secure upload.',
      })
      return
    }

    if (normalizeEmail(order.checkoutEmail) !== normalizeEmail(checkoutEmail)) {
      json(res, 403, {
        error: 'Checkout email does not match this paid order.',
      })
      return
    }

    if (
      configuredVariantId &&
      order.variantId &&
      String(order.variantId) !== String(configuredVariantId)
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

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

function normalizeIdentifier(value) {
  return String(value || '').trim().toLowerCase()
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
    identifier: attributes.identifier || '',
    customData: attributes.meta?.custom_data || null,
  }
}

function getListOrderDetails(payload) {
  const orderItems = Array.isArray(payload?.data) ? payload.data : []

  return orderItems
    .map(item =>
      getOrderDetails({
        data: item,
      })
    )
    .filter(Boolean)
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
  const apiKey = process.env.LEMON_SQUEEZY_API_KEY
  const storeId = process.env.LEMON_SQUEEZY_STORE_ID
  const uploadTokenSecret = process.env.HUMAN_RESTORE_UPLOAD_TOKEN_SECRET
  const siteUrl = process.env.SITE_URL || defaultSiteUrl
  const configuredVariantId = process.env.LEMON_SQUEEZY_HUMAN_RESTORE_VARIANT_ID

  if (!orderId && !orderIdentifier && !checkoutRef && mode !== 'recent') {
    json(res, 400, {
      error:
        'Order reference is required for secure upload access.',
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
    const requestHeaders = {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      Authorization: `Bearer ${apiKey}`,
    }

    let order = null

    if (orderId) {
      const response = await fetch(
        `https://api.lemonsqueezy.com/v1/orders/${encodeURIComponent(orderId)}`,
        {
          headers: requestHeaders,
        }
      )

      if (!response.ok) {
        json(res, 404, {
          error: 'We could not confirm this order for direct secure upload.',
        })
        return
      }

      const payload = await response.json().catch(() => null)
      order = getOrderDetails(payload)
    } else {
      const requestUrl = new URL('https://api.lemonsqueezy.com/v1/orders')

      if (checkoutEmail) {
        requestUrl.searchParams.set('filter[user_email]', checkoutEmail)
      }

      if (storeId) {
        requestUrl.searchParams.set('filter[store_id]', storeId)
      }

      requestUrl.searchParams.set('sort', '-createdAt')
      requestUrl.searchParams.set('page[size]', '10')

      const response = await fetch(requestUrl.toString(), {
        headers: requestHeaders,
      })

      if (!response.ok) {
        json(res, 404, {
          error: 'We could not confirm this order for direct secure upload.',
        })
        return
      }

      const payload = await response.json().catch(() => null)
      const candidates = getListOrderDetails(payload)

      let matchedOrder = null

      if (checkoutRef) {
        matchedOrder =
          candidates.find(
            candidate => candidate?.customData?.checkout_ref === checkoutRef
          ) || null
      } else if (orderIdentifier) {
        matchedOrder =
          candidates.find(
            candidate =>
              normalizeIdentifier(candidate?.identifier) ===
              normalizeIdentifier(orderIdentifier)
          ) || null
      } else if (mode === 'recent') {
        matchedOrder =
          candidates.find(candidate => candidate?.status === 'paid') || null
      }

      order = matchedOrder
    }

    if (!order || !order.checkoutEmail || order.status !== 'paid') {
      json(res, 404, {
        error: 'This paid order could not be verified for direct secure upload.',
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

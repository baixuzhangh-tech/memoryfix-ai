/**
 * PayPal REST API v2 utility library.
 *
 * Handles OAuth2 authentication, order creation, order capture, and
 * webhook signature verification. Replaces the former Paddle integration.
 *
 * Environment variables:
 *   PAYPAL_CLIENT_ID        – REST API app client ID
 *   PAYPAL_CLIENT_SECRET    – REST API app secret
 *   PAYPAL_ENVIRONMENT      – "sandbox" | "production" (default "sandbox")
 *   PAYPAL_WEBHOOK_ID       – Webhook ID for signature verification
 */

const tokenCache = { token: '', expiresAt: 0 }

function getPayPalBaseUrl() {
  const env = process.env.PAYPAL_ENVIRONMENT || 'sandbox'
  return env === 'production'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com'
}

/**
 * Obtain a short-lived OAuth2 Bearer token from PayPal.
 * Tokens are cached in-memory until 60 s before expiry.
 */
export async function getPayPalAccessToken() {
  const now = Date.now()

  if (tokenCache.token && tokenCache.expiresAt > now) {
    return tokenCache.token
  }

  const clientId = process.env.PAYPAL_CLIENT_ID
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('PayPal API credentials are not configured.')
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString(
    'base64'
  )

  const response = await fetch(`${getPayPalBaseUrl()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(
      `PayPal OAuth2 token request failed (${response.status}): ${errorText}`
    )
  }

  const data = await response.json()
  tokenCache.token = data.access_token
  // Cache until 60 seconds before actual expiry
  tokenCache.expiresAt = now + (data.expires_in - 60) * 1000

  return data.access_token
}

/**
 * Product tier → PayPal order amount mapping.
 *
 * Unlike Paddle which uses pre-created Price IDs, PayPal receives the
 * amount and description inline when creating an order. This map is the
 * single source of truth for pricing.
 */
const TIER_PRICING = {
  ai_hd: { amount: '6.90', description: 'MemoryFix AI HD Restore' },
  human: { amount: '29.90', description: 'MemoryFix Human-assisted Restore' },
  local_repair_pack: {
    amount: '9.90',
    description: 'MemoryFix Local Repair Pack (10 credits)',
  },
}

export function getTierPricing(tier) {
  return TIER_PRICING[tier] || null
}

/**
 * Create a PayPal order via REST API v2.
 *
 * @param {object} options
 * @param {string} options.tier          – "ai_hd" | "human" | "local_repair_pack"
 * @param {string} [options.orderId]     – Local Supabase order ID
 * @param {string} [options.checkoutRef] – Checkout reference for linking
 * @param {string} [options.returnUrl]   – URL PayPal redirects to after approval
 * @param {string} [options.cancelUrl]   – URL PayPal redirects to on cancel
 * @returns {{ paypalOrderId: string, approvalUrl: string }}
 */
export async function createPayPalOrder({
  tier,
  orderId,
  checkoutRef,
  returnUrl,
  cancelUrl,
}) {
  const pricing = getTierPricing(tier)

  if (!pricing) {
    throw new Error(`Unknown product tier: ${tier}`)
  }

  const accessToken = await getPayPalAccessToken()

  const orderPayload = {
    intent: 'CAPTURE',
    purchase_units: [
      {
        amount: {
          currency_code: 'USD',
          value: pricing.amount,
        },
        description: pricing.description,
        custom_id: orderId || '',
        reference_id: checkoutRef || undefined,
      },
    ],
    payment_source: {
      paypal: {
        experience_context: {
          brand_name: 'MemoryFix AI',
          landing_page: 'LOGIN',
          user_action: 'PAY_NOW',
          return_url: returnUrl || undefined,
          cancel_url: cancelUrl || undefined,
        },
      },
    },
  }

  const response = await fetch(`${getPayPalBaseUrl()}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(orderPayload),
  })

  const data = await response.json().catch(() => null)

  if (!response.ok || !data?.id) {
    console.error(
      '[paypal] Create order failed:',
      response.status,
      JSON.stringify(data)
    )
    throw new Error(
      data?.message ||
        data?.details?.[0]?.description ||
        'Could not create PayPal order.'
    )
  }

  const approvalLink = (data.links || []).find(l => l.rel === 'payer-action')
  const approvalUrl = approvalLink?.href || ''

  return {
    paypalOrderId: data.id,
    approvalUrl,
    status: data.status,
  }
}

/**
 * Capture an approved PayPal order.
 *
 * @param {string} paypalOrderId – The PayPal order ID returned from createPayPalOrder
 * @returns {object} Capture result with transaction details
 */
export async function capturePayPalOrder(paypalOrderId) {
  if (!paypalOrderId) {
    throw new Error('PayPal order ID is required for capture.')
  }

  const accessToken = await getPayPalAccessToken()

  const response = await fetch(
    `${getPayPalBaseUrl()}/v2/checkout/orders/${encodeURIComponent(
      paypalOrderId
    )}/capture`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  )

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    console.error(
      '[paypal] Capture failed:',
      response.status,
      JSON.stringify(data)
    )
    throw new Error(
      data?.message ||
        data?.details?.[0]?.description ||
        'Could not capture PayPal payment.'
    )
  }

  // Extract key details from capture response
  const captureUnit = data.purchase_units?.[0]
  const capture = captureUnit?.payments?.captures?.[0]
  const payer = data.payer || {}

  return {
    paypalOrderId: data.id,
    status: data.status,
    captureId: capture?.id || '',
    captureStatus: capture?.status || '',
    amount: capture?.amount?.value || '',
    currency: capture?.amount?.currency_code || 'USD',
    payerEmail: payer.email_address || '',
    payerName: [payer.name?.given_name, payer.name?.surname]
      .filter(Boolean)
      .join(' '),
    customId: captureUnit?.custom_id || '',
    referenceId: captureUnit?.reference_id || '',
    rawData: data,
  }
}

/**
 * Retrieve a PayPal order to inspect its status without capturing.
 */
export async function getPayPalOrder(paypalOrderId) {
  const accessToken = await getPayPalAccessToken()

  const response = await fetch(
    `${getPayPalBaseUrl()}/v2/checkout/orders/${encodeURIComponent(
      paypalOrderId
    )}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  )

  if (!response.ok) {
    return null
  }

  return response.json().catch(() => null)
}

/**
 * Verify a PayPal webhook notification signature.
 *
 * PayPal webhook verification uses the Notification API which requires
 * the webhook ID, transmission details from headers, and the raw body.
 *
 * @param {object} options
 * @param {object} options.headers      – Request headers
 * @param {string} options.rawBody      – Raw request body as string
 * @param {string} options.webhookId    – PayPal webhook ID
 * @returns {boolean}
 */
export async function verifyPayPalWebhookSignature({
  headers,
  rawBody,
  webhookId,
}) {
  if (!webhookId) {
    return false
  }

  const accessToken = await getPayPalAccessToken()

  const verificationPayload = {
    auth_algo: headers['paypal-auth-algo'] || '',
    cert_url: headers['paypal-cert-url'] || '',
    transmission_id: headers['paypal-transmission-id'] || '',
    transmission_sig: headers['paypal-transmission-sig'] || '',
    transmission_time: headers['paypal-transmission-time'] || '',
    webhook_id: webhookId,
    webhook_event: JSON.parse(rawBody),
  }

  const response = await fetch(
    `${getPayPalBaseUrl()}/v1/notifications/verify-webhook-signature`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(verificationPayload),
    }
  )

  if (!response.ok) {
    console.error(
      '[paypal] Webhook verification request failed:',
      response.status
    )
    return false
  }

  const result = await response.json().catch(() => null)
  return result?.verification_status === 'SUCCESS'
}

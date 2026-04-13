/**
 * Server-side Paddle checkout URL creation.
 *
 * When the Paddle.js overlay cannot load (e.g. CDN blocked in certain
 * networks), the frontend falls back to this endpoint which creates a
 * Paddle transaction via the API and returns a hosted checkout URL.
 *
 * POST /api/paddle-create-checkout
 * Body JSON: { orderId, checkoutRef, priceId, successUrl }
 * Returns:   { checkoutUrl }
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed.' })
  }

  const apiKey = process.env.PADDLE_API_KEY
  const paddleEnv = process.env.PADDLE_ENVIRONMENT || 'sandbox'

  if (!apiKey) {
    return res.status(503).json({ error: 'Paddle API key is not configured.' })
  }

  const { checkoutRef, orderId, priceId, successUrl } = req.body || {}

  if (!priceId) {
    return res.status(400).json({ error: 'priceId is required.' })
  }

  if (!orderId) {
    return res.status(400).json({ error: 'orderId is required.' })
  }

  const baseUrl =
    paddleEnv === 'production'
      ? 'https://api.paddle.com'
      : 'https://sandbox-api.paddle.com'

  const transactionBody = {
    items: [{ price_id: priceId, quantity: 1 }],
    custom_data: {
      checkout_ref: checkoutRef || '',
      flow: 'human_restore_preupload',
      human_restore_order_id: orderId,
    },
  }

  if (successUrl) {
    transactionBody.checkout = { url: successUrl }
  }

  try {
    const response = await fetch(`${baseUrl}/transactions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(transactionBody),
    })

    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      console.error(
        '[paddle-create-checkout] Paddle API error:',
        response.status,
        JSON.stringify(payload)
      )
      const detail =
        payload?.error?.detail ||
        payload?.error?.message ||
        (typeof payload?.error === 'string' ? payload.error : null) ||
        'Could not create Paddle checkout session.'
      return res.status(502).json({
        error: detail,
        paddleStatus: response.status,
        paddleError: payload?.error || null,
      })
    }

    const checkoutUrl = payload?.data?.checkout?.url

    if (!checkoutUrl) {
      console.error(
        '[paddle-create-checkout] No checkout URL in response:',
        JSON.stringify(payload?.data)
      )
      return res.status(502).json({
        error: 'Paddle did not return a checkout URL.',
      })
    }

    return res.status(200).json({ checkoutUrl })
  } catch (error) {
    console.error('[paddle-create-checkout] Unexpected error:', error)
    return res.status(500).json({
      error: 'Internal error creating checkout session.',
    })
  }
}

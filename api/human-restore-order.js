import {
  json,
  maskEmail,
  verifyOrderUploadToken,
} from './_lib/human-restore.js'

export default function handler(req, res) {
  if (req.method !== 'GET') {
    json(res, 405, { error: 'Method not allowed.' })
    return
  }

  const token = req.query.token
  const tokenSecret = process.env.HUMAN_RESTORE_UPLOAD_TOKEN_SECRET

  if (!tokenSecret) {
    json(res, 503, { error: 'Secure upload is not configured yet.' })
    return
  }

  const verification = verifyOrderUploadToken({
    token: Array.isArray(token) ? token[0] : token,
    tokenSecret,
  })

  if (!verification.valid) {
    json(res, 400, { error: verification.error || 'Invalid upload token.' })
    return
  }

  const order = verification.payload

  json(res, 200, {
    ok: true,
    order: {
      checkoutEmailMasked: maskEmail(order.checkoutEmail),
      createdAt: order.createdAt,
      orderId: order.orderId,
      orderNumber: order.orderNumber,
      productName: order.productName,
      receiptUrl: order.receiptUrl,
      testMode: Boolean(order.testMode),
    },
  })
}

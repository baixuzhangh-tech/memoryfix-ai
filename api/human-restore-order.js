import {
  json,
  maskEmail,
  verifyOrderUploadToken,
} from './_lib/human-restore.js'
import { runRestoreJob } from './_lib/ai-restore.js'
import {
  getJob,
  getOrder,
  getOrderByCheckoutRef,
  updateOrderByJobId,
} from './_lib/supabase.js'

function isPaymentConfirmed(status) {
  return !['pending_payment', 'expired', 'failed', 'deleted'].includes(status)
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

function shouldResumeLinkedFalJob(job) {
  return Boolean(
    job &&
      job.status === 'processing' &&
      job.ai_provider === 'fal' &&
      job.ai_request_id
  )
}

async function syncOrderWithLinkedJob(order) {
  if (!order?.job_id) {
    return order
  }

  const linkedJob = await getJob(order.job_id)

  if (!linkedJob) {
    return order
  }

  let effectiveJob = linkedJob

  if (shouldResumeLinkedFalJob(linkedJob)) {
    effectiveJob = await runRestoreJob({ job: linkedJob }).catch(() => linkedJob)
  }

  const nextOrderStatus = mapJobStatusToOrderStatus(effectiveJob.status)

  if (nextOrderStatus === order.status) {
    return order
  }

  return (await updateOrderByJobId(effectiveJob.id, {
    status: nextOrderStatus,
  })) || order
}

function buildPublicOrder(order) {
  const checkoutEmailMasked = order.checkout_email
    ? maskEmail(order.checkout_email)
    : ''

  return {
    checkoutEmailMasked,
    checkoutRef: order.checkout_ref,
    createdAt: order.created_at,
    jobId: order.job_id || '',
    orderId: order.id,
    orderNumber: order.order_number || '',
    paid: isPaymentConfirmed(order.status),
    paymentConfirmedAt: order.payment_confirmed_at || '',
    photoReceived: Boolean(order.original_storage_path),
    productName: order.product_name || 'Human-assisted Restore',
    receiptUrl: order.receipt_url || '',
    status: order.status,
    submissionReference: order.submission_reference,
    testMode: Boolean(order.test_mode),
    updatedAt: order.updated_at,
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    json(res, 405, { error: 'Method not allowed.' })
    return
  }

  const token = req.query.token
  const orderId = Array.isArray(req.query.orderId)
    ? req.query.orderId[0]
    : req.query.orderId
  const checkoutRef = Array.isArray(req.query.checkoutRef)
    ? req.query.checkoutRef[0]
    : req.query.checkoutRef
  const tokenSecret = process.env.HUMAN_RESTORE_UPLOAD_TOKEN_SECRET

  if (token) {
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
    return
  }

  if (!orderId && !checkoutRef) {
    json(res, 400, { error: 'Order ID or checkout reference is required.' })
    return
  }

  try {
    let order = orderId ? await getOrder(orderId) : null

    if (!order && checkoutRef) {
      order = await getOrderByCheckoutRef(checkoutRef)
    }

    if (!order) {
      json(res, 404, { error: 'Human-assisted Restore order not found.' })
      return
    }

    if (checkoutRef && order.checkout_ref !== checkoutRef) {
      json(res, 403, { error: 'Checkout reference does not match this order.' })
      return
    }

    order = await syncOrderWithLinkedJob(order)

    json(res, 200, {
      ok: true,
      order: buildPublicOrder(order),
    })
  } catch (error) {
    json(res, 500, {
      error:
        error instanceof Error
          ? error.message
          : 'Could not load Human-assisted Restore order.',
    })
  }
}

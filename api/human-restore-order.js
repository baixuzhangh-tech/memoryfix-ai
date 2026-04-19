import {
  json,
  maskEmail,
  verifyOrderUploadToken,
} from './_lib/human-restore.js'
import { runRestoreJob } from './_lib/ai-restore.js'
import { autoDeliverAiHdJob } from './_lib/auto-deliver.js'
import { resolveTierFromRecord } from './_lib/product-tier.js'
import {
  createSignedUrl,
  downloadObject,
  getAiDraftStorage,
  getHumanRestoreBuckets,
  getDeliveryDownloadUrlSeconds,
  getJob,
  getLatestJobByHumanRestoreOrderId,
  getLatestJobByOrderId,
  getOrder,
  getOrderByCheckoutRef,
  insertEvent,
  updateOrder,
  updateJob,
  updateOrderByJobId,
  uploadObject,
} from './_lib/supabase.js'
import {
  previewWatermarkContentType,
  watermarkPreview,
} from './_lib/watermark.js'

function isPaymentConfirmed(order) {
  return Boolean(
    order?.payment_confirmed_at ||
      (order?.payment_provider_order_id &&
        !['pending_payment', 'expired', 'failed', 'deleted'].includes(
          order.status
        ))
  )
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

function getPreviewStorage(job) {
  const payload =
    job?.ai_provider_payload && typeof job.ai_provider_payload === 'object'
      ? job.ai_provider_payload
      : {}

  if (!payload.preview_storage_bucket || !payload.preview_storage_path) {
    return null
  }

  return {
    bucket: payload.preview_storage_bucket,
    path: payload.preview_storage_path,
  }
}

async function ensureAiHdPreview(job, order) {
  const existingPreview = getPreviewStorage(job)
  if (existingPreview?.bucket && existingPreview?.path) {
    return { job, previewStorage: existingPreview }
  }

  const aiDraftStorage = getAiDraftStorage(job)
  if (!aiDraftStorage?.bucket || !aiDraftStorage?.path) {
    return { job, previewStorage: null }
  }

  const aiDraftObject = await downloadObject({
    bucket: aiDraftStorage.bucket,
    path: aiDraftStorage.path,
  })
  const watermarkedBuffer = await watermarkPreview(aiDraftObject.buffer)
  const safeSubmissionReference = String(
    order?.submission_reference || job?.submission_reference || 'AI-HD-PREVIEW'
  ).replace(/[^A-Z0-9-]/g, '')
  const buckets = getHumanRestoreBuckets()
  const previewStoragePath = `${safeSubmissionReference}/preview-watermark.jpg`

  await uploadObject({
    bucket: buckets.results,
    contentType: previewWatermarkContentType,
    data: watermarkedBuffer,
    path: previewStoragePath,
  })

  const updatedJob = await updateJob(job.id, {
    ai_provider_payload: {
      ...(job.ai_provider_payload || {}),
      preview_generated_at: new Date().toISOString(),
      preview_storage_bucket: buckets.results,
      preview_storage_path: previewStoragePath,
    },
  })

  await insertEvent(job.id, 'ai_hd_preview_ready', {
    preview_storage_path: previewStoragePath,
    source: 'order_poll',
  }).catch(() => null)

  return {
    job: updatedJob || job,
    previewStorage: {
      bucket: buckets.results,
      path: previewStoragePath,
    },
  }
}

async function syncOrderWithLinkedJob(order) {
  let effectiveOrder = order
  const orderTier = resolveTierFromRecord(effectiveOrder)
  const orderPaid = isPaymentConfirmed(effectiveOrder)

  if (!effectiveOrder?.job_id) {
    const recoveredJob =
      (await getLatestJobByHumanRestoreOrderId(effectiveOrder?.id)) ||
      (await getLatestJobByOrderId(effectiveOrder?.payment_provider_order_id))

    if (!recoveredJob) {
      return effectiveOrder
    }

    effectiveOrder =
      (await updateOrder(effectiveOrder.id, {
        job_id: recoveredJob.id,
        status:
          orderTier === 'ai_hd' && !orderPaid
            ? effectiveOrder.status
            : mapJobStatusToOrderStatus(recoveredJob.status),
      })) || effectiveOrder
  }

  const linkedJob = await getJob(effectiveOrder.job_id)

  if (!linkedJob) {
    return effectiveOrder
  }

  let effectiveJob = linkedJob

  if (shouldResumeLinkedFalJob(linkedJob)) {
    // Resume-only path: forceRerun is intentionally false so runRestoreJob
    // can ONLY continue an already-submitted fal request via pollFalRequest.
    // If the job has already settled into needs_review / delivered, the
    // idempotent guard inside runRestoreJob will no-op here instead of
    // triggering a new billable fal submission on every order page refresh.
    effectiveJob = await runRestoreJob({
      job: linkedJob,
      forceRerun: false,
      triggeredBy: 'order_sync',
    }).catch(() => linkedJob)
  }

  // Eventual-consistency safety net for AI HD orders. The webhook's
  // synchronous auto-deliver call can miss when the AI provider takes
  // longer than the serverless function timeout — the job ends up at
  // `needs_review` but never gets emailed. The success page polls this
  // endpoint every few seconds, so we re-check the tier here and fire
  // auto-delivery as soon as the AI draft is ready. `autoDeliverAiHdJob`
  // is idempotent: it short-circuits when the job is already delivered.
  if (
    orderTier === 'ai_hd' &&
    orderPaid &&
    effectiveJob.status === 'needs_review'
  ) {
    const resendApiKey = process.env.RESEND_API_KEY
    const fromEmail =
      process.env.HUMAN_RESTORE_FROM_EMAIL ||
      'MemoryFix AI <onboarding@resend.dev>'
    const supportEmail =
      process.env.HUMAN_RESTORE_SUPPORT_EMAIL || process.env.HUMAN_RESTORE_INBOX

    if (resendApiKey && supportEmail) {
      const autoDeliveryResult = await autoDeliverAiHdJob({
        job: effectiveJob,
        resendApiKey,
        fromEmail,
        supportEmail,
      }).catch(async error => {
        await insertEvent(effectiveJob.id, 'ai_hd_auto_delivery_failed', {
          error:
            error instanceof Error
              ? error.message
              : 'AI HD auto-delivery failed.',
          source: 'order_sync_fallback',
        })
        return null
      })

      if (autoDeliveryResult?.delivered && autoDeliveryResult.job) {
        effectiveJob = autoDeliveryResult.job
      }
    }
  }

  const nextOrderStatus =
    orderTier === 'ai_hd' && !orderPaid
      ? effectiveOrder.status
      : mapJobStatusToOrderStatus(effectiveJob.status)

  if (nextOrderStatus === effectiveOrder.status) {
    return effectiveOrder
  }

  return (
    (await updateOrderByJobId(effectiveJob.id, {
      status: nextOrderStatus,
    })) || effectiveOrder
  )
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
    paid: isPaymentConfirmed(order),
    paymentConfirmedAt: order.payment_confirmed_at || '',
    photoReceived: Boolean(order.original_storage_path),
    productName: order.product_name || 'Human-assisted Restore',
    productTier: resolveTierFromRecord(order),
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
    const publicOrder = buildPublicOrder(order)
    const orderTier = publicOrder.productTier
    const orderPaid = isPaymentConfirmed(order)
    let linkedJob = order.job_id
      ? await getJob(order.job_id).catch(() => null)
      : null

    if (orderTier === 'ai_hd' && linkedJob) {
      let previewState = { job: linkedJob, previewStorage: null }
      let previewRenderError = ''
      try {
        previewState = await ensureAiHdPreview(linkedJob, order)
      } catch (error) {
        previewRenderError =
          error instanceof Error ? error.message : 'Preview render failed.'
        console.error(
          JSON.stringify({
            event: 'ai_hd_preview_render_failed',
            job_id: linkedJob?.id || null,
            order_id: order?.id || null,
            error_message: previewRenderError,
            error_name: error instanceof Error ? error.name : null,
            timestamp: new Date().toISOString(),
          })
        )
        await insertEvent(linkedJob.id, 'ai_hd_preview_render_failed', {
          error: previewRenderError,
          source: 'order_poll',
        }).catch(() => null)
      }
      linkedJob = previewState.job || linkedJob
      const previewStorage =
        previewState.previewStorage || getPreviewStorage(linkedJob)

      const jobIsTerminalFailure = [
        'failed',
        'ai_failed',
        'manual_review',
      ].includes(linkedJob.status)

      // A transient render error (e.g., a concurrent poll racing the
      // watermark step, a one-off sharp glitch) must NOT flip the UI
      // straight to 'failed': the watermark step is idempotent, and
      // the next poll will typically succeed. We already logged the
      // error + wrote an ai_hd_preview_render_failed event above for
      // diagnostics — that's enough. Only the job's own terminal
      // status should surface 'failed' to the customer; UX-level
      // timeouts are the frontend's responsibility.
      publicOrder.previewStatus = previewStorage?.path
        ? 'ready'
        : jobIsTerminalFailure
        ? 'failed'
        : 'processing'
      publicOrder.previewError =
        publicOrder.previewStatus === 'failed'
          ? linkedJob.ai_error ||
            linkedJob.ai_draft_error ||
            previewRenderError ||
            'Preview generation failed.'
          : ''

      if (previewStorage?.bucket && previewStorage?.path) {
        const [previewUrl, originalUrl] = await Promise.all([
          createSignedUrl({
            bucket: previewStorage.bucket,
            expiresIn: 48 * 60 * 60,
            path: previewStorage.path,
          }),
          createSignedUrl({
            bucket: order.original_storage_bucket,
            expiresIn: 48 * 60 * 60,
            path: order.original_storage_path,
          }),
        ])

        publicOrder.previewUrl = previewUrl
        publicOrder.originalUrl = originalUrl
      }
    }

    // AI HD download surface: inline the HD signed URL in the same
    // response the success page already polls. This keeps the
    // function count under the Vercel Hobby 12-function limit
    // instead of shipping a separate /api/ai-hd-result endpoint.
    if (orderTier === 'ai_hd' && orderPaid && linkedJob) {
      const aiDraftStorage = getAiDraftStorage(linkedJob)

      if (aiDraftStorage?.bucket && aiDraftStorage?.path) {
        const expiresIn = getDeliveryDownloadUrlSeconds()
        const downloadUrl = await createSignedUrl({
          bucket: aiDraftStorage.bucket,
          expiresIn,
          path: aiDraftStorage.path,
        }).catch(() => '')

        if (downloadUrl) {
          publicOrder.hdDownloadUrl = downloadUrl
          publicOrder.hdDownloadExpiresInSeconds = expiresIn
        }
      }
    }

    json(res, 200, {
      ok: true,
      order: publicOrder,
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

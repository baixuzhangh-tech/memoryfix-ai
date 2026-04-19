/**
 * POST /api/ai-hd-preview
 *
 * The customer-facing entry point for the $6.90 AI HD tier.
 *
 * Flow (preview-first, pay-to-unlock):
 *   1. Customer drops a photo on /ai-hd, browser POSTs it here.
 *   2. We rate-limit by IP (default 3 free previews per 24h).
 *   3. We create a `pending_payment` order + job and immediately run
 *      the AI restoration pipeline.
 *   4. Once the AI draft is ready, we generate a watermarked preview
 *      JPEG, store it in the results bucket, and return a signed
 *      preview URL plus the orderId/checkoutRef so the browser can
 *      open Paddle to unlock the HD download.
 *   5. After payment, the existing /api/paddle-webhook auto-delivery
 *      path emails the un-watermarked HD link and the success page
 *      surfaces the inline download button via /api/ai-hd-result.
 *
 * The unwatermarked HD draft is NEVER returned by this endpoint —
 * it lives only in private Supabase storage and is exposed via a
 * signed URL only after the order is paid.
 */

import { randomUUID } from 'crypto'

import { runRestoreJob } from './_lib/ai-restore.js'
import {
  validateContentPolicyAcceptance,
  validateHumanRestoreImageSafety,
  validateHumanRestoreSubmissionText,
} from './_lib/content-policy.js'
import {
  createSubmissionReference,
  getBoundary,
  json,
  parseMultipartForm,
  readRawBody,
} from './_lib/human-restore.js'
import {
  checkPreviewRateLimit,
  extractClientIp,
  recordPreviewAttempt,
} from './_lib/preview-rate-limit.js'
import { getAiHdPriceId, getProductNameForTier } from './_lib/product-tier.js'
import {
  getHumanRestoreBuckets,
  insertEvent,
  insertJob,
  insertOrder,
  isSupabaseConfigured,
  updateOrder,
  uploadObject,
} from './_lib/supabase.js'

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 60,
}

const maxUploadSizeBytes = 15 * 1024 * 1024
const allowedImageTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
])
const placeholderPreviewEmail = 'preview-pending@artgen.site'

/**
 * Best-effort background task scheduler for Vercel Node serverless.
 *
 * Prefers Vercel's documented request context (same mechanism used by
 * `@vercel/functions`'s `waitUntil`), which keeps the invocation alive
 * until the promise settles (up to maxDuration). If that hook is not
 * available (e.g. local dev, older runtime), we fall back to a plain
 * fire-and-forget so the main response is not blocked — the promise
 * will still run as long as the event loop is alive.
 */
function scheduleBackgroundTask(promiseFactory) {
  const promise = Promise.resolve().then(promiseFactory)
  try {
    const ctxSymbol = Symbol.for('@vercel/request-context')
    const store = globalThis[ctxSymbol]
    const ctx = typeof store?.get === 'function' ? store.get() : null
    if (typeof ctx?.waitUntil === 'function') {
      ctx.waitUntil(promise.catch(() => {}))
      return promise
    }
  } catch {
    // fall through to fire-and-forget
  }
  promise.catch(() => {})
  return promise
}

function validatePhoto(file) {
  if (!file || file.fieldName !== 'photo') {
    return 'Please attach the photo you want restored.'
  }

  if (!allowedImageTypes.has(file.contentType)) {
    return 'Please upload a JPG, PNG, WebP, HEIC, or HEIF image.'
  }

  if (file.data.length > maxUploadSizeBytes) {
    return 'Please keep the upload under 15 MB for this beta workflow.'
  }

  return ''
}

function getOrderExpiresAt() {
  const expiresAt = new Date()
  expiresAt.setHours(expiresAt.getHours() + 48)
  return expiresAt.toISOString()
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed.' })
    return
  }

  if (!isSupabaseConfigured()) {
    json(res, 503, {
      error:
        'AI HD preview is not configured yet. Please try again in a moment.',
    })
    return
  }

  if (!getAiHdPriceId()) {
    json(res, 503, {
      error: 'AI HD checkout is not configured yet. Please try again later.',
    })
    return
  }

  const contentType = req.headers['content-type'] || ''
  const boundary = getBoundary(contentType)

  if (!boundary) {
    json(res, 400, { error: 'Please attach a photo to preview.' })
    return
  }

  const clientIp = extractClientIp(req)
  let rateLimit = null

  try {
    rateLimit = await checkPreviewRateLimit(clientIp)
  } catch (error) {
    // checkPreviewRateLimit already fails open internally, but be
    // defensive in case its contract ever changes.
    console.warn(
      JSON.stringify({
        event: 'ai_hd_preview_rate_limit_throw',
        error_message: error instanceof Error ? error.message : 'unknown',
        timestamp: new Date().toISOString(),
      })
    )
  }

  if (rateLimit && rateLimit.allowed === false) {
    json(res, 429, {
      error:
        'You have used your free AI HD previews for today. Please try again tomorrow, or unlock an existing preview to continue.',
      remaining: 0,
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    })
    return
  }

  let localOrder = null
  let job = null
  let previewConsumed = false

  try {
    const rawBody = await readRawBody(req)
    const { fields, file } = parseMultipartForm(rawBody, boundary)
    const photoError = validatePhoto(file)

    if (photoError) {
      json(res, 400, { error: photoError })
      return
    }

    const notes = String(fields.notes || '').trim()
    const policyError =
      validateContentPolicyAcceptance(fields) ||
      validateHumanRestoreSubmissionText({
        fileName: file.filename,
        notes,
      })

    if (policyError) {
      json(res, 400, { error: policyError })
      return
    }

    const imageSafetyError = await validateHumanRestoreImageSafety({
      contentType: file.contentType,
      data: file.data,
      fileName: file.filename,
      notes,
    })

    if (imageSafetyError) {
      json(res, 400, { error: imageSafetyError })
      return
    }

    const orderId = randomUUID()
    const checkoutRef = randomUUID()
    const submissionReference = createSubmissionReference()
    const buckets = getHumanRestoreBuckets()
    const safeSubmissionReference = submissionReference.replace(
      /[^A-Z0-9-]/g,
      ''
    )
    const originalStoragePath = `${safeSubmissionReference}/original-${file.filename}`

    await uploadObject({
      bucket: buckets.originals,
      contentType: file.contentType,
      data: file.data,
      path: originalStoragePath,
    })

    const productName = getProductNameForTier('ai_hd')
    const priceId = getAiHdPriceId()
    const orderExpiresAt = getOrderExpiresAt()

    localOrder = await insertOrder({
      checkout_ref: checkoutRef,
      expires_at: orderExpiresAt,
      id: orderId,
      notes,
      original_file_name: file.filename,
      original_file_size: file.data.length,
      original_file_type: file.contentType,
      original_storage_bucket: buckets.originals,
      original_storage_path: originalStoragePath,
      product_name: productName,
      status: 'pending_payment',
      submission_reference: submissionReference,
      variant_id: priceId,
    })

    job = await insertJob({
      checkout_email: placeholderPreviewEmail,
      expires_at: orderExpiresAt,
      human_restore_order_id: localOrder.id,
      notes,
      order_bound: false,
      original_file_name: file.filename,
      original_file_size: file.data.length,
      original_file_type: file.contentType,
      original_storage_bucket: buckets.originals,
      original_storage_path: originalStoragePath,
      product_name: productName,
      status: 'uploaded',
      submission_reference: submissionReference,
      upload_source: 'ai_hd_preview',
    })

    await updateOrder(localOrder.id, { job_id: job.id })

    await insertEvent(job.id, 'ai_hd_preview_started', {
      ip_hash: rateLimit?.ipHash || null,
      local_order_id: localOrder.id,
    })

    // Count the preview attempt against the daily rate limit as soon as
    // we've accepted the request. We bill the rate limit on submission —
    // not on AI success — so rapid retries cannot bypass the cap even if
    // the background pipeline has not finished yet.
    await recordPreviewAttempt({
      ipHash: rateLimit?.ipHash,
      orderId: localOrder.id,
      succeeded: true,
    })
    previewConsumed = true

    const backgroundJob = job
    const backgroundOrderId = localOrder.id

    // Run the AI pipeline OUT OF BAND. On Vercel Node runtime we hand
    // the promise to the request-context `waitUntil` hook so the
    // serverless invocation stays alive until it settles (up to
    // maxDuration). The client gets its 202 immediately and polls
    // /api/human-restore-order for preview readiness, avoiding the
    // Vercel platform timeout → HTML-error-page failure mode that
    // previously caused "fal was charged but the preview never
    // surfaced on the frontend" for large uploads.
    scheduleBackgroundTask(async () => {
      try {
        await runRestoreJob({
          job: backgroundJob,
          triggeredBy: 'ai_hd_preview',
        })
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'AI run failed.'
        await insertEvent(backgroundJob.id, 'ai_hd_preview_ai_failed', {
          error: message,
        }).catch(() => null)
        await updateOrder(backgroundOrderId, { status: 'failed' }).catch(
          () => null
        )
      }
    })

    json(res, 202, {
      ok: true,
      checkoutRef,
      orderId: localOrder.id,
      productName,
      remaining: rateLimit ? Math.max(0, rateLimit.remaining - 1) : null,
      submissionReference,
      tier: 'ai_hd',
      jobId: job.id,
      previewStatus: 'processing',
      status: job.status,
    })
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'
    const errorStack = error instanceof Error ? error.stack : ''
    try {
      console.error(
        JSON.stringify({
          event: 'ai_hd_preview_failed',
          error_message: errorMessage,
          error_name: error instanceof Error ? error.name : null,
          error_stack: errorStack,
          job_id: job?.id || null,
          local_order_id: localOrder?.id || null,
          timestamp: new Date().toISOString(),
        })
      )
    } catch {
      // ignore logging failure
    }

    if (rateLimit?.ipHash && !previewConsumed) {
      await recordPreviewAttempt({
        ipHash: rateLimit.ipHash,
        orderId: localOrder?.id || null,
        succeeded: false,
      }).catch(() => null)
    }

    if (localOrder?.id) {
      await updateOrder(localOrder.id, { status: 'failed' }).catch(() => null)
    }

    // Expose the real failure reason so the browser error surface is
    // actionable. The AI HD preview flow runs entirely with public
    // assets (signed URLs expire in hours) — nothing secret leaks.
    json(res, 500, {
      error: `AI HD preview could not be created: ${errorMessage}`,
      debug: {
        jobId: job?.id || null,
        localOrderId: localOrder?.id || null,
      },
    })
  }
}

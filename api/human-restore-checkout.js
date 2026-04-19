import { randomUUID } from 'crypto'
import {
  createSubmissionReference,
  getBoundary,
  json,
  parseMultipartForm,
  readRawBody,
} from './_lib/human-restore.js'
import {
  getHumanRestoreBuckets,
  insertOrder,
  isSupabaseConfigured,
  updateOrder,
  uploadObject,
} from './_lib/supabase.js'
import {
  validateContentPolicyAcceptance,
  validateHumanRestoreImageSafety,
  validateHumanRestoreSubmissionText,
} from './_lib/content-policy.js'
import {
  getProductNameForTier,
  resolvePriceIdForTier,
} from './_lib/product-tier.js'

export const config = {
  api: {
    bodyParser: false,
  },
}

const maxUploadSizeBytes = 15 * 1024 * 1024
const unpaidOrderRetentionHours = 48
const allowedImageTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
])

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

function getExpiresAt() {
  const expiresAt = new Date()
  expiresAt.setHours(expiresAt.getHours() + unpaidOrderRetentionHours)
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
        'Human-assisted Restore checkout is not configured yet. Please try again later.',
    })
    return
  }

  const contentType = req.headers['content-type'] || ''
  const boundary = getBoundary(contentType)

  if (!boundary) {
    json(res, 400, {
      error: 'Please upload a photo before opening checkout.',
    })
    return
  }

  let localOrder = null

  try {
    const rawBody = await readRawBody(req)
    const { fields, file } = parseMultipartForm(rawBody, boundary)
    const rawTier = String(fields.productTier || fields.tier || '').trim()
    const productTier = rawTier === 'ai_hd' ? 'ai_hd' : 'human'
    const priceId = resolvePriceIdForTier(productTier)
    const productName = getProductNameForTier(productTier)
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
    const storagePath = `${safeSubmissionReference}/${file.filename}`

    await uploadObject({
      bucket: buckets.originals,
      contentType: file.contentType,
      data: file.data,
      path: storagePath,
    })

    localOrder = await insertOrder({
      checkout_ref: checkoutRef,
      expires_at: getExpiresAt(),
      id: orderId,
      notes,
      original_file_name: file.filename,
      original_file_size: file.data.length,
      original_file_type: file.contentType,
      original_storage_bucket: buckets.originals,
      original_storage_path: storagePath,
      product_name: productName,
      status: 'pending_payment',
      submission_reference: submissionReference,
      variant_id: priceId,
    })

    json(res, 200, {
      ok: true,
      checkoutRef,
      orderId: localOrder.id,
      submissionReference,
    })
  } catch (error) {
    // Surface the real failure in Vercel Logs so we can diagnose future
    // issues. Prior silent catch swallowed 7+ MB Vercel body-limit failures
    // as a generic 500 with no signal.
    try {
      console.error(
        JSON.stringify({
          event: 'human_restore_checkout_failed',
          error_message:
            error instanceof Error ? error.message : 'Unknown error',
          error_name: error instanceof Error ? error.name : null,
          local_order_id: localOrder?.id || null,
          timestamp: new Date().toISOString(),
        })
      )
    } catch {
      // Logging must never mask the real failure.
    }

    if (localOrder?.id) {
      await updateOrder(localOrder.id, { status: 'failed' }).catch(() => null)
    }

    json(res, 500, {
      error: 'Secure checkout could not be created right now.',
    })
  }
}

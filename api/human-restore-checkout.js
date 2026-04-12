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

export const config = {
  api: {
    bodyParser: false,
  },
}

const defaultSiteUrl = 'https://artgen.site'
const defaultHumanRestoreCheckoutUrl =
  'https://artgen.lemonsqueezy.com/checkout/buy/092746e8-e559-4bca-96d0-abe3df4df268'
const maxUploadSizeBytes = 15 * 1024 * 1024
const unpaidOrderRetentionHours = 48
const allowedImageTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
])

function getRuntimeCheckoutUrl() {
  return (
    process.env.LEMON_SQUEEZY_CHECKOUT_URL ||
    process.env.VITE_EARLY_ACCESS_URL ||
    defaultHumanRestoreCheckoutUrl
  )
}

function getErrorMessage(payload) {
  const detail = payload?.errors?.[0]?.detail

  if (detail) {
    return detail
  }

  return 'Secure checkout could not be created right now.'
}

function getCheckoutSlug(checkoutUrl) {
  if (!checkoutUrl) {
    return ''
  }

  try {
    const url = new URL(checkoutUrl)
    const pathSegments = url.pathname.split('/').filter(Boolean)
    const buyIndex = pathSegments.findIndex(segment => segment === 'buy')

    if (buyIndex === -1) {
      return ''
    }

    return pathSegments[buyIndex + 1] || ''
  } catch {
    return ''
  }
}

async function discoverCheckoutConfig({ checkoutUrl, requestHeaders }) {
  const checkoutSlug = getCheckoutSlug(checkoutUrl)

  if (!checkoutSlug) {
    return {}
  }

  const variantsUrl = new URL('https://api.lemonsqueezy.com/v1/variants')
  variantsUrl.searchParams.set('page[size]', '100')

  const variantsResponse = await fetch(variantsUrl.toString(), {
    headers: requestHeaders,
  })
  const variantsPayload = await variantsResponse.json().catch(() => null)

  if (!variantsResponse.ok) {
    return {}
  }

  const variants = Array.isArray(variantsPayload?.data)
    ? variantsPayload.data
    : []
  const variant = variants.find(item => item?.attributes?.slug === checkoutSlug)
  const variantId = variant?.id ? String(variant.id) : ''
  const productId = variant?.attributes?.product_id
    ? String(variant.attributes.product_id)
    : ''

  if (!variantId || !productId) {
    return { variantId }
  }

  const productResponse = await fetch(
    `https://api.lemonsqueezy.com/v1/products/${encodeURIComponent(productId)}`,
    {
      headers: requestHeaders,
    }
  )
  const productPayload = await productResponse.json().catch(() => null)
  const storeId = productPayload?.data?.attributes?.store_id
    ? String(productPayload.data.attributes.store_id)
    : ''

  return {
    storeId,
    variantId,
  }
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

  const apiKey = process.env.LEMON_SQUEEZY_API_KEY
  const siteUrl = process.env.SITE_URL || defaultSiteUrl
  let storeId = process.env.LEMON_SQUEEZY_STORE_ID
  let variantId = process.env.LEMON_SQUEEZY_HUMAN_RESTORE_VARIANT_ID

  if (!apiKey || !isSupabaseConfigured()) {
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
    const photoError = validatePhoto(file)

    if (photoError) {
      json(res, 400, { error: photoError })
      return
    }

    const requestHeaders = {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      Authorization: `Bearer ${apiKey}`,
    }

    if (!storeId || !variantId) {
      const discoveredConfig = await discoverCheckoutConfig({
        checkoutUrl: getRuntimeCheckoutUrl(),
        requestHeaders,
      })

      storeId = storeId || discoveredConfig.storeId
      variantId = variantId || discoveredConfig.variantId
    }

    if (!storeId || !variantId) {
      json(res, 503, {
        error: 'Server-created checkout is not configured yet.',
      })
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
    const notes = String(fields.notes || '').trim()

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
      product_name: 'Human-assisted Restore',
      status: 'pending_payment',
      submission_reference: submissionReference,
      variant_id: String(variantId),
    })

    const redirectUrl = new URL('/human-restore/success', siteUrl)
    redirectUrl.searchParams.set('order_id', localOrder.id)
    redirectUrl.searchParams.set('checkout_ref', checkoutRef)

    const parsedVariantId = Number(variantId)
    const response = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify({
        data: {
          type: 'checkouts',
          attributes: {
            product_options: {
              redirect_url: redirectUrl.toString(),
              ...(Number.isFinite(parsedVariantId)
                ? { enabled_variants: [parsedVariantId] }
                : {}),
            },
            checkout_data: {
              custom: {
                checkout_ref: checkoutRef,
                flow: 'human_restore_preupload',
                human_restore_order_id: localOrder.id,
                submission_reference: submissionReference,
              },
            },
          },
          relationships: {
            store: {
              data: {
                type: 'stores',
                id: String(storeId),
              },
            },
            variant: {
              data: {
                type: 'variants',
                id: String(variantId),
              },
            },
          },
        },
      }),
    })
    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      await updateOrder(localOrder.id, { status: 'failed' }).catch(() => null)
      json(res, 502, {
        error: getErrorMessage(payload),
      })
      return
    }

    const checkoutUrl = payload?.data?.attributes?.url

    if (!checkoutUrl) {
      await updateOrder(localOrder.id, { status: 'failed' }).catch(() => null)
      json(res, 502, {
        error: 'Checkout URL was not returned by Lemon Squeezy.',
      })
      return
    }

    const checkoutId = payload?.data?.id ? String(payload.data.id) : ''

    if (checkoutId || checkoutUrl) {
      localOrder = await updateOrder(localOrder.id, {
        checkout_id: checkoutId || null,
        checkout_url: checkoutUrl,
      })
    }

    json(res, 200, {
      ok: true,
      checkoutRef,
      checkoutUrl,
      orderId: localOrder.id,
    })
  } catch {
    if (localOrder?.id) {
      await updateOrder(localOrder.id, { status: 'failed' }).catch(() => null)
    }

    json(res, 500, {
      error: 'Secure checkout could not be created right now.',
    })
  }
}

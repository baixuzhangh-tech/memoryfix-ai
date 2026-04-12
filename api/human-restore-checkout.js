import { randomUUID } from 'crypto'
import { json } from './_lib/human-restore.js'

const defaultSiteUrl = 'https://artgen.site'

function getRuntimeCheckoutUrl() {
  return (
    process.env.LEMON_SQUEEZY_CHECKOUT_URL ||
    process.env.VITE_EARLY_ACCESS_URL ||
    ''
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed.' })
    return
  }

  const apiKey = process.env.LEMON_SQUEEZY_API_KEY
  const siteUrl = process.env.SITE_URL || defaultSiteUrl
  let storeId = process.env.LEMON_SQUEEZY_STORE_ID
  let variantId = process.env.LEMON_SQUEEZY_HUMAN_RESTORE_VARIANT_ID
  const checkoutRef = randomUUID()
  const successBase = new URL('/human-restore/success', siteUrl).toString()
  const redirectUrl = `${successBase}?checkout_ref=${checkoutRef}`

  if (!apiKey) {
    json(res, 503, {
      error: 'Server-created checkout is not configured yet.',
    })
    return
  }

  try {
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

    const parsedVariantId = Number(variantId)
    const response = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify({
        data: {
          type: 'checkouts',
          attributes: {
            product_options: {
              redirect_url: redirectUrl,
              ...(Number.isFinite(parsedVariantId)
                ? { enabled_variants: [parsedVariantId] }
                : {}),
            },
            checkout_data: {
              custom: {
                flow: 'human_restore_inline_upload',
                checkout_ref: checkoutRef,
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
      json(res, 502, {
        error: getErrorMessage(payload),
      })
      return
    }

    const checkoutUrl = payload?.data?.attributes?.url

    if (!checkoutUrl) {
      json(res, 502, {
        error: 'Checkout URL was not returned by Lemon Squeezy.',
      })
      return
    }

    json(res, 200, {
      ok: true,
      checkoutUrl,
      checkoutRef,
    })
  } catch {
    json(res, 500, {
      error: 'Secure checkout could not be created right now.',
    })
  }
}

import { randomUUID } from 'crypto'
import { json } from './_lib/human-restore.js'

const defaultSiteUrl = 'https://artgen.site'

function getErrorMessage(payload) {
  const detail = payload?.errors?.[0]?.detail

  if (detail) {
    return detail
  }

  return 'Secure checkout could not be created right now.'
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed.' })
    return
  }

  const apiKey = process.env.LEMON_SQUEEZY_API_KEY
  const siteUrl = process.env.SITE_URL || defaultSiteUrl
  const storeId = process.env.LEMON_SQUEEZY_STORE_ID
  const variantId = process.env.LEMON_SQUEEZY_HUMAN_RESTORE_VARIANT_ID
  const parsedVariantId = Number(variantId)
  const checkoutRef = randomUUID()
  const successBase = new URL('/human-restore/success', siteUrl).toString()
  const redirectUrl = `${successBase}?checkout_ref=${checkoutRef}`

  if (!apiKey || !storeId || !variantId) {
    json(res, 503, {
      error: 'Server-created checkout is not configured yet.',
    })
    return
  }

  try {
    const response = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
        Authorization: `Bearer ${apiKey}`,
      },
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

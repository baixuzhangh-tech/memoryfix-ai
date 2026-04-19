/**
 * Paddle Billing integration constants + format validators + the
 * `window.Paddle` ambient type. Centralising these here means App.tsx
 * no longer has to re-declare the global augmentation, and the Paddle
 * hook we extract later can import everything from a single place.
 *
 * Runtime configuration flows through Vite env vars so the same build
 * can be pointed at sandbox vs production by changing the hosting
 * environment — never hardcode a token here.
 */

export const paddleClientToken = import.meta.env.VITE_PADDLE_CLIENT_TOKEN || ''
export const paddleEnvironment =
  import.meta.env.VITE_PADDLE_ENVIRONMENT || 'production'
export const paddleHumanRestorePriceId =
  import.meta.env.VITE_PADDLE_HUMAN_RESTORE_PRICE_ID || ''
export const paddleHumanRestoreAiHdPriceId =
  import.meta.env.VITE_PADDLE_HUMAN_RESTORE_AI_HD_PRICE_ID || ''
export const paddleLocalPackPriceId =
  import.meta.env.VITE_PADDLE_LOCAL_PACK_PRICE_ID || ''

export type HumanRestoreTier = 'ai_hd' | 'human'

export function resolvePaddlePriceIdForTier(tier: HumanRestoreTier): string {
  if (tier === 'ai_hd') {
    return paddleHumanRestoreAiHdPriceId
  }
  return paddleHumanRestorePriceId
}
export const paddleScriptUrl = 'https://cdn.paddle.com/paddle/v2/paddle.js'

/**
 * A well-formed client token is either the sandbox `test_...` prefix or
 * the live `live_...` prefix — anything else means the env var was
 * missed or misconfigured.
 */
export function isPaddleClientTokenConfigured(value: string) {
  return value.startsWith('test_') || value.startsWith('live_')
}

/**
 * Paddle Billing price ids look like `pri_01h...`. Validate the prefix
 * so we can short-circuit to a friendly "payments are being set up"
 * notice instead of letting Paddle throw a cryptic error later.
 */
export function isPaddlePriceIdConfigured(value: string) {
  return /^pri_[a-zA-Z0-9]+/.test(value)
}

export type PaddleEventData = {
  customer?: { email?: string; id?: string }
  customData?: Record<string, unknown>
  id?: string
  items?: Array<{ price?: { id?: string } }>
  status?: string
  transactionId?: string
}

export type PaddleEvent = {
  data?: PaddleEventData
  name?: string
}

export type CheckoutLaunchResult = {
  error?: string
  ok: boolean
}

declare global {
  interface Window {
    Paddle?: {
      Checkout: {
        close: () => void
        open: (options: {
          customData?: Record<string, string>
          items: Array<{ priceId: string; quantity: number }>
          settings?: {
            displayMode?: string
            successUrl?: string
            theme?: string
          }
        }) => void
      }
      Environment: {
        set: (env: string) => void
      }
      Initialized: boolean
      Initialize?: (options: {
        eventCallback?: (event: PaddleEvent) => void
        token: string
      }) => void
      Setup?: (options: {
        eventCallback?: (event: PaddleEvent) => void
        token: string
      }) => void
    }
  }
}

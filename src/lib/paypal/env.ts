/**
 * PayPal Checkout integration constants + the `window.paypal` ambient
 * type. Replaces the former Paddle integration in `src/lib/paddle/env.ts`.
 *
 * Runtime configuration flows through Vite env vars so the same build
 * can be pointed at sandbox vs production by changing the hosting
 * environment — never hardcode credentials here.
 */

export const paypalClientId = import.meta.env.VITE_PAYPAL_CLIENT_ID || ''
export const paypalEnvironment =
  import.meta.env.VITE_PAYPAL_ENVIRONMENT || 'sandbox'

export type HumanRestoreTier = 'ai_hd' | 'human'

export type CheckoutLaunchResult = {
  error?: string
  ok: boolean
}

/**
 * PayPal JS SDK script URL. The client-id query param is appended at
 * load time so we can read the Vite env var at runtime.
 */
export function getPayPalScriptUrl(): string {
  if (!paypalClientId) return ''
  const params = new URLSearchParams({
    'client-id': paypalClientId,
    currency: 'USD',
    intent: 'capture',
  })
  return `https://www.paypal.com/sdk/js?${params.toString()}`
}

export function isPayPalConfigured(): boolean {
  return Boolean(paypalClientId)
}

// ---------------------------------------------------------------------------
// PayPal JS SDK ambient types (subset used by our integration)
// ---------------------------------------------------------------------------

export type PayPalButtonsCreateOrderActions = {
  order: {
    create: (data: Record<string, unknown>) => Promise<string>
  }
}

export type PayPalButtonsOnApproveData = {
  orderID: string
  payerID?: string
  facilitatorAccessToken?: string
}

export type PayPalButtonsOnApproveActions = {
  order: {
    capture: () => Promise<Record<string, unknown>>
  }
}

export type PayPalButtonsComponentOptions = {
  createOrder: () => Promise<string>
  onApprove: (
    data: PayPalButtonsOnApproveData,
    actions: PayPalButtonsOnApproveActions
  ) => Promise<void>
  onCancel?: () => void
  onError?: (err: unknown) => void
  style?: {
    layout?: 'vertical' | 'horizontal'
    color?: 'gold' | 'blue' | 'silver' | 'white' | 'black'
    shape?: 'rect' | 'pill'
    label?: 'paypal' | 'checkout' | 'buynow' | 'pay'
    height?: number
    tagline?: boolean
  }
}

export type PayPalButtonsComponent = {
  isEligible: () => boolean
  render: (container: string | HTMLElement) => Promise<void>
  close: () => Promise<void>
}

declare global {
  interface Window {
    paypal?: {
      Buttons: (
        options: PayPalButtonsComponentOptions
      ) => PayPalButtonsComponent
      version?: string
    }
  }
}

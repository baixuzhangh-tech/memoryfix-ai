import { useEffect, useRef } from 'react'

import type { LocalRepairUsage } from '../lib/localRepair'
import { getPayPalScriptUrl, isPayPalConfigured } from '../lib/paypal/env'

export interface LocalPackCompletionInfo {
  addedCredits: number
  nextUsage: LocalRepairUsage
  transactionId: string
}

export interface UsePayPalArgs {
  onLocalPackCheckoutCompleted: (info: LocalPackCompletionInfo) => void
}

export interface UsePayPalResult {
  /**
   * Lazy-loads the PayPal JS SDK script. Resolves true when
   * `window.paypal` is available. Every call site that needs
   * PayPal should await this first.
   */
  ensurePayPalReady: () => Promise<boolean>
  isHumanRestorePaymentReady: boolean
  isLocalPackPaymentReady: boolean
  isPayPalClientReady: boolean
}

/**
 * Lifecycle + integration hook for PayPal Checkout.
 *
 * Replaces the former `usePaddle` hook. Key differences:
 *   - PayPal JS SDK renders buttons that the buyer clicks (no overlay).
 *   - Payment is captured via our server after buyer approval, not via
 *     a client-side event callback.
 *   - Local Pack checkout also goes through PayPal server flow and the
 *     capture result triggers credit addition.
 *
 * This hook handles:
 *   - Lazy-loading the PayPal JS SDK script
 *   - Exposing readiness flags for checkout buttons
 *   - Providing `ensurePayPalReady()` for imperative call sites
 */
export function usePayPal({
  onLocalPackCheckoutCompleted,
}: UsePayPalArgs): UsePayPalResult {
  const scriptLoadPromiseRef = useRef<Promise<boolean> | null>(null)
  const localPackCallbackRef = useRef(onLocalPackCheckoutCompleted)

  useEffect(() => {
    localPackCallbackRef.current = onLocalPackCheckoutCompleted
  })

  function loadPayPalScript(): Promise<boolean> {
    if (window.paypal?.Buttons) {
      return Promise.resolve(true)
    }

    if (scriptLoadPromiseRef.current) {
      return scriptLoadPromiseRef.current
    }

    const scriptUrl = getPayPalScriptUrl()

    if (!scriptUrl) {
      return Promise.resolve(false)
    }

    scriptLoadPromiseRef.current = new Promise(resolve => {
      const existingScript = document.querySelector<HTMLScriptElement>(
        `script[src^="https://www.paypal.com/sdk/js"]`
      )
      const script = existingScript || document.createElement('script')
      let settled = false

      function finish(ok: boolean) {
        if (settled) return
        const didLoad = Boolean(ok && window.paypal?.Buttons)
        settled = true

        if (!didLoad) {
          scriptLoadPromiseRef.current = null
          if (!existingScript) script.remove()
        }

        resolve(didLoad)
      }

      script.addEventListener('load', () => finish(true), { once: true })
      script.addEventListener('error', () => finish(false), { once: true })

      if (!existingScript) {
        script.src = scriptUrl
        script.async = true
        script.dataset.sdkIntegrationSource = 'button-factory'
        document.head.appendChild(script)
      }

      // Timeout — PayPal CDN may be slow
      window.setTimeout(() => {
        // eslint-disable-next-line no-console
        console.warn(
          '[PayPal] Script load timeout, paypal available:',
          Boolean(window.paypal)
        )
        finish(Boolean(window.paypal?.Buttons))
      }, 30000)
    })

    return scriptLoadPromiseRef.current
  }

  async function ensurePayPalReady(): Promise<boolean> {
    return loadPayPalScript()
  }

  useEffect(() => {
    // Pre-warm the PayPal script on mount
    loadPayPalScript().catch(() => null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isPayPalClientReady = isPayPalConfigured()
  const isLocalPackPaymentReady = isPayPalClientReady
  const isHumanRestorePaymentReady = isPayPalClientReady

  return {
    ensurePayPalReady,
    isHumanRestorePaymentReady,
    isLocalPackPaymentReady,
    isPayPalClientReady,
  }
}

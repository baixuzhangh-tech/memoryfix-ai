import { useEffect, useRef } from 'react'

import trackProductEvent from '../analytics'
import { humanRestoreSuccessPath } from '../config/routes'
import { readHumanRestoreCheckoutContext } from '../humanRestoreCheckoutContext'
import { normalizeCheckoutEmail } from '../lib/email'
import {
  addLocalRepairPackCredits,
  clearPendingLocalRepairPackCheckout,
  localRepairPackCredits,
  readPendingLocalRepairPackCheckout,
} from '../lib/localRepair'
import type { LocalRepairUsage } from '../lib/localRepair'
import {
  isPaddleClientTokenConfigured,
  isPaddlePriceIdConfigured,
  paddleClientToken,
  paddleEnvironment,
  paddleHumanRestorePriceId,
  paddleLocalPackPriceId,
  paddleScriptUrl,
} from '../lib/paddle/env'
import type { PaddleEvent } from '../lib/paddle/env'

export interface LocalPackCompletionInfo {
  addedCredits: number
  nextUsage: LocalRepairUsage
  transactionId: string
}

export interface UsePaddleArgs {
  /**
   * Fired after a successful Local Repair Pack checkout. Receives the
   * updated usage snapshot so the caller can sync React state, close
   * the upsell modal, update the success notice, and scroll back to
   * the editor. All storage-level side effects (granting credits,
   * clearing the pending-checkout flag, closing the Paddle overlay)
   * have already happened by the time this callback runs.
   */
  onLocalPackCheckoutCompleted: (info: LocalPackCompletionInfo) => void
}

export interface UsePaddleResult {
  /**
   * Lazy-loads the Paddle script and runs Initialize/Setup. Resolves
   * true when Paddle.Checkout is ready to be opened. Every call site
   * that opens a checkout should await this first instead of calling
   * window.Paddle directly so we get a single place to fail gracefully
   * if the script is blocked (ad-block, offline, long timeout).
   */
  ensurePaddleReady: () => Promise<boolean>
  isHumanRestorePaymentReady: boolean
  isLocalPackPaymentReady: boolean
  isPaddleClientReady: boolean
}

/**
 * Lifecycle + integration hook for the Paddle Billing client SDK.
 *
 * Responsibilities:
 *   - On mount, pre-warm the Paddle script (idempotent) so the first
 *     click that opens a checkout feels instant.
 *   - Expose `ensurePaddleReady()` for imperative call sites (the
 *     Human Restore and Local Pack checkout launchers in App).
 *   - Own the single Paddle `eventCallback` that fires on every
 *     Paddle overlay event, and dispatch `checkout.completed` into
 *     either the Local Pack branch (credits bump + caller callback)
 *     or the Human Restore branch (success URL redirect).
 *
 * The caller's `onLocalPackCheckoutCompleted` callback is kept on a
 * ref so that App re-renders do not invalidate the closure Paddle
 * captured during Initialize/Setup.
 */
export function usePaddle({
  onLocalPackCheckoutCompleted,
}: UsePaddleArgs): UsePaddleResult {
  const paddleSetupRef = useRef(false)
  const paddleScriptLoadPromiseRef = useRef<Promise<boolean> | null>(null)
  const localPackCallbackRef = useRef(onLocalPackCheckoutCompleted)

  useEffect(() => {
    localPackCallbackRef.current = onLocalPackCheckoutCompleted
  })

  function loadPaddleScript(): Promise<boolean> {
    if (window.Paddle?.Initialize || window.Paddle?.Setup) {
      return Promise.resolve(true)
    }

    if (paddleScriptLoadPromiseRef.current) {
      return paddleScriptLoadPromiseRef.current
    }

    paddleScriptLoadPromiseRef.current = new Promise(resolve => {
      const existingScript = document.querySelector<HTMLScriptElement>(
        `script[src="${paddleScriptUrl}"]`
      )
      const script = existingScript || document.createElement('script')
      let settled = false

      function finish(ok: boolean) {
        if (settled) {
          return
        }

        const didLoad = Boolean(
          ok && (window.Paddle?.Initialize || window.Paddle?.Setup)
        )

        settled = true

        if (!didLoad) {
          paddleScriptLoadPromiseRef.current = null
          script.remove()
        }

        resolve(didLoad)
      }

      script.addEventListener('load', () => finish(true), { once: true })
      script.addEventListener('error', () => finish(false), { once: true })

      if (!existingScript) {
        script.src = paddleScriptUrl
        script.async = true
        document.head.appendChild(script)
      }

      window.setTimeout(() => {
        // eslint-disable-next-line no-console
        console.warn(
          '[Paddle] Script load timeout, Paddle available:',
          Boolean(window.Paddle)
        )
        finish(Boolean(window.Paddle?.Initialize || window.Paddle?.Setup))
      }, 30000)
    })

    return paddleScriptLoadPromiseRef.current
  }

  function setupPaddle(): boolean {
    const paddle = window.Paddle

    if (!paddle?.Initialize && !paddle?.Setup) {
      // eslint-disable-next-line no-console
      console.warn(
        '[Paddle] setupPaddle: no Initialize/Setup.',
        'Paddle =',
        typeof paddle
      )
      return false
    }

    if (!paddleSetupRef.current) {
      if (!isPaddleClientTokenConfigured(paddleClientToken)) {
        // eslint-disable-next-line no-console
        console.warn('[Paddle] setupPaddle: token not configured')
        return false
      }

      try {
        if (paddleEnvironment === 'sandbox' && paddle?.Environment) {
          paddle.Environment.set('sandbox')
        }

        const setupOptions: {
          eventCallback: (event: PaddleEvent) => void
          token: string
        } = {
          token: paddleClientToken,
          eventCallback: event => {
            if (event.name !== 'checkout.completed') {
              return
            }

            const eventData = event.data || {}
            const paidTransactionId =
              eventData.transactionId || eventData.id || ''
            const paidCheckoutEmail = normalizeCheckoutEmail(
              eventData.customer?.email
            )
            const customData = (eventData.customData || {}) as Record<
              string,
              unknown
            >
            const pendingContext = readHumanRestoreCheckoutContext()
            const pendingCheckoutRef = pendingContext.pendingCheckoutRef || ''
            const pendingOrderId = pendingContext.pendingOrderId || ''
            const isLocalRepairPackCheckout =
              readPendingLocalRepairPackCheckout() ||
              customData.memoryfix_plan === 'local_repair_pack'

            if (isLocalRepairPackCheckout) {
              clearPendingLocalRepairPackCheckout()
              const nextUsage = addLocalRepairPackCredits()
              window.Paddle?.Checkout.close()
              trackProductEvent('complete_local_repair_pack_checkout', {
                added_credits: localRepairPackCredits,
                has_order_id: Boolean(paidTransactionId),
                paid_credits_remaining: nextUsage.paidCredits,
              })
              localPackCallbackRef.current({
                addedCredits: localRepairPackCredits,
                nextUsage,
                transactionId: paidTransactionId,
              })
              return
            }

            try {
              localStorage.setItem(
                'ls_checkout_success',
                JSON.stringify({
                  orderId: paidTransactionId,
                  email: paidCheckoutEmail,
                  identifier: paidTransactionId,
                  timestamp: Date.now(),
                })
              )
            } catch {
              // localStorage may be unavailable
            }

            const successUrl = new URL(
              humanRestoreSuccessPath,
              window.location.origin
            )

            if (pendingOrderId) {
              successUrl.searchParams.set('order_id', pendingOrderId)
            } else if (paidTransactionId) {
              successUrl.searchParams.set('order_id', paidTransactionId)
            }

            if (pendingOrderId && paidTransactionId) {
              successUrl.searchParams.set(
                'provider_order_id',
                paidTransactionId
              )
            }

            if (paidCheckoutEmail) {
              successUrl.searchParams.set('email', paidCheckoutEmail)
            }

            if (pendingCheckoutRef) {
              successUrl.searchParams.set('checkout_ref', pendingCheckoutRef)
            }

            trackProductEvent('complete_human_restore_checkout', {
              has_checkout_email: Boolean(paidCheckoutEmail),
              has_checkout_ref: Boolean(pendingCheckoutRef),
              has_order_id: Boolean(paidTransactionId),
            })

            window.location.href = successUrl.toString()
          },
        }

        if (paddle.Initialize) {
          paddle.Initialize(setupOptions)
        } else {
          paddle.Setup?.(setupOptions)
        }
        paddleSetupRef.current = true
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[Paddle] setupPaddle error:', err)
        return false
      }
    }

    return true
  }

  async function ensurePaddleReady(): Promise<boolean> {
    const isLoaded = await loadPaddleScript()

    if (!isLoaded) {
      return false
    }

    return setupPaddle()
  }

  useEffect(() => {
    loadPaddleScript()
      .then(isLoaded => {
        if (isLoaded) {
          setupPaddle()
        }
      })
      .catch(() => null)
    // Intentionally empty deps: script + setup are idempotent and must
    // run exactly once per app mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isPaddleClientReady = isPaddleClientTokenConfigured(paddleClientToken)
  const isLocalPackPaymentReady =
    isPaddleClientReady && isPaddlePriceIdConfigured(paddleLocalPackPriceId)
  const isHumanRestorePaymentReady =
    isPaddleClientReady && isPaddlePriceIdConfigured(paddleHumanRestorePriceId)

  return {
    ensurePaddleReady,
    isHumanRestorePaymentReady,
    isLocalPackPaymentReady,
    isPaddleClientReady,
  }
}

import { useEffect, useState } from 'react'

import type { HumanRestoreLocalOrder } from '../components/HumanRestoreSuccessStatusPage'
import { humanRestoreSecureUploadPath } from '../config/routes'
import { clearHumanRestoreStoredCheckoutContext } from '../humanRestoreCheckoutContext'
import trackProductEvent from '../analytics'

/**
 * API response shapes. Kept private to this hook because App.tsx used
 * to duplicate them alongside state it no longer owns; moving them
 * here keeps the single consumer close to its contract.
 */
type HumanRestoreOrderResponse = {
  error?: string
  ok?: boolean
  order?: HumanRestoreLocalOrder
}

type DirectSecureAccessResponse = {
  error?: string
  ok?: boolean
  uploadUrl?: string
}

export type SecureOrderSummary = {
  checkoutEmailMasked: string
  createdAt: string
  orderId: string
  orderNumber?: string
  productName?: string
  receiptUrl?: string
  testMode?: boolean
}

type SecureOrderResponse = {
  error?: string
  ok?: boolean
  order?: SecureOrderSummary
}

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'
export type DirectUploadStatus = 'idle' | 'loading' | 'ready' | 'unavailable'

export interface UseHumanRestoreOrderArgs {
  browserCheckoutContextHasPendingCheckout: boolean
  directAccessCheckoutRef: string
  directAccessCheckoutStartedAt: string
  directAccessOrderId: string
  directAccessOrderIdentifier: string
  effectiveCheckoutEmail: string
  hasLocalHumanRestoreOrder: boolean
  isHumanRestoreSuccessPage: boolean
  localHumanRestoreCheckoutRef: string
  localHumanRestoreOrderId: string
  secureUploadToken: string
}

export interface UseHumanRestoreOrderResult {
  directUploadStatus: DirectUploadStatus
  directUploadToken: string
  directUploadUrl: string
  humanRestoreOrder: HumanRestoreLocalOrder | null
  humanRestoreOrderError: string
  humanRestoreOrderStatus: LoadStatus
  inlineSecureOrder: SecureOrderSummary | null
  inlineSecureOrderStatus: LoadStatus
}

/**
 * Fused state machine for the three post-checkout data flows on the
 * success page:
 *
 *  1. **Primary order poll** — when the browser has a local reference
 *     to the paid order (UUID in ?order_id or in the pending checkout
 *     context), hit /api/human-restore-order and keep polling every
 *     4s while the status is still pre-delivery. Errors retry in 5s.
 *
 *  2. **Secure upload URL resolver** — when the browser does NOT
 *     already have an authoritative local order id, derive a signed
 *     upload URL for the buyer by asking
 *     /api/human-restore-secure-access with whichever of the possible
 *     references we do have (order id, order identifier, checkout ref,
 *     email, or the generic "recent pending checkout in this browser"
 *     mode). This populates `directUploadUrl` + `directUploadToken`.
 *
 *  3. **Inline secure order preview** — once (2) has produced a token,
 *     fetch the masked order summary that the success page shows below
 *     the primary confirmation. Only runs when (2) resolves to `ready`.
 *
 * The three flows were three separate useEffects in App.tsx; they are
 * left as three effects here because they genuinely have different
 * triggers and cancellation semantics, just co-located so nobody has
 * to scroll 300 lines to see them all together.
 */
export function useHumanRestoreOrder({
  browserCheckoutContextHasPendingCheckout,
  directAccessCheckoutRef,
  directAccessCheckoutStartedAt,
  directAccessOrderId,
  directAccessOrderIdentifier,
  effectiveCheckoutEmail,
  hasLocalHumanRestoreOrder,
  isHumanRestoreSuccessPage,
  localHumanRestoreCheckoutRef,
  localHumanRestoreOrderId,
  secureUploadToken,
}: UseHumanRestoreOrderArgs): UseHumanRestoreOrderResult {
  const [humanRestoreOrder, setHumanRestoreOrder] =
    useState<HumanRestoreLocalOrder | null>(null)
  const [humanRestoreOrderStatus, setHumanRestoreOrderStatus] =
    useState<LoadStatus>('idle')
  const [humanRestoreOrderError, setHumanRestoreOrderError] = useState('')

  const [directUploadUrl, setDirectUploadUrl] = useState('')
  const [directUploadToken, setDirectUploadToken] = useState('')
  const [directUploadStatus, setDirectUploadStatus] =
    useState<DirectUploadStatus>('idle')

  const [inlineSecureOrder, setInlineSecureOrder] =
    useState<SecureOrderSummary | null>(null)
  const [inlineSecureOrderStatus, setInlineSecureOrderStatus] =
    useState<LoadStatus>('idle')

  // 1. Primary order poll.
  useEffect(() => {
    if (!isHumanRestoreSuccessPage || !hasLocalHumanRestoreOrder) {
      setHumanRestoreOrderStatus('idle')
      setHumanRestoreOrderError('')
      setHumanRestoreOrder(null)
      return () => undefined
    }

    let isActive = true
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    async function loadOrder() {
      if (!isActive) {
        return
      }

      setHumanRestoreOrderStatus(currentStatus =>
        currentStatus === 'ready' ? 'ready' : 'loading'
      )
      setHumanRestoreOrderError('')

      try {
        const requestUrl = new URL(
          '/api/human-restore-order',
          window.location.origin
        )
        requestUrl.searchParams.set('orderId', localHumanRestoreOrderId)

        if (localHumanRestoreCheckoutRef) {
          requestUrl.searchParams.set(
            'checkoutRef',
            localHumanRestoreCheckoutRef
          )
        }

        const response = await fetch(requestUrl.toString())
        const responseBody = (await response
          .json()
          .catch(() => null)) as HumanRestoreOrderResponse | null

        if (!isActive) {
          return
        }

        if (!response.ok || !responseBody?.order) {
          throw new Error(
            responseBody?.error || 'The order status could not be loaded yet.'
          )
        }

        setHumanRestoreOrder(responseBody.order)
        setHumanRestoreOrderStatus('ready')

        const shouldKeepPolling = [
          'pending_payment',
          'paid',
          'uploaded',
          'processing',
          'ai_queued',
        ].includes(responseBody.order.status)

        if (shouldKeepPolling) {
          retryTimer = setTimeout(loadOrder, 4000)
        } else {
          clearHumanRestoreStoredCheckoutContext()
        }
      } catch (error) {
        if (!isActive) {
          return
        }

        setHumanRestoreOrderStatus('error')
        setHumanRestoreOrderError(
          error instanceof Error
            ? error.message
            : 'The order status could not be loaded yet.'
        )
        retryTimer = setTimeout(loadOrder, 5000)
      }
    }

    loadOrder()

    return () => {
      isActive = false
      if (retryTimer) {
        clearTimeout(retryTimer)
      }
    }
  }, [
    hasLocalHumanRestoreOrder,
    isHumanRestoreSuccessPage,
    localHumanRestoreCheckoutRef,
    localHumanRestoreOrderId,
  ])

  // 2. Secure upload URL resolver.
  useEffect(() => {
    let isActive = true

    if (!isHumanRestoreSuccessPage) {
      setDirectUploadStatus('idle')
      setDirectUploadUrl('')
      setDirectUploadToken('')
      return () => {
        isActive = false
      }
    }

    if (hasLocalHumanRestoreOrder) {
      setDirectUploadStatus('idle')
      setDirectUploadUrl('')
      setDirectUploadToken('')
      return () => {
        isActive = false
      }
    }

    if (secureUploadToken) {
      const uploadUrl = new URL(
        humanRestoreSecureUploadPath,
        window.location.origin
      )
      uploadUrl.searchParams.set('token', secureUploadToken)
      setDirectUploadUrl(uploadUrl.toString())
      setDirectUploadToken(secureUploadToken)
      setDirectUploadStatus('ready')
      return () => {
        isActive = false
      }
    }

    const hasAnyOrderRef =
      directAccessOrderId ||
      directAccessOrderIdentifier ||
      directAccessCheckoutRef ||
      browserCheckoutContextHasPendingCheckout

    if (!hasAnyOrderRef) {
      setDirectUploadStatus('unavailable')
      setDirectUploadUrl('')
      setDirectUploadToken('')
      return () => {
        isActive = false
      }
    }

    setDirectUploadStatus('loading')
    setDirectUploadUrl('')
    setDirectUploadToken('')

    const requestUrl = new URL(
      '/api/human-restore-secure-access',
      window.location.origin
    )
    if (directAccessOrderId) {
      requestUrl.searchParams.set('orderId', directAccessOrderId)
    }

    if (directAccessOrderIdentifier) {
      requestUrl.searchParams.set(
        'orderIdentifier',
        directAccessOrderIdentifier
      )
    }

    if (directAccessCheckoutRef) {
      requestUrl.searchParams.set('checkoutRef', directAccessCheckoutRef)
    }

    if (directAccessCheckoutStartedAt) {
      requestUrl.searchParams.set(
        'checkoutStartedAt',
        directAccessCheckoutStartedAt
      )
    }

    if (effectiveCheckoutEmail) {
      requestUrl.searchParams.set('checkoutEmail', effectiveCheckoutEmail)
    }

    if (
      browserCheckoutContextHasPendingCheckout &&
      !directAccessOrderId &&
      !directAccessOrderIdentifier &&
      !directAccessCheckoutRef
    ) {
      requestUrl.searchParams.set('mode', 'recent')
    }

    fetch(requestUrl.toString())
      .then(async response => {
        const responseBody = (await response
          .json()
          .catch(() => null)) as DirectSecureAccessResponse | null

        if (!isActive) {
          return
        }

        if (response.ok && responseBody?.uploadUrl) {
          const nextUploadUrl = responseBody.uploadUrl
          const nextUploadToken =
            new URL(nextUploadUrl).searchParams.get('token') || ''

          if (!nextUploadToken) {
            setDirectUploadStatus('unavailable')
            return
          }

          setDirectUploadToken(nextUploadToken)
          setDirectUploadUrl(responseBody.uploadUrl)
          setDirectUploadStatus('ready')
          clearHumanRestoreStoredCheckoutContext()
          return
        }

        setDirectUploadToken('')
        setDirectUploadStatus('unavailable')
      })
      .catch(() => {
        if (!isActive) {
          return
        }

        setDirectUploadToken('')
        setDirectUploadStatus('unavailable')
      })

    return () => {
      isActive = false
    }
  }, [
    effectiveCheckoutEmail,
    directAccessCheckoutRef,
    directAccessCheckoutStartedAt,
    directAccessOrderId,
    directAccessOrderIdentifier,
    browserCheckoutContextHasPendingCheckout,
    hasLocalHumanRestoreOrder,
    isHumanRestoreSuccessPage,
    secureUploadToken,
  ])

  // 3. Inline secure order preview.
  useEffect(() => {
    if (
      !isHumanRestoreSuccessPage ||
      directUploadStatus !== 'ready' ||
      !directUploadToken
    ) {
      setInlineSecureOrderStatus('idle')
      setInlineSecureOrder(null)
      return () => undefined
    }

    let isActive = true
    setInlineSecureOrderStatus('loading')
    setInlineSecureOrder(null)

    fetch(
      `/api/human-restore-order?token=${encodeURIComponent(directUploadToken)}`
    )
      .then(async response => {
        const responseBody = (await response
          .json()
          .catch(() => null)) as SecureOrderResponse | null

        if (!isActive) {
          return
        }

        if (!response.ok || !responseBody?.order) {
          throw new Error(
            responseBody?.error ||
              'The secure upload context could not be verified on this page.'
          )
        }

        setInlineSecureOrder(responseBody.order)
        setInlineSecureOrderStatus('ready')
        trackProductEvent('view_inline_human_restore_secure_upload', {
          test_mode: Boolean(responseBody.order.testMode),
        })
      })
      .catch(() => {
        if (!isActive) {
          return
        }

        setInlineSecureOrderStatus('error')
        setInlineSecureOrder(null)
      })

    return () => {
      isActive = false
    }
  }, [directUploadStatus, directUploadToken, isHumanRestoreSuccessPage])

  return {
    directUploadStatus,
    directUploadToken,
    directUploadUrl,
    humanRestoreOrder,
    humanRestoreOrderError,
    humanRestoreOrderStatus,
    inlineSecureOrder,
    inlineSecureOrderStatus,
  }
}

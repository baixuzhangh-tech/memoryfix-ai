/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable jsx-a11y/control-has-associated-label */
import { useEffect, useState } from 'react'
import AdminReviewPage from './components/AdminReviewPage'
import AppShell from './components/AppShell'
import RetoucherPortal from './components/RetoucherPortal'
import LegalPage from './components/LegalPage'
import Button from './components/Button'
import FileSelect from './components/FileSelect'
import HumanRestoreCheckoutForm from './components/HumanRestoreCheckoutForm'
import HumanRestoreSuccessStatusPage from './components/HumanRestoreSuccessStatusPage'
import type { HumanRestoreLocalOrder } from './components/HumanRestoreSuccessStatusPage'
import HumanRestoreUploadForm from './components/HumanRestoreUploadForm'
import Modal from './components/Modal'
import SecureHumanRestoreUploadPage from './components/SecureHumanRestoreUploadPage'
import Editor from './Editor'
import CheckoutForm from './components/domain/CheckoutForm'
import LandingPage from './pages/LandingPage'
import LegacyHomePage from './pages/LegacyHomePage'
import type { PricingPlanKind } from './pages/LegacyHomePage'
import SecureUploadPage from './pages/SecureUploadPage'
import SuccessPage from './pages/SuccessPage'
import { useCurrentView } from './hooks/useCurrentView'
import { useHumanRestoreOrder } from './hooks/useHumanRestoreOrder'
import { usePageSeo } from './hooks/usePageSeo'
import { usePaddle } from './hooks/usePaddle'
import * as m from './paraglide/messages'
import { resizeImageFile } from './utils'
import Progress from './components/Progress'
import { downloadModel, modelExists } from './adapters/cache'
import trackProductEvent from './analytics'
import {
  clearHumanRestoreStoredCheckoutContext,
  readHumanRestoreCheckoutContext,
  rememberHumanRestorePendingCheckout,
} from './humanRestoreCheckoutContext'
import {
  humanRestorePostPaymentSteps,
  humanRestoreServiceHighlights,
  humanRestoreTrustNotes,
} from './humanRestoreContent'
import { languageTag, onSetLanguageTag } from './paraglide/runtime'
import {
  humanRestoreSecureUploadPath,
  humanRestoreSuccessPath,
} from './config/routes'
import { maskEmailAddress } from './lib/email'
import { looksLikeUuid } from './lib/uuid'
import {
  clearPendingLocalRepairPackCheckout,
  consumeLocalRepairCredit,
  freeLocalRepairLimit,
  getFreeLocalRepairsRemaining,
  humanRestorePrice,
  localRepairPackCredits,
  localRepairPackPrice,
  localRepairUsageStorageKey,
  readLocalRepairUsage,
  rememberPendingLocalRepairPackCheckout,
  writeLocalRepairUsage,
} from './lib/localRepair'
import {
  paddleHumanRestorePriceId,
  paddleLocalPackPriceId,
} from './lib/paddle/env'
import type { CheckoutLaunchResult } from './lib/paddle/env'

// Still referenced from the `paymentSetupNotice` modal below. The
// legacy home page no longer needs it (it owns its own copy).
const paymentContactEmail =
  import.meta.env.VITE_HUMAN_RESTORE_CONTACT_EMAIL ||
  import.meta.env.VITE_SUPPORT_EMAIL ||
  'hello@artgen.site'

function App() {
  const [file, setFile] = useState<File>()
  const [, setStateLanguageTag] = useState<'en' | 'zh'>('en')
  const [localRepairUsage, setLocalRepairUsage] = useState(() =>
    readLocalRepairUsage()
  )

  const [showHumanRestoreCheckout, setShowHumanRestoreCheckout] =
    useState(false)
  const [showLocalRepairLimitModal, setShowLocalRepairLimitModal] =
    useState(false)
  const [paymentSetupNotice, setPaymentSetupNotice] = useState<
    'human-restore' | 'local-pack' | null
  >(null)

  const [downloadProgress, setDownloadProgress] = useState(100)
  const [localPackCheckoutError, setLocalPackCheckoutError] = useState('')
  const [localPackCheckoutStatus, setLocalPackCheckoutStatus] = useState<
    'idle' | 'opening' | 'success' | 'error'
  >('idle')
  const [checkoutLaunchError, setCheckoutLaunchError] = useState('')
  const [checkoutLaunchStatus, setCheckoutLaunchStatus] = useState<
    'idle' | 'loading' | 'error'
  >('idle')
  const [browserCheckoutContext] = useState(() =>
    readHumanRestoreCheckoutContext()
  )

  const {
    currentPath,
    currentSearchParams,
    defaultCheckoutEmail,
    isAdminReviewPage,
    isHumanRestoreSecureUploadPage,
    isHumanRestoreSuccessPage,
    isLegalRoute,
    isNewLandingEnabled,
    isRetoucherPortalPage,
    queryCheckoutRef,
    queryOrderId,
    secureUploadToken,
  } = useCurrentView()
  const localHumanRestoreOrderId = looksLikeUuid(queryOrderId)
    ? queryOrderId
    : browserCheckoutContext.pendingOrderId || ''
  const localHumanRestoreCheckoutRef =
    queryCheckoutRef || browserCheckoutContext.pendingCheckoutRef || ''
  const hasLocalHumanRestoreOrder = Boolean(localHumanRestoreOrderId)
  const freeLocalRepairsRemaining =
    getFreeLocalRepairsRemaining(localRepairUsage)
  const paidLocalRepairCreditsRemaining = localRepairUsage.paidCredits
  const canStartLocalRepair =
    freeLocalRepairsRemaining > 0 || paidLocalRepairCreditsRemaining > 0
  const {
    ensurePaddleReady,
    isHumanRestorePaymentReady,
    isLocalPackPaymentReady,
    isPaddleClientReady,
  } = usePaddle({
    onLocalPackCheckoutCompleted: ({ nextUsage }) => {
      setLocalRepairUsage(nextUsage)
      setLocalPackCheckoutStatus('success')
      setLocalPackCheckoutError('')
      setShowLocalRepairLimitModal(false)
      window.setTimeout(() => {
        document
          .getElementById('local-repair-start')
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 250)
    },
  })

  const maskedCheckoutEmail = maskEmailAddress(
    defaultCheckoutEmail || browserCheckoutContext.storedCheckoutEmail
  )
  const directAccessOrderId = hasLocalHumanRestoreOrder
    ? ''
    : queryOrderId || browserCheckoutContext.storedOrderId
  const directAccessOrderIdentifier =
    currentSearchParams.get('order_identifier') ||
    currentSearchParams.get('orderIdentifier') ||
    ''
  const directAccessCheckoutRef =
    (hasLocalHumanRestoreOrder ? '' : queryCheckoutRef) ||
    (isHumanRestoreSuccessPage
      ? browserCheckoutContext.pendingCheckoutRef || ''
      : '')
  const directAccessCheckoutStartedAt = isHumanRestoreSuccessPage
    ? browserCheckoutContext.pendingCheckoutStartedAt || ''
    : ''
  const effectiveCheckoutEmail =
    defaultCheckoutEmail || browserCheckoutContext.storedCheckoutEmail
  const defaultOrderReference =
    currentSearchParams.get('order_id') ||
    browserCheckoutContext.storedOrderId ||
    currentSearchParams.get('order_identifier') ||
    currentSearchParams.get('order') ||
    currentSearchParams.get('checkout_id') ||
    directAccessCheckoutRef ||
    ''

  let mainView:
    | 'admin'
    | 'editor'
    | 'retoucher'
    | 'success'
    | 'secure-upload'
    | 'legal'
    | 'home' = 'home'

  if (file) {
    mainView = 'editor'
  } else if (isRetoucherPortalPage) {
    mainView = 'retoucher'
  } else if (isAdminReviewPage) {
    mainView = 'admin'
  } else if (isHumanRestoreSecureUploadPage) {
    mainView = 'secure-upload'
  } else if (isHumanRestoreSuccessPage) {
    mainView = 'success'
  } else if (isLegalRoute) {
    mainView = 'legal'
  }

  usePageSeo({
    isAdminReviewPage,
    isHumanRestoreSecureUploadPage,
    isHumanRestoreSuccessPage,
    isRetoucherPortalPage,
  })

  useEffect(() => {
    const unsubscribe = onSetLanguageTag(() =>
      setStateLanguageTag(languageTag())
    )
    let pageViewEvent = 'visit_home'

    if (isHumanRestoreSecureUploadPage) {
      pageViewEvent = 'view_human_restore_secure_upload'
    } else if (isHumanRestoreSuccessPage) {
      pageViewEvent = 'view_human_restore_success'
    } else if (isAdminReviewPage) {
      pageViewEvent = 'view_admin_review'
    } else if (isRetoucherPortalPage) {
      pageViewEvent = 'view_retoucher_portal'
    }

    trackProductEvent(pageViewEvent)

    return () => {
      unsubscribe()
    }
  }, [
    isAdminReviewPage,
    isHumanRestoreSecureUploadPage,
    isHumanRestoreSuccessPage,
    isRetoucherPortalPage,
  ])

  useEffect(() => {
    function handleStorageChange(event: StorageEvent) {
      // Cross-tab sync: when another tab spends or grants a credit it
      // writes to the same localStorage key, firing `storage` here so
      // this tab's UI stays consistent without a reload.
      if (event.key === localRepairUsageStorageKey) {
        setLocalRepairUsage(readLocalRepairUsage())
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => {
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [])

  const {
    directUploadStatus,
    directUploadToken,
    directUploadUrl,
    humanRestoreOrder,
    humanRestoreOrderError,
    humanRestoreOrderStatus,
    inlineSecureOrder,
    inlineSecureOrderStatus,
  } = useHumanRestoreOrder({
    browserCheckoutContextHasPendingCheckout:
      browserCheckoutContext.hasPendingCheckout,
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
  })

  const isDirectUploadReady =
    directUploadStatus === 'ready' && Boolean(directUploadUrl)
  const isDirectUploadPreparing = directUploadStatus === 'loading'
  const isInlineSecureUploadReady =
    inlineSecureOrderStatus === 'ready' && Boolean(inlineSecureOrder)
  const isInlineUploadPreparing =
    isDirectUploadPreparing ||
    (isDirectUploadReady && inlineSecureOrderStatus === 'loading')
  const shouldAutoFallbackToBackupForm =
    directUploadStatus === 'unavailable' || inlineSecureOrderStatus === 'error'

  let successHeroTitle = 'Payment confirmed. Upload your photo to start.'
  let successHeroDescription = maskedCheckoutEmail
    ? `Your restoration specialist is ready. Upload one best source photo now, and keep the secure email sent to ${maskedCheckoutEmail} as backup access.`
    : 'Your restoration specialist is ready. Upload one best source photo now, and keep the secure email as backup access.'

  if (isInlineSecureUploadReady) {
    successHeroTitle = 'Payment confirmed. Upload your photo to start.'
    successHeroDescription = maskedCheckoutEmail
      ? `This page is already linked to your paid order. Upload one source photo now; the secure email sent to ${maskedCheckoutEmail} is only your backup.`
      : 'This page is already linked to your paid order. Upload one source photo now; the secure email is only your backup.'
  } else if (isInlineUploadPreparing) {
    successHeroTitle = 'Payment confirmed. Preparing your secure upload.'
    successHeroDescription = maskedCheckoutEmail
      ? `We are verifying this checkout and preparing the upload form on this page. The secure link in ${maskedCheckoutEmail} is only your backup.`
      : 'We are verifying this checkout and preparing the upload form on this page. The secure link in your checkout email is only your backup.'
  } else if (shouldAutoFallbackToBackupForm) {
    successHeroTitle = 'Payment confirmed. Use backup upload to start.'
    successHeroDescription = maskedCheckoutEmail
      ? `We could not attach direct upload automatically, so the page switched to a backup upload form. Do not pay again. The secure link sent to ${maskedCheckoutEmail} is also available if you leave this page.`
      : 'We could not attach direct upload automatically, so the page switched to a backup upload form. Do not pay again. The secure email link is also available if you leave this page.'
  }

  function scrollToLocalRepairStart() {
    document
      .getElementById('local-repair-start')
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  async function handleLaunchLocalPackCheckout() {
    setLocalPackCheckoutError('')
    setLocalPackCheckoutStatus('opening')

    if (!isLocalPackPaymentReady) {
      setLocalPackCheckoutStatus('error')
      setLocalPackCheckoutError(
        'Local Pack payment is being activated. Secure checkout will open here after payment onboarding is approved.'
      )
      setShowLocalRepairLimitModal(false)
      setPaymentSetupNotice('local-pack')
      trackProductEvent('click_local_pack_checkout', {
        destination: 'missing_price_id',
      })
      return
    }

    if (!(await ensurePaddleReady())) {
      setLocalPackCheckoutStatus('error')
      setLocalPackCheckoutError(
        'Secure checkout could not load in this browser. Please refresh, disable checkout-blocking extensions, and try again.'
      )
      trackProductEvent('click_local_pack_checkout', {
        destination: 'paddle_unavailable',
      })
      return
    }

    rememberPendingLocalRepairPackCheckout()
    trackProductEvent('click_local_pack_checkout', {
      credits: localRepairPackCredits,
      destination: 'paddle_overlay',
    })
    window.Paddle?.Checkout.open({
      items: [{ priceId: paddleLocalPackPriceId, quantity: 1 }],
      customData: {
        memoryfix_plan: 'local_repair_pack',
        memoryfix_credits: String(localRepairPackCredits),
      },
      settings: {
        displayMode: 'overlay',
        theme: 'light',
      },
    })
    setLocalPackCheckoutStatus('idle')
  }

  function handlePricingPlanAction(planKind: PricingPlanKind) {
    if (planKind === 'free-local') {
      scrollToLocalRepairStart()
      return
    }

    if (planKind === 'local-pack') {
      handleLaunchLocalPackCheckout()
      return
    }

    handleLaunchHumanRestoreCheckout()
  }

  function getPricingPlanActionLabel(planKind: PricingPlanKind) {
    if (planKind === 'free-local') {
      return 'Start free local repair'
    }

    if (planKind === 'local-pack') {
      return isLocalPackPaymentReady
        ? `Buy ${localRepairPackCredits} local repairs`
        : 'Payment coming soon'
    }

    return isHumanRestorePaymentReady
      ? 'Start Human Restore'
      : 'Request Human Restore'
  }

  function handleLaunchHumanRestoreCheckout() {
    clearPendingLocalRepairPackCheckout()
    setCheckoutLaunchError('')
    setCheckoutLaunchStatus('idle')

    if (!isHumanRestorePaymentReady) {
      setCheckoutLaunchStatus('error')
      setCheckoutLaunchError(
        'Human Restore checkout is being activated. Free local repair is ready now; paid restore will open after payment approval.'
      )
      setShowLocalRepairLimitModal(false)
      setPaymentSetupNotice('human-restore')
      trackProductEvent('click_human_restore', {
        destination: 'paddle_onboarding_pending',
      })
      return
    }

    setShowHumanRestoreCheckout(true)
  }

  async function handleHumanRestoreCheckoutCreated(payload: {
    checkoutRef: string
    orderId: string
  }): Promise<CheckoutLaunchResult> {
    const { checkoutRef, orderId } = payload

    if (!paddleHumanRestorePriceId) {
      const errorMessage = 'Secure checkout is not configured.'
      setCheckoutLaunchStatus('error')
      setCheckoutLaunchError(errorMessage)
      return { error: errorMessage, ok: false }
    }

    rememberHumanRestorePendingCheckout({ checkoutRef, orderId })
    setCheckoutLaunchStatus('loading')

    const successUrl = new URL(humanRestoreSuccessPath, window.location.origin)
    successUrl.searchParams.set('order_id', orderId)
    successUrl.searchParams.set('checkout_ref', checkoutRef)

    const paddleReady = await ensurePaddleReady()

    if (paddleReady && window.Paddle?.Checkout?.open) {
      trackProductEvent('click_human_restore', {
        checkout_ref_created: Boolean(checkoutRef),
        destination: 'paddle_overlay',
        local_order_created: Boolean(orderId),
      })

      try {
        window.Paddle.Checkout.open({
          items: [{ priceId: paddleHumanRestorePriceId, quantity: 1 }],
          customData: {
            checkout_ref: checkoutRef,
            flow: 'human_restore_preupload',
            human_restore_order_id: orderId,
          },
          settings: {
            displayMode: 'overlay',
            theme: 'light',
          },
        })
        setCheckoutLaunchStatus('idle')
        setCheckoutLaunchError('')
        return { ok: true }
      } catch {
        // overlay failed, fall through to hosted checkout
      }
    }

    trackProductEvent('click_human_restore', {
      checkout_ref_created: Boolean(checkoutRef),
      destination: 'paddle_hosted_fallback',
      local_order_created: Boolean(orderId),
    })

    try {
      const fallbackResponse = await fetch('/api/paddle-create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkoutRef,
          orderId,
          priceId: paddleHumanRestorePriceId,
          successUrl: successUrl.toString(),
        }),
      })
      const fallbackBody = (await fallbackResponse
        .json()
        .catch(() => null)) as {
        checkoutUrl?: string
        error?: string
      } | null

      if (fallbackResponse.ok && fallbackBody?.checkoutUrl) {
        const checkoutWindow = window.open(fallbackBody.checkoutUrl, '_blank')

        if (checkoutWindow) {
          setCheckoutLaunchStatus('idle')
          setCheckoutLaunchError('')
          return { ok: true }
        }

        setCheckoutLaunchStatus('idle')
        setCheckoutLaunchError(
          'Popup was blocked. Please allow popups for this site, then click Pay securely again.'
        )
        return { ok: false }
      }

      throw new Error(
        fallbackBody?.error || 'Could not create checkout session.'
      )
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Checkout could not open. Please retry.'

      setCheckoutLaunchStatus('error')
      setCheckoutLaunchError(
        `${errorMessage} Your photo is already saved, so you can retry without uploading again.`
      )
      return {
        error: `${errorMessage} Your photo is already saved.`,
        ok: false,
      }
    }
  }

  useEffect(() => {
    let isActive = true

    if (!file) {
      setDownloadProgress(100)
      return () => {
        isActive = false
      }
    }

    modelExists('inpaint')
      .then(exists => {
        trackProductEvent(
          exists ? 'model_cache_hit' : 'model_download_started',
          {
            model: 'inpaint',
          }
        )
      })
      .catch(() => {
        trackProductEvent('model_download_started', {
          model: 'inpaint',
        })
      })

    downloadModel('inpaint', progress => {
      if (isActive) {
        setDownloadProgress(progress)
      }
    })
      .then(() => {
        trackProductEvent('model_download_completed', {
          model: 'inpaint',
        })
      })
      .catch(() => {
        trackProductEvent('model_download_failed', {
          model: 'inpaint',
        })
        if (isActive) {
          setDownloadProgress(100)
        }
      })

    return () => {
      isActive = false
    }
  }, [file])

  async function startWithDemoImage(path: string) {
    const imgBlob = await fetch(path).then(r => r.blob())
    const filename = path.split('/').pop() ?? 'old-photo-sample.jpg'
    trackProductEvent('click_sample_photo', {
      sample: filename,
    })
    setFile(new File([imgBlob], filename, { type: imgBlob.type }))
  }

  async function handleFileSelection(nextFile: File) {
    const currentLocalRepairUsage = readLocalRepairUsage()
    const hasFreeStarts =
      getFreeLocalRepairsRemaining(currentLocalRepairUsage) > 0
    const hasPaidCredits = currentLocalRepairUsage.paidCredits > 0

    if (!hasFreeStarts && !hasPaidCredits) {
      setLocalRepairUsage(currentLocalRepairUsage)
      setShowLocalRepairLimitModal(true)
      setLocalPackCheckoutStatus('idle')
      trackProductEvent('local_repair_limit_reached', {
        free_limit: freeLocalRepairLimit,
        paid_credits_remaining: currentLocalRepairUsage.paidCredits,
        total_started: currentLocalRepairUsage.totalStarted,
      })
      return
    }

    const { file: resizedFile } = await resizeImageFile(nextFile, 1024 * 4)
    const localRepairAccess = consumeLocalRepairCredit()

    setLocalRepairUsage(localRepairAccess.usage)

    if (!localRepairAccess.allowed) {
      setShowLocalRepairLimitModal(true)
      setLocalPackCheckoutStatus('idle')
      trackProductEvent('local_repair_limit_reached', {
        free_limit: freeLocalRepairLimit,
        paid_credits_remaining: localRepairAccess.usage.paidCredits,
        total_started: localRepairAccess.usage.totalStarted,
      })
      return
    }

    trackProductEvent('upload_photo', {
      local_repair_access: localRepairAccess.source,
      paid_credits_remaining: localRepairAccess.usage.paidCredits,
      size_bucket: resizedFile.size > 2 * 1024 * 1024 ? 'large' : 'small',
    })
    setFile(resizedFile)
  }

  return (
    <AppShell
      hasActiveFile={Boolean(file)}
      isAdminReviewPage={isAdminReviewPage}
      isHumanRestoreSecureUploadPage={isHumanRestoreSecureUploadPage}
      isHumanRestoreSuccessPage={isHumanRestoreSuccessPage}
      isLegalRoute={isLegalRoute}
      isRetoucherPortalPage={isRetoucherPortalPage}
      onStartNew={() => setFile(undefined)}
      variant={
        isNewLandingEnabled && mainView === 'home' ? 'landing' : 'legacy'
      }
    >
      <main
        style={file ? { height: 'calc(100vh - 72px)' } : undefined}
        className={file ? 'relative' : 'relative'}
      >
        {mainView === 'editor' && file && <Editor file={file} />}
        {mainView === 'admin' && <AdminReviewPage />}
        {mainView === 'retoucher' && <RetoucherPortal />}
        {mainView === 'legal' && <LegalPage path={currentPath} />}
        {mainView === 'secure-upload' && isNewLandingEnabled && (
          <SecureUploadPage token={secureUploadToken} />
        )}
        {mainView === 'secure-upload' && !isNewLandingEnabled && (
          <SecureHumanRestoreUploadPage token={secureUploadToken} />
        )}
        {mainView === 'success' &&
          isNewLandingEnabled &&
          hasLocalHumanRestoreOrder && (
            <SuccessPage
              errorMessage={humanRestoreOrderError}
              order={humanRestoreOrder}
              status={humanRestoreOrderStatus}
            />
          )}
        {mainView === 'success' &&
          !isNewLandingEnabled &&
          (hasLocalHumanRestoreOrder ? (
            <HumanRestoreSuccessStatusPage
              errorMessage={humanRestoreOrderError}
              order={humanRestoreOrder}
              status={humanRestoreOrderStatus}
            />
          ) : (
            <div className="mx-auto flex max-w-7xl flex-col px-4 py-8 md:px-8 md:py-10">
              <section className="grid gap-6 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
                <div className="relative overflow-hidden rounded-[2rem] bg-[#211915] p-8 text-white shadow-2xl shadow-[#211915]/20 md:p-10">
                  <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-[#f3c16f]/20 blur-3xl" />
                  <div className="absolute -bottom-20 left-10 h-52 w-52 rounded-full bg-[#8a4f1d]/20 blur-3xl" />
                  <div className="relative">
                    <div className="mb-6 inline-flex rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-[#f3c16f]">
                      Human-reviewed restoration
                    </div>
                    <h1 className="max-w-3xl text-4xl font-black tracking-tight sm:text-6xl">
                      {successHeroTitle}
                    </h1>
                    <p className="mt-5 max-w-2xl text-base leading-8 text-[#f7eadb] md:text-lg">
                      {successHeroDescription}
                    </p>

                    <div className="mt-7 grid gap-3">
                      {humanRestorePostPaymentSteps.map((step, index) => (
                        <div
                          key={step.label}
                          className="grid grid-cols-[2.5rem_1fr] gap-4 rounded-[1.25rem] border border-white/10 bg-white/[0.07] p-4"
                        >
                          <div
                            className={
                              index < 2
                                ? 'flex h-10 w-10 items-center justify-center rounded-full bg-[#f3c16f] text-sm font-black text-[#211915]'
                                : 'flex h-10 w-10 items-center justify-center rounded-full border border-white/20 text-sm font-black text-[#f6eadb]'
                            }
                          >
                            {index + 1}
                          </div>
                          <div>
                            <p className="text-sm font-black text-white">
                              {step.title}
                            </p>
                            <p className="mt-1 text-xs leading-5 text-[#e8d6c3]">
                              {step.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-7 flex flex-wrap gap-2">
                      <div className="rounded-full border border-[#b8d99f]/30 bg-[#f4ffe8] px-4 py-2 text-xs font-black text-[#355322]">
                        Paid order confirmed
                      </div>
                      {maskedCheckoutEmail && (
                        <div className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold text-[#f6eadb]">
                          {maskedCheckoutEmail}
                        </div>
                      )}
                      {defaultOrderReference && (
                        <div className="max-w-full truncate rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold text-[#f6eadb]">
                          Order linked
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div id="direct-upload-form" className="scroll-mt-28">
                  {(directUploadStatus === 'idle' ||
                    isInlineUploadPreparing) && (
                    <section className="rounded-[2rem] border border-[#e1c8a8] bg-white p-6 shadow-2xl shadow-[#8a4f1d]/15 md:p-8">
                      <p className="text-sm font-black uppercase tracking-[0.24em] text-[#9b6b3c]">
                        Preparing upload
                      </p>
                      <h2 className="mt-3 text-3xl font-black tracking-tight text-[#211915]">
                        We are linking this page to your paid order.
                      </h2>
                      <p className="mt-4 leading-7 text-[#66574d]">
                        This usually takes a few seconds. If the direct upload
                        cannot be attached, the page will switch to the backup
                        upload form automatically. Do not pay again.
                      </p>
                      <div className="mt-6 grid gap-3">
                        <div className="h-3 overflow-hidden rounded-full bg-[#f2dfc3]">
                          <div className="h-full w-2/3 rounded-full bg-[#211915]" />
                        </div>
                        <p className="text-sm font-bold text-[#5b4a40]">
                          Verifying checkout and preparing your secure upload
                          card...
                        </p>
                      </div>
                    </section>
                  )}

                  {isInlineSecureUploadReady && inlineSecureOrder && (
                    <HumanRestoreUploadForm
                      defaultEmail=""
                      defaultOrderReference=""
                      presentation="task-card"
                      secureOrderSummary={{
                        checkoutEmailMasked:
                          inlineSecureOrder.checkoutEmailMasked,
                        orderNumber: inlineSecureOrder.orderNumber,
                        productName: inlineSecureOrder.productName,
                      }}
                      secureUploadToken={directUploadToken}
                    />
                  )}

                  {shouldAutoFallbackToBackupForm &&
                    !isInlineUploadPreparing && (
                      <HumanRestoreUploadForm
                        defaultEmail={defaultCheckoutEmail}
                        defaultOrderReference={defaultOrderReference}
                        presentation="task-card"
                      />
                    )}
                </div>
              </section>

              <section className="mt-6 grid gap-4 md:grid-cols-3">
                {humanRestoreServiceHighlights.map(card => (
                  <article
                    key={card.title}
                    className="rounded-[1.5rem] border border-[#e6d2b7] bg-white/85 p-6 shadow-lg shadow-[#8a4f1d]/5"
                  >
                    <h2 className="text-lg font-black text-[#211915]">
                      {card.title}
                    </h2>
                    <p className="mt-3 text-sm leading-6 text-[#66574d]">
                      {card.description}
                    </p>
                  </article>
                ))}
              </section>

              <section className="mt-6 grid gap-4 rounded-[2rem] border border-[#e6d2b7] bg-white/80 p-6 shadow-xl shadow-[#8a4f1d]/10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center md:p-8">
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.18em] text-[#9b6b3c]">
                    Need to come back later?
                  </p>
                  <p className="mt-3 max-w-3xl text-sm leading-7 text-[#66574d]">
                    {maskedCheckoutEmail
                      ? `The secure backup link is also waiting in ${maskedCheckoutEmail}. Do not pay again if direct upload is temporarily unavailable here.`
                      : 'The same secure upload link is also in your checkout email as backup access. Do not pay again if direct upload is temporarily unavailable here.'}
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  {humanRestoreTrustNotes.map(note => (
                    <article
                      key={note.title}
                      className="rounded-[1.25rem] border border-[#e6d2b7] bg-[#fffaf3] p-4 text-sm leading-6 text-[#66574d]"
                    >
                      <h2 className="font-black text-[#211915]">
                        {note.title}
                      </h2>
                      <p className="mt-2">{note.description}</p>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          ))}
        {mainView === 'home' && isNewLandingEnabled && (
          <LandingPage
            isHumanRestorePaymentReady={isHumanRestorePaymentReady}
            onFileSelection={handleFileSelection}
            onLaunchPaidCheckout={handleLaunchHumanRestoreCheckout}
          />
        )}
        {mainView === 'home' && !isNewLandingEnabled && (
          <LegacyHomePage
            canStartLocalRepair={canStartLocalRepair}
            checkoutLaunchError={checkoutLaunchError}
            checkoutLaunchStatus={checkoutLaunchStatus}
            freeLocalRepairsRemaining={freeLocalRepairsRemaining}
            getPricingPlanActionLabel={getPricingPlanActionLabel}
            isHumanRestorePaymentReady={isHumanRestorePaymentReady}
            localPackCheckoutError={localPackCheckoutError}
            localPackCheckoutStatus={localPackCheckoutStatus}
            onFileSelection={handleFileSelection}
            onLaunchHumanRestoreCheckout={handleLaunchHumanRestoreCheckout}
            onLaunchLocalPackCheckout={handleLaunchLocalPackCheckout}
            onPricingPlanAction={handlePricingPlanAction}
            onScrollToLocalRepair={scrollToLocalRepairStart}
            onStartDemoImage={startWithDemoImage}
            paidLocalRepairCreditsRemaining={paidLocalRepairCreditsRemaining}
          />
        )}
      </main>

      {paymentSetupNotice && (
        <Modal>
          <div className="max-w-3xl rounded-[2rem] bg-[#fffaf3] p-8 text-[#211915] shadow-2xl shadow-[#211915]/20">
            <p className="text-sm font-black uppercase tracking-[0.22em] text-[#9b6b3c]">
              Secure payment setup
            </p>
            <h2 className="mt-3 text-4xl font-black">
              Paid checkout is being activated.
            </h2>
            <p className="mt-5 text-lg leading-8 text-[#66574d]">
              Payment onboarding is in progress, so this paid option is reserved
              but not yet open for live customers. You can use the free local
              repair now; paid checkout will open here as soon as the payment
              provider is approved.
            </p>
            <div className="mt-6 rounded-[1.5rem] border border-[#e6d2b7] bg-white px-5 py-4 text-sm leading-6 text-[#66574d]">
              {paymentSetupNotice === 'human-restore'
                ? `For an early manual Human Restore request, contact ${paymentContactEmail}.`
                : `For early access to Local Pack credits, contact ${paymentContactEmail}.`}
            </div>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  setPaymentSetupNotice(null)
                  scrollToLocalRepairStart()
                }}
                className="rounded-full bg-[#211915] px-6 py-3 text-sm font-black text-white transition hover:bg-[#3a2820]"
              >
                Start free local repair
              </button>
              <a
                href={`mailto:${paymentContactEmail}`}
                className="rounded-full border border-[#d7b98c] bg-white px-6 py-3 text-center text-sm font-black text-[#211915] transition hover:bg-[#fffaf3]"
              >
                Contact for early access
              </a>
              <button
                type="button"
                onClick={() => setPaymentSetupNotice(null)}
                className="rounded-full border border-[#d7b98c] bg-[#fffaf3] px-6 py-3 text-sm font-black text-[#211915] transition hover:bg-white"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
      {showLocalRepairLimitModal && (
        <Modal>
          <div className="max-w-3xl rounded-[2rem] bg-[#fffaf3] p-8 text-[#211915] shadow-2xl shadow-[#211915]/20">
            <p className="text-sm font-black uppercase tracking-[0.22em] text-[#9b6b3c]">
              Local repair limit reached
            </p>
            <h2 className="mt-3 text-4xl font-black">
              You used your {freeLocalRepairLimit} free local repairs.
            </h2>
            <p className="mt-5 text-lg leading-8 text-[#66574d]">
              Continue privately in this browser with {localRepairPackCredits}{' '}
              more local repair credits, or choose Human-assisted Restore for
              one important photo that needs cloud AI plus human review.
            </p>
            <div className="mt-7 grid gap-4 md:grid-cols-2">
              <button
                type="button"
                onClick={handleLaunchLocalPackCheckout}
                disabled={localPackCheckoutStatus === 'opening'}
                className="rounded-[1.5rem] bg-[#211915] px-6 py-5 text-left text-white shadow-xl shadow-[#211915]/20 transition hover:-translate-y-1 hover:bg-[#3a2820] disabled:cursor-wait disabled:opacity-70"
              >
                <span className="block text-sm font-black uppercase tracking-[0.18em] text-[#f3c16f]">
                  Most private
                </span>
                <span className="mt-2 block text-2xl font-black">
                  {localPackCheckoutStatus === 'opening'
                    ? 'Opening checkout...'
                    : `Buy ${localRepairPackCredits} local repairs`}
                </span>
                <span className="mt-2 block text-sm leading-6 text-[#e8dfd5]">
                  {localRepairPackPrice}. Photos still stay on your device.
                </span>
              </button>
              <button
                type="button"
                onClick={handleLaunchHumanRestoreCheckout}
                className="rounded-[1.5rem] border border-[#d7b98c] bg-white px-6 py-5 text-left text-[#211915] shadow-lg transition hover:-translate-y-1 hover:bg-[#fffaf3]"
              >
                <span className="block text-sm font-black uppercase tracking-[0.18em] text-[#9b6b3c]">
                  Best result
                </span>
                <span className="mt-2 block text-2xl font-black">
                  Human Restore
                </span>
                <span className="mt-2 block text-sm leading-6 text-[#66574d]">
                  {humanRestorePrice}/photo. Cloud AI draft plus human review.
                </span>
              </button>
            </div>
            {localPackCheckoutStatus === 'error' && (
              <div className="mt-5 rounded-2xl border border-[#f0b5a9] bg-[#fff1ed] px-4 py-3 text-sm leading-6 text-[#8a2f1d]">
                <p className="font-black">Local Pack checkout unavailable</p>
                <p className="mt-1">{localPackCheckoutError}</p>
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowLocalRepairLimitModal(false)}
              className="mt-6 rounded-full border border-[#d7b98c] bg-white px-6 py-3 text-sm font-black text-[#211915] transition hover:bg-[#fffaf3]"
            >
              Not now
            </button>
          </div>
        </Modal>
      )}
      {showHumanRestoreCheckout && (
        <Modal>
          {isNewLandingEnabled ? (
            <CheckoutForm
              onCancel={() => {
                setShowHumanRestoreCheckout(false)
              }}
              onCheckoutCreated={handleHumanRestoreCheckoutCreated}
            />
          ) : (
            <HumanRestoreCheckoutForm
              onCancel={() => {
                setShowHumanRestoreCheckout(false)
              }}
              onCheckoutCreated={handleHumanRestoreCheckoutCreated}
            />
          )}
        </Modal>
      )}
      {!(downloadProgress === 100) && (
        <Modal>
          <div className="space-y-5 text-xl">
            <p>{m.inpaint_model_download_message()}</p>
            <Progress percent={downloadProgress} />
          </div>
        </Modal>
      )}
    </AppShell>
  )
}

export default App

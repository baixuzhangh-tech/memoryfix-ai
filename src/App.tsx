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
import AiHdPreviewPage from './pages/AiHdPreviewPage'
import CaseStudiesPage from './pages/CaseStudiesPage'
import CaseStudyPage from './pages/CaseStudyPage'
import LandingPage from './pages/LandingPage'
import LegacyHomePage from './pages/LegacyHomePage'
import type { PricingPlanKind } from './pages/LegacyHomePage'
import SecureUploadPage from './pages/SecureUploadPage'
import SuccessPage from './pages/SuccessPage'
import { useCurrentView } from './hooks/useCurrentView'
import { useHumanRestoreOrder } from './hooks/useHumanRestoreOrder'
import { usePageSeo } from './hooks/usePageSeo'
import { usePayPal } from './hooks/usePayPal'
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
  aiHdPreviewPath,
  humanRestoreSecureUploadPath,
  humanRestoreSuccessPath,
} from './config/routes'
import { maskEmailAddress } from './lib/email'
import { looksLikeUuid } from './lib/uuid'
import {
  addLocalRepairPackCredits,
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
import { isPayPalConfigured } from './lib/paypal/env'
import type { CheckoutLaunchResult, HumanRestoreTier } from './lib/paypal/env'

// Still referenced from the `paymentSetupNotice` modal below. The
// legacy home page no longer needs it (it owns its own copy).
const paymentContactEmail =
  import.meta.env.VITE_HUMAN_RESTORE_CONTACT_EMAIL ||
  import.meta.env.VITE_SUPPORT_EMAIL ||
  'hello@artgen.site'

function shouldPreferHostedCheckoutRedirect() {
  if (typeof window === 'undefined') return false

  const userAgent = window.navigator.userAgent || ''
  const isMobileBrowser =
    /Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini|Windows Phone/i.test(
      userAgent
    )
  const isInAppBrowser =
    /MicroMessenger|FBAN|FBAV|Instagram|Line|wv\)|WebView/i.test(userAgent)

  return isMobileBrowser || isInAppBrowser
}

function App() {
  const [file, setFile] = useState<File>()
  const [, setStateLanguageTag] = useState<'en' | 'zh'>('en')
  const [localRepairUsage, setLocalRepairUsage] = useState(() =>
    readLocalRepairUsage()
  )

  const [showHumanRestoreCheckout, setShowHumanRestoreCheckout] =
    useState(false)
  const [pendingCheckoutTier, setPendingCheckoutTier] =
    useState<HumanRestoreTier>('ai_hd')
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
    caseStudySlug,
    currentPath,
    currentSearchParams,
    defaultCheckoutEmail,
    isAdminReviewPage,
    isAiHdPreviewPage,
    isCaseStudiesIndexPage,
    isCaseStudyPage,
    isHumanRestoreSecureUploadPage,
    isHumanRestoreSuccessPage,
    isLegalRoute,
    isNewLandingEnabled,
    isRetoucherPortalPage,
    paypalOrderToken,
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
    ensurePayPalReady,
    isHumanRestorePaymentReady,
    isLocalPackPaymentReady,
    isPayPalClientReady,
  } = usePayPal({
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
    | 'ai-hd-preview'
    | 'editor'
    | 'retoucher'
    | 'success'
    | 'secure-upload'
    | 'case-studies'
    | 'case-study'
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
  } else if (isAiHdPreviewPage) {
    mainView = 'ai-hd-preview'
  } else if (isCaseStudyPage) {
    mainView = 'case-study'
  } else if (isCaseStudiesIndexPage) {
    mainView = 'case-studies'
  } else if (isLegalRoute) {
    mainView = 'legal'
  }

  usePageSeo({
    caseStudySlug,
    isCaseStudiesIndexPage,
    isCaseStudyPage,
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
    } else if (isCaseStudyPage) {
      pageViewEvent = 'view_case_study'
    } else if (isCaseStudiesIndexPage) {
      pageViewEvent = 'view_case_studies_index'
    }

    trackProductEvent(pageViewEvent)

    return () => {
      unsubscribe()
    }
  }, [
    isAdminReviewPage,
    isCaseStudiesIndexPage,
    isCaseStudyPage,
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
    paypalOrderToken,
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

    rememberPendingLocalRepairPackCheckout()
    trackProductEvent('click_local_pack_checkout', {
      credits: localRepairPackCredits,
      destination: 'paypal_checkout',
    })

    try {
      const createRes = await fetch('/api/paypal-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', tier: 'local_repair_pack' }),
      })
      const createBody = await createRes.json().catch(() => null)

      if (!createRes.ok || !createBody?.paypalOrderId) {
        throw new Error(
          createBody?.error || 'Could not create checkout session.'
        )
      }

      if (createBody.approvalUrl) {
        window.location.assign(createBody.approvalUrl)
        return
      }

      // Fallback: render PayPal Buttons in a popup for the created order
      const paypalReady = await ensurePayPalReady()
      if (paypalReady && window.paypal?.Buttons) {
        const container = document.createElement('div')
        container.id = 'paypal-local-pack-btn'
        document.body.appendChild(container)
        window.paypal
          .Buttons({
            createOrder: async () => createBody.paypalOrderId,
            onApprove: async data => {
              const captureRes = await fetch('/api/paypal-checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'capture',
                  paypalOrderId: data.orderID,
                  tier: 'local_repair_pack',
                }),
              })
              const captureBody = await captureRes.json().catch(() => null)
              if (captureRes.ok && captureBody?.ok) {
                clearPendingLocalRepairPackCheckout()
                const nextUsage = addLocalRepairPackCredits()
                trackProductEvent('complete_local_repair_pack_checkout', {
                  added_credits: localRepairPackCredits,
                  paid_credits_remaining: nextUsage.paidCredits,
                })
                setLocalRepairUsage(nextUsage)
                setLocalPackCheckoutStatus('success')
                setLocalPackCheckoutError('')
                setShowLocalRepairLimitModal(false)
              }
              container.remove()
            },
            onCancel: () => {
              clearPendingLocalRepairPackCheckout()
              setLocalPackCheckoutStatus('idle')
              container.remove()
            },
            onError: () => {
              setLocalPackCheckoutStatus('error')
              setLocalPackCheckoutError(
                'PayPal checkout encountered an error. Please try again.'
              )
              container.remove()
            },
          })
          .render(container)
        setLocalPackCheckoutStatus('idle')
        return
      }

      throw new Error('PayPal checkout could not be initialized.')
    } catch (error) {
      clearPendingLocalRepairPackCheckout()
      setLocalPackCheckoutStatus('error')
      setLocalPackCheckoutError(
        error instanceof Error
          ? error.message
          : 'Checkout could not open. Please retry.'
      )
    }
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

    handleLaunchHumanRestoreCheckout('human')
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

  function handleLaunchHumanRestoreCheckout(tier: HumanRestoreTier = 'ai_hd') {
    clearPendingLocalRepairPackCheckout()
    setCheckoutLaunchError('')
    setCheckoutLaunchStatus('idle')
    setPendingCheckoutTier(tier)

    if (!isHumanRestorePaymentReady) {
      setCheckoutLaunchStatus('error')
      setCheckoutLaunchError(
        'Restoration checkout is being activated. Free local repair is ready now; paid restore will open after payment approval.'
      )
      setShowLocalRepairLimitModal(false)
      setPaymentSetupNotice('human-restore')
      trackProductEvent('click_human_restore', {
        destination: 'paypal_onboarding_pending',
        tier,
      })
      return
    }

    // AI HD tier follows the preview-first flow: route the buyer to
    // /ai-hd where they upload a photo, see a watermarked preview,
    // and only then unlock with PayPal. Bypass the pre-payment
    // CheckoutForm modal entirely so the two tiers feel distinct.
    if (tier === 'ai_hd') {
      trackProductEvent('click_human_restore', {
        destination: 'ai_hd_preview_page',
        tier,
      })
      window.location.assign(aiHdPreviewPath)
      return
    }

    setShowHumanRestoreCheckout(true)
  }

  /**
   * Launcher used by /ai-hd after the watermarked preview is ready.
   * Reuses the existing handleHumanRestoreCheckoutCreated path so
   * PayPal checkout / redirect fallback / analytics all stay
   * identical across tiers — the only difference is that the order
   * already exists (created by /api/ai-hd-preview), so we skip the
   * pre-payment upload step entirely.
   */
  async function handleAiHdPreviewUnlock(payload: {
    checkoutRef: string
    orderId: string
  }): Promise<{ ok: boolean; error?: string }> {
    setPendingCheckoutTier('ai_hd')

    if (!isHumanRestorePaymentReady) {
      return {
        ok: false,
        error: 'Secure checkout is being activated. Please retry in a moment.',
      }
    }

    const result = await handleHumanRestoreCheckoutCreated({
      checkoutRef: payload.checkoutRef,
      orderId: payload.orderId,
      tier: 'ai_hd',
    })

    if (!result.ok) {
      return { ok: false, error: result.error }
    }

    return { ok: true }
  }

  async function handleHumanRestoreCheckoutCreated(payload: {
    checkoutRef: string
    orderId: string
    tier?: HumanRestoreTier
  }): Promise<CheckoutLaunchResult> {
    const { checkoutRef, orderId } = payload
    const tier: HumanRestoreTier = payload.tier || pendingCheckoutTier

    if (!isPayPalConfigured()) {
      const errorMessage =
        tier === 'ai_hd'
          ? 'AI HD checkout is not configured yet.'
          : 'Human Retouch checkout is not configured yet.'
      setCheckoutLaunchStatus('error')
      setCheckoutLaunchError(errorMessage)
      return { error: errorMessage, ok: false }
    }

    rememberHumanRestorePendingCheckout({ checkoutRef, orderId })
    setCheckoutLaunchStatus('loading')

    trackProductEvent('click_human_restore', {
      checkout_ref_created: Boolean(checkoutRef),
      destination: 'paypal_checkout',
      local_order_created: Boolean(orderId),
    })

    try {
      const createRes = await fetch('/api/paypal-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', checkoutRef, orderId, tier }),
      })
      const createBody = (await createRes.json().catch(() => null)) as {
        approvalUrl?: string
        error?: string
        paypalOrderId?: string
      } | null

      if (!createRes.ok || !createBody?.paypalOrderId) {
        throw new Error(
          createBody?.error || 'Could not create checkout session.'
        )
      }

      // Store PayPal order ID for capture after redirect back
      try {
        localStorage.setItem(
          'pending_paypal_order',
          JSON.stringify({
            paypalOrderId: createBody.paypalOrderId,
            localOrderId: orderId,
            checkoutRef,
            tier,
            timestamp: Date.now(),
          })
        )
      } catch {
        // localStorage may be unavailable
      }

      if (createBody.approvalUrl) {
        setCheckoutLaunchStatus('idle')
        setCheckoutLaunchError('')
        window.location.assign(createBody.approvalUrl)
        return { ok: true }
      }

      throw new Error('PayPal did not return an approval URL.')
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

  if (mainView === 'retoucher') {
    // Render the retoucher workspace WITHOUT the public AppShell so
    // external retouchers never see the customer-facing MemoryFix AI
    // / artgen.site wordmark, the Pricing nav, or the About modal.
    // The portal is a self-contained dashboard intentionally kept
    // brand-neutral so we can hand access to contractors without
    // disclosing how we acquire customers.
    return (
      <div className="min-h-full bg-[#f4f5f7] text-[#1f1f1f]">
        <RetoucherPortal />
      </div>
    )
  }

  return (
    <AppShell
      hasActiveFile={Boolean(file)}
      isAdminReviewPage={isAdminReviewPage}
      isCaseStudyRoute={isCaseStudyPage || isCaseStudiesIndexPage}
      isHumanRestoreSecureUploadPage={isHumanRestoreSecureUploadPage}
      isHumanRestoreSuccessPage={isHumanRestoreSuccessPage}
      isLegalRoute={isLegalRoute}
      isRetoucherPortalPage={isRetoucherPortalPage}
      onStartNew={() => setFile(undefined)}
      variant={
        (isNewLandingEnabled && mainView === 'home') ||
        mainView === 'case-studies' ||
        mainView === 'case-study'
          ? 'landing'
          : 'legacy'
      }
    >
      <main
        style={file ? { height: 'calc(100vh - 72px)' } : undefined}
        className={file ? 'relative' : 'relative'}
      >
        {mainView === 'editor' && file && <Editor file={file} />}
        {mainView === 'admin' && <AdminReviewPage />}
        {mainView === 'legal' && <LegalPage path={currentPath} />}
        {mainView === 'ai-hd-preview' && (
          <AiHdPreviewPage
            isCheckoutReady={isHumanRestorePaymentReady}
            onUnlockHd={handleAiHdPreviewUnlock}
            onUpgradeToHuman={() => handleLaunchHumanRestoreCheckout('human')}
          />
        )}
        {mainView === 'case-studies' && (
          <CaseStudiesPage
            isHumanRestorePaymentReady={isHumanRestorePaymentReady}
            onPrimaryCta={handleLaunchHumanRestoreCheckout}
          />
        )}
        {mainView === 'case-study' && (
          <CaseStudyPage
            slug={caseStudySlug}
            isHumanRestorePaymentReady={isHumanRestorePaymentReady}
            onPrimaryCta={handleLaunchHumanRestoreCheckout}
          />
        )}
        {mainView === 'secure-upload' && isNewLandingEnabled && (
          <SecureUploadPage token={secureUploadToken} />
        )}
        {mainView === 'secure-upload' && !isNewLandingEnabled && (
          <SecureHumanRestoreUploadPage token={secureUploadToken} />
        )}
        {mainView === 'success' && hasLocalHumanRestoreOrder && (
          <SuccessPage
            errorMessage={humanRestoreOrderError}
            order={humanRestoreOrder}
            status={humanRestoreOrderStatus}
          />
        )}
        {mainView === 'success' &&
          !isNewLandingEnabled &&
          !hasLocalHumanRestoreOrder &&
          (false ? null : (
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
                onClick={() => handleLaunchHumanRestoreCheckout('human')}
                className="rounded-[1.5rem] border border-[#d7b98c] bg-white px-6 py-5 text-left text-[#211915] shadow-lg transition hover:-translate-y-1 hover:bg-[#fffaf3]"
              >
                <span className="block text-sm font-black uppercase tracking-[0.18em] text-[#9b6b3c]">
                  Best result
                </span>
                <span className="mt-2 block text-2xl font-black">
                  Human Retouch
                </span>
                <span className="mt-2 block text-sm leading-6 text-[#66574d]">
                  {humanRestorePrice}/photo. Face-accurate human retouching.
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
              defaultTier={pendingCheckoutTier}
              onCancel={() => {
                setShowHumanRestoreCheckout(false)
              }}
              onCheckoutCreated={handleHumanRestoreCheckoutCreated}
              onTierChange={setPendingCheckoutTier}
            />
          ) : (
            <HumanRestoreCheckoutForm
              defaultTier={pendingCheckoutTier}
              onTierChange={setPendingCheckoutTier}
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

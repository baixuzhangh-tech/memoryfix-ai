/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable jsx-a11y/control-has-associated-label */
import { ArrowLeftIcon, InformationCircleIcon } from '@heroicons/react/outline'
import { useEffect, useRef, useState } from 'react'
import { useClickAway } from 'react-use'
import AdminReviewPage from './components/AdminReviewPage'
import Button from './components/Button'
import FileSelect from './components/FileSelect'
import HumanRestoreUploadForm from './components/HumanRestoreUploadForm'
import Modal from './components/Modal'
import SecureHumanRestoreUploadPage from './components/SecureHumanRestoreUploadPage'
import Editor from './Editor'
import { resizeImageFile } from './utils'
import Progress from './components/Progress'
import { downloadModel, modelExists } from './adapters/cache'
import trackProductEvent from './analytics'
import {
  appendHumanRestoreCheckoutRef,
  clearHumanRestoreStoredCheckoutContext,
  createHumanRestoreCheckoutRef,
  readHumanRestoreCheckoutContext,
  rememberHumanRestorePendingCheckout,
} from './humanRestoreCheckoutContext'
import {
  humanRestorePostPaymentSteps,
  humanRestoreServiceHighlights,
  humanRestoreTrustNotes,
} from './humanRestoreContent'
import * as m from './paraglide/messages'
import {
  languageTag,
  onSetLanguageTag,
  setLanguageTag,
} from './paraglide/runtime'

const trustPoints = [
  'Photos stay in your browser',
  'No account required',
  'Open-source GPL-3.0 core',
  'Model files cache locally after first load',
]

const featureCards = [
  {
    title: 'Best for small damage',
    description:
      'Brush over scratches, stains, fold marks, and small missing details. This local model is helpful, but not a miracle face restorer.',
  },
  {
    title: 'Make small scans larger',
    description:
      'Use the built-in 4x upscaling workflow when a scanned family photo is too small for comfortable viewing or download.',
  },
  {
    title: 'Private by default',
    description:
      'Images are read from your device and processed in the browser. We do not upload, store, or train on your photos.',
  },
]

const pricingCards = [
  {
    name: 'Free Local',
    price: '$0',
    description: 'Private browser repair for small damage.',
    features: [
      'No upload for local repair',
      'Manual scratch and stain repair',
      'Private 4x upscaling',
    ],
  },
  {
    name: 'Family Pack',
    price: '$9',
    description:
      '10 restore credits for HD / Pro workflows. Best for trying a few important memories.',
    features: [
      '10 restore credits',
      'HD / Pro workflow access',
      'Credits do not expire',
    ],
  },
  {
    name: 'Album Pack',
    price: '$19',
    description:
      '30 restore credits for family albums. Best for scanning and restoring a small collection.',
    features: [
      '30 restore credits',
      'Batch album workflow priority',
      'Credits do not expire',
    ],
  },
]

const launchTrustCards = [
  {
    id: 'privacy-details',
    label: 'Privacy',
    title: 'Local-first by default',
    description:
      'Selected photos are processed in your browser. Model files may download from public hosts and cache locally, but your image file is not uploaded by the local repair workflow.',
  },
  {
    id: 'terms',
    label: 'Terms',
    title: 'Use photos you have the right to edit',
    description:
      'The current tool is provided as an early local repair workflow for scratches, stains, fold marks, and small damaged areas. Results vary by photo quality and damage severity.',
  },
  {
    id: 'open-source',
    label: 'Open Source',
    title: 'Built on GPL-3.0 inpaint-web',
    description:
      'MemoryFix AI is based on inpaint-web. The browser-side core should remain open source under GPL-3.0, with attribution preserved for upstream projects and models.',
  },
]

const oldPhotoSamples = [
  {
    title: 'Scratched Swedish family portrait',
    path: '/examples/old-photos/old-family-scratched-sofia-wallin.jpg',
  },
  {
    title: 'Worthington family, 1910',
    path: '/examples/old-photos/old-family-worthington-1910.png',
  },
  {
    title: 'Kaarlo Vesala family',
    path: '/examples/old-photos/old-family-kaarlo-vesala.jpg',
  },
  {
    title: 'Rawson and daughter portrait',
    path: '/examples/old-photos/old-family-rawson-daughter.jpg',
  },
  {
    title: 'Gatekeeper and family, China',
    path: '/examples/old-photos/old-family-gatekeeper-china.jpg',
  },
]

const legacyHumanRestoreUrl =
  import.meta.env.VITE_EARLY_ACCESS_URL ||
  'https://artgen.lemonsqueezy.com/checkout/buy/092746e8-e559-4bca-96d0-abe3df4df268'

const humanRestoreSecureUploadPath = '/human-restore/upload'
const humanRestoreSuccessPath = '/human-restore/success'
const adminReviewPath = '/admin/review'

const humanRestoreSteps = [
  {
    title: '1. Pay for one photo',
    description: 'Complete secure checkout for one important old photo.',
  },
]

const siteUrl = 'https://artgen.site'
const homePageTitle = 'MemoryFix AI - Private Old Photo Repair'
const homePageDescription =
  'Repair scratches and upscale old family photos privately in your browser. Advanced cloud restoration is available only as an opt-in future workflow.'
const humanRestoreSuccessTitle =
  'Thank You - MemoryFix AI Human-assisted Restore'
const humanRestoreSuccessDescription =
  'Thank you for booking MemoryFix AI Human-assisted Restore. Use the upload form on this page to send your photo and repair notes.'
const humanRestoreSecureUploadTitle =
  'Secure Upload - MemoryFix AI Human-assisted Restore'
const humanRestoreSecureUploadDescription =
  'Use your secure upload link to send the photo and notes for your paid MemoryFix AI Human-assisted Restore order.'
const adminReviewTitle = 'Admin Review - MemoryFix AI'
const adminReviewDescription =
  'Private MemoryFix AI review queue for paid Human-assisted Restore orders.'

type DirectSecureAccessResponse = {
  error?: string
  ok?: boolean
  uploadUrl?: string
}

type HumanRestoreCheckoutResponse = {
  checkoutRef?: string
  checkoutUrl?: string
  error?: string
  ok?: boolean
}

type LemonSqueezyEvent = {
  data?: Record<string, unknown>
  event: string
}

declare global {
  interface Window {
    createLemonSqueezy?: () => void
    LemonSqueezy?: {
      Setup: (options: {
        eventHandler: (event: LemonSqueezyEvent) => void
      }) => void
      Url: {
        Close?: () => void
        Open: (url: string) => void
      }
    }
  }
}

type SecureOrderResponse = {
  error?: string
  ok?: boolean
  order?: {
    checkoutEmailMasked: string
    createdAt: string
    orderId: string
    orderNumber?: string
    productName?: string
    receiptUrl?: string
    testMode?: boolean
  }
}

function maskEmailAddress(email: string) {
  const normalizedEmail = email.trim()

  if (!normalizedEmail.includes('@')) {
    return ''
  }

  const [localPart, domainPart] = normalizedEmail.split('@')

  if (!localPart || !domainPart) {
    return ''
  }

  const visibleLocalStart = localPart.slice(0, 2)
  const visibleLocalEnd = localPart.length > 4 ? localPart.slice(-1) : ''
  const hiddenLocalLength = Math.max(
    1,
    localPart.length - visibleLocalStart.length - visibleLocalEnd.length
  )
  const maskedLocalPart = `${visibleLocalStart}${'*'.repeat(
    hiddenLocalLength
  )}${visibleLocalEnd}`

  const domainSegments = domainPart.split('.')
  const domainName = domainSegments[0] || ''
  const domainSuffix = domainSegments.slice(1).join('.')
  const visibleDomainStart = domainName.slice(0, 1)
  const visibleDomainEnd = domainName.length > 2 ? domainName.slice(-1) : ''
  const hiddenDomainLength = Math.max(
    1,
    domainName.length - visibleDomainStart.length - visibleDomainEnd.length
  )
  const maskedDomainName = `${visibleDomainStart}${'*'.repeat(
    hiddenDomainLength
  )}${visibleDomainEnd}`

  return domainSuffix
    ? `${maskedLocalPart}@${maskedDomainName}.${domainSuffix}`
    : `${maskedLocalPart}@${maskedDomainName}`
}

function upsertMetaTag(
  attribute: 'name' | 'property',
  key: string,
  content: string
) {
  let metaTag = document.head.querySelector<HTMLMetaElement>(
    `meta[${attribute}="${key}"]`
  )

  if (!metaTag) {
    metaTag = document.createElement('meta')
    metaTag.setAttribute(attribute, key)
    document.head.appendChild(metaTag)
  }

  metaTag.setAttribute('content', content)
}

function upsertCanonicalLink(href: string) {
  let canonicalLink = document.head.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]'
  )

  if (!canonicalLink) {
    canonicalLink = document.createElement('link')
    canonicalLink.setAttribute('rel', 'canonical')
    document.head.appendChild(canonicalLink)
  }

  canonicalLink.setAttribute('href', href)
}

function normalizeCheckoutEmail(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function App() {
  const [file, setFile] = useState<File>()
  const [, setStateLanguageTag] = useState<'en' | 'zh'>('en')

  const [showAbout, setShowAbout] = useState(false)
  const lemonSqueezySetupRef = useRef(false)
  const modalRef = useRef(null)

  const [downloadProgress, setDownloadProgress] = useState(100)
  const [checkoutLaunchError, setCheckoutLaunchError] = useState('')
  const [checkoutLaunchStatus, setCheckoutLaunchStatus] = useState<
    'idle' | 'loading' | 'error'
  >('idle')
  const [directUploadUrl, setDirectUploadUrl] = useState('')
  const [directUploadStatus, setDirectUploadStatus] = useState<
    'idle' | 'loading' | 'ready' | 'unavailable'
  >('idle')
  const [directUploadToken, setDirectUploadToken] = useState('')
  const [inlineSecureOrderStatus, setInlineSecureOrderStatus] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle')
  const [inlineSecureOrder, setInlineSecureOrder] = useState<
    SecureOrderResponse['order'] | null
  >(null)
  const [browserCheckoutContext] = useState(() =>
    readHumanRestoreCheckoutContext()
  )

  const currentPath = window.location.pathname.replace(/\/+$/, '') || '/'
  const currentSearchParams = new URLSearchParams(window.location.search)
  const isHumanRestoreSuccessPage = currentPath === humanRestoreSuccessPath
  const isHumanRestoreSecureUploadPage =
    currentPath === humanRestoreSecureUploadPath
  const isAdminReviewPage = currentPath === adminReviewPath
  const secureUploadToken = currentSearchParams.get('token') || ''
  const defaultCheckoutEmail =
    currentSearchParams.get('checkout_email') ||
    currentSearchParams.get('customer_email') ||
    currentSearchParams.get('email') ||
    ''

  const maskedCheckoutEmail = maskEmailAddress(
    defaultCheckoutEmail || browserCheckoutContext.storedCheckoutEmail
  )
  const directAccessOrderId =
    currentSearchParams.get('order_id') || browserCheckoutContext.storedOrderId
  const directAccessOrderIdentifier =
    currentSearchParams.get('order_identifier') ||
    currentSearchParams.get('orderIdentifier') ||
    ''
  const directAccessCheckoutRef =
    currentSearchParams.get('checkout_ref') ||
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

  let mainView: 'admin' | 'editor' | 'success' | 'secure-upload' | 'home' =
    'home'

  if (file) {
    mainView = 'editor'
  } else if (isAdminReviewPage) {
    mainView = 'admin'
  } else if (isHumanRestoreSecureUploadPage) {
    mainView = 'secure-upload'
  } else if (isHumanRestoreSuccessPage) {
    mainView = 'success'
  }

  useEffect(() => {
    const isHumanRestoreOrderPage =
      isHumanRestoreSuccessPage || isHumanRestoreSecureUploadPage
    const isPrivatePage = isHumanRestoreOrderPage || isAdminReviewPage
    let pageTitle = homePageTitle
    let pageDescription = homePageDescription
    let pagePath = '/'

    if (isAdminReviewPage) {
      pageTitle = adminReviewTitle
      pageDescription = adminReviewDescription
      pagePath = adminReviewPath
    } else if (isHumanRestoreSecureUploadPage) {
      pageTitle = humanRestoreSecureUploadTitle
      pageDescription = humanRestoreSecureUploadDescription
      pagePath = humanRestoreSecureUploadPath
    } else if (isHumanRestoreSuccessPage) {
      pageTitle = humanRestoreSuccessTitle
      pageDescription = humanRestoreSuccessDescription
      pagePath = humanRestoreSuccessPath
    }

    const pageRobots = isPrivatePage ? 'noindex, nofollow' : 'index, follow'
    const pageUrl = new URL(pagePath, siteUrl).toString()

    document.title = pageTitle
    upsertCanonicalLink(pageUrl)
    upsertMetaTag('name', 'description', pageDescription)
    upsertMetaTag('name', 'robots', pageRobots)
    upsertMetaTag('property', 'og:title', pageTitle)
    upsertMetaTag('property', 'og:description', pageDescription)
    upsertMetaTag('property', 'og:type', 'website')
    upsertMetaTag('property', 'og:url', pageUrl)
    upsertMetaTag('name', 'twitter:card', 'summary_large_image')
    upsertMetaTag('name', 'twitter:title', pageTitle)
    upsertMetaTag('name', 'twitter:description', pageDescription)
    upsertMetaTag('name', 'twitter:url', pageUrl)
  }, [
    isAdminReviewPage,
    isHumanRestoreSecureUploadPage,
    isHumanRestoreSuccessPage,
  ])

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
    }

    trackProductEvent(pageViewEvent)

    return () => {
      unsubscribe()
    }
  }, [
    isAdminReviewPage,
    isHumanRestoreSecureUploadPage,
    isHumanRestoreSuccessPage,
  ])

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
      browserCheckoutContext.hasPendingCheckout

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
      browserCheckoutContext.hasPendingCheckout &&
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
    browserCheckoutContext.hasPendingCheckout,
    isHumanRestoreSuccessPage,
    secureUploadToken,
  ])

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

  function ensureLemonSqueezySetup() {
    if (typeof window.createLemonSqueezy === 'function') {
      window.createLemonSqueezy()
    }

    if (!window.LemonSqueezy?.Setup || !window.LemonSqueezy?.Url?.Open) {
      return false
    }

    if (!lemonSqueezySetupRef.current) {
      window.LemonSqueezy.Setup({
        eventHandler: event => {
          if (event.event !== 'Checkout.Success') {
            return
          }

          const orderResource = event.data as
            | Record<string, unknown>
            | undefined
          const orderAttributes =
            (orderResource?.attributes as Record<string, unknown>) || {}
          const paidOrderId = orderResource?.id ? String(orderResource.id) : ''
          const paidOrderIdentifier = orderAttributes.identifier
            ? String(orderAttributes.identifier)
            : ''
          const paidCheckoutEmail = normalizeCheckoutEmail(
            orderAttributes.user_email
          )
          const pendingCheckoutRef =
            sessionStorage.getItem('pending_checkout_ref') || ''

          try {
            localStorage.setItem(
              'ls_checkout_success',
              JSON.stringify({
                orderId: paidOrderId,
                email: paidCheckoutEmail,
                identifier: paidOrderIdentifier,
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

          if (paidOrderId) {
            successUrl.searchParams.set('order_id', paidOrderId)
          }

          if (paidOrderIdentifier) {
            successUrl.searchParams.set('order_identifier', paidOrderIdentifier)
          }

          if (paidCheckoutEmail) {
            successUrl.searchParams.set('email', paidCheckoutEmail)
          }

          if (!paidOrderId && pendingCheckoutRef) {
            successUrl.searchParams.set('checkout_ref', pendingCheckoutRef)
          }

          trackProductEvent('complete_human_restore_checkout', {
            has_checkout_email: Boolean(paidCheckoutEmail),
            has_checkout_ref: Boolean(pendingCheckoutRef),
            has_order_id: Boolean(paidOrderId),
            has_order_identifier: Boolean(paidOrderIdentifier),
          })

          window.location.href = successUrl.toString()
        },
      })
      lemonSqueezySetupRef.current = true
    }

    return true
  }

  async function handleLaunchHumanRestoreCheckout() {
    if (checkoutLaunchStatus === 'loading') {
      return
    }

    setCheckoutLaunchStatus('loading')
    setCheckoutLaunchError('')

    let checkoutUrl = ''
    let checkoutRef = ''

    try {
      const response = await fetch('/api/human-restore-checkout', {
        method: 'POST',
      })
      const responseBody = (await response
        .json()
        .catch(() => null)) as HumanRestoreCheckoutResponse | null

      if (response.ok && responseBody?.checkoutUrl) {
        checkoutUrl = responseBody.checkoutUrl
        checkoutRef = responseBody.checkoutRef || ''
      } else if (legacyHumanRestoreUrl) {
        checkoutRef = createHumanRestoreCheckoutRef()
        checkoutUrl = appendHumanRestoreCheckoutRef(
          legacyHumanRestoreUrl,
          checkoutRef
        )
      } else {
        throw new Error(
          responseBody?.error || 'Secure checkout could not be created.'
        )
      }
    } catch (error) {
      if (legacyHumanRestoreUrl) {
        checkoutRef = createHumanRestoreCheckoutRef()
        checkoutUrl = appendHumanRestoreCheckoutRef(
          legacyHumanRestoreUrl,
          checkoutRef
        )
      } else {
        setCheckoutLaunchStatus('error')
        setCheckoutLaunchError(
          error instanceof Error
            ? error.message
            : 'Secure checkout could not be created.'
        )
        return
      }
    }

    if (!checkoutUrl) {
      setCheckoutLaunchStatus('error')
      setCheckoutLaunchError('Checkout URL is not configured.')
      return
    }

    rememberHumanRestorePendingCheckout({ checkoutRef })

    if (ensureLemonSqueezySetup()) {
      trackProductEvent('click_human_restore', {
        checkout_ref_created: Boolean(checkoutRef),
        destination: 'lemonjs_overlay',
      })
      window.LemonSqueezy?.Url.Open(checkoutUrl)
      setCheckoutLaunchStatus('idle')
      return
    }

    trackProductEvent('click_human_restore', {
      checkout_ref_created: Boolean(checkoutRef),
      destination: 'direct_redirect',
    })
    window.location.assign(checkoutUrl)
  }

  useEffect(() => {
    ensureLemonSqueezySetup()
  }, [])

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

  useClickAway(modalRef, () => {
    setShowAbout(false)
  })

  async function startWithDemoImage(path: string) {
    const imgBlob = await fetch(path).then(r => r.blob())
    const filename = path.split('/').pop() ?? 'old-photo-sample.jpg'
    trackProductEvent('click_sample_photo', {
      sample: filename,
    })
    setFile(new File([imgBlob], filename, { type: imgBlob.type }))
  }

  async function handleFileSelection(nextFile: File) {
    const { file: resizedFile } = await resizeImageFile(nextFile, 1024 * 4)
    trackProductEvent('upload_photo', {
      size_bucket: resizedFile.size > 2 * 1024 * 1024 ? 'large' : 'small',
    })
    setFile(resizedFile)
  }

  return (
    <div className="min-h-full bg-[#f8f1e7] text-[#211915]">
      <header className="z-10 flex min-h-[72px] flex-row items-center justify-between border-b border-[#e6d2b7] bg-[#f8f1e7]/95 px-4 shadow-sm backdrop-blur md:px-8">
        <Button
          className={[
            file ||
            isHumanRestoreSuccessPage ||
            isHumanRestoreSecureUploadPage ||
            isAdminReviewPage
              ? ''
              : 'opacity-50 pointer-events-none',
            'pl-1 pr-1',
          ].join(' ')}
          icon={<ArrowLeftIcon className="h-6 w-6" />}
          onClick={() => {
            if (
              isHumanRestoreSuccessPage ||
              isHumanRestoreSecureUploadPage ||
              isAdminReviewPage
            ) {
              window.location.assign('/')
              return
            }

            setFile(undefined)
          }}
        >
          <div className="md:w-[180px]">
            <span className="hidden select-none sm:inline">
              {isHumanRestoreSuccessPage ||
              isHumanRestoreSecureUploadPage ||
              isAdminReviewPage
                ? 'Back home'
                : m.start_new()}
            </span>
          </div>
        </Button>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#211915] text-xl font-black text-[#f3c16f] shadow-lg shadow-[#211915]/20">
            M
          </div>
          <div>
            <div className="text-2xl font-black tracking-tight text-[#211915]">
              MemoryFix AI
            </div>
            <div className="hidden text-xs font-semibold uppercase tracking-[0.22em] text-[#9b6b3c] sm:block">
              Private old photo repair
            </div>
          </div>
        </div>
        <div className="hidden items-center justify-end gap-3 md:flex">
          {!file &&
            !isHumanRestoreSuccessPage &&
            !isHumanRestoreSecureUploadPage &&
            !isAdminReviewPage && (
              <>
                <a
                  href="#privacy"
                  className="rounded-full px-4 py-3 text-sm font-bold text-[#5b4a40] transition hover:bg-white"
                >
                  Privacy
                </a>
                <a
                  href="#pricing"
                  className="rounded-full px-4 py-3 text-sm font-bold text-[#5b4a40] transition hover:bg-white"
                >
                  Pricing
                </a>
                <a
                  href="#terms"
                  className="rounded-full px-4 py-3 text-sm font-bold text-[#5b4a40] transition hover:bg-white"
                >
                  Terms
                </a>
                <a
                  href="#open-source"
                  className="rounded-full px-4 py-3 text-sm font-bold text-[#5b4a40] transition hover:bg-white"
                >
                  Open Source
                </a>
              </>
            )}
          <Button
            className="flex"
            onClick={() => {
              if (languageTag() === 'zh') {
                setLanguageTag('en')
              } else {
                setLanguageTag('zh')
              }
            }}
          >
            <p>{languageTag() === 'en' ? '中文' : 'English'}</p>
          </Button>
          <Button
            className="flex"
            icon={<InformationCircleIcon className="h-6 w-6" />}
            onClick={() => {
              setShowAbout(true)
            }}
          >
            <p>{m.feedback()}</p>
          </Button>
        </div>
      </header>

      <main
        style={file ? { height: 'calc(100vh - 72px)' } : undefined}
        className={file ? 'relative' : 'relative'}
      >
        {mainView === 'editor' && file && <Editor file={file} />}
        {mainView === 'admin' && <AdminReviewPage />}
        {mainView === 'secure-upload' && (
          <SecureHumanRestoreUploadPage token={secureUploadToken} />
        )}
        {mainView === 'success' && (
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
                {(directUploadStatus === 'idle' || isInlineUploadPreparing) && (
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

                {shouldAutoFallbackToBackupForm && !isInlineUploadPreparing && (
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
                    <h2 className="font-black text-[#211915]">{note.title}</h2>
                    <p className="mt-2">{note.description}</p>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}
        {mainView === 'home' && (
          <div className="mx-auto flex max-w-7xl flex-col px-4 py-10 md:px-8">
            <section className="grid items-center gap-10 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:py-16">
              <div>
                <div className="mb-6 inline-flex rounded-full border border-[#d7b98c] bg-white/70 px-4 py-2 text-sm font-bold text-[#8a4f1d] shadow-sm">
                  Local scratch repair. Private upscaling. Advanced restore
                  soon.
                </div>
                <h1 className="max-w-4xl text-5xl font-black tracking-tight text-[#211915] sm:text-7xl">
                  Repair scratches and upscale old photos privately.
                </h1>
                <p className="mt-7 max-w-2xl text-lg leading-8 text-[#66574d]">
                  A local-first toolkit for family photos: fix small damaged
                  areas, enlarge old scans, and keep private memories in your
                  browser. Stronger advanced restoration is coming as an opt-in
                  Pro workflow.
                </p>
                <div className="mt-7 grid gap-3 sm:grid-cols-2">
                  {trustPoints.map(point => (
                    <div
                      key={point}
                      className="rounded-2xl border border-[#e6d2b7] bg-white/70 px-4 py-3 text-sm font-bold text-[#5b4a40]"
                    >
                      {point}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[2rem] border border-[#e6d2b7] bg-white/75 p-5 shadow-2xl shadow-[#8a4f1d]/10">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold uppercase tracking-[0.24em] text-[#9b6b3c]">
                      Start locally
                    </p>
                    <h2 className="mt-2 text-2xl font-black">
                      Try local repair first
                    </h2>
                  </div>
                  <div className="rounded-full bg-[#211915] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#f3c16f]">
                    Private
                  </div>
                </div>
                <div className="h-72">
                  <FileSelect onSelection={handleFileSelection} />
                </div>
                <p className="mt-4 text-sm leading-6 text-[#6f5e54]">
                  Your photo is read by the browser. The AI model runs locally
                  after it downloads and caches the model files.
                </p>
              </div>
            </section>

            <section className="grid gap-4 py-10 md:grid-cols-3">
              {featureCards.map(feature => (
                <div
                  key={feature.title}
                  className="rounded-[1.75rem] border border-[#e6d2b7] bg-white/70 p-6 shadow-sm"
                >
                  <h2 className="text-2xl font-black">{feature.title}</h2>
                  <p className="mt-4 leading-7 text-[#66574d]">
                    {feature.description}
                  </p>
                </div>
              ))}
            </section>

            <section
              id="privacy"
              className="my-10 rounded-[2rem] bg-[#211915] p-8 text-white shadow-2xl shadow-[#211915]/20 md:p-12"
            >
              <p className="text-sm font-bold uppercase tracking-[0.26em] text-[#f3c16f]">
                Privacy promise
              </p>
              <h2 className="mt-4 max-w-3xl text-4xl font-black sm:text-5xl">
                Your photos are processed locally. They are not uploaded.
              </h2>
              <p className="mt-5 max-w-3xl text-lg leading-8 text-[#e8dfd5]">
                MemoryFix AI uses browser-side inpainting and upscaling. The app
                downloads model files from public model hosts, then caches them
                locally for future sessions. Your selected photos stay on your
                device.
              </p>
            </section>

            <section className="my-10 grid gap-6 rounded-[2rem] border border-[#e6d2b7] bg-white/80 p-8 shadow-xl shadow-[#8a4f1d]/10 md:grid-cols-[1fr_auto] md:items-center md:p-10">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.24em] text-[#9b6b3c]">
                  Need stronger results?
                </p>
                <h2 className="mt-3 text-3xl font-black sm:text-4xl">
                  Restore one important photo with human help.
                </h2>
                <p className="mt-4 text-lg font-black text-[#211915]">
                  MemoryFix AI Human-assisted Restore - $19/photo
                </p>
                <p className="mt-4 max-w-3xl leading-7 text-[#66574d]">
                  For one important old photo that deserves extra care. Local
                  repair stays free and private. If you choose Human-assisted
                  Restore, upload happens only after explicit checkout, then we
                  combine AI base restoration with human review and manual
                  touch-up.
                </p>
                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  {humanRestoreSteps.map(step => (
                    <div
                      key={step.title}
                      className="rounded-2xl border border-[#e6d2b7] bg-[#f8f1e7] p-4"
                    >
                      <h3 className="text-sm font-black uppercase tracking-[0.14em] text-[#211915]">
                        {step.title}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-[#66574d]">
                        {step.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-col items-stretch gap-3 md:w-[260px]">
                <button
                  type="button"
                  onClick={handleLaunchHumanRestoreCheckout}
                  disabled={checkoutLaunchStatus === 'loading'}
                  className="inline-flex justify-center rounded-full bg-[#211915] px-7 py-4 text-center font-black text-white shadow-xl shadow-[#211915]/20 transition hover:-translate-y-1 hover:bg-[#3a2820]"
                >
                  {checkoutLaunchStatus === 'loading'
                    ? 'Opening secure checkout...'
                    : 'Book Human Restore'}
                </button>
                <p className="text-sm leading-6 text-[#66574d] md:text-right">
                  Important: the free local repair tool does not upload photos.
                  This paid service requires upload only after you explicitly
                  choose Human-assisted Restore.
                </p>
                {checkoutLaunchStatus === 'error' && (
                  <div className="rounded-[1.5rem] border border-[#f0b5a9] bg-[#fff1ed] px-4 py-4 text-sm leading-6 text-[#8a2f1d] md:text-right">
                    <p className="font-black">Checkout could not be opened</p>
                    <p className="mt-2">{checkoutLaunchError}</p>
                    {legacyHumanRestoreUrl && (
                      <a
                        href={legacyHumanRestoreUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => {
                          trackProductEvent('click_human_restore', {
                            destination: 'legacy_checkout_fallback',
                          })
                        }}
                        className="mt-3 inline-flex font-black text-[#8a2f1d] underline underline-offset-4"
                      >
                        Open hosted checkout directly
                      </a>
                    )}
                  </div>
                )}
              </div>
            </section>

            <section className="py-10">
              <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.24em] text-[#9b6b3c]">
                    Try sample images
                  </p>
                  <h2 className="mt-2 text-3xl font-black">
                    Test the editor before using private photos
                  </h2>
                </div>
                <p className="max-w-xl leading-7 text-[#66574d]">
                  These public-domain and CC0 examples let you test repair and
                  upscaling before using private family photos from your own
                  device.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {oldPhotoSamples.map(sample => (
                  <button
                    key={sample.path}
                    type="button"
                    className="overflow-hidden rounded-2xl border border-[#e6d2b7] bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
                    onClick={() => startWithDemoImage(sample.path)}
                  >
                    <img
                      className="h-36 w-full object-cover"
                      src={sample.path}
                      alt={sample.title}
                    />
                    <div className="p-3 text-left text-sm font-bold text-[#5b4a40]">
                      {sample.title}
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <section id="pricing" className="py-10">
              <div className="text-center">
                <p className="text-sm font-bold uppercase tracking-[0.24em] text-[#9b6b3c]">
                  Paid validation path
                </p>
                <h2 className="mt-3 text-4xl font-black sm:text-5xl">
                  Free local repair first. Credits for stronger workflows.
                </h2>
                <p className="mx-auto mt-5 max-w-2xl leading-7 text-[#66574d]">
                  Start privately in the browser. Pay only when you want HD /
                  Pro restore credits or human-assisted work for an important
                  photo.
                </p>
              </div>
              <div className="mt-8 grid gap-5 lg:grid-cols-3">
                {pricingCards.map((plan, index) => (
                  <div
                    key={plan.name}
                    className={[
                      'rounded-[2rem] border p-7 shadow-xl',
                      index === 1
                        ? 'border-[#211915] bg-[#211915] text-white shadow-[#211915]/20'
                        : 'border-[#e6d2b7] bg-white/70 text-[#211915] shadow-[#8a4f1d]/10',
                    ].join(' ')}
                  >
                    <h3 className="text-2xl font-black">{plan.name}</h3>
                    <p
                      className={[
                        'mt-3 leading-7',
                        index === 1 ? 'text-[#e8dfd5]' : 'text-[#66574d]',
                      ].join(' ')}
                    >
                      {plan.description}
                    </p>
                    <div className="mt-6 text-5xl font-black">{plan.price}</div>
                    <ul className="mt-6 space-y-3">
                      {plan.features.map(feature => (
                        <li key={feature} className="flex gap-3">
                          <span
                            className={
                              index === 1 ? 'text-[#f3c16f]' : 'text-[#9b6b3c]'
                            }
                          >
                            *
                          </span>
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>

            <section className="py-10" aria-labelledby="trust-notes-heading">
              <div className="mb-6 max-w-3xl">
                <p className="text-sm font-bold uppercase tracking-[0.24em] text-[#9b6b3c]">
                  Launch trust notes
                </p>
                <h2
                  id="trust-notes-heading"
                  className="mt-3 text-4xl font-black sm:text-5xl"
                >
                  Clear boundaries before users try private photos.
                </h2>
                <p className="mt-5 leading-7 text-[#66574d]">
                  These notes are not a replacement for lawyer-reviewed legal
                  pages, but they make the MVP honest enough for early overseas
                  validation.
                </p>
              </div>
              <div className="grid gap-5 lg:grid-cols-3">
                {launchTrustCards.map(card => (
                  <article
                    key={card.id}
                    id={card.id}
                    className="rounded-[2rem] border border-[#e6d2b7] bg-white/75 p-7 shadow-xl shadow-[#8a4f1d]/10"
                  >
                    <p className="text-sm font-black uppercase tracking-[0.22em] text-[#9b6b3c]">
                      {card.label}
                    </p>
                    <h3 className="mt-4 text-2xl font-black">{card.title}</h3>
                    <p className="mt-4 leading-7 text-[#66574d]">
                      {card.description}
                    </p>
                  </article>
                ))}
              </div>
            </section>

            <footer className="mt-10 flex flex-col gap-4 border-t border-[#e6d2b7] py-8 text-sm leading-6 text-[#66574d] md:flex-row md:items-center md:justify-between">
              <div>
                MemoryFix AI is built on the open-source{' '}
                <a
                  href="https://github.com/lxfater/inpaint-web"
                  target="_blank"
                  rel="noreferrer"
                  className="font-black text-[#211915] underline"
                >
                  inpaint-web
                </a>{' '}
                project and keeps the browser-side core under GPL-3.0.
              </div>
              <div className="flex flex-wrap gap-3 font-bold text-[#211915]">
                <a href="#privacy" className="underline">
                  Privacy
                </a>
                <a href="#terms" className="underline">
                  Terms
                </a>
                <a href="#open-source" className="underline">
                  Open Source
                </a>
              </div>
            </footer>
          </div>
        )}
      </main>

      {showAbout && (
        <Modal>
          <div ref={modalRef} className="max-w-3xl space-y-5 text-lg">
            <h2 className="text-3xl font-black">About MemoryFix AI</h2>
            <p>
              MemoryFix AI is a privacy-first old photo repair experiment built
              on the open-source inpaint-web project.
            </p>
            <p>
              The current core is browser-based: model files download from
              public hosts, then your photos are processed locally on your
              device.
            </p>
            <p>
              Source foundation:{' '}
              <a
                href="https://github.com/lxfater/inpaint-web"
                className="font-black text-[#211915] underline"
                rel="noreferrer"
                target="_blank"
              >
                inpaint-web
              </a>
            </p>
          </div>
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
    </div>
  )
}

export default App

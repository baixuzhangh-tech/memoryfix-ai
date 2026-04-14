/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable jsx-a11y/control-has-associated-label */
import { ArrowLeftIcon, InformationCircleIcon } from '@heroicons/react/outline'
import { useEffect, useRef, useState } from 'react'
import { useClickAway } from 'react-use'
import AdminReviewPage from './components/AdminReviewPage'
import RetoucherPortal from './components/RetoucherPortal'
import LegalPage, { isLegalPage } from './components/LegalPage'
import Button from './components/Button'
import FileSelect from './components/FileSelect'
import HumanRestoreCheckoutForm from './components/HumanRestoreCheckoutForm'
import HumanRestoreSuccessStatusPage from './components/HumanRestoreSuccessStatusPage'
import type { HumanRestoreLocalOrder } from './components/HumanRestoreSuccessStatusPage'
import HumanRestoreUploadForm from './components/HumanRestoreUploadForm'
import Modal from './components/Modal'
import SecureHumanRestoreUploadPage from './components/SecureHumanRestoreUploadPage'
import Editor from './Editor'
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
import * as m from './paraglide/messages'
import {
  languageTag,
  onSetLanguageTag,
  setLanguageTag,
} from './paraglide/runtime'

const trustPoints = [
  '3 free local repairs',
  'Browser-first privacy',
  'No account for local repair',
  'Human review for paid cloud restore',
]

const featureCards = [
  {
    label: 'Local repair',
    title: 'Brush away small damage',
    description:
      'Use the browser editor for scratches, stains, fold marks, and small missing details. It is fast, private, and best for light restoration.',
  },
  {
    label: 'Local upscale',
    title: 'Make small scans larger',
    description:
      'Use the built-in 4x upscaling workflow when a scanned family photo is too small for comfortable viewing or download.',
  },
  {
    label: 'Human review',
    title: 'Escalate important photos',
    description:
      'When a photo matters, choose the paid cloud workflow: AI draft first, then human review before delivery.',
  },
]

const freeLocalRepairLimit = 3
const localRepairPackCredits = 10
const localRepairPackPrice = '$9.90'
const humanRestorePrice = '$19.90'
const localRepairUsageStorageKey = 'memoryfix_local_repair_usage_v1'
const pendingLocalRepairPackCheckoutKey =
  'memoryfix_pending_local_repair_pack_checkout_v1'

type PricingPlanKind = 'free-local' | 'local-pack' | 'human-restore'

type LocalRepairUsage = {
  freeUsed: number
  paidCredits: number
  totalStarted: number
  updatedAt: number
}

const pricingCards = [
  {
    kind: 'free-local' as PricingPlanKind,
    name: 'Free Local',
    price: '$0',
    description: `Try ${freeLocalRepairLimit} private browser repairs for small damage before paying.`,
    features: [
      `${freeLocalRepairLimit} local photo starts included`,
      'Manual scratch and stain repair',
      'Private 4x upscaling',
    ],
    cta: 'Try free local repair',
    badge: 'Private trial',
  },
  {
    kind: 'local-pack' as PricingPlanKind,
    name: 'Local Pack',
    price: localRepairPackPrice,
    description: `${localRepairPackCredits} extra browser-local repair credits. Your photos still stay on your device.`,
    features: [
      `${localRepairPackCredits} local photo starts`,
      'No cloud upload for local repair',
      'Credits do not expire',
    ],
    cta: 'Buy 10 local repairs',
    badge: 'Most private',
  },
  {
    kind: 'human-restore' as PricingPlanKind,
    name: 'Human-assisted Restore',
    price: humanRestorePrice,
    description:
      'One important photo restored with a cloud AI draft plus human review before delivery.',
    features: [
      '1 cloud AI + human reviewed photo',
      'Upload only after you choose this workflow',
      'Private email delivery',
    ],
    cta: 'Start Human Restore',
    badge: 'Best result',
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

const showcaseCards = [
  {
    title: 'Scratch and stain cleanup',
    image: '/examples/old-photos/old-family-scratched-sofia-wallin.jpg',
    label: 'Try locally',
    description:
      'Best for testing brush-based repair on visible surface damage before using a private family photo.',
  },
  {
    title: 'Family album scan',
    image: '/examples/old-photos/old-family-worthington-1910.png',
    label: 'Local or Human Restore',
    description:
      'Use local repair for small marks. Use Human Restore when faces, identity, and tone need extra care.',
  },
  {
    title: 'Important portrait',
    image: '/examples/old-photos/old-family-rawson-daughter.jpg',
    label: 'Human review recommended',
    description:
      'A paid human-reviewed workflow is better when the photo has emotional value and should not look over-processed.',
  },
]

const privacyBoundaryCards = [
  {
    label: 'Free Local',
    title: 'No upload',
    description:
      'Your image is opened by the browser and processed locally. Model files may download, but the selected photo does not leave your device.',
  },
  {
    label: 'Local Pack',
    title: 'Still local',
    description:
      'Buying local credits unlocks more browser-local repair starts on this device. The privacy boundary stays the same.',
  },
  {
    label: 'Human Restore',
    title: 'Opt-in upload',
    description:
      'Only this workflow uploads one source photo after you choose the paid service and submit the photo for review.',
  },
]

const humanRestoreValueCards = [
  {
    title: 'Conservative AI draft',
    description:
      'We start with a careful cloud AI draft, aiming to restore damage without making the person look like someone else.',
  },
  {
    title: 'Human quality gate',
    description:
      'A human checks the before and after, watches for over-smoothing or identity drift, and only then prepares delivery.',
  },
  {
    title: 'Private delivery',
    description:
      'During beta, approved restores are delivered by email, normally within 48 hours for straightforward photos.',
  },
]

const useCaseCards = [
  'Grandparents and ancestor portraits',
  'Old wedding and graduation photos',
  'Scanned family album pages',
  'Immigrant family memory archives',
]

const faqCards = [
  {
    question: 'Do my photos upload during local repair?',
    answer:
      'No. The local repair workflow reads the image in your browser. Upload happens only if you choose Human Restore and submit a photo for that paid service.',
  },
  {
    question: 'Why pay for Human Restore?',
    answer:
      'The local tool is best for small damage. Human Restore is for one important photo where AI output should be reviewed before delivery.',
  },
  {
    question: 'What happens after 3 free repairs?',
    answer: `You can buy ${localRepairPackCredits} more local starts for ${localRepairPackPrice}, or use the ${humanRestorePrice} Human Restore service for one cloud AI plus human-reviewed photo.`,
  },
]

const paymentContactEmail =
  import.meta.env.VITE_HUMAN_RESTORE_CONTACT_EMAIL ||
  import.meta.env.VITE_SUPPORT_EMAIL ||
  'hello@artgen.site'
const paddleClientToken = import.meta.env.VITE_PADDLE_CLIENT_TOKEN || ''
const paddleEnvironment =
  import.meta.env.VITE_PADDLE_ENVIRONMENT || 'production'
const paddleHumanRestorePriceId =
  import.meta.env.VITE_PADDLE_HUMAN_RESTORE_PRICE_ID || ''
const paddleLocalPackPriceId =
  import.meta.env.VITE_PADDLE_LOCAL_PACK_PRICE_ID || ''
const paddleScriptUrl = 'https://cdn.paddle.com/paddle/v2/paddle.js'

function isPaddleClientTokenConfigured(value: string) {
  return value.startsWith('test_') || value.startsWith('live_')
}

function isPaddlePriceIdConfigured(value: string) {
  return /^pri_[a-zA-Z0-9]+/.test(value)
}

const humanRestoreSecureUploadPath = '/human-restore/upload'
const humanRestoreSuccessPath = '/human-restore/success'
const adminReviewPath = '/admin/review'
const retoucherPortalPath = '/retoucher'

const siteUrl = 'https://artgen.site'
const homePageTitle = 'MemoryFix AI - Private Old Photo Repair'
const homePageDescription =
  'Repair old family photos privately in your browser. Try 3 local repairs free, buy local credits, or choose AI plus human review for one important photo.'
const humanRestoreSuccessTitle =
  'Thank You - MemoryFix AI Human-assisted Restore'
const humanRestoreSuccessDescription =
  'Thank you for booking MemoryFix AI Human-assisted Restore. Track payment confirmation, AI draft, human review, and private email delivery.'
const humanRestoreSecureUploadTitle =
  'Secure Upload - MemoryFix AI Human-assisted Restore'
const humanRestoreSecureUploadDescription =
  'Use your secure upload link to send the photo and notes for your paid MemoryFix AI Human-assisted Restore order.'
const adminReviewTitle = 'Admin Review - MemoryFix AI'
const adminReviewDescription =
  'Private MemoryFix AI review queue for paid Human-assisted Restore orders.'
const retoucherPortalTitle = 'Retoucher Portal - MemoryFix AI'
const retoucherPortalDescription =
  'MemoryFix AI retoucher workspace for assigned photo restoration tasks.'

type DirectSecureAccessResponse = {
  error?: string
  ok?: boolean
  uploadUrl?: string
}

type HumanRestoreOrderResponse = {
  error?: string
  ok?: boolean
  order?: HumanRestoreLocalOrder
}

type PaddleEventData = {
  customer?: { email?: string; id?: string }
  customData?: Record<string, unknown>
  id?: string
  items?: Array<{ price?: { id?: string } }>
  status?: string
  transactionId?: string
}

type PaddleEvent = {
  data?: PaddleEventData
  name?: string
}

type CheckoutLaunchResult = {
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

function looksLikeUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  )
}

function normalizeLocalRepairUsage(
  value?: Partial<LocalRepairUsage> | null
): LocalRepairUsage {
  return {
    freeUsed: Math.max(0, Number(value?.freeUsed || 0)),
    paidCredits: Math.max(0, Number(value?.paidCredits || 0)),
    totalStarted: Math.max(0, Number(value?.totalStarted || 0)),
    updatedAt: Math.max(0, Number(value?.updatedAt || 0)),
  }
}

function readLocalRepairUsage(): LocalRepairUsage {
  if (typeof window === 'undefined') {
    return normalizeLocalRepairUsage()
  }

  try {
    const rawValue = window.localStorage.getItem(localRepairUsageStorageKey)
    return normalizeLocalRepairUsage(rawValue ? JSON.parse(rawValue) : null)
  } catch {
    return normalizeLocalRepairUsage()
  }
}

function writeLocalRepairUsage(usage: LocalRepairUsage) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(
      localRepairUsageStorageKey,
      JSON.stringify(usage)
    )
  } catch {
    // Local repair still works in private browsing, but quotas cannot persist.
  }
}

function getFreeLocalRepairsRemaining(usage: LocalRepairUsage) {
  return Math.max(0, freeLocalRepairLimit - usage.freeUsed)
}

function consumeLocalRepairCredit() {
  const currentUsage = readLocalRepairUsage()
  const freeRemaining = getFreeLocalRepairsRemaining(currentUsage)

  if (freeRemaining > 0) {
    const nextUsage = normalizeLocalRepairUsage({
      ...currentUsage,
      freeUsed: currentUsage.freeUsed + 1,
      totalStarted: currentUsage.totalStarted + 1,
      updatedAt: Date.now(),
    })
    writeLocalRepairUsage(nextUsage)
    return {
      allowed: true,
      source: 'free_local',
      usage: nextUsage,
    }
  }

  if (currentUsage.paidCredits > 0) {
    const nextUsage = normalizeLocalRepairUsage({
      ...currentUsage,
      paidCredits: currentUsage.paidCredits - 1,
      totalStarted: currentUsage.totalStarted + 1,
      updatedAt: Date.now(),
    })
    writeLocalRepairUsage(nextUsage)
    return {
      allowed: true,
      source: 'paid_local_credit',
      usage: nextUsage,
    }
  }

  return {
    allowed: false,
    source: 'limit_reached',
    usage: currentUsage,
  }
}

function addLocalRepairPackCredits() {
  const currentUsage = readLocalRepairUsage()
  const nextUsage = normalizeLocalRepairUsage({
    ...currentUsage,
    paidCredits: currentUsage.paidCredits + localRepairPackCredits,
    updatedAt: Date.now(),
  })
  writeLocalRepairUsage(nextUsage)
  return nextUsage
}

function readPendingLocalRepairPackCheckout() {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    const rawValue = window.sessionStorage.getItem(
      pendingLocalRepairPackCheckoutKey
    )
    const pendingCheckout = rawValue ? JSON.parse(rawValue) : null
    const startedAt = Number(pendingCheckout?.startedAt || 0)
    const isFresh = startedAt > Date.now() - 1000 * 60 * 60 * 2
    return Boolean(pendingCheckout?.plan === 'local_repair_pack' && isFresh)
  } catch {
    return false
  }
}

function rememberPendingLocalRepairPackCheckout() {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.sessionStorage.setItem(
      pendingLocalRepairPackCheckoutKey,
      JSON.stringify({
        credits: localRepairPackCredits,
        plan: 'local_repair_pack',
        startedAt: Date.now(),
      })
    )
  } catch {
    // Session storage is optional; the UI will show an error if checkout fails.
  }
}

function clearPendingLocalRepairPackCheckout() {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.sessionStorage.removeItem(pendingLocalRepairPackCheckoutKey)
  } catch {
    // Ignore storage failures.
  }
}

function App() {
  const [file, setFile] = useState<File>()
  const [, setStateLanguageTag] = useState<'en' | 'zh'>('en')
  const [localRepairUsage, setLocalRepairUsage] = useState(() =>
    readLocalRepairUsage()
  )

  const [showAbout, setShowAbout] = useState(false)
  const [showHumanRestoreCheckout, setShowHumanRestoreCheckout] =
    useState(false)
  const [showLocalRepairLimitModal, setShowLocalRepairLimitModal] =
    useState(false)
  const [paymentSetupNotice, setPaymentSetupNotice] = useState<
    'human-restore' | 'local-pack' | null
  >(null)
  const paddleSetupRef = useRef(false)
  const paddleScriptLoadPromiseRef = useRef<Promise<boolean> | null>(null)
  const modalRef = useRef(null)

  const [downloadProgress, setDownloadProgress] = useState(100)
  const [localPackCheckoutError, setLocalPackCheckoutError] = useState('')
  const [localPackCheckoutStatus, setLocalPackCheckoutStatus] = useState<
    'idle' | 'opening' | 'success' | 'error'
  >('idle')
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
  const [humanRestoreOrderStatus, setHumanRestoreOrderStatus] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle')
  const [humanRestoreOrderError, setHumanRestoreOrderError] = useState('')
  const [humanRestoreOrder, setHumanRestoreOrder] =
    useState<HumanRestoreLocalOrder | null>(null)
  const [browserCheckoutContext] = useState(() =>
    readHumanRestoreCheckoutContext()
  )

  const currentPath = window.location.pathname.replace(/\/+$/, '') || '/'
  const currentSearchParams = new URLSearchParams(window.location.search)
  const isHumanRestoreSuccessPage = currentPath === humanRestoreSuccessPath
  const isHumanRestoreSecureUploadPage =
    currentPath === humanRestoreSecureUploadPath
  const isAdminReviewPage = currentPath === adminReviewPath
  const isRetoucherPortalPage = currentPath === retoucherPortalPath
  const isLegalRoute = isLegalPage(currentPath)
  const secureUploadToken = currentSearchParams.get('token') || ''
  const defaultCheckoutEmail =
    currentSearchParams.get('checkout_email') ||
    currentSearchParams.get('customer_email') ||
    currentSearchParams.get('email') ||
    ''
  const queryOrderId = currentSearchParams.get('order_id') || ''
  const queryCheckoutRef = currentSearchParams.get('checkout_ref') || ''
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
  const isPaddleClientReady = isPaddleClientTokenConfigured(paddleClientToken)
  const isLocalPackPaymentReady =
    isPaddleClientReady && isPaddlePriceIdConfigured(paddleLocalPackPriceId)
  const isHumanRestorePaymentReady =
    isPaddleClientReady && isPaddlePriceIdConfigured(paddleHumanRestorePriceId)

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

  useEffect(() => {
    const isHumanRestoreOrderPage =
      isHumanRestoreSuccessPage || isHumanRestoreSecureUploadPage
    const isPrivatePage =
      isHumanRestoreOrderPage || isAdminReviewPage || isRetoucherPortalPage
    let pageTitle = homePageTitle
    let pageDescription = homePageDescription
    let pagePath = '/'

    if (isRetoucherPortalPage) {
      pageTitle = retoucherPortalTitle
      pageDescription = retoucherPortalDescription
      pagePath = retoucherPortalPath
    } else if (isAdminReviewPage) {
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
    isRetoucherPortalPage,
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
      if (event.key === localRepairUsageStorageKey) {
        setLocalRepairUsage(readLocalRepairUsage())
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => {
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [])

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
    hasLocalHumanRestoreOrder,
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

  function loadPaddleScript() {
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
        console.warn(
          '[Paddle] Script load timeout, Paddle available:',
          Boolean(window.Paddle)
        )
        finish(Boolean(window.Paddle?.Initialize || window.Paddle?.Setup))
      }, 30000)
    })

    return paddleScriptLoadPromiseRef.current
  }

  function setupPaddle() {
    const paddle = window.Paddle

    if (!paddle?.Initialize && !paddle?.Setup) {
      console.warn(
        '[Paddle] setupPaddle: no Initialize/Setup.',
        'Paddle =',
        typeof paddle
      )
      return false
    }

    if (!paddleSetupRef.current) {
      if (!isPaddleClientTokenConfigured(paddleClientToken)) {
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
              setLocalRepairUsage(nextUsage)
              setLocalPackCheckoutStatus('success')
              setLocalPackCheckoutError('')
              setShowLocalRepairLimitModal(false)
              window.Paddle?.Checkout.close()
              trackProductEvent('complete_local_repair_pack_checkout', {
                added_credits: localRepairPackCredits,
                has_order_id: Boolean(paidTransactionId),
                paid_credits_remaining: nextUsage.paidCredits,
              })
              window.setTimeout(() => {
                document
                  .getElementById('local-repair-start')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              }, 250)
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
        console.error('[Paddle] setupPaddle error:', err)
        return false
      }
    }

    return true
  }

  async function ensurePaddleReady() {
    const isLoaded = await loadPaddleScript()

    if (!isLoaded) {
      return false
    }

    return setupPaddle()
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
    loadPaddleScript()
      .then(isLoaded => {
        if (isLoaded) {
          setupPaddle()
        }
      })
      .catch(() => null)
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
    <div className="min-h-full bg-[#f8f1e7] text-[#211915]">
      <header className="z-10 flex min-h-[72px] flex-row items-center justify-between border-b border-[#e6d2b7] bg-[#f8f1e7]/95 px-4 shadow-sm backdrop-blur md:px-8">
        <Button
          className={[
            file ||
            isHumanRestoreSuccessPage ||
            isHumanRestoreSecureUploadPage ||
            isAdminReviewPage ||
            isRetoucherPortalPage ||
            isLegalRoute
              ? ''
              : 'opacity-50 pointer-events-none',
            'pl-1 pr-1',
          ].join(' ')}
          icon={<ArrowLeftIcon className="h-6 w-6" />}
          onClick={() => {
            if (
              isHumanRestoreSuccessPage ||
              isHumanRestoreSecureUploadPage ||
              isAdminReviewPage ||
              isRetoucherPortalPage ||
              isLegalRoute
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
              isAdminReviewPage ||
              isRetoucherPortalPage ||
              isLegalRoute
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
            !isAdminReviewPage &&
            !isRetoucherPortalPage &&
            !isLegalRoute && (
              <>
                <a
                  href="/privacy"
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
                  href="/terms"
                  className="rounded-full px-4 py-3 text-sm font-bold text-[#5b4a40] transition hover:bg-white"
                >
                  Terms
                </a>
                <a
                  href="/refund"
                  className="rounded-full px-4 py-3 text-sm font-bold text-[#5b4a40] transition hover:bg-white"
                >
                  Refund
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
        {mainView === 'retoucher' && <RetoucherPortal />}
        {mainView === 'legal' && <LegalPage path={currentPath} />}
        {mainView === 'secure-upload' && (
          <SecureHumanRestoreUploadPage token={secureUploadToken} />
        )}
        {mainView === 'success' &&
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
        {mainView === 'home' && (
          <div className="relative overflow-hidden">
            <div className="pointer-events-none absolute left-[-8rem] top-20 h-72 w-72 rounded-full bg-[#d7a65f]/20 blur-3xl" />
            <div className="pointer-events-none absolute right-[-10rem] top-[28rem] h-96 w-96 rounded-full bg-[#211915]/10 blur-3xl" />
            <div className="mx-auto flex max-w-7xl flex-col px-4 py-6 md:px-8">
              <section className="grid items-center gap-6 py-4 lg:grid-cols-[0.98fr_1.02fr] lg:py-8">
                <div className="relative z-[1]">
                  <div className="mb-4 inline-flex rounded-full border border-[#d7b98c] bg-white/80 px-4 py-2 text-sm font-black text-[#8a4f1d] shadow-sm">
                    Private old photo repair. Free to start.
                  </div>
                  <h1 className="max-w-4xl text-4xl font-black tracking-[-0.05em] text-[#211915] sm:text-6xl lg:text-[4.25rem] lg:leading-[0.92]">
                    Repair old photos privately in your browser.
                  </h1>
                  <p className="mt-5 max-w-2xl text-base leading-7 text-[#66574d] md:text-lg">
                    Try {freeLocalRepairLimit} local repairs free. Your photos
                    stay on your device. Need extra care? Choose human-reviewed
                    restoration for one important photo.
                  </p>
                  <div className="mt-5 grid max-w-2xl grid-cols-3 gap-2">
                    {showcaseCards.map(card => (
                      <button
                        key={card.title}
                        type="button"
                        onClick={() => startWithDemoImage(card.image)}
                        className="group overflow-hidden rounded-[1.25rem] border border-[#e6d2b7] bg-white/80 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
                      >
                        <img
                          src={card.image}
                          alt={card.title}
                          className="h-20 w-full object-cover transition duration-500 group-hover:scale-105"
                        />
                        <span className="block truncate px-3 py-2 text-xs font-black text-[#5b4a40]">
                          Try sample
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={scrollToLocalRepairStart}
                      className="inline-flex justify-center rounded-full bg-[#211915] px-7 py-4 text-sm font-black text-white shadow-xl shadow-[#211915]/20 transition hover:-translate-y-1 hover:bg-[#3a2820]"
                    >
                      Start free local repair
                    </button>
                    <button
                      type="button"
                      onClick={handleLaunchHumanRestoreCheckout}
                      className="inline-flex justify-center rounded-full border border-[#d7b98c] bg-white/80 px-7 py-4 text-sm font-black text-[#211915] shadow-sm transition hover:-translate-y-1 hover:bg-white"
                    >
                      {isHumanRestorePaymentReady
                        ? `Human Restore - ${humanRestorePrice}`
                        : 'Request Human Restore'}
                    </button>
                  </div>
                  <div className="mt-5 grid gap-2 sm:grid-cols-2">
                    {trustPoints.map(point => (
                      <div
                        key={point}
                        className="rounded-2xl border border-[#e6d2b7] bg-white/75 px-4 py-2.5 text-sm font-black text-[#5b4a40] shadow-sm"
                      >
                        {point}
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 hidden gap-3 lg:grid lg:grid-cols-3">
                    {pricingCards.map(plan => (
                      <button
                        key={plan.name}
                        type="button"
                        onClick={() => handlePricingPlanAction(plan.kind)}
                        className="rounded-[1.5rem] border border-[#e6d2b7] bg-white/75 p-4 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
                      >
                        <span className="text-xs font-black uppercase tracking-[0.18em] text-[#9b6b3c]">
                          {plan.badge}
                        </span>
                        <span className="mt-2 block text-xl font-black text-[#211915]">
                          {plan.name}
                        </span>
                        <span className="mt-1 block text-2xl font-black text-[#8a4f1d]">
                          {plan.price}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div
                  id="local-repair-start"
                  className="relative z-[1] rounded-[2rem] border border-[#d7b98c] bg-white/85 p-4 shadow-2xl shadow-[#8a4f1d]/15"
                >
                  <div className="mb-3 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.24em] text-[#9b6b3c]">
                        Start locally
                      </p>
                      <h2 className="mt-1 text-2xl font-black">
                        Drop in a photo. Keep it private.
                      </h2>
                    </div>
                    <div className="rounded-full bg-[#211915] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#f3c16f]">
                      No upload
                    </div>
                  </div>
                  <div className="mb-3 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-[#e6d2b7] bg-[#fffaf3] px-4 py-2.5">
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#9b6b3c]">
                        Free local starts
                      </p>
                      <p className="mt-1 text-2xl font-black text-[#211915]">
                        {freeLocalRepairsRemaining}/{freeLocalRepairLimit} left
                      </p>
                    </div>
                    <div className="rounded-2xl border border-[#e6d2b7] bg-[#fffaf3] px-4 py-2.5">
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#9b6b3c]">
                        Extra local credits
                      </p>
                      <p className="mt-1 text-2xl font-black text-[#211915]">
                        {paidLocalRepairCreditsRemaining} available
                      </p>
                    </div>
                  </div>
                  {!canStartLocalRepair && (
                    <div className="mb-4 rounded-2xl border border-[#f0b5a9] bg-[#fff1ed] px-4 py-3 text-sm leading-6 text-[#8a2f1d]">
                      Your {freeLocalRepairLimit} free local repairs are used.
                      Buy {localRepairPackCredits} more browser-local repairs or
                      choose Human-assisted Restore for one important photo.
                    </div>
                  )}
                  {localPackCheckoutStatus === 'success' && (
                    <div className="mb-4 rounded-2xl border border-[#badf9f] bg-[#f4ffe9] px-4 py-3 text-sm font-bold text-[#3f6b20]">
                      Local Pack activated. {localRepairPackCredits} repair
                      credits were added to this browser.
                    </div>
                  )}
                  {localPackCheckoutStatus === 'error' && (
                    <div className="mb-4 rounded-2xl border border-[#f0b5a9] bg-[#fff1ed] px-4 py-3 text-sm leading-6 text-[#8a2f1d]">
                      <p className="font-black">
                        Local Pack checkout unavailable
                      </p>
                      <p className="mt-1">{localPackCheckoutError}</p>
                    </div>
                  )}
                  <div className="h-56 overflow-hidden rounded-[1.5rem] border border-[#e6d2b7] bg-[#f8f1e7] lg:h-60">
                    <FileSelect onSelection={handleFileSelection} />
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[#6f5e54]">
                    Local repair opens your photo in the browser. The model runs
                    on your device after model files are downloaded and cached.
                  </p>
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={handleLaunchLocalPackCheckout}
                      disabled={localPackCheckoutStatus === 'opening'}
                      className="inline-flex justify-center rounded-full bg-[#211915] px-5 py-3 text-sm font-black text-white shadow-lg shadow-[#211915]/15 transition hover:-translate-y-0.5 hover:bg-[#3a2820] disabled:cursor-wait disabled:opacity-70"
                    >
                      {localPackCheckoutStatus === 'opening'
                        ? 'Opening checkout...'
                        : getPricingPlanActionLabel('local-pack')}
                    </button>
                    <button
                      type="button"
                      onClick={handleLaunchHumanRestoreCheckout}
                      className="inline-flex justify-center rounded-full border border-[#d7b98c] bg-white px-5 py-3 text-sm font-black text-[#211915] transition hover:-translate-y-0.5 hover:bg-[#fffaf3]"
                    >
                      {getPricingPlanActionLabel('human-restore')}
                    </button>
                  </div>
                </div>
              </section>

              <section
                id="pricing"
                className="relative z-[1] py-10"
                aria-labelledby="pricing-heading"
              >
                <div className="mb-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
                  <div>
                    <p className="text-sm font-black uppercase tracking-[0.24em] text-[#9b6b3c]">
                      Choose your restore path
                    </p>
                    <h2
                      id="pricing-heading"
                      className="mt-3 max-w-3xl text-4xl font-black tracking-[-0.04em] sm:text-5xl"
                    >
                      Free local repair, paid local privacy, or human-reviewed
                      cloud restore.
                    </h2>
                  </div>
                  <p className="max-w-xl leading-7 text-[#66574d]">
                    The three options are intentionally separated so users know
                    when a photo stays local and when a paid cloud workflow is
                    used.
                  </p>
                </div>
                <div className="grid gap-5 lg:grid-cols-3">
                  {pricingCards.map(plan => {
                    const isFeatured = plan.kind === 'local-pack'
                    const isLocalPack = plan.kind === 'local-pack'
                    const isHumanRestorePlan = plan.kind === 'human-restore'
                    const isLocalPackOpening =
                      isLocalPack && localPackCheckoutStatus === 'opening'
                    let planButtonClass =
                      'border border-[#d7b98c] bg-white text-[#211915] hover:bg-[#fffaf3]'

                    if (isFeatured) {
                      planButtonClass =
                        'bg-[#f3c16f] text-[#211915] hover:bg-[#ffd48a]'
                    } else if (isHumanRestorePlan) {
                      planButtonClass =
                        'bg-[#211915] text-white hover:bg-[#3a2820]'
                    }

                    return (
                      <div
                        key={plan.name}
                        className={[
                          'flex flex-col rounded-[2rem] border p-7 shadow-xl',
                          isFeatured
                            ? 'border-[#211915] bg-[#211915] text-white shadow-[#211915]/20'
                            : 'border-[#e6d2b7] bg-white/75 text-[#211915] shadow-[#8a4f1d]/10',
                        ].join(' ')}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="text-2xl font-black">{plan.name}</h3>
                          <span
                            className={[
                              'rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.16em]',
                              isFeatured
                                ? 'bg-[#f3c16f] text-[#211915]'
                                : 'bg-[#fffaf3] text-[#9b6b3c]',
                            ].join(' ')}
                          >
                            {plan.badge}
                          </span>
                        </div>
                        <p
                          className={[
                            'mt-3 leading-7',
                            isFeatured ? 'text-[#e8dfd5]' : 'text-[#66574d]',
                          ].join(' ')}
                        >
                          {plan.description}
                        </p>
                        <div className="mt-6 text-5xl font-black">
                          {plan.price}
                        </div>
                        <ul className="mt-6 space-y-3">
                          {plan.features.map(feature => (
                            <li key={feature} className="flex gap-3">
                              <span
                                className={
                                  isFeatured
                                    ? 'text-[#f3c16f]'
                                    : 'text-[#9b6b3c]'
                                }
                              >
                                *
                              </span>
                              <span>{feature}</span>
                            </li>
                          ))}
                        </ul>
                        <button
                          type="button"
                          onClick={() => handlePricingPlanAction(plan.kind)}
                          disabled={isLocalPackOpening}
                          className={[
                            'mt-auto inline-flex justify-center rounded-full px-6 py-4 text-sm font-black transition hover:-translate-y-1 disabled:cursor-wait disabled:opacity-70',
                            planButtonClass,
                          ].join(' ')}
                        >
                          {isLocalPackOpening
                            ? 'Opening checkout...'
                            : getPricingPlanActionLabel(plan.kind)}
                        </button>
                        {isLocalPack &&
                          localPackCheckoutStatus === 'success' && (
                            <p
                              className={[
                                'mt-4 rounded-2xl px-4 py-3 text-sm font-bold',
                                isFeatured
                                  ? 'bg-[#30421f] text-[#d9ffc8]'
                                  : 'bg-[#f4ffe9] text-[#3f6b20]',
                              ].join(' ')}
                            >
                              Activated in this browser. Current paid credits:{' '}
                              {paidLocalRepairCreditsRemaining}
                            </p>
                          )}
                        {isLocalPack && localPackCheckoutStatus === 'error' && (
                          <p
                            className={[
                              'mt-4 rounded-2xl px-4 py-3 text-sm leading-6',
                              isFeatured
                                ? 'bg-[#3a201b] text-[#ffd9d1]'
                                : 'bg-[#fff1ed] text-[#8a2f1d]',
                            ].join(' ')}
                          >
                            {localPackCheckoutError}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>

              <section className="relative z-[1] py-10">
                <div className="mb-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
                  <div>
                    <p className="text-sm font-black uppercase tracking-[0.24em] text-[#9b6b3c]">
                      See what to test first
                    </p>
                    <h2 className="mt-3 max-w-3xl text-4xl font-black tracking-[-0.04em] sm:text-5xl">
                      Start with public samples before using private memories.
                    </h2>
                  </div>
                  <p className="max-w-xl leading-7 text-[#66574d]">
                    These examples help set expectations: local repair is great
                    for visible surface damage, while emotional portraits often
                    deserve human review.
                  </p>
                </div>
                <div className="grid gap-5 lg:grid-cols-3">
                  {showcaseCards.map(card => (
                    <article
                      key={card.title}
                      className="overflow-hidden rounded-[2rem] border border-[#e6d2b7] bg-white/80 shadow-xl shadow-[#8a4f1d]/10"
                    >
                      <div className="relative h-64">
                        <img
                          src={card.image}
                          alt={card.title}
                          className="h-full w-full object-cover"
                        />
                        <div className="absolute left-4 top-4 rounded-full bg-[#211915]/90 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-[#f3c16f]">
                          {card.label}
                        </div>
                      </div>
                      <div className="p-6">
                        <h3 className="text-2xl font-black">{card.title}</h3>
                        <p className="mt-3 leading-7 text-[#66574d]">
                          {card.description}
                        </p>
                        <button
                          type="button"
                          onClick={() => startWithDemoImage(card.image)}
                          className="mt-5 rounded-full border border-[#d7b98c] bg-[#fffaf3] px-5 py-3 text-sm font-black text-[#211915] transition hover:-translate-y-0.5 hover:bg-white"
                        >
                          Open this sample
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="relative z-[1] grid gap-4 py-10 md:grid-cols-3">
                {featureCards.map(feature => (
                  <article
                    key={feature.title}
                    className="rounded-[1.75rem] border border-[#e6d2b7] bg-white/75 p-6 shadow-sm"
                  >
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-[#9b6b3c]">
                      {feature.label}
                    </p>
                    <h2 className="mt-3 text-2xl font-black">
                      {feature.title}
                    </h2>
                    <p className="mt-4 leading-7 text-[#66574d]">
                      {feature.description}
                    </p>
                  </article>
                ))}
              </section>

              <section
                id="privacy"
                className="relative z-[1] my-10 overflow-hidden rounded-[2.25rem] bg-[#211915] p-8 text-white shadow-2xl shadow-[#211915]/20 md:p-12"
              >
                <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#f3c16f]/20 blur-3xl" />
                <div className="relative">
                  <p className="text-sm font-black uppercase tracking-[0.26em] text-[#f3c16f]">
                    Privacy boundary
                  </p>
                  <h2 className="mt-4 max-w-3xl text-4xl font-black tracking-[-0.04em] sm:text-5xl">
                    Local repair stays local. Human Restore is an explicit
                    upload.
                  </h2>
                  <p className="mt-5 max-w-3xl text-lg leading-8 text-[#e8dfd5]">
                    The homepage now makes the decision clear before checkout:
                    users can keep photos on-device, buy more local credits, or
                    intentionally submit one photo for AI plus human review.
                  </p>
                  <div className="mt-8 grid gap-4 lg:grid-cols-3">
                    {privacyBoundaryCards.map(card => (
                      <article
                        key={card.label}
                        className="rounded-[1.5rem] border border-white/15 bg-white/[0.08] p-5"
                      >
                        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#f3c16f]">
                          {card.label}
                        </p>
                        <h3 className="mt-3 text-2xl font-black">
                          {card.title}
                        </h3>
                        <p className="mt-3 text-sm leading-6 text-[#e8dfd5]">
                          {card.description}
                        </p>
                      </article>
                    ))}
                  </div>
                </div>
              </section>

              <section className="relative z-[1] my-10 grid gap-8 rounded-[2.25rem] border border-[#e6d2b7] bg-white/80 p-8 shadow-xl shadow-[#8a4f1d]/10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center md:p-10">
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.24em] text-[#9b6b3c]">
                    Premium workflow
                  </p>
                  <h2 className="mt-3 text-4xl font-black tracking-[-0.04em] sm:text-5xl">
                    One important photo. AI draft plus human review.
                  </h2>
                  <p className="mt-4 text-lg font-black text-[#211915]">
                    MemoryFix AI Human-assisted Restore -{' '}
                    {`${humanRestorePrice}/photo`}
                  </p>
                  <p className="mt-4 max-w-3xl leading-7 text-[#66574d]">
                    This is the offer designed to earn the first payment: the
                    customer submits one best source photo, we prepare a careful
                    AI draft, then human-review the result before delivery.
                  </p>
                  <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={handleLaunchHumanRestoreCheckout}
                      disabled={checkoutLaunchStatus === 'loading'}
                      className="inline-flex justify-center rounded-full bg-[#211915] px-7 py-4 text-center font-black text-white shadow-xl shadow-[#211915]/20 transition hover:-translate-y-1 hover:bg-[#3a2820] disabled:cursor-wait disabled:opacity-70"
                    >
                      {checkoutLaunchStatus === 'loading'
                        ? 'Preparing secure checkout...'
                        : getPricingPlanActionLabel('human-restore')}
                    </button>
                    <a
                      href="#pricing"
                      className="inline-flex justify-center rounded-full border border-[#d7b98c] bg-[#fffaf3] px-7 py-4 text-center font-black text-[#211915] transition hover:-translate-y-1 hover:bg-white"
                    >
                      Compare all options
                    </a>
                  </div>
                  {checkoutLaunchStatus === 'error' && (
                    <div className="mt-5 rounded-[1.5rem] border border-[#f0b5a9] bg-[#fff1ed] px-4 py-4 text-sm leading-6 text-[#8a2f1d]">
                      <p className="font-black">Checkout could not be opened</p>
                      <p className="mt-2">{checkoutLaunchError}</p>
                    </div>
                  )}
                </div>
                <div className="grid gap-4">
                  {humanRestoreValueCards.map(card => (
                    <article
                      key={card.title}
                      className="rounded-[1.5rem] border border-[#e6d2b7] bg-[#fffaf3] p-6"
                    >
                      <h3 className="text-2xl font-black">{card.title}</h3>
                      <p className="mt-3 leading-7 text-[#66574d]">
                        {card.description}
                      </p>
                    </article>
                  ))}
                </div>
              </section>

              <section className="relative z-[1] py-10">
                <div className="mb-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
                  <div>
                    <p className="text-sm font-black uppercase tracking-[0.24em] text-[#9b6b3c]">
                      Family memory use cases
                    </p>
                    <h2 className="mt-3 max-w-3xl text-4xl font-black tracking-[-0.04em] sm:text-5xl">
                      Built for photos people feel nervous uploading anywhere.
                    </h2>
                  </div>
                  <p className="max-w-xl leading-7 text-[#66574d]">
                    The product should feel trustworthy before it feels clever.
                    That trust is what makes both local credits and human review
                    easier to buy.
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  {useCaseCards.map(useCase => (
                    <article
                      key={useCase}
                      className="rounded-[1.5rem] border border-[#e6d2b7] bg-white/75 p-6 shadow-sm"
                    >
                      <div className="mb-5 h-2 w-16 rounded-full bg-[#9b6b3c]" />
                      <h3 className="text-2xl font-black">{useCase}</h3>
                    </article>
                  ))}
                </div>
              </section>

              <section
                className="relative z-[1] py-10"
                aria-labelledby="faq-heading"
              >
                <div className="mb-8 max-w-3xl">
                  <p className="text-sm font-black uppercase tracking-[0.24em] text-[#9b6b3c]">
                    FAQ
                  </p>
                  <h2
                    id="faq-heading"
                    className="mt-3 text-4xl font-black tracking-[-0.04em] sm:text-5xl"
                  >
                    Answer the privacy and payment questions before checkout.
                  </h2>
                </div>
                <div className="grid gap-4 lg:grid-cols-3">
                  {faqCards.map(card => (
                    <article
                      key={card.question}
                      className="rounded-[1.75rem] border border-[#e6d2b7] bg-white/75 p-6 shadow-sm"
                    >
                      <h3 className="text-xl font-black">{card.question}</h3>
                      <p className="mt-4 leading-7 text-[#66574d]">
                        {card.answer}
                      </p>
                    </article>
                  ))}
                </div>
              </section>

              <section className="relative z-[1] py-10">
                <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
                  <div>
                    <p className="text-sm font-black uppercase tracking-[0.24em] text-[#9b6b3c]">
                      More sample images
                    </p>
                    <h2 className="mt-2 text-3xl font-black">
                      Test the editor before using private photos.
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

              <footer
                id="open-source"
                className="relative z-[1] mt-10 flex flex-col gap-4 border-t border-[#e6d2b7] py-8 text-sm leading-6 text-[#66574d] md:flex-row md:items-center md:justify-between"
              >
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
                  <a href="/privacy" className="underline">
                    Privacy
                  </a>
                  <a href="/terms" className="underline">
                    Terms
                  </a>
                  <a href="/acceptable-use" className="underline">
                    Acceptable Use
                  </a>
                  <a href="/delivery" className="underline">
                    Delivery
                  </a>
                  <a href="/refund" className="underline">
                    Refund
                  </a>
                  <a
                    href={`mailto:${paymentContactEmail}`}
                    className="underline"
                  >
                    Support
                  </a>
                  <a href="#open-source" className="underline">
                    Open Source
                  </a>
                </div>
              </footer>
            </div>
          </div>
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
          <HumanRestoreCheckoutForm
            onCancel={() => {
              setShowHumanRestoreCheckout(false)
            }}
            onCheckoutCreated={handleHumanRestoreCheckoutCreated}
          />
        </Modal>
      )}
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

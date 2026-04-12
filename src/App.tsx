/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable jsx-a11y/control-has-associated-label */
import { ArrowLeftIcon, InformationCircleIcon } from '@heroicons/react/outline'
import { useEffect, useRef, useState } from 'react'
import { useClickAway } from 'react-use'
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

const humanRestoreUrl =
  import.meta.env.VITE_EARLY_ACCESS_URL ||
  'https://artgen.lemonsqueezy.com/checkout/buy/092746e8-e559-4bca-96d0-abe3df4df268'

const humanRestoreSecureUploadPath = '/human-restore/upload'
const humanRestoreSuccessPath = '/human-restore/success'

const humanRestoreSteps = [
  {
    title: '1. Pay for one photo',
    description: 'Complete secure checkout for one important old photo.',
  },
  {
    title: '2. Upload only after checkout',
    description:
      'After payment, we send a secure upload link by email. If the message is delayed, you can still use the fallback upload form on the thank-you page.',
  },
  {
    title: '3. Get delivery by email',
    description:
      'Delivered within 48 hours during beta. Limited beta capacity.',
  },
]

const humanRestoreUploadChecklist = [
  'The original scan or the highest-resolution copy you have',
  'A short note about the damage or what you want improved',
  'Any deadline or family context that matters for this restoration',
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

type DirectSecureAccessResponse = {
  error?: string
  ok?: boolean
  uploadUrl?: string
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

function formatOrderDate(value: string) {
  if (!value) {
    return ''
  }

  const parsedDate = new Date(value)

  if (Number.isNaN(parsedDate.getTime())) {
    return ''
  }

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsedDate)
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

function App() {
  const [file, setFile] = useState<File>()
  const [, setStateLanguageTag] = useState<'en' | 'zh'>('en')

  const [showAbout, setShowAbout] = useState(false)
  const modalRef = useRef(null)

  const [downloadProgress, setDownloadProgress] = useState(100)
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
  const [inlineSecureOrderError, setInlineSecureOrderError] = useState('')
  const [showBackupUploadForm, setShowBackupUploadForm] = useState(false)

  const currentPath = window.location.pathname.replace(/\/+$/, '') || '/'
  const currentSearchParams = new URLSearchParams(window.location.search)
  const isHumanRestoreSuccessPage = currentPath === humanRestoreSuccessPath
  const isHumanRestoreSecureUploadPage =
    currentPath === humanRestoreSecureUploadPath
  const secureUploadToken = currentSearchParams.get('token') || ''
  const defaultCheckoutEmail =
    currentSearchParams.get('checkout_email') ||
    currentSearchParams.get('customer_email') ||
    currentSearchParams.get('email') ||
    ''
  const maskedCheckoutEmail = maskEmailAddress(defaultCheckoutEmail)
  const directAccessOrderId = currentSearchParams.get('order_id') || ''
  const defaultOrderReference =
    currentSearchParams.get('order_id') ||
    currentSearchParams.get('order') ||
    currentSearchParams.get('checkout_id') ||
    ''
  const formattedInlineOrderDate = inlineSecureOrder
    ? formatOrderDate(inlineSecureOrder.createdAt)
    : ''

  let mainView: 'editor' | 'success' | 'secure-upload' | 'home' = 'home'

  if (file) {
    mainView = 'editor'
  } else if (isHumanRestoreSecureUploadPage) {
    mainView = 'secure-upload'
  } else if (isHumanRestoreSuccessPage) {
    mainView = 'success'
  }

  useEffect(() => {
    const isHumanRestoreOrderPage =
      isHumanRestoreSuccessPage || isHumanRestoreSecureUploadPage
    let pageTitle = homePageTitle
    let pageDescription = homePageDescription
    let pagePath = '/'

    if (isHumanRestoreSecureUploadPage) {
      pageTitle = humanRestoreSecureUploadTitle
      pageDescription = humanRestoreSecureUploadDescription
      pagePath = humanRestoreSecureUploadPath
    } else if (isHumanRestoreSuccessPage) {
      pageTitle = humanRestoreSuccessTitle
      pageDescription = humanRestoreSuccessDescription
      pagePath = humanRestoreSuccessPath
    }

    const pageRobots = isHumanRestoreOrderPage
      ? 'noindex, nofollow'
      : 'index, follow'
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
  }, [isHumanRestoreSecureUploadPage, isHumanRestoreSuccessPage])

  useEffect(() => {
    const unsubscribe = onSetLanguageTag(() =>
      setStateLanguageTag(languageTag())
    )
    let pageViewEvent = 'visit_home'

    if (isHumanRestoreSecureUploadPage) {
      pageViewEvent = 'view_human_restore_secure_upload'
    } else if (isHumanRestoreSuccessPage) {
      pageViewEvent = 'view_human_restore_success'
    }

    trackProductEvent(pageViewEvent)

    return () => {
      unsubscribe()
    }
  }, [isHumanRestoreSecureUploadPage, isHumanRestoreSuccessPage])

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

    if (!directAccessOrderId || !defaultCheckoutEmail) {
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
    requestUrl.searchParams.set('orderId', directAccessOrderId)
    requestUrl.searchParams.set('checkoutEmail', defaultCheckoutEmail)

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
    defaultCheckoutEmail,
    directAccessOrderId,
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
      setInlineSecureOrderError('')
      return () => undefined
    }

    let isActive = true
    setInlineSecureOrderStatus('loading')
    setInlineSecureOrder(null)
    setInlineSecureOrderError('')

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
      .catch(error => {
        if (!isActive) {
          return
        }

        setInlineSecureOrderStatus('error')
        setInlineSecureOrder(null)
        setInlineSecureOrderError(
          error instanceof Error
            ? error.message
            : 'The secure upload form could not be prepared on this page.'
        )
      })

    return () => {
      isActive = false
    }
  }, [directUploadStatus, directUploadToken, isHumanRestoreSuccessPage])

  useEffect(() => {
    if (!showBackupUploadForm || !isHumanRestoreSuccessPage) {
      return () => undefined
    }

    const scrollTimeout = window.setTimeout(() => {
      document
        .getElementById('backup-upload-form')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 60)

    return () => {
      window.clearTimeout(scrollTimeout)
    }
  }, [isHumanRestoreSuccessPage, showBackupUploadForm])

  const isDirectUploadReady =
    directUploadStatus === 'ready' && Boolean(directUploadUrl)
  const isDirectUploadPreparing = directUploadStatus === 'loading'
  const isInlineSecureUploadReady =
    inlineSecureOrderStatus === 'ready' && Boolean(inlineSecureOrder)
  const backupFormToggleLabel = showBackupUploadForm
    ? 'Hide backup upload form'
    : 'Open backup upload form'

  function scrollToSection(sectionId: string) {
    document
      .getElementById(sectionId)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  let successHeroTitle = 'Your payment is confirmed.'
  let successHeroDescription = maskedCheckoutEmail
    ? `You can upload your photo on this page now. We also sent the secure upload link to ${maskedCheckoutEmail} as backup access on any device.`
    : 'Your checkout is complete. Upload your photo on this page now. We also send a secure upload link to your checkout email as backup access.'
  let primaryPathTitle = 'Upload your photo on this page now.'
  let primaryPathDescription =
    'This is the fastest way to continue. Once the order is verified below, your upload stays attached to the paid order automatically.'

  if (isInlineSecureUploadReady) {
    successHeroTitle = 'Your upload form is ready below.'
    successHeroDescription = maskedCheckoutEmail
      ? `Your paid order is confirmed and this page is already tied to it. Upload below now, and keep the secure email sent to ${maskedCheckoutEmail} only as backup access.`
      : 'Your paid order is confirmed and this page is already tied to it. Upload below now, and keep the secure email only as backup access.'
    primaryPathTitle = 'Upload below now.'
    primaryPathDescription =
      'The secure upload form is ready on this page. Add your photo and notes below to continue immediately.'
  } else if (
    isDirectUploadPreparing ||
    (isDirectUploadReady && inlineSecureOrderStatus === 'loading')
  ) {
    successHeroTitle = 'Preparing your upload form.'
    successHeroDescription = maskedCheckoutEmail
      ? `We are verifying this checkout and preparing the order-bound upload form on this page. The secure link is also in ${maskedCheckoutEmail} as backup access.`
      : 'We are verifying this checkout and preparing the order-bound upload form on this page. The secure link is also in your checkout email as backup access.'
    primaryPathTitle = 'Preparing your direct upload form...'
    primaryPathDescription =
      'Stay on this page for a moment. If order-bound upload cannot be prepared here, you can still use the email backup link or the backup form below.'
  } else if (maskedCheckoutEmail) {
    primaryPathTitle = 'Use direct upload below when available.'
    primaryPathDescription = `If the order-bound form is unavailable on this page, use the secure email sent to ${maskedCheckoutEmail}, or open the backup upload form below.`
  }

  let directUploadCta: JSX.Element

  if (isInlineSecureUploadReady) {
    directUploadCta = (
      <div className="grid gap-3">
        <button
          type="button"
          onClick={() => {
            scrollToSection('direct-upload-form')
          }}
          className="inline-flex justify-center rounded-full bg-[#211915] px-7 py-4 text-center font-black text-white shadow-xl shadow-[#211915]/20 transition hover:-translate-y-1 hover:bg-[#3a2820]"
        >
          Upload photo below now
        </button>
        <p className="text-sm leading-6 text-[#66574d]">
          This page is already tied to the paid order. The secure email link is
          only your backup access path.
        </p>
      </div>
    )
  } else if (
    isDirectUploadPreparing ||
    (isDirectUploadReady && inlineSecureOrderStatus === 'loading')
  ) {
    directUploadCta = (
      <div className="grid gap-3">
        <span className="inline-flex justify-center rounded-full bg-[#d8c6b2] px-7 py-4 text-center font-black text-[#5b4a40]">
          Preparing direct upload...
        </span>
        <p className="text-sm leading-6 text-[#66574d]">
          This usually takes a moment. We are preparing the order-bound upload
          form directly on this page.
        </p>
      </div>
    )
  } else {
    directUploadCta = (
      <div className="grid gap-3">
        <span className="rounded-[1.5rem] border border-[#e6d2b7] bg-white/70 px-5 py-4 text-sm leading-6 text-[#66574d]">
          Use the secure email link first. If it is delayed, the backup upload
          form below is still available for this paid order.
        </span>
        <button
          type="button"
          onClick={() => {
            setShowBackupUploadForm(currentValue => !currentValue)
          }}
          className="inline-flex justify-center rounded-full border border-[#211915] px-7 py-4 text-center font-black text-[#211915] transition hover:-translate-y-1 hover:bg-white"
        >
          {backupFormToggleLabel}
        </button>
      </div>
    )
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
            file || isHumanRestoreSuccessPage || isHumanRestoreSecureUploadPage
              ? ''
              : 'opacity-50 pointer-events-none',
            'pl-1 pr-1',
          ].join(' ')}
          icon={<ArrowLeftIcon className="h-6 w-6" />}
          onClick={() => {
            if (isHumanRestoreSuccessPage || isHumanRestoreSecureUploadPage) {
              window.location.assign('/')
              return
            }

            setFile(undefined)
          }}
        >
          <div className="md:w-[180px]">
            <span className="hidden select-none sm:inline">
              {isHumanRestoreSuccessPage || isHumanRestoreSecureUploadPage
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
            !isHumanRestoreSecureUploadPage && (
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
        {mainView === 'secure-upload' && (
          <SecureHumanRestoreUploadPage token={secureUploadToken} />
        )}
        {mainView === 'success' && (
          <div className="mx-auto flex max-w-5xl flex-col px-4 py-10 md:px-8">
            <section className="rounded-[2rem] border border-[#e6d2b7] bg-white/80 p-8 shadow-2xl shadow-[#8a4f1d]/10 md:p-12">
              <p className="text-sm font-bold uppercase tracking-[0.24em] text-[#9b6b3c]">
                Payment received
              </p>
              <h1 className="mt-4 max-w-3xl text-4xl font-black tracking-tight text-[#211915] sm:text-6xl">
                {successHeroTitle}
              </h1>
              <p className="mt-6 max-w-3xl text-lg leading-8 text-[#66574d]">
                {successHeroDescription}
              </p>

              <div className="mt-8 grid gap-5 md:grid-cols-3">
                <article className="rounded-[1.75rem] border border-[#b8d99f] bg-[#f4ffe8] p-6 shadow-xl shadow-[#8a4f1d]/10">
                  <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#5c8b32]">
                    Payment
                  </p>
                  <h2 className="mt-3 text-xl font-black text-[#1f3413]">
                    Confirmed
                  </h2>
                  <p className="mt-4 leading-7 text-[#355322]">
                    Your paid Human-assisted Restore order is recorded.
                  </p>
                </article>
                <article className="rounded-[1.75rem] border border-[#e6d2b7] bg-white/75 p-6 shadow-xl shadow-[#8a4f1d]/10">
                  <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#9b6b3c]">
                    Upload
                  </p>
                  <h2 className="mt-3 text-xl font-black text-[#211915]">
                    Secure page first
                  </h2>
                  <p className="mt-4 leading-7 text-[#66574d]">
                    Use the direct secure upload page when available, or open
                    the same secure link from your email backup access.
                  </p>
                </article>
                <article className="rounded-[1.75rem] border border-[#e6d2b7] bg-white/75 p-6 shadow-xl shadow-[#8a4f1d]/10">
                  <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#9b6b3c]">
                    Delivery
                  </p>
                  <h2 className="mt-3 text-xl font-black text-[#211915]">
                    Confirmation, then email delivery
                  </h2>
                  <p className="mt-4 leading-7 text-[#66574d]">
                    After upload, we send a confirmation email. During beta,
                    final delivery is usually sent within 48 hours.
                  </p>
                </article>
              </div>
            </section>

            <section className="mt-10 grid gap-6 rounded-[2rem] border border-[#e6d2b7] bg-[#fffaf3] p-8 shadow-xl shadow-[#8a4f1d]/10 md:grid-cols-[1.15fr_0.85fr] md:p-10">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.24em] text-[#9b6b3c]">
                  Primary path
                </p>
                <h2 className="mt-3 text-3xl font-black sm:text-4xl">
                  {primaryPathTitle}
                </h2>
                <p className="mt-6 leading-7 text-[#66574d]">
                  {primaryPathDescription}
                </p>
              </div>
              <div className="rounded-[1.75rem] border border-[#e6d2b7] bg-white/80 p-6 md:p-8">
                {directUploadCta}
              </div>
            </section>

            {(isDirectUploadPreparing ||
              (isDirectUploadReady &&
                inlineSecureOrderStatus === 'loading')) && (
              <section className="mt-10 rounded-[2rem] border border-[#e6d2b7] bg-white/80 p-8 shadow-xl shadow-[#8a4f1d]/10">
                <p className="text-lg font-black text-[#211915]">
                  Preparing your direct upload form...
                </p>
                <p className="mt-3 leading-7 text-[#66574d]">
                  Please wait a moment while we verify the paid order attached
                  to this page.
                </p>
              </section>
            )}

            {inlineSecureOrderStatus === 'error' && (
              <section className="mt-10 rounded-[2rem] border border-[#f0b5a9] bg-[#fff1ed] p-8 text-[#8a2f1d] shadow-xl shadow-[#8a4f1d]/10">
                <p className="text-lg font-black">
                  Direct upload could not be prepared on this page
                </p>
                <p className="mt-3 leading-7">{inlineSecureOrderError}</p>
                <p className="mt-4 text-sm leading-6">
                  Do not pay again. Use the secure email link as backup access,
                  or open the backup upload form below.
                </p>
              </section>
            )}

            {isInlineSecureUploadReady && inlineSecureOrder && (
              <section
                id="direct-upload-form"
                className="scroll-mt-28 rounded-[2rem] border border-[#e6d2b7] bg-[#fffaf3] p-8 shadow-xl shadow-[#8a4f1d]/10 md:p-10"
              >
                <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
                  <div>
                    <p className="text-sm font-bold uppercase tracking-[0.24em] text-[#9b6b3c]">
                      Direct upload
                    </p>
                    <h2 className="mt-3 text-3xl font-black text-[#211915] sm:text-4xl">
                      Upload the paid order photo right here.
                    </h2>
                    <p className="mt-4 max-w-2xl leading-7 text-[#66574d]">
                      This page is already linked to your paid order. Add the
                      best source photo you have, include any repair notes, and
                      submit once.
                    </p>
                  </div>

                  <div className="grid gap-4 rounded-[1.75rem] border border-[#e6d2b7] bg-white/70 p-6">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-[#66574d]">
                        Checkout email
                      </p>
                      <p className="mt-2 text-base font-black text-[#211915]">
                        {inlineSecureOrder.checkoutEmailMasked}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-[#66574d]">
                        Order number
                      </p>
                      <p className="mt-2 text-base font-black text-[#211915]">
                        {inlineSecureOrder.orderNumber ||
                          inlineSecureOrder.orderId}
                      </p>
                    </div>
                    {formattedInlineOrderDate && (
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-[#66574d]">
                          Purchased
                        </p>
                        <p className="mt-2 text-base font-bold text-[#211915]">
                          {formattedInlineOrderDate}
                        </p>
                      </div>
                    )}
                    {inlineSecureOrder.receiptUrl && (
                      <a
                        href={inlineSecureOrder.receiptUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex justify-center rounded-full border border-[#211915] px-5 py-3 text-center text-sm font-black text-[#211915] transition hover:-translate-y-1 hover:bg-white"
                      >
                        View receipt
                      </a>
                    )}
                  </div>
                </div>

                <HumanRestoreUploadForm
                  defaultEmail=""
                  defaultOrderReference=""
                  secureOrderSummary={{
                    checkoutEmailMasked: inlineSecureOrder.checkoutEmailMasked,
                    orderNumber: inlineSecureOrder.orderNumber,
                    productName: inlineSecureOrder.productName,
                  }}
                  secureUploadToken={directUploadToken}
                />
              </section>
            )}

            <section className="mt-10 grid gap-6 md:grid-cols-[0.95fr_1.05fr]">
              <article className="rounded-[2rem] border border-[#e6d2b7] bg-white/80 p-8 shadow-xl shadow-[#8a4f1d]/10 md:p-10">
                <p className="text-sm font-bold uppercase tracking-[0.24em] text-[#9b6b3c]">
                  Email backup access
                </p>
                <h2 className="mt-3 text-3xl font-black sm:text-4xl">
                  Keep the secure email only as backup access.
                </h2>
                <p className="mt-4 leading-7 text-[#66574d]">
                  {maskedCheckoutEmail
                    ? `The direct upload form on this page is the primary path. The secure email sent to ${maskedCheckoutEmail} is only for backup access if you leave this page or need to continue on another device.`
                    : 'The direct upload form on this page is the primary path. The secure email is only for backup access if you leave this page or need to continue on another device.'}
                </p>
                <dl className="mt-6 grid gap-4 text-sm text-[#5b4a40]">
                  <div>
                    <dt className="font-black uppercase tracking-[0.14em] text-[#211915]">
                      Upload email
                    </dt>
                    <dd className="mt-2 text-base font-bold text-[#211915]">
                      {maskedCheckoutEmail || 'Your checkout email'}
                    </dd>
                  </div>
                  {defaultOrderReference && (
                    <div>
                      <dt className="font-black uppercase tracking-[0.14em] text-[#211915]">
                        Reference
                      </dt>
                      <dd className="mt-2 text-base font-bold text-[#211915]">
                        {defaultOrderReference}
                      </dd>
                    </div>
                  )}
                </dl>
              </article>

              <article className="rounded-[2rem] border border-[#e6d2b7] bg-white/80 p-8 shadow-xl shadow-[#8a4f1d]/10 md:p-10">
                <p className="text-sm font-bold uppercase tracking-[0.24em] text-[#9b6b3c]">
                  Need the backup form?
                </p>
                <h2 className="mt-3 text-3xl font-black sm:text-4xl">
                  Use the backup form only if the secure page or email link is
                  unavailable.
                </h2>
                <ul className="mt-6 space-y-3 text-[#66574d]">
                  {humanRestoreUploadChecklist.map(item => (
                    <li key={item} className="flex gap-3 leading-7">
                      <span className="text-[#9b6b3c]">*</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-6 leading-7 text-[#66574d]">
                  You do not need to pay again if the secure email is delayed.
                  Using the same checkout email helps us match the backup
                  submission quickly.
                </p>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => {
                      setShowBackupUploadForm(currentValue => !currentValue)
                    }}
                    className="inline-flex justify-center rounded-full border border-[#211915] px-7 py-4 text-center font-black text-[#211915] transition hover:-translate-y-1 hover:bg-white"
                  >
                    {backupFormToggleLabel}
                  </button>
                  <a
                    href="/"
                    className="inline-flex justify-center rounded-full border border-[#d7b98c] px-7 py-4 text-center font-black text-[#5b4a40] transition hover:-translate-y-1 hover:bg-[#fffaf3]"
                  >
                    Back to homepage
                  </a>
                </div>
              </article>
            </section>

            {showBackupUploadForm && (
              <section id="backup-upload-form" className="scroll-mt-28">
                <HumanRestoreUploadForm
                  defaultEmail={defaultCheckoutEmail}
                  defaultOrderReference={defaultOrderReference}
                />
              </section>
            )}
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
                <a
                  href={humanRestoreUrl}
                  target={
                    humanRestoreUrl.startsWith('http') ? '_blank' : undefined
                  }
                  rel={
                    humanRestoreUrl.startsWith('http')
                      ? 'noreferrer'
                      : undefined
                  }
                  onClick={() => {
                    trackProductEvent('click_human_restore', {
                      destination: humanRestoreUrl.startsWith('http')
                        ? 'checkout'
                        : 'mailto',
                    })
                  }}
                  className="inline-flex justify-center rounded-full bg-[#211915] px-7 py-4 text-center font-black text-white shadow-xl shadow-[#211915]/20 transition hover:-translate-y-1 hover:bg-[#3a2820]"
                >
                  Book Human Restore
                </a>
                <p className="text-sm leading-6 text-[#66574d] md:text-right">
                  Important: the free local repair tool does not upload photos.
                  This paid service requires upload only after you explicitly
                  choose Human-assisted Restore.
                </p>
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

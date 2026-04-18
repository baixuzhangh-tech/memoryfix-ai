import { useEffect } from 'react'

import {
  adminReviewPath,
  humanRestoreSecureUploadPath,
  humanRestoreSuccessPath,
  retoucherPortalPath,
} from '../config/routes'
import {
  adminReviewDescription,
  adminReviewTitle,
  homePageDescription,
  homePageTitle,
  humanRestoreSecureUploadDescription,
  humanRestoreSecureUploadTitle,
  humanRestoreSuccessDescription,
  humanRestoreSuccessTitle,
  retoucherPortalDescription,
  retoucherPortalTitle,
  siteUrl,
} from '../config/seoMeta'
import { upsertCanonicalLink, upsertMetaTag } from '../lib/seo'

export interface UsePageSeoArgs {
  isAdminReviewPage: boolean
  isHumanRestoreSecureUploadPage: boolean
  isHumanRestoreSuccessPage: boolean
  isRetoucherPortalPage: boolean
}

/**
 * Drive the document `<title>`, canonical link, and the description /
 * og / twitter meta set for the current route.
 *
 * Extracted out of App.tsx during the Phase 3 split so the route →
 * SEO string mapping lives next to `config/seoMeta.ts` and App no
 * longer has to carry a 40-line useEffect.
 *
 * Private routes (admin review, retoucher portal, paid-order pages
 * tied to a specific customer) get `noindex, nofollow` so search
 * engines do not index per-customer artefacts.
 */
export function usePageSeo({
  isAdminReviewPage,
  isHumanRestoreSecureUploadPage,
  isHumanRestoreSuccessPage,
  isRetoucherPortalPage,
}: UsePageSeoArgs) {
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
}

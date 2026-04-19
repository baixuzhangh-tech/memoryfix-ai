import { useEffect } from 'react'

import {
  adminReviewPath,
  caseStudiesIndexPath,
  humanRestoreSecureUploadPath,
  humanRestoreSuccessPath,
  retoucherPortalPath,
} from '../config/routes'
import {
  adminReviewDescription,
  adminReviewTitle,
  caseStudiesIndexDescription,
  caseStudiesIndexTitle,
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
import { getCaseStudyBySlug, getCaseStudyPath } from '../config/caseStudies'
import {
  upsertCanonicalLink,
  upsertJsonLdScript,
  upsertMetaTag,
} from '../lib/seo'

export interface UsePageSeoArgs {
  caseStudySlug: string
  isCaseStudiesIndexPage: boolean
  isCaseStudyPage: boolean
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
  caseStudySlug,
  isCaseStudiesIndexPage,
  isCaseStudyPage,
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
    const caseStudy = isCaseStudyPage ? getCaseStudyBySlug(caseStudySlug) : null
    let pageTitle = homePageTitle
    let pageDescription = homePageDescription
    let pagePath = '/'
    let pageImage = `${siteUrl}/og-image.png`
    let pageRobots = isPrivatePage ? 'noindex, nofollow' : 'index, follow'

    if (isRetoucherPortalPage) {
      pageTitle = retoucherPortalTitle
      pageDescription = retoucherPortalDescription
      pagePath = retoucherPortalPath
    } else if (isCaseStudyPage && caseStudy) {
      pageTitle = caseStudy.seoTitle
      pageDescription = caseStudy.metaDescription
      pagePath = getCaseStudyPath(caseStudy.slug)
      pageImage = new URL(caseStudy.afterSrc, siteUrl).toString()
    } else if (isCaseStudyPage) {
      pageTitle = 'Case Study Not Found | MemoryFix AI'
      pageDescription =
        'The requested old photo restoration case study is not available.'
      pagePath = caseStudiesIndexPath
      pageRobots = 'noindex, nofollow'
    } else if (isCaseStudiesIndexPage) {
      pageTitle = caseStudiesIndexTitle
      pageDescription = caseStudiesIndexDescription
      pagePath = caseStudiesIndexPath
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

    const pageUrl = new URL(pagePath, siteUrl).toString()

    document.title = pageTitle
    upsertCanonicalLink(pageUrl)
    upsertMetaTag('name', 'description', pageDescription)
    upsertMetaTag('name', 'robots', pageRobots)
    upsertMetaTag('property', 'og:title', pageTitle)
    upsertMetaTag('property', 'og:description', pageDescription)
    upsertMetaTag('property', 'og:type', 'website')
    upsertMetaTag('property', 'og:url', pageUrl)
    upsertMetaTag('property', 'og:image', pageImage)
    upsertMetaTag('name', 'twitter:card', 'summary_large_image')
    upsertMetaTag('name', 'twitter:image', pageImage)
    upsertMetaTag('name', 'twitter:title', pageTitle)
    upsertMetaTag('name', 'twitter:description', pageDescription)
    upsertMetaTag('name', 'twitter:url', pageUrl)

    if (isCaseStudiesIndexPage) {
      upsertJsonLdScript('page-breadcrumbs', {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            item: `${siteUrl}/`,
            name: 'Home',
            position: 1,
          },
          {
            '@type': 'ListItem',
            item: pageUrl,
            name: 'Case Studies',
            position: 2,
          },
        ],
      })
    } else if (isCaseStudyPage && caseStudy) {
      upsertJsonLdScript('page-breadcrumbs', {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            item: `${siteUrl}/`,
            name: 'Home',
            position: 1,
          },
          {
            '@type': 'ListItem',
            item: `${siteUrl}${caseStudiesIndexPath}`,
            name: 'Case Studies',
            position: 2,
          },
          {
            '@type': 'ListItem',
            item: pageUrl,
            name: caseStudy.title,
            position: 3,
          },
        ],
      })
      upsertJsonLdScript('page-article', {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: caseStudy.title,
        image: [pageImage],
        mainEntityOfPage: pageUrl,
        description: caseStudy.metaDescription,
      })
    } else {
      upsertJsonLdScript('page-breadcrumbs', {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: pageTitle,
      })
      upsertJsonLdScript('page-article', {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: pageTitle,
      })
    }
  }, [
    caseStudySlug,
    isCaseStudiesIndexPage,
    isCaseStudyPage,
    isAdminReviewPage,
    isHumanRestoreSecureUploadPage,
    isHumanRestoreSuccessPage,
    isRetoucherPortalPage,
  ])
}

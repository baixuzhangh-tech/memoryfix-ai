import { isLegalPage } from '../components/LegalPage'
import {
  adminReviewPath,
  aiHdPreviewPath,
  caseStudiesIndexPath,
  caseStudyPathPrefix,
  humanRestoreSecureUploadPath,
  humanRestoreSuccessPath,
  retoucherPortalPath,
} from '../config/routes'
import {
  rememberNewLandingFlagEnabled,
  resolveNewLandingFlag,
} from '../lib/featureFlag'

/**
 * All URL-derived values App.tsx used to compute inline on every render.
 *
 * Keeping this on a dedicated hook means the giant App body no longer
 * has to sit inside 70 lines of path sniffing, and any component that
 * needs to know "am I on the success page?" can call the same hook
 * instead of re-parsing window.location independently.
 *
 * NOTE: this intentionally reads window.location directly — the app
 * does not use a router library, and the whole tree is re-mounted on
 * nav because the routes are full-page navigations. If we ever adopt
 * react-router, this is the seam to swap the underlying source.
 */
export type CurrentView = {
  currentPath: string
  currentSearchParams: URLSearchParams
  caseStudySlug: string
  defaultCheckoutEmail: string
  isAdminReviewPage: boolean
  isAiHdPreviewPage: boolean
  isCaseStudiesIndexPage: boolean
  isCaseStudyPage: boolean
  isHumanRestoreSecureUploadPage: boolean
  isHumanRestoreSuccessPage: boolean
  isLegalRoute: boolean
  /**
   * Phase 2 warm-humanist redesign opt-in. `?v=2` latches into
   * localStorage (see `src/lib/featureFlag.ts`) so PayPal's
   * redirect, which strips custom query params, still lands the
   * buyer on the new pages. `?v=1` clears the latch.
   */
  isNewLandingEnabled: boolean
  isRetoucherPortalPage: boolean
  /**
   * PayPal redirect token — present when the buyer returns from PayPal
   * approval. The success page must call capture with this value before
   * the order status will flip from pending_payment to paid.
   */
  paypalOrderToken: string
  paypalPayerId: string
  queryCheckoutRef: string
  queryOrderId: string
  secureUploadToken: string
}

export function useCurrentView(): CurrentView {
  const currentPath = window.location.pathname.replace(/\/+$/, '') || '/'
  const currentSearchParams = new URLSearchParams(window.location.search)
  const caseStudySlug = currentPath.startsWith(caseStudyPathPrefix)
    ? currentPath.slice(caseStudyPathPrefix.length).trim()
    : ''
  const explicitVersion = currentSearchParams.get('v')
  let isNewLandingEnabled = resolveNewLandingFlag(currentSearchParams)

  if (currentPath === '/' && explicitVersion !== '1' && !isNewLandingEnabled) {
    rememberNewLandingFlagEnabled()
    isNewLandingEnabled = true
  }

  return {
    caseStudySlug,
    currentPath,
    currentSearchParams,
    defaultCheckoutEmail:
      currentSearchParams.get('checkout_email') ||
      currentSearchParams.get('customer_email') ||
      currentSearchParams.get('email') ||
      '',
    isAdminReviewPage: currentPath === adminReviewPath,
    isAiHdPreviewPage: currentPath === aiHdPreviewPath,
    isCaseStudiesIndexPage: currentPath === caseStudiesIndexPath,
    isCaseStudyPage: Boolean(caseStudySlug),
    isHumanRestoreSecureUploadPage:
      currentPath === humanRestoreSecureUploadPath,
    isHumanRestoreSuccessPage: currentPath === humanRestoreSuccessPath,
    isLegalRoute: isLegalPage(currentPath),
    isNewLandingEnabled,
    isRetoucherPortalPage: currentPath === retoucherPortalPath,
    // PayPal redirect appends ?token=<PayPalOrderId>&PayerID=<id>.
    // When PayerID is present the token is a PayPal order id, not a
    // secure-upload token.
    paypalOrderToken: currentSearchParams.has('PayerID')
      ? currentSearchParams.get('token') || ''
      : '',
    paypalPayerId: currentSearchParams.get('PayerID') || '',
    queryCheckoutRef: currentSearchParams.get('checkout_ref') || '',
    queryOrderId: currentSearchParams.get('order_id') || '',
    secureUploadToken: currentSearchParams.has('PayerID')
      ? ''
      : currentSearchParams.get('token') || '',
  }
}

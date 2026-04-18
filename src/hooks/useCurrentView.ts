import { isLegalPage } from '../components/LegalPage'
import {
  adminReviewPath,
  humanRestoreSecureUploadPath,
  humanRestoreSuccessPath,
  retoucherPortalPath,
} from '../config/routes'
import { resolveNewLandingFlag } from '../lib/featureFlag'

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
  defaultCheckoutEmail: string
  isAdminReviewPage: boolean
  isHumanRestoreSecureUploadPage: boolean
  isHumanRestoreSuccessPage: boolean
  isLegalRoute: boolean
  /**
   * Phase 2 warm-humanist redesign opt-in. `?v=2` latches into
   * localStorage (see `src/lib/featureFlag.ts`) so Paddle's
   * successUrl, which strips custom query params, still lands the
   * buyer on the new pages. `?v=1` clears the latch.
   */
  isNewLandingEnabled: boolean
  isRetoucherPortalPage: boolean
  queryCheckoutRef: string
  queryOrderId: string
  secureUploadToken: string
}

export function useCurrentView(): CurrentView {
  const currentPath = window.location.pathname.replace(/\/+$/, '') || '/'
  const currentSearchParams = new URLSearchParams(window.location.search)

  return {
    currentPath,
    currentSearchParams,
    defaultCheckoutEmail:
      currentSearchParams.get('checkout_email') ||
      currentSearchParams.get('customer_email') ||
      currentSearchParams.get('email') ||
      '',
    isAdminReviewPage: currentPath === adminReviewPath,
    isHumanRestoreSecureUploadPage:
      currentPath === humanRestoreSecureUploadPath,
    isHumanRestoreSuccessPage: currentPath === humanRestoreSuccessPath,
    isLegalRoute: isLegalPage(currentPath),
    isNewLandingEnabled: resolveNewLandingFlag(currentSearchParams),
    isRetoucherPortalPage: currentPath === retoucherPortalPath,
    queryCheckoutRef: currentSearchParams.get('checkout_ref') || '',
    queryOrderId: currentSearchParams.get('order_id') || '',
    secureUploadToken: currentSearchParams.get('token') || '',
  }
}

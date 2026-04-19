/**
 * Canonical internal URL paths. Defined once here so any component can
 * compare against the current `window.location.pathname` without risk
 * of drift between the path-matching logic and the links that send
 * users to those paths.
 *
 * Public marketing / legal paths (/privacy, /terms, /refund, …) are
 * owned by `components/LegalPage` and intentionally kept separate.
 */

export const humanRestoreSecureUploadPath = '/human-restore/upload'
export const humanRestoreSuccessPath = '/human-restore/success'
export const adminReviewPath = '/admin/review'
export const retoucherPortalPath = '/retoucher'
export const caseStudiesIndexPath = '/case-studies'
export const caseStudyPathPrefix = '/case-studies/'
export const aiHdPreviewPath = '/ai-hd'

/**
 * Small pure helpers for working with email addresses we surface in the
 * UI. Moved out of App.tsx during the Phase 3 split so they can be
 * unit-tested and reused from other pages without touching the monolith.
 */

/**
 * Partially hide an email address for display next to a receipt or
 * order, e.g. `buyer@example.com` → `b***r@e*****.com`. We always keep
 * the first character of the local part and the first character of the
 * domain name so the customer can recognise their own address, and we
 * preserve the TLD verbatim because it helps trust.
 */
export function maskEmailAddress(email: string) {
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

/**
 * Canonical form we use when comparing or persisting an email captured
 * during checkout — trims whitespace and lowercases so `Alice@foo.com`
 * and `alice@foo.com` round-trip to the same key.
 */
export function normalizeCheckoutEmail(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

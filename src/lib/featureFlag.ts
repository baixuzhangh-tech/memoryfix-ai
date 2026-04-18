/**
 * Sticky feature flag for the Phase 2 warm-humanist redesign.
 *
 * Pain point: Paddle's successUrl does not preserve arbitrary query
 * params like `?v=2`, so a buyer who opens `/?v=2`, pays, and is
 * redirected to `/human-restore/success?order_id=…&provider_order_id=…`
 * would previously land on the legacy Success page because the flag
 * lived entirely in the URL.
 *
 * Solution: the flag is latched into localStorage the first time it is
 * seen in the URL. Subsequent page loads honour the latch even when
 * the URL carries no `v` param. Passing `?v=1` explicitly clears the
 * latch as an opt-out escape hatch (useful for support and A/B tests).
 */

const STORAGE_KEY = 'memoryfix:new-landing-opt-in'
const STORAGE_VALUE_ENABLED = '1'

function safeLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage
  } catch {
    return null
  }
}

/**
 * Read the current flag value, latching or clearing localStorage based
 * on the URL `v` parameter. Callers should pass a URLSearchParams built
 * from `window.location.search`.
 */
export function resolveNewLandingFlag(searchParams: URLSearchParams): boolean {
  const urlValue = searchParams.get('v')
  const storage = safeLocalStorage()

  if (urlValue === '2') {
    try {
      storage?.setItem(STORAGE_KEY, STORAGE_VALUE_ENABLED)
    } catch {
      // Ignore private-mode / quota failures — flag still works via URL.
    }
    return true
  }

  if (urlValue === '1') {
    try {
      storage?.removeItem(STORAGE_KEY)
    } catch {
      // Ignore storage failures; legacy behaviour resumes for this tab.
    }
    return false
  }

  try {
    return storage?.getItem(STORAGE_KEY) === STORAGE_VALUE_ENABLED
  } catch {
    return false
  }
}

/**
 * Local-repair credit accounting. The free tier is anchored entirely in
 * the browser — no server roundtrip — which is why this module is pure
 * DOM / localStorage / sessionStorage and never React. The App shell
 * and any future hook that wants to read or mutate the credit state
 * MUST go through these functions so the storage shape stays consistent.
 *
 * Storage keys are versioned (`_v1`) so we can safely evolve the shape
 * later by introducing `_v2` and a one-shot migration rather than
 * overwriting live user data.
 */

export const freeLocalRepairLimit = 3
export const localRepairPackCredits = 10
export const localRepairPackPrice = '$9.90'
export const humanRestoreAiHdPrice = '$6.90'
export const humanRestorePrice = '$29.90'
export const localRepairUsageStorageKey = 'memoryfix_local_repair_usage_v1'
export const pendingLocalRepairPackCheckoutKey =
  'memoryfix_pending_local_repair_pack_checkout_v1'

export type LocalRepairUsage = {
  freeUsed: number
  paidCredits: number
  totalStarted: number
  updatedAt: number
}

export type LocalRepairCreditSource =
  | 'free_local'
  | 'paid_local_credit'
  | 'limit_reached'

export function normalizeLocalRepairUsage(
  value?: Partial<LocalRepairUsage> | null
): LocalRepairUsage {
  return {
    freeUsed: Math.max(0, Number(value?.freeUsed || 0)),
    paidCredits: Math.max(0, Number(value?.paidCredits || 0)),
    totalStarted: Math.max(0, Number(value?.totalStarted || 0)),
    updatedAt: Math.max(0, Number(value?.updatedAt || 0)),
  }
}

export function readLocalRepairUsage(): LocalRepairUsage {
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

export function writeLocalRepairUsage(usage: LocalRepairUsage) {
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

export function getFreeLocalRepairsRemaining(usage: LocalRepairUsage) {
  return Math.max(0, freeLocalRepairLimit - usage.freeUsed)
}

/**
 * Attempt to spend one credit. Free credits are consumed first, then
 * paid pack credits. Returns the updated usage plus a `source` tag the
 * analytics layer uses to label which bucket funded the action.
 */
export function consumeLocalRepairCredit(): {
  allowed: boolean
  source: LocalRepairCreditSource
  usage: LocalRepairUsage
} {
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

/**
 * Grant one pack worth of paid credits. Called from the PayPal capture
 * handler once a `local_repair_pack` order is confirmed.
 */
export function addLocalRepairPackCredits() {
  const currentUsage = readLocalRepairUsage()
  const nextUsage = normalizeLocalRepairUsage({
    ...currentUsage,
    paidCredits: currentUsage.paidCredits + localRepairPackCredits,
    updatedAt: Date.now(),
  })
  writeLocalRepairUsage(nextUsage)
  return nextUsage
}

/**
 * Did the user recently start a Local Pack checkout? Valid for two
 * hours so stale sessions do not auto-credit a new browser. Used to
 * decide whether to grant credits on a successful return redirect.
 */
export function readPendingLocalRepairPackCheckout() {
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

export function rememberPendingLocalRepairPackCheckout() {
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

export function clearPendingLocalRepairPackCheckout() {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.sessionStorage.removeItem(pendingLocalRepairPackCheckoutKey)
  } catch {
    // Ignore storage failures.
  }
}

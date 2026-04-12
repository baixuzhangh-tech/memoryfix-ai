/* global globalThis */

const checkoutSuccessStorageKey = 'ls_checkout_success'
const pendingCheckoutStorageKey = 'pending_human_restore_checkout'
const pendingCheckoutRefStorageKey = 'pending_checkout_ref'
const checkoutContextMaxAgeMs = 30 * 60 * 1000

function getDefaultLocalStorage() {
  if (!globalThis.window) {
    return null
  }

  return globalThis.window.localStorage || null
}

function getDefaultSessionStorage() {
  if (!globalThis.window) {
    return null
  }

  return globalThis.window.sessionStorage || null
}

function parseStoredJson(storage, key) {
  if (!storage) {
    return null
  }

  try {
    return JSON.parse(storage.getItem(key) || '{}')
  } catch {
    return null
  }
}

function isRecentTimestamp(timestamp, now) {
  const parsedTimestamp = Number(timestamp)

  return (
    Number.isFinite(parsedTimestamp) &&
    parsedTimestamp > 0 &&
    now - parsedTimestamp < checkoutContextMaxAgeMs
  )
}

function createFallbackCheckoutRef() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }

  return `mf_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 12)}`
}

export function createHumanRestoreCheckoutRef() {
  return createFallbackCheckoutRef()
}

export function appendHumanRestoreCheckoutRef(checkoutUrl, checkoutRef) {
  if (!checkoutUrl || !checkoutRef) {
    return checkoutUrl || ''
  }

  try {
    const url = new URL(checkoutUrl)

    url.searchParams.set(
      'checkout[custom][flow]',
      'human_restore_inline_upload'
    )
    url.searchParams.set('checkout[custom][checkout_ref]', checkoutRef)

    return url.toString()
  } catch {
    return checkoutUrl
  }
}

export function readHumanRestoreCheckoutContext(options = {}) {
  const now = options.now || Date.now()
  const localStorageRef =
    options.localStorageRef === undefined
      ? getDefaultLocalStorage()
      : options.localStorageRef
  const sessionStorageRef =
    options.sessionStorageRef === undefined
      ? getDefaultSessionStorage()
      : options.sessionStorageRef
  const sessionCheckoutRef =
    sessionStorageRef?.getItem(pendingCheckoutRefStorageKey) || ''
  const successData = parseStoredJson(
    localStorageRef,
    checkoutSuccessStorageKey
  )
  const pendingData = parseStoredJson(
    localStorageRef,
    pendingCheckoutStorageKey
  )
  const hasRecentSuccess = isRecentTimestamp(successData?.timestamp, now)
  const hasRecentPending = isRecentTimestamp(pendingData?.timestamp, now)
  const pendingCheckoutRef = hasRecentPending
    ? String(pendingData?.checkoutRef || sessionCheckoutRef || '')
    : sessionCheckoutRef

  return {
    hasPendingCheckout: Boolean(hasRecentPending),
    pendingCheckoutRef,
    pendingCheckoutStartedAt:
      hasRecentPending && pendingData?.timestamp
        ? new Date(Number(pendingData.timestamp)).toISOString()
        : '',
    storedCheckoutEmail: hasRecentSuccess
      ? String(successData?.email || '')
      : '',
    storedOrderId:
      hasRecentSuccess && successData?.orderId
        ? String(successData.orderId)
        : '',
  }
}

export function rememberHumanRestorePendingCheckout(options = {}) {
  const localStorageRef =
    options.localStorageRef === undefined
      ? getDefaultLocalStorage()
      : options.localStorageRef
  const sessionStorageRef =
    options.sessionStorageRef === undefined
      ? getDefaultSessionStorage()
      : options.sessionStorageRef
  const checkoutRef = options.checkoutRef || ''
  const timestamp = options.timestamp || Date.now()

  if (sessionStorageRef && checkoutRef) {
    try {
      sessionStorageRef.setItem(pendingCheckoutRefStorageKey, checkoutRef)
    } catch {
      // sessionStorage may be unavailable
    }
  }

  if (!localStorageRef) {
    return
  }

  try {
    localStorageRef.setItem(
      pendingCheckoutStorageKey,
      JSON.stringify({ checkoutRef, timestamp })
    )
  } catch {
    // localStorage may be unavailable
  }
}

export function clearHumanRestoreStoredCheckoutContext(options = {}) {
  const localStorageRef =
    options.localStorageRef === undefined
      ? getDefaultLocalStorage()
      : options.localStorageRef

  if (!localStorageRef) {
    return
  }

  try {
    localStorageRef.removeItem(checkoutSuccessStorageKey)
    localStorageRef.removeItem(pendingCheckoutStorageKey)
  } catch {
    // localStorage may be unavailable
  }
}

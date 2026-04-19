/**
 * Umami analytics loader.
 *
 * Loaded once from `src/index.tsx` during app bootstrap. Injects the
 * Umami tracker script into <head> only when `VITE_UMAMI_WEBSITE_ID`
 * is configured, so local/dev builds and preview deploys that lack
 * the env var stay silent (no network calls, no console noise).
 *
 * After the script loads, Umami attaches a global `window.umami`
 * object exposing `.track(name, props?)` which `src/analytics.ts`
 * calls from `trackProductEvent`.
 */
const websiteId = import.meta.env.VITE_UMAMI_WEBSITE_ID as string | undefined
const scriptUrl =
  (import.meta.env.VITE_UMAMI_SCRIPT_URL as string | undefined) ||
  'https://cloud.umami.is/script.js'

let loaded = false

export function loadUmami(): void {
  if (loaded) return
  if (typeof document === 'undefined') return
  if (!websiteId) return

  loaded = true

  const existing = document.querySelector<HTMLScriptElement>(
    'script[data-umami-tracker="1"]'
  )
  if (existing) return

  const script = document.createElement('script')
  script.defer = true
  script.src = scriptUrl
  script.setAttribute('data-website-id', websiteId)
  script.setAttribute('data-auto-track', 'true')
  script.setAttribute('data-umami-tracker', '1')
  document.head.appendChild(script)
}

export function isUmamiConfigured(): boolean {
  return Boolean(websiteId)
}

/**
 * Imperative <head> helpers for per-route SEO. We deliberately avoid a
 * library like react-helmet here because the app still has a single
 * top-level App component driving routing via `window.location`, so a
 * lightweight upsert is both sufficient and easier to audit.
 */

/**
 * Insert or update a `<meta>` tag keyed by `name="..."` or
 * `property="..."`. Creating a new tag each time would accumulate
 * duplicates on client-side navigation; this function mutates the
 * existing node in place instead.
 */
export function upsertMetaTag(
  attribute: 'name' | 'property',
  key: string,
  content: string
) {
  let metaTag = document.head.querySelector<HTMLMetaElement>(
    `meta[${attribute}="${key}"]`
  )

  if (!metaTag) {
    metaTag = document.createElement('meta')
    metaTag.setAttribute(attribute, key)
    document.head.appendChild(metaTag)
  }

  metaTag.setAttribute('content', content)
}

/**
 * Insert or update `<link rel="canonical" href="...">`. Important for
 * SEO when the same component renders different logical URLs based on
 * the path (home vs /human-restore/success vs /admin/review).
 */
export function upsertCanonicalLink(href: string) {
  let canonicalLink = document.head.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]'
  )

  if (!canonicalLink) {
    canonicalLink = document.createElement('link')
    canonicalLink.setAttribute('rel', 'canonical')
    document.head.appendChild(canonicalLink)
  }

  canonicalLink.setAttribute('href', href)
}

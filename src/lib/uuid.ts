/**
 * Cheap, format-only UUID v1-v5 check. Used when accepting an order id
 * via `?order_id=...` — we want to distinguish a real order UUID from
 * a stray query string value before trusting it as a key into storage
 * or the Supabase order table.
 */
export function looksLikeUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  )
}

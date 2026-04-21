/**
 * Single source of truth for mapping product tiers.
 *
 * Two tiers are supported:
 *   - `ai_hd`: $6.9 AI HD, auto-delivered as soon as the AI pipeline
 *     produces a draft. No human review required.
 *   - `human`: $29.9 human-retouched, goes through the existing
 *     needs_review -> assigned -> delivered workflow.
 *
 * With PayPal, tiers are stored directly by name in the `variant_id`
 * field. Legacy records may still have Paddle priceIds — the resolver
 * handles both formats transparently.
 */

export const HUMAN_RESTORE_TIERS = Object.freeze(['ai_hd', 'human'])

export function getAiHdPriceId() {
  return process.env.PADDLE_HUMAN_RESTORE_AI_HD_PRICE_ID || ''
}

export function getHumanPriceId() {
  return process.env.PADDLE_HUMAN_RESTORE_PRICE_ID || ''
}

export function resolvePriceIdForTier(tier) {
  if (tier === 'ai_hd') {
    return getAiHdPriceId()
  }
  return getHumanPriceId()
}

export function resolveTierFromPriceId(priceId) {
  const value = String(priceId || '')

  if (!value) {
    return 'human'
  }

  const aiHd = getAiHdPriceId()

  if (aiHd && value === aiHd) {
    return 'ai_hd'
  }

  return 'human'
}

export function resolveTierFromRecord(record) {
  if (!record) {
    return 'human'
  }

  const variantId = record.variant_id || record.price_id || ''

  // New PayPal path: tier name stored directly
  if (
    variantId === 'ai_hd' ||
    variantId === 'human' ||
    variantId === 'local_repair_pack'
  ) {
    return variantId === 'local_repair_pack' ? 'human' : variantId
  }

  // Legacy Paddle path: resolve from priceId
  return resolveTierFromPriceId(variantId)
}

export function isSupportedTier(tier) {
  return tier === 'ai_hd' || tier === 'human' || tier === 'local_repair_pack'
}

export function isSupportedPriceId(priceId) {
  const value = String(priceId || '')

  if (!value) {
    return false
  }

  // Accept tier names directly (PayPal)
  if (isSupportedTier(value)) {
    return true
  }

  // Legacy Paddle priceId check
  const aiHd = getAiHdPriceId()
  const human = getHumanPriceId()

  return (aiHd && value === aiHd) || (human && value === human)
}

export function getProductNameForTier(tier) {
  if (tier === 'ai_hd') {
    return 'MemoryFix AI HD Restore'
  }
  return 'MemoryFix Human-assisted Restore'
}

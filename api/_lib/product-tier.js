/**
 * Single source of truth for mapping Paddle priceIds <-> product tier.
 *
 * Two tiers are supported:
 *   - `ai_hd`: $6.9 AI HD, auto-delivered as soon as the AI pipeline
 *     produces a draft. No human review required.
 *   - `human`: $29.9 human-retouched, goes through the existing
 *     needs_review -> assigned -> delivered workflow.
 *
 * The tier is derived from the Paddle priceId on the order/job
 * (`variant_id` field) so we do not require a schema migration.
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

  return resolveTierFromPriceId(record.variant_id || record.price_id || '')
}

export function isSupportedPriceId(priceId) {
  const value = String(priceId || '')

  if (!value) {
    return false
  }

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

import { track } from '@vercel/analytics/react'

type AnalyticsProperties = Record<string, string | number | boolean | null>

interface UmamiGlobal {
  track: (name: string, data?: Record<string, unknown>) => void
}

declare global {
  interface Window {
    umami?: UmamiGlobal
  }
}

/**
 * Map an internal product event + its properties to the canonical
 * marketing "Goal" name used in the Umami dashboard. Keeping this
 * mapping centralized means call sites keep emitting descriptive
 * event names (ai_hd_preview_started, complete_human_restore_checkout)
 * while the funnel dashboard tracks the four canonical goals defined
 * in growth/checklist.md: preview_started, preview_generated,
 * checkout_clicked, payment_confirmed.
 *
 * For `click_human_restore` we only alias to `checkout_clicked` when
 * the destination actually opens a Paddle surface — intermediate
 * clicks (routing to /ai-hd, pending onboarding notices, tier
 * upsells) are explicitly excluded to keep the goal count clean.
 */
function goalAliasFor(
  name: string,
  properties?: AnalyticsProperties
): string | null {
  switch (name) {
    case 'ai_hd_preview_started':
      return 'preview_started'
    case 'ai_hd_preview_ready':
      return 'preview_generated'
    case 'ai_hd_unlock_clicked':
      return 'checkout_clicked'
    case 'click_human_restore': {
      const destination = properties?.destination
      if (
        destination === 'paddle_overlay' ||
        destination === 'paddle_hosted_fallback'
      ) {
        return 'checkout_clicked'
      }
      return null
    }
    case 'complete_human_restore_checkout':
    case 'complete_local_repair_pack_checkout':
      return 'payment_confirmed'
    default:
      return null
  }
}

function umamiTrack(name: string, properties?: AnalyticsProperties) {
  if (typeof window === 'undefined') return
  const { umami } = window
  if (!umami || typeof umami.track !== 'function') return
  try {
    if (properties && Object.keys(properties).length > 0) {
      umami.track(name, properties)
    } else {
      umami.track(name)
    }
  } catch {
    // Analytics should never block the product workflow.
  }
}

export default function trackProductEvent(
  name: string,
  properties?: AnalyticsProperties
) {
  try {
    track(name, properties)
  } catch {
    // Analytics should never block the product workflow.
  }
  // Dual-send to Umami under the detailed event name so debugging
  // still has full fidelity, plus the canonical Goal alias (if any)
  // so the funnel dashboard matches growth/checklist.md verbatim.
  umamiTrack(name, properties)
  const goal = goalAliasFor(name, properties)
  if (goal && goal !== name) {
    umamiTrack(goal, properties)
  }
}

import { track } from '@vercel/analytics/react'

type AnalyticsProperties = Record<string, string | number | boolean | null>

export default function trackProductEvent(
  name: string,
  properties?: AnalyticsProperties
) {
  try {
    track(name, properties)
  } catch {
    // Analytics should never block the product workflow.
  }
}

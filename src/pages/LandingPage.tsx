import * as React from 'react'

import FileSelect from '@/components/FileSelect'
import SiteFooter from '@/components/SiteFooter'
import { Gallery } from '@/sections/landing/Gallery'
import { Hero } from '@/sections/landing/Hero'
import { HowItWorks } from '@/sections/landing/HowItWorks'
import { Pricing } from '@/sections/landing/Pricing'
import { Trust } from '@/sections/landing/Trust'

export interface LandingPageProps {
  isHumanRestorePaymentReady: boolean
  onFileSelection: (file: File) => void
  onLaunchPaidCheckout: () => void
}

/**
 * New warm-humanist Landing page (Phase 2-A).
 *
 * Behind `?v=2` feature flag in App.tsx, so the legacy home page keeps
 * serving 100% of traffic until we explicitly cut over. Two external
 * integration points from the existing app:
 *
 *   - onLaunchPaidCheckout: triggers the existing Paddle overlay via
 *     handleLaunchHumanRestoreCheckout() in App.tsx.
 *   - onFileSelection: reuses the existing handleFileSelection() so
 *     "Try for free in your browser" loads the in-app Editor exactly
 *     like the legacy home's FileSelect did.
 *
 * The secondary CTA uses a hidden file input so the headline button can
 * also route into the same free-editor flow.
 */
export function LandingPage({
  isHumanRestorePaymentReady,
  onFileSelection,
  onLaunchPaidCheckout,
}: LandingPageProps) {
  const fileSelectTriggerRef = React.useRef<HTMLButtonElement | null>(null)
  const hiddenInputRef = React.useRef<HTMLInputElement | null>(null)

  function openFilePicker() {
    if (hiddenInputRef.current) {
      hiddenInputRef.current.click()
    }
  }

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) {
      onFileSelection(file)
    }
    if (hiddenInputRef.current) {
      hiddenInputRef.current.value = ''
    }
  }

  return (
    <div className="bg-background">
      <Hero
        onPrimaryCta={onLaunchPaidCheckout}
        onSecondaryCta={openFilePicker}
        primaryCtaDisabled={!isHumanRestorePaymentReady}
      />
      <HowItWorks />
      <Gallery />
      <Pricing
        onPrimaryCta={onLaunchPaidCheckout}
        primaryCtaDisabled={!isHumanRestorePaymentReady}
      />
      <Trust />
      <SiteFooter />

      <input
        ref={hiddenInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleInputChange}
        aria-hidden
      />
      {/* FileSelect is referenced here for visual/logic parity with the old
          home in case we want to surface its preview/drop target variant
          later. Kept off-screen for now. */}
      <div className="sr-only">
        <FileSelect onSelection={onFileSelection} />
        <button ref={fileSelectTriggerRef} type="button" aria-hidden>
          fs-trigger
        </button>
      </div>
    </div>
  )
}

export default LandingPage

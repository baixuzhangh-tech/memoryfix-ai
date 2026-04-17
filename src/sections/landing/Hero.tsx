import * as React from 'react'
import { ArrowRight, ShieldCheck } from 'lucide-react'

import { BeforeAfterSlider } from '@/components/domain/BeforeAfterSlider'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { landingHero } from '@/config/landing'

export interface HeroProps {
  onPrimaryCta: () => void
  onSecondaryCta: () => void
  primaryCtaDisabled?: boolean
  className?: string
}

/**
 * Emotional-narrative hero. Two-column on desktop (copy | visual), stacked
 * on mobile. Uses the mid-tier radius on the slider (via BeforeAfterSlider)
 * and the largest serif weight for the headline.
 *
 * The "after" image is temporarily the same file as the "before" with a
 * CSS filter simulating warmth + light correction. Swap both sources in
 * src/config/landing.ts once a real restored pair is available.
 */
export function Hero({
  className,
  onPrimaryCta,
  onSecondaryCta,
  primaryCtaDisabled = false,
}: HeroProps) {
  return (
    <section
      className={cn(
        'relative overflow-hidden bg-background py-16 md:py-24',
        className
      )}
    >
      <div className="container grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        <div className="max-w-xl">
          <p className="mb-4 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Heirloom photo restoration
          </p>
          <h1 className="font-serif text-4xl font-semibold leading-[1.05] tracking-tight text-foreground md:text-5xl lg:text-6xl">
            {landingHero.headline}
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground md:text-xl">
            {landingHero.subhead}
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              variant="accent"
              size="lg"
              onClick={onPrimaryCta}
              disabled={primaryCtaDisabled}
              className="gap-2"
            >
              {landingHero.primaryCtaLabel}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
            <Button variant="outline" size="lg" onClick={onSecondaryCta}>
              {landingHero.secondaryCtaLabel}
            </Button>
          </div>

          <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
            {landingHero.trustLine}
          </p>
        </div>

        <div className="relative">
          <BeforeAfterSlider
            beforeSrc={landingHero.heroBeforeSrc}
            afterSrc={landingHero.heroAfterSrc}
            beforeLabel="Original"
            afterLabel="Restored"
          />
          <p className="mt-4 text-center font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Drag to compare
          </p>
        </div>
      </div>
    </section>
  )
}

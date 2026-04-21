import * as React from 'react'
import { ArrowRight, ChevronDown, ShieldCheck } from 'lucide-react'

import { BeforeAfterSlider } from '@/components/domain/BeforeAfterSlider'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { landingHero } from '@/config/landing'

export interface HeroProps {
  onPrimaryCta: () => void
  onSecondaryCta: () => void
  onTertiaryCta: () => void
  primaryCtaDisabled?: boolean
  className?: string
}

/**
 * Emotional-narrative hero. Two-column on desktop (copy | visual), stacked
 * on mobile.
 *
 * Visual intent:
 *   - Copy column is vertically centred against the visual to avoid the
 *     "tall image + short column = dead whitespace" imbalance.
 *   - The final headline word carries a warm-gold hand-drawn underline so
 *     the eye lands on the emotional payoff (".. back into FOCUS.").
 *   - The slider sits inside a cream paper frame with a soft warm shadow
 *     and a <=1° tilt so it reads as a printed photograph pinned to the
 *     page, not a floating SaaS screenshot.
 *   - A subtle scroll cue (animated chevron) peeks below the fold so
 *     visitors know the story continues (gallery / how it works / pricing).
 */
export function Hero({
  className,
  onPrimaryCta,
  onSecondaryCta,
  onTertiaryCta,
  primaryCtaDisabled = false,
}: HeroProps) {
  return (
    <section
      className={cn(
        'relative overflow-hidden bg-gradient-to-b from-[#f0e6d6] via-[#faf6f0] to-background pb-10 pt-10 md:pb-14 md:pt-16',
        className
      )}
    >
      <div className="container grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        <div className="max-w-xl">
          <p className="mb-4 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Heirloom photo restoration
          </p>
          <h1 className="font-serif text-4xl font-semibold leading-[1.05] tracking-tight text-foreground md:text-5xl lg:text-6xl">
            {landingHero.headlinePrefix}
            <span className="relative whitespace-nowrap">
              {landingHero.headlineAccent}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 -bottom-1 h-[0.18em] rounded-full bg-gradient-to-r from-transparent via-[#c79a4a] to-transparent opacity-80"
              />
            </span>
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
            <Button
              variant="outline"
              size="lg"
              onClick={onSecondaryCta}
              disabled={primaryCtaDisabled}
            >
              {landingHero.secondaryCtaLabel}
            </Button>
          </div>

          <button
            type="button"
            onClick={onTertiaryCta}
            className="mt-4 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {landingHero.tertiaryCtaLabel}
          </button>

          <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
            {landingHero.trustLine}
          </p>
        </div>

        <div className="relative mx-auto w-full max-w-[22rem] md:max-w-[24rem] lg:max-w-[26rem]">
          <div
            className={cn(
              // Cream paper frame + soft warm shadow so the before/after
              // reads as a printed photograph on a matte mount. We keep
              // the slider on a 4/5 aspect (instead of the default 3/4)
              // so it stays fully inside a standard laptop viewport
              // alongside the copy column.
              'rounded-md bg-[#f5e7cf] p-3 shadow-[0_28px_56px_-20px_rgba(72,40,14,0.45)]'
            )}
          >
            <BeforeAfterSlider
              beforeSrc={landingHero.heroBeforeSrc}
              afterSrc={landingHero.heroAfterSrc}
              beforeLabel="Original"
              afterLabel="Restored"
              autoDemo
              className="aspect-[4/5] rounded-sm"
            />
          </div>
          <p className="mt-3 text-center font-mono text-[11px] font-medium uppercase tracking-widest text-foreground/70">
            <span aria-hidden>←</span> Drag to compare{' '}
            <span aria-hidden>→</span>
          </p>
          <p className="mt-1 text-center text-[11px] text-muted-foreground">
            AI preview — a human retoucher refines every face
          </p>
        </div>
      </div>

      <a
        href="#gallery"
        aria-label="Scroll to see more"
        className="mx-auto mt-10 flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition hover:text-foreground motion-safe:animate-bounce"
      >
        <ChevronDown className="h-6 w-6" aria-hidden />
      </a>
    </section>
  )
}

import * as React from 'react'
import { Check } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { landingPricing, LandingPricingTier } from '@/config/landing'

export interface PricingProps {
  className?: string
  onSelectTier: (tier: LandingPricingTier['id']) => void
  primaryCtaDisabled?: boolean
}

export function Pricing({
  className,
  onSelectTier,
  primaryCtaDisabled = false,
}: PricingProps) {
  return (
    <section
      id="pricing"
      className={cn('relative bg-secondary/40 py-20 md:py-28', className)}
    >
      <div className="container">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Pricing
          </p>
          <h2 className="font-serif text-3xl font-semibold leading-tight tracking-tight text-foreground md:text-4xl">
            {landingPricing.tagline}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            {landingPricing.subheading}
          </p>
        </div>

        <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-3">
          {landingPricing.tiers.map(tier => {
            const isFeatured = tier.id === 'human'
            const isFreeLocal = tier.id === 'free_local'

            return (
              <Card
                key={tier.id}
                className={cn(
                  'flex flex-col border-primary/20 shadow-float',
                  isFeatured && 'border-primary/60 ring-1 ring-primary/30'
                )}
              >
                <CardContent className="flex flex-1 flex-col gap-6 p-8 md:p-10">
                  <div className="flex flex-col gap-2">
                    {tier.highlight && (
                      <p className="font-mono text-xs uppercase tracking-widest text-primary">
                        {tier.highlight}
                      </p>
                    )}
                    <h3 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground md:text-3xl">
                      {tier.name}
                    </h3>
                    <div className="flex items-baseline gap-2">
                      <span className="font-serif text-5xl font-semibold text-foreground">
                        {tier.price}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {tier.priceCadence}
                      </span>
                    </div>
                    <p className="mt-2 text-base leading-relaxed text-muted-foreground">
                      {tier.description}
                    </p>
                  </div>

                  <ul className="flex flex-1 flex-col gap-3">
                    {tier.features.map(feature => (
                      <li key={feature} className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                          <Check className="h-3.5 w-3.5" aria-hidden />
                        </span>
                        <span className="text-base leading-relaxed text-foreground">
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {tier.caveat && (
                    <p className="rounded-md border border-primary/20 bg-background/50 p-3 text-xs leading-relaxed text-muted-foreground">
                      {tier.caveat}
                    </p>
                  )}

                  <div className="flex flex-col gap-3">
                    <Button
                      variant={getButtonVariant({ isFeatured, isFreeLocal })}
                      size="lg"
                      onClick={() => onSelectTier(tier.id)}
                      disabled={!isFreeLocal && primaryCtaDisabled}
                    >
                      {tier.ctaLabel}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        <p className="mx-auto mt-8 max-w-2xl text-center text-xs leading-relaxed text-muted-foreground">
          {landingPricing.footnote}
        </p>
      </div>
    </section>
  )
}

function getButtonVariant({
  isFeatured,
  isFreeLocal,
}: {
  isFeatured: boolean
  isFreeLocal: boolean
}): 'accent' | 'outline' | 'secondary' {
  if (isFeatured) return 'accent'
  if (isFreeLocal) return 'outline'
  return 'secondary'
}

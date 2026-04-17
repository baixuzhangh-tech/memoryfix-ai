import * as React from 'react'
import { Check } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { landingPricing } from '@/config/landing'

export interface PricingProps {
  className?: string
  onPrimaryCta: () => void
  primaryCtaDisabled?: boolean
}

export function Pricing({
  className,
  onPrimaryCta,
  primaryCtaDisabled = false,
}: PricingProps) {
  return (
    <section
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
        </div>

        <Card className="mx-auto max-w-2xl border-primary/30 shadow-float">
          <CardContent className="flex flex-col gap-8 p-8 md:p-12">
            <div className="flex flex-col gap-2">
              <p className="font-mono text-xs uppercase tracking-widest text-primary">
                Included on every order
              </p>
              <h3 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground md:text-3xl">
                {landingPricing.planName}
              </h3>
              <div className="flex items-baseline gap-2">
                <span className="font-serif text-5xl font-semibold text-foreground">
                  {landingPricing.price}
                </span>
                <span className="text-sm text-muted-foreground">
                  {landingPricing.priceCadence}
                </span>
              </div>
              <p className="mt-2 text-base leading-relaxed text-muted-foreground">
                {landingPricing.description}
              </p>
            </div>

            <ul className="flex flex-col gap-3">
              {landingPricing.features.map(feature => (
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

            <div className="flex flex-col gap-3">
              <Button
                variant="accent"
                size="lg"
                onClick={onPrimaryCta}
                disabled={primaryCtaDisabled}
              >
                {landingPricing.primaryCtaLabel}
              </Button>
              <p className="text-center text-xs leading-relaxed text-muted-foreground">
                {landingPricing.footnote}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}

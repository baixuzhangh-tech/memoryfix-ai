import * as React from 'react'
import { Quote, ShieldCheck, ChevronDown } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  landingFaq,
  landingGuarantee,
  landingTestimonials,
} from '@/config/landing'

export interface TrustProps {
  className?: string
}

export function Trust({ className }: TrustProps) {
  return (
    <section className={cn('bg-background py-20 md:py-28', className)}>
      <div className="container flex flex-col gap-20">
        <div className="flex flex-col gap-10">
          <div className="mx-auto max-w-2xl text-center">
            <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              What customers say
            </p>
            <h2 className="font-serif text-3xl font-semibold leading-tight tracking-tight text-foreground md:text-4xl">
              Restored with care.
            </h2>
          </div>

          <ul className="grid gap-6 md:grid-cols-3">
            {landingTestimonials.map(testimonial => (
              <li key={testimonial.name}>
                <Card className="h-full border-none bg-card shadow-card">
                  <CardContent className="flex h-full flex-col gap-4 p-6">
                    <Quote className="h-6 w-6 text-primary/50" aria-hidden />
                    <p className="text-base leading-relaxed text-foreground">
                      {testimonial.quote}
                    </p>
                    <div className="mt-auto">
                      <p className="font-serif text-sm font-semibold text-foreground">
                        {testimonial.name}
                      </p>
                      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                        {testimonial.role}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </div>

        <Card className="mx-auto max-w-3xl border-primary/20 bg-secondary/40 shadow-card">
          <CardContent className="flex flex-col gap-4 p-8 md:flex-row md:items-center md:gap-6 md:p-10">
            <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <ShieldCheck className="h-6 w-6" aria-hidden />
            </span>
            <div>
              <h3 className="font-serif text-xl font-semibold leading-tight tracking-tight text-foreground md:text-2xl">
                {landingGuarantee.title}
              </h3>
              <p className="mt-2 text-base leading-relaxed text-muted-foreground">
                {landingGuarantee.copy}
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="mx-auto w-full max-w-3xl">
          <div className="mb-8 text-center">
            <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Frequently asked
            </p>
            <h2 className="font-serif text-3xl font-semibold leading-tight tracking-tight text-foreground md:text-4xl">
              Things people ask first.
            </h2>
          </div>
          <ul className="flex flex-col gap-3">
            {landingFaq.map(entry => (
              <li key={entry.question}>
                <details className="group rounded-md border bg-card px-5 py-4 shadow-card transition-shadow open:shadow-float">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-serif text-lg font-medium text-foreground [&::-webkit-details-marker]:hidden">
                    <span>{entry.question}</span>
                    <ChevronDown
                      className="h-5 w-5 flex-shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                      aria-hidden
                    />
                  </summary>
                  <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                    {entry.answer}
                  </p>
                </details>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

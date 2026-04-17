import * as React from 'react'
import { Upload, Sparkles, Mail } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { landingHowItWorks } from '@/config/landing'

const stepIcons = [Upload, Sparkles, Mail] as const

export interface HowItWorksProps {
  className?: string
}

export function HowItWorks({ className }: HowItWorksProps) {
  return (
    <section
      className={cn('relative bg-secondary/40 py-20 md:py-28', className)}
    >
      <div className="container">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            How it works
          </p>
          <h2 className="font-serif text-3xl font-semibold leading-tight tracking-tight text-foreground md:text-4xl">
            Three quiet steps. No guesswork.
          </h2>
        </div>

        <ol className="grid gap-6 md:grid-cols-3">
          {landingHowItWorks.map((step, index) => {
            const Icon = stepIcons[index] || Upload
            return (
              <li key={step.step}>
                <Card className="h-full border-none bg-card shadow-card">
                  <CardContent className="flex h-full flex-col gap-4 p-8">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" aria-hidden />
                      </span>
                      <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                        Step {step.step}
                      </span>
                    </div>
                    <h3 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground">
                      {step.title}
                    </h3>
                    <p className="text-base leading-relaxed text-muted-foreground">
                      {step.description}
                    </p>
                  </CardContent>
                </Card>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}

import * as React from 'react'

import trackProductEvent from '@/analytics'
import SiteFooter from '@/components/SiteFooter'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  caseStudies,
  caseStudiesIndexDescription,
  getCaseStudyPath,
} from '@/config/caseStudies'

export interface CaseStudiesPageProps {
  isHumanRestorePaymentReady: boolean
  onPrimaryCta: () => void
}

export function CaseStudiesPage({
  isHumanRestorePaymentReady,
  onPrimaryCta,
}: CaseStudiesPageProps) {
  return (
    <div className="bg-background">
      <section className="bg-background py-16 md:py-20">
        <div className="container">
          <div className="mx-auto max-w-3xl text-center">
            <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Case studies
            </p>
            <h1 className="font-serif text-4xl font-semibold leading-tight tracking-tight text-foreground md:text-5xl">
              Before-and-after restorations people can actually judge.
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
              {caseStudiesIndexDescription}
            </p>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            {caseStudies.map(caseStudy => (
              <Card
                key={caseStudy.slug}
                className="overflow-hidden border-primary/15 shadow-card"
              >
                <div className="grid gap-0 md:grid-cols-2">
                  <div className="relative aspect-[4/5] bg-muted">
                    <img
                      src={caseStudy.beforeSrc}
                      alt={caseStudy.beforeAlt}
                      className="absolute inset-0 h-full w-full object-cover"
                      loading="lazy"
                    />
                    <span className="absolute left-3 top-3 rounded-sm bg-foreground/85 px-2 py-1 font-mono text-xs uppercase tracking-widest text-background">
                      Before
                    </span>
                  </div>
                  <div className="relative aspect-[4/5] bg-muted">
                    <img
                      src={caseStudy.afterSrc}
                      alt={caseStudy.afterAlt}
                      className="absolute inset-0 h-full w-full object-cover"
                      loading="lazy"
                    />
                    <span className="absolute left-3 top-3 rounded-sm bg-foreground/85 px-2 py-1 font-mono text-xs uppercase tracking-widest text-background">
                      After
                    </span>
                  </div>
                </div>
                <CardContent className="flex flex-col gap-4 p-6">
                  <div>
                    <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
                      {caseStudy.heroKicker}
                    </p>
                    <h2 className="mt-2 font-serif text-2xl font-semibold leading-tight text-foreground">
                      {caseStudy.title}
                    </h2>
                    <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                      {caseStudy.excerpt}
                    </p>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <a
                      href={getCaseStudyPath(caseStudy.slug)}
                      className="inline-flex text-sm font-semibold text-primary underline-offset-4 hover:underline"
                      onClick={() => {
                        trackProductEvent('click_case_study_index_card', {
                          case_study_slug: caseStudy.slug,
                        })
                      }}
                    >
                      Read the full case study
                    </a>
                    <Button
                      variant="outline"
                      onClick={onPrimaryCta}
                      disabled={!isHumanRestorePaymentReady}
                    >
                      Restore my photo
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
      <SiteFooter />
    </div>
  )
}

export default CaseStudiesPage

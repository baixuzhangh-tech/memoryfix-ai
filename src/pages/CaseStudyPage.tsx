import * as React from 'react'

import trackProductEvent from '@/analytics'
import SiteFooter from '@/components/SiteFooter'
import { BeforeAfterSlider } from '@/components/domain/BeforeAfterSlider'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { getCaseStudyBySlug, getCaseStudyPath } from '@/config/caseStudies'

export interface CaseStudyPageProps {
  isHumanRestorePaymentReady: boolean
  onPrimaryCta: () => void
  slug: string
}

function Section({
  children,
  title,
}: {
  children: React.ReactNode
  title: string
}) {
  return (
    <section className="mt-10">
      <h2 className="font-serif text-2xl font-semibold text-foreground md:text-3xl">
        {title}
      </h2>
      <div className="mt-4 text-base leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  )
}

export function CaseStudyPage({
  isHumanRestorePaymentReady,
  onPrimaryCta,
  slug,
}: CaseStudyPageProps) {
  const caseStudy = getCaseStudyBySlug(slug)

  React.useEffect(() => {
    if (!caseStudy) {
      trackProductEvent('view_case_study_missing', { case_study_slug: slug })
      return
    }

    trackProductEvent('view_case_study', { case_study_slug: caseStudy.slug })
  }, [caseStudy, slug])

  if (!caseStudy) {
    return (
      <div className="bg-background">
        <section className="bg-background py-16 md:py-20">
          <div className="container max-w-3xl">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Case study not found
            </p>
            <h1 className="mt-3 font-serif text-4xl font-semibold text-foreground">
              This restoration page is not available.
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              The case-study link may be outdated. You can browse the current
              restoration library below.
            </p>
            <div className="mt-8 flex gap-3">
              <a
                href="/case-studies"
                className="inline-flex rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
              >
                View case studies
              </a>
              <a
                href="/"
                className="inline-flex rounded-md border border-border px-5 py-3 text-sm font-semibold text-foreground"
              >
                Back home
              </a>
            </div>
          </div>
        </section>
        <SiteFooter />
      </div>
    )
  }

  return (
    <div className="bg-background">
      <article className="bg-background py-16 md:py-20">
        <div className="container max-w-5xl">
          <div className="mb-8">
            <a
              href="/case-studies"
              className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground underline-offset-4 hover:underline"
            >
              Case studies
            </a>
            <p className="mt-4 font-mono text-xs uppercase tracking-[0.18em] text-primary">
              {caseStudy.heroKicker}
            </p>
            <h1 className="mt-3 max-w-4xl font-serif text-4xl font-semibold leading-tight text-foreground md:text-5xl">
              {caseStudy.title}
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-relaxed text-muted-foreground">
              {caseStudy.excerpt}
            </p>
          </div>

          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
            <BeforeAfterSlider
              beforeSrc={caseStudy.beforeSrc}
              afterSrc={caseStudy.afterSrc}
              beforeAlt={caseStudy.beforeAlt}
              afterAlt={caseStudy.afterAlt}
              beforeLabel="Original"
              afterLabel="Restored"
              className="aspect-[4/5]"
            />

            <Card className="border-primary/20 shadow-card">
              <CardContent className="p-6 md:p-8">
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Why this case matters
                </p>
                <h2 className="mt-3 font-serif text-2xl font-semibold text-foreground">
                  {caseStudy.storyTitle}
                </h2>
                <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                  {caseStudy.whyItMatters}
                </p>
                <div className="mt-6 flex flex-col gap-3">
                  <Button
                    variant="accent"
                    onClick={onPrimaryCta}
                    disabled={!isHumanRestorePaymentReady}
                  >
                    Restore my photo — from $6.90
                  </Button>
                  <a
                    href="/#pricing"
                    className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
                  >
                    See pricing and delivery details
                  </a>
                </div>
              </CardContent>
            </Card>
          </div>

          <Section title="What was damaged">
            <p>{caseStudy.problemSummary}</p>
            <ul className="mt-4 list-disc space-y-2 pl-6">
              {caseStudy.damageNotes.map(note => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </Section>

          <Section title="What was restored">
            <ul className="list-disc space-y-2 pl-6">
              {caseStudy.repairNotes.map(note => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </Section>

          <Section title="Result">
            <p>{caseStudy.resultsSummary}</p>
          </Section>

          <section className="mt-12 rounded-lg border border-primary/15 bg-secondary/40 p-6 md:p-8">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Ready to restore your own photo?
            </p>
            <h2 className="mt-3 font-serif text-2xl font-semibold text-foreground md:text-3xl">
              Bring one important family photo back into focus.
            </h2>
            <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground">
              Every paid restoration goes through the same core flow: careful AI
              draft, controlled finishing, and a human review before delivery.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button
                variant="accent"
                onClick={onPrimaryCta}
                disabled={!isHumanRestorePaymentReady}
              >
                Start my restoration
              </Button>
              <a
                href="/case-studies"
                className="inline-flex items-center justify-center rounded-md border border-border px-5 py-3 text-sm font-semibold text-foreground"
                onClick={() => {
                  trackProductEvent('click_case_study_back_to_index', {
                    case_study_slug: caseStudy.slug,
                  })
                }}
              >
                Browse more case studies
              </a>
            </div>
          </section>
        </div>
      </article>
      <SiteFooter />
    </div>
  )
}

export default CaseStudyPage

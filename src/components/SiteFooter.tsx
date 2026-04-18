import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * Source email for the footer Support link and the default we fall
 * back to when no env var is set. Keeps the footer self-contained so
 * it can be dropped into any landing-style page without needing the
 * caller to thread the contact address through props.
 */
const supportEmail =
  import.meta.env.VITE_HUMAN_RESTORE_CONTACT_EMAIL ||
  import.meta.env.VITE_SUPPORT_EMAIL ||
  'hello@artgen.site'

interface FooterLink {
  href: string
  label: string
}

const legalLinks: FooterLink[] = [
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/acceptable-use', label: 'Acceptable Use' },
  { href: '/delivery', label: 'Delivery' },
  { href: '/refund', label: 'Refund' },
]

export interface SiteFooterProps {
  className?: string
}

/**
 * Shared footer for the Phase 2 warm-humanist landing (`?v=2`).
 *
 * Renders the legal links Paddle requires for payment compliance
 * (Privacy / Terms / Acceptable Use / Delivery / Refund), a direct
 * Support mailto, an open-source acknowledgement for inpaint-web,
 * and a short copyright line. Design tokens mirror the rest of the
 * landing sections: `bg-background` canvas, `text-muted-foreground`
 * body, `font-serif` brand mark, `font-mono` micro-caps labels.
 *
 * Not used by the legacy home page — that file keeps its own
 * inline footer so it can be deleted in one piece during cut-over.
 */
export function SiteFooter({ className }: SiteFooterProps) {
  const currentYear = new Date().getFullYear()

  return (
    <footer
      className={cn(
        'border-t border-border/60 bg-background py-12 md:py-16',
        className
      )}
    >
      <div className="container flex flex-col gap-10">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <p className="font-serif text-xl font-semibold tracking-tight text-foreground">
              MemoryFix AI
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Privacy-first old photo restoration. Try free locally in your
              browser, or pay for one human-reviewed cloud restore.
            </p>
          </div>

          <nav
            className="flex flex-col gap-6 sm:flex-row sm:gap-12"
            aria-label="Footer"
          >
            <div>
              <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Policies
              </p>
              <ul className="flex flex-col gap-2">
                {legalLinks.map(link => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      className="text-sm text-foreground transition-colors hover:text-primary"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Contact
              </p>
              <ul className="flex flex-col gap-2">
                <li>
                  <a
                    href={`mailto:${supportEmail}`}
                    className="text-sm text-foreground transition-colors hover:text-primary"
                  >
                    Support
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/lxfater/inpaint-web"
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-foreground transition-colors hover:text-primary"
                  >
                    Open Source
                  </a>
                </li>
              </ul>
            </div>
          </nav>
        </div>

        <div className="flex flex-col gap-3 border-t border-border/60 pt-6 text-xs leading-relaxed text-muted-foreground md:flex-row md:items-center md:justify-between">
          <p>
            &copy; {currentYear} MemoryFix AI. Built on the open-source{' '}
            <a
              href="https://github.com/lxfater/inpaint-web"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              inpaint-web
            </a>{' '}
            project; browser-side core licensed under GPL-3.0.
          </p>
          <p className="font-mono uppercase tracking-[0.18em]">
            Private &middot; Human-reviewed &middot; Email delivery
          </p>
        </div>
      </div>
    </footer>
  )
}

export default SiteFooter

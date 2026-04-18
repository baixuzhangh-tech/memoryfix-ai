import * as React from 'react'
import { InformationCircleIcon } from '@heroicons/react/outline'

import { cn } from '@/lib/utils'
import { languageTag, setLanguageTag } from '../paraglide/runtime'

interface NavLink {
  href: string
  label: string
}

const navLinks: NavLink[] = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#gallery', label: 'Gallery' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
]

export interface LandingHeaderProps {
  className?: string
  onOpenAbout: () => void
}

/**
 * Phase 2 warm-humanist top navigation, used only on the `?v=2` home
 * when no file is active. Replaces the legacy cream AppShell header
 * whose bold sans wordmark and 2018-SaaS `M` badge visually clashed
 * with the serif hero below.
 *
 * Layout:
 *   - Left: serif wordmark acting as the brand mark. No logo badge —
 *     the type does the work, matching the Hero / Gallery / Pricing
 *     typography.
 *   - Center (desktop): four hash-anchor nav links to the main page
 *     sections (How it works / Gallery / Pricing / FAQ). Each
 *     section now carries the matching id attribute.
 *   - Right: language toggle + About trigger. About open/close lives
 *     in the parent AppShell so there is still exactly one About
 *     modal on the page; the header simply notifies via
 *     onOpenAbout.
 *
 * Mobile: nav collapses to just wordmark + language + About, so the
 * header never wraps on small screens. The ↓ chevron in the Hero
 * still provides fast access to the first content section.
 */
export function LandingHeader({ className, onOpenAbout }: LandingHeaderProps) {
  const [currentTag, setCurrentTag] = React.useState(languageTag())

  function toggleLanguage() {
    const next = currentTag === 'zh' ? 'en' : 'zh'
    setLanguageTag(next)
    setCurrentTag(next)
  }

  return (
    <header
      className={cn(
        'sticky top-0 z-20 border-b border-border/60 bg-background/85 backdrop-blur-md',
        className
      )}
    >
      <div className="container flex h-16 items-center justify-between gap-6 md:h-20">
        <a
          href="/"
          className="font-serif text-xl font-semibold tracking-tight text-foreground md:text-2xl"
        >
          MemoryFix AI
        </a>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Primary">
          {navLinks.map(link => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleLanguage}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {currentTag === 'en' ? '中文' : 'English'}
          </button>
          <button
            type="button"
            onClick={onOpenAbout}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            aria-label="About MemoryFix AI"
          >
            <InformationCircleIcon className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">About</span>
          </button>
        </div>
      </div>
    </header>
  )
}

export default LandingHeader

import * as React from 'react'

import { cn } from '@/lib/utils'
import { landingGallery } from '@/config/landing'

export interface GalleryProps {
  className?: string
}

/**
 * Static gallery of real restoration samples. Each card cross-fades on hover
 * to hint at the before/after pair. Using a CSS filter to fake the "after"
 * warmth for now; swap for real restored pairs later.
 */
export function Gallery({ className }: GalleryProps) {
  return (
    <section className={cn('bg-background py-20 md:py-28', className)}>
      <div className="container">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Recent restorations
          </p>
          <h2 className="font-serif text-3xl font-semibold leading-tight tracking-tight text-foreground md:text-4xl">
            Quiet, careful work.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            A selection of real photographs we have restored. Every face here
            was treated as if it were our own grandparent.
          </p>
        </div>

        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {landingGallery.map(sample => {
            const beforeFilterClass = sample.hasRealPair
              ? ''
              : '[filter:saturate(0.3)_sepia(0.2)_contrast(0.95)]'
            const afterFilterClass = sample.hasRealPair
              ? ''
              : '[filter:saturate(1.12)_contrast(1.08)_brightness(1.03)]'
            return (
              <li
                key={sample.id}
                className="group relative overflow-hidden rounded-lg bg-muted shadow-card transition-shadow hover:shadow-float"
              >
                <div className="relative aspect-[3/4]">
                  <img
                    src={sample.beforeSrc}
                    alt={`${sample.caption} — before restoration`}
                    className={cn(
                      'absolute inset-0 h-full w-full object-cover transition-opacity duration-700 group-hover:opacity-0',
                      beforeFilterClass
                    )}
                    loading="lazy"
                  />
                  <img
                    src={sample.afterSrc}
                    alt={`${sample.caption} — after restoration`}
                    className={cn(
                      'absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-700 group-hover:opacity-100',
                      afterFilterClass
                    )}
                    loading="lazy"
                  />
                </div>
                <div className="flex items-center justify-between gap-3 border-t bg-card p-4">
                  <p className="font-serif text-base text-foreground">
                    {sample.caption}
                  </p>
                  <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                    {sample.hasRealPair ? 'Real pair' : 'Hover'}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

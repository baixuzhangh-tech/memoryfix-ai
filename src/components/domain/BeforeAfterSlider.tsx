import * as React from 'react'
import { ChevronsLeftRight } from 'lucide-react'

import { cn } from '@/lib/utils'

export interface BeforeAfterSliderProps {
  afterAlt?: string
  afterLabel?: string
  afterSrc: string
  /**
   * When true, the slider plays a short one-time sweep on mount (50 → 80
   * → 20 → 50 over ~2.4s) so first-time visitors realise the handle is
   * draggable. Any user interaction (mousedown / touchstart / keyboard)
   * cancels the sweep immediately. Respects prefers-reduced-motion.
   */
  autoDemo?: boolean
  beforeAlt?: string
  beforeLabel?: string
  beforeSrc: string
  className?: string
  initialPosition?: number
}

/**
 * Touch- and mouse-friendly before/after photo comparison slider.
 *
 * Uses CSS `clip-path: inset()` to clip the after-image so there is no layer
 * swap flash when dragging. The drag handle is a focusable button for
 * keyboard a11y (arrow keys are wired below).
 *
 * Design-system alignment:
 *   - Surface: rounded-lg + shadow-modal (highest shadow tier, matches a
 *     hero-weight visual anchor).
 *   - Labels: bg-background/80 + backdrop-blur to stay legible over any image.
 */
export function BeforeAfterSlider({
  afterAlt = 'After restoration',
  afterLabel = 'After',
  afterSrc,
  autoDemo = false,
  beforeAlt = 'Before restoration',
  beforeLabel = 'Before',
  beforeSrc,
  className,
  initialPosition = 50,
}: BeforeAfterSliderProps) {
  const [position, setPosition] = React.useState(initialPosition)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const draggingRef = React.useRef(false)
  const demoCancelledRef = React.useRef(false)

  const updateFromClientX = React.useCallback((clientX: number) => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    if (rect.width === 0) return
    const pct = ((clientX - rect.left) / rect.width) * 100
    setPosition(Math.max(0, Math.min(100, pct)))
  }, [])

  // One-time affordance sweep. Ends on a neutral 50/50 split so the
  // composition is balanced for anyone who does not interact. We animate
  // via a tight setTimeout chain instead of CSS transitions so that the
  // user's mouse/touch input on the handle instantly wins without fighting
  // any in-flight easing.
  React.useEffect(() => {
    if (!autoDemo) return
    if (typeof window === 'undefined') return
    const prefersReduced = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)'
    ).matches
    if (prefersReduced) return

    const frames = [
      { at: 350, value: 80 },
      { at: 1100, value: 20 },
      { at: 1900, value: 50 },
    ]
    const timers = frames.map(frame =>
      window.setTimeout(() => {
        if (demoCancelledRef.current) return
        setPosition(frame.value)
      }, frame.at)
    )
    return () => {
      timers.forEach(id => window.clearTimeout(id))
    }
  }, [autoDemo])

  function cancelDemo() {
    demoCancelledRef.current = true
  }

  React.useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      if (!draggingRef.current) return
      updateFromClientX(event.clientX)
    }
    function handleTouchMove(event: TouchEvent) {
      if (!draggingRef.current) return
      if (event.touches.length === 0) return
      updateFromClientX(event.touches[0].clientX)
    }
    function stopDragging() {
      draggingRef.current = false
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', stopDragging)
    window.addEventListener('touchmove', handleTouchMove, { passive: true })
    window.addEventListener('touchend', stopDragging)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', stopDragging)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', stopDragging)
    }
  }, [updateFromClientX])

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      setPosition(prev => Math.max(0, prev - 2))
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      setPosition(prev => Math.min(100, prev + 2))
    }
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative aspect-[3/4] w-full select-none overflow-hidden rounded-lg bg-muted shadow-modal',
        className
      )}
    >
      <img
        src={beforeSrc}
        alt={beforeAlt}
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      >
        <img
          src={afterSrc}
          alt={afterAlt}
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
      </div>

      <span className="absolute left-4 top-4 rounded-sm bg-foreground/85 px-2.5 py-1 font-mono text-sm font-semibold uppercase tracking-widest text-background backdrop-blur">
        {beforeLabel}
      </span>
      <span className="absolute right-4 top-4 rounded-sm bg-foreground/85 px-2.5 py-1 font-mono text-sm font-semibold uppercase tracking-widest text-background backdrop-blur">
        {afterLabel}
      </span>

      <div
        className="pointer-events-none absolute inset-y-0 w-0.5 bg-background shadow-float"
        style={{ left: `calc(${position}% - 1px)` }}
      >
        <button
          type="button"
          aria-label="Drag to compare before and after"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(position)}
          role="slider"
          onKeyDown={event => {
            cancelDemo()
            handleKeyDown(event)
          }}
          onMouseDown={event => {
            event.preventDefault()
            cancelDemo()
            draggingRef.current = true
          }}
          onTouchStart={() => {
            cancelDemo()
            draggingRef.current = true
          }}
          className="pointer-events-auto absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full bg-background text-foreground shadow-modal ring-2 ring-primary focus-visible:outline-none focus-visible:ring-4"
        >
          <ChevronsLeftRight className="h-5 w-5" aria-hidden />
        </button>
      </div>
    </div>
  )
}

import { clsx } from 'clsx'
import type { ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Canonical className combiner for the design system.
 *
 * Usage:
 *   cn('px-4 py-2', condition && 'bg-primary', overrideClass)
 *
 * Why both clsx and tailwind-merge:
 *   - clsx: conditional / array / object className composition
 *   - twMerge: resolves conflicting Tailwind utilities
 *     (e.g. `px-2 px-4` → `px-4`) so overrides always win predictably.
 *
 * All shadcn/ui components and domain components MUST route className
 * composition through this helper. Never concat strings manually.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

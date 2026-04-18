import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva } from 'class-variance-authority'
import type { VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

/**
 * Canonical Button primitive for the warm-humanist design system.
 *
 * Variants map to semantic intents (not colors):
 *   - default   → primary brand action (warm caramel)
 *   - accent    → high-intent CTA (terracotta, "Buy", "Restore now")
 *   - secondary → supporting action on cream surfaces
 *   - outline   → tertiary / cancel
 *   - ghost     → inline / toolbar
 *   - link      → in-prose link styling
 *   - destructive → irreversible destructive action
 *
 * Never override colors via className. If a new intent is needed,
 * add a new variant here so the system stays finite and auditable.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-card hover:bg-primary/90',
        accent:
          'bg-accent text-accent-foreground shadow-card hover:bg-accent/90',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline:
          'border border-input bg-background hover:bg-muted hover:text-foreground',
        ghost: 'hover:bg-muted hover:text-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        destructive:
          'bg-destructive text-destructive-foreground shadow-card hover:bg-destructive/90',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-sm px-3 text-sm',
        // Hero and other high-weight CTAs use size "lg". We keep the radius
        // on the tighter rounded-md step (6px) rather than rounded-lg (8px)
        // so the button silhouette stays closer to the angular craft feel
        // of the serif headline instead of reading as a generic SaaS pill.
        lg: 'h-12 rounded-md px-8 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }

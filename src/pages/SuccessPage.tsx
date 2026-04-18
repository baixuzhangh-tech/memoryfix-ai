import { AlertCircle, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { HumanRestoreLocalOrder } from '@/components/HumanRestoreSuccessStatusPage'

export interface SuccessPageProps {
  errorMessage: string
  order: HumanRestoreLocalOrder | null
  status: 'idle' | 'loading' | 'ready' | 'error'
}

/**
 * Phase 2-B simplified post-payment confirmation page.
 *
 * The legacy HumanRestoreSuccessStatusPage is 336 lines and shows a 5-step
 * progress ladder, 3 service highlight cards, and a 3-note privacy section.
 * Customer research says a buyer at this moment wants to know four things:
 *   1. Did my payment go through?
 *   2. What is my order number?
 *   3. When will I receive my photo?
 *   4. Who do I contact if something goes wrong?
 *
 * So this page shows exactly those four things and nothing else. The status
 * ladder still exists on the admin side; it does not belong in the buyer's
 * confirmation screen.
 */
export function SuccessPage({ errorMessage, order, status }: SuccessPageProps) {
  const isLoading = status === 'idle' || status === 'loading'
  const isError = status === 'error'
  const isDelivered = order?.status === 'delivered'
  const deliveryStatusLabel = resolveDeliveryStatus(order)

  if (isLoading) {
    return (
      <div className="container flex min-h-[70vh] items-center justify-center py-16">
        <Card className="w-full max-w-md border-none shadow-card">
          <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
            <Loader2
              className="h-10 w-10 animate-spin text-primary"
              aria-hidden
            />
            <h1 className="font-serif text-2xl font-semibold leading-tight text-foreground">
              Confirming your payment…
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              The payment provider usually confirms within a few seconds. Please
              keep this page open.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="container flex min-h-[70vh] items-center justify-center py-16">
        <Card className="w-full max-w-md border-none shadow-card">
          <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
            <AlertCircle className="h-10 w-10 text-destructive" aria-hidden />
            <h1 className="font-serif text-2xl font-semibold leading-tight text-foreground">
              We could not load your order yet.
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {errorMessage ||
                'If you already paid, do not pay again. Keep your receipt email and contact support — we will find the order manually.'}
            </p>
            <Button asChild variant="outline" size="default" className="mt-2">
              <a href="mailto:support@artgen.site">Contact support</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container flex min-h-[70vh] items-center justify-center py-16">
      <div className="flex w-full max-w-lg flex-col gap-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <div
            className={cn(
              'flex h-16 w-16 items-center justify-center rounded-full',
              isDelivered
                ? 'bg-primary/15 text-primary'
                : 'bg-secondary text-foreground'
            )}
          >
            <CheckCircle2 className="h-10 w-10" aria-hidden />
          </div>
          <h1 className="font-serif text-3xl font-semibold leading-tight tracking-tight text-foreground md:text-4xl">
            {isDelivered
              ? 'Your restored photo is ready.'
              : 'Payment confirmed.'}
          </h1>
          <p className="text-base leading-relaxed text-muted-foreground">
            {order?.checkoutEmailMasked
              ? `We will deliver the finished restoration to ${order.checkoutEmailMasked}.`
              : 'We will deliver the finished restoration to the email from your receipt.'}
          </p>
        </div>

        <Card className="border-none shadow-card">
          <CardContent className="flex flex-col gap-4 p-6 md:p-8">
            <DetailRow
              label="Order number"
              value={order?.orderNumber || order?.orderId || '—'}
              mono
            />
            <DetailRow label="Status" value={deliveryStatusLabel} />
            <DetailRow
              label="Estimated delivery"
              value={isDelivered ? 'Delivered' : 'Within 24 hours'}
            />
            {order?.paymentConfirmedAt ? (
              <DetailRow
                label="Payment confirmed"
                value={formatDateTime(order.paymentConfirmedAt)}
              />
            ) : null}
          </CardContent>
        </Card>

        <p className="text-sm leading-relaxed text-muted-foreground">
          {order?.checkoutEmailMasked
            ? `A full receipt has been emailed to ${order.checkoutEmailMasked} by our payment provider.`
            : 'A full receipt has been emailed to you by our payment provider.'}
        </p>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild variant="accent" size="lg" className="gap-2">
            <a href="/">
              Back to home
              <ArrowRight className="h-4 w-4" aria-hidden />
            </a>
          </Button>
        </div>

        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          Questions about your order? Email{' '}
          <a
            className="font-medium text-foreground underline-offset-4 hover:underline"
            href="mailto:support@artgen.site"
          >
            support@artgen.site
          </a>{' '}
          with your order number above — we usually reply within a few hours.
        </p>
      </div>
    </div>
  )
}

export default SuccessPage

interface DetailRowProps {
  label: string
  mono?: boolean
  value: string
}

function DetailRow({ label, mono, value }: DetailRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 border-b pb-3 last:border-none last:pb-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={cn(
          'text-right text-sm font-medium text-foreground',
          mono && 'font-mono text-xs'
        )}
      >
        {value}
      </span>
    </div>
  )
}

function resolveDeliveryStatus(order: HumanRestoreLocalOrder | null) {
  if (!order) return 'Pending'
  if (order.status === 'delivered') return 'Delivered'
  if (order.status === 'pending_payment') return 'Waiting for payment'
  if (order.paid) return 'In review'
  return 'Received'
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

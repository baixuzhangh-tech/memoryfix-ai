import * as React from 'react'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Download,
  Loader2,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { HumanRestoreLocalOrder } from '@/components/HumanRestoreSuccessStatusPage'

export interface SuccessPageProps {
  errorMessage: string
  order: HumanRestoreLocalOrder | null
  status: 'idle' | 'loading' | 'ready' | 'error'
}

type AiHdDownloadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; downloadUrl: string }
  | { kind: 'error'; message: string }

const aiHdDownloadPollIntervalMs = 5000

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
  const isAiHd = order?.productTier === 'ai_hd'
  const deliveryStatusLabel = resolveDeliveryStatus(order)
  const estimatedDeliveryLabel = resolveEstimatedDelivery(order)
  const heroTitle = resolveHeroTitle(order, isDelivered)
  const heroSubtitle = resolveHeroSubtitle(order, isDelivered, isAiHd)
  const aiHdDownload = useAiHdDownload(order)

  // True for the entire AI HD post-checkout waiting window — from the
  // Paddle redirect (status=pending_payment, webhook still racing) all
  // the way through paid / needs_review until the HD download link
  // actually surfaces. During this whole window we weaken the "Back to
  // home" CTA and attach a beforeunload guard so buyers don't walk away
  // from their pending download.
  const isWaitingForHdDownload =
    isAiHd &&
    !isDelivered &&
    (aiHdDownload.kind === 'loading' ||
      aiHdDownload.kind === 'idle' ||
      order?.status === 'pending_payment')

  React.useEffect(() => {
    if (!isWaitingForHdDownload) return undefined
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
      // Required for older browsers to actually show the prompt.
      // eslint-disable-next-line no-param-reassign
      event.returnValue = ''
      return ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isWaitingForHdDownload])

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
            {heroTitle}
          </h1>
          <p className="text-base leading-relaxed text-muted-foreground">
            {heroSubtitle}
          </p>
        </div>

        <Card className="border-none shadow-card">
          <CardContent className="flex flex-col gap-4 p-6 md:p-8">
            <DetailRow
              label="Order number"
              value={order?.orderNumber || order?.orderId || '—'}
              mono
            />
            <DetailRow
              label="Tier"
              value={isAiHd ? 'AI HD Restore' : 'Human Retouch'}
            />
            <DetailRow label="Status" value={deliveryStatusLabel} />
            <DetailRow
              label="Estimated delivery"
              value={estimatedDeliveryLabel}
            />
            {order?.paymentConfirmedAt ? (
              <DetailRow
                label="Payment confirmed"
                value={formatDateTime(order.paymentConfirmedAt)}
              />
            ) : null}
          </CardContent>
        </Card>

        {isAiHd && <AiHdDownloadCard download={aiHdDownload} order={order} />}

        <p className="text-sm leading-relaxed text-muted-foreground">
          {order?.checkoutEmailMasked
            ? `A full receipt has been emailed to ${order.checkoutEmailMasked} by our payment provider.`
            : 'A full receipt has been emailed to you by our payment provider.'}
        </p>

        <div className="flex flex-col gap-3 sm:flex-row">
          {isWaitingForHdDownload ? (
            <a
              href="/"
              className="text-center text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline sm:text-left"
              onClick={event => {
                const confirmed = window.confirm(
                  'Your HD download is still being prepared on this page. If you leave now, you\u2019ll need to finish from the email link we sent. Leave anyway?'
                )
                if (!confirmed) {
                  event.preventDefault()
                }
              }}
            >
              I&apos;ll finish from the email link later →
            </a>
          ) : (
            <Button asChild variant="accent" size="lg" className="gap-2">
              <a href="/">
                Back to home
                <ArrowRight className="h-4 w-4" aria-hidden />
              </a>
            </Button>
          )}
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
  const isAiHd = order.productTier === 'ai_hd'

  if (order.status === 'delivered') return 'Delivered'
  if (order.status === 'pending_payment') return 'Waiting for payment'

  if (isAiHd) {
    if (order.status === 'needs_review') return 'Finalising delivery'
    if (
      order.status === 'processing' ||
      order.status === 'ai_queued' ||
      order.status === 'uploaded' ||
      order.status === 'paid'
    ) {
      return 'AI processing'
    }
    return 'Processing'
  }

  if (order.paid) return 'In review'
  return 'Received'
}

function resolveEstimatedDelivery(order: HumanRestoreLocalOrder | null) {
  if (!order) return '—'
  if (order.status === 'delivered') return 'Delivered'

  if (order.productTier === 'ai_hd') {
    if (order.status === 'pending_payment')
      return 'Within 1–2 minutes after payment'
    return 'Within 1–2 minutes'
  }

  return 'Within 24 hours'
}

function resolveHeroTitle(
  order: HumanRestoreLocalOrder | null,
  isDelivered: boolean
) {
  if (isDelivered) return 'Your restored photo is ready.'
  if (order?.productTier === 'ai_hd' && order.status === 'needs_review') {
    return 'Finalising your AI restoration…'
  }
  return 'Payment confirmed.'
}

function resolveHeroSubtitle(
  order: HumanRestoreLocalOrder | null,
  isDelivered: boolean,
  isAiHd: boolean
) {
  const email = order?.checkoutEmailMasked

  if (isDelivered) {
    return email
      ? `We just emailed the download link to ${email}. Check your inbox.`
      : 'We just emailed the download link to the address on your receipt.'
  }

  if (isAiHd) {
    return email
      ? `Your AI HD restoration is running and will be emailed to ${email} within 1–2 minutes. You can keep this page open — it refreshes automatically.`
      : 'Your AI HD restoration is running. The download link will arrive at the email on your receipt within 1–2 minutes.'
  }

  return email
    ? `A human retoucher will finish the photo and email it to ${email} within 24 hours.`
    : 'A human retoucher will finish the photo and email it to the address on your receipt within 24 hours.'
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function useAiHdDownload(
  order: HumanRestoreLocalOrder | null
): AiHdDownloadState {
  // The order endpoint now returns `hdDownloadUrl` inline whenever the
  // AI HD order is paid and the AI draft is ready. We no longer need a
  // dedicated /api/ai-hd-result call — this hook just reads the field
  // off the already-polled order object.
  const isAiHd = order?.productTier === 'ai_hd'
  const isPaid = Boolean(order?.paid) && order?.status !== 'pending_payment'

  if (!isAiHd || !order) {
    return { kind: 'idle' }
  }

  if (order.hdDownloadUrl) {
    return { kind: 'ready', downloadUrl: order.hdDownloadUrl }
  }

  if (isPaid) {
    return { kind: 'loading' }
  }

  return { kind: 'idle' }
}

interface AiHdDownloadCardProps {
  download: AiHdDownloadState
  order: HumanRestoreLocalOrder | null
}

function AiHdDownloadCard({ download, order }: AiHdDownloadCardProps) {
  if (download.kind === 'idle') {
    return null
  }

  if (download.kind === 'loading') {
    const email = order?.checkoutEmailMasked
    return (
      <Card className="border-primary/40 bg-primary/5 shadow-float">
        <CardContent className="flex flex-col gap-4 p-6 md:p-7">
          <div className="flex items-center gap-3">
            <Loader2
              className="h-5 w-5 animate-spin text-primary"
              aria-hidden
            />
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
              Preparing your HD download
            </p>
          </div>
          <h2 className="font-serif text-xl font-semibold leading-tight text-foreground md:text-2xl">
            Usually ready in about a minute.
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Please keep this tab open — the{' '}
            <strong className="text-foreground">Download HD photo</strong>{' '}
            button will appear right here as soon as your restoration finishes.
            This page checks every few seconds on its own.
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            If something comes up, don&apos;t worry — we also email the same
            download link to{' '}
            <strong className="text-foreground">
              {email || 'the address on your receipt'}
            </strong>
            , so you can finish later from your inbox.
          </p>
        </CardContent>
      </Card>
    )
  }

  if (download.kind === 'error') {
    return (
      <Card className="border-destructive/30 shadow-card">
        <CardContent className="flex items-start gap-3 p-5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{download.message}</span>
        </CardContent>
      </Card>
    )
  }

  const filename = order?.submissionReference
    ? `${order.submissionReference}-ai-hd.jpg`
    : 'ai-hd-restored.jpg'

  return (
    <Card className="border-primary/40 shadow-float">
      <CardContent className="flex flex-col gap-4 p-6 md:p-8">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
            HD download ready
          </p>
          <h2 className="mt-2 font-serif text-xl font-semibold leading-tight text-foreground md:text-2xl">
            Your watermark-free photo is unlocked.
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            We also emailed this link to you. The signed download URL expires in
            a few days — save the file now if you want to keep it.
          </p>
        </div>

        <Button asChild variant="accent" size="lg" className="gap-2">
          <a href={download.downloadUrl} download={filename}>
            <Download className="h-4 w-4" aria-hidden />
            Download HD photo
          </a>
        </Button>
      </CardContent>
    </Card>
  )
}

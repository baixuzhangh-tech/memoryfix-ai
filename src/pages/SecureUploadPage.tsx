import { useEffect, useState } from 'react'
import { AlertCircle, Loader2, ShieldCheck } from 'lucide-react'

import trackProductEvent from '@/analytics'
import HumanRestoreUploadForm from '@/components/HumanRestoreUploadForm'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

type SecureOrderResponse = {
  error?: string
  ok?: boolean
  order?: {
    checkoutEmailMasked: string
    createdAt: string
    orderId: string
    orderNumber?: string
    productName?: string
    receiptUrl?: string
    testMode?: boolean
  }
}

export interface SecureUploadPageProps {
  token: string
}

/**
 * Phase 2-B.2 simplified secure-upload screen.
 *
 * The legacy SecureHumanRestoreUploadPage is 288 lines and shows a
 * dark-hero panel with 4 post-payment steps, a service highlights
 * row, and a privacy trust row. At the moment a buyer clicks the
 * email link, the only question they care about is:
 *   "Am I on the right page to upload my photo? And is this tied to
 *    my order?"
 *
 * So the new shell is: one centred column, a single identity header
 * (order number + masked email + optional receipt button), and then
 * the existing HumanRestoreUploadForm untouched — it is the actual
 * data path to /api/human-restore-upload and must not be rewritten
 * casually. Loading / error states get their own focused card.
 */
export function SecureUploadPage({ token }: SecureUploadPageProps) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [order, setOrder] = useState<SecureOrderResponse['order'] | null>(null)

  useEffect(() => {
    let isActive = true

    async function loadOrder() {
      if (!token) {
        setStatus('error')
        setErrorMessage('This secure upload link is missing its token.')
        return
      }

      try {
        const response = await fetch(
          `/api/human-restore-order?token=${encodeURIComponent(token)}`
        )
        const responseBody = (await response
          .json()
          .catch(() => null)) as SecureOrderResponse | null

        if (!response.ok || !responseBody?.order) {
          throw new Error(
            responseBody?.error ||
              'This secure upload link is invalid or has expired.'
          )
        }

        if (!isActive) return

        setOrder(responseBody.order)
        setStatus('ready')
        trackProductEvent('view_secure_human_restore_upload', {
          test_mode: Boolean(responseBody.order.testMode),
        })
      } catch (error) {
        if (!isActive) return
        setStatus('error')
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'This secure upload link could not be verified.'
        )
      }
    }

    loadOrder()

    return () => {
      isActive = false
    }
  }, [token])

  if (status === 'loading') {
    return (
      <div className="container flex min-h-[70vh] items-center justify-center py-16">
        <Card className="w-full max-w-md border-none shadow-card">
          <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
            <Loader2
              className="h-10 w-10 animate-spin text-primary"
              aria-hidden
            />
            <h1 className="font-serif text-2xl font-semibold leading-tight text-foreground">
              Verifying your secure link…
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              No account or second payment is needed. We are confirming the paid
              order attached to this page.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="container flex min-h-[70vh] items-center justify-center py-16">
        <Card className="w-full max-w-md border-none shadow-card">
          <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
            <AlertCircle className="h-10 w-10 text-destructive" aria-hidden />
            <h1 className="font-serif text-2xl font-semibold leading-tight text-foreground">
              We could not verify this secure upload link.
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {errorMessage}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              If you already paid, do not pay again. Reply to your order email
              and we will re-issue a fresh upload link.
            </p>
            <Button asChild variant="outline" size="default" className="mt-2">
              <a href="mailto:support@artgen.site">Contact support</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!order) return null

  const orderNumber = order.orderNumber || order.orderId

  return (
    <div className="container flex flex-col items-center gap-8 py-12 md:py-16">
      <div className="flex w-full max-w-2xl flex-col items-center gap-3 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
          <ShieldCheck className="h-6 w-6" aria-hidden />
        </span>
        <h1 className="font-serif text-3xl font-semibold leading-tight tracking-tight text-foreground md:text-4xl">
          Upload your photo
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground">
          This private link is tied to your paid order. Drop in one best source
          photo and any notes you would like our reviewer to keep in mind.
        </p>
      </div>

      <Card className="w-full max-w-2xl border-none shadow-card">
        <CardContent className="flex flex-wrap items-center gap-3 p-5">
          <span className="rounded-sm bg-secondary px-2 py-1 font-mono text-xs uppercase tracking-widest text-foreground">
            {orderNumber}
          </span>
          <span className="text-sm text-muted-foreground">
            {order.checkoutEmailMasked}
          </span>
        </CardContent>
      </Card>

      <div id="direct-upload-form" className="w-full max-w-2xl scroll-mt-28">
        <HumanRestoreUploadForm
          defaultEmail=""
          defaultOrderReference=""
          presentation="task-card"
          secureOrderSummary={{
            checkoutEmailMasked: order.checkoutEmailMasked,
            orderNumber: order.orderNumber,
            productName: order.productName,
          }}
          secureUploadToken={token}
        />
      </div>

      <p className="max-w-lg text-center text-xs leading-relaxed text-muted-foreground">
        Questions? Email{' '}
        <a
          className="font-medium text-foreground underline-offset-4 hover:underline"
          href="mailto:support@artgen.site"
        >
          support@artgen.site
        </a>
        . Keep the confirmation email we send after submission — you do not need
        to upload again unless support asks you to.
      </p>
    </div>
  )
}

export default SecureUploadPage

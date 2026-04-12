import { useEffect, useState } from 'react'
import trackProductEvent from '../analytics'
import {
  humanRestorePostPaymentSteps,
  humanRestoreTrustNotes,
} from '../humanRestoreContent'
import HumanRestoreUploadForm from './HumanRestoreUploadForm'

function formatOrderDate(value: string) {
  if (!value) {
    return ''
  }

  const parsedDate = new Date(value)

  if (Number.isNaN(parsedDate.getTime())) {
    return ''
  }

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsedDate)
}

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

type SecureHumanRestoreUploadPageProps = {
  token: string
}

export default function SecureHumanRestoreUploadPage(
  props: SecureHumanRestoreUploadPageProps
) {
  const { token } = props
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [order, setOrder] = useState<SecureOrderResponse['order'] | null>(null)
  const formattedOrderDate = order ? formatOrderDate(order.createdAt) : ''

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

        if (!isActive) {
          return
        }

        setOrder(responseBody.order)
        setStatus('ready')
        trackProductEvent('view_secure_human_restore_upload', {
          test_mode: Boolean(responseBody.order.testMode),
        })
      } catch (error) {
        if (!isActive) {
          return
        }

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

  return (
    <div className="mx-auto flex max-w-5xl flex-col px-4 py-10 md:px-8">
      <section className="overflow-hidden rounded-[2rem] border border-[#e6d2b7] bg-[#fffaf3] shadow-2xl shadow-[#8a4f1d]/10">
        <div className="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="bg-white/80 p-8 md:p-12">
            <p className="text-sm font-bold uppercase tracking-[0.24em] text-[#9b6b3c]">
              Secure upload
            </p>
            <h1 className="mt-4 max-w-3xl text-4xl font-black tracking-tight text-[#211915] sm:text-6xl">
              Your paid order is verified and ready for upload.
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-[#66574d]">
              This private link is already tied to your paid Human-assisted
              Restore order. Upload your photo and notes below to start
              restoration. No account or extra payment is required.
            </p>
          </div>

          <div className="grid content-between gap-5 bg-[#211915] p-8 text-white md:p-12">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.24em] text-[#e8cfae]">
                Paid workflow
              </p>
              <p className="mt-3 text-3xl font-black tracking-tight">
                Cloud restore draft, then human review before delivery.
              </p>
            </div>
            <div className="rounded-[1.5rem] border border-white/15 bg-white/10 p-5">
              <p className="text-sm font-black uppercase tracking-[0.18em] text-[#e8cfae]">
                Privacy boundary
              </p>
              <p className="mt-3 text-sm leading-7 text-[#f6eadb]">
                Free local repair keeps photos on your device. This paid upload
                is only for the assisted service you already purchased.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-4">
        {humanRestorePostPaymentSteps.map(step => (
          <article
            key={step.label}
            className="rounded-[1.5rem] border border-[#e6d2b7] bg-white/80 p-5 shadow-lg shadow-[#8a4f1d]/5"
          >
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#9b6b3c]">
              {step.label}
            </p>
            <h2 className="mt-3 text-lg font-black leading-tight text-[#211915]">
              {step.title}
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#66574d]">
              {step.description}
            </p>
          </article>
        ))}
      </section>

      {status === 'loading' && (
        <section className="mt-10 rounded-[2rem] border border-[#e6d2b7] bg-white/80 p-8 shadow-xl shadow-[#8a4f1d]/10">
          <p className="text-lg font-black text-[#211915]">
            Verifying your secure upload link...
          </p>
          <p className="mt-3 leading-7 text-[#66574d]">
            Please wait a moment while we confirm the paid order attached to
            this link.
          </p>
        </section>
      )}

      {status === 'error' && (
        <section className="mt-10 rounded-[2rem] border border-[#f0b5a9] bg-[#fff1ed] p-8 text-[#8a2f1d] shadow-xl shadow-[#8a4f1d]/10">
          <p className="text-lg font-black">Secure upload link unavailable</p>
          <p className="mt-3 leading-7">{errorMessage}</p>
          <p className="mt-4 text-sm leading-6">
            If you already paid, do not pay again. Reply to your order email and
            tell us that the secure upload link did not open correctly.
          </p>
        </section>
      )}

      {status === 'ready' && order && (
        <>
          <section className="mt-10 grid gap-4 rounded-[2rem] border border-[#e6d2b7] bg-[#fffaf3] p-8 shadow-xl shadow-[#8a4f1d]/10 md:grid-cols-[1.1fr_0.9fr] md:p-10">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.24em] text-[#9b6b3c]">
                Order summary
              </p>
              <h2 className="mt-3 text-3xl font-black text-[#211915] sm:text-4xl">
                Everything below is already linked to your paid order.
              </h2>
              <p className="mt-4 max-w-2xl leading-7 text-[#66574d]">
                Use this page once, upload the photo you want restored, and keep
                the confirmation email we send after submission.
              </p>
            </div>

            <div className="grid gap-4 rounded-[1.75rem] border border-[#e6d2b7] bg-white/70 p-6">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#66574d]">
                  Checkout email
                </p>
                <p className="mt-2 text-base font-black text-[#211915]">
                  {order.checkoutEmailMasked}
                </p>
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#66574d]">
                  Order number
                </p>
                <p className="mt-2 text-base font-black text-[#211915]">
                  {order.orderNumber || order.orderId}
                </p>
              </div>
              {formattedOrderDate && (
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#66574d]">
                    Purchased
                  </p>
                  <p className="mt-2 text-base font-bold text-[#211915]">
                    {formattedOrderDate}
                  </p>
                </div>
              )}
              {order.receiptUrl && (
                <a
                  href={order.receiptUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex justify-center rounded-full border border-[#211915] px-5 py-3 text-center text-sm font-black text-[#211915] transition hover:-translate-y-1 hover:bg-white"
                >
                  View receipt
                </a>
              )}
            </div>
          </section>

          <HumanRestoreUploadForm
            defaultEmail=""
            defaultOrderReference=""
            secureOrderSummary={{
              checkoutEmailMasked: order.checkoutEmailMasked,
              orderNumber: order.orderNumber,
              productName: order.productName,
            }}
            secureUploadToken={token}
          />

          <section className="mt-6 grid gap-4 md:grid-cols-3">
            {humanRestoreTrustNotes.map(note => (
              <article
                key={note.title}
                className="rounded-[1.5rem] border border-[#e6d2b7] bg-[#fffaf3] p-5 text-sm leading-6 text-[#66574d]"
              >
                <h2 className="text-base font-black text-[#211915]">
                  {note.title}
                </h2>
                <p className="mt-2">{note.description}</p>
              </article>
            ))}
          </section>
        </>
      )}
    </div>
  )
}

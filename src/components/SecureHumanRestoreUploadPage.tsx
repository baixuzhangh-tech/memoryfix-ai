import { useEffect, useState } from 'react'
import trackProductEvent from '../analytics'
import {
  humanRestorePostPaymentSteps,
  humanRestoreServiceHighlights,
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
    <div className="mx-auto flex max-w-7xl flex-col px-4 py-8 md:px-8 md:py-10">
      <section className="grid gap-6 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
        <div className="relative overflow-hidden rounded-[2rem] bg-[#211915] p-8 text-white shadow-2xl shadow-[#211915]/20 md:p-10">
          <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-[#f3c16f]/20 blur-3xl" />
          <div className="absolute -bottom-20 left-10 h-52 w-52 rounded-full bg-[#8a4f1d]/20 blur-3xl" />
          <div className="relative">
            <div className="mb-6 inline-flex rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-[#f3c16f]">
              Secure upload link
            </div>
            <h1 className="max-w-3xl text-4xl font-black tracking-tight sm:text-6xl">
              Your restoration specialist is ready.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-[#f7eadb] md:text-lg">
              This private link is tied to your paid order. Upload one best
              source photo, add your notes, and we will prepare a restoration
              draft for human review before delivery.
            </p>

            <div className="mt-7 grid gap-3">
              {humanRestorePostPaymentSteps.map((step, index) => (
                <div
                  key={step.label}
                  className="grid grid-cols-[2.5rem_1fr] gap-4 rounded-[1.25rem] border border-white/10 bg-white/[0.07] p-4"
                >
                  <div
                    className={
                      index < 2
                        ? 'flex h-10 w-10 items-center justify-center rounded-full bg-[#f3c16f] text-sm font-black text-[#211915]'
                        : 'flex h-10 w-10 items-center justify-center rounded-full border border-white/20 text-sm font-black text-[#f6eadb]'
                    }
                  >
                    {index + 1}
                  </div>
                  <div>
                    <p className="text-sm font-black text-white">
                      {step.title}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[#e8d6c3]">
                      {step.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div id="direct-upload-form" className="scroll-mt-28">
          {status === 'loading' && (
            <section className="rounded-[2rem] border border-[#e1c8a8] bg-white p-6 shadow-2xl shadow-[#8a4f1d]/15 md:p-8">
              <p className="text-sm font-black uppercase tracking-[0.24em] text-[#9b6b3c]">
                Verifying link
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-[#211915]">
                Confirming the paid order attached to this page.
              </h2>
              <p className="mt-4 leading-7 text-[#66574d]">
                Please wait a moment while we prepare the secure upload card. No
                account or extra payment is required.
              </p>
              <div className="mt-6 h-3 overflow-hidden rounded-full bg-[#f2dfc3]">
                <div className="h-full w-2/3 rounded-full bg-[#211915]" />
              </div>
            </section>
          )}

          {status === 'error' && (
            <section className="rounded-[2rem] border border-[#f0b5a9] bg-[#fff1ed] p-8 text-[#8a2f1d] shadow-2xl shadow-[#8a4f1d]/10">
              <p className="text-sm font-black uppercase tracking-[0.18em]">
                Upload link unavailable
              </p>
              <h2 className="mt-3 text-3xl font-black">
                We could not verify this secure upload link.
              </h2>
              <p className="mt-4 leading-7">{errorMessage}</p>
              <p className="mt-4 text-sm leading-6">
                If you already paid, do not pay again. Reply to your order email
                and tell us that the secure upload link did not open correctly.
              </p>
            </section>
          )}

          {status === 'ready' && order && (
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
          )}
        </div>
      </section>

      {status === 'ready' && order && (
        <>
          <section className="mt-6 grid gap-4 rounded-[2rem] border border-[#e6d2b7] bg-[#fffaf3] p-6 shadow-xl shadow-[#8a4f1d]/10 md:grid-cols-[1fr_auto] md:items-center md:p-8">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.24em] text-[#9b6b3c]">
                Order summary
              </p>
              <h2 className="mt-3 text-2xl font-black text-[#211915] sm:text-3xl">
                This upload card is already linked to your paid order.
              </h2>
              <p className="mt-4 max-w-2xl leading-7 text-[#66574d]">
                Keep the confirmation email we send after submission. You do not
                need to upload again unless support asks you to.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 text-xs font-black text-[#5b4a40]">
              <div>
                <p className="rounded-full border border-[#e6d2b7] bg-white/70 px-4 py-2">
                  {order.checkoutEmailMasked}
                </p>
              </div>
              <div>
                <p className="rounded-full border border-[#e6d2b7] bg-white/70 px-4 py-2">
                  {order.orderNumber || order.orderId}
                </p>
              </div>
              {formattedOrderDate && (
                <div>
                  <p className="rounded-full border border-[#e6d2b7] bg-white/70 px-4 py-2">
                    {formattedOrderDate}
                  </p>
                </div>
              )}
              {order.receiptUrl && (
                <a
                  href={order.receiptUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex justify-center rounded-full border border-[#211915] px-5 py-2 text-center text-xs font-black text-[#211915] transition hover:-translate-y-1 hover:bg-white"
                >
                  View receipt
                </a>
              )}
            </div>
          </section>

          <section className="mt-6 grid gap-4 md:grid-cols-3">
            {humanRestoreServiceHighlights.map(card => (
              <article
                key={card.title}
                className="rounded-[1.5rem] border border-[#e6d2b7] bg-white/85 p-6 shadow-lg shadow-[#8a4f1d]/5"
              >
                <h2 className="text-lg font-black text-[#211915]">
                  {card.title}
                </h2>
                <p className="mt-3 text-sm leading-6 text-[#66574d]">
                  {card.description}
                </p>
              </article>
            ))}
          </section>

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

import {
  humanRestoreServiceHighlights,
  humanRestoreTrustNotes,
} from '../humanRestoreContent'

export type HumanRestoreLocalOrder = {
  checkoutEmailMasked: string
  checkoutRef: string
  createdAt: string
  jobId: string
  orderId: string
  orderNumber: string
  paid: boolean
  paymentConfirmedAt: string
  photoReceived: boolean
  productName: string
  receiptUrl: string
  status: string
  submissionReference: string
  testMode: boolean
  updatedAt: string
}

type HumanRestoreSuccessStatusPageProps = {
  errorMessage: string
  order: HumanRestoreLocalOrder | null
  status: 'idle' | 'loading' | 'ready' | 'error'
}

const statusLabels: Record<string, string> = {
  ai_failed: 'AI draft needs manual attention',
  ai_queued: 'AI draft queued',
  delivered: 'Restored photo delivered',
  failed: 'Manual review needed',
  manual_review: 'Human review in progress',
  needs_review: 'Ready for human review',
  paid: 'Payment confirmed',
  pending_payment: 'Waiting for payment confirmation',
  processing: 'AI draft in progress',
  uploaded: 'Photo received',
}

function getHeroTitle(order: HumanRestoreLocalOrder | null) {
  if (!order) {
    return 'Confirming your restoration order.'
  }

  if (order.status === 'pending_payment') {
    return 'Photo received. Waiting for payment confirmation.'
  }

  if (order.status === 'needs_review' || order.status === 'manual_review') {
    return 'Your restoration draft is in human review.'
  }

  if (order.status === 'delivered') {
    return 'Your restored photo has been delivered.'
  }

  if (order.status === 'failed' || order.status === 'ai_failed') {
    return 'Your order is safely received. We are reviewing it manually.'
  }

  return 'Payment confirmed. Your photo is already received.'
}

function getHeroDescription(order: HumanRestoreLocalOrder | null) {
  if (!order) {
    return 'We are loading the secure order record created before checkout.'
  }

  if (order.status === 'pending_payment') {
    return 'Lemon Squeezy can take a few seconds to notify us. Keep this page open; no second upload or second payment is needed.'
  }

  if (order.checkoutEmailMasked) {
    return `We will deliver the approved restoration to your checkout email ${order.checkoutEmailMasked}.`
  }

  return 'We will deliver the approved restoration to the checkout email returned by Lemon Squeezy.'
}

function getStepState(order: HumanRestoreLocalOrder | null, step: string) {
  if (!order) {
    return 'pending'
  }

  const { paid: paymentDone, status } = order
  const aiStarted = [
    'processing',
    'ai_queued',
    'ai_failed',
    'needs_review',
    'manual_review',
    'delivered',
  ].includes(status)
  const reviewStarted = ['needs_review', 'manual_review', 'delivered'].includes(
    status
  )

  if (step === 'photo') {
    return order.photoReceived ? 'done' : 'pending'
  }

  if (step === 'payment') {
    return paymentDone ? 'done' : 'active'
  }

  if (step === 'ai') {
    if (aiStarted) {
      return 'done'
    }

    return paymentDone ? 'active' : 'pending'
  }

  if (step === 'review') {
    if (reviewStarted) {
      return 'done'
    }

    return aiStarted ? 'active' : 'pending'
  }

  if (step === 'delivery') {
    if (status === 'delivered') {
      return 'done'
    }

    return reviewStarted ? 'active' : 'pending'
  }

  return 'pending'
}

function stepClassName(state: string) {
  if (state === 'done') {
    return 'bg-[#b8d99f] text-[#1f3413]'
  }

  if (state === 'active') {
    return 'bg-[#f3c16f] text-[#211915]'
  }

  return 'border border-white/20 text-[#f6eadb]'
}

export default function HumanRestoreSuccessStatusPage(
  props: HumanRestoreSuccessStatusPageProps
) {
  const { errorMessage, order, status } = props
  const isLoading = status === 'idle' || status === 'loading'
  const isError = status === 'error'
  const currentStatus = order?.status || ''
  const statusLabel =
    statusLabels[currentStatus] ||
    (isLoading ? 'Loading order' : 'Order status')
  const steps = [
    {
      id: 'photo',
      title: 'Photo safely received',
      description:
        'The source photo and repair notes were saved before checkout.',
    },
    {
      id: 'payment',
      title: 'Payment confirmation',
      description:
        'Lemon Squeezy confirms the order by webhook and returns the checkout email.',
    },
    {
      id: 'ai',
      title: 'AI restoration draft',
      description:
        'We prepare a conservative draft that preserves identity and character.',
    },
    {
      id: 'review',
      title: 'Human quality review',
      description:
        'A human checks the before and after result before delivery.',
    },
    {
      id: 'delivery',
      title: 'Private email delivery',
      description:
        'The approved result is sent to the checkout email during beta.',
    },
  ]

  return (
    <div className="mx-auto flex max-w-7xl flex-col px-4 py-8 md:px-8 md:py-10">
      <section className="grid gap-6 lg:grid-cols-[0.86fr_1.14fr] lg:items-start">
        <div className="relative overflow-hidden rounded-[2rem] bg-[#211915] p-8 text-white shadow-2xl shadow-[#211915]/20 md:p-10">
          <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-[#f3c16f]/20 blur-3xl" />
          <div className="absolute -bottom-20 left-10 h-52 w-52 rounded-full bg-[#8a4f1d]/20 blur-3xl" />
          <div className="relative">
            <div className="mb-6 inline-flex rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-[#f3c16f]">
              Secure order status
            </div>
            <h1 className="max-w-3xl text-4xl font-black tracking-tight sm:text-6xl">
              {isError
                ? 'We could not load this order yet.'
                : getHeroTitle(order)}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-[#f7eadb] md:text-lg">
              {isError
                ? errorMessage ||
                  'If you already paid, do not pay again. Use the Lemon Squeezy receipt email as your backup record and contact support if this page does not recover.'
                : getHeroDescription(order)}
            </p>

            <div className="mt-7 flex flex-wrap gap-2">
              <div className="rounded-full border border-[#b8d99f]/30 bg-[#f4ffe8] px-4 py-2 text-xs font-black text-[#355322]">
                {statusLabel}
              </div>
              {order?.checkoutEmailMasked && (
                <div className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold text-[#f6eadb]">
                  {order.checkoutEmailMasked}
                </div>
              )}
              {order?.submissionReference && (
                <div className="max-w-full truncate rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold text-[#f6eadb]">
                  {order.submissionReference}
                </div>
              )}
            </div>
          </div>
        </div>

        <section className="rounded-[2rem] border border-[#e1c8a8] bg-white p-6 shadow-2xl shadow-[#8a4f1d]/15 md:p-8">
          <p className="text-sm font-black uppercase tracking-[0.24em] text-[#9b6b3c]">
            What happens now
          </p>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-[#211915]">
            No second upload is needed.
          </h2>
          <p className="mt-4 leading-7 text-[#66574d]">
            Your photo was attached to this order before checkout. This page now
            follows our payment and review workflow instead of asking you to
            upload again.
          </p>

          <div className="mt-6 grid gap-3">
            {steps.map((step, index) => {
              const stepState = getStepState(order, step.id)

              return (
                <div
                  key={step.id}
                  className="grid grid-cols-[2.5rem_1fr] gap-4 rounded-[1.25rem] border border-[#e6d2b7] bg-[#fffaf3] p-4"
                >
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-black ${stepClassName(
                      stepState
                    )}`}
                  >
                    {index + 1}
                  </div>
                  <div>
                    <p className="text-sm font-black text-[#211915]">
                      {step.title}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[#66574d]">
                      {step.description}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>

          {isLoading && (
            <div className="mt-6 grid gap-3">
              <div className="h-3 overflow-hidden rounded-full bg-[#f2dfc3]">
                <div className="h-full w-2/3 rounded-full bg-[#211915]" />
              </div>
              <p className="text-sm font-bold text-[#5b4a40]">
                Checking the order record and payment webhook...
              </p>
            </div>
          )}

          {order?.receiptUrl && (
            <a
              href={order.receiptUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-6 inline-flex justify-center rounded-full border border-[#211915] px-5 py-3 text-center text-sm font-black text-[#211915] transition hover:-translate-y-1 hover:bg-[#fffaf3]"
            >
              View Lemon Squeezy receipt
            </a>
          )}
        </section>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        {humanRestoreServiceHighlights.map(card => (
          <article
            key={card.title}
            className="rounded-[1.5rem] border border-[#e6d2b7] bg-white/85 p-6 shadow-lg shadow-[#8a4f1d]/5"
          >
            <h2 className="text-lg font-black text-[#211915]">{card.title}</h2>
            <p className="mt-3 text-sm leading-6 text-[#66574d]">
              {card.description}
            </p>
          </article>
        ))}
      </section>

      <section className="mt-6 grid gap-4 rounded-[2rem] border border-[#e6d2b7] bg-white/80 p-6 shadow-xl shadow-[#8a4f1d]/10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center md:p-8">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[#9b6b3c]">
            Privacy boundary
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[#66574d]">
            Free local repair still keeps photos in your browser. This page is
            only for the paid Human-assisted Restore order you intentionally
            created before checkout.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {humanRestoreTrustNotes.map(note => (
            <article
              key={note.title}
              className="rounded-[1.25rem] border border-[#e6d2b7] bg-[#fffaf3] p-4 text-sm leading-6 text-[#66574d]"
            >
              <h2 className="font-black text-[#211915]">{note.title}</h2>
              <p className="mt-2">{note.description}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

import { useEffect, useState } from 'react'
import trackProductEvent from '../analytics'
import HumanRestoreUploadForm from './HumanRestoreUploadForm'

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
      <section className="rounded-[2rem] border border-[#e6d2b7] bg-white/80 p-8 shadow-2xl shadow-[#8a4f1d]/10 md:p-12">
        <p className="text-sm font-bold uppercase tracking-[0.24em] text-[#9b6b3c]">
          Secure upload
        </p>
        <h1 className="mt-4 max-w-3xl text-4xl font-black tracking-tight text-[#211915] sm:text-6xl">
          Upload the photo for your paid restoration order.
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-[#66574d]">
          This secure link is tied to a paid Human-assisted Restore order. Add
          your photo and repair notes below. No account is required.
        </p>
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
      )}
    </div>
  )
}

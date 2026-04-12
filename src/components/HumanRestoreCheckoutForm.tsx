import { FormEvent, useState } from 'react'
import trackProductEvent from '../analytics'

type HumanRestoreCheckoutResponse = {
  checkoutRef?: string
  error?: string
  ok?: boolean
  orderId?: string
}

type HumanRestoreCheckoutFormProps = {
  onCancel: () => void
  onCheckoutCreated: (payload: { checkoutRef: string; orderId: string }) => void
}

type SubmissionStatus = 'idle' | 'submitting' | 'error'

const maxUploadSizeBytes = 15 * 1024 * 1024
const allowedImageTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
])

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`
  }

  return `${Math.max(1, Math.round(size / 1024))} KB`
}

export default function HumanRestoreCheckoutForm(
  props: HumanRestoreCheckoutFormProps
) {
  const { onCancel, onCheckoutCreated } = props
  const [notes, setNotes] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [status, setStatus] = useState<SubmissionStatus>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const notesFieldId = 'human-restore-precheckout-notes'
  const photoFieldId = 'human-restore-precheckout-photo'

  function onSelectFile(file: File | null) {
    setStatus('idle')
    setErrorMessage('')

    if (!file) {
      setSelectedFile(null)
      return
    }

    if (!allowedImageTypes.has(file.type)) {
      setSelectedFile(null)
      setErrorMessage('Please upload a JPG, PNG, WebP, HEIC, or HEIF image.')
      return
    }

    if (file.size > maxUploadSizeBytes) {
      setSelectedFile(null)
      setErrorMessage(
        'Please keep the upload under 15 MB for this beta workflow.'
      )
      return
    }

    setSelectedFile(file)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selectedFile) {
      setStatus('error')
      setErrorMessage('Please choose the photo you want us to restore.')
      return
    }

    const formData = new FormData()
    formData.append('notes', notes.trim())
    formData.append('photo', selectedFile)

    setStatus('submitting')
    setErrorMessage('')

    trackProductEvent('create_human_restore_order_started', {
      file_size_bucket: selectedFile.size > 5 * 1024 * 1024 ? 'large' : 'small',
      has_notes: Boolean(notes.trim()),
    })

    try {
      const response = await fetch('/api/human-restore-checkout', {
        body: formData,
        method: 'POST',
      })
      const responseBody = (await response
        .json()
        .catch(() => null)) as HumanRestoreCheckoutResponse | null

      if (!response.ok || !responseBody?.orderId) {
        throw new Error(
          responseBody?.error ||
            'Checkout could not be prepared. Please try again in a moment.'
        )
      }

      trackProductEvent('create_human_restore_order_completed', {
        checkout_ref_created: Boolean(responseBody.checkoutRef),
        order_id_created: Boolean(responseBody.orderId),
      })

      onCheckoutCreated({
        checkoutRef: responseBody.checkoutRef || '',
        orderId: responseBody.orderId,
      })
    } catch (error) {
      setStatus('error')
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Checkout could not be prepared. Please try again in a moment.'
      )

      trackProductEvent('create_human_restore_order_failed', {
        has_notes: Boolean(notes.trim()),
      })
    }
  }

  return (
    <section className="max-w-4xl">
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.24em] text-[#9b6b3c]">
            Human-assisted Restore
          </p>
          <h2 className="mt-3 text-4xl font-black tracking-tight text-[#211915] md:text-5xl">
            Upload one photo before secure checkout.
          </h2>
          <p className="mt-4 max-w-2xl leading-7 text-[#66574d]">
            No email is needed here. Paddle collects your checkout email, and we
            deliver the approved restoration to that address after human review.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#d7b98c] bg-white text-2xl font-black text-[#211915] transition hover:-translate-y-1"
          aria-label="Close Human-assisted Restore checkout"
        >
          x
        </button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {[
          '1 photo per $19 order',
          'Payment email is delivery email',
          'Unpaid uploads auto-expire',
        ].map(item => (
          <div
            key={item}
            className="rounded-2xl border border-[#e6d2b7] bg-white/75 px-4 py-3 text-sm font-black text-[#5b4a40]"
          >
            {item}
          </div>
        ))}
      </div>

      <form className="mt-7 grid gap-5" onSubmit={handleSubmit}>
        <label className="grid gap-2" htmlFor={photoFieldId}>
          <span className="text-sm font-black uppercase tracking-[0.14em] text-[#211915]">
            Photo to restore
          </span>
          <input
            id={photoFieldId}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
            onChange={event => {
              onSelectFile(event.currentTarget.files?.[0] ?? null)
            }}
            className="rounded-[1.5rem] border-2 border-dashed border-[#d7b98c] bg-[#fffaf3] px-4 py-5 text-base text-[#211915] file:mr-4 file:rounded-full file:border-0 file:bg-[#211915] file:px-5 file:py-3 file:font-black file:text-white"
            disabled={status === 'submitting'}
            required
          />
          <p className="text-sm leading-6 text-[#66574d]">
            Accepted: JPG, PNG, WebP, HEIC, HEIF. Beta upload limit: 15 MB.
          </p>
          {selectedFile && (
            <p className="text-sm font-bold text-[#5b4a40]">
              Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)}
              )
            </p>
          )}
        </label>

        <label className="grid gap-2" htmlFor={notesFieldId}>
          <span className="text-sm font-black uppercase tracking-[0.14em] text-[#211915]">
            Repair notes
          </span>
          <textarea
            id={notesFieldId}
            value={notes}
            onChange={event => {
              setNotes(event.currentTarget.value)
            }}
            className="min-h-[136px] rounded-[1.5rem] border border-[#d7b98c] bg-[#fffaf3] px-4 py-4 text-base leading-7 text-[#211915] outline-none transition focus:border-[#211915]"
            placeholder="Tell us what matters most: scratches, missing details, color fading, faces, keeping the result natural, or any family context that will help."
            disabled={status === 'submitting'}
          />
        </label>

        <div className="rounded-[1.5rem] border border-[#e6d2b7] bg-[#fffaf3] px-5 py-4 text-sm leading-6 text-[#66574d]">
          Privacy boundary: the free local repair tool still keeps photos in
          your browser. This paid workflow temporarily uploads only the photo
          you choose here. If checkout is not completed, the pending upload is
          scheduled for automatic deletion.
        </div>

        {errorMessage && (
          <div className="rounded-[1.5rem] border border-[#f0b5a9] bg-[#fff1ed] px-5 py-4 text-sm leading-6 text-[#8a2f1d]">
            <p className="font-black">Checkout not ready</p>
            <p className="mt-1">{errorMessage}</p>
          </div>
        )}

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="max-w-2xl text-xs leading-6 text-[#66574d]">
            After the upload is saved, Paddle opens for secure payment. You will
            not need to upload this photo again after payment.
          </p>
          <button
            type="submit"
            disabled={status === 'submitting'}
            className="inline-flex justify-center rounded-full bg-[#211915] px-7 py-4 text-center font-black text-white shadow-xl shadow-[#211915]/20 transition hover:-translate-y-1 hover:bg-[#3a2820] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {status === 'submitting'
              ? 'Saving photo and opening checkout...'
              : 'Continue to secure checkout'}
          </button>
        </div>
      </form>
    </section>
  )
}

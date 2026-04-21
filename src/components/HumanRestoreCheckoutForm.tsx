import { FormEvent, useEffect, useState } from 'react'
import trackProductEvent from '../analytics'
import {
  humanRestorePolicyLinkText,
  humanRestorePolicySummary,
} from '../contentPolicy'
import { humanRestoreAiHdPrice, humanRestorePrice } from '../lib/localRepair'
import type { HumanRestoreTier } from '../lib/paypal/env'

type HumanRestoreCheckoutResponse = {
  checkoutRef?: string
  error?: string
  ok?: boolean
  orderId?: string
}

type HumanRestoreCheckoutPayload = {
  checkoutRef: string
  orderId: string
  tier: HumanRestoreTier
}

type CheckoutLaunchResult = {
  error?: string
  ok: boolean
}

type HumanRestoreCheckoutFormProps = {
  defaultTier?: HumanRestoreTier
  onCancel: () => void
  onCheckoutCreated: (
    payload: HumanRestoreCheckoutPayload
  ) => CheckoutLaunchResult | Promise<CheckoutLaunchResult>
  onTierChange?: (tier: HumanRestoreTier) => void
}

type SubmissionStatus =
  | 'idle'
  | 'submitting'
  | 'opening'
  | 'checkout-ready'
  | 'error'

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
  const {
    defaultTier = 'ai_hd',
    onCancel,
    onCheckoutCreated,
    onTierChange,
  } = props
  const [tier, setTier] = useState<HumanRestoreTier>(defaultTier)
  const [notes, setNotes] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [policyAccepted, setPolicyAccepted] = useState(false)
  const [checkoutPayload, setCheckoutPayload] =
    useState<HumanRestoreCheckoutPayload | null>(null)
  const [status, setStatus] = useState<SubmissionStatus>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    setTier(defaultTier)
  }, [defaultTier])

  function handleTierChange(next: HumanRestoreTier) {
    if (checkoutPayload) {
      return
    }

    setTier(next)

    if (onTierChange) {
      onTierChange(next)
    }
  }
  const notesFieldId = 'human-restore-precheckout-notes'
  const policyFieldId = 'human-restore-precheckout-policy'
  const photoFieldId = 'human-restore-precheckout-photo'
  const isBusy = status === 'submitting' || status === 'opening'
  const hasSavedCheckout = Boolean(checkoutPayload)

  function onSelectFile(file: File | null) {
    if (hasSavedCheckout) {
      return
    }

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

  async function openSavedCheckout(
    payload: HumanRestoreCheckoutPayload,
    source: 'after_upload' | 'retry'
  ) {
    setStatus('opening')
    setErrorMessage('')

    try {
      const launchResult = await onCheckoutCreated(payload)

      if (!launchResult.ok) {
        throw new Error(
          launchResult.error ||
            'Secure checkout could not open. Please retry in a moment.'
        )
      }

      setStatus('checkout-ready')
      trackProductEvent('open_human_restore_checkout_requested', {
        checkout_ref_created: Boolean(payload.checkoutRef),
        local_order_created: Boolean(payload.orderId),
        source,
      })
    } catch (error) {
      setStatus('error')
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Secure checkout could not open. Please retry in a moment.'
      )

      trackProductEvent('open_human_restore_checkout_failed', {
        checkout_ref_created: Boolean(payload.checkoutRef),
        local_order_created: Boolean(payload.orderId),
        source,
      })
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (checkoutPayload) {
      await openSavedCheckout(checkoutPayload, 'retry')
      return
    }

    if (!selectedFile) {
      setStatus('error')
      setErrorMessage('Please choose the photo you want us to restore.')
      return
    }

    if (!policyAccepted) {
      setStatus('error')
      setErrorMessage(
        'Please confirm that your photo follows our Acceptable Use Policy before continuing.'
      )
      return
    }

    const formData = new FormData()
    formData.append('notes', notes.trim())
    formData.append('contentPolicyAccepted', 'true')
    formData.append('photo', selectedFile)
    formData.append('productTier', tier)

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

      const nextCheckoutPayload = {
        checkoutRef: responseBody.checkoutRef || '',
        orderId: responseBody.orderId,
        tier,
      }

      setCheckoutPayload(nextCheckoutPayload)
      setStatus('checkout-ready')
      trackProductEvent('human_restore_order_saved_payment_ready', {
        checkout_ref_created: Boolean(nextCheckoutPayload.checkoutRef),
        local_order_created: Boolean(nextCheckoutPayload.orderId),
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

  let submitButtonText = 'Continue to secure checkout'

  if (status === 'submitting') {
    submitButtonText = 'Saving photo...'
  } else if (status === 'opening') {
    submitButtonText = 'Opening secure checkout...'
  } else if (checkoutPayload) {
    submitButtonText = 'Pay securely'
  }

  const checkoutHelperText = checkoutPayload
    ? 'Your upload is saved. Click Pay securely to open checkout from this same order.'
    : 'After the upload is saved, secure checkout opens for payment. You will not need to upload this photo again after payment.'
  const checkoutErrorTitle = checkoutPayload
    ? 'Photo saved. Checkout did not open'
    : 'Checkout not ready'

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
            No email is needed here. The payment provider collects your checkout
            email, and we deliver the approved restoration to that address after
            human review.
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
          '1 photo per order',
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

      <fieldset
        className="mt-6 rounded-[1.5rem] border border-[#e6d2b7] bg-white/80 p-4 md:p-5"
        disabled={hasSavedCheckout}
      >
        <legend className="px-2 text-sm font-black uppercase tracking-[0.14em] text-[#9b6b3c]">
          Choose your restoration tier
        </legend>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {[
            {
              id: 'ai_hd' as HumanRestoreTier,
              name: 'AI HD Restore',
              price: humanRestoreAiHdPrice,
              cadence: 'per photo',
              description:
                'Cloud AI fixes color, clarity, scratches and stains. Delivered in minutes.',
              caveat:
                'Human faces may vary slightly. Pick Human Retouch for face-accurate results.',
            },
            {
              id: 'human' as HumanRestoreTier,
              name: 'Human Retouch',
              price: humanRestorePrice,
              cadence: 'per photo',
              description:
                'A human retoucher finishes the photo. Face-accurate, delivered within 24 hours.',
              caveat: 'Includes one free revision if the first pass misses.',
            },
          ].map(option => {
            const isSelected = tier === option.id

            return (
              <label
                key={option.id}
                htmlFor={`human-restore-tier-${option.id}`}
                className={[
                  'flex cursor-pointer flex-col gap-2 rounded-[1.25rem] border p-4 transition',
                  isSelected
                    ? 'border-[#211915] bg-[#fffaf3] shadow-md'
                    : 'border-[#e6d2b7] bg-white/80 hover:border-[#d7b98c]',
                  hasSavedCheckout ? 'cursor-not-allowed opacity-70' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <input
                  id={`human-restore-tier-${option.id}`}
                  type="radio"
                  name="human-restore-tier"
                  value={option.id}
                  checked={isSelected}
                  onChange={() => handleTierChange(option.id)}
                  className="sr-only"
                  disabled={hasSavedCheckout}
                />
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-base font-black text-[#211915]">
                    {option.name}
                  </span>
                  <span className="text-lg font-black text-[#211915]">
                    {option.price}
                    <span className="ml-1 text-xs font-bold text-[#66574d]">
                      {option.cadence}
                    </span>
                  </span>
                </div>
                <p className="text-sm leading-5 text-[#5b4a40]">
                  {option.description}
                </p>
                <p className="text-xs leading-5 text-[#66574d]">
                  {option.caveat}
                </p>
              </label>
            )
          })}
        </div>
      </fieldset>

      {checkoutPayload && (
        <div className="mt-6 rounded-[1.5rem] border border-[#b8d99f] bg-[#f4ffe8] px-5 py-4 text-sm leading-6 text-[#355322]">
          <p className="font-black">Photo saved before payment</p>
          <p className="mt-1">
            Your source photo and notes are attached to a pending order for 48
            hours. Click Pay securely below to open checkout. Do not upload the
            same photo again.
          </p>
        </div>
      )}

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
            disabled={isBusy || hasSavedCheckout}
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
            disabled={isBusy || hasSavedCheckout}
          />
        </label>

        <div className="rounded-[1.5rem] border border-[#e6d2b7] bg-[#fffaf3] px-5 py-4 text-sm leading-6 text-[#66574d]">
          Privacy boundary: the free local repair tool still keeps photos in
          your browser. This paid workflow temporarily uploads only the photo
          you choose here. If checkout is not completed, the pending upload is
          scheduled for automatic deletion.
        </div>

        {!hasSavedCheckout && (
          <div className="flex gap-3 rounded-[1.5rem] border border-[#d7b98c] bg-white px-5 py-4 text-sm leading-6 text-[#5b4a40]">
            <input
              id={policyFieldId}
              type="checkbox"
              checked={policyAccepted}
              onChange={event => {
                setPolicyAccepted(event.currentTarget.checked)
              }}
              className="mt-1 h-5 w-5 shrink-0 accent-[#211915]"
              disabled={isBusy}
              required
            />
            <label htmlFor={policyFieldId}>
              {humanRestorePolicySummary} I agree to the{' '}
              <a
                href="/acceptable-use"
                target="_blank"
                rel="noreferrer"
                className="font-black text-[#211915] underline"
              >
                {humanRestorePolicyLinkText}
              </a>
              ,{' '}
              <a
                href="/terms"
                target="_blank"
                rel="noreferrer"
                className="font-black text-[#211915] underline"
              >
                Terms
              </a>
              , and{' '}
              <a
                href="/privacy"
                target="_blank"
                rel="noreferrer"
                className="font-black text-[#211915] underline"
              >
                Privacy Policy
              </a>
              .
            </label>
          </div>
        )}

        {errorMessage && (
          <div className="rounded-[1.5rem] border border-[#f0b5a9] bg-[#fff1ed] px-5 py-4 text-sm leading-6 text-[#8a2f1d]">
            <p className="font-black">{checkoutErrorTitle}</p>
            <p className="mt-1">{errorMessage}</p>
          </div>
        )}

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="max-w-2xl text-xs leading-6 text-[#66574d]">
            {checkoutHelperText}
          </p>
          <button
            type="submit"
            disabled={isBusy || (!hasSavedCheckout && !policyAccepted)}
            className="inline-flex justify-center rounded-full bg-[#211915] px-7 py-4 text-center font-black text-white shadow-xl shadow-[#211915]/20 transition hover:-translate-y-1 hover:bg-[#3a2820] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitButtonText}
          </button>
        </div>
      </form>
    </section>
  )
}

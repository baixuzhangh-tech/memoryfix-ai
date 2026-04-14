import { FormEvent, useEffect, useState } from 'react'
import trackProductEvent from '../analytics'
import {
  humanRestorePolicyLinkText,
  humanRestorePolicySummary,
} from '../contentPolicy'
import { humanRestoreAfterUploadSteps } from '../humanRestoreContent'

type HumanRestoreUploadFormProps = {
  defaultEmail: string
  defaultOrderReference: string
  presentation?: 'standalone' | 'task-card'
  secureOrderSummary?: {
    checkoutEmailMasked: string
    orderNumber?: string
    productName?: string
  } | null
  secureUploadToken?: string
}

type SubmissionStatus = 'idle' | 'submitting' | 'success' | 'error'

type SubmitResponse = {
  confirmationEmailSent?: boolean
  error?: string
  orderBound?: boolean
  submissionReference?: string
  supportEmail?: string
}

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

export default function HumanRestoreUploadForm(
  props: HumanRestoreUploadFormProps
) {
  const {
    defaultEmail,
    defaultOrderReference,
    presentation = 'standalone',
    secureOrderSummary,
    secureUploadToken,
  } = props
  const isSecureUpload = Boolean(secureUploadToken)
  const isTaskCard = presentation === 'task-card'

  const [checkoutEmail, setCheckoutEmail] = useState(defaultEmail)
  const [orderReference, setOrderReference] = useState(defaultOrderReference)
  const [notes, setNotes] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [policyAccepted, setPolicyAccepted] = useState(false)
  const [status, setStatus] = useState<SubmissionStatus>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [fileInputKey, setFileInputKey] = useState(0)
  const [submissionReference, setSubmissionReference] = useState('')
  const [confirmationEmailSent, setConfirmationEmailSent] = useState(true)
  const [supportEmail, setSupportEmail] = useState('')
  const checkoutEmailFieldId = 'human-restore-checkout-email'
  const orderReferenceFieldId = 'human-restore-order-reference'
  const notesFieldId = 'human-restore-notes'
  const policyFieldId = 'human-restore-policy'
  const photoFieldId = 'human-restore-photo'

  useEffect(() => {
    setCheckoutEmail(currentValue => currentValue || defaultEmail)
  }, [defaultEmail])

  useEffect(() => {
    setOrderReference(currentValue => currentValue || defaultOrderReference)
  }, [defaultOrderReference])

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
      setErrorMessage('Please keep the upload under 15 MB for this beta form.')
      return
    }

    setSelectedFile(file)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!isSecureUpload && !checkoutEmail.trim()) {
      setStatus('error')
      setErrorMessage('Please enter the email you used at checkout.')
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
        'Please confirm that your photo follows our Acceptable Use Policy before submitting.'
      )
      return
    }

    const formData = new FormData()
    formData.append('checkoutEmail', checkoutEmail.trim())
    formData.append('orderReference', orderReference.trim())
    formData.append('notes', notes.trim())
    formData.append('contentPolicyAccepted', 'true')
    formData.append('photo', selectedFile)
    if (secureUploadToken) {
      formData.append('token', secureUploadToken)
    }

    setStatus('submitting')
    setErrorMessage('')
    setSubmissionReference('')
    setConfirmationEmailSent(true)
    setSupportEmail('')

    trackProductEvent('submit_human_restore_upload_started', {
      has_order_reference: Boolean(orderReference.trim()),
      has_notes: Boolean(notes.trim()),
      file_size_bucket: selectedFile.size > 5 * 1024 * 1024 ? 'large' : 'small',
      secure_upload: isSecureUpload,
    })

    try {
      const response = await fetch('/api/human-restore-upload', {
        method: 'POST',
        body: formData,
      })
      const responseBody = (await response
        .json()
        .catch(() => null)) as SubmitResponse | null

      if (!response.ok) {
        throw new Error(
          responseBody?.error ||
            'Upload failed. Please try again in a moment or use your order email as fallback.'
        )
      }

      setStatus('success')
      setSelectedFile(null)
      setNotes('')
      setPolicyAccepted(false)
      setFileInputKey(currentValue => currentValue + 1)
      setSubmissionReference(responseBody?.submissionReference || '')
      setConfirmationEmailSent(responseBody?.confirmationEmailSent !== false)
      setSupportEmail(responseBody?.supportEmail || '')

      trackProductEvent('submit_human_restore_upload_completed', {
        has_order_reference: Boolean(orderReference.trim()),
        confirmation_email_sent: responseBody?.confirmationEmailSent !== false,
        secure_upload: isSecureUpload,
      })
    } catch (error) {
      const nextErrorMessage =
        error instanceof Error
          ? error.message
          : 'Upload failed. Please try again in a moment.'

      setStatus('error')
      setErrorMessage(nextErrorMessage)

      trackProductEvent('submit_human_restore_upload_failed', {
        has_order_reference: Boolean(orderReference.trim()),
        secure_upload: isSecureUpload,
      })
    }
  }

  const sectionClassName = isTaskCard
    ? 'rounded-[2rem] border border-[#e1c8a8] bg-white p-5 shadow-2xl shadow-[#8a4f1d]/15 md:p-6'
    : 'mt-10 rounded-[2rem] border border-[#e6d2b7] bg-white/80 p-8 shadow-xl shadow-[#8a4f1d]/10 md:p-10'
  let eyebrowText = 'Backup upload form'
  let headingText = 'Use this backup form for your paid order only if needed.'

  if (isTaskCard) {
    eyebrowText = 'Start here'
    headingText = isSecureUpload
      ? 'Upload one source photo'
      : 'Backup upload for your paid order'
  } else if (isSecureUpload) {
    eyebrowText = 'Secure upload'
    headingText = 'Upload the photo you want restored.'
  }

  const formClassName = isTaskCard ? 'mt-5 grid gap-4' : 'mt-8 grid gap-6'
  const notesClassName = isTaskCard
    ? 'min-h-[104px] rounded-[1.25rem] border border-[#d7b98c] bg-[#fffaf3] px-4 py-3 text-base leading-7 text-[#211915] outline-none transition focus:border-[#211915]'
    : 'min-h-[140px] rounded-[1.5rem] border border-[#d7b98c] bg-[#fffaf3] px-4 py-4 text-base leading-7 text-[#211915] outline-none transition focus:border-[#211915]'
  const inputClassName =
    'rounded-2xl border border-[#d7b98c] bg-[#fffaf3] px-4 py-4 text-base text-[#211915] outline-none transition focus:border-[#211915]'
  const fileInputClassName = isTaskCard
    ? 'rounded-[1.5rem] border-2 border-dashed border-[#d7b98c] bg-[#fffaf3] px-4 py-5 text-base text-[#211915] file:mr-4 file:rounded-full file:border-0 file:bg-[#211915] file:px-5 file:py-3 file:font-black file:text-white'
    : 'rounded-2xl border border-[#d7b98c] bg-[#fffaf3] px-4 py-4 text-base text-[#211915] file:mr-4 file:rounded-full file:border-0 file:bg-[#211915] file:px-5 file:py-3 file:font-black file:text-white'

  return (
    <section className={sectionClassName}>
      <div className="max-w-3xl">
        <p className="text-sm font-black uppercase tracking-[0.24em] text-[#9b6b3c]">
          {eyebrowText}
        </p>
        <h2
          className={
            isTaskCard
              ? 'mt-2 text-3xl font-black tracking-tight text-[#211915]'
              : 'mt-3 text-3xl font-black sm:text-4xl'
          }
        >
          {headingText}
        </h2>
        <p
          className={
            isTaskCard
              ? 'mt-3 text-sm leading-6 text-[#66574d]'
              : 'mt-4 leading-7 text-[#66574d]'
          }
        >
          {isSecureUpload
            ? 'Choose the clearest scan or original image. Add a short note, then submit once to start human-reviewed restoration.'
            : 'Your secure upload page or secure email link is still the best path. If those are unavailable, use the same checkout email here and add the payment transaction reference if you have it so we can match the paid order quickly.'}
        </p>
      </div>

      {isSecureUpload && secureOrderSummary && (
        <div className="mt-5 flex flex-wrap gap-2 text-xs font-black text-[#5b4a40]">
          <div className="rounded-full border border-[#b8d99f] bg-[#f4ffe8] px-4 py-2 text-[#355322]">
            Payment confirmed
          </div>
          <div className="rounded-full border border-[#e6d2b7] bg-[#fffaf3] px-4 py-2">
            {secureOrderSummary.checkoutEmailMasked}
          </div>
          <div className="rounded-full border border-[#e6d2b7] bg-[#fffaf3] px-4 py-2">
            {secureOrderSummary.orderNumber || 'Paid order'}
          </div>
          <div className="rounded-full border border-[#e6d2b7] bg-[#fffaf3] px-4 py-2">
            {secureOrderSummary.productName || 'Human-assisted Restore'}
          </div>
        </div>
      )}

      <div className="mt-5 rounded-[1.5rem] border border-[#e6d2b7] bg-[#fffaf3] px-5 py-4 text-sm leading-6 text-[#66574d]">
        {isSecureUpload
          ? 'Privacy note: free local repair stays in your browser. This paid upload is only for the human-reviewed service you purchased.'
          : 'Privacy note: this backup upload is only for matching and completing your paid human-reviewed restoration order.'}
      </div>

      <form className={formClassName} onSubmit={handleSubmit}>
        {!isSecureUpload && (
          <div
            className={isTaskCard ? 'grid gap-4' : 'grid gap-6 md:grid-cols-2'}
          >
            <label className="grid gap-2" htmlFor={checkoutEmailFieldId}>
              <span className="text-sm font-black uppercase tracking-[0.14em] text-[#211915]">
                Checkout email
              </span>
              <input
                id={checkoutEmailFieldId}
                type="email"
                value={checkoutEmail}
                onChange={event => {
                  setCheckoutEmail(event.currentTarget.value)
                }}
                className={inputClassName}
                placeholder="you@example.com"
                autoComplete="email"
                disabled={status === 'submitting'}
                required
              />
            </label>

            <label className="grid gap-2" htmlFor={orderReferenceFieldId}>
              <span className="text-sm font-black uppercase tracking-[0.14em] text-[#211915]">
                Payment reference
              </span>
              <input
                id={orderReferenceFieldId}
                type="text"
                value={orderReference}
                onChange={event => {
                  setOrderReference(event.currentTarget.value)
                }}
                className={inputClassName}
                placeholder="Transaction ID from your payment receipt"
                autoComplete="off"
                disabled={status === 'submitting'}
                required
              />
            </label>
          </div>
        )}

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
            className={notesClassName}
            placeholder="Tell us what matters most: scratches, missing details, color fading, cleanup around faces, delivery deadline, or any family context that will help."
            disabled={status === 'submitting'}
          />
        </label>

        <label className="grid gap-2" htmlFor={photoFieldId}>
          <span className="text-sm font-black uppercase tracking-[0.14em] text-[#211915]">
            Photo to restore
          </span>
          <input
            id={photoFieldId}
            key={fileInputKey}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
            onChange={event => {
              onSelectFile(event.currentTarget.files?.[0] ?? null)
            }}
            className={fileInputClassName}
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

        <div className="flex gap-3 rounded-[1.5rem] border border-[#d7b98c] bg-white px-5 py-4 text-sm leading-6 text-[#5b4a40]">
          <input
            id={policyFieldId}
            type="checkbox"
            checked={policyAccepted}
            onChange={event => {
              setPolicyAccepted(event.currentTarget.checked)
            }}
            className="mt-1 h-5 w-5 shrink-0 accent-[#211915]"
            disabled={status === 'submitting'}
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

        {status === 'success' && (
          <div className="grid gap-3 rounded-[1.5rem] border border-[#b8d99f] bg-[#f4ffe8] px-5 py-5 text-[#355322]">
            <p className="text-base font-black text-[#1f3413]">
              Photo received. Human review is next.
            </p>
            <p className="leading-7">
              {isSecureUpload
                ? 'Your photo is attached to this paid order. Next we prepare a restoration draft, review the result, and usually deliver within 48 hours during beta.'
                : 'Your photo was received for paid order matching. Next we prepare a restoration draft, review the result, and usually deliver within 48 hours during beta.'}
            </p>
            <div className="grid gap-2 rounded-[1.25rem] border border-[#b8d99f] bg-white/60 px-4 py-4 text-sm">
              {humanRestoreAfterUploadSteps.map((step, index) => (
                <p key={step} className="leading-6">
                  <span className="font-black text-[#1f3413]">
                    {index + 1}.
                  </span>{' '}
                  {step}
                </p>
              ))}
            </div>
            {submissionReference && (
              <div className="rounded-[1.25rem] border border-[#b8d99f] bg-white/60 px-4 py-4 text-sm">
                <p className="font-black uppercase tracking-[0.14em]">
                  Submission reference
                </p>
                <p className="mt-2 text-base font-black text-[#211915]">
                  {submissionReference}
                </p>
              </div>
            )}
            <div className="text-sm leading-6">
              {confirmationEmailSent ? (
                <p>
                  {isSecureUpload
                    ? 'A confirmation email has been sent. You do not need to submit again unless support asks you to.'
                    : 'A confirmation email has been sent to your checkout email. You do not need to submit again unless support asks you to.'}
                </p>
              ) : (
                <p>
                  Your upload was received, but the confirmation email could not
                  be sent automatically. Do not pay again. Keep this page and
                  your submission reference. If needed, contact{' '}
                  {supportEmail || 'support'}.
                </p>
              )}
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="grid gap-3 rounded-[1.5rem] border border-[#f0b5a9] bg-[#fff1ed] px-5 py-5 text-[#8a2f1d]">
            <p className="font-black">Submission not completed</p>
            <p>{errorMessage}</p>
            <p className="text-sm leading-6">
              {isSecureUpload
                ? 'Please retry once using this page. If it still fails, do not pay again. Reply to your secure upload email and mention that the form did not complete.'
                : 'Please retry once. If it still fails, do not pay again. Reply to your order confirmation email and mention that the upload form did not complete.'}
            </p>
          </div>
        )}

        <div
          className={
            isTaskCard
              ? 'grid gap-3'
              : 'flex flex-col gap-3 md:flex-row md:items-center md:justify-between'
          }
        >
          <p className="max-w-2xl text-xs leading-6 text-[#66574d]">
            {isSecureUpload
              ? 'Please submit only once for this paid order unless support asks you to upload again.'
              : 'This backup form is only for paid Human-assisted Restore orders. Please submit only once per paid order unless support asks you to upload again.'}
          </p>
          <button
            type="submit"
            disabled={status === 'submitting' || !policyAccepted}
            className="inline-flex justify-center rounded-full bg-[#211915] px-7 py-4 text-center font-black text-white shadow-xl shadow-[#211915]/20 transition hover:-translate-y-1 hover:bg-[#3a2820] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {status === 'submitting'
              ? 'Uploading photo securely...'
              : 'Submit photo for restoration'}
          </button>
        </div>
      </form>
    </section>
  )
}

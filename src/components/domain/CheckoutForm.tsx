import type { FormEvent } from 'react'
import { useState } from 'react'
import { AlertCircle, Loader2, ShieldCheck, X } from 'lucide-react'

import trackProductEvent from '@/analytics'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  humanRestorePolicyLinkText,
  humanRestorePolicySummary,
} from '@/contentPolicy'

type HumanRestoreCheckoutResponse = {
  checkoutRef?: string
  error?: string
  ok?: boolean
  orderId?: string
}

type HumanRestoreCheckoutPayload = {
  checkoutRef: string
  orderId: string
}

type CheckoutLaunchResult = {
  error?: string
  ok: boolean
}

export interface CheckoutFormProps {
  onCancel: () => void
  onCheckoutCreated: (
    payload: HumanRestoreCheckoutPayload
  ) => CheckoutLaunchResult | Promise<CheckoutLaunchResult>
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

/**
 * Phase 2-B.3 simplified pre-payment checkout form.
 *
 * Rendered inside the existing Modal in App.tsx when `?v=2` is active.
 * All business logic (file validation, POST /api/human-restore-checkout,
 * onCheckoutCreated Paddle launch, retry path, analytics events) is
 * IDENTICAL to HumanRestoreCheckoutForm — only the presentation changed.
 * Props interface is kept compatible so App.tsx just swaps the component.
 *
 * The legacy form rendered a 3-chip feature strip + long marketing copy
 * around the inputs. At the moment a buyer has clicked "Restore my photo"
 * they have already decided to pay; the form should now feel like a
 * quick commitment, not a second marketing page.
 */
export function CheckoutForm({
  onCancel,
  onCheckoutCreated,
}: CheckoutFormProps) {
  const [notes, setNotes] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [policyAccepted, setPolicyAccepted] = useState(false)
  const [checkoutPayload, setCheckoutPayload] =
    useState<HumanRestoreCheckoutPayload | null>(null)
  const [status, setStatus] = useState<SubmissionStatus>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const notesFieldId = 'checkout-v2-notes'
  const policyFieldId = 'checkout-v2-policy'
  const photoFieldId = 'checkout-v2-photo'
  const isBusy = status === 'submitting' || status === 'opening'
  const hasSavedCheckout = Boolean(checkoutPayload)

  function onSelectFile(file: File | null) {
    if (hasSavedCheckout) return
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
      }

      setCheckoutPayload(nextCheckoutPayload)
      await openSavedCheckout(nextCheckoutPayload, 'after_upload')
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

  let submitButtonText = 'Continue to secure checkout — $19'
  if (status === 'submitting') submitButtonText = 'Saving photo…'
  else if (status === 'opening') submitButtonText = 'Opening checkout…'
  else if (checkoutPayload) submitButtonText = 'Pay securely — $19'

  return (
    <section className="flex w-full max-w-lg flex-col gap-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="mb-1 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Human-assisted restoration
          </p>
          <h2 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground md:text-3xl">
            One photo, one payment.
          </h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onCancel}
          aria-label="Close checkout"
        >
          <X className="h-5 w-5" aria-hidden />
        </Button>
      </header>

      {checkoutPayload ? (
        <Card className="border-primary/30 bg-primary/5 shadow-card">
          <CardContent className="flex items-start gap-3 p-4">
            <ShieldCheck
              className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary"
              aria-hidden
            />
            <div className="text-sm leading-relaxed text-foreground">
              <p className="font-medium">Photo saved before payment.</p>
              <p className="mt-1 text-muted-foreground">
                Your source photo and notes are attached to a pending order for
                48 hours. Do not upload again — click Pay securely to open
                checkout.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-2">
          <label
            className="text-sm font-medium text-foreground"
            htmlFor={photoFieldId}
          >
            Photo to restore
          </label>
          <input
            id={photoFieldId}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
            onChange={event => {
              onSelectFile(event.currentTarget.files?.[0] ?? null)
            }}
            className={cn(
              'rounded-md border border-dashed border-border bg-background px-4 py-4 text-sm text-foreground',
              'file:mr-4 file:rounded-sm file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground',
              'disabled:cursor-not-allowed disabled:opacity-60'
            )}
            disabled={isBusy || hasSavedCheckout}
            required
          />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Accepted: JPG, PNG, WebP, HEIC, HEIF. Upload limit: 15 MB.
          </p>
          {selectedFile ? (
            <p className="text-xs text-foreground">
              Selected: <span className="font-mono">{selectedFile.name}</span> (
              {formatFileSize(selectedFile.size)})
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <label
            className="text-sm font-medium text-foreground"
            htmlFor={notesFieldId}
          >
            Notes for our reviewer{' '}
            <span className="text-muted-foreground">(optional)</span>
          </label>
          <textarea
            id={notesFieldId}
            value={notes}
            onChange={event => {
              setNotes(event.currentTarget.value)
            }}
            className="min-h-32 rounded-md border border-input bg-background px-3 py-3 text-sm leading-relaxed text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60"
            placeholder="Tell us what matters most: scratches, faces, color fading, keeping it natural, family context…"
            disabled={isBusy || hasSavedCheckout}
          />
        </div>

        {!hasSavedCheckout ? (
          <label
            htmlFor={policyFieldId}
            className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-foreground"
          >
            <input
              id={policyFieldId}
              name="policy"
              type="checkbox"
              checked={policyAccepted}
              onChange={event => {
                setPolicyAccepted(event.currentTarget.checked)
              }}
              className="mt-0.5 h-4 w-4 flex-shrink-0 accent-primary"
              disabled={isBusy}
              required
            />
            <span className="text-muted-foreground">
              {humanRestorePolicySummary} I agree to the{' '}
              <a
                href="/acceptable-use"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                {humanRestorePolicyLinkText}
              </a>
              ,{' '}
              <a
                href="/terms"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                Terms
              </a>
              , and{' '}
              <a
                href="/privacy"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                Privacy Policy
              </a>
              .
            </span>
          </label>
        ) : null}

        {errorMessage ? (
          <Card className="border-destructive/30 bg-destructive/5 shadow-none">
            <CardContent className="flex items-start gap-3 p-4">
              <AlertCircle
                className="mt-0.5 h-5 w-5 flex-shrink-0 text-destructive"
                aria-hidden
              />
              <p className="text-sm leading-relaxed text-foreground">
                {errorMessage}
              </p>
            </CardContent>
          </Card>
        ) : null}

        <Button
          type="submit"
          variant="accent"
          size="lg"
          disabled={isBusy || (!hasSavedCheckout && !policyAccepted)}
          className="gap-2"
        >
          {isBusy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : null}
          {submitButtonText}
        </Button>

        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          No account needed. The payment provider collects your delivery email.
          Unpaid uploads auto-expire after 48 hours.
        </p>
      </form>
    </section>
  )
}

export default CheckoutForm

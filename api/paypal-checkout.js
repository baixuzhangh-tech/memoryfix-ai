/**
 * Unified PayPal checkout endpoint.
 *
 * POST /api/paypal-checkout
 * Body JSON: { action: "create" | "capture", ... }
 *
 * action=create  → creates a PayPal order (replaces /api/paypal-create-order)
 *   Body: { action: "create", orderId?, checkoutRef?, tier }
 *   Returns: { paypalOrderId, approvalUrl }
 *
 * action=capture → captures an approved PayPal order (replaces /api/paypal-capture-order)
 *   Body: { action: "capture", paypalOrderId, localOrderId?, checkoutRef?, tier? }
 *   Returns: { ok, orderId, captureId, redirectUrl }
 */

import { json, sendEmail, escapeHtml } from './_lib/human-restore.js'
import {
  emailCtaButton,
  emailCtaFallback,
  emailDetailBlock,
  emailInfoBox,
  emailNoteBox,
  emailParagraph,
  emailShell,
  emailStepsList,
} from './_lib/email-templates.js'
import { createPayPalOrder, capturePayPalOrder } from './_lib/paypal.js'
import { runRestoreJob } from './_lib/ai-restore.js'
import { autoDeliverAiHdJob } from './_lib/auto-deliver.js'
import {
  getJob,
  getOrder,
  getOrderByCheckoutRef,
  insertEvent,
  insertJob,
  updateJob,
  updateOrder,
} from './_lib/supabase.js'
import { isSupportedTier, resolveTierFromRecord } from './_lib/product-tier.js'

// ---------------------------------------------------------------------------
// action=create
// ---------------------------------------------------------------------------
async function handleCreate(req, res) {
  const { checkoutRef, orderId, tier } = req.body || {}

  if (!tier) {
    return json(res, 400, { error: 'tier is required.' })
  }

  if (!orderId && tier !== 'local_repair_pack') {
    return json(res, 400, { error: 'orderId is required.' })
  }

  const siteUrl = process.env.SITE_URL || 'https://artgen.site'

  try {
    const result = await createPayPalOrder({
      tier,
      orderId: orderId || '',
      checkoutRef: checkoutRef || '',
      returnUrl: `${siteUrl}/human-restore/success?order_id=${encodeURIComponent(
        orderId || ''
      )}&checkout_ref=${encodeURIComponent(checkoutRef || '')}&provider=paypal`,
      cancelUrl: `${siteUrl}/?checkout_cancelled=1`,
    })

    return json(res, 200, {
      paypalOrderId: result.paypalOrderId,
      approvalUrl: result.approvalUrl,
    })
  } catch (error) {
    console.error('[paypal-checkout:create] Error:', error)
    return json(res, 502, {
      error:
        error instanceof Error
          ? error.message
          : 'Could not create PayPal checkout session.',
    })
  }
}

// ---------------------------------------------------------------------------
// action=capture helpers
// ---------------------------------------------------------------------------
const defaultSiteUrl = 'https://artgen.site'

function getPaidOrderExpiresAt() {
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30)
  return expiresAt.toISOString()
}

function mapJobStatusToOrderStatus(status) {
  const supportedStatuses = new Set([
    'uploaded',
    'processing',
    'ai_queued',
    'ai_failed',
    'needs_review',
    'manual_review',
    'delivered',
    'failed',
  ])
  return supportedStatuses.has(status) ? status : 'paid'
}

function shouldAutoProcessAfterPayment() {
  return process.env.HUMAN_RESTORE_AUTO_PROCESS_AFTER_UPLOAD !== 'false'
}

async function findLocalOrder({ localOrderId, checkoutRef }) {
  if (localOrderId) {
    const order = await getOrder(String(localOrderId))
    if (order) return order
  }
  if (checkoutRef) {
    const order = await getOrderByCheckoutRef(String(checkoutRef))
    if (order) return order
  }
  return null
}

function buildPaymentConfirmedEmail({
  transaction,
  localOrder,
  submissionReference,
  supportEmail,
}) {
  const orderNumber = transaction.orderId
  const customerName = transaction.customerName || 'there'

  const bodyRows = [
    emailParagraph(
      `Hi ${escapeHtml(
        customerName
      )}, we received your payment and the photo you uploaded before checkout. Your restoration is now in our AI draft plus human review workflow.`
    ),
    emailDetailBlock([
      ['Order', String(orderNumber)],
      ['Submission reference', submissionReference],
    ]),
    emailParagraph('<strong style="color:#211915">What happens next:</strong>'),
    emailStepsList([
      'We prepare an AI restoration draft from your source photo.',
      'A human reviews the before and after result before delivery.',
      'During beta, approved restores are usually delivered within 48 hours.',
    ]),
    emailInfoBox('Your result will be sent to this checkout email address.'),
  ].join('')

  const html = emailShell({
    title: 'Your order is confirmed',
    heroTitle: 'Your order is<br/>confirmed',
    heroSubtitle: submissionReference,
    bodyRows,
    footerRef: submissionReference,
    supportEmail,
  })

  const text = [
    'Your MemoryFix AI order is confirmed.',
    `Order: ${orderNumber}`,
    `Submission reference: ${submissionReference}`,
    '',
    'We received your payment and the photo you uploaded before checkout.',
    'Next, we prepare an AI restoration draft, review it, and deliver the approved result by email.',
    `Support: ${supportEmail}`,
  ].join('\n')

  return { html, text }
}

function buildMerchantPaidOrderEmail({
  adminUrl,
  currentJob,
  localOrder,
  transaction,
  supportEmail,
}) {
  const bodyRows = [
    emailDetailBlock([
      ['Submission reference', localOrder.submission_reference],
      ['Checkout email', transaction.checkoutEmail],
      ['PayPal capture', String(transaction.captureId)],
      ['Job ID', currentJob.id],
      ['Status', currentJob.status],
    ]),
    emailNoteBox(
      `<strong style="color:#211915">Repair notes:</strong><br/>${escapeHtml(
        localOrder.notes || 'No extra notes provided.'
      ).replace(/\n/g, '<br/>')}`
    ),
    emailCtaButton(adminUrl, 'Open Admin Review'),
    emailCtaFallback(adminUrl, 'Open admin review page'),
  ].join('')

  const html = emailShell({
    title: 'Paid order ready for review',
    heroTitle: 'Paid order is<br/>ready for review',
    heroSubtitle: localOrder.submission_reference,
    bodyRows,
    footerRef: localOrder.submission_reference,
    supportEmail,
  })

  const text = [
    'Paid Human-assisted Restore order is ready for review',
    `Submission reference: ${localOrder.submission_reference}`,
    `Checkout email: ${transaction.checkoutEmail}`,
    `PayPal capture: ${transaction.captureId}`,
    `Job ID: ${currentJob.id}`,
    `Status: ${currentJob.status}`,
    `Repair notes: ${localOrder.notes || 'No extra notes provided.'}`,
    `Admin review: ${adminUrl}`,
    `Support contact: ${supportEmail}`,
  ].join('\n')

  return { html, text }
}

async function processPreuploadedOrder({
  localOrder,
  transaction,
  fromEmail,
  inboxEmail,
  resendApiKey,
  siteUrl,
  supportEmail,
}) {
  const paidExpiresAt = getPaidOrderExpiresAt()
  const paymentPatch = {
    checkout_email: transaction.checkoutEmail,
    customer_name: transaction.customerName || '',
    expires_at: paidExpiresAt,
    order_number: transaction.orderId ? String(transaction.orderId) : null,
    payment_confirmed_at: new Date().toISOString(),
    payment_provider: 'paypal',
    payment_provider_order_id: String(transaction.paypalOrderId),
    payment_provider_order_identifier: transaction.captureId || null,
    product_name: transaction.productName || localOrder.product_name,
    receipt_url: '',
    status: 'paid',
    test_mode: Boolean(transaction.testMode),
    variant_id: localOrder.variant_id || transaction.tier || '',
  }

  await updateOrder(localOrder.id, paymentPatch)

  // Preview-first path (AI HD): job already exists from preview creation
  if (localOrder.job_id) {
    const existingJob = await getJob(localOrder.job_id)

    if (existingJob) {
      let currentJob = await updateJob(existingJob.id, {
        checkout_email: transaction.checkoutEmail,
        customer_name: transaction.customerName || existingJob.customer_name,
        order_bound: true,
        order_id: String(transaction.paypalOrderId),
        order_number: transaction.orderId
          ? String(transaction.orderId)
          : existingJob.order_number,
        product_name: transaction.productName || existingJob.product_name,
        receipt_url: '',
        test_mode: Boolean(transaction.testMode),
      }).catch(() => existingJob)

      const paidTier = resolveTierFromRecord(localOrder)

      if (paidTier === 'ai_hd' && currentJob.status === 'needs_review') {
        const autoResult = await autoDeliverAiHdJob({
          job: currentJob,
          resendApiKey,
          fromEmail,
          supportEmail,
        }).catch(async error => {
          await insertEvent(currentJob.id, 'ai_hd_auto_delivery_failed', {
            error:
              error instanceof Error
                ? error.message
                : 'AI HD auto-delivery failed.',
            source: 'paypal_capture',
          })
          return null
        })

        if (autoResult?.delivered && autoResult.job) {
          currentJob = autoResult.job
        }
      }

      await updateOrder(localOrder.id, {
        ...paymentPatch,
        status: mapJobStatusToOrderStatus(currentJob.status),
      })

      await insertEvent(currentJob.id, 'payment_captured_paypal', {
        local_order_id: localOrder.id,
        paypal_order_id: String(transaction.paypalOrderId),
        capture_id: transaction.captureId,
        tier: paidTier,
      }).catch(() => null)

      return {
        job: currentJob,
        customerEmailSent: false,
        merchantEmailSent: false,
      }
    }
  }

  // Standard pre-upload path: create job + start AI
  const job = await insertJob({
    checkout_email: transaction.checkoutEmail,
    customer_name: transaction.customerName || '',
    expires_at: paidExpiresAt,
    human_restore_order_id: localOrder.id,
    notes: localOrder.notes || '',
    order_bound: true,
    order_id: String(transaction.paypalOrderId),
    order_number: transaction.orderId ? String(transaction.orderId) : null,
    original_file_name: localOrder.original_file_name,
    original_file_size: localOrder.original_file_size,
    original_file_type: localOrder.original_file_type,
    original_storage_bucket: localOrder.original_storage_bucket,
    original_storage_path: localOrder.original_storage_path,
    product_name: transaction.productName || localOrder.product_name,
    receipt_url: '',
    status: 'uploaded',
    submission_reference: localOrder.submission_reference,
    test_mode: Boolean(transaction.testMode),
    upload_source: 'pre_checkout_upload',
  })

  await insertEvent(job.id, 'payment_captured_paypal', {
    checkout_ref: localOrder.checkout_ref,
    local_order_id: localOrder.id,
    paypal_order_id: String(transaction.paypalOrderId),
    capture_id: transaction.captureId,
  })

  let currentJob = job

  if (shouldAutoProcessAfterPayment()) {
    currentJob = await runRestoreJob({
      job,
      triggeredBy: 'payment_confirmed',
    }).catch(async error => {
      await insertEvent(job.id, 'ai_restore_auto_start_failed', {
        error: error instanceof Error ? error.message : 'Auto restore failed.',
      })
      return job
    })

    await insertEvent(currentJob.id, 'ai_restore_auto_started_after_payment', {
      provider: currentJob.ai_provider,
      status: currentJob.status,
    })
  }

  const paidTier = resolveTierFromRecord(localOrder)

  if (paidTier === 'ai_hd' && currentJob.status === 'needs_review') {
    const autoResult = await autoDeliverAiHdJob({
      job: currentJob,
      resendApiKey,
      fromEmail,
      supportEmail,
    }).catch(async error => {
      await insertEvent(currentJob.id, 'ai_hd_auto_delivery_failed', {
        error:
          error instanceof Error
            ? error.message
            : 'AI HD auto-delivery failed.',
      })
      return null
    })

    if (autoResult?.delivered && autoResult.job) {
      currentJob = autoResult.job
    }
  }

  await updateOrder(localOrder.id, {
    ...paymentPatch,
    job_id: currentJob.id,
    status: mapJobStatusToOrderStatus(currentJob.status),
  })

  // Send emails
  let customerEmailSent = false
  let merchantEmailSent = false

  if (resendApiKey && supportEmail) {
    const adminUrl = new URL('/admin/review', siteUrl)
    adminUrl.searchParams.set('job', currentJob.id)

    if (inboxEmail) {
      const merchantEmail = buildMerchantPaidOrderEmail({
        adminUrl: adminUrl.toString(),
        currentJob,
        localOrder,
        transaction,
        supportEmail,
      })

      try {
        await sendEmail({
          resendApiKey,
          payload: {
            from: fromEmail,
            to: [inboxEmail],
            reply_to: transaction.checkoutEmail,
            subject: `Paid MemoryFix AI order - ${localOrder.submission_reference}`,
            html: merchantEmail.html,
            text: merchantEmail.text,
          },
        })
        merchantEmailSent = true
      } catch (error) {
        await insertEvent(currentJob.id, 'merchant_notification_failed', {
          error:
            error instanceof Error
              ? error.message
              : 'Merchant notification failed.',
        })
      }
    }

    const customerEmail = buildPaymentConfirmedEmail({
      localOrder,
      transaction,
      submissionReference: localOrder.submission_reference,
      supportEmail,
    })

    try {
      await sendEmail({
        resendApiKey,
        payload: {
          from: fromEmail,
          to: [transaction.checkoutEmail],
          reply_to: supportEmail,
          subject: `Your MemoryFix AI order is confirmed - ${localOrder.submission_reference}`,
          html: customerEmail.html,
          text: customerEmail.text,
        },
      })
      customerEmailSent = true
    } catch (error) {
      await insertEvent(currentJob.id, 'customer_payment_email_failed', {
        error:
          error instanceof Error
            ? error.message
            : 'Customer payment confirmation email failed.',
      })
    }
  }

  return { job: currentJob, customerEmailSent, merchantEmailSent }
}

// ---------------------------------------------------------------------------
// action=capture
// ---------------------------------------------------------------------------
async function handleCapture(req, res) {
  const { paypalOrderId, localOrderId, checkoutRef, tier } = req.body || {}

  if (!paypalOrderId) {
    return json(res, 400, { error: 'paypalOrderId is required.' })
  }

  const resendApiKey = process.env.RESEND_API_KEY
  const fromEmail =
    process.env.HUMAN_RESTORE_FROM_EMAIL ||
    'MemoryFix AI <onboarding@resend.dev>'
  const inboxEmail = process.env.HUMAN_RESTORE_INBOX
  const supportEmail =
    process.env.HUMAN_RESTORE_SUPPORT_EMAIL || process.env.HUMAN_RESTORE_INBOX
  const siteUrl = process.env.SITE_URL || defaultSiteUrl

  try {
    const capture = await capturePayPalOrder(paypalOrderId)

    if (
      capture.status !== 'COMPLETED' &&
      capture.captureStatus !== 'COMPLETED'
    ) {
      return json(res, 402, {
        error: 'Payment was not completed.',
        status: capture.status,
      })
    }

    const isTestMode =
      (process.env.PAYPAL_ENVIRONMENT || 'sandbox') === 'sandbox'

    // Local repair pack: no local order, just confirm capture
    if (tier === 'local_repair_pack') {
      return json(res, 200, {
        ok: true,
        captureId: capture.captureId,
        paypalOrderId: capture.paypalOrderId,
        tier: 'local_repair_pack',
      })
    }

    const localOrder = await findLocalOrder({
      localOrderId: localOrderId || capture.customId,
      checkoutRef,
    })

    if (!localOrder) {
      console.error(
        '[paypal-checkout:capture] No local order found for:',
        JSON.stringify({
          paypalOrderId,
          localOrderId,
          checkoutRef,
          customId: capture.customId,
        })
      )
      return json(res, 200, {
        ok: true,
        warning:
          'Payment captured but local order not found. It will be reconciled via webhook.',
        captureId: capture.captureId,
        paypalOrderId: capture.paypalOrderId,
      })
    }

    const transaction = {
      paypalOrderId: capture.paypalOrderId,
      orderId: capture.paypalOrderId,
      captureId: capture.captureId,
      checkoutEmail: capture.payerEmail,
      customerName: capture.payerName,
      productName: localOrder.product_name || 'Human-assisted Restore',
      testMode: isTestMode,
      tier: tier || resolveTierFromRecord(localOrder),
    }

    const result = await processPreuploadedOrder({
      localOrder,
      transaction,
      fromEmail,
      inboxEmail,
      resendApiKey,
      siteUrl,
      supportEmail,
    })

    const successUrl = new URL('/human-restore/success', siteUrl)
    successUrl.searchParams.set('order_id', localOrder.id)
    if (checkoutRef) {
      successUrl.searchParams.set('checkout_ref', checkoutRef)
    }
    if (capture.payerEmail) {
      successUrl.searchParams.set('email', capture.payerEmail)
    }
    successUrl.searchParams.set('provider_order_id', capture.paypalOrderId)

    return json(res, 200, {
      ok: true,
      captureId: capture.captureId,
      customerEmailSent: result.customerEmailSent,
      jobId: result.job?.id,
      localOrderId: localOrder.id,
      merchantEmailSent: result.merchantEmailSent,
      paypalOrderId: capture.paypalOrderId,
      redirectUrl: successUrl.toString(),
    })
  } catch (error) {
    console.error('[paypal-checkout:capture] Error:', error)
    return json(res, 500, {
      error: error instanceof Error ? error.message : 'Payment capture failed.',
    })
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return json(res, 405, { error: 'Method not allowed.' })
  }

  const action = (req.body || {}).action

  if (action === 'create') {
    return handleCreate(req, res)
  }

  if (action === 'capture') {
    return handleCapture(req, res)
  }

  return json(res, 400, {
    error: 'action is required. Use "create" or "capture".',
  })
}

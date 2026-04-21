/**
 * PayPal webhook handler — backup for payment confirmation.
 *
 * The primary payment flow captures via /api/paypal-checkout (action=capture) in the
 * buyer's browser session. This webhook acts as a safety net for cases
 * where the capture call succeeds on PayPal's side but the browser tab
 * closes before our capture endpoint finishes processing.
 *
 * Listens for: PAYMENT.CAPTURE.COMPLETED
 *
 * POST /api/paypal-webhook
 */

export const config = {
  api: {
    bodyParser: false,
  },
}

import {
  createOrderUploadToken,
  createSecureUploadUrl,
  escapeHtml,
  json,
  readRawBody,
  sendEmail,
} from './_lib/human-restore.js'
import {
  emailCtaButton,
  emailCtaFallback,
  emailDetailBlock,
  emailInfoBox,
  emailParagraph,
  emailShell,
  emailStepsList,
} from './_lib/email-templates.js'
import { verifyPayPalWebhookSignature } from './_lib/paypal.js'
import { runRestoreJob } from './_lib/ai-restore.js'
import { autoDeliverAiHdJob } from './_lib/auto-deliver.js'
import {
  getJob,
  getOrder,
  getOrderByCheckoutRef,
  getOrderByProviderOrderId,
  insertEvent,
  insertJob,
  updateJob,
  updateOrder,
} from './_lib/supabase.js'
import { resolveTierFromRecord } from './_lib/product-tier.js'

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

function extractTransactionFromWebhook(payload) {
  const resource = payload?.resource
  if (!resource) return null

  const captureId = resource.id || ''
  const paypalOrderId = resource.supplementary_data?.related_ids?.order_id || ''
  const customId = resource.custom_id || ''
  const amount = resource.amount?.value || ''
  const currency = resource.amount?.currency_code || 'USD'

  // PayPal webhook for PAYMENT.CAPTURE.COMPLETED does not include payer
  // details directly. We will look up the order if needed.
  return {
    captureId,
    paypalOrderId,
    customId,
    amount,
    currency,
    status: resource.status || '',
  }
}

async function findLocalOrder({ customId, paypalOrderId }) {
  if (customId) {
    const order = await getOrder(String(customId))
    if (order) return order
  }
  if (paypalOrderId) {
    const order = await getOrderByProviderOrderId(String(paypalOrderId))
    if (order) return order
  }
  return null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed.' })
    return
  }

  const webhookId = process.env.PAYPAL_WEBHOOK_ID
  const resendApiKey = process.env.RESEND_API_KEY
  const fromEmail =
    process.env.HUMAN_RESTORE_FROM_EMAIL ||
    'MemoryFix AI <onboarding@resend.dev>'
  const inboxEmail = process.env.HUMAN_RESTORE_INBOX
  const supportEmail =
    process.env.HUMAN_RESTORE_SUPPORT_EMAIL || process.env.HUMAN_RESTORE_INBOX
  const siteUrl = process.env.SITE_URL || defaultSiteUrl

  if (!webhookId) {
    json(res, 503, { error: 'Webhook integration is not configured.' })
    return
  }

  try {
    const rawBody = await readRawBody(req)
    const rawBodyString = rawBody.toString('utf8')

    // Verify webhook signature
    const isValid = await verifyPayPalWebhookSignature({
      headers: req.headers,
      rawBody: rawBodyString,
      webhookId,
    })

    if (!isValid) {
      json(res, 401, { error: 'Invalid webhook signature.' })
      return
    }

    const payload = JSON.parse(rawBodyString)
    const eventType = payload?.event_type

    if (eventType !== 'PAYMENT.CAPTURE.COMPLETED') {
      json(res, 200, { ok: true, ignored: true, reason: 'Unhandled event.' })
      return
    }

    const transaction = extractTransactionFromWebhook(payload)

    if (!transaction || transaction.status !== 'COMPLETED') {
      json(res, 200, {
        ok: true,
        ignored: true,
        reason: 'Capture not completed.',
      })
      return
    }

    // Find the local order
    const localOrder = await findLocalOrder({
      customId: transaction.customId,
      paypalOrderId: transaction.paypalOrderId,
    })

    if (!localOrder) {
      // No local order — this could be a local repair pack purchase
      // or an order that was already processed by the capture endpoint.
      console.warn(
        '[paypal-webhook] No local order found for capture:',
        transaction.captureId,
        'paypalOrderId:',
        transaction.paypalOrderId
      )
      json(res, 200, {
        ok: true,
        ignored: true,
        reason: 'No matching local order found.',
      })
      return
    }

    // Check if the order is already processed (capture endpoint handled it)
    if (
      localOrder.payment_confirmed_at &&
      localOrder.status !== 'pending_payment'
    ) {
      json(res, 200, {
        ok: true,
        ignored: true,
        reason: 'Order already processed by capture endpoint.',
        localOrderId: localOrder.id,
      })
      return
    }

    // Order exists but wasn't processed yet — handle it as backup
    const isTestMode =
      (process.env.PAYPAL_ENVIRONMENT || 'sandbox') === 'sandbox'
    const paidExpiresAt = getPaidOrderExpiresAt()

    const paymentPatch = {
      checkout_email: localOrder.checkout_email || '',
      expires_at: paidExpiresAt,
      payment_confirmed_at: new Date().toISOString(),
      payment_provider: 'paypal',
      payment_provider_order_id: String(transaction.paypalOrderId),
      payment_provider_order_identifier: transaction.captureId,
      status: 'paid',
      test_mode: isTestMode,
    }

    await updateOrder(localOrder.id, paymentPatch)

    // If there's an existing job (preview-first path), update it
    if (localOrder.job_id) {
      const existingJob = await getJob(localOrder.job_id)
      if (existingJob) {
        await updateJob(existingJob.id, {
          order_bound: true,
          order_id: String(transaction.paypalOrderId),
          test_mode: isTestMode,
        }).catch(() => null)

        await insertEvent(existingJob.id, 'payment_confirmed_via_webhook', {
          paypal_order_id: transaction.paypalOrderId,
          capture_id: transaction.captureId,
          source: 'paypal_webhook_backup',
        }).catch(() => null)

        json(res, 200, {
          ok: true,
          webhookBackupProcessed: true,
          localOrderId: localOrder.id,
          jobId: existingJob.id,
        })
        return
      }
    }

    // Create job and start AI pipeline
    const job = await insertJob({
      checkout_email: localOrder.checkout_email || '',
      customer_name: localOrder.customer_name || '',
      expires_at: paidExpiresAt,
      human_restore_order_id: localOrder.id,
      notes: localOrder.notes || '',
      order_bound: true,
      order_id: String(transaction.paypalOrderId),
      original_file_name: localOrder.original_file_name,
      original_file_size: localOrder.original_file_size,
      original_file_type: localOrder.original_file_type,
      original_storage_bucket: localOrder.original_storage_bucket,
      original_storage_path: localOrder.original_storage_path,
      product_name: localOrder.product_name || 'Human-assisted Restore',
      status: 'uploaded',
      submission_reference: localOrder.submission_reference,
      test_mode: isTestMode,
      upload_source: 'pre_checkout_upload',
    })

    await insertEvent(job.id, 'payment_confirmed_via_webhook', {
      paypal_order_id: transaction.paypalOrderId,
      capture_id: transaction.captureId,
      source: 'paypal_webhook_backup',
    })

    let currentJob = job

    if (shouldAutoProcessAfterPayment()) {
      currentJob = await runRestoreJob({
        job,
        triggeredBy: 'webhook_backup',
      }).catch(async error => {
        await insertEvent(job.id, 'ai_restore_auto_start_failed', {
          error:
            error instanceof Error ? error.message : 'Auto restore failed.',
        })
        return job
      })
    }

    await updateOrder(localOrder.id, {
      ...paymentPatch,
      job_id: currentJob.id,
      status: mapJobStatusToOrderStatus(currentJob.status),
    })

    json(res, 200, {
      ok: true,
      webhookBackupProcessed: true,
      localOrderId: localOrder.id,
      jobId: currentJob.id,
    })
  } catch (error) {
    console.error('[paypal-webhook] Error:', error)
    json(res, 500, {
      error:
        error instanceof Error ? error.message : 'Webhook processing failed.',
    })
  }
}

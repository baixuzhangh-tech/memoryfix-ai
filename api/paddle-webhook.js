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
  verifyPaddleWebhookSignature,
} from './_lib/human-restore.js'
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
import { runRestoreJob } from './_lib/ai-restore.js'
import { autoDeliverAiHdJob } from './_lib/auto-deliver.js'
import {
  getJob,
  getOrder,
  getOrderByCheckoutRef,
  updateJob,
  getOrderByProviderOrderId,
  insertEvent,
  insertJob,
  updateOrder,
} from './_lib/supabase.js'
import {
  isSupportedPriceId,
  resolveTierFromPriceId,
} from './_lib/product-tier.js'

const defaultSiteUrl = 'https://artgen.site'

function getPaddleApiBaseUrl() {
  const env = process.env.PADDLE_ENVIRONMENT || 'production'
  return env === 'sandbox'
    ? 'https://sandbox-api.paddle.com'
    : 'https://api.paddle.com'
}

async function getPaddleCustomer(customerId) {
  const apiKey = process.env.PADDLE_API_KEY
  if (!apiKey || !customerId) {
    return null
  }

  try {
    const response = await fetch(
      `${getPaddleApiBaseUrl()}/customers/${encodeURIComponent(customerId)}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    )

    if (!response.ok) {
      return null
    }

    const payload = await response.json().catch(() => null)
    return payload?.data || null
  } catch {
    return null
  }
}

function getTransactionDetails(payload) {
  const transaction = payload?.data
  if (!transaction?.id || !transaction?.status) {
    return null
  }

  const firstItem = Array.isArray(transaction.items)
    ? transaction.items[0]
    : null
  const customData = transaction.custom_data || null

  return {
    checkoutEmail: '',
    createdAt: transaction.created_at || new Date().toISOString(),
    customData,
    customerName: '',
    customerId: transaction.customer_id || '',
    identifier: transaction.id,
    orderId: transaction.id,
    orderNumber: transaction.id,
    productName:
      firstItem?.price?.name ||
      firstItem?.price?.description ||
      'Human-assisted Restore',
    receiptUrl: transaction.checkout?.url || '',
    status: transaction.status,
    testMode: (process.env.PADDLE_ENVIRONMENT || 'production') === 'sandbox',
    priceId: firstItem?.price?.id || '',
  }
}

function isLocalRepairPackTransaction(transaction) {
  const customData = transaction?.customData || {}
  return customData.memoryfix_plan === 'local_repair_pack'
}

function shouldHandleTransaction({ transaction }) {
  if (
    !transaction ||
    transaction.status !== 'completed' ||
    isLocalRepairPackTransaction(transaction)
  ) {
    return false
  }

  if (!transaction.priceId) {
    // Without a priceId we cannot tell which tier the customer paid
    // for, so fall through to the existing legacy handling (email a
    // secure upload link) rather than silently dropping the event.
    return true
  }

  return isSupportedPriceId(transaction.priceId)
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

function getPaidOrderExpiresAt() {
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30)
  return expiresAt.toISOString()
}

async function findLocalOrder(transaction) {
  const customData = transaction?.customData || {}
  const localOrderId =
    customData.human_restore_order_id ||
    customData.local_order_id ||
    customData.order_id ||
    ''
  const checkoutRef = customData.checkout_ref || ''

  if (localOrderId) {
    const localOrder = await getOrder(String(localOrderId))
    if (localOrder) {
      return localOrder
    }
  }

  if (checkoutRef) {
    const localOrder = await getOrderByCheckoutRef(String(checkoutRef))
    if (localOrder) {
      return localOrder
    }
  }

  return getOrderByProviderOrderId(String(transaction.orderId))
}

function buildLegacySecureUploadEmail({
  uploadUrl,
  transaction,
  supportEmail,
}) {
  const customerName = transaction.customerName || 'there'
  const orderNumber = transaction.orderNumber || 'your paid order'

  const bodyRows = [
    emailParagraph(
      `Hi ${escapeHtml(customerName)}, thanks for purchasing ${escapeHtml(
        transaction.productName
      )}. Use the button below to upload the photo for your paid order.`
    ),
    emailCtaButton(uploadUrl, 'Upload Your Photo'),
    emailCtaFallback(uploadUrl, 'Click here to open the upload page'),
    emailInfoBox(
      `This link is tied to your paid order and is intended only for your restoration upload.<br/>If the link does not open, contact <a href="mailto:${escapeHtml(
        supportEmail
      )}" style="color:#9b6b3c;text-decoration:underline">${escapeHtml(
        supportEmail
      )}</a>.`
    ),
  ].join('')

  const html = emailShell({
    title: 'Your secure upload link',
    heroTitle: 'Your secure photo<br/>upload link is ready',
    heroSubtitle: `Order ${escapeHtml(orderNumber)}`,
    bodyRows,
    footerRef: orderNumber,
    supportEmail,
  })

  const text = [
    'Your secure MemoryFix AI upload link is ready.',
    `Order: ${orderNumber}`,
    `Product: ${transaction.productName}`,
    `Upload link: ${uploadUrl}`,
    `If you need help, contact ${supportEmail}.`,
  ].join('\n')

  return { html, text }
}

function buildPaymentConfirmedEmail({
  transaction,
  localOrder,
  submissionReference,
  supportEmail,
}) {
  const orderNumber = transaction.orderNumber || transaction.orderId
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
      ['Paddle transaction', String(transaction.orderId)],
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
    `Paddle transaction: ${transaction.orderId}`,
    `Job ID: ${currentJob.id}`,
    `Status: ${currentJob.status}`,
    `Repair notes: ${localOrder.notes || 'No extra notes provided.'}`,
    `Admin review: ${adminUrl}`,
    `Support contact: ${supportEmail}`,
  ].join('\n')

  return { html, text }
}

async function sendPaidOrderEmails({
  currentJob,
  fromEmail,
  inboxEmail,
  localOrder,
  transaction,
  resendApiKey,
  siteUrl,
  supportEmail,
}) {
  if (!resendApiKey || !supportEmail) {
    return { customerEmailSent: false, merchantEmailSent: false }
  }

  const adminUrl = new URL('/admin/review', siteUrl)
  adminUrl.searchParams.set('job', currentJob.id)

  let merchantEmailSent = false
  let customerEmailSent = false

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

  return { customerEmailSent, merchantEmailSent }
}

async function handlePreuploadedPaidOrder({
  fromEmail,
  inboxEmail,
  localOrder,
  transaction,
  resendApiKey,
  siteUrl,
  supportEmail,
}) {
  const paidExpiresAt = getPaidOrderExpiresAt()
  const paymentPatch = {
    checkout_email: transaction.checkoutEmail,
    customer_name: transaction.customerName || '',
    expires_at: paidExpiresAt,
    order_number: transaction.orderNumber
      ? String(transaction.orderNumber)
      : null,
    payment_confirmed_at: new Date().toISOString(),
    payment_provider: 'paddle',
    payment_provider_order_id: String(transaction.orderId),
    payment_provider_order_identifier: transaction.identifier || null,
    product_name: transaction.productName,
    receipt_url: transaction.receiptUrl || '',
    status: 'paid',
    test_mode: Boolean(transaction.testMode),
    variant_id: transaction.priceId
      ? String(transaction.priceId)
      : localOrder.variant_id,
  }

  await updateOrder(localOrder.id, paymentPatch)

  if (localOrder.job_id) {
    const existingJob = await getJob(localOrder.job_id)

    if (existingJob) {
      // Preview-first path (AI HD): the job was created at preview
      // time with a placeholder email and no payment context. Now
      // that the buyer has paid, copy the real checkout email and
      // payment metadata onto the job so auto-delivery (and any
      // future admin tooling) sees the correct recipient.
      let currentJob = await updateJob(existingJob.id, {
        checkout_email: transaction.checkoutEmail,
        customer_name: transaction.customerName || existingJob.customer_name,
        order_bound: true,
        order_id: String(transaction.orderId),
        order_number: transaction.orderNumber
          ? String(transaction.orderNumber)
          : existingJob.order_number,
        product_name: transaction.productName,
        receipt_url: transaction.receiptUrl || '',
        test_mode: Boolean(transaction.testMode),
      }).catch(() => existingJob)

      const previewPaidTier = resolveTierFromPriceId(
        transaction.priceId || localOrder.variant_id || ''
      )

      if (previewPaidTier === 'ai_hd' && currentJob.status === 'needs_review') {
        const autoDeliveryResult = await autoDeliverAiHdJob({
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
            source: 'preview_unlock',
          })
          return null
        })

        if (autoDeliveryResult?.delivered && autoDeliveryResult.job) {
          currentJob = autoDeliveryResult.job
        }
      }

      await updateOrder(localOrder.id, {
        ...paymentPatch,
        status: mapJobStatusToOrderStatus(currentJob.status),
      })

      await insertEvent(currentJob.id, 'preview_paid_unlocked', {
        local_order_id: localOrder.id,
        payment_provider: 'paddle',
        payment_provider_order_id: String(transaction.orderId),
        tier: previewPaidTier,
      }).catch(() => null)

      return {
        customerEmailSent: false,
        job: currentJob,
        merchantEmailSent: false,
      }
    }
  }

  const job = await insertJob({
    checkout_email: transaction.checkoutEmail,
    customer_name: transaction.customerName || '',
    expires_at: paidExpiresAt,
    human_restore_order_id: localOrder.id,
    notes: localOrder.notes || '',
    order_bound: true,
    order_id: String(transaction.orderId),
    order_number: transaction.orderNumber
      ? String(transaction.orderNumber)
      : null,
    original_file_name: localOrder.original_file_name,
    original_file_size: localOrder.original_file_size,
    original_file_type: localOrder.original_file_type,
    original_storage_bucket: localOrder.original_storage_bucket,
    original_storage_path: localOrder.original_storage_path,
    product_name: transaction.productName,
    receipt_url: transaction.receiptUrl || '',
    status: 'uploaded',
    submission_reference: localOrder.submission_reference,
    test_mode: Boolean(transaction.testMode),
    upload_source: 'pre_checkout_upload',
  })

  await insertEvent(job.id, 'payment_confirmed_preuploaded_photo', {
    checkout_ref: localOrder.checkout_ref,
    local_order_id: localOrder.id,
    payment_provider: 'paddle',
    payment_provider_order_id: String(transaction.orderId),
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

  const paidTier = resolveTierFromPriceId(
    transaction.priceId || localOrder.variant_id || ''
  )

  if (paidTier === 'ai_hd' && currentJob.status === 'needs_review') {
    const autoDeliveryResult = await autoDeliverAiHdJob({
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

    if (autoDeliveryResult?.delivered && autoDeliveryResult.job) {
      currentJob = autoDeliveryResult.job
    }
  }

  await updateOrder(localOrder.id, {
    ...paymentPatch,
    job_id: currentJob.id,
    status: mapJobStatusToOrderStatus(currentJob.status),
  })

  const emailStatus = await sendPaidOrderEmails({
    currentJob,
    fromEmail,
    inboxEmail,
    localOrder,
    transaction,
    resendApiKey,
    siteUrl,
    supportEmail,
  })

  return {
    ...emailStatus,
    job: currentJob,
  }
}

async function sendLegacySecureUploadLink({
  fromEmail,
  transaction,
  resendApiKey,
  siteUrl,
  supportEmail,
  uploadTokenSecret,
}) {
  if (!uploadTokenSecret || !resendApiKey || !supportEmail) {
    throw new Error('Legacy secure upload email is not configured.')
  }

  const token = createOrderUploadToken({
    tokenSecret: uploadTokenSecret,
    order: transaction,
  })
  const uploadUrl = createSecureUploadUrl({ siteUrl, token })
  const emailContent = buildLegacySecureUploadEmail({
    uploadUrl,
    transaction,
    supportEmail,
  })

  await sendEmail({
    resendApiKey,
    payload: {
      from: fromEmail,
      to: [transaction.checkoutEmail],
      reply_to: supportEmail,
      subject: `Secure upload link for order ${
        transaction.orderNumber || transaction.orderId
      }`,
      html: emailContent.html,
      text: emailContent.text,
    },
  })

  return uploadUrl
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed.' })
    return
  }

  const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET
  const uploadTokenSecret = process.env.HUMAN_RESTORE_UPLOAD_TOKEN_SECRET
  const resendApiKey = process.env.RESEND_API_KEY
  const fromEmail =
    process.env.HUMAN_RESTORE_FROM_EMAIL ||
    'MemoryFix AI <onboarding@resend.dev>'
  const inboxEmail = process.env.HUMAN_RESTORE_INBOX
  const supportEmail =
    process.env.HUMAN_RESTORE_SUPPORT_EMAIL || process.env.HUMAN_RESTORE_INBOX
  const siteUrl = process.env.SITE_URL || defaultSiteUrl

  if (!webhookSecret) {
    json(res, 503, { error: 'Webhook integration is not configured.' })
    return
  }

  try {
    const rawBody = await readRawBody(req)
    const signatureHeader = req.headers['paddle-signature']

    if (
      !verifyPaddleWebhookSignature({
        rawBody,
        secret: webhookSecret,
        signatureHeader,
      })
    ) {
      json(res, 401, { error: 'Invalid webhook signature.' })
      return
    }

    const payload = JSON.parse(rawBody.toString('utf8'))
    const eventType = payload?.event_type

    if (eventType !== 'transaction.completed') {
      json(res, 200, { ok: true, ignored: true, reason: 'Unhandled event.' })
      return
    }

    const transaction = getTransactionDetails(payload)

    if (isLocalRepairPackTransaction(transaction)) {
      json(res, 200, {
        ok: true,
        ignored: true,
        reason: 'Local repair pack handled client-side.',
      })
      return
    }

    if (transaction?.customerId) {
      const customer = await getPaddleCustomer(transaction.customerId)
      if (customer) {
        transaction.checkoutEmail = customer.email || ''
        transaction.customerName = customer.name || ''
      }
    }

    if (!shouldHandleTransaction({ transaction })) {
      json(res, 200, {
        ok: true,
        ignored: true,
        reason: 'Transaction not targeted.',
      })
      return
    }

    if (!transaction.checkoutEmail) {
      json(res, 200, {
        ok: true,
        ignored: true,
        reason: 'No customer email found.',
      })
      return
    }

    const localOrder = await findLocalOrder(transaction)

    if (localOrder) {
      const result = await handlePreuploadedPaidOrder({
        fromEmail,
        inboxEmail,
        localOrder,
        transaction,
        resendApiKey,
        siteUrl,
        supportEmail,
      })

      json(res, 200, {
        customerEmailSent: result.customerEmailSent,
        jobId: result.job?.id,
        localOrderId: localOrder.id,
        merchantEmailSent: result.merchantEmailSent,
        ok: true,
        preuploadedOrderProcessed: true,
      })
      return
    }

    await sendLegacySecureUploadLink({
      fromEmail,
      transaction,
      resendApiKey,
      siteUrl,
      supportEmail,
      uploadTokenSecret,
    })

    json(res, 200, { ok: true, uploadLinkSent: true })
  } catch (error) {
    json(res, 500, {
      error:
        error instanceof Error ? error.message : 'Webhook processing failed.',
    })
  }
}

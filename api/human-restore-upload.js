import {
  createSubmissionReference,
  escapeHtml,
  getBoundary,
  json,
  parseMultipartForm,
  readRawBody,
  sendEmail,
  verifyOrderUploadToken,
} from './_lib/human-restore.js'

export const config = {
  api: {
    bodyParser: false,
  },
}

const maxUploadSizeBytes = 15 * 1024 * 1024
const allowedImageTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
])

async function sendMerchantNotificationEmail({
  resendApiKey,
  fromEmail,
  inboxEmail,
  supportEmail,
  submissionReference,
  uploadSource,
  checkoutEmail,
  orderReference,
  notes,
  photo,
}) {
  const subjectSuffix = orderReference
    ? `Order ${orderReference}`
    : `Checkout ${checkoutEmail}`
  const html = `
    <h1>New Human-assisted Restore upload</h1>
    <p><strong>Submission reference:</strong> ${escapeHtml(submissionReference)}</p>
    <p><strong>Upload source:</strong> ${escapeHtml(uploadSource)}</p>
    <p><strong>Checkout email:</strong> ${escapeHtml(checkoutEmail)}</p>
    <p><strong>Order number:</strong> ${escapeHtml(orderReference || 'Not provided')}</p>
    <p><strong>Support contact:</strong> ${escapeHtml(supportEmail)}</p>
    <p><strong>Repair notes:</strong></p>
    <p>${escapeHtml(notes || 'No extra notes provided.').replace(/\n/g, '<br />')}</p>
    <p><strong>Attached file:</strong> ${escapeHtml(photo.filename)}</p>
  `

  await sendEmail({
    resendApiKey,
    payload: {
      from: fromEmail,
      to: [inboxEmail],
      reply_to: checkoutEmail,
      subject: `MemoryFix AI upload - ${subjectSuffix}`,
      html,
      attachments: [
        {
          filename: photo.filename,
          content: photo.data.toString('base64'),
        },
      ],
    },
  })
}

async function sendCustomerConfirmationEmail({
  resendApiKey,
  fromEmail,
  supportEmail,
  submissionReference,
  checkoutEmail,
  orderReference,
}) {
  const html = `
    <h1>We received your photo</h1>
    <p>Thank you for submitting your paid Human-assisted Restore order to MemoryFix AI.</p>
    <p><strong>Submission reference:</strong> ${escapeHtml(submissionReference)}</p>
    <p><strong>Checkout email:</strong> ${escapeHtml(checkoutEmail)}</p>
    <p><strong>Order number:</strong> ${escapeHtml(orderReference || 'Not provided')}</p>
    <p>What happens next:</p>
    <ul>
      <li>We match this upload to your paid order.</li>
      <li>We review the image and your notes.</li>
      <li>We deliver the restored result by email within 48 hours during beta.</li>
    </ul>
    <p>If you need to update the photo or add details, reply to this email and include your submission reference.</p>
    <p>Support: ${escapeHtml(supportEmail)}</p>
  `

  const text = [
    'We received your photo for MemoryFix AI Human-assisted Restore.',
    `Submission reference: ${submissionReference}`,
    `Checkout email: ${checkoutEmail}`,
    `Order number: ${orderReference || 'Not provided'}`,
    'Next steps:',
    '- We match this upload to your paid order.',
    '- We review the image and your notes.',
    '- We deliver the restored result by email within 48 hours during beta.',
    `If you need help, reply to this email or contact ${supportEmail}.`,
  ].join('\n')

  await sendEmail({
    resendApiKey,
    payload: {
      from: fromEmail,
      to: [checkoutEmail],
      reply_to: supportEmail,
      subject: `We received your photo - ${submissionReference}`,
      html,
      text,
    },
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed.' })
    return
  }

  const resendApiKey = process.env.RESEND_API_KEY
  const inboxEmail = process.env.HUMAN_RESTORE_INBOX
  const supportEmail = process.env.HUMAN_RESTORE_SUPPORT_EMAIL || inboxEmail
  const uploadTokenSecret = process.env.HUMAN_RESTORE_UPLOAD_TOKEN_SECRET
  const fromEmail =
    process.env.HUMAN_RESTORE_FROM_EMAIL ||
    'MemoryFix AI <onboarding@resend.dev>'

  if (!resendApiKey || !inboxEmail) {
    json(res, 503, {
      error:
        'Upload is not configured yet. Please try again later or use your order email as fallback.',
    })
    return
  }

  const contentType = req.headers['content-type'] || ''
  const boundary = getBoundary(contentType)

  if (!boundary) {
    json(res, 400, { error: 'Invalid upload request.' })
    return
  }

  try {
    const rawBody = await readRawBody(req)
    const { fields, file } = parseMultipartForm(rawBody, boundary)
    const submissionReference = createSubmissionReference()
    const token = (fields.token || '').trim()
    const tokenVerification = token
      ? verifyOrderUploadToken({ token, tokenSecret: uploadTokenSecret })
      : null
    const isSecureUpload = Boolean(tokenVerification?.valid)
    const checkoutEmail = isSecureUpload
      ? tokenVerification.payload.checkoutEmail
      : (fields.checkoutEmail || '').trim()
    const orderReference = isSecureUpload
      ? String(tokenVerification.payload.orderNumber || tokenVerification.payload.orderId)
      : (fields.orderReference || '').trim()
    const notes = (fields.notes || '').trim()

    if (token && !isSecureUpload) {
      json(res, 400, {
        error:
          tokenVerification?.error ||
          'This secure upload link is invalid or has expired.',
      })
      return
    }

    if (!checkoutEmail) {
      json(res, 400, { error: 'Checkout email is required.' })
      return
    }

    if (!/^\S+@\S+\.\S+$/.test(checkoutEmail)) {
      json(res, 400, { error: 'Please enter a valid checkout email.' })
      return
    }

    if (!file || file.fieldName !== 'photo') {
      json(res, 400, { error: 'Please attach the photo you want restored.' })
      return
    }

    if (!allowedImageTypes.has(file.contentType)) {
      json(res, 400, {
        error: 'Please upload a JPG, PNG, WebP, HEIC, or HEIF image.',
      })
      return
    }

    if (file.data.length > maxUploadSizeBytes) {
      json(res, 400, {
        error: 'Please keep the upload under 15 MB for this beta form.',
      })
      return
    }

    await sendMerchantNotificationEmail({
      resendApiKey,
      fromEmail,
      inboxEmail,
      supportEmail,
      submissionReference,
      uploadSource: isSecureUpload ? 'secure_link' : 'fallback_form',
      checkoutEmail,
      orderReference,
      notes,
      photo: file,
    })

    let confirmationEmailSent = true

    try {
      await sendCustomerConfirmationEmail({
        resendApiKey,
        fromEmail,
        supportEmail,
        submissionReference,
        checkoutEmail,
        orderReference,
      })
    } catch {
      confirmationEmailSent = false
    }

    json(res, 200, {
      ok: true,
      orderBound: isSecureUpload,
      submissionReference,
      confirmationEmailSent,
      supportEmail,
    })
  } catch {
    json(res, 500, {
      error:
        'We could not receive your photo just now. Please retry in a moment or use your order email as fallback.',
    })
  }
}

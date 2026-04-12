import crypto from 'crypto'

const defaultUploadTokenMaxAgeHours = 24 * 14

function toBase64Url(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input)

  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function fromBase64Url(input) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padding =
    normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))

  return Buffer.from(`${normalized}${padding}`, 'base64')
}

export function createSubmissionReference() {
  return `MF-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase()}`
}

export function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []

    req.on('data', chunk => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })

    req.on('end', () => {
      resolve(Buffer.concat(chunks))
    })

    req.on('error', reject)
  })
}

export function getBoundary(contentType) {
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)

  if (!match) {
    return null
  }

  return `--${match[1] || match[2]}`
}

function parseHeaders(headersText) {
  return headersText.split('\r\n').reduce((accumulator, line) => {
    const separatorIndex = line.indexOf(':')

    if (separatorIndex === -1) {
      return accumulator
    }

    const headerName = line.slice(0, separatorIndex).trim().toLowerCase()
    const headerValue = line.slice(separatorIndex + 1).trim()

    accumulator[headerName] = headerValue

    return accumulator
  }, {})
}

function parseContentDisposition(headerValue) {
  return headerValue.split(';').reduce((accumulator, segment) => {
    const trimmedSegment = segment.trim()
    const match = trimmedSegment.match(/^([^=]+)="?(.+?)"?$/)

    if (!match) {
      return accumulator
    }

    accumulator[match[1]] = match[2]

    return accumulator
  }, {})
}

function decodeFormValue(value) {
  return Buffer.from(value, 'latin1').toString('utf8').trim()
}

function sanitizeFileName(fileName) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_') || 'upload-image'
}

export function parseMultipartForm(bodyBuffer, boundary) {
  const fields = {}
  let file = null
  const bodyText = bodyBuffer.toString('latin1')
  const rawParts = bodyText.split(boundary).slice(1, -1)

  for (const rawPart of rawParts) {
    const withoutLeadingBreak = rawPart.startsWith('\r\n')
      ? rawPart.slice(2)
      : rawPart
    const part = withoutLeadingBreak.endsWith('\r\n')
      ? withoutLeadingBreak.slice(0, -2)
      : withoutLeadingBreak
    const separatorIndex = part.indexOf('\r\n\r\n')

    if (separatorIndex === -1) {
      continue
    }

    const headersText = part.slice(0, separatorIndex)
    const bodyTextPart = part.slice(separatorIndex + 4)
    const headers = parseHeaders(headersText)
    const contentDisposition = parseContentDisposition(
      headers['content-disposition'] || ''
    )

    if (!contentDisposition.name) {
      continue
    }

    if (contentDisposition.filename) {
      file = {
        fieldName: contentDisposition.name,
        filename: sanitizeFileName(contentDisposition.filename),
        contentType: headers['content-type'] || 'application/octet-stream',
        data: Buffer.from(bodyTextPart, 'latin1'),
      }
      continue
    }

    fields[contentDisposition.name] = decodeFormValue(bodyTextPart)
  }

  return { fields, file }
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function json(res, statusCode, body) {
  res.status(statusCode).setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export async function sendEmail({ resendApiKey, payload }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || 'Resend request failed')
  }

  return response.json().catch(() => null)
}

export function createOrderUploadToken({ tokenSecret, order }) {
  const encodedPayload = toBase64Url(
    JSON.stringify({
      checkoutEmail: order.checkoutEmail,
      createdAt: order.createdAt,
      customerName: order.customerName || '',
      orderId: String(order.orderId),
      orderNumber: String(order.orderNumber || ''),
      productName: order.productName || 'Human-assisted Restore',
      receiptUrl: order.receiptUrl || '',
      testMode: Boolean(order.testMode),
      version: 1,
    })
  )
  const signature = crypto
    .createHmac('sha256', tokenSecret)
    .update(encodedPayload)
    .digest('hex')

  return `${encodedPayload}.${signature}`
}

export function verifyOrderUploadToken({
  token,
  tokenSecret,
  maxAgeHours = defaultUploadTokenMaxAgeHours,
}) {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Missing upload token.' }
  }

  if (!tokenSecret) {
    return { valid: false, error: 'Secure upload is not configured yet.' }
  }

  const [encodedPayload, providedSignature] = token.split('.')

  if (!encodedPayload || !providedSignature) {
    return { valid: false, error: 'Invalid upload token format.' }
  }

  const expectedSignature = crypto
    .createHmac('sha256', tokenSecret)
    .update(encodedPayload)
    .digest('hex')

  const providedBuffer = Buffer.from(providedSignature)
  const expectedBuffer = Buffer.from(expectedSignature)

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return { valid: false, error: 'Upload token signature mismatch.' }
  }

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload).toString('utf8'))
    const createdAtMs = Date.parse(payload.createdAt || '')

    if (!payload.checkoutEmail || !payload.orderId || !payload.version) {
      return { valid: false, error: 'Upload token is incomplete.' }
    }

    if (!Number.isFinite(createdAtMs)) {
      return {
        valid: false,
        error: 'Upload token missing valid creation time.',
      }
    }

    const expiresAtMs = createdAtMs + maxAgeHours * 60 * 60 * 1000

    if (Date.now() > expiresAtMs) {
      return { valid: false, error: 'Upload token has expired.' }
    }

    return { valid: true, payload }
  } catch {
    return { valid: false, error: 'Upload token could not be decoded.' }
  }
}

export function maskEmail(email) {
  const [localPart, domainPart] = String(email).split('@')

  if (!localPart || !domainPart) {
    return ''
  }

  const maskedLocalPart =
    localPart.length <= 2
      ? `${localPart[0] || '*'}*`
      : `${localPart.slice(0, 2)}***${localPart.slice(-1)}`
  const domainSegments = domainPart.split('.')
  const domainName = domainSegments[0] || ''
  const domainSuffix = domainSegments.slice(1).join('.')
  const maskedDomainName =
    domainName.length <= 2
      ? `${domainName[0] || '*'}*`
      : `${domainName.slice(0, 2)}***${domainName.slice(-1)}`

  return domainSuffix
    ? `${maskedLocalPart}@${maskedDomainName}.${domainSuffix}`
    : `${maskedLocalPart}@${maskedDomainName}`
}

export function createSecureUploadUrl({ siteUrl, token }) {
  const url = new URL('/human-restore/upload', siteUrl)
  url.searchParams.set('token', token)
  return url.toString()
}

export function verifyWebhookSignature({ rawBody, secret, signature }) {
  if (!secret || !signature) {
    return false
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex')
  const signatureBuffer = Buffer.from(String(signature))
  const expectedBuffer = Buffer.from(expectedSignature)

  return (
    signatureBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  )
}

import crypto from 'crypto'
import { json } from './human-restore.js'

function getBearerToken(req) {
  const authorization = req.headers.authorization || ''

  if (!authorization.toLowerCase().startsWith('bearer ')) {
    return ''
  }

  return authorization.slice('bearer '.length).trim()
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''))
  const rightBuffer = Buffer.from(String(right || ''))

  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  )
}

export function requireAdmin(req, res) {
  const expectedToken = process.env.HUMAN_RESTORE_ADMIN_TOKEN
  const providedToken =
    req.headers['x-admin-token'] ||
    getBearerToken(req) ||
    req.query?.adminToken ||
    ''

  if (!expectedToken) {
    json(res, 503, { error: 'Admin review is not configured yet.' })
    return false
  }

  const normalizedProvidedToken = Array.isArray(providedToken)
    ? providedToken[0]
    : providedToken

  if (!safeEqual(normalizedProvidedToken, expectedToken)) {
    json(res, 401, { error: 'Admin access denied.' })
    return false
  }

  return true
}

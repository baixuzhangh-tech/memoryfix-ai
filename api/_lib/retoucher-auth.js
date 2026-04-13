import crypto from 'crypto'
import { json } from './human-restore.js'
import { supabaseRest } from './supabase.js'

export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex')
}

export function generateRetoucherToken() {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Authenticate a retoucher by token.
 * Token can be provided via x-retoucher-token header, Bearer auth, or query param.
 * Returns the retoucher row if valid, or null + sends 401 if invalid.
 */
export async function requireRetoucher(req, res) {
  const providedToken =
    req.headers['x-retoucher-token'] ||
    getBearerToken(req) ||
    req.query?.retoucherToken ||
    ''

  const normalizedToken = Array.isArray(providedToken)
    ? providedToken[0]
    : providedToken

  if (!normalizedToken) {
    json(res, 401, { error: 'Retoucher token is required.' })
    return null
  }

  const tokenHash = hashToken(normalizedToken)

  try {
    const params = new URLSearchParams({
      token_hash: `eq.${tokenHash}`,
      active: 'eq.true',
      limit: '1',
      select: 'id,name,active',
    })
    const rows = await supabaseRest(
      `/human_restore_retouchers?${params.toString()}`
    )
    const retoucher = Array.isArray(rows) ? rows[0] || null : null

    if (!retoucher) {
      json(res, 401, { error: 'Invalid or inactive retoucher token.' })
      return null
    }

    return retoucher
  } catch (error) {
    json(res, 500, { error: 'Could not verify retoucher token.' })
    return null
  }
}

function getBearerToken(req) {
  const authorization = req.headers.authorization || ''

  if (!authorization.toLowerCase().startsWith('bearer ')) {
    return ''
  }

  return authorization.slice('bearer '.length).trim()
}

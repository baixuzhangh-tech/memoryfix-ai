/**
 * IP-based rate limit for the free AI HD preview endpoint.
 *
 * We do NOT want a single IP burning through unlimited free
 * fal/Replicate runs without ever paying. Each preview costs us
 * real cents on AI inference, plus Supabase storage.
 *
 * This implementation uses a Supabase table `ai_hd_preview_attempts`:
 *
 *   create table public.ai_hd_preview_attempts (
 *     id uuid primary key default gen_random_uuid(),
 *     ip_hash text not null,
 *     created_at timestamptz not null default now(),
 *     order_id uuid null,
 *     succeeded boolean not null default true
 *   );
 *   create index ai_hd_preview_attempts_ip_created
 *     on public.ai_hd_preview_attempts (ip_hash, created_at desc);
 *
 * If the table does not exist yet (migration not run), the helper
 * fails OPEN — i.e. lets the request through — so a missing
 * migration cannot brick the public site. The error is logged.
 *
 * The IP itself is never stored in the clear: we hash with
 * SHA-256 + an HMAC secret env var so a database leak never
 * reveals a customer's IP.
 */

import { createHmac } from 'crypto'

const tableName = 'ai_hd_preview_attempts'
const windowSeconds = 24 * 60 * 60
const defaultMaxPerWindow = 3

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY

  if (!url || !serviceKey) {
    return null
  }

  return { url: url.replace(/\/$/, ''), serviceKey }
}

function getRateLimitSecret() {
  return (
    process.env.AI_HD_PREVIEW_IP_SALT ||
    process.env.HUMAN_RESTORE_UPLOAD_TOKEN_SECRET ||
    'memoryfix-preview-fallback-salt'
  )
}

function hashIp(rawIp) {
  return createHmac('sha256', getRateLimitSecret())
    .update(String(rawIp || 'unknown'))
    .digest('hex')
}

function getMaxPerWindow() {
  const fromEnv = Number(process.env.AI_HD_PREVIEW_MAX_PER_DAY)
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return Math.floor(fromEnv)
  }
  return defaultMaxPerWindow
}

export function extractClientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for']

  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim()
  }

  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return String(forwarded[0]).split(',')[0].trim()
  }

  return req.headers?.['x-real-ip'] || req.socket?.remoteAddress || 'unknown'
}

async function supabaseRest(path, init = {}) {
  const config = getSupabaseConfig()

  if (!config) {
    throw new Error('Supabase rate limit not configured.')
  }

  const headers = {
    apikey: config.serviceKey,
    Authorization: `Bearer ${config.serviceKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
    ...(init.headers || {}),
  }

  const response = await fetch(`${config.url}/rest/v1${path}`, {
    ...init,
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    const error = new Error(
      `Supabase rate limit request failed: ${response.status} ${errorText}`
    )
    error.status = response.status
    error.body = errorText
    throw error
  }

  return response.json().catch(() => null)
}

/**
 * Count successful preview attempts in the last 24h for the
 * given IP hash. Returns 0 on infrastructure error so we fail
 * open (logging the error so we can fix it).
 */
async function countRecentAttempts(ipHash) {
  const since = new Date(Date.now() - windowSeconds * 1000).toISOString()
  const params = new URLSearchParams({
    select: 'id',
    ip_hash: `eq.${ipHash}`,
    succeeded: 'eq.true',
    created_at: `gte.${since}`,
    limit: '50',
  })

  const rows = await supabaseRest(`/${tableName}?${params.toString()}`, {
    method: 'GET',
  })

  return Array.isArray(rows) ? rows.length : 0
}

/**
 * Check whether the request from `rawIp` may consume one more
 * free preview. Returns { allowed, remaining, max, retryAfterSeconds }.
 *
 * Fails OPEN on any error so a Supabase outage cannot take the
 * preview endpoint offline — abuse is still bounded by the
 * per-request AI cost ceilings on the upstream provider.
 */
export async function checkPreviewRateLimit(rawIp) {
  const ipHash = hashIp(rawIp)
  const max = getMaxPerWindow()

  try {
    const used = await countRecentAttempts(ipHash)
    const remaining = Math.max(0, max - used)

    return {
      allowed: used < max,
      ipHash,
      max,
      remaining,
      retryAfterSeconds: used >= max ? windowSeconds : 0,
      used,
    }
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: 'ai_hd_preview_rate_limit_check_failed',
        error_message: error instanceof Error ? error.message : 'unknown',
        timestamp: new Date().toISOString(),
      })
    )

    return {
      allowed: true,
      ipHash,
      max,
      remaining: max,
      retryAfterSeconds: 0,
      used: 0,
    }
  }
}

/**
 * Record one preview attempt. Best-effort; logs but does not
 * throw on failure so a successful preview is never lost just
 * because rate-limit bookkeeping broke.
 */
export async function recordPreviewAttempt({ ipHash, orderId, succeeded }) {
  try {
    await supabaseRest(`/${tableName}`, {
      method: 'POST',
      body: {
        ip_hash: ipHash,
        order_id: orderId || null,
        succeeded: Boolean(succeeded),
      },
    })
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: 'ai_hd_preview_rate_limit_record_failed',
        error_message: error instanceof Error ? error.message : 'unknown',
        order_id: orderId || null,
        timestamp: new Date().toISOString(),
      })
    )
  }
}

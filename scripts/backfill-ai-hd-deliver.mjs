#!/usr/bin/env node
/**
 * Backfill AI HD auto-delivery.
 *
 * Finds orders that are paid (payment_confirmed_at is not null) but whose
 * job is still stuck at `needs_review`, and runs the same auto-delivery
 * pipeline the webhook uses. Safe to run repeatedly — autoDeliverAiHdJob
 * is idempotent (it short-circuits on already-delivered jobs and missing
 * ai_draft). Intended for one-shot remediation of orders the webhook
 * missed (e.g. fal still running when the payment event arrived).
 *
 * Loads env from .vercel/.env.production.local and imports the real
 * helper straight from api/_lib so we don't drift from prod logic.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { autoDeliverAiHdJob } from '../api/_lib/auto-deliver.js'

// ---- load env ---------------------------------------------------------

const envPath = resolve(process.cwd(), '.vercel/.env.production.local')
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#') || !t.includes('=')) continue
  const i = t.indexOf('=')
  let v = t.slice(i + 1)
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
  if (!(t.slice(0, i) in process.env)) {
    process.env[t.slice(0, i)] = v
  }
}

const supaUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '')
const supaKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
function cleanEmailEnv(value) {
  if (!value) return ''
  return String(value)
    .replace(/\\n|\\r/g, '')
    .replace(/[\r\n\t]+/g, '')
    .trim()
}

const resendApiKey = process.env.RESEND_API_KEY
const fromEmail =
  cleanEmailEnv(process.env.HUMAN_RESTORE_FROM_EMAIL) ||
  'MemoryFix AI <onboarding@resend.dev>'
const supportEmail =
  cleanEmailEnv(process.env.HUMAN_RESTORE_SUPPORT_EMAIL) ||
  cleanEmailEnv(process.env.HUMAN_RESTORE_INBOX)

// Overwrite in process.env so autoDeliverAiHdJob (which we import) and any
// transitively-loaded helper sees the cleaned values too.
if (fromEmail) process.env.HUMAN_RESTORE_FROM_EMAIL = fromEmail
if (supportEmail) process.env.HUMAN_RESTORE_SUPPORT_EMAIL = supportEmail

if (!supaUrl || !supaKey) {
  console.error('Missing SUPABASE_URL / service key')
  process.exit(1)
}
if (!resendApiKey || !supportEmail) {
  console.error('Missing RESEND_API_KEY / HUMAN_RESTORE_SUPPORT_EMAIL')
  process.exit(1)
}

const dryRun = process.env.DRY_RUN === '1' || process.argv.includes('--dry-run')
if (dryRun) {
  console.log('[backfill] DRY RUN — no emails will be sent, no rows updated')
}

const auth = {
  apikey: supaKey,
  Authorization: `Bearer ${supaKey}`,
  Accept: 'application/json',
}

async function restGet(path, params) {
  const q = new URLSearchParams(params).toString()
  const res = await fetch(`${supaUrl}/rest/v1${path}?${q}`, { headers: auth })
  if (!res.ok) throw new Error(`GET ${path} ${res.status}: ${await res.text()}`)
  return res.json()
}

// ---- locate stuck AI HD orders ---------------------------------------

const aiHdPriceId = process.env.PADDLE_AI_HD_PRICE_ID || ''

// Order statuses that mean "paid but not delivered yet".
const stuckOrderStatuses = ['paid', 'needs_review', 'manual_review', 'ai_queued']

const orders = await restGet('/human_restore_orders', {
  select:
    'id,submission_reference,status,payment_confirmed_at,variant_id,job_id,created_at',
  status: `in.(${stuckOrderStatuses.join(',')})`,
  'payment_confirmed_at': 'not.is.null',
  order: 'created_at.asc',
  limit: '200',
})

const aiHdOrders = orders.filter(o => {
  // Conservative: keep orders whose variant matches the ai_hd price id when
  // we have one; otherwise fall back to any stuck paid order and let the
  // job check decide.
  if (!aiHdPriceId) return true
  return !o.variant_id || o.variant_id === aiHdPriceId
})

console.log(
  `[backfill] stuck paid orders=${orders.length} candidates=${aiHdOrders.length}`,
)

if (!aiHdOrders.length) {
  console.log('[backfill] nothing to do')
  process.exit(0)
}

// ---- load linked jobs in one batch -----------------------------------

const jobIds = aiHdOrders.map(o => o.job_id).filter(Boolean)
const jobs = jobIds.length
  ? await restGet('/human_restore_jobs', {
      select:
        'id,submission_reference,status,checkout_email,customer_name,ai_draft_storage_bucket,ai_draft_storage_path,ai_draft_file_type,original_storage_bucket,original_storage_path',
      id: `in.(${jobIds.join(',')})`,
    })
  : []
const jobById = Object.fromEntries(jobs.map(j => [j.id, j]))

// ---- run auto-delivery one by one ------------------------------------

const summary = { delivered: 0, skipped: 0, failed: 0, reasons: {} }

for (const order of aiHdOrders) {
  const ref = order.submission_reference || order.id.slice(0, 8)
  const job = order.job_id ? jobById[order.job_id] : null

  if (!job) {
    summary.skipped += 1
    summary.reasons.no_job = (summary.reasons.no_job || 0) + 1
    console.log(`[skip ] ${ref} — no linked job`)
    continue
  }

  if (job.status === 'delivered') {
    // Job already delivered but order status never caught up — just flip
    // the order row.
    if (!dryRun) {
      await fetch(
        `${supaUrl}/rest/v1/human_restore_orders?id=eq.${encodeURIComponent(
          order.id,
        )}`,
        {
          method: 'PATCH',
          headers: {
            ...auth,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            status: 'delivered',
            updated_at: new Date().toISOString(),
          }),
        },
      )
    }
    summary.delivered += 1
    console.log(
      `[${dryRun ? 'dry  ' : 'fix  '}] ${ref} — order -> delivered (job already was)`,
    )
    continue
  }

  if (job.status !== 'needs_review') {
    summary.skipped += 1
    summary.reasons[`job_${job.status}`] =
      (summary.reasons[`job_${job.status}`] || 0) + 1
    console.log(`[skip ] ${ref} — job status=${job.status}`)
    continue
  }

  if (!job.ai_draft_storage_path) {
    summary.skipped += 1
    summary.reasons.no_ai_draft = (summary.reasons.no_ai_draft || 0) + 1
    console.log(`[skip ] ${ref} — no ai_draft`)
    continue
  }

  if (!job.checkout_email || job.checkout_email.endsWith('@artgen.site')) {
    summary.skipped += 1
    summary.reasons.placeholder_email =
      (summary.reasons.placeholder_email || 0) + 1
    console.log(
      `[skip ] ${ref} — checkout_email missing or placeholder (${job.checkout_email || 'null'})`,
    )
    continue
  }

  if (dryRun) {
    summary.delivered += 1
    console.log(`[dry  ] ${ref} — would auto-deliver (email ${job.checkout_email})`)
    continue
  }

  try {
    const result = await autoDeliverAiHdJob({
      job,
      resendApiKey,
      fromEmail,
      supportEmail,
    })
    if (result?.delivered) {
      summary.delivered += 1
      console.log(`[ok   ] ${ref} — delivered`)
    } else {
      summary.skipped += 1
      summary.reasons[result?.reason || 'unknown_skip'] =
        (summary.reasons[result?.reason || 'unknown_skip'] || 0) + 1
      console.log(`[skip ] ${ref} — ${result?.reason || 'unknown'}`)
    }
  } catch (error) {
    summary.failed += 1
    console.error(
      `[FAIL ] ${ref} — ${error instanceof Error ? error.message : error}`,
    )
  }
}

console.log('\n[backfill] summary:', JSON.stringify(summary, null, 2))

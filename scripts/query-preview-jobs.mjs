#!/usr/bin/env node
/**
 * Read-only diagnostic: list recent AI HD preview jobs + their orders.
 * Uses .vercel/.env.production.local. Never prints secrets.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const envPath = resolve(process.cwd(), '.vercel/.env.production.local')
const raw = readFileSync(envPath, 'utf8')
const env = {}
for (const line of raw.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
  const idx = trimmed.indexOf('=')
  let value = trimmed.slice(idx + 1)
  if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
  env[trimmed.slice(0, idx)] = value
}

const url = (env.SUPABASE_URL || '').replace(/\/$/, '')
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY
if (!url || !key) {
  console.error('Missing Supabase env')
  process.exit(1)
}

async function fetchJson(path, params) {
  const q = new URLSearchParams(params).toString()
  const res = await fetch(`${url}/rest/v1${path}?${q}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
  return res.json()
}

const jobs = await fetchJson('/human_restore_jobs', {
  order: 'created_at.desc',
  limit: '40',
  select:
    'id,created_at,submission_reference,status,ai_provider,ai_request_id,upload_source,checkout_email,original_file_name,original_file_size,ai_draft_storage_path,human_restore_order_id,ai_provider_payload',
})

const preview = jobs
  .filter(
    (j) =>
      j.upload_source === 'ai_hd_preview' ||
      j.checkout_email === 'preview-pending@artgen.site',
  )
  .slice(0, 10)

const orderIds = [...new Set(preview.map((j) => j.human_restore_order_id).filter(Boolean))]
let ordersById = {}
if (orderIds.length) {
  const orders = await fetchJson('/human_restore_orders', {
    id: `in.(${orderIds.join(',')})`,
    select:
      'id,status,payment_confirmed_at,checkout_ref,created_at,submission_reference,original_file_name',
  })
  ordersById = Object.fromEntries(orders.map((o) => [o.id, o]))
}

const rows = preview.map((j) => {
  const o = ordersById[j.human_restore_order_id] || {}
  const p = j.ai_provider_payload || {}
  return {
    job_id: j.id,
    created_at: j.created_at,
    submission_reference: j.submission_reference,
    status: j.status,
    ai_provider: j.ai_provider,
    has_ai_request_id: Boolean(j.ai_request_id),
    original_file_name: j.original_file_name,
    original_file_size: j.original_file_size,
    has_ai_draft: Boolean(j.ai_draft_storage_path),
    has_preview_storage: Boolean(p.preview_storage_path),
    preview_generated_at: p.preview_generated_at || null,
    order_id: j.human_restore_order_id || '',
    order_status: o.status || '',
    payment_confirmed: Boolean(o.payment_confirmed_at),
    checkout_ref: o.checkout_ref || '',
  }
})

console.log(JSON.stringify(rows, null, 2))

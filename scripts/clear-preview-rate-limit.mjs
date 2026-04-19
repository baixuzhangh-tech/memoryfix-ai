#!/usr/bin/env node
/**
 * Clear today's AI HD preview rate-limit counters so the developer
 * can keep testing. Deletes rows from ai_hd_preview_attempts created
 * in the last 24h. Idempotent / safe — only removes counter rows,
 * does not touch jobs, orders, or storage.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const envPath = resolve(process.cwd(), '.vercel/.env.production.local')
const raw = readFileSync(envPath, 'utf8')
const env = {}
for (const line of raw.split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#') || !t.includes('=')) continue
  const i = t.indexOf('=')
  let v = t.slice(i + 1)
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
  env[t.slice(0, i)] = v
}
const url = (env.SUPABASE_URL || '').replace(/\/$/, '')
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY
if (!url || !key) {
  console.error('Missing Supabase env')
  process.exit(1)
}

const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
const q = new URLSearchParams({ created_at: `gte.${since}` }).toString()

const res = await fetch(`${url}/rest/v1/ai_hd_preview_attempts?${q}`, {
  method: 'DELETE',
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Prefer: 'return=representation',
    Accept: 'application/json',
  },
})
if (!res.ok) {
  console.error('DELETE failed', res.status, await res.text())
  process.exit(1)
}
const deleted = await res.json()
console.log(`Cleared ${deleted.length} preview attempt row(s) in the last 24h.`)

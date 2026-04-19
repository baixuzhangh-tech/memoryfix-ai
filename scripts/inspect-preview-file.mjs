#!/usr/bin/env node
/**
 * Diagnostic: given a job id, download the stored preview watermark
 * file AND the ai_draft, save both locally, and print their sizes +
 * a tiny fingerprint so we can tell them apart at a glance.
 *
 * Usage: node scripts/inspect-preview-file.mjs <job_id>
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const jobId = process.argv[2]
if (!jobId) {
  console.error('Usage: node scripts/inspect-preview-file.mjs <job_id>')
  process.exit(1)
}

const env = {}
const envRaw = readFileSync(resolve(process.cwd(), '.vercel/.env.production.local'), 'utf8')
for (const line of envRaw.split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#') || !t.includes('=')) continue
  const i = t.indexOf('=')
  let v = t.slice(i + 1)
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
  env[t.slice(0, i)] = v
}
const url = (env.SUPABASE_URL || '').replace(/\/$/, '')
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY

async function restGet(path, params) {
  const q = new URLSearchParams(params).toString()
  const res = await fetch(`${url}/rest/v1${path}?${q}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`GET ${path} ${res.status}: ${await res.text()}`)
  return res.json()
}

async function download(bucket, path) {
  const res = await fetch(`${url}/storage/v1/object/${bucket}/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  if (!res.ok) throw new Error(`download ${bucket}/${path} ${res.status}: ${await res.text()}`)
  return Buffer.from(await res.arrayBuffer())
}

const jobs = await restGet('/human_restore_jobs', {
  id: `eq.${jobId}`,
  select:
    'id,submission_reference,ai_draft_storage_bucket,ai_draft_storage_path,ai_provider_payload',
})
if (!jobs.length) {
  console.error('Job not found')
  process.exit(1)
}
const j = jobs[0]
const payload = j.ai_provider_payload || {}

console.log('Job:', j.id, j.submission_reference)
console.log('ai_draft:', j.ai_draft_storage_bucket, j.ai_draft_storage_path)
console.log('preview :', payload.preview_storage_bucket, payload.preview_storage_path)

const draft = await download(j.ai_draft_storage_bucket, j.ai_draft_storage_path)
const preview = await download(payload.preview_storage_bucket, payload.preview_storage_path)

const draftHash = createHash('sha1').update(draft).digest('hex').slice(0, 12)
const previewHash = createHash('sha1').update(preview).digest('hex').slice(0, 12)

console.log(`\nai_draft   size=${draft.length} bytes  sha1=${draftHash}`)
console.log(`preview    size=${preview.length} bytes  sha1=${previewHash}`)
console.log(`identical files? ${draftHash === previewHash}\n`)

const outDir = resolve(process.cwd(), 'scripts/.preview-inspect')
try {
  const fs = await import('node:fs')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
} catch {}
const outDraft = resolve(outDir, `${jobId}-ai-draft${j.ai_draft_storage_path.endsWith('.png') ? '.png' : '.jpg'}`)
const outPreview = resolve(outDir, `${jobId}-watermark.jpg`)
writeFileSync(outDraft, draft)
writeFileSync(outPreview, preview)
console.log('Saved:', outDraft)
console.log('Saved:', outPreview)

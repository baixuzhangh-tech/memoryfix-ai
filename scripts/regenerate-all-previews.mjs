#!/usr/bin/env node
/**
 * Batch remediation: re-watermark every AI HD preview job that has
 * an ai_draft in storage, using the new pre-rendered watermark tile
 * from api/_lib/watermark.js. Safe to run repeatedly — the watermark
 * step is deterministic and the upload uses x-upsert.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { watermarkPreview } from '../api/_lib/watermark.js'

const env = {}
for (const line of readFileSync(
  resolve(process.cwd(), '.vercel/.env.production.local'),
  'utf8',
).split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#') || !t.includes('=')) continue
  const i = t.indexOf('=')
  let v = t.slice(i + 1)
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
  env[t.slice(0, i)] = v
}
const url = (env.SUPABASE_URL || '').replace(/\/$/, '')
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY
const auth = { apikey: key, Authorization: `Bearer ${key}` }

async function restGet(path, params) {
  const q = new URLSearchParams(params).toString()
  const res = await fetch(`${url}/rest/v1${path}?${q}`, {
    headers: { ...auth, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`GET ${path} ${res.status}: ${await res.text()}`)
  return res.json()
}

async function restPatch(path, params, body) {
  const q = new URLSearchParams(params).toString()
  const res = await fetch(`${url}/rest/v1${path}?${q}`, {
    method: 'PATCH',
    headers: {
      ...auth,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok)
    throw new Error(`PATCH ${path} ${res.status}: ${await res.text()}`)
  return res.json()
}

async function storageDownload(bucket, path) {
  const res = await fetch(`${url}/storage/v1/object/${bucket}/${path}`, {
    headers: auth,
  })
  if (!res.ok)
    throw new Error(`download ${bucket}/${path} ${res.status}: ${await res.text()}`)
  return Buffer.from(await res.arrayBuffer())
}

async function storageUpload(bucket, path, buffer, contentType) {
  const res = await fetch(`${url}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': contentType, 'x-upsert': 'true' },
    body: buffer,
  })
  if (!res.ok)
    throw new Error(`upload ${bucket}/${path} ${res.status}: ${await res.text()}`)
}

const jobs = await restGet('/human_restore_jobs', {
  order: 'created_at.desc',
  limit: '50',
  select:
    'id,submission_reference,upload_source,checkout_email,ai_draft_storage_bucket,ai_draft_storage_path,ai_provider_payload',
})

const targets = jobs.filter(
  (j) =>
    (j.upload_source === 'ai_hd_preview' ||
      j.checkout_email === 'preview-pending@artgen.site') &&
    j.ai_draft_storage_bucket &&
    j.ai_draft_storage_path,
)
console.log(`Found ${targets.length} preview jobs to re-watermark.\n`)

for (const j of targets) {
  try {
    console.log('-', j.id, j.submission_reference)
    const draft = await storageDownload(
      j.ai_draft_storage_bucket,
      j.ai_draft_storage_path,
    )
    const wm = await watermarkPreview(draft)
    const safeRef = String(j.submission_reference || 'AI-HD-PREVIEW').replace(
      /[^A-Z0-9-]/g,
      '',
    )
    const bucket = j.ai_draft_storage_bucket
    const path = `${safeRef}/preview-watermark.jpg`
    await storageUpload(bucket, path, wm, 'image/jpeg')
    await restPatch(
      '/human_restore_jobs',
      { id: `eq.${j.id}` },
      {
        ai_provider_payload: {
          ...(j.ai_provider_payload || {}),
          preview_storage_bucket: bucket,
          preview_storage_path: path,
          preview_generated_at: new Date().toISOString(),
        },
      },
    )
    console.log(`  ok  ${wm.length} bytes -> ${bucket}/${path}`)
  } catch (err) {
    console.error(`  FAIL ${j.id}:`, err.message)
  }
}
console.log('\nDone.')

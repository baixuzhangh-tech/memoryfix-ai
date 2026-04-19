#!/usr/bin/env node
/**
 * Diagnostic remediation: for a given stuck AI HD preview job that
 * already has an ai_draft but no preview_storage, download the draft,
 * watermark it, upload to results bucket, and patch ai_provider_payload
 * so subsequent polls return previewStatus=ready.
 *
 * Usage: node scripts/regenerate-preview-watermark.mjs <job_id>
 * Reads Supabase creds from .vercel/.env.production.local.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import sharp from 'sharp'

const jobId = process.argv[2]
if (!jobId) {
  console.error('Usage: node scripts/regenerate-preview-watermark.mjs <job_id>')
  process.exit(1)
}

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
const resultsBucketOverride =
  env.HUMAN_RESTORE_RESULTS_BUCKET || env.SUPABASE_RESULTS_BUCKET || ''
if (!url || !key) {
  console.error('Missing Supabase env')
  process.exit(1)
}

const authHeaders = {
  apikey: key,
  Authorization: `Bearer ${key}`,
}

async function restGet(path, params) {
  const q = new URLSearchParams(params).toString()
  const res = await fetch(`${url}/rest/v1${path}?${q}`, {
    headers: { ...authHeaders, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`GET ${path} ${res.status}: ${await res.text()}`)
  return res.json()
}

async function restPatch(path, params, body) {
  const q = new URLSearchParams(params).toString()
  const res = await fetch(`${url}/rest/v1${path}?${q}`, {
    method: 'PATCH',
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`PATCH ${path} ${res.status}: ${await res.text()}`)
  return res.json()
}

async function storageDownload(bucket, path) {
  const res = await fetch(`${url}/storage/v1/object/${bucket}/${path}`, {
    headers: authHeaders,
  })
  if (!res.ok)
    throw new Error(`Storage download ${bucket}/${path} ${res.status}: ${await res.text()}`)
  return Buffer.from(await res.arrayBuffer())
}

async function storageUpload(bucket, path, buffer, contentType) {
  const res = await fetch(`${url}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: {
      ...authHeaders,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body: buffer,
  })
  if (!res.ok)
    throw new Error(`Storage upload ${bucket}/${path} ${res.status}: ${await res.text()}`)
}

function escapeXml(v) {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function buildWatermarkSvg(width, height) {
  const text = 'MemoryFix AI · Preview · Pay $6.90 to unlock HD'
  const fontSize = Math.max(18, Math.round(width / 38))
  const stepX = Math.round(width / 2.4)
  const stepY = Math.round(fontSize * 4.2)
  const rows = []
  for (let y = -stepY; y < height + stepY; y += stepY) {
    const offsetX = (y / stepY) % 2 === 0 ? 0 : stepX / 2
    for (let x = -stepX; x < width + stepX; x += stepX) {
      rows.push(
        `<text x="${x + offsetX}" y="${y}" fill="#ffffff" fill-opacity="0.55" stroke="#000000" stroke-opacity="0.35" stroke-width="1" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="${fontSize}" transform="rotate(-28 ${x + offsetX} ${y})">${escapeXml(text)}</text>`,
      )
    }
  }
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${rows.join('')}</svg>`,
  )
}

async function watermarkPreview(buffer) {
  const previewLongEdge = 1280
  const meta = await sharp(buffer).rotate().metadata()
  const sw = meta.width || previewLongEdge
  const sh = meta.height || previewLongEdge
  const longEdge = Math.max(sw, sh)
  const scale = longEdge > previewLongEdge ? previewLongEdge / longEdge : 1
  const tw = Math.max(1, Math.round(sw * scale))
  const th = Math.max(1, Math.round(sh * scale))
  const resized = await sharp(buffer)
    .rotate()
    .resize(tw, th, { fit: 'inside' })
    .jpeg({ quality: 78 })
    .toBuffer()
  const rmeta = await sharp(resized).metadata()
  const overlay = buildWatermarkSvg(rmeta.width || tw, rmeta.height || th)
  return sharp(resized).composite([{ input: overlay, top: 0, left: 0 }]).jpeg({ quality: 78 }).toBuffer()
}

const jobs = await restGet('/human_restore_jobs', {
  id: `eq.${jobId}`,
  select:
    'id,submission_reference,ai_draft_storage_bucket,ai_draft_storage_path,ai_provider_payload',
})
if (!jobs.length) {
  console.error('Job not found:', jobId)
  process.exit(1)
}
const job = jobs[0]
if (!job.ai_draft_storage_bucket || !job.ai_draft_storage_path) {
  console.error('Job has no ai_draft storage; nothing to watermark.')
  process.exit(1)
}

console.log('Downloading ai_draft:', job.ai_draft_storage_bucket, job.ai_draft_storage_path)
const draftBuffer = await storageDownload(job.ai_draft_storage_bucket, job.ai_draft_storage_path)
console.log('ai_draft size:', draftBuffer.length, 'bytes')

console.log('Watermarking with sharp...')
const wmBuffer = await watermarkPreview(draftBuffer)
console.log('Watermarked size:', wmBuffer.length, 'bytes')

const safeRef = String(job.submission_reference || 'AI-HD-PREVIEW').replace(/[^A-Z0-9-]/g, '')
const previewPath = `${safeRef}/preview-watermark.jpg`
const resultsBucket = resultsBucketOverride || job.ai_draft_storage_bucket

console.log('Uploading to:', resultsBucket, previewPath)
await storageUpload(resultsBucket, previewPath, wmBuffer, 'image/jpeg')

console.log('Patching ai_provider_payload on job...')
const nextPayload = {
  ...(job.ai_provider_payload || {}),
  preview_generated_at: new Date().toISOString(),
  preview_storage_bucket: resultsBucket,
  preview_storage_path: previewPath,
}
await restPatch(
  '/human_restore_jobs',
  { id: `eq.${jobId}` },
  { ai_provider_payload: nextPayload },
)
console.log('Done. Job', jobId, 'now has preview_storage_path:', previewPath)

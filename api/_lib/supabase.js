const defaultOriginalsBucket = 'human-restore-originals'
const defaultResultsBucket = 'human-restore-results'
const defaultSignedUrlSeconds = 60 * 60
const defaultDownloadUrlSeconds = 7 * 24 * 60 * 60

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '')
}

function encodeStoragePath(path) {
  return String(path || '')
    .split('/')
    .filter(Boolean)
    .map(segment => encodeURIComponent(segment))
    .join('/')
}

function getConfig() {
  const url = trimTrailingSlash(process.env.SUPABASE_URL)
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error('Supabase is not configured.')
  }

  return {
    serviceRoleKey,
    url,
  }
}

export function getHumanRestoreBuckets() {
  return {
    originals:
      process.env.SUPABASE_HUMAN_RESTORE_ORIGINALS_BUCKET ||
      defaultOriginalsBucket,
    results:
      process.env.SUPABASE_HUMAN_RESTORE_RESULTS_BUCKET || defaultResultsBucket,
  }
}

export function isSupabaseConfigured() {
  return Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

async function parseResponse(response) {
  const text = await response.text()

  if (!text) {
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function supabaseFetch(url, options = {}) {
  const { serviceRoleKey } = getConfig()
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    ...(options.headers || {}),
  }

  const response = await fetch(url, {
    ...options,
    headers,
  })
  const payload = await parseResponse(response)

  if (!response.ok) {
    const message =
      payload?.message ||
      payload?.error_description ||
      payload?.error ||
      `Supabase request failed with ${response.status}`
    throw new Error(message)
  }

  return payload
}

export async function supabaseRest(path, options = {}) {
  const { url } = getConfig()
  const body =
    options.body === undefined ? undefined : JSON.stringify(options.body)

  return supabaseFetch(`${url}/rest/v1${path}`, {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.prefer ? { Prefer: options.prefer } : {}),
      ...(options.headers || {}),
    },
    body,
  })
}

export async function insertJob(job) {
  const payload = await supabaseRest('/human_restore_jobs', {
    method: 'POST',
    body: job,
    prefer: 'return=representation',
  })

  return Array.isArray(payload) ? payload[0] : payload
}

export async function insertEvent(jobId, eventType, metadata = {}) {
  if (!jobId) {
    return null
  }

  try {
    return await supabaseRest('/human_restore_events', {
      method: 'POST',
      body: {
        event_type: eventType,
        job_id: jobId,
        metadata,
      },
    })
  } catch {
    return null
  }
}

export async function getJob(jobId) {
  const params = new URLSearchParams({
    id: `eq.${jobId}`,
    limit: '1',
    select: '*',
  })
  const payload = await supabaseRest(`/human_restore_jobs?${params.toString()}`)

  return Array.isArray(payload) ? payload[0] || null : null
}

export async function countJobsByOrderId(orderId) {
  if (!orderId) {
    return 0
  }

  const params = new URLSearchParams({
    order_id: `eq.${orderId}`,
    status: 'not.in.(failed,deleted)',
    select: 'id',
  })
  const payload = await supabaseRest(`/human_restore_jobs?${params.toString()}`)

  return Array.isArray(payload) ? payload.length : 0
}

export async function countRecentJobsByEmail(email, hours = 24) {
  if (!email) {
    return 0
  }

  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
  const params = new URLSearchParams({
    checkout_email: `eq.${email}`,
    created_at: `gte.${since}`,
    status: 'not.in.(failed,deleted)',
    select: 'id',
  })
  const payload = await supabaseRest(`/human_restore_jobs?${params.toString()}`)

  return Array.isArray(payload) ? payload.length : 0
}

export async function listJobs({ status = 'active', limit = 25 } = {}) {
  const params = new URLSearchParams({
    limit: String(limit),
    order: 'created_at.desc',
    select: '*',
  })

  if (status && status !== 'all') {
    const statuses =
      status === 'active'
        ? [
            'uploaded',
            'processing',
            'ai_queued',
            'ai_failed',
            'needs_review',
            'manual_review',
          ]
        : [status]

    params.set('status', `in.(${statuses.join(',')})`)
  }

  return supabaseRest(`/human_restore_jobs?${params.toString()}`)
}

export async function listExpiredJobs({ limit = 20 } = {}) {
  const params = new URLSearchParams({
    deleted_at: 'is.null',
    expires_at: `lt.${new Date().toISOString()}`,
    limit: String(limit),
    order: 'expires_at.asc',
    select: '*',
  })

  return supabaseRest(`/human_restore_jobs?${params.toString()}`)
}

export async function updateJob(jobId, patch) {
  const payload = await supabaseRest(
    `/human_restore_jobs?id=eq.${encodeURIComponent(jobId)}`,
    {
      method: 'PATCH',
      body: {
        ...patch,
        updated_at: new Date().toISOString(),
      },
      prefer: 'return=representation',
    }
  )

  return Array.isArray(payload) ? payload[0] : payload
}

export async function uploadObject({
  bucket,
  contentType = 'application/octet-stream',
  data,
  path,
  upsert = true,
}) {
  const { url } = getConfig()
  const trimmedBucket = bucket.trim()
  const encodedPath = encodeStoragePath(path)

  await supabaseFetch(`${url}/storage/v1/object/${trimmedBucket}/${encodedPath}`, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      'x-upsert': upsert ? 'true' : 'false',
    },
    body: data,
  })

  return {
    bucket,
    path,
  }
}

export async function downloadObject({ bucket, path }) {
  const { url } = getConfig()
  const trimmedBucket = bucket.trim()
  const encodedPath = encodeStoragePath(path)
  const { serviceRoleKey } = getConfig()
  const response = await fetch(
    `${url}/storage/v1/object/${trimmedBucket}/${encodedPath}`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    }
  )

  if (!response.ok) {
    const payload = await parseResponse(response)
    throw new Error(payload?.message || 'Could not download stored object.')
  }

  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType:
      response.headers.get('content-type') || 'application/octet-stream',
  }
}

export async function createSignedUrl({
  bucket,
  expiresIn = defaultSignedUrlSeconds,
  path,
}) {
  if (!bucket || !path) {
    return ''
  }

  const { url } = getConfig()
  const trimmedBucket = bucket.trim()
  const encodedPath = encodeStoragePath(path)
  const payload = await supabaseFetch(
    `${url}/storage/v1/object/sign/${trimmedBucket}/${encodedPath}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expiresIn }),
    }
  )
  const signedUrl = payload?.signedURL || payload?.signedUrl || ''

  if (!signedUrl) {
    return ''
  }

  if (signedUrl.startsWith('http')) {
    return signedUrl
  }

  const prefix = signedUrl.startsWith('/storage/v1/') ? '' : '/storage/v1'

  return `${url}${prefix}${signedUrl}`
}

export async function createJobSignedUrls(job) {
  const originalSignedUrl = await createSignedUrl({
    bucket: job.original_storage_bucket,
    path: job.original_storage_path,
  })
  const resultSignedUrl =
    job.result_storage_bucket && job.result_storage_path
      ? await createSignedUrl({
          bucket: job.result_storage_bucket,
          path: job.result_storage_path,
        })
      : ''

  return {
    ...job,
    original_signed_url: originalSignedUrl,
    result_signed_url: resultSignedUrl,
  }
}

export function getDeliveryDownloadUrlSeconds() {
  return (
    Number(process.env.HUMAN_RESTORE_DOWNLOAD_URL_EXPIRES_SECONDS) ||
    defaultDownloadUrlSeconds
  )
}

export async function deleteObject({ bucket, path }) {
  if (!bucket || !path) {
    return null
  }

  const { url } = getConfig()
  const trimmedBucket = bucket.trim()

  return supabaseFetch(`${url}/storage/v1/object/${trimmedBucket}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prefixes: [path],
    }),
  })
}

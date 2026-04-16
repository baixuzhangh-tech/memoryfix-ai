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

export async function insertOrder(order) {
  const payload = await supabaseRest('/human_restore_orders', {
    method: 'POST',
    body: order,
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

export async function insertSystemEvent(eventType, metadata = {}) {
  try {
    const payload = await supabaseRest('/human_restore_events', {
      method: 'POST',
      body: {
        event_type: eventType,
        metadata,
      },
      prefer: 'return=representation',
    })

    return Array.isArray(payload) ? payload[0] || null : payload
  } catch {
    return null
  }
}

export async function getLatestSystemEventByType(eventType) {
  if (!eventType) {
    return null
  }

  const params = new URLSearchParams({
    event_type: `eq.${eventType}`,
    limit: '1',
    order: 'created_at.desc',
    select: '*',
  })
  const payload = await supabaseRest(`/human_restore_events?${params.toString()}`)

  return Array.isArray(payload) ? payload[0] || null : null
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

export async function getOrder(orderId) {
  if (!orderId) {
    return null
  }

  const params = new URLSearchParams({
    id: `eq.${orderId}`,
    limit: '1',
    select: '*',
  })
  const payload = await supabaseRest(
    `/human_restore_orders?${params.toString()}`
  )

  return Array.isArray(payload) ? payload[0] || null : null
}

export async function getOrderByCheckoutRef(checkoutRef) {
  if (!checkoutRef) {
    return null
  }

  const params = new URLSearchParams({
    checkout_ref: `eq.${checkoutRef}`,
    limit: '1',
    select: '*',
  })
  const payload = await supabaseRest(
    `/human_restore_orders?${params.toString()}`
  )

  return Array.isArray(payload) ? payload[0] || null : null
}

export async function getOrderByProviderOrderId(providerOrderId) {
  if (!providerOrderId) {
    return null
  }

  const params = new URLSearchParams({
    limit: '1',
    payment_provider_order_id: `eq.${providerOrderId}`,
    select: '*',
  })
  const payload = await supabaseRest(
    `/human_restore_orders?${params.toString()}`
  )

  return Array.isArray(payload) ? payload[0] || null : null
}

export async function getRecentPaidOrderByEmail(email, hoursBack = 48) {
  if (!email) {
    return null
  }

  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString()
  const params = new URLSearchParams({
    checkout_email: `eq.${email}`,
    payment_confirmed_at: 'not.is.null',
    created_at: `gte.${since}`,
    limit: '1',
    order: 'payment_confirmed_at.desc',
    select: '*',
  })
  const payload = await supabaseRest(
    `/human_restore_orders?${params.toString()}`
  )

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
            'assigned',
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

export async function listExpiredOrders({ limit = 20 } = {}) {
  const params = new URLSearchParams({
    deleted_at: 'is.null',
    expires_at: `lt.${new Date().toISOString()}`,
    limit: String(limit),
    order: 'expires_at.asc',
    select: '*',
    status: 'in.(pending_payment,expired,failed)',
  })

  return supabaseRest(`/human_restore_orders?${params.toString()}`)
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

export async function updateOrder(orderId, patch) {
  const payload = await supabaseRest(
    `/human_restore_orders?id=eq.${encodeURIComponent(orderId)}`,
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

export async function updateOrderByJobId(jobId, patch) {
  if (!jobId) {
    return null
  }

  const payload = await supabaseRest(
    `/human_restore_orders?job_id=eq.${encodeURIComponent(jobId)}`,
    {
      method: 'PATCH',
      body: {
        ...patch,
        updated_at: new Date().toISOString(),
      },
      prefer: 'return=representation',
    }
  )

  return Array.isArray(payload) ? payload[0] || null : null
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

  await supabaseFetch(
    `${url}/storage/v1/object/${trimmedBucket}/${encodedPath}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'x-upsert': upsert ? 'true' : 'false',
      },
      body: data,
    }
  )

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

function buildStorageRef(bucket, path, contentType, extra = {}) {
  if (!bucket || !path) {
    return null
  }

  return {
    bucket,
    path,
    contentType: contentType || 'application/octet-stream',
    ...extra,
  }
}

function getLegacyResultStorage(job) {
  return buildStorageRef(
    job.result_storage_bucket,
    job.result_storage_path,
    job.result_file_type,
    {
      model: job.result_model || '',
      prompt: job.result_prompt || '',
      provider: job.ai_provider || '',
      source: 'legacy_result',
    }
  )
}

export function getAiDraftStorage(job) {
  return (
    buildStorageRef(
      job.ai_draft_storage_bucket,
      job.ai_draft_storage_path,
      job.ai_draft_file_type,
      {
        createdAt: job.ai_draft_created_at || null,
        model: job.ai_draft_model || job.result_model || '',
        prompt: job.ai_draft_prompt || job.result_prompt || '',
        provider: job.ai_draft_provider || job.ai_provider || '',
        source: job.ai_draft_source || 'ai_draft',
      }
    ) || getLegacyResultStorage(job)
  )
}

export function getFinalStorage(job) {
  const explicitFinal = buildStorageRef(
    job.final_storage_bucket,
    job.final_storage_path,
    job.final_file_type,
    {
      source: job.final_source || 'human_uploaded_final',
      uploadedAt: job.final_uploaded_at || job.delivered_at || null,
      uploadedBy: job.final_uploaded_by || null,
    }
  )

  if (explicitFinal) {
    return explicitFinal
  }

  if (String(job.delivery_source || '').startsWith('ai_draft')) {
    return getAiDraftStorage(job)
  }

  if (job.status === 'delivered') {
    return getLegacyResultStorage(job)
  }

  return null
}

export async function createJobSignedUrls(job) {
  const signedUrlCache = new Map()
  const originalSignedUrl = await createSignedUrl({
    bucket: job.original_storage_bucket,
    path: job.original_storage_path,
  })
  const aiDraftStorage = getAiDraftStorage(job)
  const finalStorage = getFinalStorage(job)

  async function signStorage(storage) {
    if (!storage?.bucket || !storage?.path) {
      return ''
    }

    const cacheKey = `${storage.bucket}/${storage.path}`

    if (!signedUrlCache.has(cacheKey)) {
      signedUrlCache.set(
        cacheKey,
        createSignedUrl({
          bucket: storage.bucket,
          path: storage.path,
        })
      )
    }

    return signedUrlCache.get(cacheKey)
  }

  const aiDraftSignedUrl = await signStorage(aiDraftStorage)
  const finalSignedUrl = await signStorage(finalStorage)
  const resultSignedUrl = aiDraftSignedUrl || finalSignedUrl

  return {
    ...job,
    ai_draft_signed_url: aiDraftSignedUrl,
    delivery_signed_url: finalSignedUrl || aiDraftSignedUrl,
    final_signed_url: finalSignedUrl,
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

// ---------------------------------------------------------------------------
// Retoucher helpers
// ---------------------------------------------------------------------------

export async function insertRetoucher(retoucher) {
  const payload = await supabaseRest('/human_restore_retouchers', {
    method: 'POST',
    body: retoucher,
    prefer: 'return=representation',
  })

  return Array.isArray(payload) ? payload[0] : payload
}

export async function listRetouchers({ activeOnly = true } = {}) {
  const params = new URLSearchParams({
    order: 'created_at.desc',
    select: 'id,name,active,created_at',
  })

  if (activeOnly) {
    params.set('active', 'eq.true')
  }

  return supabaseRest(`/human_restore_retouchers?${params.toString()}`)
}

export async function updateRetoucher(retoucherId, patch) {
  const payload = await supabaseRest(
    `/human_restore_retouchers?id=eq.${encodeURIComponent(retoucherId)}`,
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

export async function listJobsByRetoucher(retoucherId, { status } = {}) {
  const params = new URLSearchParams({
    retoucher_id: `eq.${retoucherId}`,
    order: 'retoucher_assigned_at.desc',
    select:
      'id,submission_reference,status,notes,original_file_name,original_file_type,original_file_size,original_storage_bucket,original_storage_path,ai_provider,result_model,ai_draft_storage_bucket,ai_draft_storage_path,ai_draft_file_type,ai_draft_model,ai_draft_provider,final_storage_bucket,final_storage_path,final_file_type,final_source,final_uploaded_at,delivery_source,retoucher_assigned_at,retoucher_uploaded_at,created_at',
  })

  if (status) {
    params.set('status', `eq.${status}`)
  } else {
    params.set('status', 'in.(assigned,delivered)')
  }

  return supabaseRest(`/human_restore_jobs?${params.toString()}`)
}

export async function listAssignableJobs({ limit = 50 } = {}) {
  const params = new URLSearchParams({
    retoucher_id: 'is.null',
    status: 'in.(uploaded,needs_review,manual_review,ai_failed)',
    order: 'created_at.desc',
    limit: String(limit),
    select:
      'id,submission_reference,status,notes,original_file_name,original_file_size,checkout_email,created_at',
  })

  return supabaseRest(`/human_restore_jobs?${params.toString()}`)
}

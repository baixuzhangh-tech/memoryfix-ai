import {
  createSignedUrl,
  deleteObject,
  downloadObject,
  getHumanRestoreBuckets,
  updateJob,
  uploadObject,
} from './supabase.js'

const defaultFalModel = 'fal-ai/image-editing/photo-restoration'
const defaultOpenAIImageModel = 'gpt-image-1.5'

function wait(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

function buildRestorePrompt(job) {
  const notes = String(job.notes || '').trim()
  const userNotes = notes
    ? `Customer notes: ${notes}`
    : 'Customer notes: naturally restore the photo while preserving identity and original character.'

  return [
    'Restore this old family photo naturally.',
    'Remove scratches, stains, dust, fold marks, and age damage where possible.',
    'Preserve the original people, faces, clothing, pose, background, era, and vintage character.',
    'Do not invent new people, change identity, over-beautify faces, or make the image look modern/artificial.',
    'If details are uncertain, keep the result conservative and realistic.',
    userNotes,
  ].join('\n')
}

function getProvider(requestedProvider) {
  if (requestedProvider) {
    return requestedProvider
  }

  const configuredProvider = process.env.AI_RESTORE_PROVIDER

  if (configuredProvider === 'fal' && process.env.FAL_KEY) {
    return 'fal'
  }

  if (configuredProvider === 'openai' && process.env.OPENAI_API_KEY) {
    return 'openai'
  }

  if (process.env.FAL_KEY) {
    return 'fal'
  }

  if (process.env.OPENAI_API_KEY) {
    return 'openai'
  }

  return ''
}

function extractFalImageUrl(payload) {
  const image =
    payload?.image ||
    payload?.output?.image ||
    payload?.result?.image ||
    payload?.images?.[0] ||
    payload?.output?.images?.[0] ||
    payload?.data?.images?.[0]

  if (typeof image === 'string') {
    return image
  }

  return image?.url || image?.image_url || image?.content_url || ''
}

async function fetchImageBuffer(url) {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error('Could not fetch restored image from provider.')
  }

  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get('content-type') || 'image/png',
  }
}

async function callOpenAI({ imageBuffer, imageContentType, job, prompt }) {
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured.')
  }

  const formData = new FormData()
  const imageBlob = new Blob([imageBuffer], {
    type: imageContentType || 'image/png',
  })

  formData.append(
    'model',
    process.env.OPENAI_IMAGE_EDIT_MODEL || defaultOpenAIImageModel
  )
  formData.append('image', imageBlob, job.original_file_name || 'photo.png')
  formData.append('prompt', prompt)

  if (process.env.OPENAI_IMAGE_SIZE) {
    formData.append('size', process.env.OPENAI_IMAGE_SIZE)
  }

  if (process.env.OPENAI_IMAGE_QUALITY) {
    formData.append('quality', process.env.OPENAI_IMAGE_QUALITY)
  }

  if (process.env.OPENAI_IMAGE_OUTPUT_FORMAT) {
    formData.append('output_format', process.env.OPENAI_IMAGE_OUTPUT_FORMAT)
  }

  const response = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  })
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(
      payload?.error?.message || 'OpenAI image restoration request failed.'
    )
  }

  const firstImage = payload?.data?.[0]

  if (firstImage?.b64_json) {
    return {
      buffer: Buffer.from(firstImage.b64_json, 'base64'),
      contentType: 'image/png',
      model: process.env.OPENAI_IMAGE_EDIT_MODEL || defaultOpenAIImageModel,
      provider: 'openai',
      providerPayload: { source: 'b64_json' },
    }
  }

  const imageUrl = firstImage?.url

  if (imageUrl) {
    const fetched = await fetchImageBuffer(imageUrl)

    return {
      ...fetched,
      model: process.env.OPENAI_IMAGE_EDIT_MODEL || defaultOpenAIImageModel,
      provider: 'openai',
      providerPayload: { source: 'url' },
    }
  }

  throw new Error('OpenAI did not return a restored image.')
}

async function submitFalRequest({ imageUrl, job, prompt }) {
  const falKey = process.env.FAL_KEY

  if (!falKey) {
    throw new Error('FAL_KEY is not configured.')
  }

  const model = process.env.FAL_RESTORE_MODEL || defaultFalModel
  const input = {
    guidance_scale: Number(process.env.FAL_RESTORE_GUIDANCE_SCALE) || 3.5,
    image_url: imageUrl,
    num_inference_steps:
      Number(process.env.FAL_RESTORE_NUM_INFERENCE_STEPS) || 30,
    output_format: process.env.FAL_RESTORE_OUTPUT_FORMAT || 'jpeg',
    safety_tolerance: process.env.FAL_RESTORE_SAFETY_TOLERANCE || '2',
  }

  if (process.env.FAL_RESTORE_INCLUDE_PROMPT === 'true') {
    input.prompt = prompt
  }

  const response = await fetch(`https://queue.fal.run/${model}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${falKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(
      payload?.detail || payload?.error || 'fal.ai request failed.'
    )
  }

  const requestId = payload?.request_id || payload?.requestId || payload?.id

  if (!requestId) {
    const imageUrlFromPayload = extractFalImageUrl(payload)

    if (imageUrlFromPayload) {
      const fetched = await fetchImageBuffer(imageUrlFromPayload)

      return {
        ...fetched,
        model,
        provider: 'fal',
        providerPayload: { source: 'immediate' },
      }
    }

    throw new Error('fal.ai did not return a request id.')
  }

  return {
    model,
    provider: 'fal',
    requestId,
  }
}

async function pollFalRequest({ model, requestId }) {
  const falKey = process.env.FAL_KEY
  const statusUrl = `https://queue.fal.run/${model}/requests/${requestId}/status`
  const resultUrl = `https://queue.fal.run/${model}/requests/${requestId}/response`

  const statusResponse = await fetch(statusUrl, {
    headers: {
      Authorization: `Key ${falKey}`,
    },
  })
  const statusPayload = await statusResponse.json().catch(() => null)

  if (!statusResponse.ok) {
    throw new Error(
      statusPayload?.detail || statusPayload?.error || 'Could not poll fal.ai.'
    )
  }

  const status = String(statusPayload?.status || '').toUpperCase()

  if (status && status !== 'COMPLETED') {
    if (status.includes('FAIL')) {
      throw new Error(statusPayload?.error || 'fal.ai restoration failed.')
    }

    return {
      model,
      provider: 'fal',
      requestId,
      status: 'pending',
    }
  }

  const resultResponse = await fetch(resultUrl, {
    headers: {
      Authorization: `Key ${falKey}`,
    },
  })
  const resultPayload = await resultResponse.json().catch(() => null)

  if (!resultResponse.ok) {
    throw new Error(
      resultPayload?.detail ||
        resultPayload?.error ||
        'Could not fetch fal.ai result.'
    )
  }

  const restoredImageUrl = extractFalImageUrl(resultPayload)

  if (!restoredImageUrl) {
    throw new Error('fal.ai result did not include a restored image.')
  }

  const fetched = await fetchImageBuffer(restoredImageUrl)

  return {
    ...fetched,
    model,
    provider: 'fal',
    providerPayload: { source: 'queue_result' },
  }
}

async function callFal({ job, prompt }) {
  const imageUrl = await createSignedUrl({
    bucket: job.original_storage_bucket,
    expiresIn: 60 * 30,
    path: job.original_storage_path,
  })
  const queuedOrImmediate = await submitFalRequest({ imageUrl, job, prompt })

  if (queuedOrImmediate.buffer) {
    return queuedOrImmediate
  }

  const maxPolls = Number(process.env.FAL_RESTORE_MAX_POLLS) || 2
  const pollIntervalMs =
    Number(process.env.FAL_RESTORE_POLL_INTERVAL_MS) || 1000

  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    await wait(pollIntervalMs)
    const polled = await pollFalRequest({
      model: queuedOrImmediate.model,
      requestId: queuedOrImmediate.requestId,
    })

    if (polled.buffer) {
      return polled
    }
  }

  return {
    model: queuedOrImmediate.model,
    provider: 'fal',
    requestId: queuedOrImmediate.requestId,
    status: 'pending',
  }
}

async function finishJobWithResult({ job, prompt, result }) {
  const buckets = getHumanRestoreBuckets()
  const extension = result.contentType?.includes('jpeg') ? 'jpg' : 'png'
  const resultPath = `${
    job.submission_reference
  }/result-${Date.now()}.${extension}`

  await uploadObject({
    bucket: buckets.results,
    contentType: result.contentType || 'image/png',
    data: result.buffer,
    path: resultPath,
  })

  if (
    job.result_storage_bucket &&
    job.result_storage_path &&
    (job.result_storage_bucket !== buckets.results ||
      job.result_storage_path !== resultPath)
  ) {
    await deleteObject({
      bucket: job.result_storage_bucket,
      path: job.result_storage_path,
    }).catch(() => null)
  }

  return updateJob(job.id, {
    ai_error: null,
    ai_provider: result.provider,
    ai_provider_payload: result.providerPayload || {},
    ai_request_id: result.requestId || null,
    result_file_type: result.contentType || 'image/png',
    result_model: result.model,
    result_prompt: prompt,
    result_storage_bucket: buckets.results,
    result_storage_path: resultPath,
    status: 'needs_review',
  })
}

export async function runRestoreJob({ job, provider: requestedProvider }) {
  const provider = getProvider(requestedProvider)
  const prompt = buildRestorePrompt(job)

  if (!provider) {
    throw new Error('No AI restoration provider is configured.')
  }

  if (
    (!requestedProvider || provider === 'fal') &&
    job.ai_provider === 'fal' &&
    job.ai_request_id &&
    job.status === 'processing'
  ) {
    const polled = await pollFalRequest({
      model:
        job.result_model || process.env.FAL_RESTORE_MODEL || defaultFalModel,
      requestId: job.ai_request_id,
    })

    if (polled.status === 'pending') {
      return updateJob(job.id, {
        ai_error: null,
        status: 'processing',
      })
    }

    return finishJobWithResult({ job, prompt, result: polled })
  }

  await updateJob(job.id, {
    ai_error: null,
    ai_provider: provider,
    status: 'processing',
  })

  try {
    const original = await downloadObject({
      bucket: job.original_storage_bucket,
      path: job.original_storage_path,
    })
    const result =
      provider === 'openai'
        ? await callOpenAI({
            imageBuffer: original.buffer,
            imageContentType: original.contentType,
            job,
            prompt,
          })
        : await callFal({ job, prompt })

    if (result.status === 'pending') {
      return updateJob(job.id, {
        ai_error: null,
        ai_provider: result.provider,
        ai_request_id: result.requestId,
        result_model: result.model,
        result_prompt: prompt,
        status: 'processing',
      })
    }

    return finishJobWithResult({ job, prompt, result })
  } catch (error) {
    return updateJob(job.id, {
      ai_error: error instanceof Error ? error.message : 'AI restore failed.',
      status: 'ai_failed',
    })
  }
}

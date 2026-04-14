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
const defaultReplicateCodeformerModel = 'lucataco/codeformer'
const defaultReplicateGfpganModel =
  'tencentarc/gfpgan:0fbacf7afc6c144e5be9767cff80f25aff23e52b0708f17e20f9879b2f21516c'
const defaultReplicatePreset = 'codeformer'

function wait(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

function buildRestorePrompt(job) {
  const notes = String(job.notes || '').trim()

  const systemRules = [
    'You are a professional photo restoration specialist.',
    '',
    '## Core restoration principles',
    '- Remove scratches, stains, dust, fold marks, water damage, and age deterioration.',
    '- Repair torn or missing areas conservatively, using surrounding context as reference.',
    '- Restore faded colors to plausible natural tones for the era without over-saturating.',
    '- Enhance clarity and sharpness while preserving the natural film grain character.',
    '',
    '## Identity and authenticity preservation (CRITICAL)',
    '- NEVER alter facial features, body proportions, age, ethnicity, or identity of any person.',
    '- NEVER add, remove, or replace any person in the photo.',
    '- NEVER change clothing, hairstyle, pose, or body language.',
    '- Preserve the original composition, framing, and background setting.',
    '- Maintain the era-appropriate look — do not modernize the image.',
    '',
    '## Quality constraints',
    '- Keep the result photorealistic. No painterly, cartoon, or AI-artifact look.',
    '- When details are ambiguous or heavily damaged, prefer conservative reconstruction over creative invention.',
    '- Output resolution should match or exceed the input resolution.',
    '',
    '## Safety constraints',
    '- Do not generate NSFW, violent, or offensive content regardless of what the input contains.',
    '- If the input photo contains text or watermarks, attempt to restore the image behind them only if the customer requests it.',
  ]

  const customerSection = notes
    ? [
        '',
        '## Customer-specific restoration instructions',
        `The customer has provided the following instructions. Follow them as closely as possible while respecting the core principles above:`,
        '',
        notes,
      ]
    : [
        '',
        '## Default restoration scope',
        'No specific instructions from the customer. Perform a natural, conservative restoration: fix damage, enhance clarity, restore color, and preserve the original character of the photo.',
      ]

  return [...systemRules, ...customerSection].join('\n')
}

function buildShortPrompt(job) {
  const notes = String(job.notes || '').trim()

  if (notes) {
    return `Restore this old photo: ${notes}. Remove scratches, stains, and damage. Preserve identity and original character. Keep it photorealistic.`
  }

  return 'Restore this old photo naturally. Remove scratches, stains, dust, and age damage. Preserve the original people, faces, era, and character. Keep it photorealistic.'
}

function normalizeModelPreset(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  return ['codeformer', 'gfpgan'].includes(normalized) ? normalized : ''
}

function getDefaultReplicatePreset() {
  return (
    normalizeModelPreset(process.env.REPLICATE_DEFAULT_PRESET) ||
    defaultReplicatePreset
  )
}

function clampNumber(value, min, max, fallback) {
  const numericValue = Number(value)

  if (!Number.isFinite(numericValue)) {
    return fallback
  }

  return Math.min(max, Math.max(min, numericValue))
}

function getProvider(requestedProvider, modelPreset) {
  if (normalizeModelPreset(modelPreset) && process.env.REPLICATE_API_TOKEN) {
    return 'replicate'
  }

  if (requestedProvider) {
    return requestedProvider
  }

  const configuredProvider = process.env.AI_RESTORE_PROVIDER

  if (configuredProvider === 'replicate' && process.env.REPLICATE_API_TOKEN) {
    return 'replicate'
  }

  if (configuredProvider === 'fal' && process.env.FAL_KEY) {
    return 'fal'
  }

  if (configuredProvider === 'openai' && process.env.OPENAI_API_KEY) {
    return 'openai'
  }

  if (process.env.REPLICATE_API_TOKEN) {
    return 'replicate'
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

function buildReplicateRequest({ imageUrl, modelPreset }) {
  const preset =
    normalizeModelPreset(modelPreset) || getDefaultReplicatePreset()

  if (preset === 'gfpgan') {
    return {
      input: {
        img: imageUrl,
        scale: clampNumber(process.env.REPLICATE_GFPGAN_SCALE, 1, 10, 2),
        version: process.env.REPLICATE_GFPGAN_VERSION || 'v1.4',
      },
      model:
        process.env.REPLICATE_GFPGAN_MODEL ||
        process.env.REPLICATE_RESTORE_MODEL ||
        defaultReplicateGfpganModel,
      preset,
    }
  }

  return {
    input: {
      background_enhance:
        process.env.REPLICATE_CODEFORMER_BACKGROUND_ENHANCE !== 'false',
      codeformer_fidelity: clampNumber(
        process.env.REPLICATE_CODEFORMER_FIDELITY,
        0,
        1,
        0.7
      ),
      face_upsample:
        process.env.REPLICATE_CODEFORMER_FACE_UPSAMPLE !== 'false',
      image: imageUrl,
      upscale: clampNumber(process.env.REPLICATE_CODEFORMER_UPSCALE, 1, 4, 2),
    },
    model:
      process.env.REPLICATE_CODEFORMER_MODEL ||
      defaultReplicateCodeformerModel,
    preset: 'codeformer',
  }
}

async function resolveReplicateModelVersion({ apiToken, model }) {
  const [owner, rest] = String(model || '').split('/')
  const [name, version] = String(rest || '').split(':')

  if (!owner || !name) {
    throw new Error('Replicate model must be formatted as owner/name[:version].')
  }

  if (version) {
    return {
      model: `${owner}/${name}`,
      owner,
      version,
    }
  }

  const response = await fetch(`https://api.replicate.com/v1/models/${owner}/${name}`, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
    },
  })
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(
      payload?.detail ||
        payload?.error ||
        'Could not resolve the latest Replicate model version.'
    )
  }

  const latestVersion = payload?.latest_version?.id

  if (!latestVersion) {
    throw new Error('Replicate model does not expose a latest version.')
  }

  return {
    model: `${owner}/${name}`,
    owner,
    version: latestVersion,
  }
}

async function callReplicate({ job, modelPreset }) {
  const apiToken = process.env.REPLICATE_API_TOKEN

  if (!apiToken) {
    throw new Error('REPLICATE_API_TOKEN is not configured.')
  }

  const imageUrl = await createSignedUrl({
    bucket: job.original_storage_bucket,
    expiresIn: 60 * 30,
    path: job.original_storage_path,
  })
  const request = buildReplicateRequest({ imageUrl, modelPreset })
  const model = request.model
  const resolvedModel = await resolveReplicateModelVersion({
    apiToken,
    model,
  })
  const input = request.input
  const createBody = { version: resolvedModel.version, input }
  const createUrl = 'https://api.replicate.com/v1/predictions'

  const createResponse = await fetch(createUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
      Prefer: 'wait',
    },
    body: JSON.stringify(createBody),
  })
  const payload = await createResponse.json().catch(() => null)

  if (!createResponse.ok) {
    throw new Error(
      payload?.detail || payload?.error || 'Replicate prediction request failed.'
    )
  }

  if (payload?.status === 'failed' || payload?.status === 'canceled') {
    throw new Error(payload?.error || 'Replicate prediction failed.')
  }

  let output = payload?.output

  if (payload?.status === 'processing' || payload?.status === 'starting') {
    const pollUrl = payload?.urls?.get || payload?.id
      ? `https://api.replicate.com/v1/predictions/${payload.id}`
      : null

    if (pollUrl) {
      const maxPolls = 15
      const pollInterval = 2000

      for (let i = 0; i < maxPolls; i += 1) {
        await wait(pollInterval)
        const pollRes = await fetch(pollUrl, {
          headers: { Authorization: `Bearer ${apiToken}` },
        })
        const pollData = await pollRes.json().catch(() => null)

        if (pollData?.status === 'succeeded') {
          output = pollData.output
          break
        }

        if (pollData?.status === 'failed' || pollData?.status === 'canceled') {
          throw new Error(pollData?.error || 'Replicate prediction failed.')
        }
      }
    }
  }

  const resultImageUrl =
    typeof output === 'string'
      ? output
      : Array.isArray(output)
        ? output[0]
        : output?.image || output?.url || ''

  if (!resultImageUrl) {
    throw new Error('Replicate did not return a restored image.')
  }

  const fetched = await fetchImageBuffer(resultImageUrl)

  return {
    ...fetched,
    model,
    modelPreset: request.preset,
    provider: 'replicate',
    providerPayload: {
      model_preset: request.preset,
      model_version: resolvedModel.version,
      prediction_id: payload?.id,
      source: 'prediction',
    },
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
  }/ai-draft-${Date.now()}.${extension}`
  const now = new Date().toISOString()

  await uploadObject({
    bucket: buckets.results,
    contentType: result.contentType || 'image/png',
    data: result.buffer,
    path: resultPath,
  })

  const previousDraftBucket =
    job.ai_draft_storage_bucket ||
    (!job.final_storage_path ? job.result_storage_bucket : '')
  const previousDraftPath =
    job.ai_draft_storage_path ||
    (!job.final_storage_path ? job.result_storage_path : '')

  if (
    previousDraftBucket &&
    previousDraftPath &&
    (previousDraftBucket !== buckets.results || previousDraftPath !== resultPath)
  ) {
    await deleteObject({
      bucket: previousDraftBucket,
      path: previousDraftPath,
    }).catch(() => null)
  }

  return updateJob(job.id, {
    ai_draft_created_at: now,
    ai_draft_error: null,
    ai_draft_file_type: result.contentType || 'image/png',
    ai_draft_model: result.model,
    ai_draft_prompt: prompt,
    ai_draft_provider: result.provider,
    ai_draft_source:
      result.modelPreset && result.provider === 'replicate'
        ? `replicate_${result.modelPreset}`
        : result.provider,
    ai_draft_storage_bucket: buckets.results,
    ai_draft_storage_path: resultPath,
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

export async function runRestoreJob({
  job,
  provider: requestedProvider,
  modelPreset: requestedModelPreset,
}) {
  const provider = getProvider(requestedProvider, requestedModelPreset)
  const prompt = buildRestorePrompt(job)
  const modelPreset =
    provider === 'replicate'
      ? normalizeModelPreset(requestedModelPreset) || getDefaultReplicatePreset()
      : ''

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
        ai_draft_error: null,
        status: 'processing',
      })
    }

    return finishJobWithResult({ job, prompt, result: polled })
  }

  await updateJob(job.id, {
    ai_draft_error: null,
    ai_error: null,
    ai_provider: provider,
    ai_draft_provider: provider,
    ai_draft_source:
      provider === 'replicate' && modelPreset
        ? `replicate_${modelPreset}`
        : provider,
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
        : provider === 'replicate'
          ? await callReplicate({ job, modelPreset })
          : await callFal({ job, prompt })

    if (result.status === 'pending') {
      return updateJob(job.id, {
        ai_draft_error: null,
        ai_draft_model: result.model,
        ai_draft_prompt: prompt,
        ai_draft_provider: result.provider,
        ai_draft_source:
          result.modelPreset && result.provider === 'replicate'
            ? `replicate_${result.modelPreset}`
            : result.provider,
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
      ai_draft_error:
        error instanceof Error ? error.message : 'AI restore failed.',
      ai_error: error instanceof Error ? error.message : 'AI restore failed.',
      status: 'ai_failed',
    })
  }
}

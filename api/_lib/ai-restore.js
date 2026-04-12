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
const defaultReplicateModel = 'tencentarc/gfpgan:0fbacf7afc6c144e5be9767cff80f25aff23e52b0708f17e20f9879b2f21516c'
const defaultReplicatePromptModel = 'timothybrooks/instruct-pix2pix:30c1d0b916a6f8efce20493f5d61ee27491ab2a60437c13c588468b9810ec23f'

const promptCapableReplicateModels = new Set([
  'timothybrooks/instruct-pix2pix',
  'stability-ai/sdxl',
  'stability-ai/stable-diffusion',
])

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

function hasCustomerNotes(job) {
  return String(job.notes || '').trim().length > 0
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

  if (configuredProvider === 'replicate' && process.env.REPLICATE_API_TOKEN) {
    return 'replicate'
  }

  if (process.env.FAL_KEY) {
    return 'fal'
  }

  if (process.env.OPENAI_API_KEY) {
    return 'openai'
  }

  if (process.env.REPLICATE_API_TOKEN) {
    return 'replicate'
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

async function callReplicate({ job, prompt }) {
  const apiToken = process.env.REPLICATE_API_TOKEN

  if (!apiToken) {
    throw new Error('REPLICATE_API_TOKEN is not configured.')
  }

  const imageUrl = await createSignedUrl({
    bucket: job.original_storage_bucket,
    expiresIn: 60 * 30,
    path: job.original_storage_path,
  })
  const customerHasNotes = hasCustomerNotes(job)
  const configuredModel = process.env.REPLICATE_RESTORE_MODEL
  const promptModel = process.env.REPLICATE_PROMPT_MODEL || defaultReplicatePromptModel

  const model = configuredModel
    ? configuredModel
    : customerHasNotes
      ? promptModel
      : defaultReplicateModel

  const [owner, rest] = model.split('/')
  const [name, version] = (rest || '').split(':')
  const modelKey = `${owner}/${name}`
  const isPromptCapable =
    promptCapableReplicateModels.has(modelKey) ||
    model === promptModel

  const input = isPromptCapable
    ? {
        image: imageUrl,
        prompt: buildShortPrompt(job),
        image_guidance_scale: 1.5,
        guidance_scale: 7.5,
      }
    : { img: imageUrl }

  const createBody = version
    ? { version, input }
    : { input }
  const createUrl = version
    ? 'https://api.replicate.com/v1/predictions'
    : `https://api.replicate.com/v1/models/${owner}/${name}/predictions`

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
    provider: 'replicate',
    providerPayload: { prediction_id: payload?.id, source: 'prediction' },
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
        : provider === 'replicate'
          ? await callReplicate({ job, prompt })
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

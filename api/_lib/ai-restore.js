import {
  createSignedUrl,
  deleteObject,
  downloadObject,
  getHumanRestoreBuckets,
  updateJob,
  uploadObject,
} from './supabase.js'
import {
  buildLegacyRequestedPipeline,
  findPipelineById,
  getDefaultPipeline,
  readPipelineConfig,
  summarizePipeline,
} from './restore-pipeline-config.js'

const defaultFalModel = 'fal-ai/image-editing/photo-restoration'
const defaultFalProcessingTimeoutMinutes = 60
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

function isTransientFalPollFailure(response, payload) {
  if (!response) {
    return false
  }

  if ([408, 425, 429, 500, 502, 503, 504].includes(response.status)) {
    return true
  }

  const status = String(payload?.status || '').toUpperCase()
  const errorType = String(payload?.error_type || payload?.errorType || '').toUpperCase()

  if (response.status === 404) {
    return ['IN_QUEUE', 'IN_PROGRESS', 'NOT_FOUND'].includes(status)
  }

  return errorType === 'TIMEOUT' || errorType === 'TEMPORARY_UNAVAILABLE'
}

function getFalErrorMessage(payload, fallback) {
  return (
    payload?.detail ||
    payload?.error?.message ||
    payload?.error ||
    payload?.message ||
    fallback
  )
}

function shouldReturnFalPending(error) {
  const message = String(error instanceof Error ? error.message : error || '')

  return [
    'Could not poll fal.ai.',
    'Could not fetch fal.ai result.',
    'fal.ai result did not include a restored image.',
    'Could not fetch restored image from provider.',
  ].some(fragment => message.includes(fragment))
}

function clampNumber(value, min, max, fallback) {
  const numericValue = Number(value)

  if (!Number.isFinite(numericValue)) {
    return fallback
  }

  return Math.min(max, Math.max(min, numericValue))
}

function getFalProcessingTimeoutMs() {
  return (
    clampNumber(
      process.env.FAL_RESTORE_MAX_PROCESSING_MINUTES,
      5,
      24 * 60,
      defaultFalProcessingTimeoutMinutes
    ) * 60 * 1000
  )
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

function inferImageExtension(contentType) {
  if (String(contentType || '').includes('jpeg')) {
    return 'jpg'
  }

  if (String(contentType || '').includes('webp')) {
    return 'webp'
  }

  return 'png'
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

async function submitFalRequest({ imageUrl, prompt }) {
  const falKey = process.env.FAL_KEY

  if (!falKey) {
    throw new Error('FAL_KEY is not configured.')
  }

  const model = normalizeFalModel(process.env.FAL_RESTORE_MODEL || defaultFalModel)
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
  const rawStatusUrl =
    payload?.status_url || payload?.statusUrl || payload?.urls?.status || ''
  const rawResultUrl =
    payload?.response_url ||
    payload?.responseUrl ||
    payload?.result_url ||
    payload?.resultUrl ||
    payload?.urls?.response ||
    ''

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

  const queuePayload = buildFalQueuePayload({
    model,
    queuedAt: new Date().toISOString(),
    requestId,
  })

  return {
    model,
    provider: 'fal',
    providerPayload: {
      ...queuePayload,
      raw_response_url: rawResultUrl || null,
      raw_status_url: rawStatusUrl || null,
    },
    requestId,
    resultUrl: rawResultUrl || queuePayload.response_url,
    statusUrl: rawStatusUrl || queuePayload.status_url,
  }
}

async function pollFalRequest({ model, requestId, responseUrl, statusUrl }) {
  const falKey = process.env.FAL_KEY

  if (!requestId) {
    throw new Error('fal.ai request id is required for polling.')
  }

  const normalizedModel = normalizeFalModel(model)
  const normalizedStatusUrl = buildFalQueueUrl({
    model: normalizedModel,
    requestId,
    type: 'status',
  })
  const normalizedResultUrl = buildFalQueueUrl({
    model: normalizedModel,
    requestId,
    type: 'response',
  })
  const rawResponseUrl = String(responseUrl || '').trim()
  const rawStatusUrl = String(statusUrl || '').trim()

  const statusResponse = await fetch(normalizedStatusUrl, {
    method: 'POST',
    headers: {
      Authorization: `Key ${falKey}`,
    },
  })
  const statusPayload = await statusResponse.json().catch(() => null)

  if (!statusResponse.ok) {
    if (isTransientFalPollFailure(statusResponse, statusPayload)) {
      return {
        model,
        provider: 'fal',
        requestId,
        status: 'pending',
      }
    }

    throw new Error(getFalErrorMessage(statusPayload, 'Could not poll fal.ai.'))
  }

  const status = String(statusPayload?.status || '').toUpperCase()

  if (status && status !== 'COMPLETED') {
    if (status.includes('FAIL')) {
      throw new Error(
        getFalErrorMessage(statusPayload, 'fal.ai restoration failed.')
      )
    }

    return {
      model,
      provider: 'fal',
      requestId,
      status: 'pending',
    }
  }

  const resultResponse = await fetch(normalizedResultUrl, {
    method: 'POST',
    headers: {
      Authorization: `Key ${falKey}`,
    },
  })
  const resultPayload = await resultResponse.json().catch(() => null)

  if (!resultResponse.ok) {
    if (isTransientFalPollFailure(resultResponse, resultPayload)) {
      return {
        model,
        provider: 'fal',
        requestId,
        status: 'pending',
      }
    }

    throw new Error(
      getFalErrorMessage(resultPayload, 'Could not fetch fal.ai result.')
    )
  }

  const restoredImageUrl = extractFalImageUrl(resultPayload)

  if (!restoredImageUrl) {
    throw new Error('fal.ai result did not include a restored image.')
  }

  const fetched = await fetchImageBuffer(restoredImageUrl)

  return {
    ...fetched,
    model: normalizedModel,
    provider: 'fal',
    providerPayload: {
      ...buildFalQueuePayload({ model: normalizedModel, requestId }),
      raw_response_url: rawResponseUrl || null,
      raw_status_url: rawStatusUrl || null,
      source: 'queue_result',
    },
    requestId,
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

async function callReplicate({ imageUrlOverride, job, modelPreset }) {
  const apiToken = process.env.REPLICATE_API_TOKEN

  if (!apiToken) {
    throw new Error('REPLICATE_API_TOKEN is not configured.')
  }

  const imageUrl =
    imageUrlOverride ||
    (await createSignedUrl({
      bucket: job.original_storage_bucket,
      expiresIn: 60 * 30,
      path: job.original_storage_path,
    }))
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

async function callFal({ imageUrlOverride, job, prompt }) {
  const imageUrl =
    imageUrlOverride ||
    (await createSignedUrl({
      bucket: job.original_storage_bucket,
      expiresIn: 60 * 30,
      path: job.original_storage_path,
    }))
  const queuedOrImmediate = await submitFalRequest({ imageUrl, prompt })

  if (queuedOrImmediate.buffer) {
    return queuedOrImmediate
  }

  const maxPolls = Number(process.env.FAL_RESTORE_MAX_POLLS) || 2
  const pollIntervalMs =
    Number(process.env.FAL_RESTORE_POLL_INTERVAL_MS) || 1000

  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    await wait(pollIntervalMs)

    let polled

    try {
      polled = await pollFalRequest({
        model: queuedOrImmediate.model,
        requestId: queuedOrImmediate.requestId,
        responseUrl: queuedOrImmediate.resultUrl,
        statusUrl: queuedOrImmediate.statusUrl,
      })
    } catch (error) {
      if (shouldReturnFalPending(error)) {
        if (job.ai_draft_storage_path || job.result_storage_path) {
          return settleExistingDraftForReview(job)
        }

        const pendingProviderPayload =
          queuedOrImmediate.providerPayload ||
          buildFalQueuePayload({
            model: queuedOrImmediate.model,
            requestId: queuedOrImmediate.requestId,
          })

        return {
          model: queuedOrImmediate.model,
          provider: 'fal',
          providerPayload: pendingProviderPayload,
          requestId: queuedOrImmediate.requestId,
          status: 'pending',
        }
      }

      throw error
    }

    if (polled.buffer) {
      return polled
    }
  }

  return {
    model: queuedOrImmediate.model,
    provider: 'fal',
    providerPayload:
      queuedOrImmediate.providerPayload || {
        request_id: queuedOrImmediate.requestId,
        response_url: queuedOrImmediate.resultUrl,
        status_url: queuedOrImmediate.statusUrl,
      },
    requestId: queuedOrImmediate.requestId,
    responseUrl: queuedOrImmediate.resultUrl,
    status: 'pending',
    statusUrl: queuedOrImmediate.statusUrl,
  }
}

function getPipelineSource(pipeline) {
  return pipeline?.id ? `pipeline:${pipeline.id}` : 'pipeline'
}

async function settleExistingDraftForReview(job) {
  return updateJob(job.id, {
    ai_draft_error: null,
    ai_error: null,
    status: 'needs_review',
  })
}

function getStageProvider(stage) {
  if (stage?.type === 'fal') {
    return 'fal'
  }

  if (stage?.type === 'openai') {
    return 'openai'
  }

  return 'replicate'
}

function getStageModelPreset(stage) {
  if (stage?.type === 'replicate_gfpgan') {
    return 'gfpgan'
  }

  if (stage?.type === 'replicate_codeformer') {
    return 'codeformer'
  }

  return ''
}

function getStageSource(stageType) {
  if (stageType === 'replicate_codeformer') {
    return 'replicate_codeformer'
  }

  if (stageType === 'replicate_gfpgan') {
    return 'replicate_gfpgan'
  }

  if (stageType === 'openai') {
    return 'openai'
  }

  if (stageType === 'fal') {
    return 'fal'
  }

  return ''
}

function getPipelineStageTypes(pipeline) {
  return Array.isArray(pipeline?.stages)
    ? pipeline.stages.map(stage => String(stage?.type || ''))
    : []
}

function isFalCodeformerPipeline(pipeline) {
  const stageTypes = getPipelineStageTypes(pipeline)

  return (
    stageTypes.length === 2 &&
    stageTypes[0] === 'fal' &&
    stageTypes[1] === 'replicate_codeformer'
  )
}

function getJobProviderPayload(job) {
  return job?.ai_provider_payload && typeof job.ai_provider_payload === 'object'
    ? job.ai_provider_payload
    : {}
}

function normalizePipelineStages(stages) {
  if (!Array.isArray(stages)) {
    return []
  }

  return stages
    .map((stage, index) => {
      const type = String(stage?.type || '').trim()

      if (!type) {
        return null
      }

      return {
        id: String(stage?.id || `${type}-${index + 1}`),
        type,
      }
    })
    .filter(Boolean)
}

function normalizePipelineTrace(trace) {
  if (!Array.isArray(trace)) {
    return []
  }

  return trace
    .map(item => {
      if (!item || typeof item !== 'object') {
        return null
      }

      return {
        model: String(item.model || ''),
        provider: String(item.provider || ''),
        providerPayload:
          item.providerPayload && typeof item.providerPayload === 'object'
            ? { ...item.providerPayload }
            : {},
        stageId: String(item.stageId || ''),
        stageType: String(item.stageType || ''),
      }
    })
    .filter(Boolean)
}

function normalizeTempInputs(tempInputs) {
  if (!Array.isArray(tempInputs)) {
    return []
  }

  const seen = new Set()

  return tempInputs
    .map(input => {
      if (!input || typeof input !== 'object') {
        return null
      }

      const bucket = String(input.bucket || '').trim()
      const path = String(input.path || '').trim()

      if (!bucket || !path) {
        return null
      }

      const key = `${bucket}/${path}`

      if (seen.has(key)) {
        return null
      }

      seen.add(key)

      return { bucket, path }
    })
    .filter(Boolean)
}

function getStoredPipelineRuntime(job) {
  const payload = getJobProviderPayload(job)
  const runtime = payload.pipeline_runtime

  if (!runtime || typeof runtime !== 'object') {
    return null
  }

  return {
    currentStageIndex: Math.max(0, Number(runtime.currentStageIndex) || 0),
    pipelineId: String(runtime.pipelineId || ''),
    pipelineName: String(runtime.pipelineName || ''),
    stages: normalizePipelineStages(runtime.stages),
    startedAt: String(runtime.startedAt || ''),
    tempInputs: normalizeTempInputs(runtime.tempInputs),
    trace: normalizePipelineTrace(runtime.trace),
    updatedAt: String(runtime.updatedAt || ''),
  }
}

function buildPipelineFromRuntime(runtime) {
  if (!runtime?.stages?.length) {
    return null
  }

  return {
    enabled: true,
    id: runtime.pipelineId || 'saved-pipeline',
    name: runtime.pipelineName || 'Saved pipeline',
    stages: normalizePipelineStages(runtime.stages),
  }
}

function buildLegacyResumePipeline(job) {
  const payload = getJobProviderPayload(job)
  const pipelineStages = Array.isArray(payload.pipeline)
    ? payload.pipeline
        .map((stageType, index) => {
          const type = String(stageType || '').trim()

          if (!type) {
            return null
          }

          return {
            id: `${type}-${index + 1}`,
            type,
          }
        })
        .filter(Boolean)
    : []

  if (pipelineStages.length) {
    return {
      enabled: true,
      id: String(payload.pipeline_id || 'legacy-pipeline'),
      name: String(payload.pipeline_name || 'Saved pipeline'),
      stages: pipelineStages,
    }
  }

  const source = String(job?.ai_draft_source || '').trim().toLowerCase()

  if (source === 'fal_codeformer') {
    return {
      enabled: true,
      id: 'legacy-fal-codeformer',
      name: 'fal + CodeFormer',
      stages: [
        { id: 'fal-1', type: 'fal' },
        { id: 'replicate-codeformer-2', type: 'replicate_codeformer' },
      ],
    }
  }

  if (source.startsWith('replicate_')) {
    return buildLegacyRequestedPipeline({
      modelPreset: source.slice('replicate_'.length),
      provider: 'replicate',
    })
  }

  return buildLegacyRequestedPipeline({ provider: job?.ai_provider })
}

function buildPipelineRuntime({
  currentStageIndex,
  existingRuntime,
  pipeline,
  tempInputs,
  trace,
}) {
  return {
    currentStageIndex: Math.max(0, Number(currentStageIndex) || 0),
    pipelineId: String(pipeline?.id || existingRuntime?.pipelineId || ''),
    pipelineName: summarizePipeline(pipeline) || existingRuntime?.pipelineName || '',
    stages: normalizePipelineStages(pipeline?.stages || existingRuntime?.stages),
    startedAt:
      existingRuntime?.startedAt ||
      new Date().toISOString(),
    tempInputs:
      tempInputs !== undefined
        ? normalizeTempInputs(tempInputs)
        : normalizeTempInputs(existingRuntime?.tempInputs),
    trace:
      trace !== undefined
        ? normalizePipelineTrace(trace)
        : normalizePipelineTrace(existingRuntime?.trace),
    updatedAt: new Date().toISOString(),
  }
}

function buildTraceEntry({ result, stage }) {
  return {
    model: String(result?.model || ''),
    provider: String(result?.provider || ''),
    providerPayload:
      result?.providerPayload && typeof result.providerPayload === 'object'
        ? { ...result.providerPayload }
        : {},
    stageId: String(stage?.id || ''),
    stageType: String(stage?.type || ''),
  }
}

function createRuntimeAwareProviderPayload({ job, provider, providerPayload, runtime }) {
  const mergedPayload =
    provider === 'fal'
      ? mergeFalProviderPayload(job?.ai_provider_payload, providerPayload || {})
      : providerPayload && typeof providerPayload === 'object'
        ? { ...providerPayload }
        : {}

  return {
    ...mergedPayload,
    pipeline: runtime.stages.map(stage => stage.type),
    pipeline_id: runtime.pipelineId || null,
    pipeline_name: runtime.pipelineName || '',
    pipeline_runtime: runtime,
  }
}

async function ensureStageInputBuffer(input) {
  if (input?.buffer) {
    return input
  }

  if (input?.storage?.bucket && input?.storage?.path) {
    const downloaded = await downloadObject({
      bucket: input.storage.bucket,
      path: input.storage.path,
    })

    return {
      ...input,
      buffer: downloaded.buffer,
      contentType: input.contentType || downloaded.contentType,
    }
  }

  throw new Error('No input image available for the pipeline stage.')
}

async function createStageInputAsset({ contentType, imageBuffer, job, stage }) {
  const buckets = getHumanRestoreBuckets()
  const extension = inferImageExtension(contentType)
  const path = `${
    job.submission_reference
  }/pipeline-input-${stage.id}-${Date.now()}.${extension}`
  const bucket = buckets.results

  await uploadObject({
    bucket,
    contentType: contentType || 'image/png',
    data: imageBuffer,
    path,
  })

  return {
    bucket,
    path,
    signedUrl: await createSignedUrl({
      bucket,
      expiresIn: stage?.type === 'fal' ? 24 * 60 * 60 : 60 * 30,
      path,
    }),
  }
}

async function resolveStageInputUrl({ input, job, stage }) {
  if (input?.storage?.bucket && input?.storage?.path) {
    return {
      signedUrl: await createSignedUrl({
        bucket: input.storage.bucket,
        expiresIn: stage?.type === 'fal' ? 24 * 60 * 60 : 60 * 30,
        path: input.storage.path,
      }),
      tempStorage: null,
    }
  }

  const resolvedInput = await ensureStageInputBuffer(input)
  const uploaded = await createStageInputAsset({
    contentType: resolvedInput.contentType,
    imageBuffer: resolvedInput.buffer,
    job,
    stage,
  })

  return {
    signedUrl: uploaded.signedUrl,
    tempStorage: {
      bucket: uploaded.bucket,
      path: uploaded.path,
    },
  }
}

async function cleanupPipelineTempInputs(tempInputs) {
  const normalizedInputs = normalizeTempInputs(tempInputs)

  await Promise.all(
    normalizedInputs.map(input =>
      deleteObject({ bucket: input.bucket, path: input.path }).catch(() => null)
    )
  )
}

async function runPipelineStage({ input, isResume, job, prompt, stage }) {
  if (stage?.type === 'fal' && isResume) {
    const falResumePayload = getFalResumePayload(job)

    try {
      const polled = await pollFalRequest({
        model: falResumePayload.model,
        requestId: falResumePayload.requestId,
        responseUrl: falResumePayload.rawResponseUrl,
        statusUrl: falResumePayload.rawStatusUrl,
      })

      if (polled.status === 'pending') {
        return {
          ...polled,
          providerPayload: falResumePayload.providerPayload,
          requestId: falResumePayload.requestId,
        }
      }

      return polled
    } catch (error) {
      if (shouldReturnFalPending(error)) {
        return {
          model: falResumePayload.model,
          provider: 'fal',
          providerPayload: falResumePayload.providerPayload,
          requestId: falResumePayload.requestId,
          status: 'pending',
        }
      }

      throw error
    }
  }

  if (stage?.type === 'openai') {
    const resolvedInput = await ensureStageInputBuffer(input)

    return callOpenAI({
      imageBuffer: resolvedInput.buffer,
      imageContentType: resolvedInput.contentType,
      job,
      prompt,
    })
  }

  if (
    stage?.type === 'replicate_codeformer' ||
    stage?.type === 'replicate_gfpgan'
  ) {
    const { signedUrl, tempStorage } = await resolveStageInputUrl({
      input,
      job,
      stage,
    })

    try {
      return await callReplicate({
        imageUrlOverride: signedUrl,
        job,
        modelPreset: getStageModelPreset(stage),
      })
    } finally {
      if (tempStorage) {
        await deleteObject({
          bucket: tempStorage.bucket,
          path: tempStorage.path,
        }).catch(() => null)
      }
    }
  }

  if (stage?.type === 'fal') {
    const { signedUrl, tempStorage } = await resolveStageInputUrl({
      input,
      job,
      stage,
    })

    try {
      const result = await callFal({
        imageUrlOverride: signedUrl,
        job,
        prompt,
      })

      if (result.status === 'pending') {
        return {
          ...result,
          pendingInputStorage: tempStorage,
        }
      }

      if (tempStorage) {
        await deleteObject({
          bucket: tempStorage.bucket,
          path: tempStorage.path,
        }).catch(() => null)
      }

      return result
    } catch (error) {
      if (tempStorage) {
        await deleteObject({
          bucket: tempStorage.bucket,
          path: tempStorage.path,
        }).catch(() => null)
      }

      throw error
    }
  }

  throw new Error(`Unsupported pipeline stage: ${stage?.type || 'unknown'}`)
}

function buildFinalPipelineProviderPayload({
  completedStage,
  error,
  pipeline,
  result,
  runtime,
}) {
  const pipelineMetadata = {
    pipeline: runtime.stages.map(stage => stage.type),
    pipeline_id: runtime.pipelineId || null,
    pipeline_name: runtime.pipelineName || summarizePipeline(pipeline),
    pipeline_runtime: runtime,
    pipeline_trace: runtime.trace,
  }

  if (isFalCodeformerPipeline(pipeline)) {
    const falTrace = runtime.trace.find(item => item.stageType === 'fal')
    const codeformerTrace = runtime.trace.find(
      item => item.stageType === 'replicate_codeformer'
    )

    if (completedStage?.type === 'replicate_codeformer' && !error) {
      return {
        ...pipelineMetadata,
        codeformer: codeformerTrace?.providerPayload || result.providerPayload || {},
        fal: falTrace?.providerPayload || {},
      }
    }

    if (completedStage?.type === 'fal') {
      return {
        ...pipelineMetadata,
        codeformer_error:
          error instanceof Error
            ? error.message
            : error
              ? String(error)
              : null,
        fal: falTrace?.providerPayload || result.providerPayload || {},
        pipeline: ['fal'],
      }
    }
  }

  return {
    ...(result.providerPayload && typeof result.providerPayload === 'object'
      ? result.providerPayload
      : {}),
    ...pipelineMetadata,
    pipeline_error:
      error instanceof Error
        ? error.message
        : error
          ? String(error)
          : null,
  }
}

function buildPipelineResult({ completedStage, error, pipeline, result, runtime }) {
  const modelTrace = runtime.trace
    .map(item => item.model)
    .filter(Boolean)

  let provider = result.provider
  let source =
    getStageSource(completedStage?.type || '') || getPipelineSource(pipeline)

  if (isFalCodeformerPipeline(pipeline)) {
    if (completedStage?.type === 'replicate_codeformer' && !error) {
      provider = 'fal'
      source = 'fal_codeformer'
    } else if (completedStage?.type === 'fal') {
      provider = 'fal'
      source = 'fal'
    }
  }

  return {
    ...result,
    model: modelTrace.length ? modelTrace.join(' -> ') : result.model,
    provider,
    providerPayload: buildFinalPipelineProviderPayload({
      completedStage,
      error,
      pipeline,
      result,
      runtime,
    }),
    source,
  }
}

async function finalizePipelineResult({
  completedStage,
  error,
  job,
  pipeline,
  prompt,
  result,
  runtime,
}) {
  const finalizedResult = buildPipelineResult({
    completedStage,
    error,
    pipeline,
    result,
    runtime,
  })
  const updatedJob = await finishJobWithResult({
    job,
    prompt,
    result: finalizedResult,
  })

  await cleanupPipelineTempInputs(runtime.tempInputs)

  return updatedJob
}

async function markPipelinePending({
  currentStage,
  job,
  pendingResult,
  pipeline,
  prompt,
  runtime,
}) {
  return updateJob(job.id, {
    ai_draft_error: null,
    ai_draft_model: pendingResult.model,
    ai_draft_prompt: prompt,
    ai_draft_provider: pendingResult.provider,
    ai_draft_source:
      pendingResult.source ||
      getStageSource(currentStage?.type || '') ||
      getPipelineSource(pipeline),
    ai_error: null,
    ai_provider: pendingResult.provider,
    ai_provider_payload: createRuntimeAwareProviderPayload({
      job,
      provider: pendingResult.provider,
      providerPayload: pendingResult.providerPayload,
      runtime,
    }),
    ai_request_id: pendingResult.requestId,
    result_model: pendingResult.model,
    result_prompt: prompt,
    status: 'processing',
  })
}

async function runConfiguredPipeline({ job, pipeline, prompt }) {
  const storedRuntime = getStoredPipelineRuntime(job)
  const isResuming = Boolean(
    job.status === 'processing' && job.ai_request_id && pipeline?.stages?.length
  )
  const startingStageIndex = isResuming
    ? Math.max(0, Number(storedRuntime?.currentStageIndex) || 0)
    : 0
  let runtime = buildPipelineRuntime({
    currentStageIndex: startingStageIndex,
    existingRuntime: storedRuntime,
    pipeline,
  })
  let input =
    startingStageIndex === 0
      ? {
          contentType: job.original_file_type || '',
          storage: {
            bucket: job.original_storage_bucket,
            path: job.original_storage_path,
          },
        }
      : null
  let lastSuccessfulResult = null
  let lastSuccessfulStage = null

  for (
    let stageIndex = startingStageIndex;
    stageIndex < pipeline.stages.length;
    stageIndex += 1
  ) {
    const stage = pipeline.stages[stageIndex]
    const isResumeStage =
      isResuming && stageIndex === startingStageIndex && stage?.type === 'fal'

    try {
      const stageResult = await runPipelineStage({
        input,
        isResume: isResumeStage,
        job,
        prompt,
        stage,
      })

      if (stageResult.status === 'pending') {
        if (job.ai_draft_storage_path || job.result_storage_path) {
          await cleanupPipelineTempInputs(runtime.tempInputs)
          return settleExistingDraftForReview(job)
        }

        const nextTempInputs = normalizeTempInputs([
          ...runtime.tempInputs,
          stageResult.pendingInputStorage,
        ])
        const pendingRuntime = buildPipelineRuntime({
          currentStageIndex: stageIndex,
          existingRuntime: runtime,
          pipeline,
          tempInputs: nextTempInputs,
        })

        if (
          stage?.type === 'fal' &&
          shouldMoveFalJobToManualReview({
            job,
            falResumePayload: {
              providerPayload: stageResult.providerPayload,
            },
          })
        ) {
          const movedJob = await moveFalJobToManualReview({
            job,
            falResumePayload: {
              providerPayload: stageResult.providerPayload,
            },
            runtime: pendingRuntime,
          })

          await cleanupPipelineTempInputs(nextTempInputs)

          return movedJob
        }

        return markPipelinePending({
          currentStage: stage,
          job,
          pendingResult: stageResult,
          pipeline,
          prompt,
          runtime: pendingRuntime,
        })
      }

      const nextTrace = [...runtime.trace, buildTraceEntry({ result: stageResult, stage })]

      runtime = buildPipelineRuntime({
        currentStageIndex: stageIndex + 1,
        existingRuntime: runtime,
        pipeline,
        trace: nextTrace,
      })
      lastSuccessfulResult = stageResult
      lastSuccessfulStage = stage
      input = {
        buffer: stageResult.buffer,
        contentType: stageResult.contentType,
      }
    } catch (error) {
      if (lastSuccessfulResult) {
        return finalizePipelineResult({
          completedStage: lastSuccessfulStage,
          error,
          job,
          pipeline,
          prompt,
          result: lastSuccessfulResult,
          runtime,
        })
      }

      await cleanupPipelineTempInputs(runtime.tempInputs)
      throw error
    }
  }

  if (!lastSuccessfulResult) {
    throw new Error('Restore pipeline did not produce any result.')
  }

  return finalizePipelineResult({
    completedStage: lastSuccessfulStage,
    job,
    pipeline,
    prompt,
    result: lastSuccessfulResult,
    runtime,
  })
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
      result.source ||
      (result.modelPreset && result.provider === 'replicate'
        ? `replicate_${result.modelPreset}`
        : result.provider),
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

function normalizeFalModel(model) {
  const normalized = String(model || '')
    .split('->')[0]
    .trim()

  if (normalized.startsWith('fal-ai/')) {
    return normalized
  }

  return process.env.FAL_RESTORE_MODEL || defaultFalModel
}

function buildFalQueueUrl({ model, requestId, type }) {
  const normalizedModel = normalizeFalModel(model)
  const normalizedType = type === 'status' ? 'status' : 'response'

  return `https://queue.fal.run/${normalizedModel}/requests/${requestId}/${normalizedType}`
}

function buildFalQueuePayload({ model, queuedAt, requestId }) {
  const normalizedModel = normalizeFalModel(model)

  return {
    model: normalizedModel,
    queued_at: queuedAt || null,
    request_id: requestId,
    response_url: buildFalQueueUrl({
      model: normalizedModel,
      requestId,
      type: 'response',
    }),
    status_url: buildFalQueueUrl({
      model: normalizedModel,
      requestId,
      type: 'status',
    }),
  }
}

function mergeFalProviderPayload(existingPayload, falPayload) {
  const basePayload =
    existingPayload && typeof existingPayload === 'object' ? { ...existingPayload } : {}

  if (basePayload.fal && typeof basePayload.fal === 'object') {
    return {
      ...basePayload,
      fal: {
        ...basePayload.fal,
        ...falPayload,
      },
    }
  }

  return {
    ...basePayload,
    fal: falPayload,
  }
}

function getFalResumePayload(job) {
  const topLevelPayload =
    job?.ai_provider_payload && typeof job.ai_provider_payload === 'object'
      ? job.ai_provider_payload
      : {}
  const nestedFalPayload =
    topLevelPayload.fal && typeof topLevelPayload.fal === 'object'
      ? topLevelPayload.fal
      : {}
  const rawFalPayload =
    nestedFalPayload.request_id || nestedFalPayload.response_url || nestedFalPayload.status_url
      ? nestedFalPayload
      : topLevelPayload
  const requestId = rawFalPayload.request_id || rawFalPayload.requestId || job?.ai_request_id
  const model =
    rawFalPayload.model ||
    job?.ai_draft_model ||
    job?.result_model ||
    process.env.FAL_RESTORE_MODEL ||
    defaultFalModel
  const canonicalPayload = buildFalQueuePayload({
    model,
    queuedAt: rawFalPayload.queued_at || rawFalPayload.queuedAt || job?.created_at,
    requestId,
  })
  const rawResponseUrl =
    rawFalPayload.raw_response_url || rawFalPayload.response_url || null
  const rawStatusUrl =
    rawFalPayload.raw_status_url || rawFalPayload.status_url || null

  return {
    model: normalizeFalModel(model),
    providerPayload: {
      ...canonicalPayload,
      raw_response_url: rawResponseUrl,
      raw_status_url: rawStatusUrl,
    },
    requestId,
    rawResponseUrl,
    rawStatusUrl,
  }
}

function shouldMoveFalJobToManualReview({ job, falResumePayload }) {
  if (!job || job.ai_draft_storage_path || job.result_storage_path) {
    return false
  }

  const queuedAt =
    falResumePayload?.providerPayload?.queued_at ||
    falResumePayload?.providerPayload?.queuedAt ||
    job?.created_at ||
    ''
  const queuedAtMs = Date.parse(String(queuedAt || ''))

  if (!Number.isFinite(queuedAtMs)) {
    return false
  }

  return Date.now() - queuedAtMs >= getFalProcessingTimeoutMs()
}

async function moveFalJobToManualReview({ job, falResumePayload, runtime }) {
  const timeoutMinutes = Math.round(getFalProcessingTimeoutMs() / 60000)

  return updateJob(job.id, {
    ai_draft_error: null,
    ai_error: `fal.ai processing did not finish within ${timeoutMinutes} minutes. Moved to manual review.`,
    ai_provider_payload: createRuntimeAwareProviderPayload({
      job,
      provider: 'fal',
      providerPayload: falResumePayload.providerPayload,
      runtime:
        runtime ||
        buildPipelineRuntime({
          currentStageIndex: 0,
          existingRuntime: getStoredPipelineRuntime(job),
          pipeline:
            buildPipelineFromRuntime(getStoredPipelineRuntime(job)) ||
            buildLegacyResumePipeline(job) || {
              enabled: true,
              id: 'legacy-fal',
              name: 'fal',
              stages: [{ id: 'fal-1', type: 'fal' }],
            },
        }),
    }),
    status: 'manual_review',
  })
}

export async function runRestoreJob({
  job,
  pipelineId: requestedPipelineId,
  provider: requestedProvider,
  modelPreset: requestedModelPreset,
}) {
  const prompt = buildRestorePrompt(job)
  const pipelineConfig = await readPipelineConfig()
  const requestedPipeline = requestedPipelineId
    ? findPipelineById(pipelineConfig, requestedPipelineId)
    : null

  if (requestedPipelineId && !requestedPipeline) {
    throw new Error('Requested restore pipeline was not found.')
  }

  const pipeline =
    requestedPipeline ||
    buildLegacyRequestedPipeline({
      modelPreset: requestedModelPreset,
      provider: requestedProvider,
    }) ||
    (job.status === 'processing'
      ? buildPipelineFromRuntime(getStoredPipelineRuntime(job)) ||
        buildLegacyResumePipeline(job)
      : null) ||
    getDefaultPipeline(pipelineConfig)

  if (!pipeline?.stages?.length) {
    throw new Error('No AI restore pipeline is configured.')
  }

  let currentJob = job

  if (
    job.status !== 'processing' ||
    requestedPipeline ||
    requestedProvider ||
    requestedModelPreset
  ) {
    const firstStage = pipeline.stages[0]
    const initialRuntime = buildPipelineRuntime({
      currentStageIndex: 0,
      pipeline,
    })

    currentJob = await updateJob(job.id, {
      ai_draft_error: null,
      ai_draft_provider: getStageProvider(firstStage),
      ai_draft_source: getPipelineSource(pipeline),
      ai_error: null,
      ai_provider: getStageProvider(firstStage),
      ai_provider_payload: {
        pipeline: initialRuntime.stages.map(stage => stage.type),
        pipeline_id: initialRuntime.pipelineId || null,
        pipeline_name: initialRuntime.pipelineName || '',
        pipeline_runtime: initialRuntime,
      },
      ai_request_id: null,
      status: 'processing',
    })
  }

  try {
    return await runConfiguredPipeline({
      job: currentJob,
      pipeline,
      prompt,
    })
  } catch (error) {
    return updateJob(currentJob.id, {
      ai_draft_error:
        error instanceof Error ? error.message : 'AI restore failed.',
      ai_error: error instanceof Error ? error.message : 'AI restore failed.',
      status: 'ai_failed',
    })
  }
}

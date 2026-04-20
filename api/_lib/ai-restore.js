import {
  createSignedUrl,
  deleteObject,
  downloadObject,
  getHumanRestoreBuckets,
  insertEvent,
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
import {
  analyzeRestorationImage,
  applyReplicateEnhancementBlend,
  applyVintageRestoreFinish,
  buildAdaptiveCodeformerVariants,
  deriveAdaptiveFinishParams,
  evaluateStageConditions,
  finalizeRestoredDeliveryImage,
  scoreAdaptiveCodeformerCandidate,
  selectAdaptiveCodeformerProfile,
  summarizeRestorationAnalysis,
} from './restore-stage-processing.js'

const defaultFalModel = 'fal-ai/image-editing/photo-restoration'
const defaultFalProcessingTimeoutMinutes = 60
const defaultOpenAIImageModel = 'gpt-image-1.5'
const defaultReplicateCodeformerModel = 'lucataco/codeformer'
const defaultReplicateGfpganModel =
  'tencentarc/gfpgan:0fbacf7afc6c144e5be9767cff80f25aff23e52b0708f17e20f9879b2f21516c'
const defaultReplicateOldPhotoRestorationModel =
  'microsoft/bringing-old-photos-back-to-life'
const defaultReplicatePreset = 'codeformer'
const defaultDeliveryExportParams = {
  export_format: 'png',
  jpeg_quality: 97,
  preserve_metadata: true,
  preserve_original_dimensions: true,
  resize_kernel: 'lanczos3',
  webp_quality: 96,
}

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

  return ['codeformer', 'gfpgan', 'old_photo_restoration'].includes(normalized)
    ? normalized
    : ''
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
  const errorType = String(
    payload?.error_type || payload?.errorType || ''
  ).toUpperCase()

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
    ) *
    60 *
    1000
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

async function callOpenAI({
  imageBuffer,
  imageContentType,
  job,
  prompt,
  stageParams,
}) {
  const apiKey = process.env.OPENAI_API_KEY
  const params =
    stageParams && typeof stageParams === 'object' ? stageParams : {}
  const model =
    params.model ||
    process.env.OPENAI_IMAGE_EDIT_MODEL ||
    defaultOpenAIImageModel

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured.')
  }

  const formData = new FormData()
  const imageBlob = new Blob([imageBuffer], {
    type: imageContentType || 'image/png',
  })

  formData.append('model', model)
  formData.append('image', imageBlob, job.original_file_name || 'photo.png')
  formData.append('prompt', prompt)

  if (params.size || process.env.OPENAI_IMAGE_SIZE) {
    formData.append('size', params.size || process.env.OPENAI_IMAGE_SIZE)
  }

  if (params.quality || process.env.OPENAI_IMAGE_QUALITY) {
    formData.append(
      'quality',
      params.quality || process.env.OPENAI_IMAGE_QUALITY
    )
  }

  if (params.output_format || process.env.OPENAI_IMAGE_OUTPUT_FORMAT) {
    formData.append(
      'output_format',
      params.output_format || process.env.OPENAI_IMAGE_OUTPUT_FORMAT
    )
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
      model,
      provider: 'openai',
      providerPayload: { source: 'b64_json' },
    }
  }

  const imageUrl = firstImage?.url

  if (imageUrl) {
    const fetched = await fetchImageBuffer(imageUrl)

    return {
      ...fetched,
      model,
      provider: 'openai',
      providerPayload: { source: 'url' },
    }
  }

  throw new Error('OpenAI did not return a restored image.')
}

async function recordFalSubmission({
  job,
  model,
  requestId,
  source,
  triggeredBy,
}) {
  // This runs immediately after a billable POST to queue.fal.run has
  // succeeded. Emit both a structured log (for Vercel Logs grep) and a
  // persistent event row (for billing reconciliation / daily double-charge
  // alerts). Failures here must never fail the restore itself.
  const logLine = {
    event: 'fal_submit',
    job_id: job?.id || null,
    model,
    request_id: requestId,
    source: source || 'queued',
    timestamp: new Date().toISOString(),
    triggered_by: triggeredBy || 'unknown',
  }

  try {
    console.log(JSON.stringify(logLine))
  } catch {
    // Logging must never break the restore flow.
  }

  if (!job?.id) {
    return
  }

  await insertEvent(job.id, 'fal_submitted', {
    model,
    request_id: requestId,
    source: source || 'queued',
    triggered_by: triggeredBy || 'unknown',
  }).catch(() => null)
}

async function submitFalRequest({
  imageUrl,
  job,
  prompt,
  stageParams,
  triggeredBy,
}) {
  const falKey = process.env.FAL_KEY
  const params =
    stageParams && typeof stageParams === 'object' ? stageParams : {}

  if (!falKey) {
    throw new Error('FAL_KEY is not configured.')
  }

  const model = normalizeFalModel(
    params.model || process.env.FAL_RESTORE_MODEL || defaultFalModel
  )
  const input = {
    guidance_scale:
      Number(params.guidance_scale) ||
      Number(process.env.FAL_RESTORE_GUIDANCE_SCALE) ||
      3.5,
    image_url: imageUrl,
    num_inference_steps:
      Number(params.num_inference_steps) ||
      Number(process.env.FAL_RESTORE_NUM_INFERENCE_STEPS) ||
      30,
    output_format:
      params.output_format || process.env.FAL_RESTORE_OUTPUT_FORMAT || 'png',
    safety_tolerance:
      params.safety_tolerance ||
      process.env.FAL_RESTORE_SAFETY_TOLERANCE ||
      '2',
  }

  const includePrompt =
    params.include_prompt !== undefined
      ? params.include_prompt === true ||
        String(params.include_prompt).toLowerCase() === 'true'
      : process.env.FAL_RESTORE_INCLUDE_PROMPT === 'true'

  if (includePrompt) {
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
      await recordFalSubmission({
        job,
        model,
        requestId: null,
        source: 'immediate',
        triggeredBy,
      })

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

  await recordFalSubmission({
    job,
    model,
    requestId,
    source: 'queued',
    triggeredBy,
  })

  const queuePayload = buildFalQueuePayload({
    model,
    queuedAt: new Date().toISOString(),
    requestId,
  })
  const statusUrl = getPreferredFalQueueUrl(
    rawStatusUrl,
    queuePayload.status_url,
    'status'
  )
  const resultUrl = getPreferredFalQueueUrl(
    rawResultUrl,
    queuePayload.response_url,
    'response'
  )

  return {
    model,
    provider: 'fal',
    providerPayload: {
      ...queuePayload,
      response_url: resultUrl,
      status_url: statusUrl,
      raw_response_url: rawResultUrl || null,
      raw_status_url: rawStatusUrl || null,
    },
    requestId,
    resultUrl,
    statusUrl,
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
  const statusEndpoint = getPreferredFalQueueUrl(
    rawStatusUrl,
    normalizedStatusUrl,
    'status'
  )
  const resultEndpoint = getPreferredFalQueueUrl(
    rawResponseUrl,
    normalizedResultUrl,
    'response'
  )

  const statusResponse = await fetch(statusEndpoint, {
    method: 'GET',
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

  const resultResponse = await fetch(resultEndpoint, {
    method: 'GET',
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

function buildReplicateRequest({
  analysis,
  imageUrl,
  modelPreset,
  stageParams,
}) {
  const params =
    stageParams && typeof stageParams === 'object' ? stageParams : {}
  const preset =
    normalizeModelPreset(modelPreset) || getDefaultReplicatePreset()

  if (preset === 'gfpgan') {
    return {
      input: {
        img: imageUrl,
        scale: clampNumber(
          params.scale ?? process.env.REPLICATE_GFPGAN_SCALE,
          1,
          10,
          2
        ),
        version:
          params.version || process.env.REPLICATE_GFPGAN_VERSION || 'v1.4',
      },
      model:
        params.model ||
        process.env.REPLICATE_GFPGAN_MODEL ||
        process.env.REPLICATE_RESTORE_MODEL ||
        defaultReplicateGfpganModel,
      preset,
    }
  }

  if (preset === 'old_photo_restoration') {
    const autoHrEnabled =
      params.auto_hr !== false &&
      String(params.auto_hr || '').toLowerCase() !== 'false'
    const autoScratchEnabled =
      params.auto_scratch_detection !== false &&
      String(params.auto_scratch_detection || '').toLowerCase() !== 'false'
    const hrThresholdWidth = clampNumber(
      params.hr_min_width ?? process.env.REPLICATE_OLD_PHOTO_HR_MIN_WIDTH,
      640,
      6000,
      1100
    )
    const scratchDamageThreshold = clampNumber(
      params.scratch_damage_threshold ??
        process.env.REPLICATE_OLD_PHOTO_SCRATCH_DAMAGE_THRESHOLD,
      0,
      1,
      0.07
    )
    const scratchNeedThreshold = clampNumber(
      params.scratch_restore_need_threshold ??
        process.env.REPLICATE_OLD_PHOTO_SCRATCH_NEED_THRESHOLD,
      0,
      1,
      0.36
    )
    const resolvedHr =
      typeof params.HR === 'boolean'
        ? params.HR
        : typeof params.hr === 'boolean'
        ? params.hr
        : autoHrEnabled
        ? Number(analysis?.width || 0) >= hrThresholdWidth
        : false
    const resolvedScratch =
      typeof params.with_scratch === 'boolean'
        ? params.with_scratch
        : autoScratchEnabled
        ? Number(analysis?.damage_score || 0) >= scratchDamageThreshold ||
          Number(analysis?.restore_need_score || 0) >= scratchNeedThreshold
        : false

    return {
      input: {
        HR: resolvedHr,
        image: imageUrl,
        with_scratch: resolvedScratch,
      },
      model:
        params.model ||
        process.env.REPLICATE_OLD_PHOTO_MODEL ||
        defaultReplicateOldPhotoRestorationModel,
      preset,
    }
  }

  return {
    input: {
      background_enhance:
        params.background_enhance !== undefined
          ? params.background_enhance !== false &&
            String(params.background_enhance).toLowerCase() !== 'false'
          : process.env.REPLICATE_CODEFORMER_BACKGROUND_ENHANCE !== 'false',
      codeformer_fidelity: clampNumber(
        params.codeformer_fidelity ?? process.env.REPLICATE_CODEFORMER_FIDELITY,
        0,
        1,
        0.7
      ),
      face_upsample:
        params.face_upsample !== undefined
          ? params.face_upsample !== false &&
            String(params.face_upsample).toLowerCase() !== 'false'
          : process.env.REPLICATE_CODEFORMER_FACE_UPSAMPLE !== 'false',
      image: imageUrl,
      upscale: clampNumber(
        params.upscale ?? process.env.REPLICATE_CODEFORMER_UPSCALE,
        1,
        4,
        2
      ),
    },
    model:
      params.model ||
      process.env.REPLICATE_CODEFORMER_MODEL ||
      defaultReplicateCodeformerModel,
    preset: 'codeformer',
  }
}

function getReplicatePollingStrategy({ modelPreset, stageParams }) {
  const params =
    stageParams && typeof stageParams === 'object' ? stageParams : {}
  const preset =
    normalizeModelPreset(modelPreset) || getDefaultReplicatePreset()
  // old_photo_restoration (microsoft/bringing-old-photos-back-to-life) has
  // cold starts of 20–120s and HR=true runs of 1–5 min. On Vercel's 60s
  // maxDuration budget, we can only afford ~10s of polling. If the model is
  // hot and the input is simple it will finish in time; otherwise we throw
  // and the pipeline falls through to the next restoration stage (CodeFormer).
  const defaultMaxPolls = preset === 'old_photo_restoration' ? 1 : 18
  const defaultPollIntervalMs = 2000

  return {
    maxPolls: Math.max(
      1,
      Math.round(
        clampNumber(
          params.max_polls ?? params.replicate_max_polls,
          1,
          120,
          defaultMaxPolls
        )
      )
    ),
    pollIntervalMs: Math.max(
      250,
      Math.round(
        clampNumber(
          params.poll_interval_ms ?? params.replicate_poll_interval_ms,
          250,
          10000,
          defaultPollIntervalMs
        )
      )
    ),
  }
}

async function resolveReplicateModelVersion({ apiToken, model }) {
  const [owner, rest] = String(model || '').split('/')
  const [name, version] = String(rest || '').split(':')

  if (!owner || !name) {
    throw new Error(
      'Replicate model must be formatted as owner/name[:version].'
    )
  }

  if (version) {
    return {
      model: `${owner}/${name}`,
      owner,
      version,
    }
  }

  const response = await fetch(
    `https://api.replicate.com/v1/models/${owner}/${name}`,
    {
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
    }
  )
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

async function callReplicate({
  analysis,
  imageUrlOverride,
  job,
  modelPreset,
  stageParams,
}) {
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
  const request = buildReplicateRequest({
    analysis,
    imageUrl,
    modelPreset,
    stageParams,
  })
  const model = request.model
  const resolvedModel = await resolveReplicateModelVersion({
    apiToken,
    model,
  })
  const input = request.input
  const createBody = { version: resolvedModel.version, input }
  const createUrl = 'https://api.replicate.com/v1/predictions'

  // Never use `Prefer: wait`. It blocks the HTTP connection until the
  // prediction completes (up to ~60s), which on Vercel Hobby's 60s
  // maxDuration leaves zero margin for the rest of the pipeline. Instead
  // we fire-and-forget the creation request (returns instantly) and poll
  // with tight budgets defined in getReplicatePollingStrategy.
  const createHeaders = {
    Authorization: `Bearer ${apiToken}`,
    'Content-Type': 'application/json',
  }

  let createResponse = await fetch(createUrl, {
    method: 'POST',
    headers: createHeaders,
    body: JSON.stringify(createBody),
  })
  let payload = await createResponse.json().catch(() => null)

  // Retry once on 429 throttle. When the Replicate account balance is
  // below $5, burst drops to 1 and a preceding stage (e.g. old_photo)
  // can exhaust it. The rate limit typically resets within 7-10s.
  if (createResponse.status === 429) {
    const retryAfterHeader = createResponse.headers?.get('retry-after')
    const retryMs = retryAfterHeader
      ? Math.min(Number(retryAfterHeader) * 1000 || 8000, 12000)
      : 8000
    await wait(retryMs)
    createResponse = await fetch(createUrl, {
      method: 'POST',
      headers: createHeaders,
      body: JSON.stringify(createBody),
    })
    payload = await createResponse.json().catch(() => null)
  }

  if (!createResponse.ok) {
    throw new Error(
      payload?.detail ||
        payload?.error ||
        'Replicate prediction request failed.'
    )
  }

  if (payload?.status === 'failed' || payload?.status === 'canceled') {
    throw new Error(payload?.error || 'Replicate prediction failed.')
  }

  let output = payload?.output

  if (payload?.status === 'processing' || payload?.status === 'starting') {
    const { maxPolls, pollIntervalMs } = getReplicatePollingStrategy({
      modelPreset: request.preset,
      stageParams,
    })
    const pollUrl =
      payload?.urls?.get || payload?.id
        ? `https://api.replicate.com/v1/predictions/${payload.id}`
        : null

    if (pollUrl) {
      for (let i = 0; i < maxPolls; i += 1) {
        await wait(pollIntervalMs)
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
      ? typeof output[0] === 'string'
        ? output[0]
        : output[0]?.image || output[0]?.url || output[0]?.output || ''
      : output?.image || output?.url || output?.output || ''

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

async function callFal({
  imageUrlOverride,
  job,
  prompt,
  stageParams,
  triggeredBy,
}) {
  const imageUrl =
    imageUrlOverride ||
    (await createSignedUrl({
      bucket: job.original_storage_bucket,
      expiresIn: 60 * 30,
      path: job.original_storage_path,
    }))
  const queuedOrImmediate = await submitFalRequest({
    imageUrl,
    job,
    prompt,
    stageParams,
    triggeredBy,
  })

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
    providerPayload: queuedOrImmediate.providerPayload || {
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

function getPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {}
}

function isInternalStageType(stageType) {
  return ['analyze_photo', 'postprocess_preserve'].includes(
    String(stageType || '').trim()
  )
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

  if (isInternalStageType(stage?.type)) {
    return 'internal'
  }

  return 'replicate'
}

function getStageModelPreset(stage) {
  if (stage?.type === 'replicate_old_photo_restoration') {
    return 'old_photo_restoration'
  }

  if (stage?.type === 'replicate_gfpgan') {
    return 'gfpgan'
  }

  if (stage?.type === 'replicate_codeformer') {
    return 'codeformer'
  }

  return ''
}

function getStageSource(stageType) {
  if (stageType === 'replicate_old_photo_restoration') {
    return 'replicate_old_photo_restoration'
  }

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

  if (stageType === 'analyze_photo') {
    return 'analyze_photo'
  }

  if (stageType === 'postprocess_preserve') {
    return 'postprocess_preserve'
  }

  return ''
}

function getPipelineStageTypes(pipeline) {
  return Array.isArray(pipeline?.stages)
    ? pipeline.stages.map(stage => String(stage?.type || ''))
    : []
}

// A stage type that is capable of producing a usable restored image on its
// own. `analyze_photo` is excluded because it never writes pixels. We use
// this to decide whether to fall through to the next stage when a given
// stage throws: if at least one restoration-capable stage remains, a
// failure is recoverable; otherwise we surface the error.
function isRestorationCapableStageType(stageType) {
  return (
    stageType === 'fal' ||
    stageType === 'openai' ||
    stageType === 'replicate_codeformer' ||
    stageType === 'replicate_gfpgan' ||
    stageType === 'replicate_old_photo_restoration' ||
    stageType === 'postprocess_preserve'
  )
}

function getSignificantPipelineStageTypes(pipeline) {
  return getPipelineStageTypes(pipeline).filter(
    stageType => !isInternalStageType(stageType)
  )
}

function isFalCodeformerPipeline(pipeline) {
  const stageTypes = getSignificantPipelineStageTypes(pipeline)

  return (
    stageTypes.includes('fal') &&
    stageTypes.includes('replicate_codeformer') &&
    stageTypes.indexOf('fal') < stageTypes.indexOf('replicate_codeformer')
  )
}

function getJobProviderPayload(job) {
  return job?.ai_provider_payload && typeof job.ai_provider_payload === 'object'
    ? job.ai_provider_payload
    : {}
}

function summarizeCodeformerVariantSelection({
  applied,
  candidateCount,
  selectedLabel,
  selectedScore,
  summary,
}) {
  if (!applied) {
    return (
      summary || `CodeFormer ${selectedLabel || 'balanced'} fell back to fal.`
    )
  }

  return [
    `Selected ${selectedLabel || 'balanced'} CodeFormer candidate`,
    candidateCount > 1 ? `from ${candidateCount} variants` : null,
    Number.isFinite(Number(selectedScore))
      ? `score ${Number(selectedScore).toFixed(2)}`
      : null,
    summary || null,
  ]
    .filter(Boolean)
    .join(' · ')
}

function getResultPipelineRuntime(result) {
  const providerPayload =
    result?.providerPayload && typeof result.providerPayload === 'object'
      ? result.providerPayload
      : {}

  return providerPayload.pipeline_runtime &&
    typeof providerPayload.pipeline_runtime === 'object'
    ? providerPayload.pipeline_runtime
    : null
}

function getDeliveryExportParams(result) {
  const runtime = getResultPipelineRuntime(result)
  const stages = Array.isArray(runtime?.stages) ? runtime.stages : []
  const postprocessStage = [...stages]
    .reverse()
    .find(stage => stage?.type === 'postprocess_preserve')
  const stageParams =
    postprocessStage?.params && typeof postprocessStage.params === 'object'
      ? postprocessStage.params
      : {}

  return {
    ...defaultDeliveryExportParams,
    ...stageParams,
  }
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
        conditions: getPlainObject(stage?.conditions),
        id: String(stage?.id || `${type}-${index + 1}`),
        params: getPlainObject(stage?.params),
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
        skipped: item.skipped === true,
        stageId: String(item.stageId || ''),
        summary: String(item.summary || ''),
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

  const source = String(job?.ai_draft_source || '')
    .trim()
    .toLowerCase()

  if (source === 'fal_codeformer') {
    return buildLegacyRequestedPipeline({ provider: 'fal' })
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
    pipelineName:
      summarizePipeline(pipeline) || existingRuntime?.pipelineName || '',
    stages: normalizePipelineStages(
      pipeline?.stages || existingRuntime?.stages
    ),
    startedAt: existingRuntime?.startedAt || new Date().toISOString(),
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
    skipped: result?.skipped === true,
    stageId: String(stage?.id || ''),
    summary: String(result?.summary || ''),
    stageType: String(stage?.type || ''),
  }
}

function createRuntimeAwareProviderPayload({
  job,
  provider,
  providerPayload,
  runtime,
}) {
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
  const path = `${job.submission_reference}/pipeline-input-${
    stage.id
  }-${Date.now()}.${extension}`
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

function getExpectedStageModel(stage) {
  if (stage?.type === 'replicate_old_photo_restoration') {
    return (
      stage?.params?.model ||
      process.env.REPLICATE_OLD_PHOTO_MODEL ||
      defaultReplicateOldPhotoRestorationModel
    )
  }

  if (stage?.type === 'replicate_codeformer') {
    return (
      stage?.params?.model ||
      process.env.REPLICATE_CODEFORMER_MODEL ||
      defaultReplicateCodeformerModel
    )
  }

  if (stage?.type === 'replicate_gfpgan') {
    return (
      stage?.params?.model ||
      process.env.REPLICATE_GFPGAN_MODEL ||
      process.env.REPLICATE_RESTORE_MODEL ||
      defaultReplicateGfpganModel
    )
  }

  if (stage?.type === 'openai') {
    return (
      stage?.params?.model ||
      process.env.OPENAI_IMAGE_EDIT_MODEL ||
      defaultOpenAIImageModel
    )
  }

  if (stage?.type === 'fal') {
    return normalizeFalModel(
      stage?.params?.model || process.env.FAL_RESTORE_MODEL || defaultFalModel
    )
  }

  if (stage?.type === 'analyze_photo') {
    return 'internal/analyze-photo'
  }

  if (stage?.type === 'postprocess_preserve') {
    return 'internal/postprocess-preserve'
  }

  return String(stage?.type || 'stage')
}

function buildSkippedStageResult({
  analysis,
  inputContentType,
  inputBuffer,
  reason,
  stage,
}) {
  const summary = analysis?.valid
    ? `Skipped ${stage?.type} because ${
        reason || 'the analysis thresholds said no extra enhancement was needed'
      }.`
    : `Skipped ${stage?.type} because ${
        reason || 'the stage conditions requested a bypass'
      }.`

  return {
    buffer: inputBuffer,
    contentType: inputContentType || 'image/png',
    model: getExpectedStageModel(stage),
    provider: getStageProvider(stage),
    providerPayload: {
      analysis,
      skipped: true,
      skip_reason: reason || 'condition_not_met',
      summary,
    },
    skipped: true,
    summary,
  }
}

async function resolveStageConditionEvaluation({ input, stage }) {
  const conditions = getPlainObject(stage?.conditions)
  const stageParams = getPlainObject(stage?.params)
  const requiresAnalysis =
    Object.keys(conditions).length > 0 ||
    stage?.type === 'replicate_old_photo_restoration' ||
    stage?.type === 'replicate_codeformer' ||
    stage?.type === 'replicate_gfpgan' ||
    (stage?.type === 'postprocess_preserve' &&
      stageParams.auto_finish_profile !== false)

  if (!requiresAnalysis) {
    return {
      analysis: null,
      resolvedInput: null,
      shouldRun: true,
    }
  }

  const resolvedInput = await ensureStageInputBuffer(input)
  const analysis = await analyzeRestorationImage({
    imageBuffer: resolvedInput.buffer,
  })
  const evaluation = evaluateStageConditions({ analysis, conditions })

  return {
    ...evaluation,
    analysis,
    resolvedInput,
  }
}

async function runPipelineStage({
  input,
  isResume,
  job,
  prompt,
  stage,
  triggeredBy,
}) {
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

  if (stage?.type === 'analyze_photo') {
    const resolvedInput = await ensureStageInputBuffer(input)
    const analysis = await analyzeRestorationImage({
      imageBuffer: resolvedInput.buffer,
      params: stage?.params,
    })
    const summary = analysis?.summary || summarizeRestorationAnalysis(analysis)

    return {
      buffer: resolvedInput.buffer,
      contentType: resolvedInput.contentType || 'image/png',
      model: getExpectedStageModel(stage),
      provider: 'internal',
      providerPayload: {
        analysis,
        summary,
      },
      summary,
    }
  }

  const conditionEvaluation = await resolveStageConditionEvaluation({
    input,
    stage,
  })
  const resolvedInput = conditionEvaluation.resolvedInput

  if (conditionEvaluation.shouldRun === false) {
    const stageInput = resolvedInput || (await ensureStageInputBuffer(input))

    return buildSkippedStageResult({
      analysis: conditionEvaluation.analysis,
      inputBuffer: stageInput.buffer,
      inputContentType: stageInput.contentType,
      reason: conditionEvaluation.reason,
      stage,
    })
  }

  if (stage?.type === 'openai') {
    const openAiInput = resolvedInput || (await ensureStageInputBuffer(input))

    const result = await callOpenAI({
      imageBuffer: openAiInput.buffer,
      imageContentType: openAiInput.contentType,
      job,
      prompt,
      stageParams: stage?.params,
    })

    return {
      ...result,
      providerPayload: {
        ...getPlainObject(result.providerPayload),
        input_analysis: conditionEvaluation.analysis,
      },
      summary:
        conditionEvaluation.analysis?.summary ||
        'Restored with the configured OpenAI image stage.',
    }
  }

  if (
    stage?.type === 'replicate_old_photo_restoration' ||
    stage?.type === 'replicate_codeformer' ||
    stage?.type === 'replicate_gfpgan'
  ) {
    const replicateInput =
      resolvedInput || (await ensureStageInputBuffer(input))
    const { signedUrl, tempStorage } = await resolveStageInputUrl({
      input: replicateInput,
      job,
      stage,
    })

    try {
      if (stage?.type === 'replicate_codeformer') {
        const adaptiveProfile = selectAdaptiveCodeformerProfile({
          analysis: conditionEvaluation.analysis,
          params: stage?.params,
        })
        const adaptiveVariants = buildAdaptiveCodeformerVariants({
          analysis: conditionEvaluation.analysis,
          params: stage?.params,
        })
        const candidateResults = []
        const candidateErrors = []

        for (
          let variantIndex = 0;
          variantIndex < adaptiveVariants.variants.length;
          variantIndex += 1
        ) {
          const variant = adaptiveVariants.variants[variantIndex]
          try {
            const replicateResult = await callReplicate({
              analysis: conditionEvaluation.analysis,
              imageUrlOverride: signedUrl,
              job,
              modelPreset: getStageModelPreset(stage),
              stageParams: variant.params,
            })
            const blendResult = await applyReplicateEnhancementBlend({
              baseBuffer: replicateInput.buffer,
              baseContentType: replicateInput.contentType,
              enhancedBuffer: replicateResult.buffer,
              params: variant.params,
            })
            const scoredCandidate = await scoreAdaptiveCodeformerCandidate({
              baseAnalysis: conditionEvaluation.analysis,
              baseBuffer: replicateInput.buffer,
              blendResult,
              candidateBuffer: blendResult.buffer,
              variant,
            })

            candidateResults.push({
              blendResult,
              contentType:
                blendResult.contentType || replicateInput.contentType,
              providerPayload: {
                ...getPlainObject(replicateResult.providerPayload),
                adaptive_profile: adaptiveProfile,
                input_analysis: conditionEvaluation.analysis,
                scoring: getPlainObject(scoredCandidate.metrics),
                variant_label: variant.label,
              },
              replicateResult,
              score: scoredCandidate.score,
              variant,
            })
          } catch (error) {
            candidateErrors.push({
              error,
              label: variant.label,
            })
          }
        }

        if (!candidateResults.length) {
          throw (
            candidateErrors[0]?.error ||
            new Error('CodeFormer candidate race failed for every variant.')
          )
        }

        candidateResults.sort((left, right) => right.score - left.score)
        const selectedCandidate = candidateResults[0]
        const compactCandidates = candidateResults.map(candidate => ({
          applied: candidate.blendResult.applied === true,
          blend: {
            mask: getPlainObject(candidate.blendResult.mask),
            mode: candidate.blendResult.mode || 'difference_mask',
            reason: candidate.blendResult.reason || null,
          },
          label: candidate.variant.label,
          profile: candidate.variant.profile,
          score: candidate.score,
        }))

        return {
          ...selectedCandidate.replicateResult,
          buffer: selectedCandidate.blendResult.buffer,
          contentType: selectedCandidate.contentType,
          providerPayload: {
            ...getPlainObject(selectedCandidate.providerPayload),
            blend: {
              applied: selectedCandidate.blendResult.applied === true,
              mask: getPlainObject(selectedCandidate.blendResult.mask),
              mode: selectedCandidate.blendResult.mode || 'difference_mask',
              reason: selectedCandidate.blendResult.reason || null,
            },
            candidate_race: {
              candidates: compactCandidates,
              errors: candidateErrors.map(candidate => ({
                label: candidate.label,
                reason:
                  candidate.error instanceof Error
                    ? candidate.error.message
                    : String(candidate.error || 'unknown_error'),
              })),
              enabled: adaptiveVariants.variants.length > 1,
              selected_label: selectedCandidate.variant.label,
              selected_profile: selectedCandidate.variant.profile,
              selected_score: selectedCandidate.score,
            },
          },
          summary: summarizeCodeformerVariantSelection({
            applied: selectedCandidate.blendResult.applied === true,
            candidateCount: adaptiveVariants.variants.length,
            selectedLabel: selectedCandidate.variant.label,
            selectedScore: selectedCandidate.score,
            summary: selectedCandidate.blendResult.summary,
          }),
        }
      }

      const replicateResult = await callReplicate({
        analysis: conditionEvaluation.analysis,
        imageUrlOverride: signedUrl,
        job,
        modelPreset: getStageModelPreset(stage),
        stageParams: stage?.params,
      })

      return {
        ...replicateResult,
        providerPayload: {
          ...getPlainObject(replicateResult.providerPayload),
          input_analysis: conditionEvaluation.analysis,
        },
        summary:
          stage?.type === 'replicate_old_photo_restoration'
            ? conditionEvaluation.analysis?.summary ||
              'Applied the configured Replicate old-photo restoration.'
            : conditionEvaluation.analysis?.summary ||
              'Applied the configured Replicate enhancement.',
      }
    } finally {
      if (tempStorage) {
        await deleteObject({
          bucket: tempStorage.bucket,
          path: tempStorage.path,
        }).catch(() => null)
      }
    }
  }

  if (stage?.type === 'postprocess_preserve') {
    const postprocessInput =
      resolvedInput || (await ensureStageInputBuffer(input))
    const adaptiveFinish = deriveAdaptiveFinishParams({
      analysis: conditionEvaluation.analysis,
      params: stage?.params,
    })
    const postprocessed = await applyVintageRestoreFinish({
      imageBuffer: postprocessInput.buffer,
      inputContentType: postprocessInput.contentType,
      params: adaptiveFinish.params,
    })

    return {
      buffer: postprocessed.buffer,
      contentType: postprocessed.contentType,
      model: getExpectedStageModel(stage),
      provider: 'internal',
      providerPayload: {
        applied: postprocessed.applied === true,
        adaptive_finish_profile: adaptiveFinish.profile,
        reason: postprocessed.reason || null,
        settings: getPlainObject(postprocessed.settings),
        source_analysis: conditionEvaluation.analysis,
      },
      summary: postprocessed.summary,
    }
  }

  if (stage?.type === 'fal') {
    const stageInput =
      resolvedInput && resolvedInput.buffer ? resolvedInput : input
    const { signedUrl, tempStorage } = await resolveStageInputUrl({
      input: stageInput,
      job,
      stage,
    })

    try {
      const result = await callFal({
        imageUrlOverride: signedUrl,
        job,
        prompt,
        stageParams: stage?.params,
        triggeredBy,
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

      return {
        ...result,
        providerPayload: {
          ...getPlainObject(result.providerPayload),
          input_analysis: conditionEvaluation.analysis,
        },
        summary: 'Restored with fal.ai.',
      }
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
  const latestAnalysisTrace =
    [...runtime.trace]
      .reverse()
      .find(item => item.stageType === 'analyze_photo') || null
  const falTrace =
    [...runtime.trace].reverse().find(item => item.stageType === 'fal') || null
  const codeformerTrace =
    [...runtime.trace]
      .reverse()
      .find(item => item.stageType === 'replicate_codeformer') || null
  const finishTrace =
    [...runtime.trace]
      .reverse()
      .find(item => item.stageType === 'postprocess_preserve') || null

  if (isFalCodeformerPipeline(pipeline)) {
    const codeformerBlend = getPlainObject(
      codeformerTrace?.providerPayload?.blend
    )
    const codeformerFallbackToBase =
      codeformerTrace &&
      !codeformerTrace.skipped &&
      codeformerBlend.applied === false &&
      (codeformerBlend.reason === 'no_local_regions_detected' ||
        String(codeformerTrace.summary || '').includes('Kept the base restore'))
    const codeformerApplied = Boolean(
      codeformerTrace && !codeformerTrace.skipped && !codeformerFallbackToBase
    )
    const codeformerFallbackReason = codeformerFallbackToBase
      ? codeformerBlend.reason || 'no_local_regions_detected'
      : null

    if (codeformerApplied && !error) {
      return {
        ...pipelineMetadata,
        analysis: latestAnalysisTrace?.providerPayload?.analysis || null,
        codeformer:
          codeformerTrace?.providerPayload || result.providerPayload || {},
        codeformer_effective: true,
        fal: falTrace?.providerPayload || {},
        finish: finishTrace?.providerPayload || {},
      }
    }

    if (falTrace) {
      return {
        ...pipelineMetadata,
        analysis: latestAnalysisTrace?.providerPayload?.analysis || null,
        codeformer: codeformerTrace?.providerPayload || {},
        codeformer_effective: false,
        codeformer_error:
          error instanceof Error ? error.message : error ? String(error) : null,
        codeformer_fallback_reason: codeformerFallbackReason,
        fal: falTrace?.providerPayload || result.providerPayload || {},
        finish: finishTrace?.providerPayload || {},
        pipeline: ['fal'],
      }
    }
  }

  return {
    ...(result.providerPayload && typeof result.providerPayload === 'object'
      ? result.providerPayload
      : {}),
    analysis: latestAnalysisTrace?.providerPayload?.analysis || null,
    ...pipelineMetadata,
    pipeline_error:
      error instanceof Error ? error.message : error ? String(error) : null,
  }
}

function buildPipelineResult({
  completedStage,
  error,
  pipeline,
  result,
  runtime,
}) {
  const codeformerTrace =
    [...runtime.trace]
      .reverse()
      .find(item => item.stageType === 'replicate_codeformer') || null
  const codeformerBlend = getPlainObject(
    codeformerTrace?.providerPayload?.blend
  )
  const codeformerFallbackToBase =
    codeformerTrace &&
    !codeformerTrace.skipped &&
    codeformerBlend.applied === false &&
    (codeformerBlend.reason === 'no_local_regions_detected' ||
      String(codeformerTrace.summary || '').includes('Kept the base restore'))
  const codeformerApplied = Boolean(
    codeformerTrace && !codeformerTrace.skipped && !codeformerFallbackToBase
  )
  const modelTrace = runtime.trace
    .filter(item => !isInternalStageType(item.stageType))
    .filter(
      item =>
        !(
          item.stageType === 'replicate_codeformer' &&
          codeformerFallbackToBase === true
        )
    )
    .map(item => item.model)
    .filter(Boolean)
  const lastVisibleTrace =
    [...runtime.trace]
      .reverse()
      .find(item => !isInternalStageType(item.stageType) && !item.skipped) ||
    null

  let provider =
    isInternalStageType(completedStage?.type) && lastVisibleTrace?.stageType
      ? getStageProvider({ type: lastVisibleTrace?.stageType })
      : result.provider
  let source =
    getStageSource(lastVisibleTrace?.stageType || completedStage?.type || '') ||
    getPipelineSource(pipeline)

  if (isFalCodeformerPipeline(pipeline)) {
    if (codeformerApplied && !error) {
      provider = 'fal'
      source = 'fal_codeformer'
    } else if (runtime.trace.some(item => item.stageType === 'fal')) {
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

const pipelineBudgetMs = 50000
const pipelineDeadlineMarginMs = 10000

async function runConfiguredPipeline({ job, pipeline, prompt, triggeredBy }) {
  const pipelineStartMs = Date.now()
  const storedRuntime = getStoredPipelineRuntime(job)
  const isResuming = Boolean(
    job.status === 'processing' && job.ai_request_id && pipeline?.stages?.length
  )
  const fallbackResumeStageIndex = isResuming
    ? Math.max(
        0,
        pipeline?.stages?.findIndex(stage => stage?.type === 'fal') || 0
      )
    : 0
  const startingStageIndex = isResuming
    ? Math.max(
        0,
        storedRuntime
          ? Number(storedRuntime.currentStageIndex) || 0
          : fallbackResumeStageIndex
      )
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

    const elapsedMs = Date.now() - pipelineStartMs
    if (
      elapsedMs > pipelineBudgetMs - pipelineDeadlineMarginMs &&
      lastSuccessfulResult
    ) {
      return finalizePipelineResult({
        completedStage: lastSuccessfulStage,
        job,
        pipeline,
        prompt,
        result: lastSuccessfulResult,
        runtime,
      })
    }

    try {
      const stageResult = await runPipelineStage({
        input,
        isResume: isResumeStage,
        job,
        prompt,
        stage,
        triggeredBy,
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

      const nextTrace = [
        ...runtime.trace,
        buildTraceEntry({ result: stageResult, stage }),
      ]

      runtime = buildPipelineRuntime({
        currentStageIndex: stageIndex + 1,
        existingRuntime: runtime,
        pipeline,
        trace: nextTrace,
      })
      if (stage?.type !== 'analyze_photo') {
        lastSuccessfulResult = stageResult
        lastSuccessfulStage = stage
      }
      input = {
        buffer: stageResult.buffer,
        contentType: stageResult.contentType,
      }
    } catch (error) {
      // If the pipeline still has a restoration-capable stage queued up,
      // log this failure and fall through — don't drop the whole job
      // because one upstream model (e.g. Replicate old-photo-restoration)
      // crashed on this specific input. The next stage will run with the
      // same `input` we fed to the failed one, which is either the
      // original bytes (if nothing has succeeded yet) or the last
      // successful restoration output.
      const hasRemainingRestorationStage = pipeline.stages
        .slice(stageIndex + 1)
        .some(nextStage =>
          isRestorationCapableStageType(String(nextStage?.type || ''))
        )

      if (hasRemainingRestorationStage) {
        const errorMessage =
          error instanceof Error ? error.message : String(error || '')
        const skippedTrace = [
          ...runtime.trace,
          buildTraceEntry({
            result: {
              model: getExpectedStageModel(stage) || '',
              provider: getStageSource(String(stage?.type || '')) || '',
              providerPayload: {
                error: errorMessage,
                skipped_reason: 'stage_error_with_fallback_available',
              },
              skipped: true,
              summary: `Stage ${String(
                stage?.id || stage?.type || ''
              )} failed (${
                errorMessage || 'unknown error'
              }); falling through to the next restoration stage.`,
            },
            stage,
          }),
        ]

        runtime = buildPipelineRuntime({
          currentStageIndex: stageIndex + 1,
          existingRuntime: runtime,
          pipeline,
          trace: skippedTrace,
        })
        // Leave `input` unchanged so the next stage runs on whatever we
        // last had — original bytes, or the last successful stage's output.
        continue
      }

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
  const originalAsset =
    job.original_storage_bucket && job.original_storage_path
      ? await downloadObject({
          bucket: job.original_storage_bucket,
          path: job.original_storage_path,
        }).catch(() => null)
      : null
  const deliveryExportParams = getDeliveryExportParams(result)
  const deliveryExport = await finalizeRestoredDeliveryImage({
    imageBuffer: result.buffer,
    inputContentType: result.contentType || 'image/png',
    originalBuffer: originalAsset?.buffer,
    originalContentType:
      job.original_file_type || originalAsset?.contentType || 'image/png',
    params: deliveryExportParams,
  })
  const finalizedBuffer = deliveryExport.buffer || result.buffer
  const finalizedContentType =
    deliveryExport.contentType || result.contentType || 'image/png'
  const extension = inferImageExtension(finalizedContentType)
  const resultPath = `${
    job.submission_reference
  }/ai-draft-${Date.now()}.${extension}`
  const now = new Date().toISOString()

  await uploadObject({
    bucket: buckets.results,
    contentType: finalizedContentType,
    data: finalizedBuffer,
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
    (previousDraftBucket !== buckets.results ||
      previousDraftPath !== resultPath)
  ) {
    await deleteObject({
      bucket: previousDraftBucket,
      path: previousDraftPath,
    }).catch(() => null)
  }

  return updateJob(job.id, {
    ai_draft_created_at: now,
    ai_draft_error: null,
    ai_draft_file_type: finalizedContentType,
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
    ai_provider_payload: {
      ...(result.providerPayload || {}),
      delivery_export: {
        ...(deliveryExport.export || {}),
        applied: deliveryExport.applied === true,
        content_type: finalizedContentType,
        reason: deliveryExport.reason || null,
        settings: deliveryExportParams,
        summary: deliveryExport.summary || '',
      },
    },
    ai_request_id: result.requestId || null,
    result_file_type: finalizedContentType,
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

function getFalQueueModel(model) {
  const normalizedModel = normalizeFalModel(model)

  if (process.env.FAL_RESTORE_QUEUE_MODEL) {
    return String(process.env.FAL_RESTORE_QUEUE_MODEL).trim()
  }

  if (normalizedModel === defaultFalModel) {
    return 'fal-ai/image-editing'
  }

  return normalizedModel
}

function buildFalQueueUrl({ model, requestId, type }) {
  const queueModel = getFalQueueModel(model)

  if (type === 'status') {
    return `https://queue.fal.run/${queueModel}/requests/${requestId}/status`
  }

  return `https://queue.fal.run/${queueModel}/requests/${requestId}`
}

function getPreferredFalQueueUrl(rawUrl, fallbackUrl, type) {
  const trimmed = String(rawUrl || '').trim()

  if (!trimmed) {
    return fallbackUrl
  }

  try {
    const parsed = new URL(trimmed)

    if (
      parsed.hostname === 'queue.fal.run' &&
      parsed.pathname.includes('/requests/') &&
      ((type === 'status' && parsed.pathname.endsWith('/status')) ||
        (type !== 'status' &&
          !parsed.pathname.endsWith('/status') &&
          !parsed.pathname.endsWith('/cancel')))
    ) {
      return trimmed
    }
  } catch {
    return fallbackUrl
  }

  return fallbackUrl
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
    existingPayload && typeof existingPayload === 'object'
      ? { ...existingPayload }
      : {}

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
    nestedFalPayload.request_id ||
    nestedFalPayload.response_url ||
    nestedFalPayload.status_url
      ? nestedFalPayload
      : topLevelPayload
  const requestId =
    rawFalPayload.request_id || rawFalPayload.requestId || job?.ai_request_id
  const model =
    rawFalPayload.model ||
    job?.ai_draft_model ||
    job?.result_model ||
    process.env.FAL_RESTORE_MODEL ||
    defaultFalModel
  const canonicalPayload = buildFalQueuePayload({
    model,
    queuedAt:
      rawFalPayload.queued_at || rawFalPayload.queuedAt || job?.created_at,
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
          pipeline: buildPipelineFromRuntime(getStoredPipelineRuntime(job)) ||
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

function shouldResumeRequestedPipeline({
  job,
  requestedModelPreset,
  requestedPipeline,
  requestedProvider,
}) {
  if (
    !job ||
    job.status !== 'processing' ||
    !job.ai_request_id ||
    !requestedPipeline ||
    requestedProvider ||
    requestedModelPreset
  ) {
    return false
  }

  const currentPipelineId =
    job.ai_provider_payload?.pipeline_id ||
    job.ai_provider_payload?.pipeline_runtime?.pipelineId ||
    ''

  return Boolean(
    currentPipelineId && currentPipelineId === requestedPipeline.id
  )
}

export async function runRestoreJob({
  job,
  pipelineId: requestedPipelineId,
  provider: requestedProvider,
  modelPreset: requestedModelPreset,
  forceRerun = false,
  triggeredBy = 'unknown',
}) {
  // Defense-in-depth guard against accidental re-submission of paid AI work.
  // If this job already has a completed AI draft or final result and the
  // caller did not express explicit rerun intent (forceRerun / specific
  // pipelineId / provider / modelPreset), return the job as-is so we never
  // trigger a new billable pipeline run for idempotent pollers or auto-sync
  // callers. Resume polling (job.status === 'processing') is allowed so that
  // ongoing fal jobs can still finish via pollFalRequest (which is free).
  const hasCompletedResult = Boolean(
    job?.result_storage_path || job?.ai_draft_storage_path
  )
  const isExplicitRerun = Boolean(
    forceRerun ||
      requestedPipelineId ||
      requestedProvider ||
      requestedModelPreset
  )

  if (
    hasCompletedResult &&
    !isExplicitRerun &&
    job?.status &&
    job.status !== 'processing'
  ) {
    console.log(
      JSON.stringify({
        event: 'run_restore_job_skipped',
        job_id: job?.id,
        reason: 'already_completed_no_explicit_rerun',
        status: job?.status,
        timestamp: new Date().toISOString(),
        triggered_by: triggeredBy,
      })
    )
    await insertEvent(job.id, 'ai_restore_skipped_idempotent', {
      reason: 'already_completed_no_explicit_rerun',
      status: job?.status,
      triggered_by: triggeredBy,
    }).catch(() => null)
    return job
  }

  const prompt = buildRestorePrompt(job)
  const pipelineConfig = await readPipelineConfig()
  const requestedPipeline = requestedPipelineId
    ? findPipelineById(pipelineConfig, requestedPipelineId)
    : null
  const shouldResumeRequestedCurrentPipeline = shouldResumeRequestedPipeline({
    job,
    requestedModelPreset,
    requestedPipeline,
    requestedProvider,
  })

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
    (requestedPipeline && !shouldResumeRequestedCurrentPipeline) ||
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
      triggeredBy,
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

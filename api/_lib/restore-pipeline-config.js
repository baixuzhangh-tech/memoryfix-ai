import crypto from 'crypto'
import {
  downloadObject,
  getHumanRestoreBuckets,
  getLatestSystemEventByType,
  insertSystemEvent,
} from './supabase.js'

const configVersion = 7
const defaultReplicatePreset = 'codeformer'
const pipelineConfigEventType = 'restore_pipeline_config_saved'
const configPath =
  process.env.HUMAN_RESTORE_PIPELINE_CONFIG_PATH ||
  'config/ai-restore-pipelines.json'

const legacyCodeformerConditionsV2 = {
  run_if_restore_need_above: 0.35,
  skip_if_detail_above: 0.72,
}

const tunedCodeformerConditionsV3 = {
  run_if_restore_need_above: 0.28,
  skip_if_detail_above: 0.84,
}

const tunedCodeformerConditionsV4 = {
  run_if_restore_need_above: 0.24,
  skip_if_detail_above: 0.88,
}

const tunedOldPhotoConditionsV7 = {
  run_if_restore_need_above: 0.18,
}

const legacyCodeformerParamsV2 = {
  allow_portrait_energy_fallback: true,
  allow_relaxed_blend_fallback: true,
  background_enhance: false,
  blend_alpha: 0.42,
  blend_mode: 'difference_mask',
  codeformer_fidelity: 0.86,
  diff_mask_blur: 16,
  diff_mask_max_coverage: 0.18,
  diff_mask_max_region_ratio: 0.14,
  diff_mask_max_regions: 12,
  diff_mask_min_diff: 12,
  diff_mask_min_region_ratio: 0.0006,
  diff_mask_upper_focus: 0.92,
  face_upsample: false,
  portrait_energy_cell_size: 16,
  portrait_energy_max_cells: 12,
  portrait_energy_min_cell_score: 4.8,
  portrait_energy_min_diff: 4,
  portrait_energy_upper_focus: 0.96,
  relaxed_diff_mask_max_region_ratio: 0.24,
  relaxed_diff_mask_max_regions: 24,
  relaxed_diff_mask_min_region_ratio: 0.0002,
  relaxed_diff_mask_upper_focus: 0.99,
  upscale: 1,
}

const tunedCodeformerParamsV3 = {
  allow_portrait_energy_fallback: true,
  allow_relaxed_blend_fallback: true,
  background_enhance: false,
  blend_alpha: 0.56,
  blend_mode: 'difference_mask',
  codeformer_fidelity: 0.78,
  diff_mask_blur: 12,
  diff_mask_max_coverage: 0.24,
  diff_mask_max_region_ratio: 0.18,
  diff_mask_max_regions: 18,
  diff_mask_min_diff: 8,
  diff_mask_min_region_ratio: 0.00025,
  diff_mask_upper_focus: 0.97,
  face_upsample: true,
  portrait_energy_cell_size: 12,
  portrait_energy_max_cells: 18,
  portrait_energy_min_cell_score: 3.8,
  portrait_energy_min_diff: 3,
  portrait_energy_upper_focus: 0.99,
  relaxed_diff_mask_max_region_ratio: 0.32,
  relaxed_diff_mask_max_regions: 32,
  relaxed_diff_mask_min_region_ratio: 0.00008,
  relaxed_diff_mask_upper_focus: 1,
  upscale: 2,
}

const tunedCodeformerParamsV4 = {
  allow_portrait_energy_fallback: true,
  allow_relaxed_blend_fallback: true,
  adaptive_profile: 'auto',
  background_enhance: false,
  blend_alpha: 0.6,
  blend_mode: 'difference_mask',
  candidate_race_enabled: true,
  candidate_race_max_variants: 1,
  codeformer_fidelity: 0.74,
  diff_mask_blur: 11,
  diff_mask_max_coverage: 0.26,
  diff_mask_max_region_ratio: 0.19,
  diff_mask_max_regions: 22,
  diff_mask_min_diff: 7,
  diff_mask_min_region_ratio: 0.00018,
  diff_mask_upper_focus: 0.985,
  face_upsample: true,
  portrait_energy_cell_size: 12,
  portrait_energy_max_cells: 22,
  portrait_energy_min_cell_score: 3.5,
  portrait_energy_min_diff: 2.8,
  portrait_energy_upper_focus: 1,
  relaxed_diff_mask_max_region_ratio: 0.34,
  relaxed_diff_mask_max_regions: 36,
  relaxed_diff_mask_min_region_ratio: 0.00006,
  relaxed_diff_mask_upper_focus: 1,
  upper_portrait_alpha_boost: 0.18,
  upper_portrait_alpha_focus: 0.9,
  upper_portrait_alpha_max_x: 0.94,
  upper_portrait_alpha_min_x: 0.06,
  upscale: 2,
}

const tunedCodeformerParamsV6 = {
  ...tunedCodeformerParamsV4,
  score_green_cast_penalty: 8,
  score_portrait_contrast_weight: 2.2,
  score_portrait_detail_weight: 10.5,
  score_portrait_green_cast_penalty: 10,
  score_texture_spread_penalty: 4.2,
}

const legacyFinishParamsV3 = {
  brightness: 0.99,
  contrast: 0.985,
  grain_amount: 0.035,
  grain_scale: 0.16,
  saturation: 0.96,
}

const tunedFinishParamsV4 = {
  auto_finish_profile: true,
  brightness: 0.975,
  contrast: 1.01,
  grain_amount: 0.03,
  grain_scale: 0.16,
  green_balance: -0.045,
  saturation: 0.985,
  sharpen_sigma: 0.7,
  warmth: 0.055,
}

const tunedFinishParamsV5 = {
  ...tunedFinishParamsV4,
  export_format: 'png',
  jpeg_quality: 97,
  preserve_metadata: true,
  preserve_original_dimensions: true,
  resize_kernel: 'lanczos3',
  webp_quality: 96,
}

const tunedFinishParamsV6 = {
  ...tunedFinishParamsV5,
  portrait_detail_alpha: 0.18,
  portrait_detail_center_bias: 0.24,
  portrait_detail_contrast: 1.026,
  portrait_detail_focus: 0.82,
  portrait_detail_max_x: 0.94,
  portrait_detail_min_x: 0.06,
  portrait_detail_saturation: 1,
  portrait_detail_sharpen_sigma: 1.08,
}

const tunedOldPhotoReplicateParamsV7 = {
  auto_hr: true,
  auto_scratch_detection: true,
  hr_min_width: 1100,
  scratch_damage_threshold: 0.07,
  scratch_restore_need_threshold: 0.36,
}

const stageCatalog = {
  analyze_photo: {
    defaultConditions: {},
    defaultParams: {
      downsample_width: 256,
    },
    description:
      'Inspect blur, contrast, and damage so later stages can make conservative decisions.',
    label: 'Analyze photo',
    provider: 'internal',
    type: 'analyze_photo',
  },
  fal: {
    defaultConditions: {},
    defaultParams: {
      guidance_scale: 3.2,
      include_prompt: false,
      num_inference_steps: 30,
      output_format: 'png',
      safety_tolerance: '2',
    },
    description: 'Run fal.ai old-photo restoration.',
    label: 'fal restoration',
    provider: 'fal',
    type: 'fal',
  },
  openai: {
    defaultConditions: {},
    defaultParams: {},
    description: 'Run OpenAI image edit restoration.',
    label: 'OpenAI restoration',
    provider: 'openai',
    type: 'openai',
  },
  replicate_old_photo_restoration: {
    defaultConditions: tunedOldPhotoConditionsV7,
    defaultParams: tunedOldPhotoReplicateParamsV7,
    description:
      'Run the cheaper Replicate old-photo restoration baseline before optional face enhancement.',
    label: 'Replicate Old Photo Restore',
    modelPreset: 'old_photo_restoration',
    provider: 'replicate',
    type: 'replicate_old_photo_restoration',
  },
  replicate_codeformer: {
    defaultConditions: tunedCodeformerConditionsV4,
    defaultParams: tunedCodeformerParamsV6,
    description:
      'Run Replicate CodeFormer, then blend only the meaningful local changes back into the fal base.',
    label: 'Replicate CodeFormer',
    modelPreset: 'codeformer',
    provider: 'replicate',
    type: 'replicate_codeformer',
  },
  replicate_gfpgan: {
    defaultConditions: {
      run_if_restore_need_above: 0.4,
    },
    defaultParams: {
      scale: 2,
    },
    description: 'Run Replicate GFPGAN enhancement.',
    label: 'Replicate GFPGAN',
    modelPreset: 'gfpgan',
    provider: 'replicate',
    type: 'replicate_gfpgan',
  },
  postprocess_preserve: {
    defaultConditions: {},
    defaultParams: tunedFinishParamsV6,
    description:
      'Apply a conservative finishing pass to keep the result closer to a restored print than a glossy AI redraw.',
    label: 'Tone preserve finish',
    provider: 'internal',
    type: 'postprocess_preserve',
  },
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function createId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`
}

function getPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {}
}

function cloneStageDefaults(stageType) {
  const definition = stageCatalog[stageType]

  return {
    conditions: { ...getPlainObject(definition?.defaultConditions) },
    params: { ...getPlainObject(definition?.defaultParams) },
  }
}

function createStageConfig(stageType, stageId, overrides = {}) {
  const defaults = cloneStageDefaults(stageType)

  return {
    conditions: {
      ...defaults.conditions,
      ...getPlainObject(overrides.conditions),
    },
    id: stageId,
    params: {
      ...defaults.params,
      ...getPlainObject(overrides.params),
    },
    type: stageType,
  }
}

function isCodeformerPipelineEnabled() {
  return (
    process.env.FAL_RESTORE_ENABLE_CODEFORMER_PIPELINE !== 'false' &&
    Boolean(process.env.REPLICATE_API_TOKEN)
  )
}

function normalizeReplicatePreset(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  return ['codeformer', 'gfpgan', 'old_photo_restoration'].includes(normalized)
    ? normalized
    : defaultReplicatePreset
}

function getConfiguredDefaultStageType() {
  const provider = String(process.env.AI_RESTORE_PROVIDER || '')
    .trim()
    .toLowerCase()

  if (provider === 'replicate') {
    return `replicate_${normalizeReplicatePreset(
      process.env.REPLICATE_DEFAULT_PRESET
    )}`
  }

  if (provider === 'fal') {
    return 'fal'
  }

  if (provider === 'openai') {
    return 'openai'
  }

  if (process.env.REPLICATE_API_TOKEN) {
    return `replicate_${normalizeReplicatePreset(
      process.env.REPLICATE_DEFAULT_PRESET
    )}`
  }

  if (process.env.FAL_KEY) {
    return 'fal'
  }

  if (process.env.OPENAI_API_KEY) {
    return 'openai'
  }

  return 'fal'
}

export function getPipelineConfigStorageRef() {
  const buckets = getHumanRestoreBuckets()

  return {
    bucket: buckets.results,
    path: configPath,
  }
}

export function listStageDefinitions() {
  return Object.values(stageCatalog).map(stage => ({
    ...stage,
    available:
      stage.provider === 'internal'
        ? true
        : stage.provider === 'fal'
        ? Boolean(process.env.FAL_KEY)
        : stage.provider === 'openai'
        ? Boolean(process.env.OPENAI_API_KEY)
        : Boolean(process.env.REPLICATE_API_TOKEN),
  }))
}

export function normalizeStageType(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  return stageCatalog[normalized] ? normalized : ''
}

export function getStageDefinition(stageType) {
  return stageCatalog[normalizeStageType(stageType)] || null
}

function buildPipelineNameFromStages(stages) {
  return stages
    .map(stage => getStageDefinition(stage.type)?.label || stage.type)
    .join(' + ')
}

function looselyEqualConfigValue(left, right) {
  if (
    (typeof left === 'number' || typeof right === 'number') &&
    Number.isFinite(Number(left)) &&
    Number.isFinite(Number(right))
  ) {
    return Number(left) === Number(right)
  }

  return String(left) === String(right)
}

function migrateStageConfig({ conditions, params, stageType, version }) {
  const normalizedVersion = Number(version) || 0

  if (normalizedVersion >= configVersion) {
    return { conditions, params }
  }

  let migratedConditions = { ...conditions }
  let migratedParams = { ...params }

  if (stageType === 'replicate_codeformer' && normalizedVersion < 3) {
    for (const [key, tunedValue] of Object.entries(
      tunedCodeformerConditionsV3
    )) {
      const currentValue = migratedConditions[key]

      if (
        currentValue === undefined ||
        looselyEqualConfigValue(currentValue, legacyCodeformerConditionsV2[key])
      ) {
        migratedConditions[key] = tunedValue
      }
    }

    for (const [key, tunedValue] of Object.entries(tunedCodeformerParamsV3)) {
      const currentValue = migratedParams[key]

      if (
        currentValue === undefined ||
        looselyEqualConfigValue(currentValue, legacyCodeformerParamsV2[key])
      ) {
        migratedParams[key] = tunedValue
      }
    }
  }

  if (stageType === 'replicate_codeformer' && normalizedVersion < 4) {
    for (const [key, tunedValue] of Object.entries(
      tunedCodeformerConditionsV4
    )) {
      const currentValue = migratedConditions[key]

      if (
        currentValue === undefined ||
        looselyEqualConfigValue(currentValue, tunedCodeformerConditionsV3[key])
      ) {
        migratedConditions[key] = tunedValue
      }
    }

    for (const [key, tunedValue] of Object.entries(tunedCodeformerParamsV4)) {
      const currentValue = migratedParams[key]

      if (
        currentValue === undefined ||
        looselyEqualConfigValue(currentValue, tunedCodeformerParamsV3[key])
      ) {
        migratedParams[key] = tunedValue
      }
    }
  }

  if (stageType === 'postprocess_preserve' && normalizedVersion < 4) {
    for (const [key, tunedValue] of Object.entries(tunedFinishParamsV4)) {
      const currentValue = migratedParams[key]

      if (
        currentValue === undefined ||
        looselyEqualConfigValue(currentValue, legacyFinishParamsV3[key])
      ) {
        migratedParams[key] = tunedValue
      }
    }
  }

  if (stageType === 'fal' && normalizedVersion < 5) {
    const currentValue = migratedParams.output_format

    if (
      currentValue === undefined ||
      looselyEqualConfigValue(currentValue, 'jpeg')
    ) {
      migratedParams.output_format = 'png'
    }
  }

  if (stageType === 'postprocess_preserve' && normalizedVersion < 5) {
    for (const [key, tunedValue] of Object.entries(tunedFinishParamsV5)) {
      const currentValue = migratedParams[key]

      if (
        currentValue === undefined ||
        looselyEqualConfigValue(currentValue, tunedFinishParamsV4[key])
      ) {
        migratedParams[key] = tunedValue
      }
    }
  }

  if (stageType === 'replicate_codeformer' && normalizedVersion < 6) {
    for (const [key, tunedValue] of Object.entries(tunedCodeformerParamsV6)) {
      const currentValue = migratedParams[key]

      if (
        currentValue === undefined ||
        looselyEqualConfigValue(currentValue, tunedCodeformerParamsV4[key])
      ) {
        migratedParams[key] = tunedValue
      }
    }
  }

  if (stageType === 'postprocess_preserve' && normalizedVersion < 6) {
    for (const [key, tunedValue] of Object.entries(tunedFinishParamsV6)) {
      const currentValue = migratedParams[key]

      if (
        currentValue === undefined ||
        looselyEqualConfigValue(currentValue, tunedFinishParamsV5[key])
      ) {
        migratedParams[key] = tunedValue
      }
    }
  }

  return { conditions: migratedConditions, params: migratedParams }
}

function normalizeStage(stage, index, version) {
  const stageType = normalizeStageType(stage?.type)

  if (!stageType) {
    return null
  }

  const defaults = cloneStageDefaults(stageType)
  const migrated = migrateStageConfig({
    conditions: getPlainObject(stage?.conditions),
    params: getPlainObject(stage?.params),
    stageType,
    version,
  })

  return {
    conditions: {
      ...defaults.conditions,
      ...migrated.conditions,
    },
    id:
      slugify(stage?.id) ||
      slugify(`${stageType}-${index + 1}`) ||
      createId('stage'),
    params: {
      ...defaults.params,
      ...migrated.params,
    },
    type: stageType,
  }
}

function normalizePipeline(pipeline, index, version) {
  const stages = Array.isArray(pipeline?.stages)
    ? pipeline.stages
        .map((stage, stageIndex) => normalizeStage(stage, stageIndex, version))
        .filter(Boolean)
    : []

  if (!stages.length) {
    return null
  }

  const pipelineName = String(pipeline?.name || '').trim()
  const idBase =
    slugify(pipeline?.id) || slugify(pipelineName) || `pipeline-${index + 1}`

  return {
    enabled: pipeline?.enabled !== false,
    id: idBase || createId('pipeline'),
    name: pipelineName || buildPipelineNameFromStages(stages),
    stages,
  }
}

function buildDefaultPipelines() {
  const pipelines = []
  const canUseFal = Boolean(process.env.FAL_KEY)
  const canUseReplicate = Boolean(process.env.REPLICATE_API_TOKEN)
  const canUseOpenAI = Boolean(process.env.OPENAI_API_KEY)

  if (canUseFal) {
    pipelines.push({
      enabled: true,
      id: 'fal',
      name: 'fal + tone preserve',
      stages: [
        createStageConfig('analyze_photo', 'analyze-photo-1'),
        createStageConfig('fal', 'fal-1'),
        createStageConfig('postprocess_preserve', 'postprocess-preserve-3'),
      ],
    })
  }

  if (canUseFal && isCodeformerPipelineEnabled()) {
    pipelines.push({
      enabled: true,
      id: 'fal-codeformer',
      name: 'fal + CodeFormer (smart blend)',
      stages: [
        createStageConfig('analyze_photo', 'analyze-photo-1'),
        createStageConfig('fal', 'fal-2'),
        createStageConfig('replicate_codeformer', 'replicate-codeformer-3'),
        createStageConfig('postprocess_preserve', 'postprocess-preserve-4'),
      ],
    })
  }

  if (canUseReplicate) {
    pipelines.push({
      enabled: true,
      id: 'cheap-first',
      name: 'cheap-first old photo restore',
      stages: [
        createStageConfig('analyze_photo', 'analyze-photo-1'),
        createStageConfig(
          'replicate_old_photo_restoration',
          'replicate-old-photo-2'
        ),
        createStageConfig('postprocess_preserve', 'postprocess-preserve-3'),
      ],
    })
    pipelines.push({
      enabled: true,
      id: 'cheap-first-codeformer',
      name: 'cheap-first + CodeFormer',
      stages: [
        createStageConfig('analyze_photo', 'analyze-photo-1'),
        createStageConfig(
          'replicate_old_photo_restoration',
          'replicate-old-photo-2'
        ),
        createStageConfig('replicate_codeformer', 'replicate-codeformer-3'),
        createStageConfig('postprocess_preserve', 'postprocess-preserve-4'),
      ],
    })
    pipelines.push({
      enabled: true,
      id: 'codeformer',
      name: 'CodeFormer only',
      stages: [
        createStageConfig('analyze_photo', 'analyze-photo-1'),
        createStageConfig('replicate_codeformer', 'replicate-codeformer-2'),
        createStageConfig('postprocess_preserve', 'postprocess-preserve-3'),
      ],
    })
    pipelines.push({
      enabled: true,
      id: 'gfpgan',
      name: 'GFPGAN only',
      stages: [
        createStageConfig('analyze_photo', 'analyze-photo-1'),
        createStageConfig('replicate_gfpgan', 'replicate-gfpgan-2'),
        createStageConfig('postprocess_preserve', 'postprocess-preserve-3'),
      ],
    })
  }

  if (canUseOpenAI) {
    pipelines.push({
      enabled: true,
      id: 'openai',
      name: 'OpenAI',
      stages: [
        createStageConfig('analyze_photo', 'analyze-photo-1'),
        createStageConfig('openai', 'openai-2'),
        createStageConfig('postprocess_preserve', 'postprocess-preserve-3'),
      ],
    })
  }

  if (!pipelines.length) {
    pipelines.push({
      enabled: true,
      id: 'fallback-fal',
      name: 'fal + tone preserve',
      stages: [
        createStageConfig('analyze_photo', 'analyze-photo-1'),
        createStageConfig('fal', 'fal-2'),
        createStageConfig('postprocess_preserve', 'postprocess-preserve-3'),
      ],
    })
  }

  const requestedDefaultType = getConfiguredDefaultStageType()
  let defaultPipeline = null

  if (requestedDefaultType === 'fal' && isCodeformerPipelineEnabled()) {
    defaultPipeline = pipelines.find(
      pipeline => pipeline.id === 'fal-codeformer'
    )
  }

  if (requestedDefaultType === 'replicate_old_photo_restoration') {
    defaultPipeline = pipelines.find(
      pipeline => pipeline.id === 'cheap-first-codeformer'
    )
  }

  if (requestedDefaultType === 'replicate_codeformer') {
    defaultPipeline =
      pipelines.find(pipeline => pipeline.id === 'cheap-first-codeformer') ||
      pipelines.find(pipeline => pipeline.id === 'codeformer')
  }

  if (!defaultPipeline) {
    defaultPipeline =
      pipelines.find(
        pipeline =>
          pipeline.stages.length === 1 &&
          pipeline.stages[0]?.type === requestedDefaultType
      ) || pipelines[0]
  }

  return {
    defaultPipelineId: defaultPipeline?.id || pipelines[0].id,
    pipelines,
    updatedAt: new Date().toISOString(),
    version: configVersion,
  }
}

function appendMissingPipelineDefaults(pipelines, version) {
  const normalizedVersion = Number(version) || 0

  if (normalizedVersion >= configVersion) {
    return pipelines
  }

  const canUseReplicate = Boolean(process.env.REPLICATE_API_TOKEN)

  if (!canUseReplicate) {
    return pipelines
  }

  const nextPipelines = [...pipelines]
  const existingIds = new Set(nextPipelines.map(pipeline => pipeline.id))
  const candidateDefaults = [
    {
      enabled: true,
      id: 'cheap-first',
      name: 'cheap-first old photo restore',
      stages: [
        createStageConfig('analyze_photo', 'analyze-photo-1'),
        createStageConfig(
          'replicate_old_photo_restoration',
          'replicate-old-photo-2'
        ),
        createStageConfig('postprocess_preserve', 'postprocess-preserve-3'),
      ],
    },
    {
      enabled: true,
      id: 'cheap-first-codeformer',
      name: 'cheap-first + CodeFormer',
      stages: [
        createStageConfig('analyze_photo', 'analyze-photo-1'),
        createStageConfig(
          'replicate_old_photo_restoration',
          'replicate-old-photo-2'
        ),
        createStageConfig('replicate_codeformer', 'replicate-codeformer-3'),
        createStageConfig('postprocess_preserve', 'postprocess-preserve-4'),
      ],
    },
  ]

  for (const pipeline of candidateDefaults) {
    if (!existingIds.has(pipeline.id)) {
      nextPipelines.push(pipeline)
    }
  }

  return nextPipelines
}

export function normalizePipelineConfig(input) {
  const inputVersion = Number(input?.version) || 0
  const normalizedPipelines = Array.isArray(input?.pipelines)
    ? input.pipelines
        .map((pipeline, index) =>
          normalizePipeline(pipeline, index, inputVersion)
        )
        .filter(Boolean)
    : []

  const pipelines = normalizedPipelines.length
    ? normalizedPipelines
    : buildDefaultPipelines().pipelines
  const pipelinesWithSupplements = appendMissingPipelineDefaults(
    pipelines,
    inputVersion
  )
  const enabledPipelines = pipelinesWithSupplements.filter(
    pipeline => pipeline.enabled
  )
  const requestedDefault = String(input?.defaultPipelineId || '').trim()
  const defaultPipeline =
    enabledPipelines.find(pipeline => pipeline.id === requestedDefault) ||
    pipelinesWithSupplements.find(
      pipeline => pipeline.id === requestedDefault
    ) ||
    enabledPipelines[0] ||
    pipelinesWithSupplements[0]

  return {
    defaultPipelineId: defaultPipeline?.id || '',
    pipelines: pipelinesWithSupplements,
    updatedAt: new Date().toISOString(),
    version: configVersion,
  }
}

function isMissingObjectError(error) {
  const message = String(
    error instanceof Error ? error.message : error || ''
  ).toLowerCase()

  return (
    message.includes('not found') ||
    message.includes('no such object') ||
    message.includes('could not download stored object')
  )
}

export async function readPipelineConfig() {
  try {
    const storedEvent = await getLatestSystemEventByType(
      pipelineConfigEventType
    )
    const eventConfig = storedEvent?.metadata?.config

    if (eventConfig && typeof eventConfig === 'object') {
      return normalizePipelineConfig(eventConfig)
    }
  } catch {
    // fall through to legacy storage fallback
  }

  const storage = getPipelineConfigStorageRef()

  try {
    const stored = await downloadObject(storage)
    const parsed = JSON.parse(stored.buffer.toString('utf8'))

    return normalizePipelineConfig(parsed)
  } catch (error) {
    if (!isMissingObjectError(error)) {
      throw error
    }

    return buildDefaultPipelines()
  }
}

export async function writePipelineConfig(input) {
  const normalized = normalizePipelineConfig(input)

  const saved = await insertSystemEvent(pipelineConfigEventType, {
    config: normalized,
  })

  if (!saved) {
    throw new Error('Could not save restore pipeline config.')
  }

  return normalized
}

export function findPipelineById(config, pipelineId) {
  if (!pipelineId) {
    return null
  }

  return (
    config?.pipelines?.find(
      pipeline => String(pipeline.id) === String(pipelineId)
    ) || null
  )
}

export function getDefaultPipeline(config) {
  return (
    findPipelineById(config, config?.defaultPipelineId) ||
    config?.pipelines?.find(pipeline => pipeline.enabled) ||
    config?.pipelines?.[0] ||
    null
  )
}

export function buildLegacyRequestedPipeline({ modelPreset, provider }) {
  if (provider === 'openai') {
    return {
      enabled: true,
      id: 'legacy-openai',
      name: 'OpenAI',
      stages: [
        createStageConfig('analyze_photo', 'analyze-photo-1'),
        createStageConfig('openai', 'openai-2'),
        createStageConfig('postprocess_preserve', 'postprocess-preserve-3'),
      ],
    }
  }

  if (provider === 'fal') {
    return {
      enabled: true,
      id: isCodeformerPipelineEnabled()
        ? 'legacy-fal-codeformer'
        : 'legacy-fal',
      name: isCodeformerPipelineEnabled()
        ? 'fal + CodeFormer (smart blend)'
        : 'fal + tone preserve',
      stages: isCodeformerPipelineEnabled()
        ? [
            createStageConfig('analyze_photo', 'analyze-photo-1'),
            createStageConfig('fal', 'fal-2'),
            createStageConfig('replicate_codeformer', 'replicate-codeformer-3'),
            createStageConfig('postprocess_preserve', 'postprocess-preserve-4'),
          ]
        : [
            createStageConfig('analyze_photo', 'analyze-photo-1'),
            createStageConfig('fal', 'fal-2'),
            createStageConfig('postprocess_preserve', 'postprocess-preserve-3'),
          ],
    }
  }

  if (provider === 'replicate' || modelPreset) {
    const stageType =
      normalizeReplicatePreset(modelPreset) === 'old_photo_restoration'
        ? 'replicate_old_photo_restoration'
        : normalizeReplicatePreset(modelPreset) === 'gfpgan'
        ? 'replicate_gfpgan'
        : 'replicate_codeformer'

    return {
      enabled: true,
      id: `legacy-${stageType}`,
      name:
        stageType === 'replicate_gfpgan'
          ? 'GFPGAN only'
          : stageType === 'replicate_old_photo_restoration'
          ? 'cheap-first old photo restore'
          : 'CodeFormer only',
      stages: [
        createStageConfig('analyze_photo', 'analyze-photo-1'),
        createStageConfig(stageType, `${stageType}-2`),
        createStageConfig('postprocess_preserve', 'postprocess-preserve-3'),
      ],
    }
  }

  return null
}

export function summarizePipeline(pipeline) {
  if (!pipeline) {
    return ''
  }

  return pipeline.name || buildPipelineNameFromStages(pipeline.stages || [])
}

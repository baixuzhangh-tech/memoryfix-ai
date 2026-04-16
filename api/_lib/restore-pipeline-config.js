import crypto from 'crypto'
import { downloadObject, getHumanRestoreBuckets, uploadObject } from './supabase.js'

const configVersion = 1
const defaultReplicatePreset = 'codeformer'
const configPath =
  process.env.HUMAN_RESTORE_PIPELINE_CONFIG_PATH ||
  'config/ai-restore-pipelines.json'

const stageCatalog = {
  fal: {
    description: 'Run fal.ai old-photo restoration.',
    label: 'fal restoration',
    provider: 'fal',
    type: 'fal',
  },
  openai: {
    description: 'Run OpenAI image edit restoration.',
    label: 'OpenAI restoration',
    provider: 'openai',
    type: 'openai',
  },
  replicate_codeformer: {
    description: 'Run Replicate CodeFormer enhancement.',
    label: 'Replicate CodeFormer',
    modelPreset: 'codeformer',
    provider: 'replicate',
    type: 'replicate_codeformer',
  },
  replicate_gfpgan: {
    description: 'Run Replicate GFPGAN enhancement.',
    label: 'Replicate GFPGAN',
    modelPreset: 'gfpgan',
    provider: 'replicate',
    type: 'replicate_gfpgan',
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

  return ['codeformer', 'gfpgan'].includes(normalized)
    ? normalized
    : defaultReplicatePreset
}

function getConfiguredDefaultStageType() {
  const provider = String(process.env.AI_RESTORE_PROVIDER || '')
    .trim()
    .toLowerCase()

  if (provider === 'replicate') {
    return `replicate_${normalizeReplicatePreset(process.env.REPLICATE_DEFAULT_PRESET)}`
  }

  if (provider === 'fal') {
    return 'fal'
  }

  if (provider === 'openai') {
    return 'openai'
  }

  if (process.env.REPLICATE_API_TOKEN) {
    return `replicate_${normalizeReplicatePreset(process.env.REPLICATE_DEFAULT_PRESET)}`
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
      stage.provider === 'fal'
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

function normalizeStage(stage, index) {
  const stageType = normalizeStageType(stage?.type)

  if (!stageType) {
    return null
  }

  return {
    id:
      slugify(stage?.id) ||
      slugify(`${stageType}-${index + 1}`) ||
      createId('stage'),
    type: stageType,
  }
}

function normalizePipeline(pipeline, index) {
  const stages = Array.isArray(pipeline?.stages)
    ? pipeline.stages
        .map((stage, stageIndex) => normalizeStage(stage, stageIndex))
        .filter(Boolean)
    : []

  if (!stages.length) {
    return null
  }

  const pipelineName = String(pipeline?.name || '').trim()
  const idBase = slugify(pipeline?.id) || slugify(pipelineName) || `pipeline-${index + 1}`

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
      name: 'fal',
      stages: [{ id: 'fal-1', type: 'fal' }],
    })
  }

  if (canUseFal && isCodeformerPipelineEnabled()) {
    pipelines.push({
      enabled: true,
      id: 'fal-codeformer',
      name: 'fal + CodeFormer',
      stages: [
        { id: 'fal-1', type: 'fal' },
        { id: 'replicate-codeformer-2', type: 'replicate_codeformer' },
      ],
    })
  }

  if (canUseReplicate) {
    pipelines.push({
      enabled: true,
      id: 'codeformer',
      name: 'CodeFormer only',
      stages: [{ id: 'replicate-codeformer-1', type: 'replicate_codeformer' }],
    })
    pipelines.push({
      enabled: true,
      id: 'gfpgan',
      name: 'GFPGAN only',
      stages: [{ id: 'replicate-gfpgan-1', type: 'replicate_gfpgan' }],
    })
  }

  if (canUseOpenAI) {
    pipelines.push({
      enabled: true,
      id: 'openai',
      name: 'OpenAI',
      stages: [{ id: 'openai-1', type: 'openai' }],
    })
  }

  if (!pipelines.length) {
    pipelines.push({
      enabled: true,
      id: 'fallback-fal',
      name: 'fal',
      stages: [{ id: 'fal-1', type: 'fal' }],
    })
  }

  const requestedDefaultType = getConfiguredDefaultStageType()
  let defaultPipeline = null

  if (requestedDefaultType === 'fal' && isCodeformerPipelineEnabled()) {
    defaultPipeline = pipelines.find(pipeline => pipeline.id === 'fal-codeformer')
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

export function normalizePipelineConfig(input) {
  const normalizedPipelines = Array.isArray(input?.pipelines)
    ? input.pipelines
        .map((pipeline, index) => normalizePipeline(pipeline, index))
        .filter(Boolean)
    : []

  const pipelines = normalizedPipelines.length
    ? normalizedPipelines
    : buildDefaultPipelines().pipelines
  const enabledPipelines = pipelines.filter(pipeline => pipeline.enabled)
  const requestedDefault = String(input?.defaultPipelineId || '').trim()
  const defaultPipeline =
    enabledPipelines.find(pipeline => pipeline.id === requestedDefault) ||
    pipelines.find(pipeline => pipeline.id === requestedDefault) ||
    enabledPipelines[0] ||
    pipelines[0]

  return {
    defaultPipelineId: defaultPipeline?.id || '',
    pipelines,
    updatedAt: new Date().toISOString(),
    version: configVersion,
  }
}

function isMissingObjectError(error) {
  const message = String(error instanceof Error ? error.message : error || '').toLowerCase()

  return (
    message.includes('not found') ||
    message.includes('no such object') ||
    message.includes('could not download stored object')
  )
}

export async function readPipelineConfig() {
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
  const storage = getPipelineConfigStorageRef()

  await uploadObject({
    bucket: storage.bucket,
    contentType: 'application/json',
    data: Buffer.from(JSON.stringify(normalized, null, 2), 'utf8'),
    path: storage.path,
  })

  return normalized
}

export function findPipelineById(config, pipelineId) {
  if (!pipelineId) {
    return null
  }

  return (
    config?.pipelines?.find(pipeline => String(pipeline.id) === String(pipelineId)) ||
    null
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
      stages: [{ id: 'openai-1', type: 'openai' }],
    }
  }

  if (provider === 'fal') {
    return {
      enabled: true,
      id: isCodeformerPipelineEnabled()
        ? 'legacy-fal-codeformer'
        : 'legacy-fal',
      name: isCodeformerPipelineEnabled() ? 'fal + CodeFormer' : 'fal',
      stages: isCodeformerPipelineEnabled()
        ? [
            { id: 'fal-1', type: 'fal' },
            { id: 'replicate-codeformer-2', type: 'replicate_codeformer' },
          ]
        : [{ id: 'fal-1', type: 'fal' }],
    }
  }

  if (provider === 'replicate' || modelPreset) {
    const stageType =
      normalizeReplicatePreset(modelPreset) === 'gfpgan'
        ? 'replicate_gfpgan'
        : 'replicate_codeformer'

    return {
      enabled: true,
      id: `legacy-${stageType}`,
      name:
        stageType === 'replicate_gfpgan' ? 'GFPGAN only' : 'CodeFormer only',
      stages: [{ id: `${stageType}-1`, type: stageType }],
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

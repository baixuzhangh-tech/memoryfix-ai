import { useEffect, useMemo, useState } from 'react'

export type StageRecord = Record<string, unknown>

export type PipelineStage = {
  conditions: StageRecord
  id: string
  params: StageRecord
  type: string
}

export type RestorePipeline = {
  enabled: boolean
  id: string
  name: string
  stages: PipelineStage[]
}

export type RestorePipelineConfig = {
  defaultPipelineId: string
  pipelines: RestorePipeline[]
  updatedAt?: string
  version?: number
}

export type StageDefinition = {
  available?: boolean
  defaultConditions?: StageRecord
  defaultParams?: StageRecord
  description?: string
  label: string
  provider?: string
  type: string
}

type Props = {
  config: RestorePipelineConfig | null
  onChange: (nextConfig: RestorePipelineConfig) => void
  onReload: () => void
  onSave: () => void
  saving: boolean
  stageDefinitions: StageDefinition[]
}

type StageFieldErrors = Record<
  string,
  {
    conditions?: string
    params?: string
  }
>

function createLocalId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

function serializeStageRecord(value: StageRecord | undefined) {
  return JSON.stringify(value || {}, null, 2)
}

function getPlainObject(value: unknown): StageRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as StageRecord)
    : {}
}

function createStageFromDefinition(
  definition: StageDefinition | undefined,
  id: string
): PipelineStage {
  return {
    conditions: { ...getPlainObject(definition?.defaultConditions) },
    id,
    params: { ...getPlainObject(definition?.defaultParams) },
    type: definition?.type || 'fal',
  }
}

export default function AdminPipelineConfigurator({
  config,
  onChange,
  onReload,
  onSave,
  saving,
  stageDefinitions,
}: Props) {
  const [stageParamsText, setStageParamsText] = useState<
    Record<string, string>
  >({})
  const [stageConditionsText, setStageConditionsText] = useState<
    Record<string, string>
  >({})
  const [stageFieldErrors, setStageFieldErrors] = useState<StageFieldErrors>({})

  const availableStageDefinitions = useMemo(
    () => stageDefinitions.filter(stage => stage.available !== false),
    [stageDefinitions]
  )
  const stageDefinitionMap = useMemo(
    () =>
      stageDefinitions.reduce<Record<string, StageDefinition>>(
        (accumulator, stage) => {
          accumulator[stage.type] = stage
          return accumulator
        },
        {}
      ),
    [stageDefinitions]
  )
  const hasValidationErrors = useMemo(
    () =>
      Object.values(stageFieldErrors).some(entry =>
        Boolean(entry.conditions || entry.params)
      ),
    [stageFieldErrors]
  )

  useEffect(() => {
    if (!config) {
      return
    }

    const nextParamsText: Record<string, string> = {}
    const nextConditionsText: Record<string, string> = {}

    config.pipelines.forEach(pipeline => {
      pipeline.stages.forEach(stage => {
        nextParamsText[stage.id] = serializeStageRecord(stage.params)
        nextConditionsText[stage.id] = serializeStageRecord(stage.conditions)
      })
    })

    setStageParamsText(nextParamsText)
    setStageConditionsText(nextConditionsText)
    setStageFieldErrors({})
  }, [config])

  if (!config) {
    return (
      <section className="mt-8 rounded-[2rem] border border-[#e6d2b7] bg-white/85 p-8 shadow-2xl shadow-[#8a4f1d]/10">
        <p className="text-lg font-black text-[#211915]">
          Loading restore pipelines...
        </p>
      </section>
    )
  }

  const currentConfig = config

  function updatePipelines(
    updater: (pipelines: RestorePipeline[]) => RestorePipeline[]
  ) {
    const nextPipelines = updater(currentConfig.pipelines)
    const defaultPipelineExists = nextPipelines.some(
      pipeline =>
        pipeline.id === currentConfig.defaultPipelineId && pipeline.enabled
    )

    onChange({
      ...currentConfig,
      defaultPipelineId: defaultPipelineExists
        ? currentConfig.defaultPipelineId
        : nextPipelines.find(pipeline => pipeline.enabled)?.id ||
          nextPipelines[0]?.id ||
          '',
      pipelines: nextPipelines,
    })
  }

  function addPipeline() {
    const firstDefinition = availableStageDefinitions[0] || stageDefinitions[0]

    updatePipelines(current => [
      ...current,
      {
        enabled: true,
        id: createLocalId('pipeline'),
        name: 'New pipeline',
        stages: [
          createStageFromDefinition(firstDefinition, createLocalId('stage')),
        ],
      },
    ])
  }

  function addStage(pipelineId: string) {
    const firstDefinition = availableStageDefinitions[0] || stageDefinitions[0]

    updatePipelines(current =>
      current.map(pipeline =>
        pipeline.id !== pipelineId
          ? pipeline
          : {
              ...pipeline,
              stages: [
                ...pipeline.stages,
                createStageFromDefinition(
                  firstDefinition,
                  createLocalId('stage')
                ),
              ],
            }
      )
    )
  }

  function removePipeline(pipelineId: string) {
    updatePipelines(current =>
      current.filter(pipeline => pipeline.id !== pipelineId)
    )
  }

  function updatePipeline(pipelineId: string, patch: Partial<RestorePipeline>) {
    updatePipelines(current =>
      current.map(pipeline =>
        pipeline.id === pipelineId ? { ...pipeline, ...patch } : pipeline
      )
    )
  }

  function movePipeline(pipelineId: string, direction: -1 | 1) {
    updatePipelines(current => {
      const index = current.findIndex(pipeline => pipeline.id === pipelineId)

      if (index < 0) {
        return current
      }

      const nextIndex = index + direction

      if (nextIndex < 0 || nextIndex >= current.length) {
        return current
      }

      const next = [...current]
      const [item] = next.splice(index, 1)

      next.splice(nextIndex, 0, item)

      return next
    })
  }

  function updateStage(
    pipelineId: string,
    stageId: string,
    patch: Partial<PipelineStage>
  ) {
    updatePipelines(current =>
      current.map(pipeline =>
        pipeline.id !== pipelineId
          ? pipeline
          : {
              ...pipeline,
              stages: pipeline.stages.map(stage =>
                stage.id === stageId ? { ...stage, ...patch } : stage
              ),
            }
      )
    )
  }

  function removeStage(pipelineId: string, stageId: string) {
    updatePipelines(current =>
      current.map(pipeline =>
        pipeline.id !== pipelineId
          ? pipeline
          : {
              ...pipeline,
              stages: pipeline.stages.filter(stage => stage.id !== stageId),
            }
      )
    )
  }

  function moveStage(pipelineId: string, stageId: string, direction: -1 | 1) {
    updatePipelines(current =>
      current.map(pipeline => {
        if (pipeline.id !== pipelineId) {
          return pipeline
        }

        const index = pipeline.stages.findIndex(stage => stage.id === stageId)

        if (index < 0) {
          return pipeline
        }

        const nextIndex = index + direction

        if (nextIndex < 0 || nextIndex >= pipeline.stages.length) {
          return pipeline
        }

        const nextStages = [...pipeline.stages]
        const [item] = nextStages.splice(index, 1)

        nextStages.splice(nextIndex, 0, item)

        return {
          ...pipeline,
          stages: nextStages,
        }
      })
    )
  }

  function updateStageType(
    pipelineId: string,
    stageId: string,
    nextType: string
  ) {
    const definition = stageDefinitionMap[nextType]

    updateStage(
      pipelineId,
      stageId,
      createStageFromDefinition(definition, stageId)
    )
  }

  function updateStageJsonField(
    pipelineId: string,
    stageId: string,
    field: 'conditions' | 'params',
    text: string
  ) {
    const setTextState =
      field === 'params' ? setStageParamsText : setStageConditionsText

    setTextState(current => ({
      ...current,
      [stageId]: text,
    }))

    try {
      const parsed = text.trim() ? JSON.parse(text) : {}

      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Enter a JSON object like {"key": "value"}')
      }

      setStageFieldErrors(current => ({
        ...current,
        [stageId]: {
          ...current[stageId],
          [field]: '',
        },
      }))
      updateStage(pipelineId, stageId, {
        [field]: parsed,
      } as Partial<PipelineStage>)
    } catch (error) {
      setStageFieldErrors(current => ({
        ...current,
        [stageId]: {
          ...current[stageId],
          [field]:
            error instanceof Error
              ? error.message
              : 'Enter a valid JSON object.',
        },
      }))
    }
  }

  return (
    <section className="mt-8 rounded-[2rem] border border-[#e6d2b7] bg-white/85 p-8 shadow-2xl shadow-[#8a4f1d]/10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.24em] text-[#9b6b3c]">
            Restore pipelines
          </p>
          <h2 className="mt-4 text-3xl font-black tracking-tight text-[#211915]">
            Configure model order, params, and conditions.
          </h2>
          <p className="mt-3 max-w-3xl leading-7 text-[#66574d]">
            Each stage can now carry structured `params` and `conditions`.
            Internal stages like `Analyze photo` and `Tone preserve finish` help
            keep the final output conservative instead of over-generated.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={addPipeline}
            className="rounded-full border border-[#211915] px-6 py-3 font-black text-[#211915] transition hover:-translate-y-1 hover:bg-white"
          >
            Add pipeline
          </button>
          <button
            type="button"
            onClick={onReload}
            className="rounded-full border border-[#d7b98c] px-6 py-3 font-black text-[#5b4a40] transition hover:-translate-y-1 hover:bg-white"
          >
            Reload config
          </button>
          <button
            type="button"
            disabled={saving || hasValidationErrors}
            onClick={onSave}
            className="rounded-full bg-[#211915] px-6 py-3 font-black text-white shadow-xl shadow-[#211915]/20 transition hover:-translate-y-1 disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save pipelines'}
          </button>
        </div>
      </div>

      {hasValidationErrors && (
        <div className="mt-5 rounded-[1.25rem] border border-[#f0b5a9] bg-[#fff1ed] px-5 py-4 text-sm leading-6 text-[#8a2f1d]">
          Fix the invalid JSON fields before saving. Each `params` and
          `conditions` box must contain a JSON object.
        </div>
      )}

      <div className="mt-6 grid gap-5">
        {currentConfig.pipelines.map((pipeline, pipelineIndex) => (
          <article
            key={pipeline.id}
            className="rounded-[1.5rem] border border-[#e6d2b7] bg-[#fffaf3] p-5"
          >
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="grid flex-1 gap-4 md:grid-cols-[1.2fr_0.8fr]">
                <div className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-[0.14em] text-[#9b6b3c]">
                    Pipeline name
                  </span>
                  <input
                    value={pipeline.name}
                    onChange={event =>
                      updatePipeline(pipeline.id, {
                        name: event.currentTarget.value,
                      })
                    }
                    className="rounded-2xl border border-[#d7b98c] bg-white px-4 py-3 text-[#211915] outline-none transition focus:border-[#211915]"
                  />
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="grid gap-2">
                    <span className="text-xs font-black uppercase tracking-[0.14em] text-[#9b6b3c]">
                      Default
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        onChange({
                          ...currentConfig,
                          defaultPipelineId: pipeline.id,
                        })
                      }
                      className={[
                        'rounded-2xl border px-4 py-3 text-left font-black transition',
                        currentConfig.defaultPipelineId === pipeline.id
                          ? 'border-[#211915] bg-[#211915] text-white'
                          : 'border-[#d7b98c] bg-white text-[#211915] hover:bg-[#fffdf9]',
                      ].join(' ')}
                    >
                      {currentConfig.defaultPipelineId === pipeline.id
                        ? 'Default pipeline'
                        : 'Set as default'}
                    </button>
                  </div>
                  <div className="grid gap-2">
                    <span className="text-xs font-black uppercase tracking-[0.14em] text-[#9b6b3c]">
                      Status
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        updatePipeline(pipeline.id, {
                          enabled: !pipeline.enabled,
                        })
                      }
                      className={[
                        'rounded-2xl border px-4 py-3 text-left font-black transition',
                        pipeline.enabled
                          ? 'border-[#355322] bg-[#f4ffe8] text-[#355322]'
                          : 'border-[#d7b98c] bg-white text-[#66574d]',
                      ].join(' ')}
                    >
                      {pipeline.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => movePipeline(pipeline.id, -1)}
                  disabled={pipelineIndex === 0}
                  className="rounded-full border border-[#d7b98c] px-4 py-2 text-sm font-black text-[#5b4a40] transition hover:bg-white disabled:opacity-50"
                >
                  Move up
                </button>
                <button
                  type="button"
                  onClick={() => movePipeline(pipeline.id, 1)}
                  disabled={
                    pipelineIndex === currentConfig.pipelines.length - 1
                  }
                  className="rounded-full border border-[#d7b98c] px-4 py-2 text-sm font-black text-[#5b4a40] transition hover:bg-white disabled:opacity-50"
                >
                  Move down
                </button>
                <button
                  type="button"
                  onClick={() => addStage(pipeline.id)}
                  className="rounded-full border border-[#211915] px-4 py-2 text-sm font-black text-[#211915] transition hover:bg-white"
                >
                  Add stage
                </button>
                <button
                  type="button"
                  onClick={() => removePipeline(pipeline.id)}
                  disabled={currentConfig.pipelines.length <= 1}
                  className="rounded-full border border-[#f0b5a9] bg-[#fff1ed] px-4 py-2 text-sm font-black text-[#8a2f1d] transition hover:-translate-y-0.5 disabled:opacity-50"
                >
                  Delete pipeline
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-4">
              {pipeline.stages.map((stage, stageIndex) => {
                const definition = stageDefinitionMap[stage.type]
                const paramsError = stageFieldErrors[stage.id]?.params
                const conditionsError = stageFieldErrors[stage.id]?.conditions

                return (
                  <div
                    key={stage.id}
                    className="grid gap-4 rounded-[1.25rem] border border-[#e6d2b7] bg-white p-4"
                  >
                    <div className="grid gap-3 xl:grid-cols-[1.15fr_1fr_auto] xl:items-start">
                      <div className="grid gap-2">
                        <span className="text-xs font-black uppercase tracking-[0.14em] text-[#9b6b3c]">
                          Stage {stageIndex + 1}
                        </span>
                        <select
                          value={stage.type}
                          onChange={event =>
                            updateStageType(
                              pipeline.id,
                              stage.id,
                              event.currentTarget.value
                            )
                          }
                          className="rounded-2xl border border-[#d7b98c] bg-[#fffaf3] px-4 py-3 font-bold text-[#211915] outline-none"
                        >
                          {stageDefinitions.map(option => (
                            <option key={option.type} value={option.type}>
                              {option.label}
                              {option.available === false
                                ? ' (env missing)'
                                : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="grid gap-2 text-sm leading-6 text-[#66574d]">
                        <span className="text-xs font-black uppercase tracking-[0.14em] text-[#9b6b3c]">
                          Description
                        </span>
                        <p>
                          {definition?.description ||
                            'No description available.'}
                        </p>
                        <p className="text-xs uppercase tracking-[0.12em] text-[#9b6b3c]">
                          Provider: {definition?.provider || 'unknown'}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-start justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => moveStage(pipeline.id, stage.id, -1)}
                          disabled={stageIndex === 0}
                          className="rounded-full border border-[#d7b98c] px-4 py-2 text-sm font-black text-[#5b4a40] transition hover:bg-white disabled:opacity-50"
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          onClick={() => moveStage(pipeline.id, stage.id, 1)}
                          disabled={stageIndex === pipeline.stages.length - 1}
                          className="rounded-full border border-[#d7b98c] px-4 py-2 text-sm font-black text-[#5b4a40] transition hover:bg-white disabled:opacity-50"
                        >
                          Down
                        </button>
                        <button
                          type="button"
                          onClick={() => removeStage(pipeline.id, stage.id)}
                          disabled={pipeline.stages.length <= 1}
                          className="rounded-full border border-[#f0b5a9] bg-[#fff1ed] px-4 py-2 text-sm font-black text-[#8a2f1d] transition hover:-translate-y-0.5 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="grid gap-2">
                        <span className="text-xs font-black uppercase tracking-[0.14em] text-[#9b6b3c]">
                          Params JSON
                        </span>
                        <textarea
                          value={stageParamsText[stage.id] || '{}'}
                          onChange={event =>
                            updateStageJsonField(
                              pipeline.id,
                              stage.id,
                              'params',
                              event.currentTarget.value
                            )
                          }
                          className="min-h-[170px] rounded-2xl border border-[#d7b98c] bg-[#fffaf3] px-4 py-4 font-mono text-sm leading-6 text-[#211915] outline-none transition focus:border-[#211915]"
                        />
                        {paramsError ? (
                          <span className="text-sm text-[#8a2f1d]">
                            {paramsError}
                          </span>
                        ) : (
                          <span className="text-xs leading-5 text-[#66574d]">
                            Defaults fill in any missing keys. Keep this object
                            narrow and stage-specific.
                          </span>
                        )}
                      </div>

                      <div className="grid gap-2">
                        <span className="text-xs font-black uppercase tracking-[0.14em] text-[#9b6b3c]">
                          Conditions JSON
                        </span>
                        <textarea
                          value={stageConditionsText[stage.id] || '{}'}
                          onChange={event =>
                            updateStageJsonField(
                              pipeline.id,
                              stage.id,
                              'conditions',
                              event.currentTarget.value
                            )
                          }
                          className="min-h-[170px] rounded-2xl border border-[#d7b98c] bg-[#fffaf3] px-4 py-4 font-mono text-sm leading-6 text-[#211915] outline-none transition focus:border-[#211915]"
                        />
                        {conditionsError ? (
                          <span className="text-sm text-[#8a2f1d]">
                            {conditionsError}
                          </span>
                        ) : (
                          <span className="text-xs leading-5 text-[#66574d]">
                            Example:{' '}
                            <code>{'{"run_if_restore_need_above": 0.35}'}</code>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

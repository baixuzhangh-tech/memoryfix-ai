import crypto from 'crypto'
import sharp from 'sharp'

const defaultAnalysisWidth = 256
const defaultBlendMaxCoverage = 0.12
const defaultBlendMinDiff = 18
const defaultBlendBlur = 16
const defaultBlendAlpha = 0.38
const defaultGrainAmount = 0.035
const defaultGrainScale = 0.16
const defaultDeliveryJpegQuality = 97
const defaultDeliveryWebpQuality = 96

function normalizeRequestedFormat(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  if (['jpg', 'jpeg'].includes(normalized)) {
    return 'jpeg'
  }

  if (normalized === 'png') {
    return 'png'
  }

  if (normalized === 'webp') {
    return 'webp'
  }

  if (['auto', 'input', 'original', 'same'].includes(normalized)) {
    return 'auto'
  }

  return ''
}

function clampNumber(value, min, max, fallback) {
  const numericValue = Number(value)

  if (!Number.isFinite(numericValue)) {
    return fallback
  }

  return Math.min(max, Math.max(min, numericValue))
}

function getPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {}
}

function getPreferredOutputFormat(contentType, params = {}) {
  const requestedFormat = normalizeRequestedFormat(
    params.export_format || params.delivery_format
  )

  if (requestedFormat === 'jpeg') {
    return {
      contentType: 'image/jpeg',
      format: 'jpeg',
    }
  }

  if (requestedFormat === 'webp') {
    return {
      contentType: 'image/webp',
      format: 'webp',
    }
  }

  if (requestedFormat === 'png') {
    return {
      contentType: 'image/png',
      format: 'png',
    }
  }

  if (
    String(contentType || '')
      .toLowerCase()
      .includes('jpeg')
  ) {
    return {
      contentType: 'image/jpeg',
      format: 'jpeg',
    }
  }

  if (
    String(contentType || '')
      .toLowerCase()
      .includes('webp')
  ) {
    return {
      contentType: 'image/webp',
      format: 'webp',
    }
  }

  return {
    contentType: 'image/png',
    format: 'png',
  }
}

async function encodeOutputImage({ image, params = {}, preferredContentType }) {
  const format = getPreferredOutputFormat(preferredContentType, params)
  const jpegQuality = clampNumber(
    params.jpeg_quality,
    85,
    100,
    defaultDeliveryJpegQuality
  )
  const webpQuality = clampNumber(
    params.webp_quality,
    85,
    100,
    defaultDeliveryWebpQuality
  )
  const outputImage =
    params.preserve_metadata === false ? image : image.withMetadata()

  if (format.format === 'jpeg') {
    return {
      buffer: await outputImage
        .jpeg({
          chromaSubsampling: '4:4:4',
          mozjpeg: true,
          quality: jpegQuality,
        })
        .toBuffer(),
      contentType: format.contentType,
    }
  }

  if (format.format === 'webp') {
    return {
      buffer: await outputImage.webp({ quality: webpQuality }).toBuffer(),
      contentType: format.contentType,
    }
  }

  return {
    buffer: await outputImage
      .png({
        compressionLevel: 9,
        effort: 10,
        palette: false,
      })
      .toBuffer(),
    contentType: format.contentType,
  }
}

function getResizeKernel(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  return normalized === 'nearest'
    ? 'nearest'
    : normalized === 'cubic'
    ? 'cubic'
    : normalized === 'mitchell'
    ? 'mitchell'
    : normalized === 'lanczos2'
    ? 'lanczos2'
    : 'lanczos3'
}

async function readResizedRawImage({
  imageBuffer,
  maxWidth = defaultAnalysisWidth,
}) {
  const pipeline = sharp(imageBuffer, { failOn: 'none' }).rotate()
  const metadata = await pipeline.metadata()
  const width = metadata.width || 0
  const height = metadata.height || 0

  if (!width || !height) {
    throw new Error('Image metadata is unavailable.')
  }

  const targetWidth = Math.max(
    24,
    Math.min(width, clampNumber(maxWidth, 24, 1024, defaultAnalysisWidth))
  )
  const targetHeight = Math.max(24, Math.round((height / width) * targetWidth))
  const { data, info } = await pipeline
    .resize({
      fit: 'inside',
      height: targetHeight,
      width: targetWidth,
      withoutEnlargement: true,
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  return {
    buffer: data,
    channels: info.channels,
    height: info.height,
    metadata,
    width: info.width,
  }
}

function percentileFromSorted(values, percentile) {
  if (!values.length) {
    return 0
  }

  const index = Math.min(
    values.length - 1,
    Math.max(0, Math.round((values.length - 1) * percentile))
  )

  return values[index]
}

function average(values) {
  if (!values.length) {
    return 0
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function isPortraitFocusCoordinate(x, y, width, height) {
  const normalizedX = width > 1 ? x / (width - 1) : 0.5
  const normalizedY = height > 1 ? y / (height - 1) : 0.5

  return (
    normalizedX >= 0.08 &&
    normalizedX <= 0.92 &&
    normalizedY >= 0.04 &&
    normalizedY <= 0.76
  )
}

function computeGreenCastScore({ redMean, greenMean, blueMean }) {
  return clampNumber((greenMean - (redMean + blueMean) / 2) / 24, -2, 2, 0)
}

export function summarizeRestorationAnalysis(analysis) {
  if (!analysis?.valid) {
    return 'Analysis unavailable'
  }

  return [
    `detail ${analysis.detail_score.toFixed(2)}`,
    `damage ${analysis.damage_score.toFixed(2)}`,
    `contrast ${analysis.contrast_score.toFixed(2)}`,
    `need ${analysis.restore_need_score.toFixed(2)}`,
  ].join(' · ')
}

export async function analyzeRestorationImage({
  imageBuffer,
  params = {},
} = {}) {
  try {
    const raw = await readResizedRawImage({
      imageBuffer,
      maxWidth: params.downsample_width,
    })
    const lumaValues = []
    const portraitLumaValues = []
    const portraitNeighborDiffs = []
    const portraitSaturationValues = []
    const saturationValues = []
    const neighborDiffs = []
    let redSum = 0
    let greenSum = 0
    let blueSum = 0
    let portraitRedSum = 0
    let portraitGreenSum = 0
    let portraitBlueSum = 0
    let portraitPixelCount = 0
    let highlightCount = 0
    let shadowCount = 0

    for (let y = 0; y < raw.height; y += 1) {
      for (let x = 0; x < raw.width; x += 1) {
        const index = (y * raw.width + x) * raw.channels
        const r = raw.buffer[index]
        const g = raw.buffer[index + 1]
        const b = raw.buffer[index + 2]
        const luma = 0.299 * r + 0.587 * g + 0.114 * b
        const channelMax = Math.max(r, g, b)
        const channelMin = Math.min(r, g, b)
        const inPortraitFocus = isPortraitFocusCoordinate(
          x,
          y,
          raw.width,
          raw.height
        )

        lumaValues.push(luma)
        saturationValues.push((channelMax - channelMin) / 255)
        redSum += r
        greenSum += g
        blueSum += b

        if (inPortraitFocus) {
          portraitLumaValues.push(luma)
          portraitSaturationValues.push((channelMax - channelMin) / 255)
          portraitRedSum += r
          portraitGreenSum += g
          portraitBlueSum += b
          portraitPixelCount += 1
        }

        if (luma >= 242) {
          highlightCount += 1
        }

        if (luma <= 14) {
          shadowCount += 1
        }

        if (x < raw.width - 1) {
          const rightIndex = index + raw.channels
          const rightR = raw.buffer[rightIndex]
          const rightG = raw.buffer[rightIndex + 1]
          const rightB = raw.buffer[rightIndex + 2]
          neighborDiffs.push(
            (Math.abs(r - rightR) +
              Math.abs(g - rightG) +
              Math.abs(b - rightB)) /
              3
          )

          if (
            inPortraitFocus &&
            isPortraitFocusCoordinate(x + 1, y, raw.width, raw.height)
          ) {
            portraitNeighborDiffs.push(
              (Math.abs(r - rightR) +
                Math.abs(g - rightG) +
                Math.abs(b - rightB)) /
                3
            )
          }
        }

        if (y < raw.height - 1) {
          const downIndex = index + raw.width * raw.channels
          const downR = raw.buffer[downIndex]
          const downG = raw.buffer[downIndex + 1]
          const downB = raw.buffer[downIndex + 2]
          neighborDiffs.push(
            (Math.abs(r - downR) + Math.abs(g - downG) + Math.abs(b - downB)) /
              3
          )

          if (
            inPortraitFocus &&
            isPortraitFocusCoordinate(x, y + 1, raw.width, raw.height)
          ) {
            portraitNeighborDiffs.push(
              (Math.abs(r - downR) +
                Math.abs(g - downG) +
                Math.abs(b - downB)) /
                3
            )
          }
        }
      }
    }

    const lumaMean = average(lumaValues)
    const variance =
      lumaValues.reduce((sum, value) => sum + (value - lumaMean) ** 2, 0) /
      Math.max(1, lumaValues.length)
    const lumaStdDev = Math.sqrt(variance)
    const portraitLumaMean = average(portraitLumaValues)
    const portraitVariance =
      portraitLumaValues.reduce(
        (sum, value) => sum + (value - portraitLumaMean) ** 2,
        0
      ) / Math.max(1, portraitLumaValues.length)
    const portraitLumaStdDev = Math.sqrt(portraitVariance)
    const sortedLuma = [...lumaValues].sort((left, right) => left - right)
    const dynamicRange =
      (percentileFromSorted(sortedLuma, 0.95) -
        percentileFromSorted(sortedLuma, 0.05)) /
      255
    const redMean = redSum / Math.max(1, lumaValues.length)
    const greenMean = greenSum / Math.max(1, lumaValues.length)
    const blueMean = blueSum / Math.max(1, lumaValues.length)
    const portraitRedMean = portraitRedSum / Math.max(1, portraitPixelCount)
    const portraitGreenMean = portraitGreenSum / Math.max(1, portraitPixelCount)
    const portraitBlueMean = portraitBlueSum / Math.max(1, portraitPixelCount)
    const detailScore = clampNumber(average(neighborDiffs) / 24, 0, 1, 0)
    const portraitDetailScore = clampNumber(
      average(portraitNeighborDiffs) / 24,
      0,
      1,
      detailScore
    )
    const contrastScore = clampNumber(lumaStdDev / 64, 0, 1, 0)
    const portraitContrastScore = clampNumber(
      portraitLumaStdDev / 64,
      0,
      1,
      contrastScore
    )
    const saturationScore = clampNumber(
      average(saturationValues) * 2.5,
      0,
      1,
      0
    )
    const portraitSaturationScore = clampNumber(
      average(portraitSaturationValues) * 2.5,
      0,
      1,
      saturationScore
    )
    const clippedHighlights = highlightCount / Math.max(1, lumaValues.length)
    const crushedShadows = shadowCount / Math.max(1, lumaValues.length)
    const damageScore = clampNumber(
      clippedHighlights * 1.6 +
        crushedShadows * 1.2 +
        Math.max(0, 0.22 - dynamicRange) * 1.8,
      0,
      1,
      0
    )
    const restoreNeedScore = clampNumber(
      (1 - detailScore) * 0.55 + damageScore * 0.3 + (1 - contrastScore) * 0.15,
      0,
      1,
      0
    )

    const analysis = {
      clipped_highlights: Number(clippedHighlights.toFixed(4)),
      contrast_score: Number(contrastScore.toFixed(4)),
      damage_score: Number(damageScore.toFixed(4)),
      detail_score: Number(detailScore.toFixed(4)),
      downsampled_height: raw.height,
      downsampled_width: raw.width,
      dynamic_range_score: Number(dynamicRange.toFixed(4)),
      green_cast_score: Number(
        computeGreenCastScore({
          blueMean,
          greenMean,
          redMean,
        }).toFixed(4)
      ),
      height: raw.metadata.height || raw.height,
      mean_luma: Number((lumaMean / 255).toFixed(4)),
      portrait_contrast_score: Number(portraitContrastScore.toFixed(4)),
      portrait_detail_score: Number(portraitDetailScore.toFixed(4)),
      portrait_green_cast_score: Number(
        computeGreenCastScore({
          blueMean: portraitBlueMean,
          greenMean: portraitGreenMean,
          redMean: portraitRedMean,
        }).toFixed(4)
      ),
      portrait_mean_luma: Number((portraitLumaMean / 255).toFixed(4)),
      portrait_saturation_score: Number(portraitSaturationScore.toFixed(4)),
      restore_need_score: Number(restoreNeedScore.toFixed(4)),
      saturation_score: Number(saturationScore.toFixed(4)),
      shadows_score: Number(crushedShadows.toFixed(4)),
      valid: true,
      width: raw.metadata.width || raw.width,
    }

    return {
      ...analysis,
      height: raw.metadata.height || raw.height,
      summary: summarizeRestorationAnalysis(analysis),
      width: raw.metadata.width || raw.width,
    }
  } catch (error) {
    return {
      reason:
        error instanceof Error ? error.message : 'Could not decode image.',
      summary: 'Analysis unavailable',
      valid: false,
    }
  }
}

export function evaluateStageConditions({ analysis, conditions = {} } = {}) {
  const normalizedConditions = getPlainObject(conditions)
  const reasons = []
  let shouldRun = true

  if (!analysis?.valid) {
    if (normalizedConditions.require_valid_analysis === true) {
      return {
        analysis,
        reason: 'analysis_unavailable',
        shouldRun: false,
      }
    }

    return {
      analysis,
      reason: '',
      shouldRun: true,
    }
  }

  const comparisons = [
    [
      'run_if_detail_below',
      analysis.detail_score < Number(normalizedConditions.run_if_detail_below),
      'detail_not_low_enough',
    ],
    [
      'run_if_damage_above',
      analysis.damage_score >= Number(normalizedConditions.run_if_damage_above),
      'damage_not_high_enough',
    ],
    [
      'run_if_restore_need_above',
      analysis.restore_need_score >=
        Number(normalizedConditions.run_if_restore_need_above),
      'restore_need_not_high_enough',
    ],
    [
      'skip_if_detail_above',
      analysis.detail_score <=
        Number(normalizedConditions.skip_if_detail_above),
      'detail_already_strong',
    ],
    [
      'skip_if_damage_below',
      analysis.damage_score >=
        Number(normalizedConditions.skip_if_damage_below),
      'damage_below_threshold',
    ],
    [
      'skip_if_restore_need_below',
      analysis.restore_need_score >=
        Number(normalizedConditions.skip_if_restore_need_below),
      'restore_need_below_threshold',
    ],
  ]

  for (const [key, predicate, reason] of comparisons) {
    if (normalizedConditions[key] === undefined) {
      continue
    }

    if (
      key.startsWith('run_if_') &&
      Number.isFinite(Number(normalizedConditions[key])) &&
      !predicate
    ) {
      shouldRun = false
      reasons.push(reason)
    }

    if (
      key.startsWith('skip_if_') &&
      Number.isFinite(Number(normalizedConditions[key])) &&
      !predicate
    ) {
      shouldRun = false
      reasons.push(reason)
    }
  }

  return {
    analysis,
    reason: reasons.join(','),
    shouldRun,
  }
}

function clampInteger(value, min, max, fallback) {
  return Math.round(clampNumber(value, min, max, fallback))
}

function mergeNumericOverride(baseValue, delta, min, max, fallback) {
  return clampNumber(
    clampNumber(baseValue, min, max, fallback) + Number(delta || 0),
    min,
    max,
    fallback
  )
}

function mergeIntegerOverride(baseValue, delta, min, max, fallback) {
  return clampInteger(
    clampInteger(baseValue, min, max, fallback) +
      Math.round(Number(delta || 0)),
    min,
    max,
    fallback
  )
}

export function selectAdaptiveCodeformerProfile({
  analysis,
  params = {},
} = {}) {
  const forcedProfile = String(
    params.adaptive_profile || params.auto_profile || ''
  )
    .trim()
    .toLowerCase()

  if (
    ['conservative', 'balanced', 'strong_face'].includes(forcedProfile) &&
    forcedProfile !== 'auto'
  ) {
    return forcedProfile
  }

  if (!analysis?.valid) {
    return 'balanced'
  }

  if (
    analysis.detail_score >= 0.43 &&
    analysis.restore_need_score <= 0.33 &&
    analysis.damage_score <= 0.1
  ) {
    return 'conservative'
  }

  if (
    analysis.detail_score <= 0.3 ||
    analysis.restore_need_score >= 0.46 ||
    analysis.damage_score >= 0.16 ||
    (analysis.width >= 800 && analysis.detail_score <= 0.34)
  ) {
    return 'strong_face'
  }

  return 'balanced'
}

function buildAdaptiveCodeformerVariant({ analysis, baseParams, profile }) {
  const params = { ...getPlainObject(baseParams) }

  if (profile === 'conservative') {
    return {
      label: 'conservative',
      profile,
      params: {
        ...params,
        blend_alpha: mergeNumericOverride(
          params.blend_alpha,
          -0.08,
          0.05,
          1,
          0.6
        ),
        codeformer_fidelity: mergeNumericOverride(
          params.codeformer_fidelity,
          0.08,
          0,
          1,
          0.74
        ),
        diff_mask_blur: mergeNumericOverride(
          params.diff_mask_blur,
          1,
          0.3,
          64,
          defaultBlendBlur
        ),
        diff_mask_max_coverage: mergeNumericOverride(
          params.diff_mask_max_coverage,
          -0.05,
          0.01,
          0.45,
          defaultBlendMaxCoverage
        ),
        diff_mask_max_regions: mergeIntegerOverride(
          params.diff_mask_max_regions,
          -8,
          1,
          48,
          12
        ),
        diff_mask_min_diff: mergeNumericOverride(
          params.diff_mask_min_diff,
          2,
          4,
          96,
          defaultBlendMinDiff
        ),
        face_upsample: false,
        portrait_energy_max_cells: mergeIntegerOverride(
          params.portrait_energy_max_cells,
          -8,
          1,
          48,
          18
        ),
        upper_portrait_alpha_boost: mergeNumericOverride(
          params.upper_portrait_alpha_boost,
          -0.08,
          0,
          0.8,
          0
        ),
      },
    }
  }

  if (profile === 'strong_face') {
    const strongDelta =
      analysis?.valid && analysis.detail_score <= 0.26 ? 0.02 : 0

    return {
      label: 'strong_face',
      profile,
      params: {
        ...params,
        blend_alpha: mergeNumericOverride(
          params.blend_alpha,
          0.06 + strongDelta,
          0.05,
          1,
          0.6
        ),
        codeformer_fidelity: mergeNumericOverride(
          params.codeformer_fidelity,
          -0.06 - strongDelta,
          0,
          1,
          0.74
        ),
        diff_mask_blur: mergeNumericOverride(
          params.diff_mask_blur,
          -1,
          0.3,
          64,
          defaultBlendBlur
        ),
        diff_mask_max_coverage: mergeNumericOverride(
          params.diff_mask_max_coverage,
          0.04,
          0.01,
          0.45,
          defaultBlendMaxCoverage
        ),
        diff_mask_max_regions: mergeIntegerOverride(
          params.diff_mask_max_regions,
          6,
          1,
          48,
          12
        ),
        diff_mask_min_diff: mergeNumericOverride(
          params.diff_mask_min_diff,
          -2,
          4,
          96,
          defaultBlendMinDiff
        ),
        portrait_energy_max_cells: mergeIntegerOverride(
          params.portrait_energy_max_cells,
          6,
          1,
          48,
          18
        ),
        relaxed_diff_mask_max_regions: mergeIntegerOverride(
          params.relaxed_diff_mask_max_regions,
          6,
          1,
          64,
          32
        ),
        upper_portrait_alpha_boost: mergeNumericOverride(
          params.upper_portrait_alpha_boost,
          0.08,
          0,
          0.8,
          0
        ),
      },
    }
  }

  return {
    label: 'balanced',
    profile: 'balanced',
    params: {
      ...params,
    },
  }
}

export function buildAdaptiveCodeformerVariants({
  analysis,
  params = {},
} = {}) {
  const baseParams = getPlainObject(params)
  const selectedProfile = selectAdaptiveCodeformerProfile({
    analysis,
    params: baseParams,
  })
  const raceEnabled = baseParams.candidate_race_enabled !== false
  const maxVariants = clampInteger(
    baseParams.candidate_race_max_variants,
    1,
    3,
    selectedProfile === 'balanced' ? 3 : 2
  )
  const variantOrder =
    selectedProfile === 'conservative'
      ? ['conservative', 'balanced']
      : selectedProfile === 'strong_face'
      ? ['strong_face', 'balanced', 'conservative']
      : ['balanced', 'strong_face', 'conservative']
  const resolvedOrder = raceEnabled ? variantOrder : [selectedProfile]

  return {
    profile: selectedProfile,
    variants: resolvedOrder.slice(0, maxVariants).map(profile =>
      buildAdaptiveCodeformerVariant({
        analysis,
        baseParams,
        profile,
      })
    ),
  }
}

function getAdaptiveCoverageTarget(profile) {
  if (profile === 'conservative') {
    return { coverage: 0.018, regions: 6 }
  }

  if (profile === 'strong_face') {
    return { coverage: 0.072, regions: 18 }
  }

  return { coverage: 0.042, regions: 12 }
}

export async function scoreAdaptiveCodeformerCandidate({
  baseAnalysis,
  baseBuffer,
  blendResult,
  candidateBuffer,
  variant,
} = {}) {
  const resolvedBaseAnalysis =
    baseAnalysis?.valid === true
      ? baseAnalysis
      : await analyzeRestorationImage({ imageBuffer: baseBuffer })
  const candidateAnalysis = await analyzeRestorationImage({
    imageBuffer: candidateBuffer,
  })
  const target = getAdaptiveCoverageTarget(variant?.profile)
  const regionCoverage = Number(blendResult?.mask?.region_coverage) || 0
  const regionsKept = Number(blendResult?.mask?.regions_kept) || 0
  const applied = blendResult?.applied === true

  if (!candidateAnalysis.valid || !resolvedBaseAnalysis?.valid) {
    return {
      analysis: candidateAnalysis,
      metrics: {
        applied,
        region_coverage: regionCoverage,
        regions_kept: regionsKept,
      },
      score: applied ? 0.25 : -1.75,
    }
  }

  const detailGain =
    candidateAnalysis.detail_score - resolvedBaseAnalysis.detail_score
  const portraitDetailGain =
    (candidateAnalysis.portrait_detail_score ||
      candidateAnalysis.detail_score) -
    (resolvedBaseAnalysis.portrait_detail_score ||
      resolvedBaseAnalysis.detail_score)
  const contrastGain =
    candidateAnalysis.contrast_score - resolvedBaseAnalysis.contrast_score
  const portraitContrastGain =
    (candidateAnalysis.portrait_contrast_score ||
      candidateAnalysis.contrast_score) -
    (resolvedBaseAnalysis.portrait_contrast_score ||
      resolvedBaseAnalysis.contrast_score)
  const greenCastDelta =
    (candidateAnalysis.green_cast_score || 0) -
    (resolvedBaseAnalysis.green_cast_score || 0)
  const portraitGreenCastDelta =
    (candidateAnalysis.portrait_green_cast_score ||
      candidateAnalysis.green_cast_score ||
      0) -
    (resolvedBaseAnalysis.portrait_green_cast_score ||
      resolvedBaseAnalysis.green_cast_score ||
      0)
  const lumaShift = Math.abs(
    candidateAnalysis.mean_luma - resolvedBaseAnalysis.mean_luma
  )
  const saturationShift = Math.abs(
    candidateAnalysis.saturation_score - resolvedBaseAnalysis.saturation_score
  )
  const highlightDelta =
    candidateAnalysis.clipped_highlights -
    resolvedBaseAnalysis.clipped_highlights
  const shadowDelta =
    candidateAnalysis.shadows_score - resolvedBaseAnalysis.shadows_score
  const coverageDistance = Math.abs(regionCoverage - target.coverage)
  const coverageScore = Math.max(
    -0.6,
    1 -
      coverageDistance /
        Math.max(
          target.coverage,
          variant?.profile === 'conservative' ? 0.015 : 0.03
        )
  )
  const regionsScore = Math.min(1, regionsKept / Math.max(1, target.regions))
  const portraitPriorityWeight = clampNumber(
    variant?.params?.score_portrait_detail_weight,
    4,
    18,
    10.5
  )
  const portraitContrastWeight = clampNumber(
    variant?.params?.score_portrait_contrast_weight,
    0.5,
    6,
    2.2
  )
  const greenPenaltyWeight = clampNumber(
    variant?.params?.score_green_cast_penalty,
    1,
    16,
    8
  )
  const portraitGreenPenaltyWeight = clampNumber(
    variant?.params?.score_portrait_green_cast_penalty,
    1,
    18,
    10
  )
  const textureSpreadPenaltyWeight = clampNumber(
    variant?.params?.score_texture_spread_penalty,
    0.5,
    10,
    4.2
  )
  const textureSpread = Math.max(0, detailGain - portraitDetailGain)
  const score =
    (applied ? 1.15 : -1.75) +
    detailGain * 8 +
    portraitDetailGain * portraitPriorityWeight +
    Math.max(0, contrastGain) * 1.4 +
    Math.max(0, portraitContrastGain) * portraitContrastWeight +
    coverageScore * 0.9 +
    regionsScore * 0.55 +
    (blendResult?.mask?.selection_mode === 'portrait_energy_cells' ? 0.18 : 0) -
    Math.max(0, -detailGain) * 4 -
    Math.max(0, -portraitDetailGain) * 5.5 -
    Math.max(0, highlightDelta - 0.008) * 9 -
    Math.max(0, shadowDelta - 0.02) * 4.5 -
    Math.max(0, saturationShift - 0.06) * 4.5 -
    Math.max(0, lumaShift - 0.06) * 4.2 -
    Math.max(0, greenCastDelta) * greenPenaltyWeight -
    Math.max(0, portraitGreenCastDelta) * portraitGreenPenaltyWeight -
    Math.max(0, candidateAnalysis.green_cast_score - 0.08) * 5.4 -
    Math.max(0, candidateAnalysis.portrait_green_cast_score - 0.05) * 6.5 -
    textureSpread * textureSpreadPenaltyWeight -
    Math.max(0, regionCoverage - target.coverage * 2.5) * 8

  return {
    analysis: candidateAnalysis,
    metrics: {
      applied,
      contrast_gain: Number(contrastGain.toFixed(4)),
      detail_gain: Number(detailGain.toFixed(4)),
      green_cast_delta: Number(greenCastDelta.toFixed(4)),
      highlight_delta: Number(highlightDelta.toFixed(4)),
      luma_shift: Number(lumaShift.toFixed(4)),
      portrait_contrast_gain: Number(portraitContrastGain.toFixed(4)),
      portrait_detail_gain: Number(portraitDetailGain.toFixed(4)),
      portrait_green_cast_delta: Number(portraitGreenCastDelta.toFixed(4)),
      region_coverage: Number(regionCoverage.toFixed(4)),
      regions_kept: regionsKept,
      saturation_shift: Number(saturationShift.toFixed(4)),
      shadow_delta: Number(shadowDelta.toFixed(4)),
      texture_spread: Number(textureSpread.toFixed(4)),
    },
    score: Number(score.toFixed(4)),
  }
}

export function deriveAdaptiveFinishParams({ analysis, params = {} } = {}) {
  const baseParams = {
    ...getPlainObject(params),
  }

  if (baseParams.auto_finish_profile === false || !analysis?.valid) {
    return {
      params: baseParams,
      profile: 'manual_finish',
    }
  }

  const brightness = clampNumber(baseParams.brightness, 0.85, 1.15, 0.975)
  const contrast = clampNumber(baseParams.contrast, 0.85, 1.15, 1.01)
  const saturation = clampNumber(baseParams.saturation, 0.6, 1.2, 0.985)
  const warmth = clampNumber(baseParams.warmth, -0.2, 0.2, 0.055)
  const greenBalance = clampNumber(baseParams.green_balance, -0.2, 0.2, -0.045)
  const sharpenSigma = clampNumber(baseParams.sharpen_sigma, 0, 3, 0.7)
  const portraitDetailAlpha = clampNumber(
    baseParams.portrait_detail_alpha,
    0,
    0.45,
    0.18
  )
  const portraitDetailContrast = clampNumber(
    baseParams.portrait_detail_contrast,
    1,
    1.12,
    1.026
  )
  const portraitDetailSharpenSigma = clampNumber(
    baseParams.portrait_detail_sharpen_sigma,
    0,
    3,
    1.08
  )
  const portraitDetailSaturation = clampNumber(
    baseParams.portrait_detail_saturation,
    0.92,
    1.08,
    1
  )
  const portraitDetailFocus = clampNumber(
    baseParams.portrait_detail_focus,
    0.5,
    1,
    0.82
  )
  const greenCastScore = Math.max(
    0,
    analysis.green_cast_score || analysis.portrait_green_cast_score || 0
  )
  const portraitGreenCastScore = Math.max(
    0,
    analysis.portrait_green_cast_score || analysis.green_cast_score || 0
  )
  const portraitDetailScore =
    analysis.portrait_detail_score || analysis.detail_score
  const portraitContrastScore =
    analysis.portrait_contrast_score || analysis.contrast_score

  const adaptiveBrightness = clampNumber(
    brightness -
      Math.max(0, analysis.mean_luma - 0.49) * 0.08 +
      Math.max(0, 0.18 - analysis.saturation_score) * 0.02,
    0.9,
    1.04,
    brightness
  )
  const adaptiveContrast = clampNumber(
    contrast +
      Math.max(0, 0.42 - analysis.detail_score) * 0.08 +
      Math.max(0, 0.2 - portraitDetailScore) * 0.18 +
      Math.max(0, 0.28 - portraitContrastScore) * 0.08 +
      Math.max(0, analysis.mean_luma - 0.5) * 0.03,
    0.92,
    1.1,
    contrast
  )
  const adaptiveSaturation = clampNumber(
    saturation +
      Math.max(0, 0.16 - analysis.saturation_score) * 0.12 -
      greenCastScore * 0.03 -
      Math.max(0, analysis.clipped_highlights - 0.018) * 0.18,
    0.86,
    1.04,
    saturation
  )
  const adaptiveWarmth = clampNumber(
    warmth +
      Math.max(0, 0.2 - analysis.saturation_score) * 0.04 +
      greenCastScore * 0.03 +
      Math.max(0, analysis.mean_luma - 0.5) * 0.03,
    -0.04,
    0.14,
    warmth
  )
  const adaptiveGreenBalance = clampNumber(
    greenBalance -
      Math.max(0, analysis.mean_luma - 0.48) * 0.05 -
      greenCastScore * 0.11 -
      portraitGreenCastScore * 0.07,
    -0.16,
    0.04,
    greenBalance
  )
  const adaptiveSharpenSigma = clampNumber(
    sharpenSigma +
      Math.max(0, 0.42 - analysis.detail_score) * 1.1 +
      Math.max(0, 0.19 - portraitDetailScore) * 2.8,
    0,
    1.5,
    sharpenSigma
  )
  const adaptivePortraitDetailAlpha = clampNumber(
    portraitDetailAlpha +
      Math.max(0, 0.19 - portraitDetailScore) * 1.45 +
      greenCastScore * 0.18,
    0.08,
    0.34,
    portraitDetailAlpha
  )
  const adaptivePortraitDetailContrast = clampNumber(
    portraitDetailContrast +
      Math.max(0, 0.19 - portraitDetailScore) * 0.18 +
      Math.max(0, 0.3 - portraitContrastScore) * 0.08,
    1,
    1.08,
    portraitDetailContrast
  )
  const adaptivePortraitDetailSharpen = clampNumber(
    portraitDetailSharpenSigma +
      Math.max(0, 0.19 - portraitDetailScore) * 4.2 +
      greenCastScore * 0.35,
    0.6,
    1.8,
    portraitDetailSharpenSigma
  )
  const adaptivePortraitDetailSaturation = clampNumber(
    portraitDetailSaturation +
      Math.max(0, 0.14 - analysis.portrait_saturation_score) * 0.05 -
      greenCastScore * 0.02,
    0.98,
    1.03,
    portraitDetailSaturation
  )
  const profile =
    greenCastScore >= 0.09 ||
    analysis.mean_luma >= 0.53 ||
    analysis.saturation_score <= 0.16
      ? 'dehaze_portrait'
      : analysis.detail_score <= 0.34 || portraitDetailScore <= 0.17
      ? 'detail_lift'
      : 'balanced_finish'

  return {
    params: {
      ...baseParams,
      brightness: Number(adaptiveBrightness.toFixed(4)),
      contrast: Number(adaptiveContrast.toFixed(4)),
      green_balance: Number(adaptiveGreenBalance.toFixed(4)),
      portrait_detail_alpha: Number(adaptivePortraitDetailAlpha.toFixed(4)),
      portrait_detail_contrast: Number(
        adaptivePortraitDetailContrast.toFixed(4)
      ),
      portrait_detail_focus: Number(portraitDetailFocus.toFixed(4)),
      portrait_detail_max_x: Number(
        clampNumber(baseParams.portrait_detail_max_x, 0.55, 1, 0.94).toFixed(4)
      ),
      portrait_detail_min_x: Number(
        clampNumber(baseParams.portrait_detail_min_x, 0, 0.45, 0.06).toFixed(4)
      ),
      portrait_detail_saturation: Number(
        adaptivePortraitDetailSaturation.toFixed(4)
      ),
      portrait_detail_sharpen_sigma: Number(
        adaptivePortraitDetailSharpen.toFixed(4)
      ),
      saturation: Number(adaptiveSaturation.toFixed(4)),
      sharpen_sigma: Number(adaptiveSharpenSigma.toFixed(4)),
      warmth: Number(adaptiveWarmth.toFixed(4)),
    },
    profile,
  }
}

function findConnectedRegions({ height, mask, width }) {
  const visited = new Uint8Array(mask.length)
  const regions = []

  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index] || visited[index]) {
      continue
    }

    const queue = [index]
    visited[index] = 1
    const pixels = []
    let minX = width
    let minY = height
    let maxX = 0
    let maxY = 0

    while (queue.length) {
      const current = queue.pop()
      const x = current % width
      const y = Math.floor(current / width)

      pixels.push(current)
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)

      const neighbors = [
        current - 1,
        current + 1,
        current - width,
        current + width,
      ]

      for (const neighbor of neighbors) {
        if (neighbor < 0 || neighbor >= mask.length || visited[neighbor]) {
          continue
        }

        const neighborX = neighbor % width

        if (
          (neighbor === current - 1 && neighborX !== x - 1) ||
          (neighbor === current + 1 && neighborX !== x + 1)
        ) {
          continue
        }

        if (!mask[neighbor]) {
          continue
        }

        visited[neighbor] = 1
        queue.push(neighbor)
      }
    }

    regions.push({
      area: pixels.length,
      aspectRatio: (maxX - minX + 1) / Math.max(1, maxY - minY + 1),
      centerX: (minX + maxX) / 2 / Math.max(1, width - 1),
      centerY: (minY + maxY) / 2 / Math.max(1, height - 1),
      height: maxY - minY + 1,
      maxX,
      maxY,
      minX,
      minY,
      pixels,
      width: maxX - minX + 1,
    })
  }

  return regions
}

function selectRegionsForBlend({
  maxRegionRatio,
  maxRegions,
  minRegionRatio,
  mode,
  pixelCount,
  regions,
  verticalFocus,
}) {
  return regions
    .filter(region => {
      const areaRatio = region.area / Math.max(1, pixelCount)

      if (mode === 'relaxed_upper_portrait') {
        return (
          areaRatio >= minRegionRatio &&
          areaRatio <= maxRegionRatio &&
          region.aspectRatio >= 0.18 &&
          region.aspectRatio <= 4.8 &&
          region.centerY <= verticalFocus &&
          region.centerX >= 0.04 &&
          region.centerX <= 0.96
        )
      }

      return (
        areaRatio >= minRegionRatio &&
        areaRatio <= maxRegionRatio &&
        region.aspectRatio >= 0.35 &&
        region.aspectRatio <= 2.8 &&
        region.centerY <= verticalFocus
      )
    })
    .sort((left, right) => right.area - left.area)
    .slice(0, maxRegions)
}

function selectPortraitEnergyCells({
  diffMagnitudes,
  height,
  params = {},
  threshold,
  width,
}) {
  const cellSize = Math.round(
    clampNumber(
      params.portrait_energy_cell_size,
      6,
      48,
      Math.max(10, Math.round(width / 18))
    )
  )
  const maxCells = Math.round(
    clampNumber(params.portrait_energy_max_cells, 1, 36, 10)
  )
  const minDiff = clampNumber(
    params.portrait_energy_min_diff,
    2,
    48,
    Math.max(4, threshold * 0.45)
  )
  const minCellScore = clampNumber(
    params.portrait_energy_min_cell_score,
    1,
    40,
    Math.max(4.5, minDiff * 1.15)
  )
  const upperFocus = clampNumber(
    params.portrait_energy_upper_focus,
    0.55,
    1,
    0.98
  )
  const candidates = []
  const relaxedCandidates = []

  for (let startY = 0; startY < height; startY += cellSize) {
    for (let startX = 0; startX < width; startX += cellSize) {
      const cellWidth = Math.min(cellSize, width - startX)
      const cellHeight = Math.min(cellSize, height - startY)
      const area = Math.max(1, cellWidth * cellHeight)
      const centerX = (startX + cellWidth / 2) / Math.max(1, width - 1)
      const centerY = (startY + cellHeight / 2) / Math.max(1, height - 1)

      if (centerY > upperFocus || centerX < 0.03 || centerX > 0.97) {
        continue
      }

      let diffSum = 0
      let activeCount = 0
      let peakDiff = 0

      for (let y = startY; y < startY + cellHeight; y += 1) {
        for (let x = startX; x < startX + cellWidth; x += 1) {
          const diff = diffMagnitudes[y * width + x]

          diffSum += diff
          peakDiff = Math.max(peakDiff, diff)

          if (diff >= minDiff) {
            activeCount += 1
          }
        }
      }

      const meanDiff = diffSum / area
      const activeRatio = activeCount / area
      const portraitBias = 1 + Math.max(0, upperFocus - centerY) * 0.2
      const score =
        (meanDiff * (0.8 + activeRatio * 1.8) + peakDiff * 0.06) * portraitBias
      const minActiveCount = Math.max(4, Math.round(area * 0.04))
      const minRelaxedActiveCount = Math.max(2, Math.round(area * 0.02))
      const cell = {
        activeRatio,
        centerY,
        score,
        startX,
        startY,
        width: cellWidth,
        height: cellHeight,
      }

      if (activeCount >= minActiveCount && score >= minCellScore) {
        candidates.push(cell)
        continue
      }

      if (
        activeCount >= minRelaxedActiveCount &&
        score >= minCellScore * 0.78
      ) {
        relaxedCandidates.push(cell)
      }
    }
  }

  const selectedCells = (candidates.length ? candidates : relaxedCandidates)
    .sort((left, right) => right.score - left.score)
    .slice(0, maxCells)

  return {
    cells: selectedCells,
    threshold: minDiff,
  }
}

function buildDifferenceMask({ baseRaw, enhancedRaw, params = {} }) {
  const pixelCount = baseRaw.width * baseRaw.height
  const diffMagnitudes = new Float32Array(pixelCount)
  const sortedDiffs = []

  for (let i = 0; i < pixelCount; i += 1) {
    const index = i * baseRaw.channels
    const diff =
      (Math.abs(baseRaw.buffer[index] - enhancedRaw.buffer[index]) +
        Math.abs(baseRaw.buffer[index + 1] - enhancedRaw.buffer[index + 1]) +
        Math.abs(baseRaw.buffer[index + 2] - enhancedRaw.buffer[index + 2])) /
      3

    diffMagnitudes[i] = diff
    sortedDiffs.push(diff)
  }

  sortedDiffs.sort((left, right) => left - right)
  const maxCoverage = clampNumber(
    params.diff_mask_max_coverage,
    0.01,
    0.45,
    defaultBlendMaxCoverage
  )
  const minDiff = clampNumber(
    params.diff_mask_min_diff,
    4,
    96,
    defaultBlendMinDiff
  )
  const quantileThreshold = percentileFromSorted(sortedDiffs, 1 - maxCoverage)
  const threshold = Math.max(minDiff, quantileThreshold)
  const initialMask = new Uint8Array(pixelCount)
  let activePixels = 0

  for (let i = 0; i < pixelCount; i += 1) {
    if (diffMagnitudes[i] >= threshold) {
      initialMask[i] = 1
      activePixels += 1
    }
  }

  const regions = findConnectedRegions({
    height: baseRaw.height,
    mask: initialMask,
    width: baseRaw.width,
  })
  const minRegionRatio = clampNumber(
    params.diff_mask_min_region_ratio,
    0.0001,
    0.2,
    0.0006
  )
  const maxRegionRatio = clampNumber(
    params.diff_mask_max_region_ratio,
    0.005,
    0.4,
    0.09
  )
  const maxRegions = Math.round(
    clampNumber(params.diff_mask_max_regions, 1, 32, 12)
  )
  const verticalFocus = clampNumber(params.diff_mask_upper_focus, 0.55, 1, 0.92)
  let keptRegions = selectRegionsForBlend({
    maxRegionRatio,
    maxRegions,
    minRegionRatio,
    mode: 'strict_face_like',
    pixelCount,
    regions,
    verticalFocus,
  })
  let selectionMode = 'strict_face_like'
  let portraitEnergyCells = []
  let maskThreshold = threshold

  if (
    !keptRegions.length &&
    activePixels > 0 &&
    params.allow_relaxed_blend_fallback !== false
  ) {
    keptRegions = selectRegionsForBlend({
      maxRegionRatio: clampNumber(
        params.relaxed_diff_mask_max_region_ratio,
        0.02,
        0.4,
        Math.max(0.18, maxRegionRatio * 2)
      ),
      maxRegions: Math.round(
        clampNumber(
          params.relaxed_diff_mask_max_regions,
          maxRegions,
          48,
          Math.max(18, maxRegions)
        )
      ),
      minRegionRatio: clampNumber(
        params.relaxed_diff_mask_min_region_ratio,
        0.00005,
        0.05,
        Math.max(0.00015, minRegionRatio * 0.35)
      ),
      mode: 'relaxed_upper_portrait',
      pixelCount,
      regions,
      verticalFocus: clampNumber(
        params.relaxed_diff_mask_upper_focus,
        verticalFocus,
        1,
        Math.max(0.98, verticalFocus)
      ),
    })
    selectionMode = keptRegions.length
      ? 'relaxed_upper_portrait'
      : selectionMode
  }

  if (!keptRegions.length && params.allow_portrait_energy_fallback !== false) {
    const portraitEnergySelection = selectPortraitEnergyCells({
      diffMagnitudes,
      height: baseRaw.height,
      params,
      threshold,
      width: baseRaw.width,
    })

    if (portraitEnergySelection.cells.length) {
      portraitEnergyCells = portraitEnergySelection.cells
      maskThreshold = portraitEnergySelection.threshold
      selectionMode = 'portrait_energy_cells'
    }
  }

  const regionPixelSet = new Uint8Array(pixelCount)

  if (portraitEnergyCells.length) {
    for (const cell of portraitEnergyCells) {
      for (let y = cell.startY; y < cell.startY + cell.height; y += 1) {
        for (let x = cell.startX; x < cell.startX + cell.width; x += 1) {
          regionPixelSet[y * baseRaw.width + x] = 1
        }
      }
    }
  } else {
    for (const region of keptRegions) {
      for (const pixelIndex of region.pixels) {
        regionPixelSet[pixelIndex] = 1
      }
    }
  }

  const alphaScale = clampNumber(params.blend_alpha, 0.05, 1, defaultBlendAlpha)
  const maskRaw = Buffer.alloc(pixelCount)
  let keptPixelCount = 0
  const upperPortraitAlphaBoost = clampNumber(
    params.upper_portrait_alpha_boost,
    0,
    0.8,
    0
  )
  const upperPortraitAlphaFocus = clampNumber(
    params.upper_portrait_alpha_focus,
    0.55,
    1,
    0.9
  )
  const upperPortraitAlphaMinX = clampNumber(
    params.upper_portrait_alpha_min_x,
    0,
    0.45,
    0.08
  )
  const upperPortraitAlphaMaxX = clampNumber(
    params.upper_portrait_alpha_max_x,
    0.55,
    1,
    0.92
  )

  for (let i = 0; i < pixelCount; i += 1) {
    if (!regionPixelSet[i]) {
      continue
    }

    keptPixelCount += 1
    const normalized = Math.max(
      0,
      (diffMagnitudes[i] - maskThreshold) / Math.max(1, 255 - maskThreshold)
    )
    const x = (i % baseRaw.width) / Math.max(1, baseRaw.width - 1)
    const y = Math.floor(i / baseRaw.width) / Math.max(1, baseRaw.height - 1)
    const withinUpperPortraitBand =
      upperPortraitAlphaBoost > 0 &&
      y <= upperPortraitAlphaFocus &&
      x >= upperPortraitAlphaMinX &&
      x <= upperPortraitAlphaMaxX
    const portraitAlphaScale = withinUpperPortraitBand
      ? 1 +
        upperPortraitAlphaBoost *
          (1 - y / Math.max(upperPortraitAlphaFocus, 0.001)) *
          (1 - (Math.abs(x - 0.5) / 0.5) * 0.35)
      : 1
    maskRaw[i] = Math.round(
      Math.min(
        255,
        Math.pow(normalized || 0.2, 0.8) * 255 * alphaScale * portraitAlphaScale
      )
    )
  }

  return {
    activeCoverage: Number((activePixels / Math.max(1, pixelCount)).toFixed(4)),
    maskRaw,
    regionCoverage: Number(
      (keptPixelCount / Math.max(1, pixelCount)).toFixed(4)
    ),
    regionsKept: portraitEnergyCells.length || keptRegions.length,
    selectionMode,
    threshold: Number(maskThreshold.toFixed(2)),
  }
}

export async function applyReplicateEnhancementBlend({
  baseBuffer,
  baseContentType,
  enhancedBuffer,
  params = {},
} = {}) {
  const blendMode = String(params.blend_mode || 'difference_mask')
    .trim()
    .toLowerCase()

  if (blendMode === 'replace') {
    return {
      applied: true,
      buffer: enhancedBuffer,
      contentType: baseContentType,
      mode: 'replace',
      summary: 'Used enhanced image without local blending.',
    }
  }

  try {
    const baseMeta = await sharp(baseBuffer, { failOn: 'none' })
      .rotate()
      .metadata()
    const width = baseMeta.width || 0
    const height = baseMeta.height || 0

    if (!width || !height) {
      throw new Error('Base image metadata is unavailable.')
    }

    const baseAligned = await sharp(baseBuffer, { failOn: 'none' })
      .rotate()
      .resize(width, height)
      .png()
      .toBuffer()
    const enhancedAligned = await sharp(enhancedBuffer, { failOn: 'none' })
      .rotate()
      .resize(width, height)
      .png()
      .toBuffer()
    const analysisWidth = Math.max(64, Math.min(width, 320))
    const baseRaw = await readResizedRawImage({
      imageBuffer: baseAligned,
      maxWidth: analysisWidth,
    })
    const enhancedRaw = await readResizedRawImage({
      imageBuffer: enhancedAligned,
      maxWidth: analysisWidth,
    })
    const maskInfo = buildDifferenceMask({
      baseRaw,
      enhancedRaw,
      params,
    })

    if (!maskInfo.regionsKept || maskInfo.regionCoverage <= 0) {
      return {
        applied: false,
        buffer: baseBuffer,
        contentType: baseContentType,
        mode: 'difference_mask',
        reason: 'no_local_regions_detected',
        summary:
          'Kept the base restore because no face-like enhancement regions were detected.',
      }
    }

    const blurRadius = clampNumber(
      params.diff_mask_blur,
      0.3,
      64,
      defaultBlendBlur
    )
    const resizedMask = await sharp(maskInfo.maskRaw, {
      raw: {
        channels: 1,
        height: baseRaw.height,
        width: baseRaw.width,
      },
    })
      .resize(width, height)
      .blur(blurRadius)
      .png()
      .toBuffer()
    const maskedEnhancement = await sharp(enhancedAligned)
      .ensureAlpha()
      .composite([{ blend: 'dest-in', input: resizedMask }])
      .png()
      .toBuffer()
    const composited = sharp(baseAligned).composite([
      { input: maskedEnhancement },
    ])
    const output = await encodeOutputImage({
      image: composited,
      preferredContentType: baseContentType,
    })

    return {
      applied: true,
      buffer: output.buffer,
      contentType: output.contentType,
      mask: {
        active_coverage: maskInfo.activeCoverage,
        blur_radius: blurRadius,
        region_coverage: maskInfo.regionCoverage,
        regions_kept: maskInfo.regionsKept,
        selection_mode: maskInfo.selectionMode,
        threshold: maskInfo.threshold,
      },
      mode: 'difference_mask',
      summary:
        maskInfo.selectionMode === 'relaxed_upper_portrait'
          ? `Blended ${maskInfo.regionsKept} relaxed portrait enhancement regions back into the fal base.`
          : maskInfo.selectionMode === 'portrait_energy_cells'
          ? `Blended ${maskInfo.regionsKept} portrait energy cells back into the fal base.`
          : `Blended ${maskInfo.regionsKept} focused enhancement regions back into the fal base.`,
    }
  } catch (error) {
    return {
      applied: false,
      buffer: enhancedBuffer,
      contentType: baseContentType,
      mode: blendMode,
      reason: error instanceof Error ? error.message : 'Blend failed.',
      summary: 'Blend fallback used the provider output directly.',
    }
  }
}

function buildGrainOverlay({ grainAmount, grainScale, height, width }) {
  const grainWidth = Math.max(24, Math.round(width * grainScale))
  const grainHeight = Math.max(24, Math.round(height * grainScale))
  const alpha = Math.round(
    clampNumber(grainAmount, 0, 0.18, defaultGrainAmount) * 255
  )
  const overlay = Buffer.alloc(grainWidth * grainHeight * 4)
  const seed = crypto.randomBytes(8).readUInt32BE(0)
  let state = seed || 1

  function random() {
    state = (1103515245 * state + 12345) % 2147483647
    return state / 2147483647
  }

  for (let index = 0; index < grainWidth * grainHeight; index += 1) {
    const value = 112 + Math.round((random() - 0.5) * 90)
    const offset = index * 4

    overlay[offset] = value
    overlay[offset + 1] = value
    overlay[offset + 2] = value
    overlay[offset + 3] = alpha
  }

  return {
    buffer: overlay,
    channels: 4,
    height: grainHeight,
    width: grainWidth,
  }
}

function buildPortraitDetailMask({ height, params = {}, width }) {
  const alpha = clampNumber(params.portrait_detail_alpha, 0, 0.45, 0)

  if (alpha <= 0) {
    return null
  }

  const focusY = clampNumber(params.portrait_detail_focus, 0.5, 1, 0.82)
  const minX = clampNumber(params.portrait_detail_min_x, 0, 0.45, 0.06)
  const maxX = clampNumber(params.portrait_detail_max_x, 0.55, 1, 0.94)
  const centerBias = clampNumber(
    params.portrait_detail_center_bias,
    0,
    0.7,
    0.24
  )
  const mask = Buffer.alloc(width * height)

  for (let y = 0; y < height; y += 1) {
    const normalizedY = height > 1 ? y / (height - 1) : 0.5

    if (normalizedY > focusY) {
      continue
    }

    const verticalWeight = Math.pow(
      1 - normalizedY / Math.max(focusY, 0.001),
      0.72
    )

    for (let x = 0; x < width; x += 1) {
      const normalizedX = width > 1 ? x / (width - 1) : 0.5

      if (normalizedX < minX || normalizedX > maxX) {
        continue
      }

      const relativeX = (normalizedX - minX) / Math.max(0.001, maxX - minX)
      const centerDistance = Math.abs(relativeX - 0.5) / 0.5
      const centerWeight = clampNumber(
        1 - Math.pow(centerDistance, 1.1) * centerBias,
        0.58,
        1,
        1
      )
      mask[y * width + x] = Math.round(
        clampNumber(alpha * verticalWeight * centerWeight, 0, 1, 0) * 255
      )
    }
  }

  return mask
}

export async function applyVintageRestoreFinish({
  imageBuffer,
  inputContentType,
  params = {},
} = {}) {
  try {
    const baseImage = sharp(imageBuffer, { failOn: 'none' }).rotate()
    const metadata = await baseImage.metadata()
    const width = metadata.width || 0
    const height = metadata.height || 0

    if (!width || !height) {
      throw new Error('Image metadata is unavailable.')
    }

    const brightness = clampNumber(params.brightness, 0.85, 1.15, 0.99)
    const saturation = clampNumber(params.saturation, 0.6, 1.2, 0.96)
    const contrast = clampNumber(params.contrast, 0.85, 1.15, 0.985)
    const warmth = clampNumber(params.warmth, -0.2, 0.2, 0)
    const greenBalance = clampNumber(params.green_balance, -0.2, 0.2, 0)
    const sharpenSigma = clampNumber(params.sharpen_sigma, 0, 3, 0)
    const portraitDetailSharpenSigma = clampNumber(
      params.portrait_detail_sharpen_sigma,
      0,
      3,
      0
    )
    const portraitDetailContrast = clampNumber(
      params.portrait_detail_contrast,
      1,
      1.12,
      1
    )
    const portraitDetailSaturation = clampNumber(
      params.portrait_detail_saturation,
      0.92,
      1.08,
      1
    )
    let processed = baseImage
      .modulate({ brightness, saturation })
      .linear(contrast, 128 * (1 - contrast))

    if (warmth !== 0 || greenBalance !== 0) {
      const channelScale = [
        clampNumber(
          1 + warmth * 0.08 - Math.min(0, greenBalance) * 0.02,
          0.88,
          1.14,
          1
        ),
        clampNumber(1 + greenBalance * 0.08, 0.88, 1.12, 1),
        clampNumber(
          1 - warmth * 0.07 - Math.max(0, greenBalance) * 0.015,
          0.86,
          1.14,
          1
        ),
      ]

      processed = processed.linear(channelScale, [0, 0, 0])
    }

    if (sharpenSigma > 0) {
      processed = processed.sharpen(sharpenSigma, 1, 1.4)
    }

    let processedBuffer = await processed.png().toBuffer()
    const portraitDetailMask = buildPortraitDetailMask({
      height,
      params,
      width,
    })

    if (portraitDetailMask && portraitDetailSharpenSigma > 0) {
      const enhancedPortraitBuffer = await sharp(processedBuffer, {
        failOn: 'none',
      })
        .modulate({ saturation: portraitDetailSaturation })
        .linear(portraitDetailContrast, 128 * (1 - portraitDetailContrast))
        .sharpen(portraitDetailSharpenSigma, 1, 1.5)
        .png()
        .toBuffer()
      const maskedPortraitBuffer = await sharp(enhancedPortraitBuffer, {
        failOn: 'none',
      })
        .joinChannel(portraitDetailMask, {
          raw: {
            channels: 1,
            height,
            width,
          },
        })
        .png()
        .toBuffer()

      processedBuffer = await sharp(processedBuffer, { failOn: 'none' })
        .composite([{ blend: 'over', input: maskedPortraitBuffer }])
        .png()
        .toBuffer()
    }

    processed = sharp(processedBuffer, { failOn: 'none' })

    const grainAmount = clampNumber(
      params.grain_amount,
      0,
      0.18,
      defaultGrainAmount
    )

    if (grainAmount > 0) {
      const grain = buildGrainOverlay({
        grainAmount,
        grainScale: clampNumber(params.grain_scale, 0.08, 1, defaultGrainScale),
        height,
        width,
      })
      const grainOverlay = await sharp(grain.buffer, {
        raw: {
          channels: grain.channels,
          height: grain.height,
          width: grain.width,
        },
      })
        .resize(width, height)
        .png()
        .toBuffer()

      processedBuffer = await processed
        .composite([{ blend: 'soft-light', input: grainOverlay }])
        .png()
        .toBuffer()
      processed = sharp(processedBuffer, { failOn: 'none' })
    } else {
      processedBuffer = await processed.png().toBuffer()
      processed = sharp(processedBuffer, { failOn: 'none' })
    }

    const output = await encodeOutputImage({
      image: processed,
      params,
      preferredContentType: inputContentType,
    })

    return {
      applied: true,
      buffer: output.buffer,
      contentType: output.contentType,
      settings: {
        brightness,
        contrast,
        green_balance: greenBalance,
        grain_amount: grainAmount,
        portrait_detail_alpha: clampNumber(
          params.portrait_detail_alpha,
          0,
          0.45,
          0
        ),
        portrait_detail_contrast: portraitDetailContrast,
        portrait_detail_saturation: portraitDetailSaturation,
        portrait_detail_sharpen_sigma: portraitDetailSharpenSigma,
        sharpen_sigma: sharpenSigma,
        saturation,
        warmth,
      },
      summary:
        'Applied a conservative tone finish with portrait detail lift to preserve a restored-photo look.',
    }
  } catch (error) {
    return {
      applied: false,
      buffer: imageBuffer,
      contentType: inputContentType || 'image/png',
      reason: error instanceof Error ? error.message : 'Postprocess failed.',
      summary:
        'Skipped tone preserve finish because the image could not be decoded.',
    }
  }
}

export async function finalizeRestoredDeliveryImage({
  imageBuffer,
  inputContentType,
  originalBuffer,
  originalContentType,
  params = {},
} = {}) {
  try {
    const sourceImage = sharp(imageBuffer, { failOn: 'none' }).rotate()
    const sourceMetadata = await sourceImage.metadata()
    const sourceWidth = sourceMetadata.width || 0
    const sourceHeight = sourceMetadata.height || 0

    if (!sourceWidth || !sourceHeight) {
      throw new Error('Image metadata is unavailable.')
    }

    let targetWidth = sourceWidth
    let targetHeight = sourceHeight
    let minimumWidth = 0
    let minimumHeight = 0
    let scaleFactor = 1
    let resized = false

    if (
      (params.preserve_original_dimensions !== false ||
        params.upscale_to_original !== false) &&
      originalBuffer
    ) {
      try {
        const originalMetadata = await sharp(originalBuffer, {
          failOn: 'none',
        })
          .rotate()
          .metadata()

        minimumWidth = originalMetadata.width || 0
        minimumHeight = originalMetadata.height || 0

        if (
          minimumWidth &&
          minimumHeight &&
          (sourceWidth < minimumWidth || sourceHeight < minimumHeight)
        ) {
          scaleFactor = Math.max(
            minimumWidth / sourceWidth,
            minimumHeight / sourceHeight
          )
          targetWidth = Math.max(
            sourceWidth,
            Math.ceil(sourceWidth * scaleFactor)
          )
          targetHeight = Math.max(
            sourceHeight,
            Math.ceil(sourceHeight * scaleFactor)
          )
          resized = true
        }
      } catch {
        minimumWidth = 0
        minimumHeight = 0
      }
    }

    const needsFormatChange =
      getPreferredOutputFormat(originalContentType || inputContentType, params)
        .contentType !==
      getPreferredOutputFormat(inputContentType, {}).contentType

    if (!resized && !needsFormatChange && params.preserve_metadata !== true) {
      return {
        applied: false,
        buffer: imageBuffer,
        contentType: inputContentType || 'image/png',
        export: {
          minimum_height: minimumHeight,
          minimum_width: minimumWidth,
          output_height: sourceHeight,
          output_width: sourceWidth,
          resized,
          scale_factor: Number(scaleFactor.toFixed(4)),
          source_height: sourceHeight,
          source_width: sourceWidth,
        },
        summary: 'Kept the finished image as-is for delivery.',
      }
    }

    let processed = sharp(imageBuffer, { failOn: 'none' }).rotate()

    if (resized) {
      processed = processed.resize({
        fit: 'fill',
        height: targetHeight,
        kernel: getResizeKernel(params.resize_kernel),
        width: targetWidth,
      })
    }

    const output = await encodeOutputImage({
      image: processed,
      params,
      preferredContentType: originalContentType || inputContentType,
    })
    const outputMetadata = await sharp(output.buffer, { failOn: 'none' })
      .rotate()
      .metadata()

    return {
      applied: true,
      buffer: output.buffer,
      contentType: output.contentType,
      export: {
        minimum_height: minimumHeight,
        minimum_width: minimumWidth,
        output_height: outputMetadata.height || targetHeight,
        output_width: outputMetadata.width || targetWidth,
        resized,
        scale_factor: Number(scaleFactor.toFixed(4)),
        source_height: sourceHeight,
        source_width: sourceWidth,
      },
      summary: resized
        ? 'Upscaled the restored result to meet the original delivery size floor.'
        : 'Re-encoded the restored result with the configured delivery export profile.',
    }
  } catch (error) {
    return {
      applied: false,
      buffer: imageBuffer,
      contentType: inputContentType || 'image/png',
      export: {
        resized: false,
      },
      reason:
        error instanceof Error ? error.message : 'Delivery export failed.',
      summary:
        'Skipped the delivery export upgrade because the image could not be decoded.',
    }
  }
}

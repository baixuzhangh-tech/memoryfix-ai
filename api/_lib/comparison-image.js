import sharp from 'sharp'

const labelHeight = 28
const dividerWidth = 3
const maxDimension = 560
const bgColor = { r: 34, g: 25, b: 21 }
const dividerColor = { r: 230, g: 210, b: 183 }

function createLabelSvg(text, width) {
  return Buffer.from(`
    <svg width="${width}" height="${labelHeight}">
      <rect width="${width}" height="${labelHeight}" fill="rgb(${bgColor.r},${bgColor.g},${bgColor.b})" />
      <text
        x="${width / 2}"
        y="${labelHeight / 2 + 1}"
        text-anchor="middle"
        dominant-baseline="central"
        font-family="Arial, Helvetica, sans-serif"
        font-size="13"
        font-weight="bold"
        letter-spacing="3"
        fill="rgb(${dividerColor.r},${dividerColor.g},${dividerColor.b})"
      >${text}</text>
    </svg>
  `)
}

export async function buildComparisonImage({
  originalBuffer,
  resultBuffer,
}) {
  const originalMeta = await sharp(originalBuffer).metadata()
  const resultMeta = await sharp(resultBuffer).metadata()

  const origW = originalMeta.width || 800
  const origH = originalMeta.height || 600

  const isLandscape = origW >= origH

  const targetW = Math.min(origW, maxDimension)
  const targetH = Math.round(targetW * (origH / origW))

  const originalResized = await sharp(originalBuffer)
    .resize(targetW, targetH, { fit: 'cover' })
    .jpeg({ quality: 82 })
    .toBuffer()

  const resultResized = await sharp(resultBuffer)
    .resize(targetW, targetH, { fit: 'cover' })
    .jpeg({ quality: 82 })
    .toBuffer()

  if (isLandscape) {
    const canvasWidth = targetW * 2 + dividerWidth
    const canvasHeight = targetH + labelHeight

    const beforeLabel = createLabelSvg('BEFORE', targetW)
    const afterLabel = createLabelSvg('AFTER', targetW)

    const divider = await sharp({
      create: {
        width: dividerWidth,
        height: targetH + labelHeight,
        channels: 3,
        background: dividerColor,
      },
    })
      .jpeg()
      .toBuffer()

    return sharp({
      create: {
        width: canvasWidth,
        height: canvasHeight,
        channels: 3,
        background: bgColor,
      },
    })
      .composite([
        { input: await sharp(beforeLabel).png().toBuffer(), top: 0, left: 0 },
        {
          input: await sharp(afterLabel).png().toBuffer(),
          top: 0,
          left: targetW + dividerWidth,
        },
        { input: originalResized, top: labelHeight, left: 0 },
        { input: divider, top: 0, left: targetW },
        {
          input: resultResized,
          top: labelHeight,
          left: targetW + dividerWidth,
        },
      ])
      .jpeg({ quality: 82 })
      .toBuffer()
  }

  const canvasWidth = targetW
  const canvasHeight = targetH * 2 + labelHeight * 2 + dividerWidth

  const beforeLabel = createLabelSvg('BEFORE', targetW)
  const afterLabel = createLabelSvg('AFTER', targetW)

  const divider = await sharp({
    create: {
      width: targetW,
      height: dividerWidth,
      channels: 3,
      background: dividerColor,
    },
  })
    .jpeg()
    .toBuffer()

  return sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 3,
      background: bgColor,
    },
  })
    .composite([
      { input: await sharp(beforeLabel).png().toBuffer(), top: 0, left: 0 },
      { input: originalResized, top: labelHeight, left: 0 },
      { input: divider, top: labelHeight + targetH, left: 0 },
      {
        input: await sharp(afterLabel).png().toBuffer(),
        top: labelHeight + targetH + dividerWidth,
        left: 0,
      },
      {
        input: resultResized,
        top: labelHeight * 2 + targetH + dividerWidth,
        left: 0,
      },
    ])
    .jpeg({ quality: 82 })
    .toBuffer()
}

#!/usr/bin/env node
/**
 * Pre-render the AI HD preview watermark as a transparent PNG tile.
 *
 * WHY: sharp on Vercel serverless has no system fonts, so SVG <text>
 * composites render as empty (silent). We bake the text into a PNG
 * here (on a dev machine where fonts exist) and commit the result
 * as a static asset. At runtime the preview pipeline composites this
 * PNG over the resized draft — no font lookup needed at runtime.
 *
 * Output: api/_lib/assets/watermark-tile.png
 *
 * Run locally with: node scripts/build-watermark-tile.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import sharp from 'sharp'

const outPath = resolve(
  process.cwd(),
  'api/_lib/assets/watermark-tile.png'
)
mkdirSync(dirname(outPath), { recursive: true })

// Tile dimensions cover our preview long-edge (1280px). We make a
// 1600 x 1200 tile so it fits portrait OR landscape previews after
// a simple center crop at composite time. Text is rendered at an
// angle so the watermark is diagonal when the tile is composited
// flat — no runtime rotation required.
const tileW = 1600
const tileH = 1200
const watermarkText = 'MemoryFix AI   ·   Preview   ·   Pay $6.90 to unlock HD'
const lineHeight = 170 // px between diagonal text rows
const angleDeg = -28
const textStripWidth = 2600
const textFontSize = 46

// Render one TRANSPARENT-BACKGROUND row of text using sharp.text. The
// resulting PNG has white glyphs on alpha=0 background, which we then
// rotate + tile via an SVG overlay. No font is required at runtime —
// glyphs are already rasterised into pixels.
const textRow = await sharp({
  text: {
    text: watermarkText,
    font: 'sans 46',
    rgba: true,
    width: textStripWidth,
    spacing: 18,
  },
})
  .png()
  .toBuffer()

const { height: textRowHeight } = await sharp(textRow).metadata()
const textRowBase64 = textRow.toString('base64')

// Stack multiple rotated copies vertically. Each uses the pre-rendered
// PNG row so no font is needed at composite time on the server.
const rows = []
for (let y = -lineHeight; y < tileH + lineHeight * 2; y += lineHeight) {
  const offsetX = (y / lineHeight) % 2 === 0 ? 0 : Math.round(textStripWidth / 5)
  const rowX = -300 + offsetX
  rows.push(
    `<image href="data:image/png;base64,${textRowBase64}" x="${rowX}" y="${y}" width="${textStripWidth}" height="${textRowHeight}" opacity="0.55" transform="rotate(${angleDeg} ${rowX} ${y})" />`
  )
}

const svg = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${tileW}" height="${tileH}">${rows.join(
    ''
  )}</svg>`
)

const tilePng = await sharp(svg).png().toBuffer()
writeFileSync(outPath, tilePng)
console.log(
  `Wrote ${outPath}  (${tilePng.length} bytes, text row ${textStripWidth}x${textRowHeight}, font ${textFontSize}px)`
)

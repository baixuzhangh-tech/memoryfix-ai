/**
 * Diagonal repeating watermark for AI HD preview images.
 *
 * The preview a customer sees BEFORE paying $6.90 must be visually
 * useful (so they can decide if they want to pay) but unusable as
 * a final asset. We overlay a translucent PNG tile with the brand
 * name + "Pay to unlock" tiled diagonally across the entire image.
 *
 * IMPORTANT: Vercel's Node serverless runtime has no system fonts,
 * so sharp's SVG <text> rasterisation silently produces empty glyphs
 * (the previous implementation shipped a watermark PNG with no
 * visible text on it). We sidestep that entirely by shipping a
 * pre-rendered transparent PNG tile at build time
 * (`scripts/build-watermark-tile.mjs` → `assets/watermark-tile.png`)
 * and simply compositing it over the resized draft at runtime.
 *
 * Output is a JPEG buffer scaled to a 1280px long edge so the
 * preview file is small enough to load fast on mobile while still
 * showing AI restoration quality.
 */

import sharp from 'sharp'

import { watermarkTileBase64 } from './assets/watermark-tile.b64.js'

const previewLongEdge = 1280

// The watermark PNG is inlined as a base64 constant inside a sibling
// JS module. A previous version read the PNG off disk via readFileSync
// — that worked locally but failed on Vercel because @vercel/nft did
// not trace the PNG into the serverless function bundle, making the
// module crash at import time with ENOENT and taking every endpoint
// that touches this file down with it. Inlining avoids all filesystem
// concerns; a JS `import` is always bundled.
const watermarkTileBuffer = Buffer.from(watermarkTileBase64, 'base64')

/**
 * Resize input image to a max long edge of `previewLongEdge` and
 * composite a diagonal watermark on top. Returns a JPEG buffer.
 *
 * Throws if the input cannot be decoded by Sharp.
 */
export async function watermarkPreview(inputBuffer) {
  const meta = await sharp(inputBuffer).rotate().metadata()
  const sourceW = meta.width || previewLongEdge
  const sourceH = meta.height || previewLongEdge

  const longEdge = Math.max(sourceW, sourceH)
  const scale = longEdge > previewLongEdge ? previewLongEdge / longEdge : 1
  const targetW = Math.max(1, Math.round(sourceW * scale))
  const targetH = Math.max(1, Math.round(sourceH * scale))

  const resized = await sharp(inputBuffer)
    .rotate()
    .resize(targetW, targetH, { fit: 'inside' })
    .jpeg({ quality: 78 })
    .toBuffer()

  // fit: 'inside' preserves aspect ratio, so the actual output width /
  // height can be smaller than (targetW, targetH) by a pixel or two.
  // Use the resized buffer's real dimensions so the composited overlay
  // always matches and sharp does not throw 'Image to composite must
  // have same dimensions or smaller'.
  const resizedMeta = await sharp(resized).metadata()
  const overlayW = resizedMeta.width || targetW
  const overlayH = resizedMeta.height || targetH

  // Scale the watermark tile to fully cover the preview: pick the
  // larger axis scale factor so the tile never leaves bare corners,
  // then center-crop via sharp.resize(fit:cover).
  const watermarkOverlay = await sharp(watermarkTileBuffer)
    .resize(overlayW, overlayH, { fit: 'cover', position: 'center' })
    .png()
    .toBuffer()

  return sharp(resized)
    .composite([{ input: watermarkOverlay, top: 0, left: 0 }])
    .jpeg({ quality: 78 })
    .toBuffer()
}

export const previewWatermarkContentType = 'image/jpeg'

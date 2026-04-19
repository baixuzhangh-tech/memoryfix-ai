#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { watermarkPreview } from '../../api/_lib/watermark.js'

const here = dirname(fileURLToPath(import.meta.url))
const draft = readFileSync(
  resolve(here, '516b0e1b-01a6-41f3-b99e-ed5aec2fb952-ai-draft.png')
)
const out = await watermarkPreview(draft)
const outPath = resolve(here, 'test-watermarked.jpg')
writeFileSync(outPath, out)
console.log(`Wrote ${outPath}  (${out.length} bytes)`)

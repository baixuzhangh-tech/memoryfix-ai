# MemoryFix AI

MemoryFix AI is a privacy-first old photo repair product experiment built on
top of the open-source [inpaint-web](https://github.com/lxfater/inpaint-web)
project.

The goal is to help users repair small damaged areas and upscale old family
photos inside the browser, without uploading private memories to a cloud AI
service.

## Product Positioning

```text
Repair scratches and upscale old photos privately in your browser.
No upload. No account. No cloud processing.
```

## Current MVP Scope

- Browser-side image selection
- Local inpainting for scratched or damaged areas
- Local 4x super-resolution workflow
- Before/after editor inherited from `inpaint-web`
- Editor onboarding guide for first-time users
- Privacy-first landing page
- Privacy / Terms / Open Source launch trust notes
- Vercel Web Analytics page view tracking and product funnel events
- Pricing validation section for Free Local, Family Pack, and Album Pack
- Human-assisted Restore CTA for opt-in upload and manual review
- Human Restore success page with secure post-payment upload
- Supabase-backed paid restore job queue
- Cloud AI restore processing with human review before delivery
- Admin review page at `/admin/review`
- GPL-3.0 open-source attribution

## Product Boundary

The current local model is useful but not magical. Position it as a
privacy-first repair toolkit, not a one-click perfect restoration engine.

Best fit:

- Small scratches
- Stains and fold marks
- Small damaged areas
- Low-resolution scans that need upscaling

Not the current best fit:

- Severely damaged faces
- Large missing facial regions
- Perfect historical reconstruction
- Fully automatic one-click restoration

For stronger results, the product direction is an opt-in `Human-assisted Restore`
workflow where users explicitly consent before any upload happens.

Paid restore workflow:

```text
Lemon Squeezy checkout
-> secure upload page
-> Supabase Storage + restore job record
-> cloud AI restoration
-> admin before/after review
-> approve and send result download link by email
-> delete files after the 30-day retention window
```

Pricing validation structure:

- `Free Local` - `$0`, private browser repair for small damage
- `Family Pack` - `$9`, 10 restore credits for HD / Pro workflows
- `Album Pack` - `$19`, 30 restore credits for family albums
- `Human-assisted Restore` - `$19/photo`, separate high-intent CTA for one important photo

## Technical Notes

Photos are processed locally in the browser. The first run still needs network
access to download ONNX Runtime and model files. Model files are cached locally
with `localforage` after download.

Do not claim that the app is fully offline on first load. The accurate promise
is:

```text
Your photos are processed locally in your browser.
Your photos are not uploaded.
```

## Open Source Attribution

This project is a modified version of
[lxfater/inpaint-web](https://github.com/lxfater/inpaint-web), which is licensed
under GPL-3.0. The browser-side core should remain open source under GPL-3.0.

Original acknowledgements from `inpaint-web` include:

- Frontend foundation from [cleanup.pictures](https://github.com/initml/cleanup.pictures)
- Inpainting model from [Picsart-AI-Research/MI-GAN](https://github.com/Picsart-AI-Research/MI-GAN)

## Local Development

```bash
npm install --ignore-scripts
npm run dev
npm run check:human-restore-env
npm run test:human-restore
npm run build
npm run preview:local
```

The original `paraglide` remote plugin generation has been replaced by local
static i18n shims in `src/paraglide` to avoid install-time CDN failures.

## Analytics

Vercel Web Analytics is wired through `@vercel/analytics`.

Tracked product events do not include image content, private filenames, or user
identifiers. The current funnel events cover:

- `visit_home`
- `click_sample_photo`
- `upload_photo`
- `model_cache_hit`
- `model_download_started`
- `model_download_completed`
- `model_download_failed`
- `repair_started`
- `repair_completed`
- `repair_failed`
- `upscale_started`
- `upscale_completed`
- `upscale_failed`
- `download_result`
- `toggle_original_compare`
- `click_human_restore`
- `view_human_restore_success`
- `view_human_restore_secure_upload`
- `submit_human_restore_upload_started`
- `submit_human_restore_upload_completed`
- `submit_human_restore_upload_failed`
- `view_admin_review`

## Deployment

The app is a static Vite build.

```bash
npm run deploy:check
npm run check:human-restore-env
npm run test:human-restore
```

Use these settings for the first launch:

- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm install --ignore-scripts`
- Human Restore checkout URL: the $19.90/photo flow points to Lemon Squeezy by default, and can be overridden with `VITE_EARLY_ACCESS_URL`
- Local Pack checkout URL: set `VITE_LOCAL_REPAIR_PACK_URL` to the $9.90 / 10 local repair credits Lemon Squeezy checkout URL
- Local repair quota: the browser-local MVP uses `localStorage` for 3 free starts and purchased local credits on the same device
- Success page path: `/human-restore/success`
- Secure upload path: `/human-restore/upload`
- Admin review path: `/admin/review`
- Supabase setup SQL: `supabase/human-restore.sql`

Current checkout:

```text
https://artgen.lemonsqueezy.com/checkout/buy/092746e8-e559-4bca-96d0-abe3df4df268
```

Recommended success redirect:

```text
https://artgen.site/human-restore/success
```

Required production services for the paid workflow:

- Lemon Squeezy for checkout and webhooks
- Supabase Database + Storage for private originals, AI results, and job state
- OpenAI or fal.ai for cloud restoration
- Resend for secure upload, confirmation, and delivery emails

Keep real secrets out of Git. Use `.env.local` locally and Vercel Environment
Variables in production.

## Validation Notes

See [`docs/phase-1-tech-validation.md`](docs/phase-1-tech-validation.md) for the
initial technical validation.
See [`docs/phase-3-launch-prep.md`](docs/phase-3-launch-prep.md) for the launch
preparation checklist.

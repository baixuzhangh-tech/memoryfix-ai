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
- Pricing validation section for Free Local, Local Pack, and Human-assisted Restore
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
pre-checkout photo upload
-> Paddle checkout webhook
-> Supabase Storage + restore job record
-> cloud AI restoration
-> admin before/after review
-> approve and send result download link by email
-> delete files after the 30-day retention window
```

Pricing validation structure:

- `Free Local` - `$0`, 3 private browser-local repairs
- `Local Pack` - `$9.90`, 10 extra browser-local repair credits
- `Human-assisted Restore` - `$19.90/photo`, cloud AI draft plus human review for one important photo

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
- Paddle checkout: set `VITE_PADDLE_CLIENT_TOKEN`, `VITE_PADDLE_HUMAN_RESTORE_PRICE_ID`, and `VITE_PADDLE_LOCAL_PACK_PRICE_ID` after Paddle onboarding is approved
- Paid CTA fallback: set `VITE_HUMAN_RESTORE_CONTACT_EMAIL` so customers see a safe early-access contact while Paddle is pending
- Local repair quota: the browser-local MVP uses `localStorage` for 3 free starts and purchased local credits on the same device
- Success page path: `/human-restore/success`
- Secure upload path: `/human-restore/upload`
- Admin review path: `/admin/review`
- Supabase setup SQL: `supabase/human-restore.sql`

Recommended success redirect:

```text
https://artgen.site/human-restore/success
```

Required production services for the paid workflow:

- Paddle for checkout and webhooks
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

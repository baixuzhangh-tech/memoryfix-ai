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
- Pricing validation section for future Pro workflows
- Advanced Cloud Restore waitlist concept for stronger opt-in restoration
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

For stronger results, the product direction is an opt-in `Advanced Cloud Restore` workflow where users explicitly consent before any upload happens.

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
npm run build
npm run preview:local
```

The original `paraglide` remote plugin generation has been replaced by local
static i18n shims in `src/paraglide` to avoid install-time CDN failures.

## Deployment

The app is a static Vite build.

```bash
npm run deploy:check
```

Use these settings for the first launch:

- Build command: `npm run build`
- Output directory: `dist`
- Optional paid validation URL: set `VITE_EARLY_ACCESS_URL` to a Stripe Payment Link, Lemon Squeezy checkout URL, or other hosted checkout page

If `VITE_EARLY_ACCESS_URL` is not set, the early access button falls back to a
mailto waitlist link.

## Validation Notes

See [`docs/phase-1-tech-validation.md`](docs/phase-1-tech-validation.md) for the
initial technical validation.
See [`docs/phase-3-launch-prep.md`](docs/phase-3-launch-prep.md) for the launch
preparation checklist.

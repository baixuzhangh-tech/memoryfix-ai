# Case Material Audit

Last updated: 2026-04-18

## Goal

Choose before/after materials that are safe for first-customer acquisition in the US/Europe:

- strong before/after contrast
- emotionally legible in under 3 seconds
- commercially reusable
- honest to present on a sales page
- suitable for case-study SEO pages, Pinterest pins, Reels, TikToks, Reddit posts

## Decision Rule

Every asset should be placed in one of three buckets:

1. `Use now`
   Meaning: safe to present as a product-led example on landing pages, case-study pages, social content, and SEO pages.
2. `Use with clear attribution only`
   Meaning: useful as archive/reference content, but not safe to present as our own product output.
3. `Do not use for paid acquisition`
   Meaning: the source, realism, or trust signal is too weak for first-customer conversion.

## Audit Result

### Use now

1. `old-family-scratched-sofia-wallin-B.jpg` -> `old-family-scratched-sofia-wallin-A.png`

- Why: strongest in-house family-oriented before/after pair in the repo
- Why it works: visible surface damage, strong emotional family framing, high-resolution output, vertical aspect works for Pins/Reels
- Recommended uses:
  - homepage hero
  - first case-study page
  - Pinterest pin
  - 15-second Reel/TikTok

2. `old-family-worthington-1910-B.png` -> `old-family-worthington-1910-A.png`

- Why: real family portrait feel, clean framing, believable restoration result
- Why it works: good search intent fit for `family portrait restoration`, `old photo restoration`, `1910 family photo`
- Recommended uses:
  - pricing support image
  - second case-study page
  - Facebook genealogy groups
  - Reddit discussion posts

### Use with clear attribution only

The following pairs are public-domain/open-access archive restoration references from Wikimedia Commons and are already documented in `public/examples/restoration-pairs.manifest.json`.

- `pair-carver-1910-*`
- `pair-woolf-1902-*`
- `pair-cameron-met-*`
- `pair-nielsen-1908-*`
- `pair-fleetwood-*`
- `pair-li-fu-lee-*`
- `pair-earle-coates-*`

Why they are not safe as primary sales cases:

- the restored `after` images are not documented in this repo as our pipeline outputs
- using them as if they were our own customer results would weaken trust
- they are still useful as:
  - archive-reference blog posts
  - educational content about restoration styles
  - attributed public-domain inspiration content

Required labeling if used:

- `Public-domain archive restoration reference`
- never: `Our result`, `Restored by MemoryFix AI`, `Customer result`

### Do not use for paid acquisition

1. `pexels-suzyhazelwood-B.jpg` -> `pexels-suzyhazelwood-A.png`

- Why not: visually strong, but reads as a modern staged image artificially aged rather than a genuine heirloom photo
- Risk: weakens credibility for old-photo restoration positioning
- Allowed use:
  - internal demo only
  - visual QA / tuning only

2. `istockphoto-B.jpg` -> `istockphoto-A.png`

- Why not: source/license provenance is not documented strongly enough in the repo
- Risk: stock-origin ambiguity on a commercial landing page
- Allowed use:
  - internal testing only until provenance and rights are documented

## Source Queue Already In Repo

These are promising originals but do not yet have a clearly documented in-house restored pair ready for acquisition use:

- `old-family-abigail-campbell.jpg`
- `old-family-gatekeeper-china.jpg`
- `old-family-kaarlo-vesala.jpg`
- `old-family-rawson-daughter.jpg`
- `pair-curtis-inupiat-before.jpg`

Recommendation:

- run these through the current paid restoration pipeline
- review outputs manually
- promote only the pairs that preserve identity and show a clear visible lift

## Changes Applied

To reduce trust risk immediately:

- homepage hero now uses the Sofia Wallin in-house pair
- landing gallery now labels cards as either `Product case` or `Archive ref`
- public-domain archive restoration references remain available, but are no longer implied to be first-party outcomes

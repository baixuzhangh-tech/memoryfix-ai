# Reddit Post 02 — r/SideProject "Show" launch

**Subreddit:** `r/SideProject`
**Post type:** Text post with image
**Best time:** Wednesday 10:00 AM ET
**Image to attach:** Side-by-side **Fleetwood** pair

- Before: `artgen.site/examples/old-photos/pair-fleetwood-before.jpg`
- After: `artgen.site/examples/new-photos/pair-fleetwood-after.jpg`

---

## Title

**A.** I launched MemoryFix — AI photo restoration where you see a watermarked preview BEFORE you pay. $6.90 AI, $29 with a human-in-the-loop. [technical + commercial details inside]

**B.** Built an old-photo restorer. Most interesting decision: mandatory free preview before any payment. Sharing results + tech stack + what I'd do differently.

---

## Body

**What it is:** <https://artgen.site/ai-hd> — upload an old photo, get a
watermarked preview for free, pay $6.90 if you want the HD file (or $29 for
human-assisted restoration).

**Why a free preview is the whole product:** in this category, "upload and
hope" services have killed customer trust. I wanted buyers to evaluate the
actual output on their actual photo before committing a card. Preview costs
me ~$0.02 in inference (fal-hosted CodeFormer); buyer conversion on people
who like the preview is high (~30% in early tests), so the unit economics
work even with 3 free previews per IP per day as an abuse guard.

**Stack**

- Frontend: Vite + React + shadcn/ui on Vercel
- Backend: Vercel serverless functions (13 → trimmed to 12 after I hit the
  Hobby plan limit mid-launch, fun)
- AI pipeline: fal.ai (CodeFormer)
- Storage: Supabase (private buckets, signed URLs)
- Payments: Paddle (Merchant of Record, so I don't have to handle sales tax
  in 40+ jurisdictions at $6.90 AOV)
- Email: Resend with a domain I now know very well how to verify

**Three decisions I'm most happy I made**

1. **Free watermarked preview is non-negotiable.** Conversion on people who
   saw a good preview is ~30%. Conversion on "pay $6.90 and trust me" would
   have been ~1% or refund-heavy.
2. **Two tiers, both visible.** AI-only is $6.90; AI + human reviewer is
   $29. Most photo-restoration services hide the human option or overcharge
   for it. Seeing both prices lets the buyer self-select.
3. **Paddle, not Stripe.** I shipped in 3 weekends because I didn't write a
   line of tax code. Worth the higher fee.

**Three things that hurt**

1. **Resend spam filters.** Took 2 days to find that one of my env vars had
   a trailing `\n` and was silently failing Resend's `reply_to` validation
   for every single auto-delivery email. 21 customers stuck in limbo until I
   found it. I now have defensive sanitization on every outbound.
2. **Vercel Hobby 12-function cap.** Had to collapse a stub function and
   add a rewrite to stay under the limit. Don't design for it, just be
   ready to collapse routes when you hit the wall.
3. **Image alignment in the before/after slider.** Original uploads and
   AI outputs don't always have the same aspect ratio → `object-cover` was
   cropping the two halves to different crops, which made restored photos
   look like different people. Fix: measure natural aspect ratio on load,
   apply it to the container, use `object-contain`.

**What I'd do differently**

Ship analytics on day 1. I shipped without and spent two weeks blind.
Plausible takes 10 minutes to add.

**What's next (month 2)**

- Meta Ads targeting Ancestry.com / family-history interests
- SEO content (10 long-tail how-to articles)
- Product Hunt launch
- B2B partnerships with funeral homes and memorial services

Happy to answer any technical / commercial question. The tool is live, the
preview is free, and I'd genuinely rather someone try it on their grandma's
scanned photo than take my word for it.

---

## First pinned comment

> If you want to just see the result without reading the rest of the
> thread: <https://artgen.site/ai-hd> → upload → wait ~60s → watermarked
> preview appears. No card, no email for the preview.

## Reply bank

### "What's your CAC?"

> Not enough data yet to answer honestly. Currently $0 because I haven't
> started paid ads — this post is part of the organic bootstrap. I'll come
> back with real numbers after 2 weeks of Meta + Reddit traffic.

### "Why not Stripe?"

> Short answer: Paddle is Merchant of Record, so I don't file taxes in
> 40 jurisdictions on $6.90 digital goods. Higher per-transaction fee but
> I'd have lost weeks on Stripe Tax + Stripe Billing + VAT MOSS + etc.
> For sub-$50 AOV digital products, Paddle/LemonSqueezy/Gumroad dominate.

### "How much revenue?"

> Too early to share meaningfully — the product has been live for a few
> weeks. I'll do a 90-day retrospective with real numbers. Right now the
> honest answer is "the unit economics check out; the question is
> acquisition cost."

### "How do you handle refund requests?"

> Haven't had any yet — the free preview filters out "I thought it would
> do X" before money changes hands. If someone asks, I honor it no
> questions asked. At $6.90 the cost of being generous is trivial; the
> cost of one bad review is not.

### "What's stopping me from just saving the watermarked preview?"

> Nothing technically, but the watermark is diagonally tiled across the
> whole image at significant opacity — it makes the preview unusable as
> a final asset. If someone still tries to use it, that's fine, they're
> not my customer.

### "Why the 3-previews-per-IP limit?"

> Anti-abuse. In testing, one tab-happy user kept running the same photo
> through 40 times because the preview was "almost right but not quite."
> Inference at scale isn't free. 3/day is enough for normal use and cheap
> for me to absorb.

### "Is this open source?"

> The restoration model is fal-hosted CodeFormer (open weights, open
> paper). My wrapper, watermarking pipeline, and payment/delivery flow
> are closed source for now. If someone wants the watermark-tile
> generation code specifically I'd open-source that module on its own.

---

## After-post actions

1. Pinned comment within 2 min
2. Respond to every comment within 1 hour for the first 4 hours — r/SideProject
   rewards engagement velocity heavily
3. After 24h: if >100 upvotes, cross-post to `r/IndieHackers` (a separate
   site, not a subreddit) and to `r/EntrepreneurRideAlong` with modified
   intro

# Reddit Post 01 — r/photorestoration launch

**Subreddit:** `r/photorestoration`
**Post type:** Text post with image
**Best time:** Tuesday 9:00 AM ET
**Image to attach:** Side-by-side of the **Worthington 1910** pair

- Before: `artgen.site/examples/old-photos/old-family-worthington-1910-B.png`
- After: `artgen.site/examples/new-photos/old-family-worthington-1910-A.png`
- Assemble into one image per `assets-index.md` (2 min in Keynote / Figma)

---

## Title (pick ONE — first option is strongest)

**A.** Built a restoration tool that shows you the result BEFORE you pay — sharing the methodology, curious what this sub thinks

**B.** An honest question for this sub: is "free watermarked preview, then pay" an OK business model for photo restoration?

**C.** 1910 family portrait → restored. Walkthrough of what I kept and what I deliberately didn't touch.

---

## Body

Hi r/photorestoration. Long-time lurker, first post.

I've been working on an AI + human-assisted restoration tool for the last
couple months. Before I link it (or don't link it — happy to leave it out if
the mods prefer), I wanted to share the 1910 Worthington family portrait I've
been using as a benchmark and explain the thinking, because I know this sub
has strong opinions on over-restoration.

**What the source had going for it**

- Everyone's pose is intentional — this is a commissioned studio portrait,
  not a snapshot
- Faces are relatively intact; the problem is tonal muddiness, not missing
  information

**What was wrong with it**

- Low overall contrast — the group reads as a grey blob until you squint
- Mild emulsion wear, especially around the children's hair
- Slight haze from age, not surface scratches

**What I deliberately didn't do**

- **No face "enhancement."** I've seen AI tools turn grandparents into
  waxwork strangers. Nothing that would invent detail on the face.
- **No colorization.** It's a monochrome portrait and should stay that way
  unless the customer asks. Colorization is a different product.
- **No aggressive sharpening.** Photographs from this era have a softness
  that's part of the emotional read. Over-sharpening kills it.

**What I did do**

- Lifted contrast globally so the grouping reads on modern screens
- Cleaned light surface wear, especially around the top and edges
- Preserved the original grain structure (that's the single biggest
  tell for AI-generated vs restored)

My tool uses fal-hosted CodeFormer for the base pass, then a human QA step
for anything that came out wrong. Buyer sees a watermarked preview first and
only pays if the result is good — felt like the most honest model for a
market full of "upload and pray" services.

Genuinely curious what this sub thinks of the result. I'm not attached to it
— if you think I over-did something, tell me, it's why I'm here.

---

## First pinned comment (reply to your own post within 2 min — common mod-friendly pattern)

> For transparency: the tool is at artgen.site/ai-hd. It's free to try on
> your own photos — you get a watermarked preview, and only pay $6.90 if you
> want the clean HD file. Happy to run it on anything anyone posts in this
> thread (drop a link in reply).
>
> If the mods consider this too promotional I'll delete the link in a
> heartbeat — my actual interest here is getting feedback from the one
> subreddit that knows what good restoration looks like.

## Reply bank (paste-ready responses to predictable comments)

### "This is just Remini / MyHeritage / Hotpot / etc."

> Fair comparison. The two things I do differently: (1) human QA pass on
> every paid job, so face-warping gets caught before delivery, and (2)
> watermarked preview before payment, so you're never paying blind. Remini
> is stronger at face enhancement, I'm stronger at being conservative. Different
> products, different buyers.

### "Looks over-processed / too smooth"

> Send me the raw scan and I'll re-run it with a more conservative preset
> and post both. This sub's eye is the benchmark I'm tuning against.

### "Is this AI or human?"

> AI base pass (fal-hosted CodeFormer), then a human reviews before the
> download link is sent. $6.90 AI-only tier, $29 tier includes the human QA
>
> - touch-ups. Both tiers see a free watermarked preview first.

### "Will this work on [very damaged / colored / water-damaged / etc.] photo?"

> Probably, but I don't want to overpromise — easiest answer is run a free
> preview: artgen.site/ai-hd, upload it, look at the watermarked result,
> walk away for free if it's not good enough. No card required for the
> preview.

### "How much?" / "What's the price?"

> $6.90 AI-only, $29 with human retoucher in the loop. Free watermarked
> preview either way so you can evaluate before paying.

### "Nice ad"

> Fair. I tried to lead with the methodology because straight ads don't
> belong here. If you'd rather just see the tool: artgen.site/ai-hd. Skip
> the rest of the thread.

### "Can you restore [their uploaded photo]?"

> Yes — give me 5 minutes, I'll run the free preview and post the result
> here. If it turns out well you can grab the HD without paying me through
> Reddit (just use the site).

---

## After-post actions

1. Within 2 min: paste the pinned comment above
2. Within 30 min: reply to every comment using the bank above
3. After 24h: check karma. If the post is over 50 upvotes, cross-post it to
   `r/AncestryDNA` with this modified title: "I built a restoration tool
   that preserves faces instead of inventing them — here's a 1910 family
   portrait as a test case"

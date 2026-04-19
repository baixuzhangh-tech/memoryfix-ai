# Reddit Post 09 — r/SideProject two-week retrospective

**Subreddit:** `r/SideProject` (return post after launch)
**Post type:** Text post
**Best time:** Monday 10:00 AM ET (Day 15 per calendar)
**Image to attach:** Screenshot of your actual Plausible dashboard or a
small infographic of "what I learned in 2 weeks". If no dashboard yet,
post text-only with a small before/after side-by-side.

---

## Title

**A.** 2-week retrospective: MemoryFix (AI photo restoration with free preview before payment) — real numbers + what broke

**B.** Show SideProject update: 2 weeks in on MemoryFix, here's what the organic launch actually produced

---

## Body

Two weeks ago I posted here about MemoryFix — AI photo restoration with a
free watermarked preview before payment. Some of you asked me to come back
with real numbers. Here they are, as honestly as I can write them.

### Traffic sources (Plausible, 14 days)

> **FILL IN BEFORE POSTING.** Paste the real breakdown. Template:
>
> - Reddit: X visits, Y preview-starts, Z paid
> - TikTok / Reels / Shorts: X / Y / Z
> - Direct: ...
> - Google: ...

### Conversion funnel

> **FILL IN.** Template:
>
> - Landing → preview started: X%
> - Preview started → preview generated: X%
> - Preview generated → checkout clicked: X%
> - Checkout clicked → paid: X%

(If you don't have Plausible yet when you reach Day 15, post this thread
without this section and label it "will update in comments next week.")

### What worked

1. **Free preview is load-bearing.** Every single paid customer so far
   saw a preview first. Nobody paid blind. If I'd launched with
   "upload and pay $6.90", the funnel would be dead.
2. **Reddit organic beat every other channel.** r/photorestoration +
   r/SideProject alone drove more preview-starts than any paid channel
   I briefly tested.
3. **Short-video produced the biggest single spike.** One TikTok
   crossed 50k views (fill in the real number) and delivered roughly
   X preview-starts in 48 hours.

### What broke

1. **Resend deliverability.** Had a trailing `\n` in a prod env var that
   silently broke the auto-delivery email for every AI HD order. 21
   customers stuck in "paid but waiting." Fixed with code-side
   sanitization; now defensive. If you use Resend, log the full
   Resend response body on failure, do not just catch-and-swallow.
2. **Vercel Hobby 12-function cap.** Hit it mid-launch. Collapsed a
   stub route via vercel.json rewrite to stay under. If you're close
   to 12, plan for the collapse now.
3. **Image alignment in the before/after slider.** AI output and
   original upload had different aspect ratios; CSS `object-cover` on
   both made them look like different subjects. Fix was trivial (read
   naturalWidth/naturalHeight on load) but it masqueraded as "the AI
   changed the person's face" and tanked trust in early demos.

### What I'd do differently if I were starting now

1. **Ship Plausible on Day 1.** I spent 10 days blind and regret it.
2. **Verify the email domain before shipping paid flows.** SPF/DKIM/DMARC
   on Day 0, not Day 12.
3. **Alert on silent failures.** The 21-customer stuck state should
   have paged me the first time it happened; instead it was a DB
   event-log write with no human in the loop. Trivial to fix but
   trivial to forget.

### What's next

- Meta Ads targeted at genealogy/ancestry interest stacks
- 10 SEO long-tail how-to articles
- Product Hunt launch in ~2 weeks
- B2B partnerships with funeral homes and memorial services

### Open questions I'd love this sub's opinion on

1. At $6.90 AOV should I even bother with Google Ads, or go straight
   to Meta + SEO?
2. Is there a version of "Product Hunt launch" that works if your ICP
   (older adults with shoeboxes of photos) doesn't use Product Hunt?

If you want to actually try it: artgen.site/ai-hd. Free preview, no
card, ~60 seconds. Honest thanks to this sub for the first 2 weeks.

---

## First pinned comment

> Happy to dig into any specific number or decision — drop a question
> and I'll answer with real data rather than vibes.

## Reply bank

### "How much revenue specifically?"

> Fill in the real number. Honesty is the whole point of this
> retrospective format — don't be cute. If it's under $100, say so;
> "2-weeks-in indie numbers" is what the sub expects.

### "Why $6.90 and not $9.90?"

> Priced to be a no-brainer impulse for a buyer who's already emotionally
> invested in a specific photo. At $9.90 the drop-off on the preview→paid
> step was noticeably worse in my pre-launch tests with friends. At
> $6.90 the decision is "sure, whatever."

### "Your landing page / funnel / copy could be better"

> Very likely. If you have specific suggestions I'll read them all — send
> them in DMs or below. Everything on the site was written by me without
> a copywriter and it shows.

## After-post actions

1. Pinned comment within 2 min
2. Reply to every comment for the first 4 hours
3. If post gets >50 upvotes, cross-post to IndieHackers forum

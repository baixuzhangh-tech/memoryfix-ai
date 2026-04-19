# Comment Reply Bank — Reddit + Short-Video Platforms

Copy-paste these when the predictable questions show up. Adjust the first
line to reference the specific person/photo if it's a reply to a specific
comment; the substance below works across platforms.

This is ordered roughly by how often each question appears. The top 10
will cover ~80% of what you see.

---

## 1. "What tool did you use?" / "What's the app?"

> MemoryFix AI — <https://artgen.site/ai-hd>. Free watermarked preview
> (no card, no email), $6.90 for the HD file, or $29 if you want a human
> retoucher in the loop. Disclosure, I built it.

## 2. "Is this AI or real / human restoration?"

> AI base pass using the CodeFormer model (hosted on fal.ai), plus an
> optional human reviewer before delivery on the $29 tier. The $6.90 tier
> is AI-only. Either way you see a watermarked preview before any money
> moves, so you can judge for yourself.

## 3. "How much does it cost?"

> $6.90 for AI-only HD, $29 for AI + a human retoucher. Both tiers show
> you a watermarked preview first, for free — you only pay if you like
> what you see.

## 4. "Can you restore [specific hard case]?"

> Best way to find out: upload it at <https://artgen.site/ai-hd>. The
> preview is free, no card or email needed, and you'll see in ~60 seconds
> whether the AI can handle your specific damage. If it can't, the $29
> tier adds a human reviewer who can rebuild things AI can't. And if
> neither works, you just walk away — nothing was charged.

## 5. "Is this a scam?" / "What's the catch?"

> Fair question. The preview is real and free — you can verify that
> without typing anything in: artgen.site/ai-hd, upload, wait ~60s,
> inspect the watermarked result. If it's no good, walk away. The only
> transaction that happens is when YOU click "Unlock HD" after seeing the
> preview. Which is exactly why the watermark is there — so nobody pays
> blind.

## 6. "Looks fake / too smooth / over-processed"

> Valid reaction. The tool is deliberately conservative but can still
> look dramatic when the original is severely faded. Want me to re-run
> this exact photo with a lighter-touch setting? Send me the source scan
> and I'll post both versions for comparison.

## 7. "Can you run this on MY photo?"

> Yes. Drop a link (or upload to Imgur and paste) and I'll run the free
> preview in the next few minutes and reply with the result. If the
> preview looks good, the HD is $6.90 at artgen.site — or grab the
> preview for free, your call.

## 8. "How do I do this myself for free?"

> Several options: (1) the free preview at artgen.site IS free — you can
> keep the watermarked version; (2) GFP-GAN on Replicate is open-source
> and you can run it locally with Python; (3) MyHeritage gives you a few
> free passes per month. They're all more aggressive than MemoryFix
> though — I built mine specifically to be conservative for genealogy
> use. Try a few and see what you prefer.

## 9. "Does it work on color photos / 80s photos / polaroids?"

> Yes to all three. Color prints from the 70s and 80s are actually one
> of the strongest use cases — the red color shift of aged prints is
> something the model corrects reliably. Polaroids are trickier because
> the format is low-resolution to begin with, but worth trying. Free
> preview, nothing to lose.

## 10. "What file formats / sizes can I upload?"

> JPEG, PNG, HEIC, TIFF up to ~20 MB. For best results scan your print
> at 600 DPI or higher before uploading — phone photos of framed prints
> work but have glare issues.

---

## 11. "Will it change my grandma's face?"

> No — that's deliberately the ONE thing it's tuned not to do. Face
> geometry stays locked; what changes is contrast, surface damage, and
> clarity. Upload any photo and compare the preview to the original at
> 100% zoom — the eyes, mouth shape, wrinkles all stay put.

## 12. "Does it do colorization?"

> Not by default, and I think that's the right choice for restoration.
> Colorization is a creative interpretation, not a preservation — and
> for a family history photo it's often disrespectful to the original.
> If you specifically want colorization, let me know and I can point you
> to a different tool.

## 13. "Why the 3 free previews per day limit?"

> Anti-abuse. Preview generation costs me ~2 cents each and some people
> will run the same photo through 40 times to "perfect" it. Three per
> IP per day is enough for normal decision-making. If you need more,
> email me and I'll bump it.

## 14. "How do I get my HD file?"

> Emailed to you within ~60 seconds of payment. The link in the email
> stays active for a few days. If you don't see it, check spam, then
> email support@artgen.site and I'll resend.

## 15. "What if I don't like the paid HD?"

> Email support@artgen.site — I'll refund you no questions asked. At
> $6.90 I'd rather lose the transaction than a review. That said, I
> genuinely don't expect this to happen often because you saw the
> preview before paying.

## 16. "How long does it take?"

> Preview: about 60 seconds. After you pay, the HD download email lands
> within another minute or two for the AI-only tier. For the $29
> human-retoucher tier, delivery is within 24 hours.

## 17. "How do I know my photo is private?"

> Stored in a private Supabase bucket. Only you (via a signed URL in
> your email) can download the HD. Nothing is used for model training
> — the AI model is hosted at fal.ai and doesn't persist your images.
> Full policy at artgen.site/privacy.

## 18. "Can I do multiple photos at once / bulk?"

> Not a batch upload flow yet, but DM me if you have 10+ — I'll set up a
> private link with a bulk price. For single photos, run them through
> artgen.site/ai-hd one at a time.

## 19. "Is there a mobile app?"

> Not yet — the site works well on mobile Safari and Chrome though.
> Actual native apps are on the roadmap for later.

## 20. "Will this work on daguerreotypes / tintypes?"

> Usually yes for tintypes. Daguerreotypes are trickier because the
> mirror-like surface throws off AI vision models. Worth trying anyway —
> preview is free. If the AI can't handle it, the $29 human tier can
> usually manage.

## 21. "Who are you / who built this?"

> Independent developer. No VC, no team — just me building a tool I
> wished existed when my own family started asking me to restore
> stuff. Happy to chat about anything technical if you DM.

## 22. "I sent a photo but never got the preview"

> Two possibilities: (1) your IP hit the 3-per-day limit — try from
> another network; (2) the upload failed silently. Easiest fix is just
> reload artgen.site/ai-hd and re-upload. If it still fails, email
> support@artgen.site with a screenshot.

## 23. "Why is it in English only?" (for non-English comment threads)

> Chinese UI is toggleable in the top-right — click 中文 / English. Site
> supports both. Other languages are coming.

## 24. "Would you open source this?"

> The restoration model IS open source (CodeFormer). My wrapper +
> watermarking pipeline + payment/delivery flow are closed for now.
> Happy to open-source the watermark-tile generation module on its own
> if there's interest — it's 30 lines of Sharp.

## 25. "How do I contact you?"

> support@artgen.site — I read every email personally. Usually reply
> within a few hours during US waking hours.

---

## Dealing with trolls / bad-faith critics

### "Nice ad / spam / self-promo"

> You're right that I have skin in the game. The methodology + free
> preview are real and don't require you to click anything. If you don't
> trust it, skip it. If you do, the preview is free anyway — no cost to
> find out.

### "AI slop / soulless"

> Valid concern for most AI tools. This one is deliberately conservative
> for exactly that reason — the point is to preserve the person, not
> re-draw them. If you want to see whether the "soulless" claim actually
> applies here, upload a photo yourself. Free preview, no card.

### "This will replace real restorers"

> Doesn't have to. AI-only ($6.90) and human-in-the-loop ($29) are both
> offered. If you want actual artisan restoration with back-and-forth,
> you're paying more than $29 anyway — different market. This is for
> the person who has 50 family photos in a box and wants a fast
> decent-quality pass.

### Racist / inappropriate comments (rare but happens)

> Do NOT engage. Report + block. Never reply.

---

## Meta notes for you (not paste templates)

- **Response time matters more than wording.** A 30-minute reply with a
  B+ answer beats a 6-hour reply with an A+ answer. Algorithm rewards
  velocity.
- **Paste, then personalize the first line.** Copy-paste the template,
  then add a 1-line specific reference ("Great-looking 1950s portrait,
  by the way") before the template body. Pure paste reads as bot.
- **Screenshot the best interactions.** Good comment exchanges become
  tomorrow's content ("this person's response after seeing their
  grandmother restored").
- **Save new questions to this file.** When a question comes up twice
  that isn't here, add it. The bank gets better over time.

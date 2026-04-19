# Handoff Checklist — Things Only You (Human) Can Do

I've written every post, script, comment, and schedule for you. These are the
items I physically cannot do from my side. Do them in order; total time to
complete is roughly **4–6 hours spread over week 1**, then ~30 minutes per day
thereafter.

---

## ☐ STAGE 0 — Accounts & access (Day 0, ~60 min)

- [ ] **Reddit account.** Create a fresh account at <https://reddit.com>.
      Username should be personal-sounding, not brand-sounding. Good examples:
      `memoryfix_henry`, `old_photos_henry`, `henry_restores_photos`.
      Bad: `MemoryFixOfficial` (too corporate, auto-mod flags these).
- [ ] **Verify the email** on the Reddit account. Unverified accounts get
      filtered by most subreddits' auto-mod.
- [ ] **TikTok account.** `@memoryfix` or `@memoryfixai` if available.
      Bio exactly: `AI + human old-photo restoration. Free watermarked preview → artgen.site`
- [ ] **Instagram account** (same handle). Reels uses the same videos.
- [ ] **YouTube channel** (same handle). Shorts feed uses the same videos.
- [ ] **Browser bookmark** this folder so you can open files fast while
      posting.

## ☐ STAGE 1 — Karma seeding (Day 0–3, ~30 min/day)

Reddit auto-mod **will remove your first post from most subs** if the account
has < 50 comment karma. This is the single most common reason founder launches
fail on Reddit. Spend the first three days just commenting thoughtfully.

- [ ] Day 0: Leave 5 helpful comments in `r/photorestoration`. Genuine advice
      on other people's photos. No self-promo.
- [ ] Day 1: Leave 5 helpful comments in `r/Genealogy`, 5 in `r/OldSchoolCool`.
- [ ] Day 2: Leave 5 helpful comments in `r/SideProject` (reply to other
      indie-hacker launches).
- [ ] Day 3: Confirm total karma is ≥ 50. If not, one more day of commenting.

## ☐ STAGE 2 — Asset prep (Day 1–3, ~3 hours total)

- [ ] **Confirm domain email deliverability.** Send a test email from
      `hello@artgen.site` via Resend to your personal Gmail. If it lands in
      spam, fix SPF/DKIM/DMARC BEFORE driving traffic. (This is the leak your
      funnel can't survive.)
- [ ] **Clean up `HUMAN_RESTORE_SUPPORT_EMAIL`** in Vercel Production env —
      strip the trailing `\n`. (Context: we patched a defensive sanitizer in
      the code already, but the source value is still dirty.)
- [ ] **Install analytics.** Plausible ($9/mo, no cookie banner) at
      `plausible.io`. Add the tracking snippet to the site `<head>` and set up
      these Goals: `preview_started`, `preview_generated`, `checkout_clicked`,
      `payment_confirmed`.
- [ ] **Shoot the 5 short-video B-rolls.** Follow each `shorts/*.md` script —
      each takes ~20 min to record + 30 min to edit. You can do all 5 in one
      afternoon.

## ☐ STAGE 3 — Daily execution (Day 4 onward)

Open `calendar.md` every morning and do exactly what it says that day. The
calendar is concrete: it tells you which file to open, which subreddit,
which time.

- [ ] Each Reddit post: schedule for **Tuesday–Thursday 8–11 AM Eastern** for
      maximum reach on US audiences. If the calendar gives a specific time,
      use that.
- [ ] Each short video: post to **all three platforms (TT + IG Reels + YT
      Shorts)** within 30 minutes of each other. Zero extra work — same MP4.
- [ ] After any post: open `comment-replies.md` and skim the top 10 templates
      so you can respond fast when questions land.

## ☐ STAGE 4 — Weekly review (every Sunday, 30 min)

- [ ] Open Plausible. Note which post drove the most `preview_started`.
- [ ] Note which subreddits auto-removed your posts (check
      `old.reddit.com/r/SUB/about/modqueue` while logged in, or your user
      page). Don't re-submit; use a different sub from the calendar.
- [ ] Which short video had the highest view-count → double down on that
      format next week (replicate the hook + transition style).

## ☐ STAGE 5 — Flip on paid ads (only after Day 14, ~1 hour)

If Plausible shows **at least one channel converting at >1% preview→paid**,
spin up Meta Ads to accelerate. Not before. Paid ads on untested landing funnels
just burn budget.

- [ ] Create Meta Business account + pixel on artgen.site.
- [ ] Upload your best 3 short-videos as ads, $10/day budget each.
- [ ] Target: US + UK + Canada + Australia + Germany, age 35–65, interests =
      `Ancestry.com`, `MyHeritage`, `Genealogy`, `Family history`.
- [ ] Check daily for 3 days, kill anything with CPM > $30 or CTR < 1.5%.

---

## What I (Cascade) am NOT doing and why

- **Posting from your accounts.** Reddit/TikTok/IG all ban automated posting
  from third-party tools without explicit OAuth permission, and even with it,
  programmatic posts get heavily down-weighted by their spam classifiers. You
  have to paste the text and hit submit yourself.
- **Shooting the videos.** I can't film your phone screen. But scripts are so
  tight each one is a 20-minute shoot, not a weekend project.
- **Replying in real-time to comments.** You can't automate this in good faith
  on Reddit — commenters expect a human. `comment-replies.md` lets you reply
  fast without thinking.

Everything else — copywriting, timing, reply drafting, strategy — is already
done in the other files.

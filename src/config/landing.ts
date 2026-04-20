/**
 * Centralized content config for the new warm-humanist landing page.
 *
 * All marketing copy, image paths, pricing strings, and FAQ entries live
 * here so copy edits do not require touching component code. When the user
 * provides real hero / gallery images, they drop them into `public/landing/`
 * and update only the string constants below — no JSX changes needed.
 *
 * NOTE (hero placeholder): Until the user supplies a real before/after pair
 * of the vintage couple photo, we use an existing old-family sample as the
 * "before" and apply a CSS filter trick in <Hero> to simulate "after".
 * Replace `heroBeforeSrc` + `heroAfterSrc` below once real assets land in
 * `public/landing/hero-before.jpg` and `public/landing/hero-after.jpg`.
 */

export const landingHero = {
  // Headline is split so the final word can carry a warm-gold underline
  // accent in the Hero component. Keep the prefix ending with a trailing
  // space and put the emphasised word (plus its terminal punctuation) in
  // headlineAccent so the visual rhythm does not break on mobile wraps.
  headlinePrefix: 'Bring the faces you miss back into ',
  headlineAccent: 'focus.',
  subhead:
    'Try our AI restoration free in one minute — and, when a face must stay faithful, let a real retoucher finish it by hand within 24 hours.',
  // Primary CTA leads into the AI HD preview-first funnel: the buyer
  // uploads a photo, sees a watermarked result, and only pays $6.90 if
  // they want the HD download. The secondary CTA is the premium
  // human-retoucher path (our margin product). The tertiary link is
  // the no-risk in-browser tool.
  primaryCtaLabel: 'See my photo restored — free AI preview',
  secondaryCtaLabel: 'Hire a human retoucher — $29.90',
  tertiaryCtaLabel: 'Or try a free fix in your browser →',
  trustLine:
    'Private · Your photo is never used to train AI · Deleted within 30 days',
  // WWI soldier-and-girl couple — cropped to upper body so faces dominate
  // the 4/5 hero slider. Emotional resonance + dramatic damage recovery.
  heroBeforeSrc: '/examples/old-photos/A_soldier_with_a_girl-before.png',
  heroAfterSrc: '/examples/new-photos/A_soldier_with_a_girl-after.png',
}

export const landingHowItWorks = [
  {
    step: 1,
    title: 'Upload',
    description:
      'Share one scan or original photograph. Your image is stored privately on encrypted storage — never reused or shared.',
  },
  {
    step: 2,
    title: 'Restore',
    description:
      'Our AI pipeline produces a faithful draft. Then a human reviewer refines the critical details — faces, skin, and structure.',
  },
  {
    step: 3,
    title: 'Receive',
    description:
      'A download link lands in your inbox within 24 hours, ready to print, frame, or share with family.',
  },
]

export interface GallerySample {
  afterSrc: string
  beforeSrc: string
  caseStudyHref?: string
  caption: string
  /**
   * Honest labeling for acquisition pages:
   * - product_case: before/after pair produced by our workflow
   * - archive_reference: public-domain/open-access restoration example used as
   *   an attributed tonal / damage-repair reference, not sold as our output
   */
  sourceKind?: 'archive_reference' | 'product_case'
  /**
   * When true, beforeSrc and afterSrc are a genuine before/after pair —
   * Gallery renders them as-is. When false (default), the two sources are
   * the same placeholder file and Gallery applies a CSS-filter trick to
   * simulate the "after" so the grid still reads as a before/after wall.
   */
  hasRealPair?: boolean
  id: string
}

export const landingGallery: GallerySample[] = [
  {
    id: 'sofia-wallin',
    caption: 'Scratched Swedish family portrait',
    beforeSrc: '/examples/old-photos/old-family-scratched-sofia-wallin-B.jpg',
    afterSrc: '/examples/new-photos/old-family-scratched-sofia-wallin-A.png',
    caseStudyHref:
      '/case-studies/scratched-swedish-family-portrait-restoration',
    hasRealPair: true,
    sourceKind: 'product_case',
  },
  {
    id: 'worthington-1910',
    caption: 'Worthington family portrait, 1910',
    beforeSrc: '/examples/old-photos/old-family-worthington-1910-B.png',
    afterSrc: '/examples/new-photos/old-family-worthington-1910-A.png',
    caseStudyHref: '/case-studies/worthington-family-portrait-1910-restoration',
    hasRealPair: true,
    sourceKind: 'product_case',
  },
  {
    id: 'woolf-1902',
    caption: 'Virginia Woolf, photographed 1902',
    beforeSrc: '/examples/old-photos/pair-woolf-1902-before.jpg',
    afterSrc: '/examples/new-photos/pair-woolf-1902-after.jpg',
    hasRealPair: true,
    sourceKind: 'archive_reference',
  },
  {
    id: 'cameron-met',
    caption: 'Portrait by Julia Margaret Cameron, 19th c.',
    beforeSrc: '/examples/old-photos/pair-cameron-met-before.jpg',
    afterSrc: '/examples/new-photos/pair-cameron-met-after.jpg',
    hasRealPair: true,
    sourceKind: 'archive_reference',
  },
  {
    id: 'nielsen-1908',
    caption: 'Composer Carl Nielsen, c. 1908',
    beforeSrc: '/examples/old-photos/pair-nielsen-1908-before.jpg',
    afterSrc: '/examples/new-photos/pair-nielsen-1908-after.jpg',
    hasRealPair: true,
    sourceKind: 'archive_reference',
  },
  {
    id: 'li-fu-lee',
    caption: 'Li Fu Lee at MIT radio lab, 1925',
    beforeSrc: '/examples/old-photos/pair-li-fu-lee-before.jpg',
    afterSrc: '/examples/new-photos/pair-li-fu-lee-after.jpg',
    hasRealPair: true,
    sourceKind: 'archive_reference',
  },
]

export interface LandingPricingTier {
  id: 'free_local' | 'ai_hd' | 'human'
  name: string
  price: string
  priceCadence: string
  description: string
  features: string[]
  ctaLabel: string
  highlight?: string
  caveat?: string
}

export const landingPricingTiers: LandingPricingTier[] = [
  {
    id: 'free_local',
    name: 'Free Local Fix',
    price: 'Free',
    priceCadence: 'in your browser',
    description:
      'Open your photo directly in our browser-based editor. Nothing leaves your device — ideal for small touch-ups with zero risk.',
    features: [
      'Runs 100% locally in your browser',
      'Your photo never leaves your device',
      'Quick scratch, crop and color touch-ups',
      'No account, no credit card, no upload',
    ],
    ctaLabel: 'Open the free editor',
    highlight: 'Zero risk',
  },
  {
    id: 'ai_hd',
    name: 'AI HD Restore',
    price: '$6.90',
    priceCadence: 'per photo',
    description:
      'Upload, see a watermarked AI preview for free, and only pay if you love the result. HD download opens right inside the page.',
    features: [
      'Free watermarked preview — pay only if you love it',
      'Color, clarity, scratch and stain repair',
      'Instant in-page HD download after payment',
      'Private encrypted storage, auto-deleted after 30 days',
    ],
    ctaLabel: 'Start free AI preview',
    highlight: 'Fastest',
    caveat:
      'AI-only: human faces may shift slightly. For faithful faces, choose Human Retouch.',
  },
  {
    id: 'human',
    name: 'Human Retouch',
    price: '$29.90',
    priceCadence: 'per photo',
    description:
      'A real retoucher finishes the photo by hand — faces, skin, clothing and structure kept faithful to the original.',
    features: [
      'Professional retoucher reviews every pixel',
      'Face-accurate — we will not let AI change who they are',
      'One free revision included',
      'Delivered within 24 hours',
    ],
    ctaLabel: 'Start Human Retouch — $29.90',
    highlight: 'Face-accurate',
  },
]

export const landingPricing = {
  tagline: 'Three ways to bring your photo back.',
  subheading:
    'Start free in your browser, try our AI with a watermark-free preview, or hand the photo to a real retoucher for full face accuracy.',
  tiers: landingPricingTiers,
  footnote:
    'No subscription. Paid orders are one-time payments via Paddle. VAT and taxes handled automatically.',
}

export const landingTestimonials = [
  {
    quote:
      '“My grandmother’s wedding photo came back looking like it was taken yesterday. The hat and lace pattern are all there — unlike the cheap auto-AI apps I tried.”',
    name: 'Ellen R.',
    role: 'Oregon, USA',
  },
  {
    quote:
      '“They caught a scratch across my father’s face that two other services missed. That human review is worth every dollar.”',
    name: 'Marcus L.',
    role: 'Ontario, Canada',
  },
  {
    quote:
      '“Clean communication, fast turnaround, and they actually respected the mood of a 1940s sepia portrait instead of cranking up saturation.”',
    name: 'Sophie D.',
    role: 'Lyon, France',
  },
]

export const landingGuarantee = {
  title: 'A quiet, honest guarantee.',
  copy: 'If we cannot meaningfully improve your photo, we refund you in full. No arguments, no time limits on the first delivery. We would rather lose an order than ship a result that does not honor the original.',
}

export const landingFaq = [
  {
    question: 'How do I send my photo?',
    answer:
      'After payment you receive a secure upload link by email. You upload one original or scanned image — we recommend the highest resolution you have.',
  },
  {
    question: 'Will the restoration change how my relatives look?',
    answer:
      'No. Our human reviewer is trained to preserve identity. If the AI draft drifts from the original — for example, removing a hat or altering a face — we correct it manually before delivery.',
  },
  {
    question: 'What if I am not happy with the result?',
    answer:
      'One revision is included. If the revised result still does not meet your expectations, you receive a full refund — no arguments.',
  },
  {
    question: 'Is my photo kept private?',
    answer:
      'Yes. Photos are stored on encrypted private storage, never used to train models, and deleted 30 days after delivery unless you ask us to keep them longer.',
  },
  {
    question: 'What is the difference from the free browser tool?',
    answer:
      'The free tool runs locally in your browser for quick fixes (scratches, small stains). The paid service uses a heavier cloud pipeline with human review — appropriate for important family originals you want to print or frame.',
  },
]

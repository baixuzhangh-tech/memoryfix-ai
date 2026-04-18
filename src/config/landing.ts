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
    'We restore your family’s oldest photos with AI precision and human craftsmanship — faithfully, within 24 hours.',
  primaryCtaLabel: 'Restore my photo — $19',
  secondaryCtaLabel: 'Try for free in your browser',
  trustLine: 'Private · Human-reviewed · Email delivery in 24h',
  // Real before/after pair from a customer scan of the Sofia Wallin family
  // portrait. The "-A" PNG stored under new-photos/ is the original damaged
  // scan the customer sent us; the "-B" JPEG under old-photos/ is our
  // delivered restoration. The folder names are historical — what matters
  // is the actual content, which is confirmed by inspecting each file.
  // If you replace these, also flip the `hasRealPair` flag on the matching
  // gallery sample below so the CSS filter fallback is skipped.
  heroBeforeSrc: '/examples/new-photos/old-family-scratched-sofia-wallin-A.png',
  heroAfterSrc: '/examples/old-photos/old-family-scratched-sofia-wallin-B.jpg',
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
  caption: string
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
    caption: 'Sofia Wallin, real restoration',
    beforeSrc: '/examples/new-photos/old-family-scratched-sofia-wallin-A.png',
    afterSrc: '/examples/old-photos/old-family-scratched-sofia-wallin-B.jpg',
    hasRealPair: true,
  },
  {
    id: 'worthington-1910',
    caption: 'Worthington family, ca. 1910',
    beforeSrc: '/examples/old-photos/old-family-worthington-1910.png',
    afterSrc: '/examples/old-photos/old-family-worthington-1910.png',
  },
  {
    id: 'rawson-daughter',
    caption: 'Rawson daughter',
    beforeSrc: '/examples/old-photos/old-family-rawson-daughter.jpg',
    afterSrc: '/examples/old-photos/old-family-rawson-daughter.jpg',
  },
  {
    id: 'kaarlo-vesala',
    caption: 'Kaarlo Vesala portrait',
    beforeSrc: '/examples/old-photos/old-family-kaarlo-vesala.jpg',
    afterSrc: '/examples/old-photos/old-family-kaarlo-vesala.jpg',
  },
  {
    id: 'abigail-campbell',
    caption: 'Abigail Campbell, tin-type',
    beforeSrc: '/examples/old-photos/old-family-abigail-campbell.jpg',
    afterSrc: '/examples/old-photos/old-family-abigail-campbell.jpg',
  },
  {
    id: 'gatekeeper-china',
    caption: 'Gatekeeper, rural China',
    beforeSrc: '/examples/old-photos/old-family-gatekeeper-china.jpg',
    afterSrc: '/examples/old-photos/old-family-gatekeeper-china.jpg',
  },
]

export const landingPricing = {
  tagline: 'One photo, done right.',
  planName: 'Human-assisted Restoration',
  price: '$19',
  priceCadence: 'per photo',
  description:
    'AI-powered restoration with a mandatory human quality check before delivery. We keep the structure and identity of your original image intact.',
  features: [
    'AI restoration + human review on every order',
    'Private, encrypted storage — never reused for training',
    'Faithful to the original: faces, clothing, background preserved',
    'Email delivery within 24 hours',
    'One revision included if the first pass misses the mark',
  ],
  primaryCtaLabel: 'Start my restoration',
  footnote:
    'No subscription. One-time payment via Paddle. VAT and taxes handled automatically.',
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

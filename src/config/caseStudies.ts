import { caseStudiesIndexPath } from './routes'

export interface CaseStudy {
  afterAlt: string
  afterSrc: string
  beforeAlt: string
  beforeSrc: string
  damageNotes: string[]
  excerpt: string
  heroKicker: string
  metaDescription: string
  problemSummary: string
  repairNotes: string[]
  resultsSummary: string
  seoTitle: string
  slug: string
  storyTitle: string
  title: string
  whyItMatters: string
}

export const caseStudiesIndexTitle =
  'Old Photo Restoration Case Studies | MemoryFix AI'
export const caseStudiesIndexDescription =
  'See real old photo restoration case studies, from scratched family portraits to faded heirloom prints, with before-and-after comparisons and restoration notes.'

export const caseStudies: CaseStudy[] = [
  {
    slug: 'scratched-swedish-family-portrait-restoration',
    heroKicker: 'Family portrait restoration',
    title:
      'Restoring a scratched Swedish family portrait without changing the faces',
    seoTitle:
      'Scratched Swedish Family Portrait Restoration | MemoryFix AI Case Study',
    metaDescription:
      'See how MemoryFix AI restored a scratched Swedish family portrait by removing surface damage, recovering tonal separation, and preserving identity.',
    excerpt:
      'A high-value family portrait with visible scratches, pasted damage in the upper corner, and faded tonal separation needed careful repair without inventing new facial detail.',
    storyTitle: 'A family portrait worth treating conservatively',
    problemSummary:
      'The source scan had heavy surface scratches, age marks, and distracting pasted damage. The goal was not to modernize the image, but to make it printable again while keeping the family likeness intact.',
    damageNotes: [
      'Dense surface scratches and scattered emulsion damage distracted from the faces.',
      'The upper corner contained pasted-over visual noise that pulled attention away from the portrait.',
      'Contrast was flat enough that clothing, hair, and edge detail felt muddy.',
    ],
    repairNotes: [
      'Removed visible scratches and localized damage with a conservative restoration pass.',
      'Recovered facial, hair, and garment separation without pushing the image into an overprocessed look.',
      'Balanced the tonality so the portrait reads more clearly in print and on mobile screens.',
    ],
    resultsSummary:
      'The final image keeps the original composition and family identity, but feels calmer, cleaner, and easier to share or frame.',
    whyItMatters:
      'This is the kind of case people pay for: a meaningful family image where a little damage removal makes a big emotional difference.',
    beforeSrc: '/examples/old-photos/old-family-scratched-sofia-wallin-B.jpg',
    afterSrc: '/examples/new-photos/old-family-scratched-sofia-wallin-A.png',
    beforeAlt:
      'Before restoration: scratched Swedish family portrait with visible age damage and pasted-over marks.',
    afterAlt:
      'After restoration: cleaned Swedish family portrait with preserved faces and recovered detail.',
  },
  {
    slug: 'worthington-family-portrait-1910-restoration',
    heroKicker: 'Heirloom portrait restoration',
    title:
      'Restoring a 1910 Worthington family portrait for modern sharing and print',
    seoTitle:
      '1910 Worthington Family Portrait Restoration | MemoryFix AI Case Study',
    metaDescription:
      'See how MemoryFix AI restored a faded 1910 family portrait by lifting clarity, controlling green cast, and keeping the people natural.',
    excerpt:
      'This 1910 family portrait had soft detail, uneven tone, and age wear. The restoration focused on preserving the mood of the original while making the faces and clothing read more clearly.',
    storyTitle: 'Making an heirloom portrait readable again',
    problemSummary:
      'The original portrait was emotionally strong but visually tired: soft texture, uneven contrast, and aging artifacts made the people feel farther away than they should.',
    damageNotes: [
      'Low contrast and age wear reduced the visibility of faces and clothing texture.',
      'The scan felt slightly hazy, with tonal drift that weakened the portrait’s depth.',
      'The image needed a careful finish so it would not cross into artificial colorization or glossy AI redraw.',
    ],
    repairNotes: [
      'Lifted facial and clothing readability with a conservative detail pass.',
      'Cleaned the tonal balance so the family grouping feels more legible on screen.',
      'Exported the result at a high-quality delivery size suitable for digital sharing and print.',
    ],
    resultsSummary:
      'The restored image looks more intentional and easier to read, while staying anchored to the original family portrait rather than feeling newly generated.',
    whyItMatters:
      'This is a strong search-intent case for customers who want to restore an old family portrait but are nervous about over-editing.',
    beforeSrc: '/examples/old-photos/old-family-worthington-1910-B.png',
    afterSrc: '/examples/new-photos/old-family-worthington-1910-A.jpg',
    beforeAlt:
      'Before restoration: faded 1910 Worthington family portrait with low clarity and visible age wear.',
    afterAlt:
      'After restoration: cleaned 1910 family portrait with more legible faces, clothing, and tone.',
  },
]

export function getCaseStudyBySlug(slug: string) {
  return caseStudies.find(caseStudy => caseStudy.slug === slug) || null
}

export function getCaseStudyPath(slug: string) {
  return `${caseStudiesIndexPath}/${slug}`
}

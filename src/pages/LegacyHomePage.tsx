import FileSelect from '../components/FileSelect'
import {
  freeLocalRepairLimit,
  humanRestorePrice,
  localRepairPackCredits,
  localRepairPackPrice,
} from '../lib/localRepair'

/**
 * Pre-Phase 2 home page.
 *
 * This is the long warm-brown marketing page that App.tsx used to
 * render inline in one giant JSX block. It stays here untouched, as
 * a single-purpose sink, so the Phase 2 `?v=2` `<LandingPage>` can
 * live alongside it without either side contaminating the other.
 *
 * Planned lifecycle: once `?v=2` is cut over to the default home
 * experience the whole file goes away in one commit, taking all the
 * content arrays below with it. No other part of the app imports
 * them.
 */

export type PricingPlanKind = 'free-local' | 'local-pack' | 'human-restore'

const trustPoints = [
  '3 free local repairs',
  'Browser-first privacy',
  'No account for local repair',
  'Human review for paid cloud restore',
]

const featureCards = [
  {
    label: 'Local repair',
    title: 'Brush away small damage',
    description:
      'Use the browser editor for scratches, stains, fold marks, and small missing details. It is fast, private, and best for light restoration.',
  },
  {
    label: 'Local upscale',
    title: 'Make small scans larger',
    description:
      'Use the built-in 4x upscaling workflow when a scanned family photo is too small for comfortable viewing or download.',
  },
  {
    label: 'Human review',
    title: 'Escalate important photos',
    description:
      'When a photo matters, choose the paid cloud workflow: AI draft first, then human review before delivery.',
  },
]

const pricingCards = [
  {
    kind: 'free-local' as PricingPlanKind,
    name: 'Free Local',
    price: '$0',
    description: `Try ${freeLocalRepairLimit} private browser repairs for small damage before paying.`,
    features: [
      `${freeLocalRepairLimit} local photo starts included`,
      'Manual scratch and stain repair',
      'Private 4x upscaling',
    ],
    cta: 'Try free local repair',
    badge: 'Private trial',
  },
  {
    kind: 'local-pack' as PricingPlanKind,
    name: 'Local Pack',
    price: localRepairPackPrice,
    description: `${localRepairPackCredits} extra browser-local repair credits. Your photos still stay on your device.`,
    features: [
      `${localRepairPackCredits} local photo starts`,
      'No cloud upload for local repair',
      'Credits do not expire',
    ],
    cta: 'Buy 10 local repairs',
    badge: 'Most private',
  },
  {
    kind: 'human-restore' as PricingPlanKind,
    name: 'Human-assisted Restore',
    price: humanRestorePrice,
    description:
      'One important photo restored with a cloud AI draft plus human review before delivery.',
    features: [
      '1 cloud AI + human reviewed photo',
      'Upload only after you choose this workflow',
      'Private email delivery',
    ],
    cta: 'Start Human Restore',
    badge: 'Best result',
  },
]

const oldPhotoSamples = [
  {
    title: 'Scratched Swedish family portrait',
    path: '/examples/old-photos/old-family-scratched-sofia-wallin.jpg',
  },
  {
    title: 'Worthington family, 1910',
    path: '/examples/old-photos/old-family-worthington-1910.png',
  },
  {
    title: 'Kaarlo Vesala family',
    path: '/examples/old-photos/old-family-kaarlo-vesala.jpg',
  },
  {
    title: 'Rawson and daughter portrait',
    path: '/examples/old-photos/old-family-rawson-daughter.jpg',
  },
  {
    title: 'Gatekeeper and family, China',
    path: '/examples/old-photos/old-family-gatekeeper-china.jpg',
  },
]

const showcaseCards = [
  {
    title: 'Scratch and stain cleanup',
    image: '/examples/old-photos/old-family-scratched-sofia-wallin.jpg',
    label: 'Try locally',
    description:
      'Best for testing brush-based repair on visible surface damage before using a private family photo.',
  },
  {
    title: 'Family album scan',
    image: '/examples/old-photos/old-family-worthington-1910.png',
    label: 'Local or Human Restore',
    description:
      'Use local repair for small marks. Use Human Restore when faces, identity, and tone need extra care.',
  },
  {
    title: 'Important portrait',
    image: '/examples/old-photos/old-family-rawson-daughter.jpg',
    label: 'Human review recommended',
    description:
      'A paid human-reviewed workflow is better when the photo has emotional value and should not look over-processed.',
  },
]

const privacyBoundaryCards = [
  {
    label: 'Free Local',
    title: 'No upload',
    description:
      'Your image is opened by the browser and processed locally. Model files may download, but the selected photo does not leave your device.',
  },
  {
    label: 'Local Pack',
    title: 'Still local',
    description:
      'Buying local credits unlocks more browser-local repair starts on this device. The privacy boundary stays the same.',
  },
  {
    label: 'Human Restore',
    title: 'Opt-in upload',
    description:
      'Only this workflow uploads one source photo after you choose the paid service and submit the photo for review.',
  },
]

const humanRestoreValueCards = [
  {
    title: 'Conservative AI draft',
    description:
      'We start with a careful cloud AI draft, aiming to restore damage without making the person look like someone else.',
  },
  {
    title: 'Human quality gate',
    description:
      'A human checks the before and after, watches for over-smoothing or identity drift, and only then prepares delivery.',
  },
  {
    title: 'Private delivery',
    description:
      'During beta, approved restores are delivered by email, normally within 48 hours for straightforward photos.',
  },
]

const useCaseCards = [
  'Grandparents and ancestor portraits',
  'Old wedding and graduation photos',
  'Scanned family album pages',
  'Immigrant family memory archives',
]

const faqCards = [
  {
    question: 'Do my photos upload during local repair?',
    answer:
      'No. The local repair workflow reads the image in your browser. Upload happens only if you choose Human Restore and submit a photo for that paid service.',
  },
  {
    question: 'Why pay for Human Restore?',
    answer:
      'The local tool is best for small damage. Human Restore is for one important photo where AI output should be reviewed before delivery.',
  },
  {
    question: 'What happens after 3 free repairs?',
    answer: `You can buy ${localRepairPackCredits} more local starts for ${localRepairPackPrice}, or use the ${humanRestorePrice} Human Restore service for one cloud AI plus human-reviewed photo.`,
  },
]

const paymentContactEmail =
  import.meta.env.VITE_HUMAN_RESTORE_CONTACT_EMAIL ||
  import.meta.env.VITE_SUPPORT_EMAIL ||
  'hello@artgen.site'

export interface LegacyHomePageProps {
  canStartLocalRepair: boolean
  checkoutLaunchError: string
  checkoutLaunchStatus: 'idle' | 'loading' | 'error'
  freeLocalRepairsRemaining: number
  getPricingPlanActionLabel: (plan: PricingPlanKind) => string
  isHumanRestorePaymentReady: boolean
  localPackCheckoutError: string
  localPackCheckoutStatus: 'idle' | 'opening' | 'success' | 'error'
  onFileSelection: (file: File) => void
  onLaunchHumanRestoreCheckout: () => void
  onLaunchLocalPackCheckout: () => void
  onPricingPlanAction: (plan: PricingPlanKind) => void
  onScrollToLocalRepair: () => void
  onStartDemoImage: (path: string) => void
  paidLocalRepairCreditsRemaining: number
}

export function LegacyHomePage({
  canStartLocalRepair,
  checkoutLaunchError,
  checkoutLaunchStatus,
  freeLocalRepairsRemaining,
  getPricingPlanActionLabel,
  isHumanRestorePaymentReady,
  localPackCheckoutError,
  localPackCheckoutStatus,
  onFileSelection,
  onLaunchHumanRestoreCheckout,
  onLaunchLocalPackCheckout,
  onPricingPlanAction,
  onScrollToLocalRepair,
  onStartDemoImage,
  paidLocalRepairCreditsRemaining,
}: LegacyHomePageProps) {
  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-[-8rem] top-20 h-72 w-72 rounded-full bg-[#d7a65f]/20 blur-3xl" />
      <div className="pointer-events-none absolute right-[-10rem] top-[28rem] h-96 w-96 rounded-full bg-[#211915]/10 blur-3xl" />
      <div className="mx-auto flex max-w-7xl flex-col px-4 py-6 md:px-8">
        <section className="grid items-center gap-6 py-4 lg:grid-cols-[0.98fr_1.02fr] lg:py-8">
          <div className="relative z-[1]">
            <div className="mb-4 inline-flex rounded-full border border-[#d7b98c] bg-white/80 px-4 py-2 text-sm font-black text-[#8a4f1d] shadow-sm">
              Private old photo repair. Free to start.
            </div>
            <h1 className="max-w-4xl text-4xl font-black tracking-[-0.05em] text-[#211915] sm:text-6xl lg:text-[4.25rem] lg:leading-[0.92]">
              Repair old photos privately in your browser.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-[#66574d] md:text-lg">
              Try {freeLocalRepairLimit} local repairs free. Your photos stay on
              your device. Need extra care? Choose human-reviewed restoration
              for one important photo.
            </p>
            <div className="mt-5 grid max-w-2xl grid-cols-3 gap-2">
              {showcaseCards.map(card => (
                <button
                  key={card.title}
                  type="button"
                  onClick={() => onStartDemoImage(card.image)}
                  className="group overflow-hidden rounded-[1.25rem] border border-[#e6d2b7] bg-white/80 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
                >
                  <img
                    src={card.image}
                    alt={card.title}
                    className="h-20 w-full object-cover transition duration-500 group-hover:scale-105"
                  />
                  <span className="block truncate px-3 py-2 text-xs font-black text-[#5b4a40]">
                    Try sample
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={onScrollToLocalRepair}
                className="inline-flex justify-center rounded-full bg-[#211915] px-7 py-4 text-sm font-black text-white shadow-xl shadow-[#211915]/20 transition hover:-translate-y-1 hover:bg-[#3a2820]"
              >
                Start free local repair
              </button>
              <button
                type="button"
                onClick={onLaunchHumanRestoreCheckout}
                className="inline-flex justify-center rounded-full border border-[#d7b98c] bg-white/80 px-7 py-4 text-sm font-black text-[#211915] shadow-sm transition hover:-translate-y-1 hover:bg-white"
              >
                {isHumanRestorePaymentReady
                  ? `Human Restore - ${humanRestorePrice}`
                  : 'Request Human Restore'}
              </button>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {trustPoints.map(point => (
                <div
                  key={point}
                  className="rounded-2xl border border-[#e6d2b7] bg-white/75 px-4 py-2.5 text-sm font-black text-[#5b4a40] shadow-sm"
                >
                  {point}
                </div>
              ))}
            </div>
            <div className="mt-5 hidden gap-3 lg:grid lg:grid-cols-3">
              {pricingCards.map(plan => (
                <button
                  key={plan.name}
                  type="button"
                  onClick={() => onPricingPlanAction(plan.kind)}
                  className="rounded-[1.5rem] border border-[#e6d2b7] bg-white/75 p-4 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
                >
                  <span className="text-xs font-black uppercase tracking-[0.18em] text-[#9b6b3c]">
                    {plan.badge}
                  </span>
                  <span className="mt-2 block text-xl font-black text-[#211915]">
                    {plan.name}
                  </span>
                  <span className="mt-1 block text-2xl font-black text-[#8a4f1d]">
                    {plan.price}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div
            id="local-repair-start"
            className="relative z-[1] rounded-[2rem] border border-[#d7b98c] bg-white/85 p-4 shadow-2xl shadow-[#8a4f1d]/15"
          >
            <div className="mb-3 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-[#9b6b3c]">
                  Start locally
                </p>
                <h2 className="mt-1 text-2xl font-black">
                  Drop in a photo. Keep it private.
                </h2>
              </div>
              <div className="rounded-full bg-[#211915] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#f3c16f]">
                No upload
              </div>
            </div>
            <div className="mb-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-[#e6d2b7] bg-[#fffaf3] px-4 py-2.5">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#9b6b3c]">
                  Free local starts
                </p>
                <p className="mt-1 text-2xl font-black text-[#211915]">
                  {freeLocalRepairsRemaining}/{freeLocalRepairLimit} left
                </p>
              </div>
              <div className="rounded-2xl border border-[#e6d2b7] bg-[#fffaf3] px-4 py-2.5">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#9b6b3c]">
                  Extra local credits
                </p>
                <p className="mt-1 text-2xl font-black text-[#211915]">
                  {paidLocalRepairCreditsRemaining} available
                </p>
              </div>
            </div>
            {!canStartLocalRepair && (
              <div className="mb-4 rounded-2xl border border-[#f0b5a9] bg-[#fff1ed] px-4 py-3 text-sm leading-6 text-[#8a2f1d]">
                Your {freeLocalRepairLimit} free local repairs are used. Buy{' '}
                {localRepairPackCredits} more browser-local repairs or choose
                Human-assisted Restore for one important photo.
              </div>
            )}
            {localPackCheckoutStatus === 'success' && (
              <div className="mb-4 rounded-2xl border border-[#badf9f] bg-[#f4ffe9] px-4 py-3 text-sm font-bold text-[#3f6b20]">
                Local Pack activated. {localRepairPackCredits} repair credits
                were added to this browser.
              </div>
            )}
            {localPackCheckoutStatus === 'error' && (
              <div className="mb-4 rounded-2xl border border-[#f0b5a9] bg-[#fff1ed] px-4 py-3 text-sm leading-6 text-[#8a2f1d]">
                <p className="font-black">Local Pack checkout unavailable</p>
                <p className="mt-1">{localPackCheckoutError}</p>
              </div>
            )}
            <div className="h-56 overflow-hidden rounded-[1.5rem] border border-[#e6d2b7] bg-[#f8f1e7] lg:h-60">
              <FileSelect onSelection={onFileSelection} />
            </div>
            <p className="mt-3 text-sm leading-6 text-[#6f5e54]">
              Local repair opens your photo in the browser. The model runs on
              your device after model files are downloaded and cached.
            </p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={onLaunchLocalPackCheckout}
                disabled={localPackCheckoutStatus === 'opening'}
                className="inline-flex justify-center rounded-full bg-[#211915] px-5 py-3 text-sm font-black text-white shadow-lg shadow-[#211915]/15 transition hover:-translate-y-0.5 hover:bg-[#3a2820] disabled:cursor-wait disabled:opacity-70"
              >
                {localPackCheckoutStatus === 'opening'
                  ? 'Opening checkout...'
                  : getPricingPlanActionLabel('local-pack')}
              </button>
              <button
                type="button"
                onClick={onLaunchHumanRestoreCheckout}
                className="inline-flex justify-center rounded-full border border-[#d7b98c] bg-white px-5 py-3 text-sm font-black text-[#211915] transition hover:-translate-y-0.5 hover:bg-[#fffaf3]"
              >
                {getPricingPlanActionLabel('human-restore')}
              </button>
            </div>
          </div>
        </section>

        <section
          id="pricing"
          className="relative z-[1] py-10"
          aria-labelledby="pricing-heading"
        >
          <div className="mb-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.24em] text-[#9b6b3c]">
                Choose your restore path
              </p>
              <h2
                id="pricing-heading"
                className="mt-3 max-w-3xl text-4xl font-black tracking-[-0.04em] sm:text-5xl"
              >
                Free local repair, paid local privacy, or human-reviewed cloud
                restore.
              </h2>
            </div>
            <p className="max-w-xl leading-7 text-[#66574d]">
              The three options are intentionally separated so users know when a
              photo stays local and when a paid cloud workflow is used.
            </p>
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            {pricingCards.map(plan => {
              const isFeatured = plan.kind === 'local-pack'
              const isLocalPack = plan.kind === 'local-pack'
              const isHumanRestorePlan = plan.kind === 'human-restore'
              const isLocalPackOpening =
                isLocalPack && localPackCheckoutStatus === 'opening'
              let planButtonClass =
                'border border-[#d7b98c] bg-white text-[#211915] hover:bg-[#fffaf3]'

              if (isFeatured) {
                planButtonClass =
                  'bg-[#f3c16f] text-[#211915] hover:bg-[#ffd48a]'
              } else if (isHumanRestorePlan) {
                planButtonClass = 'bg-[#211915] text-white hover:bg-[#3a2820]'
              }

              return (
                <div
                  key={plan.name}
                  className={[
                    'flex flex-col rounded-[2rem] border p-7 shadow-xl',
                    isFeatured
                      ? 'border-[#211915] bg-[#211915] text-white shadow-[#211915]/20'
                      : 'border-[#e6d2b7] bg-white/75 text-[#211915] shadow-[#8a4f1d]/10',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-2xl font-black">{plan.name}</h3>
                    <span
                      className={[
                        'rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.16em]',
                        isFeatured
                          ? 'bg-[#f3c16f] text-[#211915]'
                          : 'bg-[#fffaf3] text-[#9b6b3c]',
                      ].join(' ')}
                    >
                      {plan.badge}
                    </span>
                  </div>
                  <p
                    className={[
                      'mt-3 leading-7',
                      isFeatured ? 'text-[#e8dfd5]' : 'text-[#66574d]',
                    ].join(' ')}
                  >
                    {plan.description}
                  </p>
                  <div className="mt-6 text-5xl font-black">{plan.price}</div>
                  <ul className="mt-6 space-y-3">
                    {plan.features.map(feature => (
                      <li key={feature} className="flex gap-3">
                        <span
                          className={
                            isFeatured ? 'text-[#f3c16f]' : 'text-[#9b6b3c]'
                          }
                        >
                          *
                        </span>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => onPricingPlanAction(plan.kind)}
                    disabled={isLocalPackOpening}
                    className={[
                      'mt-auto inline-flex justify-center rounded-full px-6 py-4 text-sm font-black transition hover:-translate-y-1 disabled:cursor-wait disabled:opacity-70',
                      planButtonClass,
                    ].join(' ')}
                  >
                    {isLocalPackOpening
                      ? 'Opening checkout...'
                      : getPricingPlanActionLabel(plan.kind)}
                  </button>
                  {isLocalPack && localPackCheckoutStatus === 'success' && (
                    <p
                      className={[
                        'mt-4 rounded-2xl px-4 py-3 text-sm font-bold',
                        isFeatured
                          ? 'bg-[#30421f] text-[#d9ffc8]'
                          : 'bg-[#f4ffe9] text-[#3f6b20]',
                      ].join(' ')}
                    >
                      Activated in this browser. Current paid credits:{' '}
                      {paidLocalRepairCreditsRemaining}
                    </p>
                  )}
                  {isLocalPack && localPackCheckoutStatus === 'error' && (
                    <p
                      className={[
                        'mt-4 rounded-2xl px-4 py-3 text-sm leading-6',
                        isFeatured
                          ? 'bg-[#3a201b] text-[#ffd9d1]'
                          : 'bg-[#fff1ed] text-[#8a2f1d]',
                      ].join(' ')}
                    >
                      {localPackCheckoutError}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        <section className="relative z-[1] py-10">
          <div className="mb-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.24em] text-[#9b6b3c]">
                See what to test first
              </p>
              <h2 className="mt-3 max-w-3xl text-4xl font-black tracking-[-0.04em] sm:text-5xl">
                Start with public samples before using private memories.
              </h2>
            </div>
            <p className="max-w-xl leading-7 text-[#66574d]">
              These examples help set expectations: local repair is great for
              visible surface damage, while emotional portraits often deserve
              human review.
            </p>
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            {showcaseCards.map(card => (
              <article
                key={card.title}
                className="overflow-hidden rounded-[2rem] border border-[#e6d2b7] bg-white/80 shadow-xl shadow-[#8a4f1d]/10"
              >
                <div className="relative h-64">
                  <img
                    src={card.image}
                    alt={card.title}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute left-4 top-4 rounded-full bg-[#211915]/90 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-[#f3c16f]">
                    {card.label}
                  </div>
                </div>
                <div className="p-6">
                  <h3 className="text-2xl font-black">{card.title}</h3>
                  <p className="mt-3 leading-7 text-[#66574d]">
                    {card.description}
                  </p>
                  <button
                    type="button"
                    onClick={() => onStartDemoImage(card.image)}
                    className="mt-5 rounded-full border border-[#d7b98c] bg-[#fffaf3] px-5 py-3 text-sm font-black text-[#211915] transition hover:-translate-y-0.5 hover:bg-white"
                  >
                    Open this sample
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="relative z-[1] grid gap-4 py-10 md:grid-cols-3">
          {featureCards.map(feature => (
            <article
              key={feature.title}
              className="rounded-[1.75rem] border border-[#e6d2b7] bg-white/75 p-6 shadow-sm"
            >
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#9b6b3c]">
                {feature.label}
              </p>
              <h2 className="mt-3 text-2xl font-black">{feature.title}</h2>
              <p className="mt-4 leading-7 text-[#66574d]">
                {feature.description}
              </p>
            </article>
          ))}
        </section>

        <section
          id="privacy"
          className="relative z-[1] my-10 overflow-hidden rounded-[2.25rem] bg-[#211915] p-8 text-white shadow-2xl shadow-[#211915]/20 md:p-12"
        >
          <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#f3c16f]/20 blur-3xl" />
          <div className="relative">
            <p className="text-sm font-black uppercase tracking-[0.26em] text-[#f3c16f]">
              Privacy boundary
            </p>
            <h2 className="mt-4 max-w-3xl text-4xl font-black tracking-[-0.04em] sm:text-5xl">
              Local repair stays local. Human Restore is an explicit upload.
            </h2>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-[#e8dfd5]">
              The homepage now makes the decision clear before checkout: users
              can keep photos on-device, buy more local credits, or
              intentionally submit one photo for AI plus human review.
            </p>
            <div className="mt-8 grid gap-4 lg:grid-cols-3">
              {privacyBoundaryCards.map(card => (
                <article
                  key={card.label}
                  className="rounded-[1.5rem] border border-white/15 bg-white/[0.08] p-5"
                >
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-[#f3c16f]">
                    {card.label}
                  </p>
                  <h3 className="mt-3 text-2xl font-black">{card.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-[#e8dfd5]">
                    {card.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="relative z-[1] my-10 grid gap-8 rounded-[2.25rem] border border-[#e6d2b7] bg-white/80 p-8 shadow-xl shadow-[#8a4f1d]/10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center md:p-10">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.24em] text-[#9b6b3c]">
              Premium workflow
            </p>
            <h2 className="mt-3 text-4xl font-black tracking-[-0.04em] sm:text-5xl">
              One important photo. AI draft plus human review.
            </h2>
            <p className="mt-4 text-lg font-black text-[#211915]">
              MemoryFix AI Human-assisted Restore -{' '}
              {`${humanRestorePrice}/photo`}
            </p>
            <p className="mt-4 max-w-3xl leading-7 text-[#66574d]">
              This is the offer designed to earn the first payment: the customer
              submits one best source photo, we prepare a careful AI draft, then
              human-review the result before delivery.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={onLaunchHumanRestoreCheckout}
                disabled={checkoutLaunchStatus === 'loading'}
                className="inline-flex justify-center rounded-full bg-[#211915] px-7 py-4 text-center font-black text-white shadow-xl shadow-[#211915]/20 transition hover:-translate-y-1 hover:bg-[#3a2820] disabled:cursor-wait disabled:opacity-70"
              >
                {checkoutLaunchStatus === 'loading'
                  ? 'Preparing secure checkout...'
                  : getPricingPlanActionLabel('human-restore')}
              </button>
              <a
                href="#pricing"
                className="inline-flex justify-center rounded-full border border-[#d7b98c] bg-[#fffaf3] px-7 py-4 text-center font-black text-[#211915] transition hover:-translate-y-1 hover:bg-white"
              >
                Compare all options
              </a>
            </div>
            {checkoutLaunchStatus === 'error' && (
              <div className="mt-5 rounded-[1.5rem] border border-[#f0b5a9] bg-[#fff1ed] px-4 py-4 text-sm leading-6 text-[#8a2f1d]">
                <p className="font-black">Checkout could not be opened</p>
                <p className="mt-2">{checkoutLaunchError}</p>
              </div>
            )}
          </div>
          <div className="grid gap-4">
            {humanRestoreValueCards.map(card => (
              <article
                key={card.title}
                className="rounded-[1.5rem] border border-[#e6d2b7] bg-[#fffaf3] p-6"
              >
                <h3 className="text-2xl font-black">{card.title}</h3>
                <p className="mt-3 leading-7 text-[#66574d]">
                  {card.description}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="relative z-[1] py-10">
          <div className="mb-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.24em] text-[#9b6b3c]">
                Family memory use cases
              </p>
              <h2 className="mt-3 max-w-3xl text-4xl font-black tracking-[-0.04em] sm:text-5xl">
                Built for photos people feel nervous uploading anywhere.
              </h2>
            </div>
            <p className="max-w-xl leading-7 text-[#66574d]">
              The product should feel trustworthy before it feels clever. That
              trust is what makes both local credits and human review easier to
              buy.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {useCaseCards.map(useCase => (
              <article
                key={useCase}
                className="rounded-[1.5rem] border border-[#e6d2b7] bg-white/75 p-6 shadow-sm"
              >
                <div className="mb-5 h-2 w-16 rounded-full bg-[#9b6b3c]" />
                <h3 className="text-2xl font-black">{useCase}</h3>
              </article>
            ))}
          </div>
        </section>

        <section className="relative z-[1] py-10" aria-labelledby="faq-heading">
          <div className="mb-8 max-w-3xl">
            <p className="text-sm font-black uppercase tracking-[0.24em] text-[#9b6b3c]">
              FAQ
            </p>
            <h2
              id="faq-heading"
              className="mt-3 text-4xl font-black tracking-[-0.04em] sm:text-5xl"
            >
              Answer the privacy and payment questions before checkout.
            </h2>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {faqCards.map(card => (
              <article
                key={card.question}
                className="rounded-[1.75rem] border border-[#e6d2b7] bg-white/75 p-6 shadow-sm"
              >
                <h3 className="text-xl font-black">{card.question}</h3>
                <p className="mt-4 leading-7 text-[#66574d]">{card.answer}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="relative z-[1] py-10">
          <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.24em] text-[#9b6b3c]">
                More sample images
              </p>
              <h2 className="mt-2 text-3xl font-black">
                Test the editor before using private photos.
              </h2>
            </div>
            <p className="max-w-xl leading-7 text-[#66574d]">
              These public-domain and CC0 examples let you test repair and
              upscaling before using private family photos from your own device.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {oldPhotoSamples.map(sample => (
              <button
                key={sample.path}
                type="button"
                className="overflow-hidden rounded-2xl border border-[#e6d2b7] bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
                onClick={() => onStartDemoImage(sample.path)}
              >
                <img
                  className="h-36 w-full object-cover"
                  src={sample.path}
                  alt={sample.title}
                />
                <div className="p-3 text-left text-sm font-bold text-[#5b4a40]">
                  {sample.title}
                </div>
              </button>
            ))}
          </div>
        </section>

        <footer
          id="open-source"
          className="relative z-[1] mt-10 flex flex-col gap-4 border-t border-[#e6d2b7] py-8 text-sm leading-6 text-[#66574d] md:flex-row md:items-center md:justify-between"
        >
          <div>
            MemoryFix AI is built on the open-source{' '}
            <a
              href="https://github.com/lxfater/inpaint-web"
              target="_blank"
              rel="noreferrer"
              className="font-black text-[#211915] underline"
            >
              inpaint-web
            </a>{' '}
            project and keeps the browser-side core under GPL-3.0.
          </div>
          <div className="flex flex-wrap gap-3 font-bold text-[#211915]">
            <a href="/privacy" className="underline">
              Privacy
            </a>
            <a href="/terms" className="underline">
              Terms
            </a>
            <a href="/acceptable-use" className="underline">
              Acceptable Use
            </a>
            <a href="/delivery" className="underline">
              Delivery
            </a>
            <a href="/refund" className="underline">
              Refund
            </a>
            <a href={`mailto:${paymentContactEmail}`} className="underline">
              Support
            </a>
            <a href="#open-source" className="underline">
              Open Source
            </a>
          </div>
        </footer>
      </div>
    </div>
  )
}

export default LegacyHomePage

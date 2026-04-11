/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable jsx-a11y/control-has-associated-label */
import { ArrowLeftIcon, InformationCircleIcon } from '@heroicons/react/outline'
import { useEffect, useRef, useState } from 'react'
import { useClickAway } from 'react-use'
import Button from './components/Button'
import FileSelect from './components/FileSelect'
import Modal from './components/Modal'
import Editor from './Editor'
import { resizeImageFile } from './utils'
import Progress from './components/Progress'
import { downloadModel } from './adapters/cache'
import * as m from './paraglide/messages'
import {
  languageTag,
  onSetLanguageTag,
  setLanguageTag,
} from './paraglide/runtime'

const trustPoints = [
  'Photos stay in your browser',
  'No account required',
  'Open-source GPL-3.0 core',
  'Model files cache locally after first load',
]

const featureCards = [
  {
    title: 'Best for small damage',
    description:
      'Brush over scratches, stains, fold marks, and small missing details. This local model is helpful, but not a miracle face restorer.',
  },
  {
    title: 'Make small scans larger',
    description:
      'Use the built-in 4x upscaling workflow when a scanned family photo is too small for comfortable viewing or download.',
  },
  {
    title: 'Private by default',
    description:
      'Images are read from your device and processed in the browser. We do not upload, store, or train on your photos.',
  },
]

const pricingCards = [
  {
    name: 'Free Local',
    price: '$0',
    description: 'Repair small damaged areas and upscale individual photos.',
    features: [
      'Local image processing',
      'Manual repair brush',
      '4x upscale tool',
    ],
  },
  {
    name: 'Early Access',
    price: '$9',
    description:
      'Support the project and get priority access to stronger restoration workflows.',
    features: [
      'Batch processing roadmap',
      'HD export workflow',
      'Advanced Cloud Restore waitlist',
    ],
  },
  {
    name: 'Family Archive',
    price: '$19',
    description:
      'For users who want to restore scanned albums and family collections.',
    features: [
      'Album workflow roadmap',
      'Bulk download roadmap',
      'Optional Cloud Pro Restore later',
    ],
  },
]

const launchTrustCards = [
  {
    id: 'privacy-details',
    label: 'Privacy',
    title: 'Local-first by default',
    description:
      'Selected photos are processed in your browser. Model files may download from public hosts and cache locally, but your image file is not uploaded by the local repair workflow.',
  },
  {
    id: 'terms',
    label: 'Terms',
    title: 'Use photos you have the right to edit',
    description:
      'The current tool is provided as an early local repair workflow for scratches, stains, fold marks, and small damaged areas. Results vary by photo quality and damage severity.',
  },
  {
    id: 'open-source',
    label: 'Open Source',
    title: 'Built on GPL-3.0 inpaint-web',
    description:
      'MemoryFix AI is based on inpaint-web. The browser-side core should remain open source under GPL-3.0, with attribution preserved for upstream projects and models.',
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

const earlyAccessUrl =
  import.meta.env.VITE_EARLY_ACCESS_URL ||
  'mailto:hello@memoryfix.ai?subject=MemoryFix%20AI%20Advanced%20Restore%20Waitlist&body=I%20want%20early%20access%20to%20Advanced%20Cloud%20Restore.'

function App() {
  const [file, setFile] = useState<File>()
  const [, setStateLanguageTag] = useState<'en' | 'zh'>('en')

  const [showAbout, setShowAbout] = useState(false)
  const modalRef = useRef(null)

  const [downloadProgress, setDownloadProgress] = useState(100)

  useEffect(() => {
    const unsubscribe = onSetLanguageTag(() =>
      setStateLanguageTag(languageTag())
    )
    return () => {
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    let isActive = true

    if (!file) {
      setDownloadProgress(100)
      return () => {
        isActive = false
      }
    }

    downloadModel('inpaint', progress => {
      if (isActive) {
        setDownloadProgress(progress)
      }
    }).catch(() => {
      if (isActive) {
        setDownloadProgress(100)
      }
    })

    return () => {
      isActive = false
    }
  }, [file])

  useClickAway(modalRef, () => {
    setShowAbout(false)
  })

  async function startWithDemoImage(path: string) {
    const imgBlob = await fetch(path).then(r => r.blob())
    const filename = path.split('/').pop() ?? 'old-photo-sample.jpg'
    setFile(new File([imgBlob], filename, { type: imgBlob.type }))
  }

  async function handleFileSelection(nextFile: File) {
    const { file: resizedFile } = await resizeImageFile(nextFile, 1024 * 4)
    setFile(resizedFile)
  }

  return (
    <div className="min-h-full bg-[#f8f1e7] text-[#211915]">
      <header className="z-10 flex min-h-[72px] flex-row items-center justify-between border-b border-[#e6d2b7] bg-[#f8f1e7]/95 px-4 shadow-sm backdrop-blur md:px-8">
        <Button
          className={[
            file ? '' : 'opacity-50 pointer-events-none',
            'pl-1 pr-1',
          ].join(' ')}
          icon={<ArrowLeftIcon className="h-6 w-6" />}
          onClick={() => {
            setFile(undefined)
          }}
        >
          <div className="md:w-[180px]">
            <span className="hidden select-none sm:inline">
              {m.start_new()}
            </span>
          </div>
        </Button>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#211915] text-xl font-black text-[#f3c16f] shadow-lg shadow-[#211915]/20">
            M
          </div>
          <div>
            <div className="text-2xl font-black tracking-tight text-[#211915]">
              MemoryFix AI
            </div>
            <div className="hidden text-xs font-semibold uppercase tracking-[0.22em] text-[#9b6b3c] sm:block">
              Private old photo repair
            </div>
          </div>
        </div>
        <div className="hidden items-center justify-end gap-3 md:flex">
          {!file && (
            <>
              <a
                href="#privacy"
                className="rounded-full px-4 py-3 text-sm font-bold text-[#5b4a40] transition hover:bg-white"
              >
                Privacy
              </a>
              <a
                href="#pricing"
                className="rounded-full px-4 py-3 text-sm font-bold text-[#5b4a40] transition hover:bg-white"
              >
                Pricing
              </a>
              <a
                href="#terms"
                className="rounded-full px-4 py-3 text-sm font-bold text-[#5b4a40] transition hover:bg-white"
              >
                Terms
              </a>
              <a
                href="#open-source"
                className="rounded-full px-4 py-3 text-sm font-bold text-[#5b4a40] transition hover:bg-white"
              >
                Open Source
              </a>
            </>
          )}
          <Button
            className="flex"
            onClick={() => {
              if (languageTag() === 'zh') {
                setLanguageTag('en')
              } else {
                setLanguageTag('zh')
              }
            }}
          >
            <p>{languageTag() === 'en' ? '中文' : 'English'}</p>
          </Button>
          <Button
            className="flex"
            icon={<InformationCircleIcon className="h-6 w-6" />}
            onClick={() => {
              setShowAbout(true)
            }}
          >
            <p>{m.feedback()}</p>
          </Button>
        </div>
      </header>

      <main
        style={file ? { height: 'calc(100vh - 72px)' } : undefined}
        className={file ? 'relative' : 'relative'}
      >
        {file ? (
          <Editor file={file} />
        ) : (
          <div className="mx-auto flex max-w-7xl flex-col px-4 py-10 md:px-8">
            <section className="grid items-center gap-10 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:py-16">
              <div>
                <div className="mb-6 inline-flex rounded-full border border-[#d7b98c] bg-white/70 px-4 py-2 text-sm font-bold text-[#8a4f1d] shadow-sm">
                  Local scratch repair. Private upscaling. Advanced restore
                  soon.
                </div>
                <h1 className="max-w-4xl text-5xl font-black tracking-tight text-[#211915] sm:text-7xl">
                  Repair scratches and upscale old photos privately.
                </h1>
                <p className="mt-7 max-w-2xl text-lg leading-8 text-[#66574d]">
                  A local-first toolkit for family photos: fix small damaged
                  areas, enlarge old scans, and keep private memories in your
                  browser. Stronger advanced restoration is coming as an opt-in
                  Pro workflow.
                </p>
                <div className="mt-7 grid gap-3 sm:grid-cols-2">
                  {trustPoints.map(point => (
                    <div
                      key={point}
                      className="rounded-2xl border border-[#e6d2b7] bg-white/70 px-4 py-3 text-sm font-bold text-[#5b4a40]"
                    >
                      {point}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[2rem] border border-[#e6d2b7] bg-white/75 p-5 shadow-2xl shadow-[#8a4f1d]/10">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold uppercase tracking-[0.24em] text-[#9b6b3c]">
                      Start locally
                    </p>
                    <h2 className="mt-2 text-2xl font-black">
                      Try local repair first
                    </h2>
                  </div>
                  <div className="rounded-full bg-[#211915] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#f3c16f]">
                    Private
                  </div>
                </div>
                <div className="h-72">
                  <FileSelect onSelection={handleFileSelection} />
                </div>
                <p className="mt-4 text-sm leading-6 text-[#6f5e54]">
                  Your photo is read by the browser. The AI model runs locally
                  after it downloads and caches the model files.
                </p>
              </div>
            </section>

            <section className="grid gap-4 py-10 md:grid-cols-3">
              {featureCards.map(feature => (
                <div
                  key={feature.title}
                  className="rounded-[1.75rem] border border-[#e6d2b7] bg-white/70 p-6 shadow-sm"
                >
                  <h2 className="text-2xl font-black">{feature.title}</h2>
                  <p className="mt-4 leading-7 text-[#66574d]">
                    {feature.description}
                  </p>
                </div>
              ))}
            </section>

            <section
              id="privacy"
              className="my-10 rounded-[2rem] bg-[#211915] p-8 text-white shadow-2xl shadow-[#211915]/20 md:p-12"
            >
              <p className="text-sm font-bold uppercase tracking-[0.26em] text-[#f3c16f]">
                Privacy promise
              </p>
              <h2 className="mt-4 max-w-3xl text-4xl font-black sm:text-5xl">
                Your photos are processed locally. They are not uploaded.
              </h2>
              <p className="mt-5 max-w-3xl text-lg leading-8 text-[#e8dfd5]">
                MemoryFix AI uses browser-side inpainting and upscaling. The app
                downloads model files from public model hosts, then caches them
                locally for future sessions. Your selected photos stay on your
                device.
              </p>
            </section>

            <section className="my-10 grid gap-6 rounded-[2rem] border border-[#e6d2b7] bg-white/80 p-8 shadow-xl shadow-[#8a4f1d]/10 md:grid-cols-[1fr_auto] md:items-center md:p-10">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.24em] text-[#9b6b3c]">
                  Need stronger results?
                </p>
                <h2 className="mt-3 text-3xl font-black sm:text-4xl">
                  Join the Advanced Cloud Restore waitlist.
                </h2>
                <p className="mt-4 max-w-3xl leading-7 text-[#66574d]">
                  Local repair is best for scratches, small damaged areas, and
                  upscaling. For heavily damaged faces or photos that need a
                  bigger quality jump, we are preparing an opt-in cloud restore
                  mode that only uploads after explicit consent.
                </p>
              </div>
              <a
                href={earlyAccessUrl}
                target={
                  earlyAccessUrl.startsWith('http') ? '_blank' : undefined
                }
                rel={
                  earlyAccessUrl.startsWith('http') ? 'noreferrer' : undefined
                }
                className="inline-flex justify-center rounded-full bg-[#211915] px-7 py-4 text-center font-black text-white shadow-xl shadow-[#211915]/20 transition hover:-translate-y-1 hover:bg-[#3a2820]"
              >
                Join Early Access
              </a>
            </section>

            <section className="py-10">
              <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.24em] text-[#9b6b3c]">
                    Try sample images
                  </p>
                  <h2 className="mt-2 text-3xl font-black">
                    Test the editor before using private photos
                  </h2>
                </div>
                <p className="max-w-xl leading-7 text-[#66574d]">
                  These public-domain and CC0 examples let you test repair and
                  upscaling before using private family photos from your own
                  device.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {oldPhotoSamples.map(sample => (
                  <button
                    key={sample.path}
                    type="button"
                    className="overflow-hidden rounded-2xl border border-[#e6d2b7] bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
                    onClick={() => startWithDemoImage(sample.path)}
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

            <section id="pricing" className="py-10">
              <div className="text-center">
                <p className="text-sm font-bold uppercase tracking-[0.24em] text-[#9b6b3c]">
                  Paid validation path
                </p>
                <h2 className="mt-3 text-4xl font-black sm:text-5xl">
                  Free local repair first. Stronger Pro workflows later.
                </h2>
                <p className="mx-auto mt-5 max-w-2xl leading-7 text-[#66574d]">
                  Payments are not connected yet. This pricing block is here to
                  validate demand for HD exports, batch workflows, and Advanced
                  Cloud Restore with explicit upload consent.
                </p>
              </div>
              <div className="mt-8 grid gap-5 lg:grid-cols-3">
                {pricingCards.map((plan, index) => (
                  <div
                    key={plan.name}
                    className={[
                      'rounded-[2rem] border p-7 shadow-xl',
                      index === 1
                        ? 'border-[#211915] bg-[#211915] text-white shadow-[#211915]/20'
                        : 'border-[#e6d2b7] bg-white/70 text-[#211915] shadow-[#8a4f1d]/10',
                    ].join(' ')}
                  >
                    <h3 className="text-2xl font-black">{plan.name}</h3>
                    <p
                      className={[
                        'mt-3 leading-7',
                        index === 1 ? 'text-[#e8dfd5]' : 'text-[#66574d]',
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
                              index === 1 ? 'text-[#f3c16f]' : 'text-[#9b6b3c]'
                            }
                          >
                            *
                          </span>
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>

            <section className="py-10" aria-labelledby="trust-notes-heading">
              <div className="mb-6 max-w-3xl">
                <p className="text-sm font-bold uppercase tracking-[0.24em] text-[#9b6b3c]">
                  Launch trust notes
                </p>
                <h2
                  id="trust-notes-heading"
                  className="mt-3 text-4xl font-black sm:text-5xl"
                >
                  Clear boundaries before users try private photos.
                </h2>
                <p className="mt-5 leading-7 text-[#66574d]">
                  These notes are not a replacement for lawyer-reviewed legal
                  pages, but they make the MVP honest enough for early overseas
                  validation.
                </p>
              </div>
              <div className="grid gap-5 lg:grid-cols-3">
                {launchTrustCards.map(card => (
                  <article
                    key={card.id}
                    id={card.id}
                    className="rounded-[2rem] border border-[#e6d2b7] bg-white/75 p-7 shadow-xl shadow-[#8a4f1d]/10"
                  >
                    <p className="text-sm font-black uppercase tracking-[0.22em] text-[#9b6b3c]">
                      {card.label}
                    </p>
                    <h3 className="mt-4 text-2xl font-black">{card.title}</h3>
                    <p className="mt-4 leading-7 text-[#66574d]">
                      {card.description}
                    </p>
                  </article>
                ))}
              </div>
            </section>

            <footer className="mt-10 flex flex-col gap-4 border-t border-[#e6d2b7] py-8 text-sm leading-6 text-[#66574d] md:flex-row md:items-center md:justify-between">
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
                <a href="#privacy" className="underline">
                  Privacy
                </a>
                <a href="#terms" className="underline">
                  Terms
                </a>
                <a href="#open-source" className="underline">
                  Open Source
                </a>
              </div>
            </footer>
          </div>
        )}
      </main>

      {showAbout && (
        <Modal>
          <div ref={modalRef} className="max-w-3xl space-y-5 text-lg">
            <h2 className="text-3xl font-black">About MemoryFix AI</h2>
            <p>
              MemoryFix AI is a privacy-first old photo repair experiment built
              on the open-source inpaint-web project.
            </p>
            <p>
              The current core is browser-based: model files download from
              public hosts, then your photos are processed locally on your
              device.
            </p>
            <p>
              Source foundation:{' '}
              <a
                href="https://github.com/lxfater/inpaint-web"
                className="font-black text-[#211915] underline"
                rel="noreferrer"
                target="_blank"
              >
                inpaint-web
              </a>
            </p>
          </div>
        </Modal>
      )}
      {!(downloadProgress === 100) && (
        <Modal>
          <div className="space-y-5 text-xl">
            <p>{m.inpaint_model_download_message()}</p>
            <Progress percent={downloadProgress} />
          </div>
        </Modal>
      )}
    </div>
  )
}

export default App

import { ArrowLeftIcon, InformationCircleIcon } from '@heroicons/react/outline'
import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useClickAway } from 'react-use'

import Button from './Button'
import Modal from './Modal'
import * as m from '../paraglide/messages'
import { languageTag, setLanguageTag } from '../paraglide/runtime'

export interface AppShellProps {
  /**
   * Main page body rendered below the header. Everything else (the
   * legacy home, editor, success/secure-upload pages) is the caller's
   * responsibility so the shell stays a thin layout component.
   */
  children: ReactNode
  /**
   * Whether the user is currently inside the local editor (a file is
   * selected). Controls the visibility / behaviour of the Start New
   * button and which utility links show in the top-right.
   */
  hasActiveFile: boolean
  isAdminReviewPage: boolean
  isHumanRestoreSecureUploadPage: boolean
  isHumanRestoreSuccessPage: boolean
  isLegalRoute: boolean
  isRetoucherPortalPage: boolean
  /**
   * Invoked when the header's Start New button is pressed while the
   * user is on the home route with a file already loaded. The caller
   * is expected to clear the active file so the Hero re-appears.
   *
   * For non-home routes (success, secure upload, admin, retoucher,
   * legal) the shell handles navigation to `/` on its own.
   */
  onStartNew: () => void
}

/**
 * Cream-canvas top shell used by every route in the app.
 *
 * Responsibilities:
 *   - The persistent top nav: Start New / Back home button on the
 *     left, wordmark in the middle, Pricing + language + About on
 *     the right. The pricing link is hidden on non-home routes
 *     because there is nowhere to scroll to.
 *   - The About modal: owns its own open/close state plus the
 *     click-away behaviour. Previously these were threaded through
 *     App.tsx as free-floating useState / useRef / useClickAway.
 *   - A language toggle that flips Paraglide between en / zh.
 *
 * Extracted during the Phase 3 split so App.tsx no longer has to
 * ship 90 lines of header JSX on every render.
 */
export function AppShell({
  children,
  hasActiveFile,
  isAdminReviewPage,
  isHumanRestoreSecureUploadPage,
  isHumanRestoreSuccessPage,
  isLegalRoute,
  isRetoucherPortalPage,
  onStartNew,
}: AppShellProps) {
  const [showAbout, setShowAbout] = useState(false)
  const modalRef = useRef(null)

  useClickAway(modalRef, () => {
    setShowAbout(false)
  })

  const isOffHome =
    isHumanRestoreSuccessPage ||
    isHumanRestoreSecureUploadPage ||
    isAdminReviewPage ||
    isRetoucherPortalPage ||
    isLegalRoute
  const canGoBack = hasActiveFile || isOffHome
  const showHomeUtilityLinks = !hasActiveFile && !isOffHome

  return (
    <div className="min-h-full bg-[#f8f1e7] text-[#211915]">
      <header className="z-10 flex min-h-[72px] flex-row items-center justify-between border-b border-[#e6d2b7] bg-[#f8f1e7]/95 px-4 shadow-sm backdrop-blur md:px-8">
        {canGoBack ? (
          <Button
            className="pl-1 pr-1"
            icon={<ArrowLeftIcon className="h-6 w-6" />}
            onClick={() => {
              if (isOffHome) {
                window.location.assign('/')
                return
              }

              onStartNew()
            }}
          >
            <div className="md:w-[180px]">
              <span className="hidden select-none sm:inline">
                {isOffHome ? 'Back home' : m.start_new()}
              </span>
            </div>
          </Button>
        ) : (
          // Placeholder keeps the flex layout stable (logo stays centered)
          // when the back/start-new button has nothing to navigate to.
          <div className="md:w-[220px]" aria-hidden />
        )}
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#211915] text-xl font-black text-[#f3c16f] shadow-lg shadow-[#211915]/20">
            M
          </div>
          <div className="text-2xl font-black tracking-tight text-[#211915]">
            MemoryFix AI
          </div>
        </div>
        <div className="hidden items-center justify-end gap-3 md:flex">
          {showHomeUtilityLinks && (
            <a
              href="#pricing"
              className="rounded-md px-4 py-3 text-sm font-bold text-[#5b4a40] transition hover:bg-white"
            >
              Pricing
            </a>
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

      {children}

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
    </div>
  )
}

export default AppShell

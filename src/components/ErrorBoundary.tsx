import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[MemoryFix AI] Uncaught error:', error, info.componentStack)
  }

  render() {
    const { hasError, error } = this.state
    const { children } = this.props

    if (hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-[#f8f1e7] px-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#211915] text-3xl font-black text-[#f3c16f] shadow-lg">
            M
          </div>
          <h1 className="mt-6 text-2xl font-black text-[#211915]">
            Something went wrong
          </h1>
          <p className="mt-3 max-w-md leading-7 text-[#66574d]">
            An unexpected error occurred. Please refresh the page to try again.
            If the problem persists, contact support.
          </p>
          {error && (
            <p className="mt-4 max-w-lg rounded-xl border border-[#e6d2b7] bg-white/60 px-4 py-3 text-left font-mono text-xs text-[#9b6b3c]">
              {error.message}
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              window.location.reload()
            }}
            className="mt-8 rounded-full bg-[#211915] px-8 py-3 font-black text-white shadow-xl shadow-[#211915]/20 transition hover:-translate-y-0.5 hover:bg-[#3a2820]"
          >
            Refresh page
          </button>
        </div>
      )
    }

    return children
  }
}

export default ErrorBoundary

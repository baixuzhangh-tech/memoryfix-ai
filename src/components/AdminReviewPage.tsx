/* eslint-disable camelcase */
/* eslint-disable react-hooks/exhaustive-deps */
import { FormEvent, useEffect, useMemo, useState } from 'react'

type RestoreJob = {
  ai_error?: string | null
  ai_provider?: string | null
  checkout_email: string
  created_at: string
  delivered_at?: string | null
  expires_at?: string | null
  id: string
  notes?: string | null
  order_bound?: boolean
  order_number?: string | null
  original_file_name?: string | null
  original_file_size?: number | null
  original_file_type?: string | null
  original_signed_url?: string
  product_name?: string | null
  result_model?: string | null
  result_signed_url?: string
  retoucher_id?: string | null
  retoucher_name?: string | null
  retoucher_assigned_at?: string | null
  retoucher_uploaded_at?: string | null
  review_note?: string | null
  status: string
  submission_reference: string
  test_mode?: boolean
}

type Retoucher = {
  id: string
  name: string
  active: boolean
  created_at: string
}

type AdminApiResponse = {
  error?: string
  job?: RestoreJob
  jobs?: RestoreJob[]
  ok?: boolean
}

const statusOptions = [
  { label: 'Active queue', value: 'active' },
  { label: 'Uploaded', value: 'uploaded' },
  { label: 'Processing', value: 'processing' },
  { label: 'AI failed', value: 'ai_failed' },
  { label: 'Needs review', value: 'needs_review' },
  { label: 'Manual review', value: 'manual_review' },
  { label: 'Assigned', value: 'assigned' },
  { label: 'Delivered', value: 'delivered' },
  { label: 'All', value: 'all' },
]

function formatDate(value?: string | null) {
  if (!value) {
    return ''
  }

  const parsedDate = new Date(value)

  if (Number.isNaN(parsedDate.getTime())) {
    return ''
  }

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsedDate)
}

function formatFileSize(size?: number | null) {
  if (!size) {
    return ''
  }

  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`
  }

  return `${Math.max(1, Math.round(size / 1024))} KB`
}

function getStoredAdminToken() {
  try {
    return sessionStorage.getItem('memoryfix_admin_token') || ''
  } catch {
    return ''
  }
}

function storeAdminToken(token: string) {
  try {
    sessionStorage.setItem('memoryfix_admin_token', token)
  } catch {
    // Session storage may be unavailable.
  }
}

function getStatusClassName(status: string) {
  if (status === 'needs_review') {
    return 'border-[#b8d99f] bg-[#f4ffe8] text-[#355322]'
  }

  if (status === 'ai_failed' || status === 'failed') {
    return 'border-[#f0b5a9] bg-[#fff1ed] text-[#8a2f1d]'
  }

  if (status === 'delivered') {
    return 'border-[#b7d7e6] bg-[#eef8ff] text-[#214c63]'
  }

  if (status === 'assigned') {
    return 'border-[#c8b5e6] bg-[#f5f0ff] text-[#4a2f7a]'
  }

  return 'border-[#e6d2b7] bg-[#fffaf3] text-[#5b4a40]'
}

export default function AdminReviewPage() {
  const initialSelectedJobId = useMemo(
    () => new URLSearchParams(window.location.search).get('job') || '',
    []
  )
  const [tokenInput, setTokenInput] = useState(getStoredAdminToken)
  const [adminToken, setAdminToken] = useState(getStoredAdminToken)
  const [statusFilter, setStatusFilter] = useState('active')
  const [jobs, setJobs] = useState<RestoreJob[]>([])
  const [selectedJobId, setSelectedJobId] = useState(initialSelectedJobId)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [busyJobId, setBusyJobId] = useState('')
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({})
  const [retouchers, setRetouchers] = useState<Retoucher[]>([])
  const [assignRetoucherId, setAssignRetoucherId] = useState('')

  const selectedJob = useMemo(
    () => jobs.find(job => job.id === selectedJobId) || jobs[0] || null,
    [jobs, selectedJobId]
  )

  async function adminFetch(path: string, options: RequestInit = {}) {
    const response = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': adminToken,
        ...(options.headers || {}),
      },
    })
    const body = (await response
      .json()
      .catch(() => null)) as AdminApiResponse | null

    if (!response.ok) {
      throw new Error(body?.error || 'Admin request failed.')
    }

    return body || {}
  }

  async function loadJobs(nextStatus = statusFilter) {
    if (!adminToken) {
      return
    }

    setStatus('loading')
    setMessage('')

    try {
      const searchParams = new URLSearchParams({ status: nextStatus })
      const body = await adminFetch(
        `/api/admin/human-restore-jobs?${searchParams.toString()}`
      )
      const nextJobs = body.jobs || []

      setJobs(nextJobs)
      setSelectedJobId(currentId => {
        const preferredId = currentId || initialSelectedJobId

        return nextJobs.some(job => job.id === preferredId)
          ? preferredId
          : nextJobs[0]?.id || ''
      })
      setStatus('idle')
    } catch (error) {
      setStatus('error')
      setMessage(
        error instanceof Error ? error.message : 'Could not load restore jobs.'
      )
    }
  }

  function onUnlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedToken = tokenInput.trim()

    if (!normalizedToken) {
      setMessage('Enter the admin token configured in Vercel.')
      return
    }

    setAdminToken(normalizedToken)
    storeAdminToken(normalizedToken)
  }

  async function runAction(
    jobId: string,
    action: () => Promise<AdminApiResponse>,
    successMessage: string
  ) {
    setBusyJobId(jobId)
    setMessage('')

    try {
      const body = await action()

      if (body.job) {
        setJobs(currentJobs =>
          currentJobs.map(job => (job.id === body.job?.id ? body.job : job))
        )
        setSelectedJobId(body.job.id)
      }

      setMessage(successMessage)
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Admin action failed.'
      )
    } finally {
      setBusyJobId('')
    }
  }

  function processJob(job: RestoreJob, provider?: 'fal' | 'openai') {
    runAction(
      job.id,
      () =>
        adminFetch('/api/admin/human-restore-process', {
          method: 'POST',
          body: JSON.stringify({ jobId: job.id, provider }),
        }),
      provider
        ? `${provider} restore job updated. Review the result or refresh if it is still processing.`
        : 'AI restore job updated. Review the result or refresh if it is still processing.'
    )
  }

  async function loadRetouchers() {
    if (!adminToken) return
    try {
      const body = await adminFetch('/api/admin/human-restore-job', {
        method: 'POST',
        body: JSON.stringify({ action: 'list_retouchers' }),
      })
      const list = (body as any).retouchers || []
      setRetouchers(list.filter((r: Retoucher) => r.active))
    } catch {
      // Retoucher list is optional
    }
  }

  function assignToRetoucher(job: RestoreJob, retoucherId: string) {
    const rt = retouchers.find(r => r.id === retoucherId)
    runAction(
      job.id,
      () =>
        adminFetch('/api/admin/human-restore-job', {
          method: 'POST',
          body: JSON.stringify({
            action: 'assign_retoucher',
            jobId: job.id,
            retoucherId,
            retoucherName: rt?.name || '',
          }),
        }),
      `Job assigned to ${
        rt?.name || 'retoucher'
      }. They can now see it in the portal.`
    )
  }

  function markManual(job: RestoreJob) {
    runAction(
      job.id,
      () =>
        adminFetch('/api/admin/human-restore-job', {
          method: 'PATCH',
          body: JSON.stringify({
            jobId: job.id,
            reviewNote: reviewNotes[job.id] || '',
            status: 'manual_review',
          }),
        }),
      'Job moved to manual review.'
    )
  }

  function markFailed(job: RestoreJob) {
    runAction(
      job.id,
      () =>
        adminFetch('/api/admin/human-restore-job', {
          method: 'PATCH',
          body: JSON.stringify({
            jobId: job.id,
            reviewNote: reviewNotes[job.id] || '',
            status: 'failed',
          }),
        }),
      'Job marked as failed.'
    )
  }

  function deliverJob(job: RestoreJob) {
    runAction(
      job.id,
      () =>
        adminFetch('/api/admin/human-restore-deliver', {
          method: 'POST',
          body: JSON.stringify({
            jobId: job.id,
            reviewNote: reviewNotes[job.id] || '',
          }),
        }),
      'Delivery email sent. The job is now marked as delivered.'
    )
  }

  useEffect(() => {
    if (adminToken) {
      loadJobs(statusFilter)
      loadRetouchers()
    }
  }, [adminToken, statusFilter])

  if (!adminToken) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col px-4 py-12 md:px-8">
        <section className="rounded-[2rem] border border-[#e6d2b7] bg-white/85 p-8 shadow-2xl shadow-[#8a4f1d]/10 md:p-10">
          <p className="text-sm font-bold uppercase tracking-[0.24em] text-[#9b6b3c]">
            Admin review
          </p>
          <h1 className="mt-4 text-4xl font-black tracking-tight text-[#211915] sm:text-5xl">
            Unlock the restore review queue.
          </h1>
          <p className="mt-4 leading-7 text-[#66574d]">
            Enter the private admin token from `HUMAN_RESTORE_ADMIN_TOKEN`. This
            token stays in this browser session and is sent only to MemoryFix AI
            admin APIs.
          </p>
          <form className="mt-8 grid gap-4" onSubmit={onUnlock}>
            <input
              type="password"
              value={tokenInput}
              onChange={event => setTokenInput(event.currentTarget.value)}
              className="rounded-2xl border border-[#d7b98c] bg-[#fffaf3] px-4 py-4 text-base text-[#211915] outline-none transition focus:border-[#211915]"
              placeholder="Admin token"
            />
            <button
              type="submit"
              className="inline-flex justify-center rounded-full bg-[#211915] px-7 py-4 text-center font-black text-white shadow-xl shadow-[#211915]/20 transition hover:-translate-y-1 hover:bg-[#3a2820]"
            >
              Open review queue
            </button>
          </form>
          {message && (
            <p className="mt-4 rounded-2xl border border-[#f0b5a9] bg-[#fff1ed] px-4 py-4 text-[#8a2f1d]">
              {message}
            </p>
          )}
        </section>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col px-4 py-10 md:px-8">
      <section className="rounded-[2rem] border border-[#e6d2b7] bg-white/85 p-8 shadow-2xl shadow-[#8a4f1d]/10 md:p-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.24em] text-[#9b6b3c]">
              Human review queue
            </p>
            <h1 className="mt-4 text-4xl font-black tracking-tight text-[#211915] sm:text-5xl">
              Review AI restores before delivery.
            </h1>
            <p className="mt-4 max-w-3xl leading-7 text-[#66574d]">
              Process uploaded paid orders with cloud AI, compare before/after,
              then send the result only after you approve it.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <select
              value={statusFilter}
              onChange={event => setStatusFilter(event.currentTarget.value)}
              className="rounded-full border border-[#d7b98c] bg-[#fffaf3] px-5 py-3 font-bold text-[#211915] outline-none"
            >
              {statusOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => loadJobs()}
              className="rounded-full border border-[#211915] px-6 py-3 font-black text-[#211915] transition hover:-translate-y-1 hover:bg-white"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => {
                setAdminToken('')
                setTokenInput('')
                storeAdminToken('')
              }}
              className="rounded-full border border-[#d7b98c] px-6 py-3 font-black text-[#5b4a40] transition hover:-translate-y-1 hover:bg-white"
            >
              Lock
            </button>
          </div>
        </div>

        {message && (
          <div className="mt-6 rounded-[1.5rem] border border-[#e6d2b7] bg-[#fffaf3] px-5 py-4 text-sm leading-6 text-[#5b4a40]">
            {message}
          </div>
        )}

        {status === 'loading' && (
          <p className="mt-6 text-lg font-black text-[#211915]">
            Loading restore jobs...
          </p>
        )}

        {status === 'error' && (
          <p className="mt-6 rounded-[1.5rem] border border-[#f0b5a9] bg-[#fff1ed] px-5 py-4 text-[#8a2f1d]">
            {message}
          </p>
        )}
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.4fr]">
        <aside className="grid content-start gap-3">
          {jobs.length === 0 && status !== 'loading' && (
            <section className="rounded-[2rem] border border-[#e6d2b7] bg-white/80 p-6 text-[#66574d] shadow-xl shadow-[#8a4f1d]/10">
              No restore jobs match this filter yet.
            </section>
          )}

          {jobs.map(job => (
            <button
              key={job.id}
              type="button"
              onClick={() => setSelectedJobId(job.id)}
              className={[
                'rounded-[1.75rem] border p-5 text-left shadow-xl transition hover:-translate-y-1',
                selectedJob?.id === job.id
                  ? 'border-[#211915] bg-[#211915] text-white shadow-[#211915]/20'
                  : 'border-[#e6d2b7] bg-white/80 text-[#211915] shadow-[#8a4f1d]/10',
              ].join(' ')}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={[
                    'rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.12em]',
                    getStatusClassName(job.status),
                  ].join(' ')}
                >
                  {job.status}
                </span>
                {job.test_mode && (
                  <span className="rounded-full border border-[#b7d7e6] bg-[#eef8ff] px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-[#214c63]">
                    Test
                  </span>
                )}
              </div>
              <p className="mt-4 text-lg font-black">
                {job.submission_reference}
              </p>
              <p
                className={[
                  'mt-2 text-sm',
                  selectedJob?.id === job.id
                    ? 'text-[#e8dfd5]'
                    : 'text-[#66574d]',
                ].join(' ')}
              >
                {job.order_number || 'No order number'} ·{' '}
                {formatDate(job.created_at)}
              </p>
            </button>
          ))}
        </aside>

        {selectedJob && (
          <section className="rounded-[2rem] border border-[#e6d2b7] bg-white/85 p-6 shadow-2xl shadow-[#8a4f1d]/10 md:p-8">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <div className="flex flex-wrap gap-2">
                  <span
                    className={[
                      'rounded-full border px-4 py-2 text-sm font-black uppercase tracking-[0.12em]',
                      getStatusClassName(selectedJob.status),
                    ].join(' ')}
                  >
                    {selectedJob.status}
                  </span>
                  {selectedJob.order_bound && (
                    <span className="rounded-full border border-[#b8d99f] bg-[#f4ffe8] px-4 py-2 text-sm font-black uppercase tracking-[0.12em] text-[#355322]">
                      Order-bound
                    </span>
                  )}
                </div>
                <h2 className="mt-4 text-3xl font-black text-[#211915]">
                  {selectedJob.submission_reference}
                </h2>
                <p className="mt-3 leading-7 text-[#66574d]">
                  {selectedJob.checkout_email} ·{' '}
                  {selectedJob.order_number || 'No order number'}
                </p>
              </div>
              <div className="grid gap-2 text-sm text-[#66574d]">
                <p>
                  Created:{' '}
                  <span className="font-bold text-[#211915]">
                    {formatDate(selectedJob.created_at)}
                  </span>
                </p>
                <p>
                  Retention until:{' '}
                  <span className="font-bold text-[#211915]">
                    {formatDate(selectedJob.expires_at)}
                  </span>
                </p>
                <p>
                  File:{' '}
                  <span className="font-bold text-[#211915]">
                    {selectedJob.original_file_name || 'Photo'}{' '}
                    {formatFileSize(selectedJob.original_file_size)}
                  </span>
                </p>
              </div>
            </div>

            <div className="mt-8 grid gap-5 xl:grid-cols-2">
              <article className="rounded-[1.5rem] border border-[#e6d2b7] bg-[#fffaf3] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="font-black">Original</h3>
                  {selectedJob.original_signed_url && (
                    <a
                      href={selectedJob.original_signed_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-black underline"
                    >
                      Open
                    </a>
                  )}
                </div>
                {selectedJob.original_signed_url ? (
                  <img
                    src={selectedJob.original_signed_url}
                    alt="Original upload"
                    className="max-h-[520px] w-full rounded-[1.25rem] object-contain"
                    crossOrigin="anonymous"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="rounded-[1.25rem] border border-dashed border-[#d7b98c] p-8 text-center text-[#66574d]">
                    Original signed URL is unavailable.
                  </div>
                )}
              </article>

              <article className="rounded-[1.5rem] border border-[#e6d2b7] bg-[#fffaf3] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="font-black">AI result</h3>
                  {selectedJob.result_signed_url && (
                    <a
                      href={selectedJob.result_signed_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-black underline"
                    >
                      Open
                    </a>
                  )}
                </div>
                {selectedJob.result_signed_url ? (
                  <img
                    src={selectedJob.result_signed_url}
                    alt="AI restored result"
                    className="max-h-[520px] w-full rounded-[1.25rem] object-contain"
                    crossOrigin="anonymous"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="rounded-[1.25rem] border border-dashed border-[#d7b98c] p-8 text-center text-[#66574d]">
                    Run AI restore to generate a result for review.
                  </div>
                )}
              </article>
            </div>

            <div className="mt-6 grid gap-4 rounded-[1.5rem] border border-[#e6d2b7] bg-[#fffaf3] p-5">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.14em] text-[#9b6b3c]">
                  Customer repair notes
                </p>
                <p className="mt-3 whitespace-pre-wrap leading-7 text-[#211915]">
                  {selectedJob.notes || 'No notes provided.'}
                </p>
              </div>
              {selectedJob.ai_error && (
                <div className="rounded-[1.25rem] border border-[#f0b5a9] bg-[#fff1ed] px-4 py-4 text-[#8a2f1d]">
                  <p className="font-black">AI error</p>
                  <p className="mt-2">{selectedJob.ai_error}</p>
                </div>
              )}
              {(selectedJob.ai_provider || selectedJob.result_model) && (
                <p className="text-sm leading-6 text-[#66574d]">
                  Provider: {selectedJob.ai_provider || 'unknown'} · Model:{' '}
                  {selectedJob.result_model || 'unknown'}
                </p>
              )}
            </div>

            <label className="mt-6 grid gap-2" htmlFor="review-note">
              <span className="text-sm font-black uppercase tracking-[0.14em] text-[#211915]">
                Review note for delivery or internal handling
              </span>
              <textarea
                id="review-note"
                value={
                  reviewNotes[selectedJob.id] ?? selectedJob.review_note ?? ''
                }
                onChange={event =>
                  setReviewNotes(currentNotes => ({
                    ...currentNotes,
                    [selectedJob.id]: event.currentTarget.value,
                  }))
                }
                className="min-h-[120px] rounded-[1.5rem] border border-[#d7b98c] bg-[#fffaf3] px-4 py-4 text-base leading-7 text-[#211915] outline-none transition focus:border-[#211915]"
                placeholder="Optional note: what was improved, limitations, or why this needs manual handling."
              />
            </label>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busyJobId === selectedJob.id}
                onClick={() => processJob(selectedJob)}
                className="rounded-full bg-[#211915] px-6 py-3 font-black text-white shadow-xl shadow-[#211915]/20 transition hover:-translate-y-1 disabled:opacity-60"
              >
                {selectedJob.status === 'processing'
                  ? 'Refresh AI result'
                  : 'Run AI restore'}
              </button>
              <button
                type="button"
                disabled={busyJobId === selectedJob.id}
                onClick={() => processJob(selectedJob, 'openai')}
                className="rounded-full border border-[#211915] px-6 py-3 font-black text-[#211915] transition hover:-translate-y-1 hover:bg-white disabled:opacity-60"
              >
                Retry with OpenAI
              </button>
              <button
                type="button"
                disabled={busyJobId === selectedJob.id}
                onClick={() => processJob(selectedJob, 'fal')}
                className="rounded-full border border-[#d7b98c] px-6 py-3 font-black text-[#5b4a40] transition hover:-translate-y-1 hover:bg-white disabled:opacity-60"
              >
                Retry with fal
              </button>
              <button
                type="button"
                disabled={
                  busyJobId === selectedJob.id ||
                  !selectedJob.result_signed_url ||
                  selectedJob.status === 'delivered'
                }
                onClick={() => deliverJob(selectedJob)}
                className="rounded-full border border-[#355322] bg-[#f4ffe8] px-6 py-3 font-black text-[#355322] transition hover:-translate-y-1 disabled:opacity-60"
              >
                Approve & send
              </button>
              <button
                type="button"
                disabled={busyJobId === selectedJob.id}
                onClick={() => markManual(selectedJob)}
                className="rounded-full border border-[#d7b98c] px-6 py-3 font-black text-[#5b4a40] transition hover:-translate-y-1 disabled:opacity-60"
              >
                Needs manual review
              </button>
              <button
                type="button"
                disabled={busyJobId === selectedJob.id}
                onClick={() => markFailed(selectedJob)}
                className="rounded-full border border-[#f0b5a9] bg-[#fff1ed] px-6 py-3 font-black text-[#8a2f1d] transition hover:-translate-y-1 disabled:opacity-60"
              >
                Mark failed
              </button>
            </div>

            {retouchers.length > 0 && selectedJob.status !== 'delivered' && (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-[1.5rem] border border-[#c8b5e6] bg-[#f5f0ff] p-4">
                <span className="text-sm font-black text-[#4a2f7a]">
                  {selectedJob.retoucher_name
                    ? `Assigned to: ${selectedJob.retoucher_name}`
                    : 'Assign to retoucher:'}
                </span>
                <select
                  value={assignRetoucherId}
                  onChange={e => setAssignRetoucherId(e.currentTarget.value)}
                  className="rounded-full border border-[#c8b5e6] bg-white px-4 py-2 text-sm font-bold text-[#4a2f7a] outline-none"
                >
                  <option value="">Select retoucher...</option>
                  {retouchers.map(rt => (
                    <option key={rt.id} value={rt.id}>
                      {rt.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!assignRetoucherId || busyJobId === selectedJob.id}
                  onClick={() =>
                    assignToRetoucher(selectedJob, assignRetoucherId)
                  }
                  className="rounded-full bg-[#4a2f7a] px-5 py-2 text-sm font-black text-white transition hover:-translate-y-0.5 disabled:opacity-60"
                >
                  {selectedJob.retoucher_id ? 'Reassign' : 'Assign'}
                </button>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

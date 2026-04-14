import { useCallback, useEffect, useRef, useState } from 'react'

type RetoucherJob = {
  id: string
  submissionReference: string
  status: string
  notes: string
  originalFileName: string
  originalFileSize: number
  originalDownloadUrl: string
  assignedAt: string
  uploadedAt: string | null
  createdAt: string
}

type UploadState = {
  jobId: string
  status: 'idle' | 'uploading' | 'success' | 'error'
  error: string
  submissionReference: string
}

const TOKEN_KEY = 'retoucher_token'
const MAX_DIRECT_UPLOAD_BYTES = 3.5 * 1024 * 1024
const MAX_DELIVERY_EDGE = 2600

function savedToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

function persistToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // ignore
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function readApiResponse(res: Response): Promise<any> {
  const text = await res.text()

  if (!text) return {}

  try {
    return JSON.parse(text)
  } catch {
    return {
      error: res.ok
        ? '服务器返回了无法识别的响应，请刷新后重试。'
        : text.slice(0, 180) || '请求失败，请稍后重试。',
    }
  }
}

async function prepareDeliveryImage(file: File): Promise<File> {
  if (file.size <= MAX_DIRECT_UPLOAD_BYTES) {
    return file
  }

  const imageBitmap = await createImageBitmap(file)
  const scale = Math.min(
    1,
    MAX_DELIVERY_EDGE / Math.max(imageBitmap.width, imageBitmap.height)
  )
  const width = Math.max(1, Math.round(imageBitmap.width * scale))
  const height = Math.max(1, Math.round(imageBitmap.height * scale))
  const canvas = document.createElement('canvas')

  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')?.drawImage(imageBitmap, 0, 0, width, height)
  imageBitmap.close()

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'restored-photo'
  const qualities = [0.9, 0.82, 0.74, 0.66]

  for (const quality of qualities) {
    const blob = await new Promise<Blob | null>(resolve => {
      canvas.toBlob(resolve, 'image/jpeg', quality)
    })

    if (blob && blob.size <= MAX_DIRECT_UPLOAD_BYTES) {
      return new File([blob], `${baseName}-delivery.jpg`, {
        lastModified: Date.now(),
        type: 'image/jpeg',
      })
    }
  }

  throw new Error(
    '修复结果图片过大。请导出为 JPG，最长边不超过 2600px，文件小于 3.5MB 后再上传。'
  )
}

export default function RetoucherPortal() {
  const [token, setToken] = useState(savedToken)
  const [tokenInput, setTokenInput] = useState('')
  const [jobs, setJobs] = useState<RetoucherJob[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [retoucherName, setRetoucherName] = useState('')
  const [upload, setUpload] = useState<UploadState>({
    jobId: '',
    status: 'idle',
    error: '',
    submissionReference: '',
  })
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchJobs = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/retoucher-portal', {
        method: 'POST',
        headers: {
          'x-retoucher-token': token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'jobs' }),
      })
      const data = await readApiResponse(res)
      if (!res.ok) {
        if (res.status === 401) {
          setToken('')
          localStorage.removeItem(TOKEN_KEY)
          setError('Token 无效或已停用，请重新输入。')
          return
        }
        throw new Error(data.error || 'Failed to load jobs')
      }
      setJobs(data.jobs || [])
      setRetoucherName(data.retoucherName || '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load jobs')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (token) fetchJobs()
  }, [token, fetchJobs])

  function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    const t = tokenInput.trim()
    if (!t) return
    persistToken(t)
    setToken(t)
    setTokenInput('')
  }

  function handleLogout() {
    setToken('')
    setJobs([])
    localStorage.removeItem(TOKEN_KEY)
  }

  function handleUploadClick(job: RetoucherJob) {
    setUpload({
      jobId: job.id,
      status: 'idle',
      error: '',
      submissionReference: job.submissionReference,
    })
    fileInputRef.current?.click()
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !upload.jobId) return

    // Reset input so the same file can be selected again
    e.target.value = ''

    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(file.type)) {
      setUpload(prev => ({
        ...prev,
        status: 'error',
        error: '仅支持 JPG / PNG / WebP 格式',
      }))
      return
    }

    if (file.size > 50 * 1024 * 1024) {
      setUpload(prev => ({
        ...prev,
        status: 'error',
        error: '文件不能超过 50MB',
      }))
      return
    }

    setUpload(prev => ({ ...prev, status: 'uploading', error: '' }))

    try {
      const deliveryFile = await prepareDeliveryImage(file)
      const formData = new FormData()
      formData.append('jobId', upload.jobId)
      formData.append('file', deliveryFile)

      const res = await fetch('/api/retoucher-portal', {
        method: 'POST',
        headers: { 'x-retoucher-token': token },
        body: formData,
      })
      const data = await readApiResponse(res)

      if (!res.ok) {
        throw new Error(data.error || 'Upload failed')
      }

      setUpload(prev => ({ ...prev, status: 'success' }))
      // Refresh job list after successful delivery
      await fetchJobs()
    } catch (err) {
      setUpload(prev => ({
        ...prev,
        status: 'error',
        error: err instanceof Error ? err.message : 'Upload failed',
      }))
    }
  }

  // -- Login screen --
  if (!token) {
    return (
      <div style={styles.container}>
        <div style={styles.loginCard}>
          <h1 style={styles.title}>MemoryFix 修图师工作台</h1>
          <p style={styles.subtitle}>请输入您的访问令牌</p>
          <form onSubmit={handleLogin} style={styles.loginForm}>
            <input
              type="password"
              value={tokenInput}
              onChange={e => setTokenInput(e.target.value)}
              placeholder="粘贴令牌..."
              style={styles.input}
            />
            <button type="submit" style={styles.primaryBtn}>
              登录
            </button>
          </form>
          {error && <p style={styles.errorText}>{error}</p>}
        </div>
      </div>
    )
  }

  // -- Main portal --
  const assignedJobs = jobs.filter(j => j.status === 'assigned')
  const deliveredJobs = jobs.filter(j => j.status === 'delivered')

  return (
    <div style={styles.container}>
      <div style={styles.portal}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>修图师工作台</h1>
            {retoucherName && (
              <span style={styles.nameTag}>{retoucherName}</span>
            )}
          </div>
          <div style={styles.headerRight}>
            <button
              type="button"
              onClick={fetchJobs}
              style={styles.secondaryBtn}
            >
              刷新
            </button>
            <button
              type="button"
              onClick={handleLogout}
              style={styles.logoutBtn}
            >
              退出
            </button>
          </div>
        </div>

        {error && <p style={styles.errorText}>{error}</p>}
        {loading && <p style={styles.loadingText}>加载中...</p>}

        {/* Upload status toast */}
        {upload.status === 'uploading' && (
          <div style={styles.toast}>
            ⏳ 正在上传并交付 {upload.submissionReference}...
          </div>
        )}
        {upload.status === 'success' && (
          <div style={{ ...styles.toast, ...styles.successToast }}>
            ✅ {upload.submissionReference} 已自动交付给客户
          </div>
        )}
        {upload.status === 'error' && upload.error && (
          <div style={{ ...styles.toast, ...styles.errorToast }}>
            ❌ {upload.error}
          </div>
        )}

        {/* Assigned jobs (pending work) */}
        <h2 style={styles.sectionTitle}>待处理任务 ({assignedJobs.length})</h2>
        {assignedJobs.length === 0 && !loading && (
          <p style={styles.emptyText}>暂无待处理任务</p>
        )}
        <div style={styles.jobList}>
          {assignedJobs.map(job => (
            <div key={job.id} style={styles.jobCard}>
              <div style={styles.jobHeader}>
                <span style={styles.jobRef}>{job.submissionReference}</span>
                <span style={styles.statusBadge}>待修复</span>
              </div>
              <div style={styles.jobMeta}>
                <span>
                  {job.originalFileName} ({formatBytes(job.originalFileSize)})
                </span>
                <span>分配于 {formatDate(job.assignedAt)}</span>
              </div>
              {job.notes && <p style={styles.notes}>备注: {job.notes}</p>}
              <div style={styles.jobActions}>
                <a
                  href={job.originalDownloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={styles.downloadBtn}
                >
                  下载原片
                </a>
                <button
                  type="button"
                  onClick={() => handleUploadClick(job)}
                  style={styles.uploadBtn}
                  disabled={upload.status === 'uploading'}
                >
                  {upload.status === 'uploading' && upload.jobId === job.id
                    ? '上传中...'
                    : '上传修复结果'}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Delivered jobs (history) */}
        {deliveredJobs.length > 0 && (
          <>
            <h2 style={styles.sectionTitle}>已完成 ({deliveredJobs.length})</h2>
            <div style={styles.jobList}>
              {deliveredJobs.map(job => (
                <div
                  key={job.id}
                  style={{ ...styles.jobCard, ...styles.deliveredCard }}
                >
                  <div style={styles.jobHeader}>
                    <span style={styles.jobRef}>{job.submissionReference}</span>
                    <span style={styles.deliveredBadge}>已交付</span>
                  </div>
                  <div style={styles.jobMeta}>
                    <span>{job.originalFileName}</span>
                    <span>交付于 {formatDate(job.uploadedAt || '')}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: 'none' }}
          onChange={handleFileSelected}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Inline styles (no Tailwind dependency needed for this standalone page)
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#faf6f1',
    display: 'flex',
    justifyContent: 'center',
    padding: '32px 16px',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  loginCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: '48px 32px',
    maxWidth: 400,
    width: '100%',
    textAlign: 'center' as const,
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
    alignSelf: 'flex-start',
    marginTop: 80,
  },
  portal: {
    maxWidth: 720,
    width: '100%',
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: '#211915',
    margin: 0,
  },
  subtitle: {
    color: '#8a7a6e',
    marginTop: 8,
    fontSize: 14,
  },
  loginForm: {
    marginTop: 24,
    display: 'flex',
    gap: 8,
  },
  input: {
    flex: 1,
    padding: '10px 14px',
    borderRadius: 8,
    border: '1px solid #e0d6cc',
    fontSize: 14,
    outline: 'none',
  },
  primaryBtn: {
    padding: '10px 20px',
    borderRadius: 8,
    border: 'none',
    backgroundColor: '#4a3728',
    color: '#fff',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
  },
  secondaryBtn: {
    padding: '6px 14px',
    borderRadius: 6,
    border: '1px solid #d4c8bb',
    backgroundColor: '#fff',
    color: '#4a3728',
    fontSize: 13,
    cursor: 'pointer',
  },
  logoutBtn: {
    padding: '6px 14px',
    borderRadius: 6,
    border: '1px solid #d4c8bb',
    backgroundColor: '#fff',
    color: '#999',
    fontSize: 13,
    cursor: 'pointer',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  headerRight: {
    display: 'flex',
    gap: 8,
  },
  nameTag: {
    fontSize: 13,
    color: '#9b6b3c',
    fontWeight: 500,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: '#4a3728',
    marginTop: 24,
    marginBottom: 12,
    borderBottom: '1px solid #e6d2b7',
    paddingBottom: 8,
  },
  jobList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
  },
  jobCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: '16px 20px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    border: '1px solid #ede4d9',
  },
  deliveredCard: {
    opacity: 0.7,
  },
  jobHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  jobRef: {
    fontWeight: 600,
    fontSize: 15,
    color: '#211915',
  },
  statusBadge: {
    fontSize: 12,
    fontWeight: 600,
    color: '#c47a1a',
    backgroundColor: '#fef3e0',
    padding: '2px 10px',
    borderRadius: 12,
  },
  deliveredBadge: {
    fontSize: 12,
    fontWeight: 600,
    color: '#2e7d32',
    backgroundColor: '#e8f5e9',
    padding: '2px 10px',
    borderRadius: 12,
  },
  jobMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 13,
    color: '#8a7a6e',
    marginBottom: 4,
  },
  notes: {
    fontSize: 13,
    color: '#6d5d50',
    backgroundColor: '#faf6f1',
    padding: '6px 10px',
    borderRadius: 6,
    marginTop: 8,
    marginBottom: 0,
  },
  jobActions: {
    display: 'flex',
    gap: 10,
    marginTop: 12,
  },
  downloadBtn: {
    padding: '8px 16px',
    borderRadius: 8,
    border: '1px solid #d4c8bb',
    backgroundColor: '#fff',
    color: '#4a3728',
    fontSize: 13,
    fontWeight: 600,
    textDecoration: 'none',
    cursor: 'pointer',
    display: 'inline-block',
  },
  uploadBtn: {
    padding: '8px 16px',
    borderRadius: 8,
    border: 'none',
    backgroundColor: '#4a3728',
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  toast: {
    padding: '12px 16px',
    borderRadius: 8,
    backgroundColor: '#e3f2fd',
    color: '#1565c0',
    fontSize: 14,
    marginBottom: 16,
  },
  successToast: {
    backgroundColor: '#e8f5e9',
    color: '#2e7d32',
  },
  errorToast: {
    backgroundColor: '#fbe9e7',
    color: '#c62828',
  },
  errorText: {
    color: '#c62828',
    fontSize: 14,
    marginTop: 12,
  },
  loadingText: {
    color: '#8a7a6e',
    fontSize: 14,
  },
  emptyText: {
    color: '#8a7a6e',
    fontSize: 14,
    textAlign: 'center' as const,
    padding: '32px 0',
  },
}

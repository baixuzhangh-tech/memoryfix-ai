import { json } from '../_lib/human-restore.js'
import { requireRetoucher } from '../_lib/retoucher-auth.js'
import { createSignedUrl, listJobsByRetoucher } from '../_lib/supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return json(res, 405, { error: 'Method not allowed.' })
  }

  const retoucher = await requireRetoucher(req, res)

  if (!retoucher) {
    return
  }

  try {
    const status = req.query?.status || undefined
    const jobs = await listJobsByRetoucher(retoucher.id, { status })

    const jobsWithUrls = await Promise.all(
      (jobs || []).map(async job => {
        const originalSignedUrl = await createSignedUrl({
          bucket: job.original_storage_bucket,
          path: job.original_storage_path,
        })

        return {
          id: job.id,
          submissionReference: job.submission_reference,
          status: job.status,
          notes: job.notes || '',
          originalFileName: job.original_file_name,
          originalFileSize: job.original_file_size,
          originalDownloadUrl: originalSignedUrl,
          assignedAt: job.retoucher_assigned_at,
          uploadedAt: job.retoucher_uploaded_at,
          createdAt: job.created_at,
        }
      })
    )

    json(res, 200, { ok: true, jobs: jobsWithUrls })
  } catch (error) {
    json(res, 500, {
      error:
        error instanceof Error
          ? error.message
          : 'Could not list retoucher jobs.',
    })
  }
}

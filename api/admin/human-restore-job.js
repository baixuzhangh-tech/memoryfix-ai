import { requireAdmin } from '../_lib/admin.js'
import { json, readRawBody } from '../_lib/human-restore.js'
import {
  createJobSignedUrls,
  getJob,
  insertEvent,
  updateJob,
} from '../_lib/supabase.js'

export const config = {
  api: {
    bodyParser: false,
  },
}

const allowedStatuses = new Set([
  'uploaded',
  'processing',
  'ai_failed',
  'needs_review',
  'manual_review',
  'delivered',
  'failed',
])

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) {
    return
  }

  if (req.method !== 'PATCH') {
    json(res, 405, { error: 'Method not allowed.' })
    return
  }

  try {
    const rawBody = await readRawBody(req)
    const body = rawBody.length ? JSON.parse(rawBody.toString('utf8')) : {}
    const jobId = body.jobId

    if (!jobId) {
      json(res, 400, { error: 'jobId is required.' })
      return
    }

    const job = await getJob(jobId)

    if (!job) {
      json(res, 404, { error: 'Restore job not found.' })
      return
    }

    const patch = {}

    if (body.status) {
      if (!allowedStatuses.has(body.status)) {
        json(res, 400, { error: 'Unsupported restore job status.' })
        return
      }

      patch.status = body.status
    }

    if (typeof body.reviewNote === 'string') {
      patch.review_note = body.reviewNote
    }

    if (!Object.keys(patch).length) {
      json(res, 400, { error: 'No update was provided.' })
      return
    }

    const updatedJob = await updateJob(jobId, patch)

    await insertEvent(jobId, 'admin_job_updated', patch)

    json(res, 200, {
      job: await createJobSignedUrls(updatedJob),
      ok: true,
    })
  } catch (error) {
    json(res, 500, {
      error:
        error instanceof Error
          ? error.message
          : 'Could not update restore job.',
    })
  }
}

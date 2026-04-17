import { requireAdmin } from '../_lib/admin.js'
import { runRestoreJob } from '../_lib/ai-restore.js'
import { json, readRawBody } from '../_lib/human-restore.js'
import {
  createJobSignedUrls,
  getJob,
  insertEvent,
  updateOrderByJobId,
} from '../_lib/supabase.js'

const terminalOrSettledStatuses = new Set([
  'needs_review',
  'delivered',
  'assigned',
  'manual_review',
  'failed',
])

function hasExplicitRerunIntent(body) {
  return Boolean(
    body &&
      (body.pipelineId ||
        body.provider ||
        body.modelPreset ||
        body.forceRerun === true)
  )
}

function shouldSkipDefaultTimedOutFalRetry(job, body) {
  if (!job) {
    return false
  }

  if (hasExplicitRerunIntent(body)) {
    return false
  }

  return terminalOrSettledStatuses.has(job.status)
}

export const config = {
  api: {
    bodyParser: false,
  },
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) {
    return
  }

  if (req.method !== 'POST') {
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

    if (shouldSkipDefaultTimedOutFalRetry(job, body)) {
      await insertEvent(job.id, 'ai_restore_process_skipped', {
        provider: job.ai_provider || null,
        reason: 'manual_review_requires_explicit_retry',
        status: job.status,
      })
      await updateOrderByJobId(job.id, {
        status: job.status,
      }).catch(() => null)

      json(res, 200, {
        job: await createJobSignedUrls(job),
        ok: true,
        skipped: true,
      })
      return
    }

    const updatedJob = await runRestoreJob({
      job,
      pipelineId: body.pipelineId,
      modelPreset: body.modelPreset,
      provider: body.provider,
      forceRerun: body.forceRerun === true,
      triggeredBy: 'admin_manual',
    })

    await insertEvent(updatedJob.id, 'ai_restore_processed', {
      pipeline_id: body.pipelineId || null,
      model_preset: body.modelPreset || null,
      provider: updatedJob.ai_provider,
      status: updatedJob.status,
    })
    await updateOrderByJobId(updatedJob.id, {
      status: updatedJob.status,
    }).catch(() => null)

    json(res, 200, {
      job: await createJobSignedUrls(updatedJob),
      ok: true,
    })
  } catch (error) {
    json(res, 500, {
      error:
        error instanceof Error
          ? error.message
          : 'Could not process restore job.',
    })
  }
}

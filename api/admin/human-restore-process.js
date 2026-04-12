import { requireAdmin } from '../_lib/admin.js'
import { runRestoreJob } from '../_lib/ai-restore.js'
import { json, readRawBody } from '../_lib/human-restore.js'
import { createJobSignedUrls, getJob, insertEvent } from '../_lib/supabase.js'

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

    const updatedJob = await runRestoreJob({
      job,
      provider: body.provider,
    })

    await insertEvent(updatedJob.id, 'ai_restore_processed', {
      provider: updatedJob.ai_provider,
      status: updatedJob.status,
    })

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

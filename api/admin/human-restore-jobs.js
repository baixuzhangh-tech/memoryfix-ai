import { requireAdmin } from '../_lib/admin.js'
import { json } from '../_lib/human-restore.js'
import {
  createJobSignedUrls,
  getJob,
  insertEvent,
  listJobs,
} from '../_lib/supabase.js'

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) {
    return
  }

  if (req.method !== 'GET') {
    json(res, 405, { error: 'Method not allowed.' })
    return
  }

  try {
    const jobId = Array.isArray(req.query.jobId)
      ? req.query.jobId[0]
      : req.query.jobId
    const status = Array.isArray(req.query.status)
      ? req.query.status[0]
      : req.query.status || 'active'

    if (jobId) {
      const job = await getJob(jobId)

      if (!job) {
        json(res, 404, { error: 'Restore job not found.' })
        return
      }

      json(res, 200, {
        job: await createJobSignedUrls(job),
        ok: true,
      })
      return
    }

    const jobs = await listJobs({ status })
    const jobsWithUrls = await Promise.all(jobs.map(createJobSignedUrls))

    await insertEvent(null, 'admin_jobs_viewed', {
      count: jobsWithUrls.length,
      status,
    })

    json(res, 200, {
      jobs: jobsWithUrls,
      ok: true,
    })
  } catch (error) {
    json(res, 500, {
      error:
        error instanceof Error ? error.message : 'Could not load restore jobs.',
    })
  }
}

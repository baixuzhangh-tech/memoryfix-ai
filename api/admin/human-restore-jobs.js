import { requireAdmin } from '../_lib/admin.js'
import { json, readRawBody } from '../_lib/human-restore.js'
import {
  listStageDefinitions,
  readPipelineConfig,
  writePipelineConfig,
} from '../_lib/restore-pipeline-config.js'
import {
  createJobSignedUrls,
  getJob,
  insertEvent,
  listJobs,
} from '../_lib/supabase.js'

export const config = {
  api: {
    bodyParser: false,
  },
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) {
    return
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed.' })
    return
  }

  try {
    if (req.method === 'POST') {
      const rawBody = await readRawBody(req)
      const body = rawBody.length ? JSON.parse(rawBody.toString('utf8')) : {}

      if (body.action === 'save_pipeline_config') {
        json(res, 200, {
          config: await writePipelineConfig(body.config || {}),
          ok: true,
          stageDefinitions: listStageDefinitions(),
        })
        return
      }

      json(res, 400, { error: 'Unknown admin jobs action.' })
      return
    }

    const jobId = Array.isArray(req.query.jobId)
      ? req.query.jobId[0]
      : req.query.jobId
    const resource = Array.isArray(req.query.resource)
      ? req.query.resource[0]
      : req.query.resource
    const status = Array.isArray(req.query.status)
      ? req.query.status[0]
      : req.query.status || 'active'

    if (resource === 'pipelines') {
      json(res, 200, {
        config: await readPipelineConfig(),
        ok: true,
        stageDefinitions: listStageDefinitions(),
      })
      return
    }

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

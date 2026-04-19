/**
 * Consolidated admin jobs endpoint.
 *
 * Vercel's Hobby plan caps deployments at 12 serverless functions,
 * so the former `api/admin/human-restore-job.js` was folded in here.
 * The two endpoints were always same-resource anyway: `jobs` = list
 * and pipeline config, `job` = per-job patch + retoucher mgmt.
 *
 * Supported requests:
 *   GET  ?resource=pipelines         → pipeline config + stage defs
 *   GET  ?jobId=...                  → single job (resumes fal polling)
 *   GET  ?status=active              → list jobs
 *   POST { action: 'save_pipeline_config', config }
 *   POST { action: 'create_retoucher' | 'list_retouchers'
 *        | 'activate_retoucher' | 'deactivate_retoucher'
 *        | 'assign_retoucher' | 'assignable_jobs' }
 *   PATCH { jobId, status?, reviewNote? }  → update a single job
 */

import { requireAdmin } from '../_lib/admin.js'
import { runRestoreJob } from '../_lib/ai-restore.js'
import { json, readRawBody } from '../_lib/human-restore.js'
import { generateRetoucherToken, hashToken } from '../_lib/retoucher-auth.js'
import {
  listStageDefinitions,
  readPipelineConfig,
  writePipelineConfig,
} from '../_lib/restore-pipeline-config.js'
import {
  createJobSignedUrls,
  getJob,
  insertEvent,
  insertRetoucher,
  listAssignableJobs,
  listJobs,
  listRetouchers,
  updateJob,
  updateOrderByJobId,
  updateRetoucher,
} from '../_lib/supabase.js'

export const config = {
  api: {
    bodyParser: false,
  },
}

const allowedPatchStatuses = new Set([
  'uploaded',
  'processing',
  'ai_failed',
  'needs_review',
  'manual_review',
  'assigned',
  'delivered',
  'failed',
])

function shouldResumeFalProcessingJob(job) {
  return Boolean(
    job &&
      job.status === 'processing' &&
      job.ai_provider === 'fal' &&
      job.ai_request_id
  )
}

function mapJobStatusToOrderStatus(status) {
  const supportedStatuses = new Set([
    'uploaded',
    'processing',
    'ai_queued',
    'ai_failed',
    'needs_review',
    'manual_review',
    'delivered',
    'failed',
  ])

  return supportedStatuses.has(status) ? status : 'paid'
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) {
    return
  }

  try {
    if (req.method === 'GET') {
      return await handleGet(req, res)
    }

    if (req.method === 'PATCH') {
      return await handleJobUpdate(req, res)
    }

    if (req.method === 'POST') {
      return await handlePost(req, res)
    }

    json(res, 405, { error: 'Method not allowed.' })
  } catch (error) {
    json(res, 500, {
      error:
        error instanceof Error ? error.message : 'Admin jobs endpoint failed.',
    })
  }
}

async function handleGet(req, res) {
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
    let job = await getJob(jobId)

    if (!job) {
      json(res, 404, { error: 'Restore job not found.' })
      return
    }

    if (shouldResumeFalProcessingJob(job)) {
      job = await runRestoreJob({
        job,
        forceRerun: false,
        triggeredBy: 'admin_job_sync',
      }).catch(() => job)

      await updateOrderByJobId(job.id, {
        status: mapJobStatusToOrderStatus(job.status),
      }).catch(() => null)
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
}

async function handlePost(req, res) {
  const rawBody = await readRawBody(req)
  const body = rawBody.length ? JSON.parse(rawBody.toString('utf8')) : {}
  const action = body.action || ''

  if (action === 'save_pipeline_config') {
    json(res, 200, {
      config: await writePipelineConfig(body.config || {}),
      ok: true,
      stageDefinitions: listStageDefinitions(),
    })
    return
  }

  if (action === 'create_retoucher') {
    return rtCreate(body, res)
  }

  if (action === 'list_retouchers') {
    return rtList(res)
  }

  if (action === 'activate_retoucher') {
    return rtSetActive(body, res, true)
  }

  if (action === 'deactivate_retoucher') {
    return rtSetActive(body, res, false)
  }

  if (action === 'assign_retoucher') {
    return rtAssign(body, res)
  }

  if (action === 'assignable_jobs') {
    return rtAssignableJobs(res)
  }

  json(res, 400, {
    error:
      'action is required: save_pipeline_config | create_retoucher | list_retouchers | activate_retoucher | deactivate_retoucher | assign_retoucher | assignable_jobs',
  })
}

async function handleJobUpdate(req, res) {
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
    if (!allowedPatchStatuses.has(body.status)) {
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
  if (patch.status) {
    await updateOrderByJobId(jobId, { status: patch.status }).catch(() => null)
  }

  json(res, 200, {
    job: await createJobSignedUrls(updatedJob),
    ok: true,
  })
}

async function rtCreate(body, res) {
  const name = String(body.name || '').trim()

  if (!name) {
    return json(res, 400, { error: 'name is required.' })
  }

  const plainToken = generateRetoucherToken()
  const tokenHash = hashToken(plainToken)

  const retoucher = await insertRetoucher({
    name,
    token_hash: tokenHash,
  })

  json(res, 200, {
    ok: true,
    retoucher: {
      id: retoucher.id,
      name: retoucher.name,
      active: retoucher.active,
    },
    token: plainToken,
    warning:
      'Save this token now. It cannot be retrieved later. Share it with the retoucher for portal access.',
  })
}

async function rtList(res) {
  const retouchers = await listRetouchers({ activeOnly: false })
  json(res, 200, { ok: true, retouchers })
}

async function rtSetActive(body, res, active) {
  const retoucherId = body.retoucherId

  if (!retoucherId) {
    return json(res, 400, { error: 'retoucherId is required.' })
  }

  const updated = await updateRetoucher(retoucherId, { active })
  json(res, 200, { ok: true, retoucher: updated })
}

async function rtAssign(body, res) {
  const jobId = body.jobId
  const retoucherId = body.retoucherId
  const retoucherName = body.retoucherName || ''

  if (!jobId || !retoucherId) {
    return json(res, 400, { error: 'jobId and retoucherId are required.' })
  }

  const job = await getJob(jobId)

  if (!job) {
    return json(res, 404, { error: 'Job not found.' })
  }

  if (job.status === 'delivered' || job.status === 'deleted') {
    return json(res, 400, {
      error: `Cannot assign a job with status "${job.status}".`,
    })
  }

  const now = new Date().toISOString()
  const updatedJob = await updateJob(jobId, {
    retoucher_id: retoucherId,
    retoucher_name: retoucherName,
    retoucher_assigned_at: now,
    status: 'assigned',
  })

  await updateOrderByJobId(jobId, { status: 'assigned' }).catch(() => null)

  await insertEvent(jobId, 'retoucher_assigned', {
    retoucher_id: retoucherId,
    retoucher_name: retoucherName,
  })

  json(res, 200, { ok: true, job: await createJobSignedUrls(updatedJob) })
}

async function rtAssignableJobs(res) {
  const jobs = await listAssignableJobs()
  json(res, 200, { ok: true, jobs })
}

import { requireAdmin } from '../_lib/admin.js'
import { json, readRawBody } from '../_lib/human-restore.js'
import { generateRetoucherToken, hashToken } from '../_lib/retoucher-auth.js'
import {
  getJob,
  insertEvent,
  insertRetoucher,
  listAssignableJobs,
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

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) {
    return
  }

  const rawBody = await readRawBody(req)
  const body = rawBody.length ? JSON.parse(rawBody.toString('utf8')) : {}
  const action = body.action || req.query?.action || ''

  try {
    switch (action) {
      case 'create':
        return await handleCreate(body, res)
      case 'list':
        return await handleList(res)
      case 'deactivate':
        return await handleDeactivate(body, res)
      case 'activate':
        return await handleActivate(body, res)
      case 'assign':
        return await handleAssign(body, res)
      case 'assignable_jobs':
        return await handleAssignableJobs(res)
      default:
        json(res, 400, {
          error:
            'action is required: create | list | deactivate | activate | assign | assignable_jobs',
        })
    }
  } catch (error) {
    json(res, 500, {
      error:
        error instanceof Error ? error.message : 'Retoucher management error.',
    })
  }
}

async function handleCreate(body, res) {
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

async function handleList(res) {
  const retouchers = await listRetouchers({ activeOnly: false })
  json(res, 200, { ok: true, retouchers })
}

async function handleDeactivate(body, res) {
  const retoucherId = body.retoucherId

  if (!retoucherId) {
    return json(res, 400, { error: 'retoucherId is required.' })
  }

  const updated = await updateRetoucher(retoucherId, { active: false })
  json(res, 200, { ok: true, retoucher: updated })
}

async function handleActivate(body, res) {
  const retoucherId = body.retoucherId

  if (!retoucherId) {
    return json(res, 400, { error: 'retoucherId is required.' })
  }

  const updated = await updateRetoucher(retoucherId, { active: true })
  json(res, 200, { ok: true, retoucher: updated })
}

async function handleAssign(body, res) {
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

  json(res, 200, { ok: true, job: updatedJob })
}

async function handleAssignableJobs(res) {
  const jobs = await listAssignableJobs()
  json(res, 200, { ok: true, jobs })
}

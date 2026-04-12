import { json } from '../_lib/human-restore.js'
import {
  deleteObject,
  insertEvent,
  listExpiredJobs,
  listExpiredOrders,
  updateOrder,
  updateJob,
} from '../_lib/supabase.js'

function isAuthorized(req) {
  const expectedSecret = process.env.CRON_SECRET

  if (!expectedSecret) {
    return false
  }

  const authorization = req.headers.authorization || ''
  const headerToken = authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice('bearer '.length).trim()
    : ''
  const queryToken = Array.isArray(req.query.secret)
    ? req.query.secret[0]
    : req.query.secret

  return headerToken === expectedSecret || queryToken === expectedSecret
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed.' })
    return
  }

  if (!isAuthorized(req)) {
    json(res, 401, { error: 'Cleanup access denied.' })
    return
  }

  try {
    const jobs = await listExpiredJobs({ limit: 20 })
    const orders = await listExpiredOrders({ limit: 20 })
    const deleted = []
    const deletedOrders = []

    for (const order of orders) {
      await deleteObject({
        bucket: order.original_storage_bucket,
        path: order.original_storage_path,
      })

      await updateOrder(order.id, {
        deleted_at: new Date().toISOString(),
        status: 'deleted',
      })
      deletedOrders.push(order.id)
    }

    for (const job of jobs) {
      await deleteObject({
        bucket: job.original_storage_bucket,
        path: job.original_storage_path,
      })

      if (job.result_storage_bucket && job.result_storage_path) {
        await deleteObject({
          bucket: job.result_storage_bucket,
          path: job.result_storage_path,
        })
      }

      await updateJob(job.id, {
        deleted_at: new Date().toISOString(),
        status: 'deleted',
      })
      await insertEvent(job.id, 'retention_files_deleted', {
        expires_at: job.expires_at,
      })
      deleted.push(job.id)
    }

    json(res, 200, {
      deleted,
      deletedOrders,
      ok: true,
    })
  } catch (error) {
    json(res, 500, {
      error:
        error instanceof Error
          ? error.message
          : 'Human Restore cleanup failed.',
    })
  }
}

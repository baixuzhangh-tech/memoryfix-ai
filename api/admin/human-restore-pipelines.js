import { requireAdmin } from '../_lib/admin.js'
import { json, readRawBody } from '../_lib/human-restore.js'
import {
  listStageDefinitions,
  readPipelineConfig,
  writePipelineConfig,
} from '../_lib/restore-pipeline-config.js'

export const config = {
  api: {
    bodyParser: false,
  },
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) {
    return
  }

  if (req.method === 'GET') {
    try {
      json(res, 200, {
        config: await readPipelineConfig(),
        ok: true,
        stageDefinitions: listStageDefinitions(),
      })
      return
    } catch (error) {
      json(res, 500, {
        error:
          error instanceof Error
            ? error.message
            : 'Could not load restore pipeline config.',
      })
      return
    }
  }

  if (req.method === 'POST') {
    try {
      const rawBody = await readRawBody(req)
      const body = rawBody.length ? JSON.parse(rawBody.toString('utf8')) : {}

      json(res, 200, {
        config: await writePipelineConfig(body.config || {}),
        ok: true,
        stageDefinitions: listStageDefinitions(),
      })
      return
    } catch (error) {
      json(res, 500, {
        error:
          error instanceof Error
            ? error.message
            : 'Could not save restore pipeline config.',
      })
      return
    }
  }

  json(res, 405, { error: 'Method not allowed.' })
}

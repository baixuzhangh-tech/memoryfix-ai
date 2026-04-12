import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import adminDeliverHandler from '../api/admin/human-restore-deliver.js'
import adminJobHandler from '../api/admin/human-restore-job.js'
import adminJobsHandler from '../api/admin/human-restore-jobs.js'
import adminProcessHandler from '../api/admin/human-restore-process.js'
import cleanupHandler from '../api/cron/human-restore-cleanup.js'
import { createOrderUploadToken } from '../api/_lib/human-restore.js'
import checkoutHandler from '../api/human-restore-checkout.js'
import secureAccessHandler from '../api/human-restore-secure-access.js'
import uploadHandler from '../api/human-restore-upload.js'
import {
  appendHumanRestoreCheckoutRef,
  readHumanRestoreCheckoutContext,
  rememberHumanRestorePendingCheckout,
} from '../src/humanRestoreCheckoutContext.js'

const jsonHeaders = { 'Content-Type': 'application/json' }

function makeJsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: jsonHeaders,
  })
}

function createMockState() {
  return {
    emails: [],
    events: [],
    falStatusCalls: 0,
    jobs: [],
    lemonCheckouts: [],
    lemonOrders: [],
    nextEmailId: 1,
    nextJobId: 1,
    storage: new Map(),
  }
}

function storageKey(bucket, path) {
  return `${bucket}/${path}`
}

function decodeStoragePath(pathname, prefix) {
  return pathname
    .slice(prefix.length)
    .split('/')
    .filter(Boolean)
    .map(segment => decodeURIComponent(segment))
}

function getBodyText(options) {
  if (!options?.body) {
    return ''
  }

  if (Buffer.isBuffer(options.body)) {
    return options.body.toString('utf8')
  }

  return String(options.body)
}

function installMockFetch(state) {
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input))
    const method = (options.method || 'GET').toUpperCase()

    if (url.hostname === 'supabase.test') {
      if (url.pathname.startsWith('/rest/v1/human_restore_jobs')) {
        if (method === 'POST') {
          const body = JSON.parse(getBodyText(options))
          const now = new Date().toISOString()
          const job = {
            ...body,
            ai_provider_payload: body.ai_provider_payload || {},
            created_at: now,
            id: `job-${state.nextJobId}`,
            updated_at: now,
          }

          state.nextJobId += 1
          state.jobs.push(job)
          return makeJsonResponse([job])
        }

        if (method === 'GET') {
          let jobs = [...state.jobs]
          const idFilter = url.searchParams.get('id')
          const statusFilter = url.searchParams.get('status')
          const deletedFilter = url.searchParams.get('deleted_at')
          const expiresFilter = url.searchParams.get('expires_at')

          if (idFilter?.startsWith('eq.')) {
            jobs = jobs.filter(job => job.id === idFilter.slice(3))
          }

          if (statusFilter?.startsWith('in.(')) {
            const statuses = statusFilter
              .slice('in.('.length, -1)
              .split(',')
              .filter(Boolean)

            jobs = jobs.filter(job => statuses.includes(job.status))
          }

          if (deletedFilter === 'is.null') {
            jobs = jobs.filter(job => !job.deleted_at)
          }

          if (expiresFilter?.startsWith('lt.')) {
            const threshold = Date.parse(expiresFilter.slice(3))
            jobs = jobs.filter(job => Date.parse(job.expires_at) < threshold)
          }

          return makeJsonResponse(jobs)
        }

        if (method === 'PATCH') {
          const idFilter = url.searchParams.get('id')
          const id = idFilter?.startsWith('eq.') ? idFilter.slice(3) : ''
          const patch = JSON.parse(getBodyText(options))
          const job = state.jobs.find(candidate => candidate.id === id)

          if (!job) {
            return makeJsonResponse({ message: 'not found' }, { status: 404 })
          }

          Object.assign(job, patch)
          return makeJsonResponse([job])
        }
      }

      if (url.pathname.startsWith('/rest/v1/human_restore_events')) {
        if (method === 'POST') {
          const body = JSON.parse(getBodyText(options))
          state.events.push({
            ...body,
            id: `event-${state.events.length + 1}`,
          })
          return makeJsonResponse([])
        }
      }

      if (url.pathname.startsWith('/storage/v1/object/sign/')) {
        const segments = decodeStoragePath(
          url.pathname,
          '/storage/v1/object/sign/'
        )
        const [bucket, ...pathParts] = segments
        const path = pathParts.join('/')

        return makeJsonResponse({
          signedURL: `/storage/v1/object/${bucket}/${encodeStoragePath(
            path
          )}?signed=1`,
        })
      }

      if (url.pathname.startsWith('/storage/v1/object/')) {
        const segments = decodeStoragePath(url.pathname, '/storage/v1/object/')
        const [bucket, ...pathParts] = segments
        const path = pathParts.join('/')

        if (method === 'PUT') {
          const buffer = Buffer.from(
            await new Response(options.body).arrayBuffer()
          )
          state.storage.set(storageKey(bucket, path), {
            buffer,
            contentType:
              options.headers?.['Content-Type'] || 'application/octet-stream',
          })
          return makeJsonResponse({ Key: path })
        }

        if (method === 'GET') {
          const object = state.storage.get(storageKey(bucket, path))

          if (!object) {
            return makeJsonResponse({ message: 'not found' }, { status: 404 })
          }

          return new Response(object.buffer, {
            status: 200,
            headers: { 'Content-Type': object.contentType },
          })
        }

        if (method === 'DELETE') {
          const body = JSON.parse(getBodyText(options))

          for (const prefix of body.prefixes || []) {
            state.storage.delete(storageKey(bucket, prefix))
          }

          return makeJsonResponse([])
        }
      }
    }

    if (url.hostname === 'api.resend.com') {
      const body = JSON.parse(getBodyText(options))
      const email = {
        ...body,
        id: `email-${state.nextEmailId}`,
      }

      state.nextEmailId += 1
      state.emails.push(email)
      return makeJsonResponse({ id: email.id })
    }

    if (url.hostname === 'queue.fal.run') {
      if (method === 'POST') {
        return makeJsonResponse({ request_id: 'fal-request-1' })
      }

      if (url.pathname.endsWith('/status')) {
        state.falStatusCalls += 1
        return makeJsonResponse({ status: 'COMPLETED' })
      }

      if (url.pathname.endsWith('/response')) {
        return makeJsonResponse({
          image: { url: 'https://fal-cdn.test/restored.jpg' },
        })
      }
    }

    if (url.hostname === 'fal-cdn.test') {
      return new Response(Buffer.from('restored-image'), {
        headers: { 'Content-Type': 'image/jpeg' },
        status: 200,
      })
    }

    if (url.hostname === 'api.openai.com') {
      return makeJsonResponse({
        data: [
          {
            b64_json: Buffer.from('openai-restored-image').toString('base64'),
          },
        ],
      })
    }

    if (url.hostname === 'api.lemonsqueezy.com') {
      if (url.pathname === '/v1/variants') {
        return makeJsonResponse({
          data: [
            {
              attributes: {
                product_id: 456,
                slug: '092746e8-e559-4bca-96d0-abe3df4df268',
              },
              id: '123',
              type: 'variants',
            },
          ],
        })
      }

      if (url.pathname === '/v1/products/456') {
        return makeJsonResponse({
          data: {
            attributes: {
              store_id: 789,
            },
            id: '456',
            type: 'products',
          },
        })
      }

      if (url.pathname === '/v1/checkouts' && method === 'POST') {
        const body = JSON.parse(getBodyText(options))

        state.lemonCheckouts.push(body)

        return makeJsonResponse({
          data: {
            attributes: {
              url: 'https://artgen.lemonsqueezy.com/checkout/buy/generated',
            },
            id: 'checkout-1',
            type: 'checkouts',
          },
        })
      }

      if (url.pathname === '/v1/orders') {
        return makeJsonResponse({
          data: state.lemonOrders,
        })
      }
    }

    return makeJsonResponse(
      { error: `Unexpected fetch: ${method} ${url.toString()}` },
      { status: 500 }
    )
  }
}

function encodeStoragePath(path) {
  return String(path || '')
    .split('/')
    .filter(Boolean)
    .map(segment => encodeURIComponent(segment))
    .join('/')
}

function createMultipartBody(fields, file) {
  const boundary = '----memoryfix-test-boundary'
  const chunks = []

  for (const [name, value] of Object.entries(fields)) {
    chunks.push(`--${boundary}\r\n`)
    chunks.push(`Content-Disposition: form-data; name="${name}"\r\n\r\n`)
    chunks.push(`${value}\r\n`)
  }

  chunks.push(`--${boundary}\r\n`)
  chunks.push(
    `Content-Disposition: form-data; name="${file.fieldName}"; filename="${file.filename}"\r\n`
  )
  chunks.push(`Content-Type: ${file.contentType}\r\n\r\n`)
  chunks.push(file.data)
  chunks.push('\r\n')
  chunks.push(`--${boundary}--\r\n`)

  return {
    body: Buffer.concat(
      chunks.map(chunk => (Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
    ),
    contentType: `multipart/form-data; boundary=${boundary}`,
  }
}

function createReq({ body, headers = {}, method = 'GET', query = {} } = {}) {
  const req = Readable.from(body ? [body] : [])

  req.method = method
  req.headers = headers
  req.query = query

  return req
}

function createRes() {
  const res = {
    body: '',
    headers: {},
    statusCode: 200,
    end(value = '') {
      this.body = value
      return this
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value
      return this
    },
    status(statusCode) {
      this.statusCode = statusCode
      return this
    },
  }

  return res
}

async function invoke(handler, reqOptions = {}) {
  const req = createReq(reqOptions)
  const res = createRes()

  await handler(req, res)

  const body = res.body ? JSON.parse(res.body) : null

  return {
    body,
    statusCode: res.statusCode,
  }
}

function installEnv() {
  Object.assign(process.env, {
    AI_RESTORE_PROVIDER: 'fal',
    CRON_SECRET: 'cron-secret',
    FAL_KEY: 'fal-key',
    FAL_RESTORE_MAX_POLLS: '1',
    FAL_RESTORE_MODEL: 'fal-ai/image-editing/photo-restoration',
    FAL_RESTORE_POLL_INTERVAL_MS: '1',
    HUMAN_RESTORE_ADMIN_TOKEN: 'admin-secret',
    HUMAN_RESTORE_AUTO_PROCESS_AFTER_UPLOAD: 'true',
    HUMAN_RESTORE_DOWNLOAD_URL_EXPIRES_SECONDS: '604800',
    HUMAN_RESTORE_FROM_EMAIL: 'MemoryFix AI <test@example.com>',
    HUMAN_RESTORE_INBOX: 'intake@example.com',
    HUMAN_RESTORE_SUPPORT_EMAIL: 'support@example.com',
    HUMAN_RESTORE_UPLOAD_TOKEN_SECRET: 'upload-secret',
    LEMON_SQUEEZY_API_KEY: 'lemon-key',
    LEMON_SQUEEZY_CHECKOUT_URL:
      'https://artgen.lemonsqueezy.com/checkout/buy/092746e8-e559-4bca-96d0-abe3df4df268',
    OPENAI_API_KEY: 'openai-key',
    OPENAI_IMAGE_EDIT_MODEL: 'gpt-image-1.5',
    RESEND_API_KEY: 'resend-key',
    SITE_URL: 'https://artgen.site',
    SUPABASE_HUMAN_RESTORE_ORIGINALS_BUCKET: 'human-restore-originals',
    SUPABASE_HUMAN_RESTORE_RESULTS_BUCKET: 'human-restore-results',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    SUPABASE_URL: 'https://supabase.test',
  })
}

async function main() {
  installEnv()
  delete process.env.LEMON_SQUEEZY_HUMAN_RESTORE_VARIANT_ID
  delete process.env.LEMON_SQUEEZY_STORE_ID

  const state = createMockState()
  installMockFetch(state)

  const memoryStorage = new Map()
  const mockStorage = {
    getItem(key) {
      return memoryStorage.get(key) || null
    },
    removeItem(key) {
      memoryStorage.delete(key)
    },
    setItem(key, value) {
      memoryStorage.set(key, String(value))
    },
  }
  const checkoutRef = 'checkout-ref-123'
  const startedAtMs = Date.now()

  rememberHumanRestorePendingCheckout({
    checkoutRef,
    localStorageRef: mockStorage,
    sessionStorageRef: mockStorage,
    timestamp: startedAtMs,
  })

  const recoveredContext = readHumanRestoreCheckoutContext({
    localStorageRef: mockStorage,
    now: startedAtMs + 1000,
    sessionStorageRef: mockStorage,
  })

  assert.equal(recoveredContext.hasPendingCheckout, true)
  assert.equal(recoveredContext.pendingCheckoutRef, checkoutRef)
  assert.equal(
    appendHumanRestoreCheckoutRef(
      'https://artgen.lemonsqueezy.com/checkout/buy/092746e8-e559-4bca-96d0-abe3df4df268',
      checkoutRef
    ),
    'https://artgen.lemonsqueezy.com/checkout/buy/092746e8-e559-4bca-96d0-abe3df4df268?checkout%5Bcustom%5D%5Bflow%5D=human_restore_inline_upload&checkout%5Bcustom%5D%5Bcheckout_ref%5D=checkout-ref-123'
  )

  const checkoutResponse = await invoke(checkoutHandler, {
    method: 'POST',
  })

  assert.equal(checkoutResponse.statusCode, 200)
  assert.equal(checkoutResponse.body.ok, true)
  assert.equal(state.lemonCheckouts.length, 1)
  assert.equal(state.lemonCheckouts[0].data.relationships.store.data.id, '789')
  assert.equal(
    state.lemonCheckouts[0].data.relationships.variant.data.id,
    '123'
  )

  const serverCheckoutRef =
    state.lemonCheckouts[0].data.attributes.checkout_data.custom.checkout_ref
  const orderCreatedAt = new Date(startedAtMs + 5000).toISOString()

  state.lemonOrders.push({
    attributes: {
      created_at: orderCreatedAt,
      first_order_item: {
        product_name: 'Human-assisted Restore',
        variant_id: 123,
      },
      identifier: 'order-identifier-123',
      meta: {
        custom_data: {
          checkout_ref: serverCheckoutRef,
        },
      },
      order_number: 1001,
      status: 'paid',
      test_mode: true,
      urls: {
        receipt: 'https://receipt.test/order-123',
      },
      user_email: 'buyer@example.com',
      user_name: 'Buyer',
    },
    id: 'order-123',
    type: 'orders',
  })

  const secureAccessResponse = await invoke(secureAccessHandler, {
    method: 'GET',
    query: {
      checkoutRef: serverCheckoutRef,
      checkoutStartedAt: new Date(startedAtMs).toISOString(),
    },
  })

  assert.equal(secureAccessResponse.statusCode, 200)
  assert.equal(secureAccessResponse.body.ok, true)
  assert.match(secureAccessResponse.body.uploadUrl, /\/human-restore\/upload/)

  const token = createOrderUploadToken({
    tokenSecret: process.env.HUMAN_RESTORE_UPLOAD_TOKEN_SECRET,
    order: {
      checkoutEmail: 'buyer@example.com',
      createdAt: new Date().toISOString(),
      customerName: 'Buyer',
      orderId: 'order-123',
      orderNumber: '1001',
      productName: 'Human-assisted Restore',
      receiptUrl: 'https://receipt.test/order-123',
      testMode: true,
    },
  })
  const multipart = createMultipartBody(
    {
      notes: 'Please remove scratches while keeping faces natural.',
      token,
    },
    {
      contentType: 'image/jpeg',
      data: Buffer.from('original-image'),
      fieldName: 'photo',
      filename: 'grandma.jpg',
    }
  )
  const uploadResponse = await invoke(uploadHandler, {
    body: multipart.body,
    headers: { 'content-type': multipart.contentType },
    method: 'POST',
  })

  assert.equal(uploadResponse.statusCode, 200)
  assert.equal(uploadResponse.body.ok, true)
  assert.equal(uploadResponse.body.orderBound, true)
  assert.equal(state.jobs.length, 1)
  assert.equal(state.jobs[0].status, 'needs_review')
  assert.ok(state.jobs[0].result_storage_path)
  assert.equal(state.emails.length, 2)

  const job = state.jobs[0]
  const listResponse = await invoke(adminJobsHandler, {
    headers: { 'x-admin-token': process.env.HUMAN_RESTORE_ADMIN_TOKEN },
    method: 'GET',
    query: { status: 'active' },
  })

  assert.equal(listResponse.statusCode, 200)
  assert.equal(listResponse.body.jobs.length, 1)
  assert.ok(listResponse.body.jobs[0].original_signed_url)
  assert.ok(listResponse.body.jobs[0].result_signed_url)

  const retryOpenAIResponse = await invoke(adminProcessHandler, {
    body: Buffer.from(JSON.stringify({ jobId: job.id, provider: 'openai' })),
    headers: { 'x-admin-token': process.env.HUMAN_RESTORE_ADMIN_TOKEN },
    method: 'POST',
  })

  assert.equal(retryOpenAIResponse.statusCode, 200)
  assert.equal(retryOpenAIResponse.body.job.status, 'needs_review')
  assert.equal(retryOpenAIResponse.body.job.ai_provider, 'openai')

  const manualReviewResponse = await invoke(adminJobHandler, {
    body: Buffer.from(
      JSON.stringify({
        jobId: job.id,
        reviewNote: 'Looks good after OpenAI retry.',
        status: 'manual_review',
      })
    ),
    headers: { 'x-admin-token': process.env.HUMAN_RESTORE_ADMIN_TOKEN },
    method: 'PATCH',
  })

  assert.equal(manualReviewResponse.statusCode, 200)
  assert.equal(manualReviewResponse.body.job.status, 'manual_review')

  const deliveryResponse = await invoke(adminDeliverHandler, {
    body: Buffer.from(
      JSON.stringify({
        jobId: job.id,
        reviewNote: 'Reviewed and approved.',
      })
    ),
    headers: { 'x-admin-token': process.env.HUMAN_RESTORE_ADMIN_TOKEN },
    method: 'POST',
  })

  assert.equal(deliveryResponse.statusCode, 200)
  assert.equal(deliveryResponse.body.ok, true)
  assert.equal(state.jobs[0].status, 'delivered')
  assert.equal(state.emails.length, 3)

  state.jobs[0].expires_at = new Date(Date.now() - 1000).toISOString()
  const cleanupResponse = await invoke(cleanupHandler, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    method: 'GET',
  })

  assert.equal(cleanupResponse.statusCode, 200)
  assert.deepEqual(cleanupResponse.body.deleted, [job.id])
  assert.equal(state.jobs[0].status, 'deleted')
  assert.equal(state.storage.size, 0)

  console.log('Human Restore workflow smoke test passed.')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})

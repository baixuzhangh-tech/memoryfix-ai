import fs from 'node:fs'
import path from 'node:path'

const envFiles = ['.env.local', '.env']

const requiredVariables = [
  'SITE_URL',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'RESEND_API_KEY',
  'VITE_PADDLE_CLIENT_TOKEN',
  'VITE_PADDLE_ENVIRONMENT',
  'VITE_PADDLE_HUMAN_RESTORE_PRICE_ID',
  'VITE_PADDLE_LOCAL_PACK_PRICE_ID',
  'PADDLE_API_KEY',
  'PADDLE_WEBHOOK_SECRET',
  'PADDLE_HUMAN_RESTORE_PRICE_ID',
  'PADDLE_LOCAL_PACK_PRICE_ID',
  'PADDLE_ENVIRONMENT',
  'HUMAN_RESTORE_INBOX',
  'HUMAN_RESTORE_FROM_EMAIL',
  'HUMAN_RESTORE_SUPPORT_EMAIL',
  'HUMAN_RESTORE_UPLOAD_TOKEN_SECRET',
  'HUMAN_RESTORE_ADMIN_TOKEN',
  'CRON_SECRET',
]

const placeholderPatterns = [
  /your_/i,
  /^your_/i,
  /^replace_/i,
  /example\.com$/i,
  /your-project/i,
]

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {}
  }

  const content = fs.readFileSync(filePath, 'utf8')

  return content.split(/\r?\n/).reduce((accumulator, line) => {
    const trimmedLine = line.trim()

    if (!trimmedLine || trimmedLine.startsWith('#')) {
      return accumulator
    }

    const separatorIndex = trimmedLine.indexOf('=')

    if (separatorIndex === -1) {
      return accumulator
    }

    const key = trimmedLine.slice(0, separatorIndex).trim()
    let value = trimmedLine.slice(separatorIndex + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    accumulator[key] = value

    return accumulator
  }, {})
}

function isPlaceholder(value) {
  return placeholderPatterns.some(pattern => pattern.test(value))
}

const env = {
  ...process.env,
}

for (const envFile of envFiles) {
  Object.assign(env, parseEnvFile(path.join(process.cwd(), envFile)))
}

const missing = []
const placeholders = []

for (const key of requiredVariables) {
  if (!env[key]) {
    missing.push(key)
    continue
  }

  if (isPlaceholder(env[key])) {
    placeholders.push(key)
  }
}

const provider = env.AI_RESTORE_PROVIDER || ''
const hasFal = Boolean(env.FAL_KEY)
const hasOpenAI = Boolean(env.OPENAI_API_KEY)
const hasReplicate = Boolean(env.REPLICATE_API_TOKEN)
const aiProblems = []
const paddleProblems = []

if (
  env.VITE_PADDLE_CLIENT_TOKEN &&
  !/^test_|^live_/.test(env.VITE_PADDLE_CLIENT_TOKEN)
) {
  paddleProblems.push(
    'VITE_PADDLE_CLIENT_TOKEN should be a Paddle client-side token starting with test_ or live_.'
  )
}

if (
  env.VITE_PADDLE_ENVIRONMENT &&
  !['sandbox', 'production'].includes(env.VITE_PADDLE_ENVIRONMENT)
) {
  paddleProblems.push(
    'VITE_PADDLE_ENVIRONMENT should be sandbox or production.'
  )
}

if (
  env.PADDLE_ENVIRONMENT &&
  !['sandbox', 'production'].includes(env.PADDLE_ENVIRONMENT)
) {
  paddleProblems.push('PADDLE_ENVIRONMENT should be sandbox or production.')
}

for (const key of [
  'VITE_PADDLE_HUMAN_RESTORE_PRICE_ID',
  'VITE_PADDLE_LOCAL_PACK_PRICE_ID',
  'PADDLE_HUMAN_RESTORE_PRICE_ID',
  'PADDLE_LOCAL_PACK_PRICE_ID',
]) {
  if (env[key] && !String(env[key]).startsWith('pri_')) {
    paddleProblems.push(`${key} should be a Paddle price ID starting with pri_.`)
  }
}

if (
  env.VITE_PADDLE_ENVIRONMENT &&
  env.PADDLE_ENVIRONMENT &&
  env.VITE_PADDLE_ENVIRONMENT !== env.PADDLE_ENVIRONMENT
) {
  paddleProblems.push(
    'VITE_PADDLE_ENVIRONMENT and PADDLE_ENVIRONMENT should match.'
  )
}

if (provider === 'fal' && !hasFal && !hasOpenAI && !hasReplicate) {
  aiProblems.push(
    'AI_RESTORE_PROVIDER=fal but neither FAL_KEY nor OPENAI_API_KEY nor REPLICATE_API_TOKEN is set.'
  )
} else if (provider === 'openai' && !hasOpenAI && !hasFal && !hasReplicate) {
  aiProblems.push(
    'AI_RESTORE_PROVIDER=openai but neither OPENAI_API_KEY nor FAL_KEY nor REPLICATE_API_TOKEN is set.'
  )
} else if (provider === 'replicate' && !hasReplicate && !hasFal && !hasOpenAI) {
  aiProblems.push(
    'AI_RESTORE_PROVIDER=replicate but neither REPLICATE_API_TOKEN nor FAL_KEY nor OPENAI_API_KEY is set.'
  )
} else if (!provider && !hasFal && !hasOpenAI && !hasReplicate) {
  aiProblems.push('Set FAL_KEY, OPENAI_API_KEY, or REPLICATE_API_TOKEN for cloud restoration.')
}

if (missing.length || placeholders.length || aiProblems.length || paddleProblems.length) {
  console.error('Human Restore environment is not ready.')

  if (missing.length) {
    console.error(`Missing: ${missing.join(', ')}`)
  }

  if (placeholders.length) {
    console.error(`Placeholder values: ${placeholders.join(', ')}`)
  }

  for (const problem of aiProblems) {
    console.error(problem)
  }

  for (const problem of paddleProblems) {
    console.error(problem)
  }

  process.exitCode = 1
} else {
  console.log('Human Restore environment variables look ready.')
}

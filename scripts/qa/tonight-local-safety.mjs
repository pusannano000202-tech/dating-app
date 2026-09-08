const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]'])

const REQUIRED_FALSE_FLAGS = [
  'NEXT_PUBLIC_DEV_AUTH_BYPASS',
  'NEXT_PUBLIC_BOOTING_DEMO_MODE',
  'DEV_AUTH_BYPASS',
  'BOOTING_DEMO_MODE',
  'TONIGHT_AUTOMATION_ENABLED',
  'TONIGHT_CARD_PAYMENTS_ENABLED',
]

const REMOTE_SECRET_KEYS = [
  'NEXT_PUBLIC_TOSS_CLIENT_KEY',
  'TOSS_SECRET_KEY',
  'AI_SERVER_URL',
  'AI_SERVER_SECRET',
  'WEB_PUSH_VAPID_PUBLIC_KEY',
  'WEB_PUSH_VAPID_PRIVATE_KEY',
  'WEB_PUSH_VAPID_SUBJECT',
  'CAMPUS_SEVEN_PUSH_CRON_SECRET',
]

export function assertLocalSupabaseUrl(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('local_supabase_url_invalid')
  }

  if (
    url.protocol !== 'http:'
    || !LOOPBACK_HOSTNAMES.has(url.hostname)
    || !url.port
    || url.username
    || url.password
    || url.pathname !== '/'
    || url.search
    || url.hash
  ) {
    throw new Error('local_supabase_url_invalid')
  }

  return url
}

export function assertSafeLocalRuntimeEnvironment(env) {
  if (env.NODE_ENV === 'production') {
    throw new Error('local_runner_production_refused')
  }

  const url = assertLocalSupabaseUrl(env.NEXT_PUBLIC_SUPABASE_URL)
  for (const key of REQUIRED_FALSE_FLAGS) {
    if (env[key] !== undefined && env[key] !== 'false') {
      throw new Error('unsafe_local_runtime_flag')
    }
  }
  for (const key of REMOTE_SECRET_KEYS) {
    if (env[key] !== undefined && env[key] !== '') {
      throw new Error('unsafe_local_runtime_secret')
    }
  }
  if (env.TONIGHT_APPLICATIONS_OPEN !== undefined && env.TONIGHT_APPLICATIONS_OPEN !== 'true') {
    throw new Error('unsafe_local_runtime_flag')
  }

  return url
}

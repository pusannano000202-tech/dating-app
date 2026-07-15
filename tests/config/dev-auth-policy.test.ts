import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as devAuth from '../../lib/dev-auth'
import { GET as getDebugEnv } from '../../app/api/debug-env/route'

const ROOT = process.cwd()

function readSource(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8')
}

type DevAuthPolicyInput = {
  nodeEnv?: string
  devAuthBypass?: string
  bootingDemoMode?: string
}

type DevAuthCookiePolicyInput = DevAuthPolicyInput & {
  pathname: string
}

const isDevAuthBypassEnabled = devAuth.isDevAuthBypassEnabled as unknown as (
  input?: DevAuthPolicyInput
) => boolean

const ORIGINAL_ENV = {
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_DEV_AUTH_BYPASS: process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS,
  NEXT_PUBLIC_BOOTING_DEMO_MODE: process.env.NEXT_PUBLIC_BOOTING_DEMO_MODE,
}

function withProcessEnv(
  env: {
    NODE_ENV?: string
    NEXT_PUBLIC_DEV_AUTH_BYPASS?: string
    NEXT_PUBLIC_BOOTING_DEMO_MODE?: string
  },
  run: () => void
): void {
  setEnvValue('NODE_ENV', env.NODE_ENV)
  setEnvValue('NEXT_PUBLIC_DEV_AUTH_BYPASS', env.NEXT_PUBLIC_DEV_AUTH_BYPASS)
  setEnvValue('NEXT_PUBLIC_BOOTING_DEMO_MODE', env.NEXT_PUBLIC_BOOTING_DEMO_MODE)
  try {
    run()
  } finally {
    setEnvValue('NODE_ENV', ORIGINAL_ENV.NODE_ENV)
    setEnvValue('NEXT_PUBLIC_DEV_AUTH_BYPASS', ORIGINAL_ENV.NEXT_PUBLIC_DEV_AUTH_BYPASS)
    setEnvValue('NEXT_PUBLIC_BOOTING_DEMO_MODE', ORIGINAL_ENV.NEXT_PUBLIC_BOOTING_DEMO_MODE)
  }
}

function setEnvValue(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

function getShouldIssueDevAuthCookie(): (input: DevAuthCookiePolicyInput) => boolean {
  const fn = (devAuth as {
    shouldIssueDevAuthCookie?: (input: DevAuthCookiePolicyInput) => boolean
  }).shouldIssueDevAuthCookie
  assert.equal(typeof fn, 'function')
  return fn as (input: DevAuthCookiePolicyInput) => boolean
}

test('production disables dev auth regardless of public preview flags', () => {
  assert.equal(
    isDevAuthBypassEnabled({ nodeEnv: 'production', devAuthBypass: 'true' }),
    false
  )
  assert.equal(
    isDevAuthBypassEnabled({ nodeEnv: 'production', bootingDemoMode: 'on' }),
    false
  )
})

test('development dev auth requires the explicit bypass flag', () => {
  assert.equal(
    isDevAuthBypassEnabled({ nodeEnv: 'development', devAuthBypass: 'false' }),
    false
  )
  assert.equal(
    isDevAuthBypassEnabled({ nodeEnv: 'development', devAuthBypass: 'true' }),
    true
  )
})

test('dev auth cookie is issued only for the exact dev preview path', () => {
  const shouldIssueDevAuthCookie = getShouldIssueDevAuthCookie()

  assert.equal(
    shouldIssueDevAuthCookie({
      nodeEnv: 'development',
      devAuthBypass: 'true',
      pathname: '/match',
    }),
    false
  )
  assert.equal(
    shouldIssueDevAuthCookie({
      nodeEnv: 'development',
      devAuthBypass: 'true',
      pathname: '/dev/preview',
    }),
    true
  )
  assert.equal(
    shouldIssueDevAuthCookie({
      nodeEnv: 'development',
      devAuthBypass: 'true',
      pathname: '/dev/preview/extra',
    }),
    false
  )
  assert.equal(
    shouldIssueDevAuthCookie({
      nodeEnv: 'production',
      devAuthBypass: 'true',
      pathname: '/dev/preview',
    }),
    false
  )
})

test('dev auth cookie helper uses the current environment when middleware passes only a path', () => {
  const shouldIssueDevAuthCookie = getShouldIssueDevAuthCookie()

  withProcessEnv(
    {
      NODE_ENV: 'development',
      NEXT_PUBLIC_DEV_AUTH_BYPASS: 'true',
      NEXT_PUBLIC_BOOTING_DEMO_MODE: 'on',
    },
    () => {
      assert.equal(shouldIssueDevAuthCookie({ pathname: '/dev/preview' }), true)
      assert.equal(shouldIssueDevAuthCookie({ pathname: '/match' }), false)
    }
  )

  withProcessEnv(
    {
      NODE_ENV: 'production',
      NEXT_PUBLIC_DEV_AUTH_BYPASS: 'true',
      NEXT_PUBLIC_BOOTING_DEMO_MODE: 'on',
    },
    () => {
      assert.equal(shouldIssueDevAuthCookie({ pathname: '/dev/preview' }), false)
    }
  )
})

test('debug env route hides production details and returns booleans only in development', async () => {
  const originalNodeEnv = process.env.NODE_ENV
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const originalSupabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const secretSentinel = 'must-not-appear-in-debug-response'

  try {
    setEnvValue('NODE_ENV', 'production')
    setEnvValue('NEXT_PUBLIC_SUPABASE_URL', secretSentinel)
    setEnvValue('NEXT_PUBLIC_SUPABASE_ANON_KEY', secretSentinel)

    const productionResponse = await getDebugEnv()
    assert.equal(productionResponse.status, 404)
    assert.equal(await productionResponse.text(), '')

    setEnvValue('NODE_ENV', 'development')
    const developmentResponse = await getDebugEnv()
    const developmentText = await developmentResponse.text()
    const developmentPayload = JSON.parse(developmentText) as Record<string, unknown>

    assert.equal(developmentResponse.status, 200)
    assert.equal(developmentText.includes(secretSentinel), false)
    assert.ok(Object.values(developmentPayload).every((value) => typeof value === 'boolean'))
  } finally {
    setEnvValue('NODE_ENV', originalNodeEnv)
    setEnvValue('NEXT_PUBLIC_SUPABASE_URL', originalSupabaseUrl)
    setEnvValue('NEXT_PUBLIC_SUPABASE_ANON_KEY', originalSupabaseKey)
  }
})

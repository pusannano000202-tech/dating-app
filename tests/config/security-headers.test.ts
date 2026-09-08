import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const config = fs.readFileSync(path.join(process.cwd(), 'next.config.mjs'), 'utf8')

function readSecurityConfigForEnvironment(nodeEnv: 'development' | 'production', supabaseUrl = '') {
  const script = `
    process.env.NODE_ENV = ${JSON.stringify(nodeEnv)};
    const nextConfig = (await import('./next.config.mjs')).default;
    const headerGroups = await nextConfig.headers();
    const csp = headerGroups[0].headers.find((header) => header.key === 'Content-Security-Policy');
    process.stdout.write(JSON.stringify({ csp: csp?.value ?? '', remotePatterns: nextConfig.images.remotePatterns }));
  `
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: supabaseUrl },
  })

  assert.equal(result.status, 0, result.stderr)
  assert.notEqual(result.stdout, '')
  return JSON.parse(result.stdout) as {
    csp: string
    remotePatterns: Array<{ protocol: string; hostname: string; port?: string; pathname: string }>
  }
}

function readCspForEnvironment(nodeEnv: 'development' | 'production', supabaseUrl = '') {
  const result = readSecurityConfigForEnvironment(nodeEnv, supabaseUrl)
  assert.notEqual(result.csp, '')
  return result.csp
}

test('Next responses set baseline browser security headers without breaking OAuth popups', () => {
  assert.match(config, /async headers\(\)/)
  assert.match(config, /X-Content-Type-Options[\s\S]*nosniff/)
  assert.match(config, /Referrer-Policy[\s\S]*strict-origin-when-cross-origin/)
  assert.match(config, /X-Frame-Options[\s\S]*DENY/)
  assert.match(config, /Cross-Origin-Opener-Policy[\s\S]*same-origin-allow-popups/)
  assert.match(config, /Permissions-Policy/)
  assert.match(config, /Content-Security-Policy/)
  assert.match(config, /frame-ancestors 'none'/)
  assert.match(config, /default-src 'self'/)
  assert.match(config, /script-src[\s\S]*oapi\.map\.naver\.com[\s\S]*js\.tosspayments\.com/)
  assert.match(config, /connect-src[\s\S]*\*\.supabase\.co[\s\S]*\*\.tosspayments\.com/)
  assert.match(config, /Strict-Transport-Security/)
  assert.match(config, /process\.env\.NODE_ENV === 'production'/)
})

test('Naver Maps HTTP assets are allowed only for localhost development', () => {
  const developmentCsp = readCspForEnvironment('development')
  assert.match(developmentCsp, /script-src[^;]*http:\/\/oapi\.map\.naver\.com/)
  assert.match(developmentCsp, /script-src[^;]*http:\/\/nrbe\.map\.naver\.net/)
  assert.match(developmentCsp, /img-src[^;]*http:\/\/static\.naver\.net/)
  assert.match(developmentCsp, /img-src[^;]*http:\/\/nrbe\.map\.naver\.net/)

  const productionCsp = readCspForEnvironment('production')
  assert.doesNotMatch(productionCsp, /http:\/\//)
  assert.match(productionCsp, /script-src[^;]*https:\/\/nrbe\.pstatic\.net/)
})

test('Naver address geocoding can reach only the exact HTTPS Maps API gateway', () => {
  const developmentCsp = readCspForEnvironment('development')
  const productionCsp = readCspForEnvironment('production')

  for (const csp of [developmentCsp, productionCsp]) {
    assert.match(csp, /connect-src[^;]*https:\/\/maps\.apigw\.ntruss\.com/)
    assert.doesNotMatch(csp, /connect-src[^;]*https:\/\/\*\.ntruss\.com/)
  }
})

test('local Supabase auth, realtime, and images use only the configured loopback origin in development', () => {
  const csp = readCspForEnvironment('development', 'http://127.0.0.1:56321')
  assert.match(csp, /connect-src[^;]*http:\/\/127\.0\.0\.1:56321(?:\s|;)/)
  assert.match(csp, /connect-src[^;]*ws:\/\/127\.0\.0\.1:56321(?:\s|;)/)
  assert.match(csp, /img-src[^;]*http:\/\/127\.0\.0\.1:56321(?:\s|;)/)
  assert.doesNotMatch(csp, /(?:http|ws):\/\/\*/)
  assert.doesNotMatch(csp, /localhost|54321/)
})

test('local Supabase exceptions never reach production or accept an arbitrary host', () => {
  const productionCsp = readCspForEnvironment('production', 'http://127.0.0.1:56321')
  assert.doesNotMatch(productionCsp, /127\.0\.0\.1|56321|(?:http|ws):\/\//)
  for (const url of [
    'http://192.168.1.2:56321',
    'http://localhost.evil.invalid:56321',
    'http://user:password@127.0.0.1:56321',
    'http://127.0.0.1:56321/path',
    'http://127.0.0.1:56321?allow=*',
  ]) {
    const csp = readCspForEnvironment('development', url)
    assert.doesNotMatch(csp, /56321|192\.168|evil\.invalid|password/)
  }
})

test('local signed-image optimization is exact-origin and never enabled in production', () => {
  const localUrl = 'http://127.0.0.1:56321'
  const development = readSecurityConfigForEnvironment('development', localUrl)
  assert.deepEqual(development.remotePatterns.filter((pattern) => pattern.protocol === 'http'), [{
    protocol: 'http',
    hostname: '127.0.0.1',
    port: '56321',
    pathname: '/storage/v1/object/sign/**',
  }])
  for (const result of [
    readSecurityConfigForEnvironment('production', localUrl),
    readSecurityConfigForEnvironment('development', 'http://192.168.1.2:56321'),
    readSecurityConfigForEnvironment('development', 'http://localhost.evil.invalid:56321'),
  ]) {
    assert.deepEqual(result.remotePatterns, [{
      protocol: 'https',
      hostname: '*.supabase.co',
      pathname: '/storage/v1/object/sign/**',
    }])
  }
})

#!/usr/bin/env node

const DEFAULT_BASE_URL = 'http://localhost:3004'
const DEV_AUTH_COOKIE = 'booting_dev_auth=1'

const routes = [
  { path: '/dev/preview', name: '로컬 미리보기' },
  { path: '/', name: '홈' },
  { path: '/match', name: '매칭 현황' },
  { path: '/notifications', name: '알림' },
  { path: '/profile/basic', name: '기본정보' },
  { path: '/profile/worldcup', name: '이상형 월드컵' },
  { path: '/profile/preferences', name: '매칭 비중' },
  { path: '/profile/schedule', name: '가능 시간' },
  { path: '/profile/match-card', name: '사전 카드' },
  { path: '/group/create', name: '그룹 만들기' },
  { path: '/group/invite/dev-preview', name: '초대 링크' },
  { path: '/match/start', name: '매칭 준비' },
  { path: '/match/dev-match-pending', name: '가매칭 상세' },
  { path: '/match/dev-match-1', name: '확정 매칭 상세' },
]

function parseArgs(argv) {
  const args = {
    baseUrl: process.env.LOCAL_ROUTE_BASE_URL || DEFAULT_BASE_URL,
    noDevAuth: false,
  }

  for (const arg of argv) {
    if (arg.startsWith('--base=')) {
      args.baseUrl = arg.slice('--base='.length)
    } else if (arg === '--no-dev-auth') {
      args.noDevAuth = true
    }
  }

  return args
}

function toUrl(baseUrl, path) {
  return new URL(path, baseUrl).toString()
}

async function checkRoute(baseUrl, route, headers) {
  const url = toUrl(baseUrl, route.path)
  const response = await fetch(url, {
    redirect: 'manual',
    headers,
  })
  const location = response.headers.get('location')
  const redirectedToLogin = location?.includes('/login') ?? false

  return {
    ...route,
    status: response.status,
    location,
    ok: response.status >= 200 && response.status < 400 && !redirectedToLogin,
  }
}

const args = parseArgs(process.argv.slice(2))
const headers = args.noDevAuth ? {} : { cookie: DEV_AUTH_COOKIE }

console.log(`로컬 route 확인: ${args.baseUrl}`)
if (!args.noDevAuth) {
  console.log(`dev auth cookie 사용: ${DEV_AUTH_COOKIE}`)
}

const results = []

for (const route of routes) {
  try {
    results.push(await checkRoute(args.baseUrl, route, headers))
  } catch (error) {
    results.push({
      ...route,
      status: 'ERROR',
      location: '',
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

let failed = 0
for (const result of results) {
  const label = result.ok ? 'OK' : 'FAIL'
  const suffix = result.location ? ` -> ${result.location}` : result.error ? ` (${result.error})` : ''
  console.log(`${label.padEnd(5)} ${String(result.status).padEnd(5)} ${result.path.padEnd(28)} ${result.name}${suffix}`)
  if (!result.ok) failed += 1
}

if (failed > 0) {
  console.error(`\n실패 route: ${failed}개`)
  process.exit(1)
}

console.log('\n모든 route가 dev auth 기준으로 접근 가능합니다.')

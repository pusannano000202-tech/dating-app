import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const read = (file) => existsSync(file) ? readFileSync(file, 'utf8') : ''

test('service recovery is a public React page with honest state and safe choices', () => {
  const page = read('app/auth/service-unavailable/page.tsx')

  assert.notEqual(page, '')
  assert.match(page, /요청한 화면은 열리지 않았어요/)
  assert.match(page, /인증을 사용할 수 없어 보호된 화면으로의 이동을 멈췄어요/)
  assert.doesNotMatch(page, /데이터를 열거나 바꾸지 않았어요/)
  assert.match(page, /getSafeServiceRecoveryDestination/)
  assert.match(page, /원래 화면 다시 열기/)
  assert.match(page, /href="\/community"/)
  assert.match(page, /href="\/login"/)
  assert.doesNotMatch(page, /bg-violet|glass|😵/)
})

test('offline UI recovery explains unavailable account actions and does not offer a retry loop', () => {
  const page = read('app/auth/service-unavailable/page.tsx')

  assert.match(page, /process\.env\.NODE_ENV === 'development'[\s\S]*process\.env\.QUANTUM_LOCAL_RUNTIME_MODE === 'offline-ui'/)
  assert.match(page, /로그인·홈·저장 기능은 사용할 수 없어요/)
  assert.match(page, /returnTo && !isOfflineUi &&/)
  assert.match(page, /!isOfflineUi && <Link[\s\S]*href="\/login"/)
  assert.match(page, /href="\/community"/)
})

test('minimum signup hides the legacy profile bar and remaining steps are labeled matching prep', () => {
  const progress = read('components/profile/StepProgress.tsx')

  assert.match(progress, /pathname\.startsWith\('\/profile\/basic'\).*return null/)
  assert.match(progress, /매칭 준비/)
  assert.doesNotMatch(progress, /최소 가입.*매칭 준비/)
})

test('basic profile final action describes saving rather than an automatic redirect', () => {
  const basic = read('components/profile/BasicInfoForm.tsx')

  assert.match(basic, /가입 정보 저장하기/)
  assert.doesNotMatch(basic, /가입 완료하고 커뮤니티 보기/)
})

test('profile error makes saved and unsaved state honest with retry and community escape', () => {
  const profileError = read('app/profile/error.tsx')

  assert.match(profileError, /AlertTriangle/)
  assert.match(profileError, /저장이 끝난 항목/)
  assert.match(profileError, /저장하지 않은 내용/)
  assert.match(profileError, /onClick=\{reset\}/)
  assert.match(profileError, /href="\/community"/)
  assert.doesNotMatch(profileError, /자동 저장됐을 수 있어|bg-violet|glass|😵/)
})

test('login maps public errors without echoing provider or environment details', () => {
  const login = read('app/(auth)/login/page.tsx')

  assert.match(login, /getPublicLoginErrorMessage/)
  assert.doesNotMatch(login, /useState<string \| null>\(authError\)/)
  assert.doesNotMatch(login, /로그인 설정이 아직 연결되지 않았습니다\. \$\{supabaseConfigIssue\}/)
  assert.doesNotMatch(login, /setError\(e instanceof Error \? e\.message/)
})

test('calendar is presented as part of the matching tab', () => {
  const nav = read('lib/navigation/app-tabs.ts')

  assert.match(nav, /href === '\/match'[\s\S]*pathname === '\/calendar'/)
})

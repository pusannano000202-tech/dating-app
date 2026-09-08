import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const ROOT = process.cwd()
const source = (path: string) => readFileSync(join(ROOT, path), 'utf8')

test('public login keeps role assignment out and preserves a partner invite return path', () => {
  const login = source('app/(auth)/login/page.tsx')
  const redirect = source('lib/auth/redirect.ts')
  const continuation = source('app/auth/continue/route.ts')
  assert.doesNotMatch(login, /name=["']role|id=["']role|운영자로 가입|업장으로 가입/)
  assert.match(login, /requestedRedirect/)
  assert.match(continuation, /getRoleDestination/)
  assert.match(redirect, /partner:\s*['"]\/partner\/tonight['"]/)
})

test('partner invitation API hashes the token and never returns its secret after creation', () => {
  const helper = source('lib/server/tonight/account-onboarding.ts')
  const createRoute = source('app/api/admin/super-admin/tonight/partner-invites/route.ts')
  const claimRoute = source('app/api/partner/onboarding/[token]/route.ts')
  assert.match(helper, /randomBytes\(32\)/)
  assert.match(helper, /createHash\(['"]sha256['"]\)/)
  assert.match(createRoute, /allowedRoles:\s*\['super_admin'\]/)
  assert.match(createRoute, /requireRecentAuth:\s*true/)
  assert.match(createRoute, /token_recoverable:\s*false/)
  assert.match(claimRoute, /allowedRoles:\s*\['user'\]/)
  assert.match(claimRoute, /claim_tonight_partner_invite/)
  assert.doesNotMatch(claimRoute, /createPaymentServiceClient|service_role/i)
})

test('partner onboarding is explicit and returns through login to the exact invite URL', () => {
  const page = source('app/onboarding/partner/[token]/page.tsx')
  const experience = source('components/tonight/PartnerInviteExperience.tsx')
  assert.match(page, /robots:\s*\{\s*index:\s*false/)
  assert.match(page, /referrer:\s*['"]no-referrer['"]/)
  assert.match(experience, /\/login\?redirect=/)
  assert.match(experience, /초대 수락/)
  assert.match(experience, /내 업장 이름/)
  assert.match(experience, /\/partner\/tonight/)
})

test('super admin account search uses invitations and review queues without raw UUID entry', () => {
  const control = source('components/tonight/SuperAdminAccessOnboarding.tsx')
  assert.match(control, /계정 검색/)
  assert.match(control, /업장 초대 링크 만들기/)
  assert.match(control, /부산대 인증 요청/)
  assert.match(control, /현재 상태/)
  assert.match(control, /다음 행동/)
  assert.doesNotMatch(control, /placeholder=["'][^"']*UUID/i)
  assert.doesNotMatch(control, /phone_hint|전화번호/)
})

test('the local rehearsal can exercise account search and partner invitation without live API writes', () => {
  const control = source('components/tonight/SuperAdminAccessOnboarding.tsx')
  const consoleSource = source('components/tonight/SuperAdminTonightConsole.tsx')

  assert.match(control, /mode:\s*TonightUiMode/)
  assert.match(control, /mode\s*===\s*['"]rehearsal['"]/)
  assert.match(control, /체험 검색 결과/)
  assert.match(control, /체험 업장 초대 링크/)
  assert.match(consoleSource, /<SuperAdminAccessOnboarding\s+mode=\{mode\}/)
})

test('account-role directory neither searches nor returns phone data', () => {
  const route = source('app/api/admin/super-admin/tonight/directory/route.ts')
  const adapter = source('components/tonight/live-adapters.ts')
  const types = source('components/tonight/types.ts')
  const fixture = source('components/tonight/rehearsal-fixtures.ts')
  assert.doesNotMatch(route, /phone\.ilike|phone_hint|select\(['"][^'"]*phone/)
  assert.doesNotMatch(adapter, /phone:\s*nullableString\(row\.phone_hint\)/)
  assert.doesNotMatch(types, /AccessDirectoryResult[\s\S]*?phone:\s*string \| null/)
  assert.doesNotMatch(fixture, /\[account\.name, account\.email, account\.phone\]/)
})

test('partner approval names the fixed invited account and the account that claimed it', () => {
  const control = source('components/tonight/SuperAdminAccessOnboarding.tsx')
  assert.match(control, /invited_user_name/)
  assert.match(control, /claimed_user_name/)
  assert.match(control, /초대 대상/)
  assert.match(control, /수락 계정/)
})

test('partner capacity starts with venue confirmation before capacity and 5 or 6 selection', () => {
  const partner = source('components/tonight/PartnerTonightConsole.tsx')
  assert.match(partner, /내 업장 이름/)
  assert.match(partner, /오늘 받을 팀 수/)
  assert.match(partner, /한 팀에 최대 몇 명/)
  assert.match(partner, /5명/)
  assert.match(partner, /6명/)
})

test('initial super admin bootstrap instructions use SQL Editor and contain no credential', () => {
  const guide = source('docs/operations/tonight-initial-super-admin-bootstrap.md')
  assert.match(guide, /SQL Editor/)
  assert.match(guide, /bootstrap_initial_super_admin/)
  assert.match(guide, /두 번째.*거부|이미.*거부/)
  assert.doesNotMatch(guide, /service_role\s*=|SUPABASE_SERVICE_ROLE_KEY\s*=/)
})

test('PNU review request preserves only the actionable profile error', () => {
  const route = source('app/api/tonight/market-membership-request/route.ts')
  assert.match(route, /pnu_profile_required/)
  assert.match(route, /privateJson\(\{ error: 'pnu_profile_required' \}, 400\)/)
  assert.doesNotMatch(route, /error\.message[^\n]*privateJson/)
})

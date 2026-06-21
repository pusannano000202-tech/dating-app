import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

function readSource(path: string) {
  return readFileSync(join(ROOT, path), 'utf8')
}

test('root layout uses Booting production metadata and light theme color', () => {
  const layout = readSource('app/layout.tsx')

  assert.match(layout, /themeColor:\s*'#fff7f3'/)
  assert.match(layout, /bg-app min-h-screen text-boot-ink/)
  assert.doesNotMatch(layout, /Destiny/)
})

test('home page keeps real app login flow while presenting Booting UI', () => {
  const home = readSource('app/page.tsx')

  assert.match(home, /BootingLogo/)
  assert.match(home, /href="\/login"/)
  assert.match(home, /LandingFlowRow/)
  assert.match(home, /프로필은 가리고, 흐름은 간단하게/)
  assert.doesNotMatch(home, /MatchingPool/)
  assert.doesNotMatch(home, /get_match_pool_stats/)
  assert.doesNotMatch(home, /font-destiny/)
  assert.doesNotMatch(home, /DestinyLogo/)
})

test('profile personality flows use Booting surfaces instead of Destiny dark styling', () => {
  const profileLayout = readSource('app/profile/layout.tsx')
  const surveyPage = readSource('app/profile/survey/page.tsx')
  const preferencePage = readSource('app/profile/personality-preference/page.tsx')
  const big5Survey = readSource('components/profile/Big5Survey.tsx')
  const big5Result = readSource('components/profile/Big5Result.tsx')
  const preferenceSurvey = readSource('components/profile/PersonalityPreferenceSurvey.tsx')
  const preferenceResult = readSource('components/profile/PersonalityPreferenceResult.tsx')

  assert.match(profileLayout, /booting-band/)
  assert.match(surveyPage, /booting-band/)
  assert.match(preferencePage, /booting-band/)

  for (const source of [big5Survey, big5Result, preferenceSurvey, preferenceResult]) {
    assert.match(source, /boot-/)
    assert.doesNotMatch(source, /shadow-violet-900/)
    assert.doesNotMatch(source, /border-white\/10/)
  }
})

test('match result surfaces keep real APIs while using Booting chat-style cards', () => {
  const matchList = readSource('app/match/page.tsx')
  const matchDetail = readSource('app/match/[id]/page.tsx')

  assert.match(matchList, /fetch\('\/api\/matches'\)/)
  assert.match(matchList, /text-boot-ink/)
  assert.doesNotMatch(matchList, /text-gray-300/)

  assert.match(matchDetail, /\/api\/matches\/\$\{encodeURIComponent\(matchId\)\}\/daily-cards/)
  assert.match(matchDetail, /rounded-br-\[4px\]/)
  assert.doesNotMatch(matchDetail, /bg-black\/10/)
})

test('auth and completion entry points use Booting branding', () => {
  const login = readSource('app/(auth)/login/page.tsx')
  const complete = readSource('app/profile/complete/page.tsx')
  const edit = readSource('app/profile/edit/page.tsx')

  for (const source of [login, complete, edit]) {
    assert.match(source, /BootingLogo/)
    assert.doesNotMatch(source, /DestinyLogo/)
    assert.doesNotMatch(source, /font-destiny/)
    assert.doesNotMatch(source, /shadow-violet-900/)
  }
})

test('login page uses Supabase email OTP while phone provider is disabled', () => {
  const login = readSource('app/(auth)/login/page.tsx')

  assert.match(login, /signInWithOtp\(\{\s*email/)
  assert.match(login, /verifyOtp\(\{\s*email/)
  assert.match(login, /token/)
  assert.match(login, /type:\s*'email'/)
  assert.match(login, /isEmailOtpRateLimitError/)
  assert.match(login, /email rate limit exceeded/)
  assert.match(login, /moveToCodeStep\(normalizedEmail\)/)
  assert.match(login, /signInWithOAuth\(\{/)
  assert.match(login, /provider:\s*'google'/)
  assert.match(login, /\/auth\/callback\?next=/)
  assert.match(login, /searchParams\.get\('redirect'\)\s*\?\?\s*searchParams\.get\('next'\)/)
  assert.doesNotMatch(login, /너무 자주/)
  assert.match(login, /type="email"/)
  assert.doesNotMatch(login, /type="tel"/)
  assert.doesNotMatch(login, /phone:/)
})

test('onboarding and match setup are separate product flows', () => {
  const home = readSource('app/page.tsx')
  const worldcup = readSource('app/profile/worldcup/page.tsx')
  const survey = readSource('app/profile/survey/page.tsx')
  const photos = readSource('app/profile/photos/page.tsx')
  const personalityPreference = readSource('app/profile/personality-preference/page.tsx')
  const schedulePage = readSource('app/profile/schedule/page.tsx')
  const preferencesPage = readSource('app/profile/preferences/page.tsx')
  const stepProgress = readSource('components/profile/StepProgress.tsx')
  const matchStart = readSource('app/match/start/page.tsx')

  assert.match(home, /href="\/friends"/)
  assert.match(home, /href="\/match\/start"/)
  assert.match(worldcup, /router\.push\('\/profile\/survey'\)/)
  assert.match(survey, /router\.push\('\/profile\/photos'\)/)
  assert.match(photos, /router\.push\('\/profile\/complete'\)/)
  assert.match(stepProgress, /기본정보/)
  assert.match(stepProgress, /이상형/)
  assert.match(stepProgress, /성향/)
  assert.match(stepProgress, /사진/)
  assert.doesNotMatch(stepProgress, /매칭 비중/)
  assert.match(matchStart, /function getCurrentSetupState/)
  assert.match(matchStart, /const current = getCurrentSetupState\(steps\)/)
  assert.match(matchStart, /aria-current=\{index === current\.currentIndex/)
  assert.doesNotMatch(matchStart, /steps\.map\(\(\{ href, label, desc, done, Icon \}\)/)
  assert.match(matchStart, /buildDevMatchSetupProfile/)
  assert.match(personalityPreference, /markDevMatchSetupStepComplete\('personality'\)/)
  assert.match(schedulePage, /markDevMatchSetupStepComplete\('schedule'\)/)
  assert.match(preferencesPage, /markDevMatchSetupStepComplete\('preferences'\)/)
})

test('matching readiness gates include nickname and pre-match card checks', () => {
  const basicInfoForm = readSource('components/profile/BasicInfoForm.tsx')
  const basicInfoPage = readSource('app/profile/basic/page.tsx')
  const enterRoute = readSource('app/api/match-pool/enter/route.ts')
  const groupCreate = readSource('app/group/create/page.tsx')
  const checkNicknameRoute = readSource('app/api/profiles/check-nickname/route.ts')
  const claimNicknameRoute = readSource('app/api/profiles/claim-nickname/route.ts')
  const draftRoute = readSource('app/api/profile/match-card-draft/route.ts')
  const nicknameMigration = readSource('supabase/migrations/20260622_profile_display_name_claims.sql')
  const draftMigration = readSource('supabase/migrations/20260622_matching_pre_match_card_drafts.sql')

  assert.match(basicInfoForm, /\/api\/profiles\/check-nickname\?nickname=/)
  assert.match(basicInfoForm, /await checkNicknameAvailability\(trimmedName\)/)
  assert.match(basicInfoForm, /다른 닉네임을 입력해 주세요/)
  assert.match(basicInfoPage, /\/api\/profiles\/claim-nickname/)
  assert.match(checkNicknameRoute, /is_profile_display_name_available/)
  assert.match(claimNicknameRoute, /claim_profile_display_name/)
  assert.match(nicknameMigration, /CREATE TABLE IF NOT EXISTS public\.profile_display_name_claims/)
  assert.match(nicknameMigration, /CREATE TRIGGER trg_profiles_guard_display_name_claim/)
  assert.match(nicknameMigration, /public\.profile_display_name_claims\.normalized_name <> v_normalized/)
  assert.match(nicknameMigration, /ON CONFLICT ON CONSTRAINT profile_display_name_claims_pkey/)
  assert.doesNotMatch(nicknameMigration, /AND normalized_name <> v_normalized/)
  assert.doesNotMatch(nicknameMigration, /ON CONFLICT \(normalized_name\)/)

  assert.match(draftRoute, /pre_match_card_drafts/)
  assert.match(draftRoute, /countCompletedDailyCardItems/)
  assert.match(draftMigration, /CREATE TABLE IF NOT EXISTS public\.pre_match_card_drafts/)
  assert.match(draftMigration, /get_group_pre_match_card_readiness/)
  assert.match(enterRoute, /get_group_pre_match_card_readiness/)
  assert.match(enterRoute, /pre_match_card_required/)
  assert.match(enterRoute, /member_pre_match_card_incomplete/)
  assert.match(groupCreate, /pre_match_card_required/)
})

test('group invite creation no longer creates phone-based invites', () => {
  const groupInviteRoute = readSource('app/api/group-invites/route.ts')
  const invitePanel = readSource('components/matching/group-create/InviteFriendPanel.tsx')
  const invitePage = readSource('app/group/invite/[token]/page.tsx')
  const acceptRoute = readSource('app/api/group-invites/accept/route.ts')

  assert.match(groupInviteRoute, /phone_invites_disabled/)
  assert.match(groupInviteRoute, /const inviteKind: 'user' \| 'link'/)
  assert.match(groupInviteRoute, /invited_phone:\s*null/)
  assert.doesNotMatch(groupInviteRoute, /inviteKind: 'user' \| 'phone' \| 'link'/)
  assert.match(invitePanel, /로그인\/회원가입 후 초대를 수락해야 그룹에 들어옵니다/)
  assert.match(invitePage, /booting-band/)
  assert.match(invitePage, /초대 링크만으로 바로 그룹에 들어가지 않아요/)
  assert.match(invitePage, /\/login\?next=/)
  assert.match(acceptRoute, /supabase\.auth\.getUser\(\)/)
  assert.match(acceptRoute, /Unauthorized/)
  assert.match(acceptRoute, /accept_group_invite_by_token/)
})

test('profile onboarding pages allow dev preview without Supabase user redirects', () => {
  const basic = readSource('app/profile/basic/page.tsx')
  const worldcup = readSource('app/profile/worldcup/page.tsx')
  const survey = readSource('app/profile/survey/page.tsx')

  for (const source of [basic, worldcup, survey]) {
    assert.match(source, /isDevPreviewClientSession/)
  }
})

test('middleware issues dev auth cookie when opening dev preview', () => {
  const middleware = readSource('middleware.ts')
  const devMatchSetup = readSource('lib/dev-match-setup.ts')

  assert.match(middleware, /pathname\.startsWith\('\/dev\/preview'\)/)
  assert.match(middleware, /response\.cookies\.set\(DEV_AUTH_COOKIE/)
  assert.match(devMatchSetup, /function hasDevAuthCookie/)
  assert.match(devMatchSetup, /document\.cookie/)
  assert.match(devMatchSetup, /hasDevAuthLocalStorage\(\) \|\| hasDevAuthCookie\(\)/)
})

test('health check validates Supabase Auth with the public key', () => {
  const healthRoute = readSource('app/api/health/route.ts')

  assert.match(healthRoute, /\/auth\/v1\/health/)
  assert.match(healthRoute, /getSupabasePublicKey\(\)/)
  assert.doesNotMatch(healthRoute, /\/rest\/v1\//)
})

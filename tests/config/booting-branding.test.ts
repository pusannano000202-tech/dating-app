import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

function readSource(path: string) {
  return readFileSync(join(ROOT, path), 'utf8')
}

test('root layout uses Quantum production metadata and Campus Signal theme color', () => {
  const layout = readSource('app/layout.tsx')

  assert.match(layout, /title:\s*'Quantum/)
  assert.match(layout, /themeColor:\s*'#F4F6F5'/)
  assert.match(layout, /bg-app min-h-screen text-boot-ink/)
  assert.doesNotMatch(layout, /Destiny/)
})

test('root layout isolates the search-param theme provider behind Suspense', () => {
  const layout = readSource('app/layout.tsx')

  assert.match(layout, /import\s+\{\s*Suspense\s*\}\s+from\s+'react'/)
  assert.match(
    layout,
    /<Suspense\s+fallback=\{null\}>[\s\S]*<SchoolThemeProvider\s*\/>[\s\S]*<\/Suspense>/,
  )
})

test('home page renders the Quantum next-action dashboard behind demo auth', () => {
  const home = readSource('app/page.tsx')

  assert.match(home, /BootingLogo/)
  assert.match(home, /HomeDashboard/)
  assert.match(home, /HomeTodayTaskCard/)
  assert.match(home, /QuantumHomeRecommendations/)
  assert.doesNotMatch(home, /href="\/match\/start"/)
  assert.doesNotMatch(home, /href="\/login"/)
  assert.doesNotMatch(home, /LandingFlowRow/)
  assert.doesNotMatch(home, /MatchingPool/)
  assert.doesNotMatch(home, /get_match_pool_stats/)
  assert.doesNotMatch(home, /font-destiny/)
  assert.doesNotMatch(home, /DestinyLogo/)
})

test('school mascot assets stay available while action screens avoid oversized decoration', () => {
  const mascot = readSource('components/theme/SchoolMascot.tsx')
  const home = readSource('app/page.tsx')
  const basic = readSource('app/profile/basic/page.tsx')
  const match = readSource('app/match/page.tsx')
  const groupCreate = readSource('app/group/create/page.tsx')
  const community = readSource('app/community/page.tsx')
  const meetups = readSource('app/meetups/page.tsx')
  const refund = readSource('app/match/[id]/refund/page.tsx')
  const report = readSource('app/dev/mascot-screen-report/page.tsx')

  assert.match(mascot, /app-assets-v3-normalized-v2/)
  assert.match(mascot, /overflow-hidden/)
  assert.doesNotMatch(mascot, /scale-\[1\.06\]/)

  assert.doesNotMatch(home, /SchoolMascot/)
  assert.doesNotMatch(basic, /SchoolMascot/)
  assert.match(match, /hasStartedMatching \? 'waiting'/)
  assert.match(match, /h-16 w-16/)
  assert.match(groupCreate, /pose="guide"/)
  assert.match(groupCreate, /h-16 w-16/)
  assert.doesNotMatch(community, /h-\[114px\] w-\[114px\]/)
  assert.doesNotMatch(meetups, /h-\[114px\] w-\[114px\]/)
  assert.match(refund, /pose="refund"/)
  assert.match(refund, /h-\[118px\] w-\[118px\]/)
  assert.doesNotMatch(groupCreate, /pose="refund"/)
  assert.doesNotMatch(community, /pose="refund"/)
  assert.doesNotMatch(meetups, /pose="refund"/)
  assert.match(report, /suffix: 'community_guide'/)
  assert.match(report, /slot: 114/)
})

test('home page does not show result-like opponent card before matching starts', () => {
  const home = readSource('app/page.tsx')
  const today = readSource('components/matching/HomeTodayTaskCard.tsx')

  assert.match(home, /필요한 순간 전까지 이름과 사진은 상대에게 공개되지 않아요/)
  assert.match(home, /HomeTodayTaskCard/)
  assert.match(today, /quantum-campus-group\.webp/)
  assert.doesNotMatch(today, /DarkTeamProgressCard/)
  assert.doesNotMatch(home, /HomeLockedOpponentNotice/)
  assert.doesNotMatch(home, /상대팀 카드는 아직 잠겨 있어요/)
  assert.doesNotMatch(home, /매칭이 잡히기 전에는 케미 점수나 상대팀 정보가 보이지 않아요/)
  assert.doesNotMatch(home, /title="추천 상대팀"/)
  assert.doesNotMatch(home, /chemi=\{92\}/)
  assert.doesNotMatch(home, /상대 프로필은 매칭 확정 후에 공개돼요/)
})

test('profile personality flows use Booting surfaces instead of Destiny dark styling', () => {
  const profileLayout = readSource('app/profile/layout.tsx')
  const surveyPage = readSource('app/profile/survey/page.tsx')
  const preferencePage = readSource('app/profile/personality-preference/page.tsx')
  const big5Survey = readSource('components/profile/Big5Survey.tsx')
  const big5Result = readSource('components/profile/Big5Result.tsx')
  const preferenceSurvey = readSource('components/profile/PersonalityPreferenceSurvey.tsx')
  const preferenceResult = readSource('components/profile/PersonalityPreferenceResult.tsx')

  assert.match(profileLayout, /booting-paper/)
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

test('matching entry surfaces expose 2:2, 3:3, and mixed-group queue visuals', () => {
  const matchList = readSource('app/match/page.tsx')
  const matchStart = readSource('app/match/start/page.tsx')
  const groupCreate = readSource('app/group/create/page.tsx')
  const matchingPool = readSource('components/MatchingPool.tsx')
  const queueRadar = readSource('components/matching/QueueRadarCard.tsx')
  const statsMigration = readSource('supabase/migrations/20260622183100_match_pool_mixed_group_stats.sql')
  const exactSizeMigration = readSource('supabase/migrations/20260622183000_match_pool_exact_group_size.sql')

  assert.match(matchList, /어떤 방식으로 만날까요/)
  assert.match(matchList, /과팅하기/)
  assert.match(matchList, /소개팅하기/)
  assert.match(matchingPool, /2:2 매칭찾기/)
  assert.match(matchingPool, /3:3 매칭찾기/)
  assert.match(matchStart, /href="\/group\/create\?size=2"/)
  assert.match(matchStart, /href="\/group\/create\?size=3"/)
  assert.match(groupCreate, /매칭 규모 선택/)
  assert.match(matchingPool, /혼성팀/)
  assert.match(queueRadar, /mixedDots/)
  assert.match(queueRadar, /mixedGradient/)
  assert.match(statsMigration, /THEN 'mixed'/)
  assert.match(exactSizeMigration, /v_active_count <> v_group\.size/)
})

test('pending match detail uses page steps instead of one long scroll', () => {
  const matchDetail = readSource('app/match/[id]/page.tsx')

  assert.match(matchDetail, /PENDING_MATCH_STEPS/)
  assert.match(matchDetail, /pendingStepIndex/)
  assert.match(matchDetail, /renderPendingStep/)
  assert.match(matchDetail, /onClick=\{cancelMatch\}/)
  assert.match(matchDetail, /매칭 취소/)
  assert.match(matchDetail, /가매칭/)
  assert.match(matchDetail, /사전 카드/)
  assert.match(matchDetail, /보증금/)
  assert.match(matchDetail, /확정/)
  assert.match(matchDetail, /이전 단계/)
  assert.match(matchDetail, /다음 단계/)
})

test('auth and completion entry points use Booting branding', () => {
  const login = readSource('app/(auth)/login/page.tsx')
  const logo = readSource('components/BootingLogo.tsx')
  const complete = readSource('app/profile/complete/page.tsx')
  const edit = readSource('app/profile/edit/page.tsx')

  for (const source of [login, complete, edit]) {
    assert.match(source, /BootingLogo/)
    assert.doesNotMatch(source, /DestinyLogo/)
    assert.doesNotMatch(source, /font-destiny/)
    assert.doesNotMatch(source, /shadow-violet-900/)
  }

  assert.match(logo, /subtitle\?: string/)
  assert.match(login, /subtitle="대학생 과팅"/)
  assert.match(login, /UNIVERSITY GROUP MATCHING/)
  assert.doesNotMatch(login, /PNU GROUP MATCHING/)
  assert.match(login, /bg-white\/82/)
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
  assert.match(login, /getPostLoginDestination\(\{/)
  assert.match(login, /requestedRedirect/)
  assert.doesNotMatch(login, /학교 인증/)
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

  assert.match(home, /QuantumHomeRecommendations/)
  assert.match(home, /HomeTodayTaskCard/)
  assert.doesNotMatch(home, /href="\/match\/start"/)
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
  const nicknameMigration = readSource('supabase/migrations/20260622000001_profile_display_name_claims.sql')
  const draftMigration = readSource('supabase/migrations/20260622000000_matching_pre_match_card_drafts.sql')

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
  const personalityPreference = readSource('app/profile/personality-preference/page.tsx')
  const schedule = readSource('app/profile/schedule/page.tsx')
  const preferences = readSource('app/profile/preferences/page.tsx')

  for (const source of [basic, worldcup, survey, personalityPreference, schedule, preferences]) {
    assert.match(source, /isDevPreviewClientSession/)
  }

  for (const source of [personalityPreference, schedule, preferences]) {
    assert.match(source, /isSupabaseConfigured/)
    assert.match(source, /isDevPreviewClientSession\(\) \|\| !isSupabaseConfigured\(\)/)
  }
})

test('dev school preview keeps the server and first client render hydration-safe', () => {
  const switcher = readSource('components/dev/DevSchoolPreviewSwitcher.tsx')

  assert.match(switcher, /useState<DevSchoolPreview>\(DEV_SCHOOL_PREVIEWS\[0\]\)/)
  assert.match(switcher, /useEffect\(\(\) => \{[\s\S]*setSelected\(readStoredDevSchoolPreview\(\)\)[\s\S]*\}, \[\]\)/)
  assert.doesNotMatch(switcher, /useState<DevSchoolPreview>\(getInitialSchool\)/)
  assert.match(switcher, /aria-label="학교 검색"/)
  assert.match(switcher, /aria-pressed=\{isSelected\}/)
})

test('middleware issues dev auth cookie when opening dev preview', () => {
  const middleware = readSource('middleware.ts')
  const devMatchSetup = readSource('lib/dev-match-setup.ts')

  assert.match(middleware, /shouldIssueDevAuthCookie\(\{ pathname \}\)/)
  assert.match(middleware, /pathname === '\/dev\/preview'/)
  assert.doesNotMatch(middleware, /isLocalDevRequest/)
  assert.doesNotMatch(middleware, /shouldAutoIssueLocalDevAuth/)
  assert.match(middleware, /response\.cookies\.set\(DEV_AUTH_COOKIE/)
  assert.match(devMatchSetup, /function hasDevAuthCookie/)
  assert.match(devMatchSetup, /document\.cookie/)
  assert.doesNotMatch(devMatchSetup, /function isLocalBrowserPreview/)
  assert.doesNotMatch(devMatchSetup, /host === 'localhost' \|\| host === '127\.0\.0\.1' \|\| host === '::1'/)
  assert.doesNotMatch(devMatchSetup, /if \(isLocalBrowserPreview\(\)\) return true/)
  assert.match(devMatchSetup, /if \(!isDevAuthBypassEnabled\(\)\) return false/)
  assert.match(devMatchSetup, /return hasDevAuthLocalStorage\(\) \|\| hasDevAuthCookie\(\)/)
})

test('dev preview entry is gated by explicit development auth policy', () => {
  const middleware = readSource('middleware.ts')
  const devAuth = readSource('lib/dev-auth.ts')
  const login = readSource('app/(auth)/login/page.tsx')

  assert.match(devAuth, /nodeEnv === 'development'/)
  assert.match(devAuth, /devAuthBypass === 'true'/)
  assert.doesNotMatch(devAuth, /NEXT_PUBLIC_BOOTING_DEMO_MODE !== 'off'/)
  assert.match(login, /showDevPreviewEntry/)
  assert.match(login, /\{showDevPreviewEntry && \(/)
  assert.match(login, /href="\/dev\/preview"/)
  assert.match(login, /로컬로 둘러보기/)
  assert.match(middleware, /new URL\('\/login', request\.url\)/)
  assert.doesNotMatch(middleware, /pathname\.startsWith\('\/dev\/preview'\)/)
})

test('health check validates Supabase Auth with the public key', () => {
  const healthRoute = readSource('app/api/health/route.ts')

  assert.match(healthRoute, /\/auth\/v1\/health/)
  assert.match(healthRoute, /getSupabasePublicKey\(\)/)
  assert.doesNotMatch(healthRoute, /\/rest\/v1\//)
  assert.match(healthRoute, /\[health\] Supabase health check failed/)
  assert.match(healthRoute, /status: res\.status/)
  assert.doesNotMatch(healthRoute, /console\.error\([^)]*getSupabasePublicKey/)
})

test('match-pool stats records safe RPC diagnostics before falling back', () => {
  const statsRoute = readSource('app/api/match-pool/stats/route.ts')

  assert.match(statsRoute, /\[match-pool\/stats\] Supabase RPC failed/)
  assert.match(statsRoute, /code: error\.code/)
  assert.match(statsRoute, /message: error\.message/)
  assert.match(statsRoute, /x-stats-fallback/)
  assert.doesNotMatch(statsRoute, /console\.error\([^)]*SUPABASE/)
})

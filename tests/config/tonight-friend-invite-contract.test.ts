import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const ROOT = process.cwd()
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

const MIGRATION = 'supabase/migrations/20260903102000_tonight_friend_invites.sql'

test('Tonight friend invites keep only a SHA-256 token hash and expose no table access', () => {
  const sql = read(MIGRATION)

  assert.match(sql, /CREATE TABLE public\.tonight_friend_invites/i)
  assert.match(sql, /token_hash\s+TEXT\s+NOT NULL\s+UNIQUE/i)
  assert.match(sql, /token_hash ~ '\^\[0-9a-f\]\{64\}\$'/i)
  assert.doesNotMatch(sql, /\braw_token\b|\btoken\s+TEXT\b/i)
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/i)
  assert.match(sql, /REVOKE ALL ON TABLE public\.tonight_friend_invites[\s\S]*?PUBLIC, anon, authenticated, service_role/i)
  assert.match(sql, /GRANT SELECT ON TABLE public\.tonight_friend_invites\s+TO service_role/i)
})

test('create, inspect, accept, decline, and cancel RPCs are explicit authenticated boundaries', () => {
  const sql = read(MIGRATION)

  for (const fn of [
    'create_tonight_friend_invite',
    'get_tonight_friend_invite',
    'get_my_tonight_friend_invites',
    'accept_tonight_friend_invite',
    'decline_tonight_friend_invite',
    'cancel_tonight_friend_invite',
  ]) {
    assert.match(sql, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(`, 'i'))
    assert.match(sql, new RegExp(`${fn}[\\s\\S]*?SECURITY DEFINER[\\s\\S]*?SET search_path = ''`, 'i'))
    assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([\\s\\S]*?PUBLIC, anon, authenticated, service_role`, 'i'))
  }

  assert.match(sql, /auth\.uid\(\)/i)
  assert.match(sql, /tonight_market_membership_required/i)
  assert.match(sql, /access_role[^;]*<> 'user'|access_role[^;]*= 'user'/i)
})

test('invite creation and acceptance enforce expiry, two seats, a three-person bundle, and atomic claim', () => {
  const sql = read(MIGRATION)

  assert.match(sql, /expires_at[^;]*signup_close_at/i)
  assert.match(sql, /pending[^;]*< 2|COUNT\(\*\)[\s\S]*?>= 2/i)
  assert.match(sql, /member_count[^;]*pending[^;]*> 3|v_member_count \+ v_pending_count >= 3/i)
  assert.match(sql, /FOR UPDATE/i)
  assert.match(sql, /status = 'pending'/i)
  assert.match(sql, /CURRENT_TIMESTAMP >= [a-z_.]*expires_at/i)
  assert.match(sql, /friend_invite_(?:self|blocked|duplicate|expired)/i)
  assert.match(sql, /UPDATE public\.tonight_friend_invites[\s\S]*?claimed_by_user_id\s*=\s*v_caller/i)
  assert.match(sql, /INSERT INTO public\.tonight_application_choices/i)
  assert.match(sql, /matching_consent_version/i)
  assert.match(sql, /INSERT INTO quantum_private\.tonight_applicant_features/i)
  assert.doesNotMatch(sql, /INSERT INTO public\.(?:friendships|connections|chats)|INSERT INTO public\.messages/i)
})

test('invite joins preserve the authoritative application gate and existing payment read access', () => {
  const sql = read(MIGRATION)

  assert.match(sql, /FROM public\.app_config[\s\S]*?tonight_applications_open/i)
  assert.match(sql, /tonight_market_memberships[\s\S]*?FOR SHARE/i)
  assert.match(sql, /tonight-application-user:/i)
  assert.match(sql, /submit_tonight_solo_application[\s\S]*?assert_tonight_invite_user_role/i)
  assert.doesNotMatch(sql, /REVOKE ALL ON FUNCTION public\.get_current_tonight_round\(\)/i)
})

test('HTTP routes use user-role guards, strict inputs, hashed token RPC arguments, and no-store responses', () => {
  const rootRoute = read('app/api/tonight/friend-invites/route.ts')
  const previewRoute = read('app/api/tonight/friend-invites/[token]/route.ts')
  const acceptRoute = read('app/api/tonight/friend-invites/[token]/accept/route.ts')
  const declineRoute = read('app/api/tonight/friend-invites/[token]/decline/route.ts')
  const cancelRoute = read('app/api/tonight/friend-invites/by-id/[inviteId]/cancel/route.ts')
  const combined = [rootRoute, previewRoute, acceptRoute, declineRoute, cancelRoute].join('\n')

  assert.match(combined, /requireRequestAccess\([\s\S]*?allowedRoles:\s*\['user'\]/)
  assert.match(combined, /readStrictJson/)
  assert.match(combined, /hashTonightFriendInviteToken/)
  assert.match(combined, /privateJson/)
  assert.doesNotMatch(combined, /service_role|SUPABASE_SERVICE_ROLE/)
  assert.doesNotMatch(combined, /\.from\(['"](?:friendships|connections|messages|chats)['"]\)/)
})

test('invite page resumes through same-tab session storage without putting the raw token in auth or profile queries', () => {
  const page = read('app/tonight/invite/[token]/page.tsx')
  const experience = read('components/tonight/FriendInviteExperience.tsx')
  const resume = read('app/tonight/(protected)/invite/resume/page.tsx')
  const protectedLayout = read('app/tonight/(protected)/layout.tsx')
  const middleware = read('middleware.ts')
  const routeChecker = read('scripts/check-local-routes.mjs')

  assert.match(page, /FriendInviteExperience/)
  assert.match(experience, /sessionStorage\.setItem/)
  assert.match(experience, /SAFE_RESUME_PATH\s*=\s*['"]\/tonight\/invite\/resume['"]/)
  assert.match(experience, /\/login\?redirect=\$\{encodeURIComponent\(SAFE_RESUME_PATH\)\}/)
  assert.match(experience, /\/tonight\/prepare\?returnTo=\$\{encodeURIComponent\(SAFE_RESUME_PATH\)\}/)
  const preparation = read('app/tonight/(protected)/prepare/page.tsx')
  assert.match(preparation, /returnTo === '\/tonight\/invite\/resume'/)
  assert.match(preparation, /requireServerAccess/)
  assert.match(preparation, /allowedRoles:\s*\['user'\]/)
  assert.doesNotMatch(experience, /redirect=\$\{encodeURIComponent\(returnPath\)\}/)
  assert.match(resume, /sessionStorage\.getItem/)
  assert.match(resume, /sessionStorage\.removeItem/)
  assert.match(resume, /router\.replace\(`\/tonight\/invite\/\$\{token\}`\)/)
  assert.equal(existsSync(join(ROOT, 'app/tonight/layout.tsx')), false)
  assert.match(protectedLayout, /requireServerAccess/)
  assert.match(protectedLayout, /allowedRoles:\s*\['user'\]/)
  assert.doesNotMatch(page, /requireServerAccess|redirect\(['"]\/login/)
  assert.match(routeChecker, /forbiddenBodyText:\s*['"]NEXT_REDIRECT;replace;\/login\?redirect=%2Ftonight['"]/)
  assert.match(routeChecker, /!containsForbiddenBody/)
  assert.match(experience, /ActivityRanker/)
  assert.match(experience, /rankedActivityIds/)
  assert.match(experience, /matchingConsentAccepted/)
  assert.match(experience, /초대 수락/)
  assert.match(experience, /거절/)
  assert.match(experience, /invite\.status !== 'pending'/)
  assert.match(middleware, /FRIEND_INVITE_LANDING_PATH/)
  assert.ok(middleware.includes(
    'const FRIEND_INVITE_LANDING_PATH = /^\\/tonight\\/invite\\/[0-9a-f]{64}$/i',
  ))
  assert.match(middleware, /const isFriendInviteLanding = FRIEND_INVITE_LANDING_PATH\.test\(pathname\)/)
  assert.match(middleware, /const isProtected = !isFriendInviteLanding && PROTECTED_PREFIXES\.some/)
})

test('owner share UI uses Kakao SDK, then native share, then clipboard and supports cancellation', () => {
  const share = read('components/tonight/FriendInviteSharePanel.tsx')
  const journey = read('components/tonight/UserTonightExperience.tsx')
  const rehearsal = read('components/tonight/rehearsal-fixtures.ts')

  assert.match(share, /shareKakaoDefault/)
  assert.match(share, /navigator\.share/)
  assert.match(share, /navigator\.clipboard\.writeText/)
  assert.match(share, /초대 취소/)
  assert.match(share, /\/api\/tonight\/friend-invites/)
  assert.match(share, /mode === 'rehearsal'/)
  assert.match(share, /체험 초대 링크/)
  assert.match(journey, /<FriendInviteSharePanel[\s\S]*?mode=\{mode\}/)
  assert.doesNotMatch(journey, /mode === 'live' && application\.bundle/)
  assert.match(rehearsal, /async apply\([\s\S]*?status:\s*'forming'[\s\S]*?memberCount:\s*1/)
})

test('friend invite mutations retain one idempotency key across uncertain retries and reconcile authoritative state', () => {
  const share = read('components/tonight/FriendInviteSharePanel.tsx')
  const experience = read('components/tonight/FriendInviteExperience.tsx')
  const collectionRoute = read('app/api/tonight/friend-invites/route.ts')

  assert.match(share, /initialInvitesLoaded/)
  assert.match(share, /loadedRoundId/)
  assert.match(share, /useEffect\(\(\) => \{[\s\S]*?currentRoundIdRef\.current = roundId/)
  assert.match(share, /const roundReady = initialInvitesLoaded && loadedRoundId === roundId/)
  assert.match(share, /if \(!active \|\| currentRoundIdRef\.current !== roundId\) return[\s\S]*?setInvites\(nextInvites\)/)
  assert.match(share, /const nextInvites = Array\.isArray\(payload\.invites\)[\s\S]*?return nextInvites/)
  assert.doesNotMatch(share, /const nextInvites = Array\.isArray\(payload\.invites\)[^}]*setInvites\(nextInvites\)/)
  assert.match(share, /disabled=\{disabled \|\| busy \|\| !roundReady \|\| remainingSeats === 0\}/)
  assert.match(share, /if \(busy \|\| disabled \|\| !roundReady\) return/)
  assert.match(share, /async function cancelInvite\(inviteId: string\) \{[\s\S]*?if \(busy \|\| !roundReady\) return/)
  assert.match(share, /const pending = roundReady \? invites\.filter\(\(invite\) => invite\.status === 'pending'\) : \[\]/)
  assert.match(share, /onClick=\{\(\) => void cancelInvite\(invite\.id\)\}[\s\S]*?disabled=\{busy \|\| !roundReady\}/)
  assert.match(share, /function noticeForCurrentRound\(message: string\)[\s\S]*?currentRoundIdRef\.current === roundId[\s\S]*?setNotice\(message\)/)
  assert.match(share, /const createScope = `\$\{roundId\}:open`/)
  assert.match(share, /const createKeysRef = useRef\(new Map<string, string>\(\)\)/)
  assert.match(share, /const createKey = createKeysRef\.current\.get\(createScope\)[\s\S]*?idempotencyKey\('tonight_invite_create'\)/)
  assert.match(share, /createKeysRef\.current\.set\(createScope, createKey\)/)
  assert.match(share, /idempotency_key:\s*createKey/)
  assert.match(share, /createKeysRef\.current\.delete\(createScope\)/)
  assert.doesNotMatch(share, /setLoadedRoundId[\s\S]{0,500}createKeysRef\.current\.clear\(\)/)
  assert.match(collectionRoute, /const inviteId = invite[\s\S]*?typeof invite\.id === 'string'[\s\S]*?invite_id:\s*inviteId/)
  assert.match(share, /payload\.error === 'invite_link_not_recoverable'[\s\S]*?invite\.id === payload\.invite_id/)
  assert.doesNotMatch(share, /knownInviteIds/)
  assert.match(share, /cancelKeysRef\.current\.get\(inviteId\)[\s\S]*?cancelKeysRef\.current\.set\(inviteId, existingKey\)/)
  assert.match(share, /idempotency_key:\s*existingKey/)
  assert.match(share, /current\.status !== 'pending'/)

  assert.match(experience, /acceptKeyRef\.current \?\?= idempotencyKey\('tonight_invite_accept'\)/)
  assert.match(experience, /idempotency_key:\s*acceptKeyRef\.current/)
  assert.match(experience, /latest\.payload\.invite\?\.status === 'accepted'/)
  assert.match(experience, /declineKeyRef\.current \?\?= idempotencyKey\('tonight_invite_decline'\)/)
  assert.match(experience, /idempotency_key:\s*declineKeyRef\.current/)
  assert.match(experience, /latest\.payload\.invite\?\.status === 'declined'/)
  assert.match(experience, /payload\.invite\.status === 'accepted'[\s\S]*?payload\.invite\.already_applied[\s\S]*?setState\('accepted'\)/)
  assert.match(experience, /payload\.invite\.status === 'declined'[\s\S]*?setState\('declined'\)/)
})

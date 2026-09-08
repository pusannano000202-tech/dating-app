import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = process.cwd()
const read = (relative: string) => readFileSync(path.join(root, relative), 'utf8')

test('owner API routes authenticate on the server and strictly parse each mutation', () => {
  const me = read('app/api/community/mbti/me/route.ts')
  const collection = read('app/api/community/mbti/experiences/route.ts')
  const member = read('app/api/community/mbti/experiences/[experienceId]/route.ts')
  const expand = read('app/api/community/mbti/experiences/[experienceId]/expand/route.ts')
  const withdraw = read('app/api/community/mbti/withdraw/route.ts')

  for (const source of [me, collection, member, expand, withdraw]) {
    assert.match(source, /createAuthenticatedOwnerMbtiRepository/)
    assert.doesNotMatch(source, /createSupabaseAdminClient|SUPABASE_SERVICE_ROLE|console\./)
  }
  assert.match(me, /parseParticipantInput/)
  assert.match(collection, /parseExperienceCreateInput/)
  assert.match(member, /parseExperiencePatchInput/)
  assert.match(expand, /parseMutationInput/)
  assert.match(withdraw, /parseMutationInput/)
})

test('every cookie-authenticated mutation requires the exact configured app origin', () => {
  const mutationRoutes = [
    'app/api/community/mbti/me/route.ts',
    'app/api/community/mbti/experiences/route.ts',
    'app/api/community/mbti/experiences/[experienceId]/route.ts',
    'app/api/community/mbti/experiences/[experienceId]/expand/route.ts',
    'app/api/community/mbti/meeting-stats-consent/route.ts',
    'app/api/community/mbti/withdraw/route.ts',
  ]
  for (const file of mutationRoutes) {
    assert.match(read(file), /assertMbtiMutationOrigin\(request\)/, file)
  }
  const repository = read('lib/community/mbti/server-repository.ts')
  assert.match(repository, /assertTrustedMutationOrigin\(request, getPublicAppOrigin\(\)\)/)
  assert.match(repository, /TrustedOriginError/)
})

test('stats API has no raw-table or owner-payload path and fails closed on stale snapshots', () => {
  const stats = read('app/api/community/mbti/stats/route.ts')
  const snapshots = read('lib/community/mbti/snapshot.server.ts')
  assert.match(stats, /readPublicMbtiSnapshot/)
  assert.match(stats, /stats_unavailable/)
  assert.match(snapshots, /isFreshPublicSnapshot/)
  assert.doesNotMatch(stats, /participants|experiences|owner_user_id/)
})

test('difference protection always compares against the last published snapshot', () => {
  const snapshots = read('lib/community/mbti/snapshot.server.ts')
  assert.match(snapshots, /latestSnapshot\('published'\)/)
  assert.match(snapshots, /\.eq\('status', status\)/)
})

test('internal refresh is secret-gated and is the only service-role aggregation path', () => {
  const internal = read('app/api/internal/community/mbti/refresh/route.ts')
  assert.match(internal, /isAuthorizedInternalRequest/)
  assert.match(internal, /CRON_SECRET/)
  assert.match(internal, /refreshPublicMbtiSnapshot/)
  assert.doesNotMatch(internal, /request\.json\(|console\./)
})

test('raw payloads are never written to application logs', () => {
  const files = [
    'lib/community/mbti/server-repository.ts',
    'lib/community/mbti/snapshot.server.ts',
    'app/api/community/mbti/me/route.ts',
    'app/api/community/mbti/experiences/route.ts',
    'app/api/community/mbti/experiences/[experienceId]/route.ts',
  ]
  for (const file of files) assert.doesNotMatch(read(file), /console\.|JSON\.stringify\(.*body/)
})

test('snapshot refresh aggregates service-only authoritative attendance instead of hard-coding unavailable', () => {
  const snapshots = read('lib/community/mbti/snapshot.server.ts')
  assert.match(snapshots, /service_list_authoritative_mbti_attendance/)
  assert.match(snapshots, /aggregateMeetingStats/)
  assert.match(snapshots, /protectMeetingStatsAggregate/)
  assert.doesNotMatch(snapshots, /meeting_stats_status: 'unavailable'/)
})

test('public reads use the atomic freshness RPC and refresh excludes owners without minimum signup', () => {
  const snapshots = read('lib/community/mbti/snapshot.server.ts')
  assert.match(snapshots, /service_get_fresh_community_mbti_snapshot/)
  assert.match(snapshots, /service_list_eligible_community_mbti_owner_ids/)
  assert.match(snapshots, /eligibleOwnerIds\.has/)
})

test('refresh captures a source epoch before reads and publishes only through the epoch CAS RPC', () => {
  const snapshots = read('lib/community/mbti/snapshot.server.ts')
  const refresh = snapshots.slice(snapshots.indexOf('export async function refreshPublicMbtiSnapshot'))
  const purge = refresh.indexOf("client.rpc('service_purge_expired_community_mbti')")
  const boundary = refresh.indexOf('const aggregationNow = now ?? purgeAggregationBoundary(purge.data)')
  const epoch = refresh.indexOf('readSourceEpoch()')
  const reads = refresh.indexOf('await Promise.all')
  const publish = refresh.indexOf("client.rpc('service_publish_community_mbti_snapshot'")
  assert.ok(purge >= 0 && purge < boundary && boundary < epoch && epoch < reads && reads < publish)
  assert.match(refresh, /generatedAt = aggregationNow\.toISOString\(\)/)
  assert.match(refresh, /p_expected_source_epoch: sourceEpoch/)
  assert.doesNotMatch(refresh, /from\('community_mbti_public_snapshots'\)\.insert/)
})

test('a production schedule refreshes the public MBTI snapshot well inside its 24-hour lifetime', () => {
  const vercel = JSON.parse(read('vercel.json')) as { crons?: Array<{ path?: string; schedule?: string }> }
  assert.ok(vercel.crons?.some((cron) => (
    cron.path === '/api/internal/community/mbti/refresh' && cron.schedule === '0 */6 * * *'
  )))
})

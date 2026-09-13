import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const root = new URL('../../', import.meta.url)
const source = path => readFile(new URL(path, root), 'utf8')

test('community places mounts the live worldcup and preserves category deep links', async () => {
  const [explorer, page] = await Promise.all([
    source('components/community/PlaceExperienceExplorer.tsx'),
    source('app/community/places/page.tsx'),
  ])
  assert.match(explorer, /PlaceWorldcupExperience/)
  assert.match(explorer, /initialCategory/)
  assert.match(explorer, /initialId=\{initialCategory\}/)
  assert.match(page, /searchParams/)
  assert.match(page, /placeCategory/)
  const experience = await source('components/place-worldcup/PlaceWorldcupExperience.tsx')
  assert.match(experience, /nextCatalog\.category !== category/)
  assert.match(experience, /!controller\.signal\.aborted/)
})

test('result reuses private content history saving and explains where the private reason is written', async () => {
  const board = await source('components/place-worldcup/PlaceWorldcupTournament.tsx')
  assert.match(board, /SaveContentRecord/)
  assert.match(board, /개인 메모/)
  assert.match(board, /공개 통계/)
  assert.match(board, /map\.naver\.com/)
})

test('live and operator APIs are guarded while submitted source URLs are never fetched', async () => {
  const files = await Promise.all([
    source('lib/place-worldcup/server.ts'),
    source('app/api/place-worldcup/route.ts'),
    source('app/api/place-worldcup/suggestions/route.ts'),
    source('app/api/place-worldcup/operator/route.ts'),
  ])
  const joined = files.join('\n')
  assert.match(joined, /requireRequestAccess/)
  assert.match(joined, /allowedRoles:\s*\['admin',\s*'super_admin'\]/)
  assert.doesNotMatch(joined, /\bfetch\s*\(/)
  assert.match(joined, /private, no-store/)
})

test('dev preview is offline-only, clearly labelled, and reuses the tournament component', async () => {
  const [page, preview] = await Promise.all([
    source('app/community/place-worldcup-preview/page.tsx'),
    source('components/place-worldcup/PlaceWorldcupPreview.tsx'),
  ])
  assert.match(page, /NODE_ENV/)
  assert.match(page, /QUANTUM_LOCAL_RUNTIME_MODE/)
  assert.match(page, /notFound/)
  assert.match(preview, /PlaceWorldcupTournament/)
  assert.match(preview, /예시 후보 · 실제 순위 아님/)
})

test('operator console reviews queue revisions rather than granting partner authority', async () => {
  const [page, queue] = await Promise.all([
    source('app/admin/place-worldcup/page.tsx'),
    source('components/place-worldcup/PlaceWorldcupOperatorQueue.tsx'),
  ])
  assert.match(page, /PlaceWorldcupOperatorQueue/)
  assert.match(queue, /expected_revision/)
  assert.match(queue, /approve/)
  assert.match(queue, /reject/)
})

test('operator console scopes privileged rows and in-flight work to the current auth generation', async () => {
  const queue = await source('components/place-worldcup/PlaceWorldcupOperatorQueue.tsx')
  assert.match(queue, /useHistoryAccount/)
  assert.match(queue, /authGeneration\.current/)
  assert.match(queue, /accountRef\.current/)
  assert.match(queue, /itemsOwner === account/)
  assert.match(queue, /attempts\.current\.clear\(\)/)
  assert.match(queue, /response\.status === 401 \|\| response\.status === 403/)
  assert.match(queue, /requestGeneration !== authGeneration\.current/)
  assert.equal((queue.match(/'X-Expected-Account': requestAccount/g) ?? []).length, 2, 'queue GET and review POST must share the account lease')
})

test('both place mutations bind the client account lease to freshly guarded server auth before RPC', async () => {
  const [server, suggestionRoute, operatorRoute, suggestionForm] = await Promise.all([
    source('lib/place-worldcup/server.ts'),
    source('app/api/place-worldcup/suggestions/route.ts'),
    source('app/api/place-worldcup/operator/route.ts'),
    source('components/place-worldcup/PlaceSuggestionForm.tsx'),
  ])
  assert.match(server, /const guarded = await requireRequestAccess/)
  assert.match(server, /userId:\s*guarded\.userId/)
  assert.match(server, /expectedPlaceAccountMatches/)
  for (const route of [suggestionRoute, operatorRoute]) {
    const guard = route.indexOf('requireExpectedPlaceAccount(request, repository.userId)')
    const rpc = route.indexOf('repository.rpc', guard)
    assert.ok(guard > 0 && guard < rpc, 'expected account must be checked before mutation RPC')
  }
  assert.equal((operatorRoute.match(/requireExpectedPlaceAccount\(request, repository\.userId\)/g) ?? []).length, 2, 'operator GET and POST must reject a changed cookie account')
  assert.match(suggestionForm, /useHistoryAccount/)
  assert.match(suggestionForm, /authGeneration\.current/)
  assert.match(suggestionForm, /'X-Expected-Account': requestAccount/)
  assert.match(suggestionForm, /requestGeneration !== authGeneration\.current/)
})

test('suggestion RPC serializes each actor before its rate count and records correction target revisions', async () => {
  const migration = await source('supabase/migrations/20260908174621_place_worldcup.sql')
  const actorLock = migration.indexOf("'place-worldcup:submit:' || v_actor::text")
  const rateCount = migration.indexOf("select count(*)", actorLock)
  const insert = migration.indexOf('insert into quantum_private.place_worldcup_suggestions', rateCount)
  assert.ok(actorLock > 0, 'per-actor submission lock missing')
  assert.ok(actorLock < rateCount && rateCount < insert, 'actor lock must precede rate count and insert')
  assert.match(migration, /target_candidate_revision/)
  assert.match(migration, /for update/)
  assert.match(migration, /target_revision_conflict/)
})

test('catalog SQL caps fresh candidates with a deterministic newest-first selection', async () => {
  const migration = await source('supabase/migrations/20260908174621_place_worldcup.sql')
  assert.match(migration, /order by candidate\.verified_at desc, candidate\.id asc\s+limit 64/i)
  assert.match(migration, /candidate_count[^;]+v_fresh_count/s)
})

test('operator queue SQL caps pending work with deterministic oldest-first progress', async () => {
  const migration = await source('supabase/migrations/20260908174621_place_worldcup.sql')
  const queueFunction = migration.slice(
    migration.indexOf('create or replace function public.operator_list_place_worldcup_queue()'),
    migration.indexOf('create or replace function public.operator_review_place_worldcup'),
  )
  assert.match(queueFunction, /order by[^;]+created_at[^;]+id[^;]+limit 500/is)
})

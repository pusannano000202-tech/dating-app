import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

test('match-pool enter separates lookup failures, absent records, and readiness conflicts', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/match-pool/enter/route.ts'), 'utf8')

  assert.match(
    route,
    /if \(memberError\) \{\s*return NextResponse\.json\(\{ error: 'member_lookup_failed' \}, \{ status: 500 \}\)\s*\}/,
  )
  assert.match(
    route,
    /if \(groupError\) \{\s*return NextResponse\.json\(\{ error: 'group_lookup_failed' \}, \{ status: 500 \}\)\s*\}\s*if \(!group\) \{\s*return NextResponse\.json\(\{ error: 'group_not_found' \}, \{ status: 404 \}\)\s*\}/,
  )
  assert.match(
    route,
    /if \(profileError\) \{\s*return NextResponse\.json\(\{ error: 'member_profile_lookup_failed' \}, \{ status: 500 \}\)\s*\}\s*if \(\(profiles\?\.length \?\? 0\) !== activeMembers\.length\) \{\s*return NextResponse\.json\(\{ error: 'member_profile_not_found' \}, \{ status: 404 \}\)\s*\}/,
  )
  assert.match(
    route,
    /if \(cardReadinessError\) \{\s*return NextResponse\.json\(\{ error: 'member_card_lookup_failed' \}, \{ status: 500 \}\)\s*\}/,
  )
  assert.match(route, /return NextResponse\.json\(\{ error: 'not_enough_members' \}, \{ status: 409 \}\)/)
  assert.match(route, /return NextResponse\.json\(\{ error: 'member_match_setup_incomplete' \}, \{ status: 409 \}\)/)
  assert.match(route, /get_group_appearance_score_readiness/)
  assert.match(route, /member_appearance_score_lookup_failed/)
  assert.doesNotMatch(route, /appearance_score_normalized/)
  assert.match(
    route,
    /appearanceReadySet\.has\(user\.id\) \? 'member_appearance_score_required' : 'appearance_score_required'/,
  )
  assert.match(
    route,
    /\{ error: currentUserCardReady \? 'member_pre_match_card_incomplete' : 'pre_match_card_required' \},\s*\{ status: 409 \}/,
  )
  assert.match(route, /function getEnterMatchPoolRpcFailure\(/)
  assert.doesNotMatch(route, /if \(group\.status !== 'forming'\)[\s\S]{0,140}?group_not_open/)
  assert.match(route, /reused_existing_entry:\s*Boolean\((?:data|entry)\?\.reused_existing_entry\)/)
  assert.ok(!/error: error\.message \|\| 'enter_failed'/.test(route))
})

test('match-pool retry orders reusable entries by the real entered_at column', () => {
  const migration = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260801140202_private_appearance_scores.sql'),
    'utf8',
  )

  assert.match(migration, /ORDER BY pool\.entered_at DESC, pool\.id DESC/)
  assert.doesNotMatch(migration, /ORDER BY pool\.created_at/)
})

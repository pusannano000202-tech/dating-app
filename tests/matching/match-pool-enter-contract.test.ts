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
  assert.match(
    route,
    /\{ error: currentUserCardReady \? 'member_pre_match_card_incomplete' : 'pre_match_card_required' \},\s*\{ status: 409 \}/,
  )
  assert.match(route, /function getEnterMatchPoolRpcFailure\(/)
  assert.ok(!/error: error\.message \|\| 'enter_failed'/.test(route))
})

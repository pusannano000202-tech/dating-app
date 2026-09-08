import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8').replace(/\r\n/g, '\n')
}

test('continuation mutation routes use the canonical strict-origin guard', () => {
  for (const route of [
    'app/api/match/series/[seriesId]/next-action/route.ts',
    'app/api/match/occurrences/[occurrenceId]/content/route.ts',
    'app/api/match/occurrences/[occurrenceId]/after/route.ts',
    'app/api/match/occurrences/[occurrenceId]/chat/route.ts',
  ]) {
    const code = source(route)
    assert.match(code, /assertTrustedMutationOrigin/)
    assert.doesNotMatch(code, /isTrustedMutationRequest/)
  }
})

test('continuation UI uses live routes and never labels an unverified payment as complete', () => {
  for (const component of [
    'components/matching/WeeklyActivityExplorer.tsx',
    'components/matching/FiveMeetingHomeNextActionCard.tsx',
    'components/matching/FiveMeetingCalendar.tsx',
    'components/matching/OccurrenceContentExperience.tsx',
    'components/matching/FiveMeetingPostFlow.tsx',
  ]) assert.ok(fs.existsSync(path.join(process.cwd(), component)), `${component} must exist`)

  const postFlow = source('components/matching/FiveMeetingPostFlow.tsx')
  assert.match(postFlow, /ContinuationFeeCheckout/)
  const checkout = source('components/matching/ContinuationFeeCheckout.tsx')
  assert.match(checkout, /\/api\/payments\/continuation\/prepare/)
  assert.doesNotMatch(postFlow, /실결제 연결 미검증/)
  assert.doesNotMatch(postFlow, /\/dev\/five-meeting/)
})

test('continuation content commands reject extra or oversized payload fields before persistence', () => {
  const migration = source('supabase/migrations/20260905120000_integrated_continuation_and_weekly.sql')
  const match = migration.match(/create or replace function public\.apply_my_continuation_content_action\(([\s\S]*?)\n\$\$;/i)
  assert.ok(match)
  assert.match(match[0], /octet_length\(p_payload::text\)[\s\S]*12000/i)
  assert.match(match[0], /p_payload - 'scores' <> '\{\}'::jsonb/i)
  assert.match(match[0], /invalid_content_payload/i)
})

test('continuation chat rejects contact handles, links, email addresses, and phone numbers before persistence', () => {
  const migration = source('supabase/migrations/20260905120000_integrated_continuation_and_weekly.sql')
  const match = migration.match(/create or replace function public\.send_my_continuation_chat_message\(([\s\S]*?)\n\$\$;/i)
  assert.ok(match)
  assert.match(match[0], /contact_sharing_not_allowed/i)
  assert.match(match[0], /https\?/i)
  assert.match(match[0], /instagram/i)
  assert.match(match[0], /regexp_replace\(p_message, '\[\^0-9\]'/i)
  assert.match(match[0], /01\[016789\]/i)
})

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const migrationSuffix = '_quantum_event_match_finalization.sql'

function readMigration(): string {
  const directory = path.join(process.cwd(), 'supabase', 'migrations')
  const file = fs.readdirSync(directory).find((entry) => entry.endsWith(migrationSuffix))
  assert.ok(file, `migration ending with ${migrationSuffix} must exist`)
  return fs.readFileSync(path.join(directory, file), 'utf8')
}

test('a full Quantum occurrence finalizes exactly one match and meeting', () => {
  const sql = readMigration()

  assert.match(sql, /add column if not exists match_id uuid references public\.matches/i)
  assert.match(sql, /create or replace function public\.finalize_quantum_event_occurrence/i)
  assert.match(sql, /for update/i)
  assert.match(sql, /v_total\s*<>\s*v_occurrence\.required_total/i)
  assert.match(sql, /v_male\s*<>\s*v_occurrence\.male_capacity/i)
  assert.match(sql, /v_female\s*<>\s*v_occurrence\.female_capacity/i)
  assert.match(sql, /insert into public\.matches/i)
  assert.match(sql, /insert into public\.match_meetings/i)
  assert.match(
    sql,
    /grant select, insert, update, delete on table public\.match_meetings to service_role/i,
  )
  assert.match(sql, /event_occurrence_id/i)
  assert.match(sql, /status\s*=\s*'confirmed'/i)
  assert.match(sql, /create trigger trg_quantum_event_finalize_when_full/i)
  assert.doesNotMatch(sql, /pg_catalog\.min\(user_id\)/i)
  assert.match(sql, /order by male_person\.user_id[\s\S]*limit 1/i)
  assert.match(sql, /order by female_person\.user_id[\s\S]*limit 1/i)
})

test('event participants use a private membership bridge instead of active legacy group rows', () => {
  const sql = readMigration()

  assert.match(sql, /create table if not exists public\.quantum_event_match_members/i)
  assert.match(sql, /primary key \(match_id, user_id\)/i)
  assert.match(sql, /unique \(occurrence_id, user_id\)/i)
  assert.match(sql, /enable row level security/i)
  assert.match(
    sql,
    /revoke all on table public\.quantum_event_match_members from public, anon, authenticated/i,
  )
  assert.match(
    sql,
    /grant select, insert, update, delete on table public\.quantum_event_match_members to service_role/i,
  )
  assert.doesNotMatch(sql, /insert into public\.group_members/i)
})

test('chat and evidence authorization accept event members without opening access to outsiders', () => {
  const sql = readMigration()

  assert.match(sql, /create or replace function public\.can_access_match_chat/i)
  assert.match(sql, /event_member\.user_id\s*=\s*p_user_id/i)
  assert.match(sql, /create or replace function public\.get_meeting_evidence_context/i)
  assert.match(sql, /event_member\.match_id\s*=\s*match_row\.id/i)
  assert.match(sql, /v_caller is null or p_user_id is distinct from v_caller/i)
  assert.match(sql, /v_request_role\s*<>\s*'service_role'/i)
  assert.match(sql, /revoke all on function public\.finalize_quantum_event_occurrence\(uuid\)/i)
  assert.match(sql, /grant execute on function public\.finalize_quantum_event_occurrence\(uuid\) to service_role/i)
  assert.match(sql, /create or replace function public\.cleanup_quantum_event_qa_fixture/i)
  assert.match(sql, /starts_at\s*<=\s*pg_catalog\.now\(\)\s*\+\s*interval '300 days'/i)
  assert.match(sql, /grant execute on function public\.cleanup_quantum_event_qa_fixture\(uuid\) to service_role/i)
})

test('remote evidence QA can build a private future occurrence and clean every fixture', () => {
  const script = fs.readFileSync(
    path.join(process.cwd(), 'scripts', 'run-meeting-evidence-e2e.mjs'),
    'utf8',
  )

  assert.match(script, /QA_PHASE.*full/)
  assert.match(script, /get_or_create_quantum_event_occurrence/)
  assert.match(script, /quantum_event_participations/)
  assert.match(script, /quantum_event_match_members/)
  assert.match(script, /match_meetings/)
  assert.match(script, /five_participant_album/)
  assert.match(script, /not_match_participant/)
  assert.match(script, /cleanup_complete/)
  assert.doesNotMatch(script, /\.from\(['"]groups['"]\)\.insert/)
  assert.doesNotMatch(script, /\.from\(['"]matches['"]\)\.insert/)
})

test('match chat RLS evaluates the authenticated user once per statement', () => {
  const sql = fs.readFileSync(
    path.join(
      process.cwd(),
      'supabase',
      'migrations',
      '20260811231500_match_chat_rls_initplan.sql',
    ),
    'utf8',
  )

  assert.match(sql, /drop policy if exists match_chat_messages_select_participants/i)
  assert.match(sql, /drop policy if exists match_chat_messages_insert_participants/i)
  assert.match(sql, /public\.can_access_match_chat\(match_id, \(select auth\.uid\(\)\)\)/i)
  assert.match(sql, /sender_user_id\s*=\s*\(select auth\.uid\(\)\)/i)
  assert.doesNotMatch(sql, /match_id, auth\.uid\(\)/i)
})

test('event matches create stable aliases without reading participant profiles', () => {
  const directory = path.join(process.cwd(), 'supabase', 'migrations')
  const file = fs
    .readdirSync(directory)
    .find((entry) => entry.endsWith('quantum_event_alias_privacy.sql'))

  assert.ok(file, 'event alias privacy migration must exist')

  const sql = fs.readFileSync(path.join(directory, file), 'utf8')

  assert.match(sql, /create or replace function public\.populate_quantum_event_match_aliases/i)
  assert.match(sql, /from public\.quantum_event_match_members/i)
  assert.match(sql, /insert into public\.match_member_aliases/i)
  assert.match(sql, /'참가자 ' \|\| pg_catalog\.chr\(64 \+ ranked\.rn\)/i)
  assert.match(sql, /event-aliases-v1/i)
  assert.doesNotMatch(sql, /join public\.profiles/i)
  assert.doesNotMatch(sql, /avatar_url|display_name|photo_url/i)
})

test('completed event participants can submit reviews without legacy group membership', () => {
  const migrationDirectory = path.join(process.cwd(), 'supabase/migrations')
  const migrationName = fs.readdirSync(migrationDirectory)
    .find((file) => file.endsWith('_quantum_event_review_bridge.sql'))

  assert.ok(migrationName, 'event review bridge migration must exist')
  const sql = fs.readFileSync(path.join(migrationDirectory, migrationName), 'utf8')

  assert.match(sql, /create or replace function public\.submit_review/i)
  assert.match(sql, /quantum_event_match_members/i)
  assert.match(sql, /quantum_event_occurrences/i)
  assert.match(sql, /status\s*<>\s*'completed'/i)
  assert.match(sql, /char_length\(pg_catalog\.btrim\(p_comment\)\)\s*>\s*500/i)
  assert.match(sql, /set search_path\s*=\s*''/i)
  assert.match(sql, /grant execute on function public\.submit_review/i)
})

test('review API maps database failures without exposing internal error messages', () => {
  const route = fs.readFileSync(
    path.join(process.cwd(), 'app/api/matches/[id]/review/route.ts'),
    'utf8',
  )

  assert.match(route, /mapReviewError/)
  assert.match(route, /review_already_exists/)
  assert.match(route, /not_match_participant/)
  assert.match(route, /submit_failed/)
  assert.doesNotMatch(route, /NextResponse\.json\(\{ error: error\.message/)
})

test('new event foreign keys have covering indexes', () => {
  const sql = fs.readFileSync(
    path.join(
      process.cwd(),
      'supabase',
      'migrations',
      '20260811233000_quantum_event_fk_indexes.sql',
    ),
    'utf8',
  )

  for (const column of [
    'meeting_photo_evidence_uploader_user_id',
    'quantum_event_match_members_party_group_id',
    'quantum_event_occurrences_male_group_id',
    'quantum_event_occurrences_female_group_id',
    'quantum_event_participations_match_id',
  ]) {
    assert.match(sql, new RegExp(`create index if not exists ${column}_idx`, 'i'))
  }
})

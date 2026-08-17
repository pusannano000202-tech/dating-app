import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import {
  MEETING_EVIDENCE_BUCKET,
  buildMeetingEvidencePath,
  validateMeetingEvidenceFile,
  validateMeetingEvidenceSignature,
} from '../../lib/matching/meeting-evidence'

const migrationSuffix = '_meeting_photo_evidence.sql'

function readMigration(): string {
  const directory = path.join(process.cwd(), 'supabase', 'migrations')
  const file = fs.readdirSync(directory).find((entry) => entry.endsWith(migrationSuffix))
  assert.ok(file, `migration ending with ${migrationSuffix} must exist`)
  return fs.readFileSync(path.join(directory, file), 'utf8')
}

function readEvidenceMigrations(): string {
  const directory = path.join(process.cwd(), 'supabase', 'migrations')
  return fs.readdirSync(directory)
    .filter((entry) => entry.includes('meeting_evidence') && entry.endsWith('.sql'))
    .sort()
    .map((entry) => fs.readFileSync(path.join(directory, entry), 'utf8'))
    .join('\n')
}

test('meeting evidence validates only bounded image uploads', () => {
  assert.equal(MEETING_EVIDENCE_BUCKET, 'meeting-evidence')
  assert.deepEqual(
    validateMeetingEvidenceFile({ contentType: 'image/jpeg', byteSize: 5_000_000 }),
    { ok: true, extension: 'jpg' },
  )
  assert.deepEqual(
    validateMeetingEvidenceFile({ contentType: 'application/pdf', byteSize: 20_000 }),
    { ok: false, error: 'unsupported_file_type' },
  )
  assert.deepEqual(
    validateMeetingEvidenceFile({ contentType: 'image/png', byteSize: 12 * 1024 * 1024 + 1 }),
    { ok: false, error: 'file_too_large' },
  )
  assert.deepEqual(
    validateMeetingEvidenceFile({ contentType: 'image/webp', byteSize: 0 }),
    { ok: false, error: 'empty_file' },
  )
})

test('meeting evidence path is scoped to the actual match and evidence id', () => {
  assert.equal(
    buildMeetingEvidencePath('match-123', 'evidence-456', 'jpg'),
    'match-123/evidence-456.jpg',
  )
  assert.throws(
    () => buildMeetingEvidencePath('../other', 'evidence-456', 'jpg'),
    /invalid_meeting_evidence_path/,
  )
})

test('meeting evidence rejects a file whose bytes do not match the declared image type', () => {
  assert.deepEqual(
    validateMeetingEvidenceSignature(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      'image/png',
    ),
    { ok: true },
  )
  assert.deepEqual(
    validateMeetingEvidenceSignature(
      new TextEncoder().encode('not an image'),
      'image/png',
    ),
    { ok: false, error: 'file_signature_mismatch' },
  )
})

test('meeting evidence migration is private, idempotent, and never auto-forfeits deposits', () => {
  const migration = readMigration()

  assert.match(migration, /CREATE TABLE public\.meeting_photo_evidence/i)
  assert.match(migration, /match_id UUID NOT NULL REFERENCES public\.matches\(id\) ON DELETE CASCADE/i)
  assert.match(migration, /UNIQUE\s*\(match_id, file_sha256\)/i)
  assert.match(migration, /UNIQUE\s*\(match_id, uploader_user_id\)/i)
  assert.match(migration, /ALTER TABLE public\.meeting_photo_evidence ENABLE ROW LEVEL SECURITY/i)
  assert.match(migration, /REVOKE ALL ON TABLE public\.meeting_photo_evidence FROM PUBLIC, anon, authenticated/i)
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.meeting_photo_evidence TO service_role/i)
  assert.match(migration, /VALUES\s*\(\s*'meeting-evidence'\s*,\s*'meeting-evidence'\s*,\s*FALSE/i)
  assert.doesNotMatch(migration, /UPDATE\s+public\.deposits/i)
  assert.doesNotMatch(migration, /forfeit|몰수/i)
})

test('meeting evidence APIs use request auth, server admin storage, and participant checks', () => {
  const uploadRoute = fs.readFileSync(
    path.join(process.cwd(), 'app/api/matches/[id]/evidence-photo/route.ts'),
    'utf8',
  )
  const albumRoute = fs.readFileSync(
    path.join(process.cwd(), 'app/api/matches/[id]/album/route.ts'),
    'utf8',
  )

  for (const route of [uploadRoute, albumRoute]) {
    assert.match(route, /createSupabaseRequestClient\(request\)/)
    assert.match(route, /createSupabaseAdminClient\(\)/)
    assert.match(route, /getMeetingParticipantContext/)
    assert.match(route, /not_match_participant/)
  }

  assert.match(uploadRoute, /validateMeetingEvidenceFile/)
  assert.match(uploadRoute, /validateMeetingEvidenceSignature/)
  assert.match(uploadRoute, /buildMeetingOperations/)
  assert.match(uploadRoute, /file_sha256/)
  assert.match(uploadRoute, /MEETING_EVIDENCE_BUCKET/)
  assert.match(uploadRoute, /evidence_already_submitted/)
  assert.match(uploadRoute, /schema_unavailable/)
  assert.doesNotMatch(uploadRoute, /deposits|forfeit|몰수/i)

  assert.match(albumRoute, /createSignedUrl/)
  assert.match(albumRoute, /\.limit\(50\)/)
  assert.match(albumRoute, /expires_in:\s*300/)
  assert.doesNotMatch(albumRoute, /getPublicUrl/)
})

test('meeting participant context uses a service-only RPC instead of revoked table grants', () => {
  const migrations = readEvidenceMigrations()
  const helper = fs.readFileSync(
    path.join(process.cwd(), 'lib/matching/meeting-evidence-server.ts'),
    'utf8',
  )

  assert.match(migrations, /CREATE OR REPLACE FUNCTION public\.get_meeting_evidence_context/i)
  assert.match(migrations, /TO service_role/i)
  assert.match(migrations, /REVOKE ALL ON FUNCTION public\.get_meeting_evidence_context/i)
  assert.match(helper, /\.rpc\('get_meeting_evidence_context'/)
  assert.doesNotMatch(helper, /\.from\('matches'\)/)
  assert.doesNotMatch(helper, /\.from\('group_members'\)/)
  assert.doesNotMatch(helper, /\.from\('match_meetings'\)/)
})

test('remote evidence QA creates five participants, checks a non-participant, and cleans up', () => {
  const scriptPath = path.join(process.cwd(), 'scripts/run-meeting-evidence-e2e.mjs')
  assert.ok(fs.existsSync(scriptPath), 'five-account meeting evidence QA script must exist')
  const script = fs.readFileSync(scriptPath, 'utf8')

  assert.match(script, /PARTICIPANT_COUNT\s*=\s*5/)
  assert.match(script, /QA_PHASE/)
  assert.match(script, /setup/)
  assert.match(script, /verify/)
  assert.match(script, /cleanup/)
  assert.match(script, /not_match_participant/)
  assert.match(script, /evidence-photo/)
  assert.match(script, /\/album/)
  assert.match(script, /meeting_photo_evidence/)
  assert.match(script, /deleteUser/)
  assert.match(script, /cleanup_complete/)
  assert.doesNotMatch(script, /\.from\(['"]groups['"]\)\.insert/)
  assert.doesNotMatch(script, /\.from\(['"]matches['"]\)\.insert/)
})

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import {
  buildQuantumPrecardSubmissionText,
  countCompletedQuantumPrecardSections,
  createEmptyQuantumPrecardDraft,
  createQuantumPrecardDraftFromSubmissionText,
  isQuantumPrecardComplete,
  validateQuantumPrecardDraft,
  type QuantumPrecardDraft,
} from '../../lib/matching/quantum-precard'

const COMPLETE_CARD: QuantumPrecardDraft = {
  intro: '처음에는 조용하지만 공통점을 찾으면 말이 많아져요.',
  mbti: 'INFP',
  conversationEnergy: 'balanced',
  planStyle: 'balanced',
  interests: ['보드게임', '러닝', '맛집'],
  music: '잔잔한 인디 팝과 R&B를 자주 들어요.',
  mintChocolate: 'A',
  naengmyeon: 'B',
  meetupRole: 'question_starter',
}

test('B precard requires seven safe sections while keeping MBTI optional', () => {
  const withoutMbti = { ...COMPLETE_CARD, mbti: '' }

  assert.equal(countCompletedQuantumPrecardSections(withoutMbti), 7)
  assert.equal(isQuantumPrecardComplete(withoutMbti), true)
  assert.deepEqual(validateQuantumPrecardDraft(withoutMbti), { ok: true })
})

test('B precard round-trips choices, interests, and short stories', () => {
  const submission = buildQuantumPrecardSubmissionText(COMPLETE_CARD)
  const restored = createQuantumPrecardDraftFromSubmissionText(submission)

  assert.deepEqual(restored, COMPLETE_CARD)
  assert.match(submission, /\[나를 보여주는 한 문장\]/)
  assert.match(submission, /\[대화 에너지\]/)
  assert.match(submission, /\[약속 스타일\]/)
  assert.match(submission, /\[관심사\]/)
  assert.match(submission, /\[오늘의 역할\]/)
})

test('B precard rejects missing interests and public contact details', () => {
  const tooFewInterests = { ...COMPLETE_CARD, interests: ['러닝', '맛집'] }
  const unsafeContact = { ...COMPLETE_CARD, intro: '카톡 아이디 quantum2026으로 연락해요.' }

  assert.equal(isQuantumPrecardComplete(tooFewInterests), false)
  assert.equal(validateQuantumPrecardDraft(tooFewInterests).ok, false)
  assert.equal(validateQuantumPrecardDraft(unsafeContact).ok, false)
})

test('old daily-card text is not mistaken for a completed B precard', () => {
  const oldSubmission = '[좋아하는 노래 3곡]\n노래A / 노래B / 노래C\n\n[주말에 가고 싶은 음식점]\n맛집'
  const restored = createQuantumPrecardDraftFromSubmissionText(oldSubmission)

  assert.deepEqual(restored, createEmptyQuantumPrecardDraft())
  assert.equal(isQuantumPrecardComplete(restored), false)
})

test('event application replaces the B precard gate with atomic preference and moment readiness', () => {
  const route = fs.readFileSync(
    path.join(process.cwd(), 'app/api/match/event-participation/route.ts'),
    'utf8',
  )
  const migration = fs.readFileSync(
    path.join(
      process.cwd(),
      'supabase/migrations/20260814030000_matching_profile_preference_secret_roles.sql',
    ),
    'utf8',
  )

  assert.doesNotMatch(route, /get_my_pre_match_card_draft|pre_match_card_required/)
  assert.match(route, /save_my_quantum_event_meeting_moment_and_participate/)
  assert.match(route, /meeting_moment/)
  assert.match(route, /profile_preference_required/)
  assert.match(migration, /private\.quantum_profile_preferences/)
  assert.match(migration, /profile_preference_required/)
  assert.match(migration, /public\.save_my_quantum_event_meeting_moment/)
  assert.doesNotMatch(
    migration.match(
      /CREATE OR REPLACE FUNCTION private\.quantum_event_precard_ready[\s\S]*?\n\$\$;/i,
    )?.[0] ?? '',
    /pre_match_card_drafts/,
  )
})

test('precard API does not expose Supabase error details', () => {
  const route = fs.readFileSync(
    path.join(process.cwd(), 'app/api/profile/match-card-draft/route.ts'),
    'utf8',
  )

  assert.doesNotMatch(route, /error\.message/)
  assert.match(route, /draft_lookup_failed/)
  assert.match(route, /draft_save_failed/)
  assert.equal((route.match(/status: 500/g) ?? []).length, 2)
})

test('precard API accepts the same request-scoped auth boundary as mobile event APIs', () => {
  const route = fs.readFileSync(
    path.join(process.cwd(), 'app/api/profile/match-card-draft/route.ts'),
    'utf8',
  )

  assert.match(route, /createSupabaseRequestClient/)
  assert.match(route, /export async function GET\(req: NextRequest\)/)
  assert.match(route, /export async function POST\(req: NextRequest\)/)
  assert.equal((route.match(/createSupabaseRequestClient\(req\)/g) ?? []).length, 2)
  assert.doesNotMatch(route, /createSupabaseServerClient/)
  assert.doesNotMatch(route, /createSupabaseAdminClient/)
  assert.match(route, /get_my_pre_match_card_draft/)
  assert.match(route, /save_my_pre_match_card_draft/)
  assert.doesNotMatch(route, /\.from\('pre_match_card_drafts'\)/)
})

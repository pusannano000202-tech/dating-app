import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

function readSource(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

const roleCardPath = 'components/matching/QuantumSecretRoleCard.tsx'
const guessingPath = 'components/matching/QuantumRoleGuessing.tsx'
const applicationStatusPath = 'components/matching/QuantumEventApplicationStatus.tsx'

test('sealed role card is own-occurrence scoped and never renders identity fields', () => {
  const source = readSource(roleCardPath)

  assert.match(source, /'use client'/)
  assert.match(source, /나만 볼 수 있는 역할/)
  assert.match(source, /한 번 바꾸기/)
  assert.match(source, /nextRole\.occurrenceId !== occurrenceId/)
  assert.match(source, /occurrence_id/)
  assert.match(source, /canChange/)
  assert.match(source, /confirmRole/)
  assert.match(source, /역할 확인하고 참여 확정/)
  assert.match(source, /다시 확인/)
  assert.match(source, /aria-live="polite"/)
  assert.doesNotMatch(source, /(?:photo|avatar|display_name|department|phone|contact|appearance_score|user_id)/i)
})

test('sealed role card keeps the role sealed until the participant explicitly opens it', () => {
  const source = readSource(roleCardPath)

  assert.match(source, /useState\(false\)/)
  assert.match(source, /역할 봉인 열기/)
  assert.match(source, /setOpened\(true\)/)
  assert.match(source, /role\.mission/)
  assert.match(source, /role\.safetyCopy/)
})

test('role guessing is locked before completion and only sends anonymous seat labels after completion', () => {
  const source = readSource(guessingPath)

  assert.match(source, /meetingCompleted/)
  assert.match(source, /만남이 끝난 뒤 열려요/)
  assert.match(source, /if \(!meetingCompleted\)/)
  assert.match(source, /match_id/)
  assert.match(source, /seat_label/)
  assert.match(source, /target\.seatLabel/)
  assert.match(source, /SECRET_ROLE_KEYS/)
  assert.match(source, /state\.targets\.length < 2/)
  assert.match(source, /제출은 한 번만 가능해요/)
  assert.match(source, /aria-live="polite"/)
  assert.doesNotMatch(source, /(?:photo|avatar|display_name|department|phone|contact|appearance_score|user_id)/i)
})

test('role guessing does not reveal an answer until the server marks the state revealed', () => {
  const source = readSource(guessingPath)

  assert.match(source, /state\.status === 'revealed'/)
  assert.match(source, /target\.answerRole/)
  assert.match(source, /role_guess_state/)
  assert.match(source, /다시 확인/)
})

test('confirmed applications keep the own role available and open role guessing only after completion', () => {
  const source = readSource(applicationStatusPath)

  assert.match(source, /QuantumSecretRoleCard/)
  assert.match(source, /occurrenceId=\{savedLifecycle\.occurrence_id\}/)
  assert.match(source, /QuantumRoleGuessing/)
  assert.match(source, /matchId=\{matchId\}/)
  assert.match(source, /meetingCompleted/)
  assert.match(source, /stage === 'completed'/)
})

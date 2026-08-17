import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

function readSource(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

test('profile match-card uses the reusable preference editor instead of the old public role card', () => {
  const page = readSource('app/profile/match-card/page.tsx')
  const wizard = readSource('components/profile/QuantumProfilePreferenceWizard.tsx')

  assert.match(page, /내 취향 카드/)
  assert.match(page, /QuantumProfilePreferenceWizard/)
  assert.match(page, /\/api\/profile\/quantum-preferences/)
  assert.doesNotMatch(page, /QuantumPrecardWizard/)
  assert.match(wizard, /건너뛰기/)
  assert.doesNotMatch(wizard, /오늘의 역할/)
  assert.doesNotMatch(wizard, /meetupRole|secretRole/)
})

test('profile preference loading keeps an explicit retry state instead of replacing answers after a failed GET', () => {
  const page = readSource('app/profile/match-card/page.tsx')

  assert.match(page, /loadState === 'error'/)
  assert.match(page, /다시 불러오기/)
  assert.match(page, /response\.ok/)
  assert.match(page, /preference === null/)
})

test('profile editor rejects redirect escapes and explains blocked personal text beside the field', () => {
  const page = readSource('app/profile/match-card/page.tsx')
  const wizard = readSource('components/profile/QuantumProfilePreferenceWizard.tsx')

  assert.match(page, /new URL\(/)
  assert.match(page, /%2f\|%5c/i)
  assert.match(page, /pathname/)
  assert.match(wizard, /containsBlockedPersonalContact/)
  assert.match(wizard, /favorite-music-error/)
  assert.match(wizard, /aria-invalid/)
  assert.match(wizard, /QUANTUM_DEBATE_QUESTION_DEFINITIONS/)
  assert.match(wizard, /<fieldset/)
  assert.match(wizard, /<legend/)
})

test('meeting moment wizard collects a draft without requiring a pre-application occurrence', () => {
  const wizard = readSource('components/matching/QuantumMeetingMomentWizard.tsx')

  assert.match(wizard, /오늘의 기분/)
  assert.match(wizard, /기대하는 장면/)
  assert.match(wizard, /활동에서 하고 싶은 선택/)
  assert.match(wizard, /onContinue/)
  assert.doesNotMatch(wizard, /\/api\/match\/event-meeting-moment/)
  assert.doesNotMatch(wizard, /occurrenceKey/)
  assert.match(wizard, /<fieldset/)
  assert.match(wizard, /<legend/)
  assert.doesNotMatch(wizard, /오늘의 역할|meetupRole|secretRole/)
})

test('application keeps the six-guide and friend setup flow and submits the moment atomically with participation', () => {
  const application = readSource('components/matching/QuantumEventApplicationStatus.tsx')

  assert.match(application, /MeetingGuideStory/)
  assert.match(application, /QuantumFriendPartySetup/)
  assert.match(application, /QuantumMeetingMomentWizard/)
  assert.match(application, /\/api\/profile\/quantum-preferences/)
  assert.match(application, /meeting_moment:\s*meetingMoment/)
  assert.match(application, /onContinue=\{submitApplication\}/)
  assert.match(application, /QuantumSecretRoleCard/)
  assert.match(application, /parseMySecretRole/)
  assert.match(application, /role_confirmation_required/)
  assert.match(application, /application_confirmed/)
  assert.match(application, /onRoleConfirmed=\{completeRoleConfirmation\}/)
  assert.doesNotMatch(application, /readPreparationOccurrenceKey/)
  assert.doesNotMatch(application, /preparationOccurrenceKey/)
})

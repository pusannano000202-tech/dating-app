import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

test('campus seven is owned by matching and the old meetup route redirects', () => {
  const matchRoute = join(ROOT, 'app/match/campus-seven/page.tsx')
  assert.equal(existsSync(matchRoute), true)

  const page = read('app/match/campus-seven/page.tsx')
  const legacyPage = read('app/meetups/campus-seven/page.tsx')
  const matchHub = read('app/match/page.tsx')
  const meetups = read('app/meetups/page.tsx')

  assert.match(page, /getCampusSevenFeatureState/)
  assert.match(page, /CampusSevenExperience/)
  assert.match(legacyPage, /redirect\(['"]\/match\/campus-seven['"]\)/)
  assert.match(matchHub, /\/match\/campus-seven/)
  assert.doesNotMatch(meetups, /\/meetups\/campus-seven/)
})

test('participant screen exposes live operations without future schedule or card pricing', () => {
  const componentPath = join(ROOT, 'components/matching/campus-seven/CampusSevenExperience.tsx')
  assert.equal(existsSync(componentPath), true)
  const component = read('components/matching/campus-seven/CampusSevenExperience.tsx')

  assert.match(component, /liveGuide/)
  assert.match(component, /actionAvailability/)
  assert.match(component, /getCampusSevenNextRefreshAt/)
  assert.match(component, /hasEnrollment \? <EnrolledProgramBanner/)
  assert.match(component, /hasEnrollment \? <EnrolledProgramBanner[\s\S]*: \([\s\S]*campus-seven-hero\.png/)
  assert.match(component, /Quantum 제작진/)
  assert.match(component, /label="LIVE"/)
  assert.doesNotMatch(component, /CAMPUS_SEVEN_DAYS/)
  assert.doesNotMatch(component, /7일 일정/)
  assert.doesNotMatch(component, /1,000원|9\.7만 원/)
  assert.match(component, /\/api\/campus-seven\/apply/)
  assert.match(component, /action: 'reservation'/)
  assert.match(component, /action: 'interest_vote'/)
  assert.match(component, /action: 'game_rank'/)
  assert.match(component, /action: 'date_response'/)
  assert.match(component, /action: 'final_response'/)
  assert.match(component, /action: 'safety_report'/)
  assert.match(component, /action: 'deposit_appeal'/)
  assert.match(component, /uploadToSignedUrl/)
  assert.match(component, /actionAvailability\.dayTwoChoices\.isOpen/)
  assert.match(component, /actionAvailability\.gameRank\.isOpen/)
  assert.match(component, /actionAvailability\.interestVote\.isOpen/)
  assert.match(component, /actionAvailability\.dateChoice\.isOpen/)
  assert.match(component, /actionAvailability\.dateResponse\.isOpen/)
  assert.match(component, /actionAvailability\.finalProposal\.isOpen/)
  assert.match(component, /actionAvailability\.finalResponse\.isOpen/)
  assert.match(component, /current \? '현재 안내를 따라주세요'/)
})

test('ordinary reports and full safety exit have different consequences in the copy', () => {
  const component = read('components/matching/campus-seven/CampusSevenExperience.tsx')

  assert.match(component, /일반 신고만으로는 전체 배정이 자동 중단되지 않아요/)
  assert.match(component, /전체 안전 이탈은 이후 예약·데이트·최종 선택 배정을 중단해요/)
  assert.match(component, /신고 접수 후 전체 안전 이탈/)
})

test('every participant choice is driven by a reusable portrait card instead of a name select', () => {
  const component = read('components/matching/campus-seven/CampusSevenExperience.tsx')
  const choicePath = join(ROOT, 'components/matching/campus-seven/ParticipantChoiceGrid.tsx')

  assert.equal(existsSync(choicePath), true)
  const choice = read('components/matching/campus-seven/ParticipantChoiceGrid.tsx')

  assert.match(component, /ParticipantChoiceGrid/)
  assert.match(component, /대화가 편했어요/)
  assert.match(component, /더 궁금해요/)
  assert.match(component, /배려가 느껴졌어요/)
  assert.match(component, /시작 20분 전에 공개/)
  assert.doesNotMatch(component, /availableTargets\.map\([\s\S]{0,180}<option/)
  assert.doesNotMatch(component, /dashboard\.participants\.filter\([\s\S]{0,220}<option/)
  assert.match(component, /label="신고할 상대 선택"/)
  assert.match(component, /selectedUserIds=\{targetUserId \? \[targetUserId\] : \[\]\}/)
  assert.match(choice, /photoUrl/)
  assert.match(choice, /aspect-\[4\/5\]/)
  assert.match(choice, /aria-pressed/)
  assert.match(choice, /사진 준비 중/)
  assert.match(choice, /maxSelections > 1/)
})

test('requests, participant list, and accepted pairs can resolve the same portrait identity', () => {
  const component = read('components/matching/campus-seven/CampusSevenExperience.tsx')

  assert.match(component, /participantById/)
  assert.match(component, /chooserUserId/)
  assert.match(component, /proposerUserId/)
  assert.match(component, /targetUserId/)
  assert.match(component, /ParticipantPortrait/)
})

test('closed pilot copy is honest about recruitment, payments, and offline responsibility', () => {
  const component = read('components/matching/campus-seven/CampusSevenExperience.tsx')

  assert.match(component, /현재 실제 모집은 열지 않았어요/)
  assert.match(component, /Quantum 직원이 현장에 가지 않아요/)
  assert.match(component, /결제 기능은 아직 열리지 않았어요/)
  assert.doesNotMatch(component, /\d+[명건]\s*(신청|구매|참여)/)
})

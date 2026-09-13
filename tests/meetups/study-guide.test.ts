import assert from 'node:assert/strict'
import test from 'node:test'
import { getStudyGuide, getStudyGuideOutline, getStudyLevelOptions, type StudyGuideKind, type StudyLevel } from '../../lib/meetups/study-guide'

const kinds: StudyGuideKind[] = ['major-math', 'major-physics', 'major-general', 'language-speaking', 'mentoring', 'department-social']
const levels: StudyLevel[] = ['beginner', 'intermediate', 'advanced']

test('each activity and level provides ten different substantive recommended sessions', () => {
  for (const kind of kinds) for (const level of levels) {
    const titles: string[] = []
    for (let sessionNumber = 1; sessionNumber <= 10; sessionNumber++) {
      const guide = getStudyGuide({ kind, level, sessionNumber })!
      assert.ok(guide, `${kind}/${level}/${sessionNumber}`)
      assert.equal(guide.totalSessions, 10)
      titles.push(guide.title)
      assert.ok(guide.goal.length > 15)
      assert.ok(guide.preparation.length >= 2)
      assert.ok(guide.steps.length >= 4)
      assert.ok(guide.steps.every(step => step.minutes > 0 && step.body.length > 10))
      assert.equal(guide.estimatedMinutes, guide.steps.reduce((sum, step) => sum + step.minutes, 0))
      assert.ok(guide.prompts.length >= 2 && guide.recap.length >= 2)
      assert.match(guide.participationNote, /회차마다 자유 참여/)
      assert.ok(guide.nextTask.length > 10)
    }
    assert.equal(new Set(titles).size, 10)
  }
})

test('activity-specific level assistance changes the work without asserting certified skill', () => {
  for (const kind of kinds) {
    const guides = levels.map(level => getStudyGuide({ kind, level, sessionNumber: 3 })!)
    assert.equal(new Set(guides.map(guide => guide.steps.map(step => step.body).join(''))).size, 3)
  }
  const speaking = getStudyGuide({ kind: 'language-speaking', level: 'advanced', sessionNumber: 1 })!
  assert.match(speaking.skillDisclaimer, /공인|인증/)
  assert.match(speaking.skillDisclaimer, /아니/)
  assert.match(getStudyGuide({ kind: 'mentoring', level: 'beginner', sessionNumber: 1 })!.skillDisclaimer, /자격/)
})

test('invalid session numbers and unrecognized runtime selections never silently become session one', () => {
  for (const sessionNumber of [0, -1, 11, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(getStudyGuide({ kind: 'major-math', level: 'beginner', sessionNumber }), null)
  }
  assert.equal(getStudyGuide({ kind: 'arbitrary' as StudyGuideKind, level: 'beginner', sessionNumber: 1 }), null)
  assert.equal(getStudyGuide({ kind: 'major-math', level: 'arbitrary' as StudyLevel, sessionNumber: 1 }), null)
})

test('course outline and assistance selectors fail closed for prototype-like or unknown kinds', () => {
  for (const kind of ['__proto__', 'constructor', 'toString', 'unknown']) {
    assert.deepEqual(getStudyGuideOutline(kind as StudyGuideKind), [])
    assert.deepEqual(getStudyLevelOptions(kind as StudyGuideKind), [])
  }
  for (const kind of kinds) {
    const outline = getStudyGuideOutline(kind)
    assert.equal(outline.length, 10)
    assert.deepEqual(outline.map(item => item.sessionNumber), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    assert.deepEqual(getStudyLevelOptions(kind).map(option => option.id), levels)
  }
})

test('the last session offers a choice to continue rather than automatically extending attendance', () => {
  for (const kind of kinds) {
    const last = getStudyGuide({ kind, level: 'beginner', sessionNumber: 10 })!
    assert.match(last.nextTask, /자동 연장이나 자동 참석은 없어요/)
    assert.ok(last.steps.some(step => step.body.includes('임의로 바꾸지')))
    assert.ok(last.steps.some(step => step.body.includes('이전 요약')))
    assert.ok(last.steps.some(step => step.body.includes('개인 고민·연락처')))
  }
  assert.match(getStudyLevelOptions('department-social')[0].label, /천천히/)
  assert.ok(!getStudyLevelOptions('department-social').some(option => option.label === '고수'))
})

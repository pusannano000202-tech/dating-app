import assert from 'node:assert/strict'
import test from 'node:test'
import { getMeetingCoachingCards, meetingCoachingSwipeDirection, moveMeetingCoachingCard, resolveMeetingCoachingCue, resolveMeetingCoachingMode } from '../../components/matching/meeting-coaching-content'

test('current cues never unlock previews or substitute for verified participation', () => {
  const cards = getMeetingCoachingCards()
  const cue = { cardId: 'conversation', label: '첫인상 나누기' }
  for (const flags of [{}, { unlocked: true }, { preview: false }, { preview: true, unlocked: true }]) {
    assert.equal(resolveMeetingCoachingCue(cards, resolveMeetingCoachingMode(flags), cue), null)
  }
  assert.deepEqual(resolveMeetingCoachingCue(cards, resolveMeetingCoachingMode({ preview: false, unlocked: true }), cue), { index: 2, label: '첫인상 나누기' })
})

test('missing, blank and unknown cues cannot invent a current stage', () => {
  const cards = getMeetingCoachingCards()
  assert.equal(resolveMeetingCoachingCue(cards, 'unlocked'), null)
  assert.equal(resolveMeetingCoachingCue(cards, 'unlocked', { cardId: 'begin', label: '  ' }), null)
  assert.equal(resolveMeetingCoachingCue(cards, 'unlocked', { cardId: 'invalid', label: '현재' }), null)
  assert.equal(resolveMeetingCoachingCue([], 'unlocked', { cardId: 'introduce', label: '소개' }), null)
  assert.deepEqual(resolveMeetingCoachingCue(cards, 'unlocked', { cardId: 'wrap', label: ' 마무리 ' }), { index: 3, label: '마무리' })
})

test('manual browsing clamps to available scenes, including malformed bounds', () => {
  assert.equal(moveMeetingCoachingCard(0, -1, 4), 0)
  assert.equal(moveMeetingCoachingCard(3, 1, 4), 3)
  assert.equal(moveMeetingCoachingCard(2, -1, 4), 1)
  assert.equal(moveMeetingCoachingCard(99, -1, 4), 2)
  for (const count of [0, -2, NaN, Infinity]) assert.equal(moveMeetingCoachingCard(99, 1, count), 0)
  assert.equal(moveMeetingCoachingCard(NaN, 1, 4), 1)
})

test('swipes require horizontal intent and leave vertical scrolling alone', () => {
  assert.equal(meetingCoachingSwipeDirection(-70, 8), 1)
  assert.equal(meetingCoachingSwipeDirection(70, -8), -1)
  for (const [x, y] of [[47, 0], [60, 70], [60, 50], [0, 120], [NaN, 0], [70, Infinity]]) {
    assert.equal(meetingCoachingSwipeDirection(x, y), null)
  }
})

test('first impressions stay voluntary and concern conversational kindness, with no text collection', () => {
  for (const audience of ['singles', 'couples'] as const) {
    const cards = getMeetingCoachingCards(audience)
    assert.deepEqual(cards.map(card => card.id), ['introduce', 'begin', 'conversation', 'wrap'])
    assert.match(cards[0].title, /별명/)
    assert.match(cards[0].note, /실명 대신 별명/)
    const impression = cards[2]
    assert.match(impression.title, /원한다면/)
    assert.match(impression.action, /대화.*행동/)
    assert.match(impression.example, /말을 끝까지 들어/)
    assert.match(impression.note, /말하는 사람도 듣는 사람도 원할 때만/)
    assert.match(impression.note, /외모 평가·점수·순위·누군가를 고르는 활동은 하지 않아요/)
    assert.match(impression.note, /입력받거나 저장하지 않아요/)
  }
})

test('activity-neutral scenes do not invent a fixed program or couple partner exchange', () => {
  const unknown = getMeetingCoachingCards('singles', 'unknown')
  assert.match(unknown[1].action, /활동/)
  assert.doesNotMatch(JSON.stringify(unknown), /달무티|게임 규칙|오후|다섯 번/)
  assert.match(getMeetingCoachingCards('singles', 'board_game')[1].action, /규칙/)
  const couples = getMeetingCoachingCards('couples')
  assert.ok(couples.every(card => card.illustration === '/images/match/couple-comic-20260915.webp'))
  assert.doesNotMatch(JSON.stringify(couples), /파트너 교체|호감 투표|연락처 교환/)
})

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildDailyCardSubmissionText,
  countCompletedDailyCardItems,
  createDailyCardDraftFromSubmissionText,
  createEmptyDailyCardDraft,
  DAILY_CARD_FIELDS,
  DEBATE_CARD_PROMPTS,
  encodeDailyCardDebateAnswers,
  encodeDailyCardSongs,
  REQUIRED_SONG_COUNT,
} from '../../lib/matching/daily-card-authoring'

test('daily card authoring starts with six focused item fields including debate choice', () => {
  const draft = createEmptyDailyCardDraft()

  assert.equal(DAILY_CARD_FIELDS.length, 6)
  assert.equal(countCompletedDailyCardItems(draft), 0)
})

test('daily card authoring includes a multi-question internet debate card', () => {
  const debateField = DAILY_CARD_FIELDS.find((field) => field.id === ('debate' as string))

  assert.ok(debateField)
  assert.equal(debateField.title, '인터넷 논쟁 카드')
  assert.equal(debateField.input, 'multi_choice')
  assert.equal(DEBATE_CARD_PROMPTS.length, 4)
  assert.equal(debateField.debatePrompts?.length, DEBATE_CARD_PROMPTS.length)
})

test('daily card authoring counts debate as complete only after all debate questions are answered', () => {
  const draft = createEmptyDailyCardDraft()
  draft.debate = encodeDailyCardDebateAnswers({
    tangsuyuk: 'A. 찍먹 - 바삭함 우선',
    mintChocolate: 'A. 가능 - 상쾌한 맛',
  })

  assert.equal(countCompletedDailyCardItems(draft), 0)

  draft.debate = encodeDailyCardDebateAnswers({
    tangsuyuk: 'A. 찍먹 - 바삭함 우선',
    mintChocolate: 'A. 가능 - 상쾌한 맛',
    noodles: 'B. 짬뽕 - 얼큰한 국물',
    naengmyeon: 'A. 물냉 - 시원한 육수',
  })

  assert.equal(countCompletedDailyCardItems(draft), 1)
})

test('daily card authoring serializes multiple debate choices', () => {
  const draft = createEmptyDailyCardDraft()
  draft.debate = encodeDailyCardDebateAnswers({
    tangsuyuk: 'A. 찍먹 - 바삭함 우선',
    mintChocolate: 'B. 반민초 - 치약맛은 어려움',
    noodles: 'B. 짬뽕 - 얼큰한 국물',
    naengmyeon: 'A. 물냉 - 시원한 육수',
  })

  assert.equal(
    buildDailyCardSubmissionText(draft),
    '[인터넷 논쟁 카드]\n탕수육 소스: A. 찍먹 - 바삭함 우선\n민트초코: B. 반민초 - 치약맛은 어려움\n중식 메뉴: B. 짬뽕 - 얼큰한 국물\n냉면 취향: A. 물냉 - 시원한 육수',
  )
})

test('daily card authoring counts completed item fields', () => {
  const draft = createEmptyDailyCardDraft()
  draft.songs = encodeDailyCardSongs(['Ditto - NewJeans', '주저하는 연인들을 위해 - 잔나비', 'I Like Me Better - Lauv'])
  draft.food = '톤쇼우'
  draft.question = '어바웃타임 - 다시 보고 싶을 정도로 따뜻했어요.'
  draft.conversation = '차분한 질문이 좋아요.'

  assert.equal(countCompletedDailyCardItems(draft), 4)
})

test('daily card authoring requires three songs for the song card', () => {
  const draft = createEmptyDailyCardDraft()
  draft.songs = encodeDailyCardSongs(['Ditto - NewJeans', '주저하는 연인들을 위해 - 잔나비'])

  assert.equal(REQUIRED_SONG_COUNT, 3)
  assert.equal(countCompletedDailyCardItems(draft), 0)

  draft.songs = encodeDailyCardSongs(['Ditto - NewJeans', '주저하는 연인들을 위해 - 잔나비', 'I Like Me Better - Lauv'])

  assert.equal(countCompletedDailyCardItems(draft), 1)
})

test('daily card authoring serializes only written items for the existing API payload', () => {
  const draft = createEmptyDailyCardDraft()
  draft.songs = encodeDailyCardSongs(['Ditto - NewJeans', '주저하는 연인들을 위해 - 잔나비', 'I Like Me Better - Lauv'])
  draft.conversation = '차분한 질문이 좋아요.'

  assert.equal(
    buildDailyCardSubmissionText(draft),
    '[좋아하는 노래 3곡]\n[song:1] Ditto - NewJeans\n[song:2] 주저하는 연인들을 위해 - 잔나비\n[song:3] I Like Me Better - Lauv\n\n[대화 스타일]\n차분한 질문이 좋아요.',
  )
})

test('daily card authoring restores structured submissions back into item fields', () => {
  const draft = createDailyCardDraftFromSubmissionText(
    '[음식 취향]\n매운 음식 좋아함\n\n[만남 전 질문]\n처음 만나면 어떤 질문이 편해요?',
  )

  assert.equal(draft.food, '매운 음식 좋아함')
  assert.equal(draft.question, '처음 만나면 어떤 질문이 편해요?')
  assert.equal(countCompletedDailyCardItems(draft), 2)
})

test('daily card authoring preserves legacy single text submissions', () => {
  const draft = createDailyCardDraftFromSubmissionText('첫 만남 전에 좋아하는 노래를 공유해요.')

  assert.equal(draft.question, '첫 만남 전에 좋아하는 노래를 공유해요.')
  assert.equal(countCompletedDailyCardItems(draft), 1)
})

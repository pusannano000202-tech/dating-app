export type DailyCardFieldId =
  | 'songs'
  | 'food'
  | 'weekend'
  | 'conversation'
  | 'question'
  | 'debate'

export interface DailyCardChoice {
  value: string
  label: string
  title: string
  description: string
}

export interface DailyCardDebatePrompt {
  id: string
  title: string
  question: string
  choices: DailyCardChoice[]
}

export interface DailyCardField {
  id: DailyCardFieldId
  title: string
  helper: string
  placeholder: string
  input: 'textarea' | 'multi_choice'
  choices?: DailyCardChoice[]
  debatePrompts?: DailyCardDebatePrompt[]
}

export type DailyCardDraft = Record<DailyCardFieldId, string>

export const REQUIRED_SONG_COUNT = 3

export const DEBATE_CARD_PROMPTS: DailyCardDebatePrompt[] = [
  {
    id: 'tangsuyuk',
    title: '탕수육 소스',
    question: '탕수육은 어떻게 먹는 쪽이에요?',
    choices: [
      {
        value: 'A. 찍먹 - 바삭함 우선',
        label: 'A',
        title: '찍먹',
        description: '바삭함을 지키는 쪽',
      },
      {
        value: 'B. 부먹 - 소스까지 한입',
        label: 'B',
        title: '부먹',
        description: '소스가 스며든 맛을 좋아하는 쪽',
      },
    ],
  },
  {
    id: 'mintChocolate',
    title: '민트초코',
    question: '민트초코는 가능해요?',
    choices: [
      {
        value: 'A. 가능 - 상쾌한 맛',
        label: 'A',
        title: '민초 가능',
        description: '상쾌하고 깔끔해서 좋음',
      },
      {
        value: 'B. 반민초 - 치약맛은 어려움',
        label: 'B',
        title: '반민초',
        description: '치약맛 느낌이라 어려움',
      },
    ],
  },
  {
    id: 'noodles',
    title: '중식 메뉴',
    question: '중국집 첫 선택은?',
    choices: [
      {
        value: 'A. 짜장 - 달콤짭짤한 기본',
        label: 'A',
        title: '짜장',
        description: '달콤짭짤한 기본 메뉴',
      },
      {
        value: 'B. 짬뽕 - 얼큰한 국물',
        label: 'B',
        title: '짬뽕',
        description: '얼큰하고 시원한 국물',
      },
    ],
  },
  {
    id: 'naengmyeon',
    title: '냉면 취향',
    question: '냉면은 어느 쪽이에요?',
    choices: [
      {
        value: 'A. 물냉 - 시원한 육수',
        label: 'A',
        title: '물냉',
        description: '시원한 육수의 깔끔함',
      },
      {
        value: 'B. 비냉 - 매콤달콤 양념',
        label: 'B',
        title: '비냉',
        description: '매콤달콤한 양념의 감칠맛',
      },
    ],
  },
]

export const DAILY_CARD_FIELDS: DailyCardField[] = [
  {
    id: 'songs',
    title: '좋아하는 노래 3곡',
    helper: '만남 전 분위기를 가볍게 여는 카드',
    placeholder: '예: NewJeans - Ditto, Lauv - I Like Me Better, 잔나비 - 주저하는 연인들을 위해',
    input: 'textarea',
  },
  {
    id: 'food',
    title: '내가 좋아하는 음식점 1곳',
    helper: '큰 범주 말고, 진짜 좋아하는 가게 하나를 알려주는 카드',
    placeholder: '',
    input: 'textarea',
  },
  {
    id: 'weekend',
    title: '주말/시간 취향',
    helper: '만남 텐션과 활동 스타일을 알려주는 카드',
    placeholder: '예: 토요일 낮 카페, 산책, 조용한 술자리를 좋아해요.',
    input: 'textarea',
  },
  {
    id: 'conversation',
    title: '대화 스타일',
    helper: '처음 만났을 때 편한 대화 방식을 알려주는 카드',
    placeholder: '예: 장난 섞인 티키타카보다 차분하게 물어봐 주는 게 좋아요.',
    input: 'textarea',
  },
  {
    id: 'question',
    title: '인상 깊게 본 영화 1개',
    helper: '취향과 대화 분위기를 동시에 보여주는 카드',
    placeholder: '예: 어바웃타임 - 다시 보고 싶을 정도로 따뜻했어요.',
    input: 'textarea',
  },
  {
    id: 'debate',
    title: '인터넷 논쟁 카드',
    helper: '상대 그룹과 가볍게 비교해볼 수 있는 A/B 선택 묶음',
    placeholder: '',
    input: 'multi_choice',
    debatePrompts: DEBATE_CARD_PROMPTS,
  },
]

const DAILY_CARD_FIELD_LEGACY_TITLES: Partial<Record<DailyCardFieldId, string[]>> = {
  food: ['음식 취향'],
  question: ['만남 전 질문'],
}

export function createEmptyDailyCardDraft(): DailyCardDraft {
  return DAILY_CARD_FIELDS.reduce((draft, field) => {
    draft[field.id] = ''
    return draft
  }, {} as DailyCardDraft)
}

export function countCompletedDailyCardItems(draft: DailyCardDraft): number {
  return DAILY_CARD_FIELDS.filter((field) => {
    if (field.id === 'songs') {
      return isDailyCardSongsComplete(draft.songs)
    }

    if (field.id === 'debate') {
      return countCompletedDailyCardDebateAnswers(draft.debate) >= DEBATE_CARD_PROMPTS.length
    }

    return draft[field.id].trim().length > 0
  }).length
}

export function encodeDailyCardSongs(songs: string[]): string {
  return songs
    .slice(0, REQUIRED_SONG_COUNT)
    .map((song, index) => `[song:${index + 1}] ${song.trim()}`)
    .filter((line) => !line.endsWith('] '))
    .join('\n')
}

export function decodeDailyCardSongs(value: string | null | undefined): string[] {
  const source = value ?? ''
  const slots = Array.from({ length: REQUIRED_SONG_COUNT }, () => '')

  for (let index = 0; index < REQUIRED_SONG_COUNT; index += 1) {
    const marker = `[song:${index + 1}]`
    const start = source.indexOf(marker)
    if (start < 0) continue
    const valueStart = start + marker.length
    const nextMarkers = Array.from({ length: REQUIRED_SONG_COUNT }, (_, nextIndex) => {
      if (nextIndex === index) return -1
      return source.indexOf(`[song:${nextIndex + 1}]`, valueStart)
    })
      .filter((candidate) => candidate >= 0)
      .sort((a, b) => a - b)

    slots[index] = source.slice(valueStart, nextMarkers[0] ?? undefined).trim()
  }

  if (!source.includes('[song:') && source.trim()) {
    const legacySongs = source
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, REQUIRED_SONG_COUNT)

    legacySongs.forEach((song, index) => {
      slots[index] = song
    })
  }

  return slots
}

export function countCompletedDailyCardSongs(value: string | null | undefined): number {
  return decodeDailyCardSongs(value).filter(Boolean).length
}

export function isDailyCardSongsComplete(value: string | null | undefined): boolean {
  const source = value?.trim() ?? ''
  if (source && !source.includes('[song:')) return true
  return countCompletedDailyCardSongs(source) >= REQUIRED_SONG_COUNT
}

export function buildDailyCardSubmissionText(draft: DailyCardDraft): string {
  return DAILY_CARD_FIELDS
    .map((field) => {
      const value = draft[field.id].trim()
      return value ? `[${field.title}]\n${value}` : null
    })
    .filter((item): item is string => item !== null)
    .join('\n\n')
}

export function encodeDailyCardDebateAnswers(answers: Record<string, string>): string {
  return DEBATE_CARD_PROMPTS
    .map((prompt) => {
      const answer = answers[prompt.id]?.trim()
      return answer ? `${prompt.title}: ${answer}` : null
    })
    .filter((line): line is string => line !== null)
    .join('\n')
}

export function decodeDailyCardDebateAnswers(value: string | null | undefined): Record<string, string> {
  const source = value ?? ''
  return DEBATE_CARD_PROMPTS.reduce((answers, prompt) => {
    const matchedChoice = prompt.choices.find((choice) => source.includes(choice.value))
    if (matchedChoice) {
      answers[prompt.id] = matchedChoice.value
    }
    return answers
  }, {} as Record<string, string>)
}

export function countCompletedDailyCardDebateAnswers(value: string | null | undefined): number {
  return Object.keys(decodeDailyCardDebateAnswers(value)).length
}

export function createDailyCardDraftFromSubmissionText(contentText: string | null | undefined): DailyCardDraft {
  const draft = createEmptyDailyCardDraft()
  const source = contentText?.trim()
  if (!source) return draft

  let matchedStructuredField = false
  for (let index = 0; index < DAILY_CARD_FIELDS.length; index += 1) {
    const field = DAILY_CARD_FIELDS[index]
    const possibleTitles = [field.title, ...(DAILY_CARD_FIELD_LEGACY_TITLES[field.id] ?? [])]
    const startMatch = possibleTitles
      .map((title) => {
        const marker = `[${title}]`
        return { marker, startIndex: source.indexOf(marker) }
      })
      .filter((match) => match.startIndex >= 0)
      .sort((a, b) => a.startIndex - b.startIndex)[0]

    if (!startMatch) continue

    const valueStart = startMatch.startIndex + startMatch.marker.length
    const nextIndex = DAILY_CARD_FIELDS
      .filter((candidate) => candidate.id !== field.id)
      .flatMap((candidate) => [candidate.title, ...(DAILY_CARD_FIELD_LEGACY_TITLES[candidate.id] ?? [])])
      .map((title) => source.indexOf(`[${title}]`, valueStart))
      .filter((candidateIndex) => candidateIndex >= 0)
      .sort((a, b) => a - b)[0] ?? -1
    const value = source.slice(valueStart, nextIndex >= 0 ? nextIndex : undefined).trim()
    draft[field.id] = value
    matchedStructuredField = true
  }

  if (!matchedStructuredField) {
    draft.question = source
  }

  return draft
}

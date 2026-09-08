export const BIG5_SURVEY_VERSION = 'big5-short-v1' as const

export const BIG5_TRAIT_KEYS = [
  'openness',
  'conscientiousness',
  'extraversion',
  'agreeableness',
  'neuroticism',
] as const

export type Big5TraitKey = typeof BIG5_TRAIT_KEYS[number]
export type Big5SurveyAnswers = Record<Big5TraitKey, [number, number]>
export type Big5SurveyScores = Record<Big5TraitKey, number>

export const BIG5_SURVEY_TRAITS: ReadonlyArray<{
  key: Big5TraitKey
  label: string
  questions: readonly [string, string]
}> = [
  {
    key: 'openness',
    label: '개방성',
    questions: ['새로운 취미나 경험을 즐겨 찾는 편이야?', '창의적이거나 예술적인 것에 관심이 많아?'],
  },
  {
    key: 'conscientiousness',
    label: '성실성',
    questions: ['계획을 세우고 체계적으로 일하는 편이야?', '맡은 일은 끝까지 마무리하고 마는 편이야?'],
  },
  {
    key: 'extraversion',
    label: '외향성',
    questions: ['사람들과 어울릴 때 에너지가 충전되는 편이야?', '모임에서 먼저 말 걸고 분위기 만드는 편이야?'],
  },
  {
    key: 'agreeableness',
    label: '친화성',
    questions: ['다른 사람 감정에 잘 공감하는 편이야?', '갈등보다는 타협과 배려를 선호해?'],
  },
  {
    key: 'neuroticism',
    label: '감수성',
    questions: ['스트레스나 걱정을 자주 느끼는 편이야?', '감정 기복이 있거나 예민한 편이야?'],
  },
] as const

export function parseBig5SurveyAnswers(input: unknown): Big5SurveyAnswers | null {
  if (!isRecord(input)) return null

  const parsed = {} as Big5SurveyAnswers
  for (const key of BIG5_TRAIT_KEYS) {
    const value = input[key]
    if (!Array.isArray(value) || value.length !== 2 || !value.every(isScaleAnswer)) return null
    parsed[key] = [value[0], value[1]]
  }
  return parsed
}

export function scoreBig5Survey(answers: Big5SurveyAnswers): Big5SurveyScores {
  const scores = {} as Big5SurveyScores
  for (const key of BIG5_TRAIT_KEYS) {
    const [first, second] = answers[key]
    scores[key] = Math.round((((first + second) / 2 - 1) / 4) * 100) / 100
  }
  return scores
}

function isScaleAnswer(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 5
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

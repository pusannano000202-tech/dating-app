import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  BIG5_SURVEY_VERSION,
  parseBig5SurveyAnswers,
  scoreBig5Survey,
} from '../../lib/profile/big5-survey-contract'

test('Big5 mobile survey accepts exactly two bounded answers for every trait', () => {
  const answers = {
    openness: [1, 5],
    conscientiousness: [2, 4],
    extraversion: [3, 3],
    agreeableness: [4, 4],
    neuroticism: [5, 1],
  }

  const parsed = parseBig5SurveyAnswers(answers)
  assert.ok(parsed)
  assert.deepEqual(scoreBig5Survey(parsed), {
    openness: 0.5,
    conscientiousness: 0.5,
    extraversion: 0.5,
    agreeableness: 0.75,
    neuroticism: 0.5,
  })
  assert.equal(BIG5_SURVEY_VERSION, 'big5-short-v1')
})

test('Big5 mobile survey rejects missing, extra, and out-of-range answers', () => {
  const valid = {
    openness: [1, 5],
    conscientiousness: [2, 4],
    extraversion: [3, 3],
    agreeableness: [4, 4],
    neuroticism: [5, 1],
  }

  assert.equal(parseBig5SurveyAnswers({ ...valid, openness: [1] }), null)
  assert.equal(parseBig5SurveyAnswers({ ...valid, openness: [0, 5] }), null)
  assert.equal(parseBig5SurveyAnswers({ ...valid, openness: [1, 5, 3] }), null)
  const { neuroticism: _removed, ...missing } = valid
  assert.equal(parseBig5SurveyAnswers(missing), null)
})

test('mobile survey route calculates server-side and updates only the signed-in profile', () => {
  const source = readFileSync(join(process.cwd(), 'app/api/profile/survey/route.ts'), 'utf8')

  assert.match(source, /createSupabaseRequestClient\(request\)/)
  assert.match(source, /parseBig5SurveyAnswers/)
  assert.match(source, /scoreBig5Survey/)
  assert.match(source, /\.eq\('user_id', user\.id\)/)
  assert.doesNotMatch(source, /createSupabaseAdminClient/)
})

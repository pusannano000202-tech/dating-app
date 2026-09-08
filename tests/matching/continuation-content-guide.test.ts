import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import {
  CONTINUATION_CONTENT_GUIDE_ASSET_ALLOWLIST,
  CONTINUATION_CONTENT_GUIDE,
  getContinuationGuideDayDuration,
  getContinuationContentGuideForDay,
  resolveContinuationGuideArtworks,
  resolveContinuationGuideArtwork,
} from '../../lib/matching/continuation-content-guide'

test('approved Day 1 through Day 5 guide catalog preserves all thirty scenes in order', () => {
  assert.deepEqual(
    CONTINUATION_CONTENT_GUIDE.map((scene) => scene.id),
    [
      'day1_introduction', 'day1_dalmuti_rules', 'day1_dalmuti_play', 'day1_game_vote',
      'day1_selected_game', 'day1_department_guess', 'day1_one_line_impression', 'day1_photo_and_end',
      'day2_arrival', 'day2_rotation_round_1', 'day2_rotation_round_2', 'day2_rotation_round_3', 'day2_wrap_and_end',
      'day3_arrival', 'day3_dinner', 'day3_walk_to_bowling', 'day3_bowling_practice', 'day3_bowling_main', 'day3_bowling_result', 'day3_photo_and_end',
      'day4_arrival_and_order', 'day4_same_answer_game', 'day4_free_conversation', 'day4_photo_and_end',
      'day5_arrival', 'day5_night_walk', 'day5_shared_finale', 'day5_indoor_rest', 'day5_one_line_memory', 'day5_photo_and_safe_return',
    ],
  )
  assert.deepEqual([1, 2, 3, 4, 5].map((day) => getContinuationContentGuideForDay(day).length), [8, 5, 7, 4, 6])
  assert.equal(getContinuationContentGuideForDay(6).length, 0)
})

test('all thirty approved scenes retain their source offset, duration, and day totals', () => {
  assert.deepEqual(
    CONTINUATION_CONTENT_GUIDE.map((scene) => [scene.offsetMinutes, scene.durationMinutes]),
    [
      [0, 15], [15, 10], [25, 55], [80, 5], [85, 45], [130, 5], [135, 10], [145, 5],
      [0, 15], [15, 30], [45, 30], [75, 30], [105, 15],
      [0, 15], [15, 55], [70, 10], [80, 20], [100, 65], [165, 5], [170, 10],
      [0, 30], [30, 20], [50, 55], [105, 15],
      [0, 15], [15, 20], [35, 25], [60, 20], [80, 25], [105, 15],
    ],
  )
  assert.deepEqual([1, 2, 3, 4, 5].map(getContinuationGuideDayDuration), [150, 120, 180, 120, 120])
})

test('the learning guide does not claim attendance, completion, participants, or a Day 6', () => {
  const copy = CONTINUATION_CONTENT_GUIDE.map((scene) => `${scene.title}\n${scene.body}\n${scene.nextAction}`).join('\n')
  const component = fs.readFileSync(path.join(process.cwd(), 'components/matching/ContinuationContentGuide.tsx'), 'utf8')
  assert.match(component, /전체 일정 정보는 학습용이며 실제 확정 일정은 최신 진행 화면을 확인해 주세요/)
  assert.match(copy, /사진은 선택/)
  assert.equal(CONTINUATION_CONTENT_GUIDE.some((scene) => Number(scene.day) === 6), false)
  assert.doesNotMatch(copy, /완료됐어요|출석이 확인됐어요|참가자가 배정됐어요|비밀 미션|역할 배정|자동 친구|실제 조합은 서버 진행 정보가 정합니다/)
})

test('original game keys map only to the current UI keys and optional artwork never invents a selection', () => {
  const selectedGame = CONTINUATION_CONTENT_GUIDE.find((scene) => scene.id === 'day1_selected_game')
  assert.ok(selectedGame)
  assert.deepEqual(selectedGame.gameKeyMap, { dalmuti: 'dalmuti', halli_galli: 'halligalli', one_card: 'one-card' })
  assert.equal(resolveContinuationGuideArtwork(selectedGame), selectedGame.artwork)
  assert.match(resolveContinuationGuideArtwork(selectedGame, 'halligalli').src, /day1-selected-halli-galli\.webp$/)
  assert.match(resolveContinuationGuideArtwork(selectedGame, 'one-card').src, /day1-selected-one-card\.webp$/)
})

test('Day 2 resolves roster-specific pictures without pretending preview has an actual roster', () => {
  const roundOne = CONTINUATION_CONTENT_GUIDE.find((scene) => scene.id === 'day2_rotation_round_1')
  const roundTwo = CONTINUATION_CONTENT_GUIDE.find((scene) => scene.id === 'day2_rotation_round_2')
  const roundThree = CONTINUATION_CONTENT_GUIDE.find((scene) => scene.id === 'day2_rotation_round_3')
  assert.ok(roundOne && roundTwo && roundThree)
  assert.match(resolveContinuationGuideArtworks(roundOne, { rosterSize: 5 })[0].src, /day2-rotation-five-person\.webp$/)
  assert.deepEqual(
    resolveContinuationGuideArtworks(roundTwo, { rosterSize: 5 }).map((artwork) => artwork.src),
    expectPaths('day2-phase-common-point-v2.webp', 'day2-phase-common-point-trio-v1.webp'),
  )
  assert.deepEqual(
    resolveContinuationGuideArtworks(roundThree, { rosterSize: 5 }).map((artwork) => artwork.src),
    expectPaths('day2-phase-roulette-v2.webp', 'day2-phase-roulette-trio-v1.webp'),
  )
  assert.match(resolveContinuationGuideArtworks(roundOne, { rosterSize: 6 })[0].alt, /세 쌍/)
  const previewArtworks = [roundOne, roundTwo, roundThree].map((scene) => resolveContinuationGuideArtworks(scene, { mode: 'preview' })[0])
  assert.equal(new Set(previewArtworks.map((artwork) => artwork.src)).size, 3, 'preview keeps distinct round illustrations')
  assert.ok(previewArtworks.every((artwork) => artwork.alt.includes('6명 구성 예시')))
  assert.equal(
    [
      'day2-rotation-five-person.webp',
      'day2-phase-common-point-v2.webp',
      'day2-phase-common-point-trio-v1.webp',
      'day2-phase-roulette-v2.webp',
      'day2-phase-roulette-trio-v1.webp',
    ].every((file) => (CONTINUATION_CONTENT_GUIDE_ASSET_ALLOWLIST as readonly string[]).includes(`scene-guides/${file}`)),
    true,
  )
})

test('the occurrence view places the guide before existing controls and keeps Day 2 questions optional', () => {
  const ui = fs.readFileSync(path.join(process.cwd(), 'components/matching/OccurrenceContentExperience.tsx'), 'utf8')
  const day2 = fs.readFileSync(path.join(process.cwd(), 'components/matching/Day2ContinuationRuntime.tsx'), 'utf8')
  assert.match(ui, /ContinuationContentGuide/)
  assert.ok(ui.indexOf('<ContinuationContentGuide') < ui.indexOf('{content.program_day === 1 ? <Day1PrivateGameRuntime'))
  assert.match(ui, /mode="occurrence"/)
  assert.match(ui, /rosterSize=\{continuationGuideRosterSize\(content\)\}/)
  assert.match(day2, /<details[\s\S]*대화가 막힐 때 우리 조 질문 열기/)
  assert.match(day2, /act\('advance_group_prompt'/)
  const detailsEnd = day2.indexOf('</details>')
  assert.ok(day2.indexOf("act('advance_group_prompt'") < detailsEnd, 'changing optional questions must stay inside the collapsed panel')
})

test('occurrence guide is collapsed and labels examples separately from actual progress', () => {
  const component = fs.readFileSync(path.join(process.cwd(), 'components/matching/ContinuationContentGuide.tsx'), 'utf8')
  assert.match(component, /mode = 'preview'/)
  assert.match(component, /<details[\s\S]*활동 안내 보기/)
  assert.match(component, /실제 진행은 아래 진행 영역에서 확인하고, 안내 보기는 저장되지 않아요/)
  assert.match(component, /예시 순서/)
  assert.equal((component.match(/aria-live="polite"/g) ?? []).length, 1)
})

function expectPaths(...files: string[]) {
  return files.map((file) => `/images/match/five-meeting/scene-guides/${file}`)
}

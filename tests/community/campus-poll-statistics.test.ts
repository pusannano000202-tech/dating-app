import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

function readSource(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8')
}

test('campus poll statistics stays opt-in from home and community', () => {
  const homePage = readSource('app/page.tsx')
  const communityPage = readSource('app/community/page.tsx')
  const componentPath = 'components/community/CampusPollStatisticsPreview.tsx'
  const component = readSource(componentPath)

  assert.equal(existsSync(join(ROOT, componentPath)), true)

  assert.match(homePage, /우리학교 취향보기/)
  assert.match(homePage, /다른학교 취향보기/)
  assert.match(homePage, /\/community\?focus=school/)
  assert.match(homePage, /\/community\?focus=university/)

  assert.match(communityPage, /getPollFocus/)
  assert.match(communityPage, /pollFocus \?/)
  assert.match(communityPage, /보고 싶은 통계만 열기/)
  assert.match(communityPage, /CampusPollStatisticsPreview/)

  assert.match(component, /탕수육은 부먹 vs 찍먹/)
  assert.match(component, /학교나 학과를 검색해보세요/)
  assert.match(component, /내 답변.*저장됨/)
  assert.match(component, /부경대 컴퓨터공학부/)
  assert.match(component, /동아대 컴퓨터공학부/)
  assert.match(component, /아직 표본이 부족해요/)
  assert.match(component, /선택한 통계 비교/)
  assert.match(component, /이번 주 학과 랭킹/)
  assert.match(component, /외모, 인기, 성적/)
  assert.match(component, /MAX_COMPARE_SCOPES = 3/)
  assert.doesNotMatch(component, /인기 많은 학과|외모 좋은 학과|만나고 싶은 학과/)
})

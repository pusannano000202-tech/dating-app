import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

function readSource(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8')
}

test('campus poll statistics lives inside the community hub, separate from meetups', () => {
  const homePage = readSource('app/page.tsx')
  const bottomNav = readSource('components/navigation/AppBottomNav.tsx')
  const communityPage = readSource('app/community/page.tsx')
  const meetupsPage = readSource('app/meetups/page.tsx')
  const statsPage = readSource('app/community/stats/page.tsx')
  const explorePage = readSource('app/community/stats/explore/page.tsx')
  const rankingsPage = readSource('app/community/rankings/page.tsx')
  const componentPath = 'components/community/CampusPollStatisticsPreview.tsx'

  assert.equal(existsSync(join(ROOT, componentPath)), true)
  assert.equal(existsSync(join(ROOT, 'app/meetups/page.tsx')), true)
  assert.equal(existsSync(join(ROOT, 'app/community/stats/explore/page.tsx')), true)

  assert.match(homePage, /우리학교 취향보기/)
  assert.match(homePage, /다른학교 취향보기/)
  assert.match(homePage, /\/community\?focus=school/)
  assert.match(homePage, /\/community\?focus=university/)
  assert.match(homePage, /href="\/meetups"/)

  assert.match(bottomNav, /href: '\/meetups', label: '모임'/)
  assert.match(bottomNav, /href: '\/community', label: '커뮤니티'/)
  assert.match(bottomNav, /grid-cols-5/)

  assert.match(communityPage, /커뮤니티 허브/)
  assert.match(communityPage, /기능 방/)
  assert.match(communityPage, /communityRooms\.map/)
  assert.match(communityPage, /href="\/community\/stats\/explore/)
  assert.match(communityPage, /href="\/community\/manners"/)
  assert.match(communityPage, /href="\/meetups"/)
  assert.doesNotMatch(communityPage, /CampusPollStatisticsPreview/)
  assert.doesNotMatch(communityPage, /CampusCommunityCard/)
  assert.doesNotMatch(communityPage, /모임 둘러보기/)

  assert.match(statsPage, /학교나 학과 바로 검색/)
  assert.match(explorePage, /선택한 통계 비교/)
  assert.match(explorePage, /아직 표본이 부족해요/)
  assert.match(explorePage, /비교는 3개까지만/)
  assert.match(rankingsPage, /외모나 인기도 기반 랭킹은 만들지 않아요/)
  assert.doesNotMatch(rankingsPage, /인기 많은 학과|외모 좋은 학과|만나고 싶은 학과/)

  assert.match(meetupsPage, /CampusCommunityCard/)
  assert.match(meetupsPage, /모임 둘러보기/)
  assert.match(meetupsPage, /밥약/)
  assert.match(meetupsPage, /카공/)
  assert.match(meetupsPage, /href="\/community"/)
})

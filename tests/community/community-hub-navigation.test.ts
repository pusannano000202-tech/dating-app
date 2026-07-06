import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

function readSource(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8')
}

function assertFile(path: string): string {
  assert.equal(existsSync(join(ROOT, path)), true, `${path} should exist`)
  return readSource(path)
}

test('community is a hub with room routes instead of one long vertical feed', () => {
  const home = assertFile('app/community/page.tsx')
  const meetups = assertFile('app/meetups/page.tsx')
  const data = assertFile('lib/community/mock-data.ts')

  const routes = [
    'app/community/debates/page.tsx',
    'app/community/debates/[pollId]/page.tsx',
    'app/community/stats/page.tsx',
    'app/community/stats/explore/page.tsx',
    'app/community/rankings/page.tsx',
    'app/community/manners/page.tsx',
    'app/community/reviews/page.tsx',
    'app/community/missions/page.tsx',
    'app/community/safety/page.tsx',
  ]

  for (const route of routes) {
    assertFile(route)
  }

  assert.match(home, /커뮤니티 허브/)
  assert.match(home, /오늘 할 일/)
  assert.match(home, /기능 방/)
  assert.match(home, /최근 본 것/)
  assert.match(home, /communityRooms\.map/)
  assert.match(data, /href: '\/community\/debates'/)
  assert.match(data, /href: '\/community\/stats'/)
  assert.match(data, /href: '\/community\/rankings'/)
  assert.match(data, /href: '\/community\/manners'/)
  assert.match(data, /href: '\/community\/missions'/)
  assert.match(data, /href: '\/community\/safety'/)
  assert.match(home, /href="\/meetups"/)
  assert.doesNotMatch(home, /CampusPollStatisticsPreview/)
  assert.doesNotMatch(home, /selectedScopes\.map|visibleScopes\.map/)

  assert.match(meetups, /모임 둘러보기/)
  assert.match(meetups, /밥약/)
  assert.match(meetups, /카공/)
  assert.match(meetups, /href="\/community"/)

  assert.match(data, /communityRooms/)
  assert.match(data, /todayDebate/)
  assert.match(data, /statsScopes/)
  assert.match(data, /rankingCards/)
  assert.match(data, /mannerSummary/)
  assert.match(data, /missions/)
})

test('community detail rooms have clear entry and exit paths', () => {
  const debates = assertFile('app/community/debates/page.tsx')
  const debateDetail = assertFile('app/community/debates/[pollId]/page.tsx')
  const stats = assertFile('app/community/stats/page.tsx')
  const explore = assertFile('app/community/stats/explore/page.tsx')
  const rankings = assertFile('app/community/rankings/page.tsx')
  const manners = assertFile('app/community/manners/page.tsx')
  const reviews = assertFile('app/community/reviews/page.tsx')
  const missions = assertFile('app/community/missions/page.tsx')

  for (const source of [debates, debateDetail, stats, explore, rankings, manners, reviews, missions]) {
    assert.match(source, /커뮤니티로/)
  }

  assert.match(debates, /오늘의 논쟁/)
  assert.match(debateDetail, /답하면 우리학교 결과가 열려요|내 답변/)
  assert.match(debateDetail, /다른 학교 비교/)
  assert.match(stats, /학교나 학과 바로 검색/)
  assert.match(explore, /비교는 3개까지만/)
  assert.match(rankings, /취향|참여|매너|미션/)
  assert.match(manners, /내 매너 상태/)
  assert.match(manners, /개인 매너 점수는 본인에게만/)
  assert.match(reviews, /선택형 태그/)
  assert.match(missions, /오늘의 캠퍼스 미션/)

  assert.doesNotMatch(rankings + manners + reviews, /인기 많은 학과|외모 좋은 학과|만나고 싶은 학과|매너 최악 학과/)
})

test('community mock backend exposes JSON without touching Supabase migrations', () => {
  const homeRoute = assertFile('app/api/community/home/route.ts')
  const pollsRoute = assertFile('app/api/community/polls/today/route.ts')
  const statsRoute = assertFile('app/api/community/stats/route.ts')
  const mannersRoute = assertFile('app/api/community/manners/summary/route.ts')

  for (const source of [homeRoute, pollsRoute, statsRoute, mannersRoute]) {
    assert.match(source, /NextResponse\.json/)
    assert.match(source, /@\/lib\/community\/mock-data/)
    assert.doesNotMatch(source, /supabase|createClient|from\(/)
  }
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const ROOT = process.cwd()

function readSource(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8')
}

test('Quantum is the master brand in the logo and app metadata', () => {
  const logo = readSource('components/BootingLogo.tsx')
  const layout = readSource('app/layout.tsx')

  assert.match(logo, />\s*Quantum\s*</)
  assert.doesNotMatch(logo, />\s*부팅\s*</)
  assert.match(layout, /title:\s*'Quantum/)
  assert.match(layout, /themeColor:\s*'#FFF9F6'/)
})

test('signed-in navigation always keeps the five product destinations', () => {
  const navigation = readSource('components/navigation/AppBottomNav.tsx')

  for (const label of ['홈', '매칭', '모임', '커뮤니티', '마이']) {
    assert.match(navigation, new RegExp(`label: '${label}'`))
  }
  assert.doesNotMatch(navigation, /coreTabs|previewTabs|isCommunityFeatureEnabled/)
})

test('home recommends direct active flows without duplicate match utility cards', () => {
  const home = readSource('app/page.tsx')

  assert.match(home, /QuantumHomeRecommendations/)
  assert.match(home, /QuantumHomeLead/)
  assert.doesNotMatch(home, /HomeTodayTaskCard/)
  assert.doesNotMatch(home, /title="매칭 현황"/)
  assert.doesNotMatch(home, /label="내 그룹 보기"/)

  const lead = readSource('components/home/QuantumHomeLead.tsx')
  assert.match(lead, /오늘, 아니면 편한 날에/)
  assert.match(lead, /href="\/tonight"/)
  assert.match(lead, /discovery=scheduled/)
  assert.doesNotMatch(lead, /성향|안 되는 시간|매칭 비중|사전 카드|3:3 · 준비/)

  const recommendations = readSource('components/home/QuantumHomeRecommendations.tsx')
  assert.match(recommendations, /\/community\/content/)
  assert.match(recommendations, /맛집 · MBTI · 배달 · 장소/)
  assert.match(recommendations, /우리 과 이름으로/)
  assert.match(recommendations, /home-playmaker-football.webp/)
  assert.doesNotMatch(recommendations, /mode=battle&category=donkatsu|부산대 돈까스 8강|바로 대결 시작/)
  assert.match(recommendations, /href="\/community\/department"/)
})

test('first basic information entry uses the conversational shell', () => {
  const page = readSource('app/profile/basic/page.tsx')
  const conversation = [
    readSource('components/profile/BasicInfoConversation.tsx'),
    readSource('components/profile/BasicInfoForm.tsx'),
  ].join('\n')

  assert.match(page, /BasicInfoConversation/)
  assert.match(conversation, /aria-label="가입 진행률"/)
  assert.match(conversation, /이전/)
  assert.match(conversation, /전체 보기/)
  assert.match(conversation, /가입 정보 저장하기/)
})

test('direct-entry routes consume the home recommendation contracts', () => {
  const campusEats = readSource('components/campus-eats/CampusEatsPilot.tsx')
  const meetups = readSource('app/meetups/page.tsx')

  assert.match(campusEats, /mode.*battle|battle.*mode/)
  assert.match(meetups, /MeetupHub/)
})

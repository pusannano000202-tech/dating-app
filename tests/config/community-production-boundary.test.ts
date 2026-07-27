import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { isCommunityFeatureEnabled } from '../../lib/community-feature'

const ROOT = process.cwd()

function readSource(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8')
}

test('public meetup actions use document navigation so auth redirects keep query parameters', () => {
  const meetups = readSource('app/meetups/page.tsx')

  assert.match(meetups, /<a[\s\S]*href=\{featuredAction\.href\}/)
  assert.match(meetups, /<a[\s\S]*key=\{action\.title\}[\s\S]*href=\{action\.href\}/)
})

test('community preview is development-only unless production explicitly enables it', () => {
  assert.equal(isCommunityFeatureEnabled({
    nodeEnv: 'development',
    communityEnabled: 'false',
  }), true)
  assert.equal(isCommunityFeatureEnabled({
    nodeEnv: 'production',
    communityEnabled: 'false',
  }), false)
  assert.equal(isCommunityFeatureEnabled({
    nodeEnv: 'production',
    communityEnabled: 'true',
  }), true)
})

test('production routes replace community mock content with a ready screen', () => {
  const community = readSource('app/community/page.tsx')
  const meetups = readSource('app/meetups/page.tsx')
  const boundary = readSource('components/community/CommunityComingSoon.tsx')

  assert.match(community, /if \(!isCommunityFeatureEnabled\(\)\)/)
  assert.match(community, /<CommunityComingSoon kind="community"/)
  assert.match(meetups, /if \(!communityEnabled\)/)
  assert.match(meetups, /<CommunityComingSoon kind="meetups"/)
  assert.match(boundary, /준비 중이에요/)
  assert.doesNotMatch(boundary, /프론트 미리보기|참여 완료|가짜 통계/)
})

test('signed-in navigation keeps community and meetup destinations stable', () => {
  const navigation = readSource('components/navigation/AppBottomNav.tsx')
  const envExample = readSource('.env.example')
  const localEnvExample = readSource('.env.local.example')

  assert.match(navigation, /href: '\/meetups', label: '모임'/)
  assert.match(navigation, /href: '\/community', label: '커뮤니티'/)
  assert.match(navigation, /gridTemplateColumns/)
  assert.match(navigation, /prefetch/)
  assert.doesNotMatch(navigation, /isCommunityFeatureEnabled|previewTabs|coreTabs/)
  const boundary = readSource('components/community/CommunityComingSoon.tsx')
  assert.match(boundary, /<a[\s\S]*href="\/match"/)
  assert.doesNotMatch(boundary, /from 'next\/link'/)
  assert.match(envExample, /NEXT_PUBLIC_COMMUNITY_ENABLED=false/)
  assert.match(localEnvExample, /NEXT_PUBLIC_COMMUNITY_ENABLED=false/)
})

test('community backend ownership remains blocked behind an explicit contract', () => {
  const contract = readSource('docs/engineering/COMMUNITY_INTERFACE_CONTRACT.md')

  assert.match(contract, /현재 상태: production 비활성/)
  assert.match(contract, /posts|게시글/)
  assert.match(contract, /polls|투표/)
  assert.match(contract, /RLS/)
  assert.match(contract, /사용자 승인/)
})

test('community preview exposes only real actions and labels unfinished rooms honestly', () => {
  const community = readSource('app/community/page.tsx')
  const meetups = readSource('app/meetups/page.tsx')

  assert.doesNotMatch(meetups, /일정 포함 모임 만들기|날짜와 방식까지/)
  assert.match(meetups, /같이 갈 친구 초대/)
  assert.match(meetups, /href: '\/friends'/)
  assert.doesNotMatch(community, /href: '\/community\?room=/)
  assert.match(community, /준비 중/)
})

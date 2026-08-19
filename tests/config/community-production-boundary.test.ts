import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { isCommunityFeatureEnabled } from '../../lib/community-feature'

const ROOT = process.cwd()

function readSource(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8')
}

test('public meetup actions use document navigation so auth redirects keep query parameters', () => {
  const meetups = readSource('components/meetups/MeetupHub.tsx')

  assert.match(meetups, /<a[\s\S]*href="\/meetups\/create"/)
  assert.match(meetups, /<a[\s\S]*href=\{category === 'all' \? '\/meetups\/create' : `\/meetups\/create\?category=\$\{category\}`\}/)
  assert.doesNotMatch(meetups, /import Link from 'next\/link'/)
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
  assert.match(meetups, /if \(!isCommunityFeatureEnabled\(\)\)/)
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

test('community backend ownership stays explicit while production remains gated', () => {
  const contract = readSource('docs/engineering/COMMUNITY_INTERFACE_CONTRACT.md')

  assert.match(contract, /production 비활성/)
  assert.match(contract, /activity_meetups/)
  assert.match(contract, /community_posts/)
  assert.match(contract, /작성자 UUID를 반환하지 않고/)
  assert.match(contract, /원격 DB에 적용되기 전/)
})

test('community and meetup previews expose real routes without fake participation counts', () => {
  const community = readSource('app/community/page.tsx')
  const meetups = readSource('app/meetups/page.tsx')
  const meetupHub = readSource('components/meetups/MeetupHub.tsx')
  const board = readSource('components/community/CommunityBoard.tsx')

  assert.match(meetups, /MeetupHub/)
  assert.match(meetupHub, /\/api\/meetups/)
  assert.match(meetupHub, /실제 모임 목록/)
  assert.match(community, /communityCategoryCatalog/)
  assert.match(board, /\/api\/community\/posts/)
  assert.doesNotMatch(meetupHub + board, /가짜 통계|mock 참여/i)
})

test('community uses horizontal categories, guided writing, and a seven day hot destination', () => {
  const community = readSource('app/community/page.tsx')
  const board = readSource('components/community/CommunityBoard.tsx')
  const catalog = readSource('lib/community/catalog.ts')

  assert.match(community, /href="\/community\/hot"/)
  assert.match(community, /overflow-x-auto/)
  assert.match(board, /guidedPrompts/)
  assert.match(board, /답변을 골라서|질문에 답하면/)
  assert.match(board, /showComposer/)
  assert.match(board, /글쓰기 열기/)
  assert.match(board, /게시글 먼저 보기/)
  assert.ok(board.indexOf('게시글 먼저 보기') < board.indexOf('<form'))
  assert.match(catalog, /만남 분위기/)
  assert.match(catalog, /가장 궁금한 점/)
})

test('meetup catalog includes racket sports and activity capacity recommendations', () => {
  const contracts = readSource('lib/community/contracts.ts')
  const catalog = readSource('lib/community/catalog.ts')
  const createForm = readSource('components/meetups/CreateMeetupForm.tsx')

  assert.match(contracts, /'badminton'/)
  assert.match(contracts, /'tennis'/)
  assert.match(contracts, /'gaming'/)
  assert.match(contracts, /'hiking'/)
  assert.match(catalog, /getMeetupCapacityRecommendation/)
  assert.match(catalog, /meetup-badminton\.webp/)
  assert.match(catalog, /meetup-tennis\.webp/)
  assert.match(catalog, /meetup-basketball\.webp/)
  assert.match(createForm, /getMeetupCapacityRecommendation/)
  assert.match(readSource('components/meetups/MeetupHub.tsx'), /MeetupIdeaCylinder/)
  assert.match(createForm, /권장 인원/)
  assert.match(catalog, /오늘 고점 뽑으러 가자/)
  assert.match(catalog, /금정산 같이 오르기/)
})

test('meetup discovery uses a photo cylinder and keeps study topics under the study database category', () => {
  const hub = readSource('components/meetups/MeetupHub.tsx')
  const cylinderPath = join(ROOT, 'components/meetups/MeetupIdeaCylinder.tsx')
  assert.ok(existsSync(cylinderPath), 'MeetupIdeaCylinder.tsx must exist')
  if (!existsSync(cylinderPath)) return
  const cylinder = readSource('components/meetups/MeetupIdeaCylinder.tsx')
  const catalog = readSource('lib/community/catalog.ts')

  assert.match(hub, /MeetupIdeaCylinder/)
  assert.match(cylinder, /data-layout="cylindrical-carousel"/)
  assert.match(cylinder, /perspective: '1200px'/)
  assert.match(cylinder, /rotateY\(/)
  assert.match(cylinder, /onPointerDown/)
  assert.match(cylinder, /ArrowLeft/)
  assert.match(cylinder, /ArrowRight/)
  assert.match(cylinder, /alt=\{idea\.imageAlt\}/)
  assert.match(catalog, /studyTopicGroups/)
  for (const topic of ['일반물리', '공학수학', 'OPIc', '영어회화', '한국사', '공모전']) {
    assert.match(catalog, new RegExp(topic))
  }
  assert.doesNotMatch(catalog, /category: 'physics'|category: 'opic'/)
})

test('meetup cylinder arrows stay outside the swipe capture surface and ideas lead to live meetup results', () => {
  const hub = readSource('components/meetups/MeetupHub.tsx')
  const cylinder = readSource('components/meetups/MeetupIdeaCylinder.tsx')

  assert.match(cylinder, /data-swipe-surface="meetup-ideas"/)
  assert.match(cylinder, /onBrowseCategory/)
  assert.match(cylinder, /모임 보기/)
  assert.match(hub, /onBrowseCategory=/)
  assert.match(hub, /openMeetupsRef/)
  assert.match(hub, /scrollIntoView/)
})

test('meetup cylinder promotes creating the selected activity to a clear secondary action', () => {
  const cylinder = readSource('components/meetups/MeetupIdeaCylinder.tsx')

  assert.match(cylinder, /내 시간으로 새 모임 열기/)
  assert.match(cylinder, /선택한 활동이 그대로 입력돼요/)
  assert.match(cylinder, /CirclePlus/)
  assert.match(cylinder, /min-h-16/)
  assert.match(cylinder, /idea=\$\{activeIdea\.id\}/)
})

test('featured meetup creation keeps the exact activity preset instead of only its database category', () => {
  const cylinder = readSource('components/meetups/MeetupIdeaCylinder.tsx')
  const createForm = readSource('components/meetups/CreateMeetupForm.tsx')
  const catalog = readSource('lib/community/catalog.ts')

  assert.match(catalog, /id:\s*'major-foundation-study'/)
  assert.match(cylinder, /idea=\$\{activeIdea\.id\}/)
  assert.match(createForm, /requestedIdea/)
  assert.match(createForm, /featuredMeetupIdeas\.find/)
  assert.match(createForm, /initialIdea\?\.title/)
})

test('meetup creation separates broad groups, activities, and study topics', () => {
  const createForm = readSource('components/meetups/CreateMeetupForm.tsx')

  assert.match(createForm, /meetupDiscoveryGroups/)
  assert.match(createForm, /getMeetupDiscoveryCategories/)
  assert.match(createForm, /studyTopicGroups/)
  assert.match(createForm, /어떤 종류의 모임인가요/)
  assert.match(createForm, /세부 활동/)
  assert.match(createForm, /스터디 주제/)
})

test('meetup database accepts every category exposed by the web form', () => {
  const migration = readSource('supabase/migrations/20260810183000_community_meetup_category_contract.sql')

  for (const category of ['badminton', 'tennis', 'gaming', 'hiking']) {
    assert.match(migration, new RegExp(`'${category}'`))
  }
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.create_activity_meetup/i)
})

test('community hot feed and likes stay school scoped behind security definer RPCs', () => {
  const migration = readSource('supabase/migrations/20260810120000_community_hot_feed_and_likes.sql')
  const api = readSource('app/api/community/posts/route.ts')
  const likeApi = readSource('app/api/community/posts/[id]/like/route.ts')

  assert.match(migration, /community_post_likes/)
  assert.match(migration, /created_at\s*>?=\s*now\(\)\s*-\s*interval '7 days'/i)
  assert.match(migration, /post\.school = v_school/)
  assert.match(migration, /REVOKE ALL ON TABLE public\.community_post_likes FROM PUBLIC, anon, authenticated/i)
  assert.match(migration, /SECURITY DEFINER[\s\S]*SET search_path = ''/)
  assert.match(api, /list_hot_community_posts/)
  assert.match(likeApi, /toggle_community_post_like/)
})

test('community migration denies direct table access and exposes bounded RPCs', () => {
  const migration = readSource('supabase/migrations/20260808093918_community_activity_meetups_and_posts.sql')
  const meetupApi = readSource('app/api/meetups/route.ts')
  const communityApi = readSource('app/api/community/posts/route.ts')

  for (const table of ['activity_meetups', 'activity_meetup_members', 'community_posts']) {
    assert.match(migration, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, 'i'))
    assert.match(migration, new RegExp(`REVOKE ALL ON TABLE public\\.${table} FROM PUBLIC, anon, authenticated`, 'i'))
  }
  assert.match(migration, /SECURITY DEFINER[\s\S]*SET search_path = ''/)
  assert.match(migration, /auth\.uid\(\)/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.join_activity_meetup/)
  assert.match(meetupApi, /validateMeetupCreateInput/)
  assert.match(communityApi, /validateCommunityPostInput/)
})

test('meetup reviews require a completed participation and stay one per meetup', () => {
  const migration = readSource('supabase/migrations/20260810150000_verified_meetup_reviews.sql')
  const postsApi = readSource('app/api/community/posts/route.ts')
  const eligibilityApi = readSource('app/api/community/reviewable-meetups/route.ts')
  const board = readSource('components/community/CommunityBoard.tsx')

  assert.match(migration, /ADD COLUMN meetup_id UUID/i)
  assert.match(migration, /community_posts_one_review_per_meetup_idx/i)
  assert.match(migration, /CREATE FUNCTION public\.list_reviewable_meetups/i)
  assert.match(migration, /member\.status = 'joined'/i)
  assert.match(migration, /meetup\.scheduled_at <= now\(\)/i)
  assert.match(migration, /post\.category <> 'meetup-review' OR post\.meetup_id IS NOT NULL/i)
  assert.match(migration, /CREATE FUNCTION public\.create_meetup_review/i)
  assert.match(migration, /verified_participation_required/i)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.create_meetup_review/i)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.create_meetup_review/i)

  assert.match(eligibilityApi, /createSupabaseRequestClient/)
  assert.match(eligibilityApi, /list_reviewable_meetups/)
  assert.match(postsApi, /create_meetup_review/)
  assert.match(postsApi, /p_meetup_id/)
  assert.match(board, /\/api\/community\/reviewable-meetups/)
  assert.match(board, /role="combobox"/)
  assert.match(board, /role="listbox"/)
  assert.match(board, /참여한 모임/)
})

test('verified review visual preview is development-only and reuses the real board', () => {
  const preview = readSource('app/dev/community-review-preview/page.tsx')
  const board = readSource('components/community/CommunityBoard.tsx')

  assert.match(preview, /process\.env\.NODE_ENV !== 'development'/)
  assert.match(preview, /notFound\(\)/)
  assert.match(preview, /<CommunityBoard/)
  assert.match(preview, /previewReviewableMeetups=/)
  assert.match(board, /previewReviewableMeetups\?: ReviewableMeetup\[\]/)
})

test('community and meetup foreign keys have covering indexes for production reads', () => {
  const migration = readSource('supabase/migrations/20260810231000_add_product_fk_indexes.sql')

  assert.match(migration, /ON public\.activity_meetups \(host_user_id\)/i)
  assert.match(migration, /ON public\.community_post_likes \(user_id\)/i)
  assert.match(migration, /ON public\.community_posts \(meetup_id\)/i)
})

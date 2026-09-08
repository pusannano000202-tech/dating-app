import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (file) => readFileSync(file, 'utf8')

test('community offers three equal entries with four photo topics inside content', () => {
  const page = read('app/community/page.tsx')
  assert.match(page,/CommunityPortal/)
  assert.match(read('app/community/content/page.tsx'), /CommunityExperienceExplorer/)
  assert.match(read('components/community/CommunityExperienceExplorer.tsx'), /PhotoSceneCarousel label="즐길 거리"/)
})

test('community does not present one category as the selected page', () => {
  const page = read('app/community/page.tsx')
  assert.doesNotMatch(page, /Campus 커뮤니티를 시작해요/)
  assert.match(read('lib/community/experience-explorer.ts'), /MBTI 연애 통계/)
})

test('meetups offers a real retry action and clearly separates the proposed schedule', () => {
  const hub = read('components/meetups/MeetupHub.tsx')
  assert.match(hub, /onRetry=\{\(\) => setReloadToken/)
  assert.match(hub, /onClick=\{onRetry\}/)
  assert.match(hub, /<details[\s\S]*운영 예정표/)
  assert.doesNotMatch(hub, /<h2[^>]*>실제 모임 목록/)
})

test('delivery distinguishes unavailable/loading and gives an available alternative', () => {
  const page = read('components/campus-eats/DeliveryWorldcup.tsx')
  assert.doesNotMatch(page, /확인 중 또는 연결 불가/)
  assert.match(page, /음식 종류부터 고르기/)
  assert.match(page, /aria-busy=\{busy\}/)
  assert.match(page, /href="\/community\/campus-eats\?mode=choose"/)
})

test('delivery clears a stale failure when the user retries', () => {
  assert.match(read('components/campus-eats/DeliveryWorldcup.tsx'), /async function reload\(\) \{\s*setBusy\(true\)\s*setError\(''\)/)
})

test('food selection keeps a compact mobile start bar and plain ranking labels', () => {
  const source = read('components/campus-eats/CampusEatsPilot.tsx')
  assert.match(source, /aria-label="선택한 맛집으로 시작"/)
  assert.match(source, /bottom-\[calc\(64px\+env\(safe-area-inset-bottom\)\)\]/)
  assert.match(source, /내 누적 취향 순위/)
  assert.doesNotMatch(source, /내 Elo 랭킹|체스식 Elo 점수|Elo 순서로 시드/)
})

test('MBTI scene changes reset scroll but detail toggles capture their DOM value synchronously', () => {
  assert.match(read('components/community/mbti/MbtiHub.tsx'), /window\.scrollTo\(0, 0\)[\s\S]{0,40}\[screen\]/)
  assert.match(read('components/community/mbti/MbtiExperienceReview.tsx'), /const isOpen = event\.currentTarget\.open/)
})

test('MBTI material changes require fresh consent and successful save resets the stats return', () => {
  const hub = read('components/community/mbti/MbtiHub.tsx')
  assert.match(hub, /const editDraft[\s\S]*?setConsent\(false\)[\s\S]*?setDrafts\(next\)/)
  assert.match(hub, /onSelfGenderChange=\{[\s\S]*?setConsent\(false\)/)
  assert.match(hub, /await loadOwnerState\(\)[\s\S]*?setStatsReturn\('self'\)/)
  assert.match(hub, /onRetryService=/)
})

test('meetup filters use pressed buttons rather than incomplete tabs', () => {
  const hub = read('components/meetups/MeetupHub.tsx')
  assert.match(hub, /role="group" aria-label="모임 카테고리 필터"/)
  assert.match(hub, /aria-pressed=\{discoveryScope/)
  assert.doesNotMatch(hub, /role="tablist"|role="tab"/)
})

test('slow owner reads cannot overwrite newer input and save locks the submitted form', () => {
  const hub = read('components/community/mbti/MbtiHub.tsx')
  assert.match(hub, /const versionAtRequest = draftVersion.current/)
  assert.match(hub, /hydrateDraft && draftVersion.current === versionAtRequest/)
  assert.match(hub, /onRefresh=\{\(\) => loadOwnerState\(!hasUnsavedDraft\)\}/)
  const review = read('components/community/mbti/MbtiExperienceReview.tsx')
  assert.match(review, /<fieldset disabled=\{submitting \|\| recoveryLocked\}>/)
  assert.match(review, /expandedDraftId === null \|\|/)
})

test('meeting statistics do not imply an empty verified result during a failed read', () => {
  assert.match(read('components/community/mbti/MbtiStats.tsx'), /!loading && !error && snapshot && <article/)
})

test('draft history protection honors cancelable traversal rather than rewriting browser history', () => {
  const guard = read('components/community/mbti/MbtiDraftNavigationGuard.tsx')
  assert.match(guard, /navigation\?\.addEventListener\('navigate', beforeHistoryNavigation\)/)
  assert.match(guard, /!event.cancelable.*navigationType !== 'traverse'/)
  assert.doesNotMatch(guard, /history\.pushState|history\.replaceState|history\.go/)
})

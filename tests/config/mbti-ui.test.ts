import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = process.cwd()
const hub = readFileSync(path.join(root, 'components/community/mbti/MbtiHub.tsx'), 'utf8')
const editor = readFileSync(path.join(root, 'components/community/mbti/MbtiExperienceEditor.tsx'), 'utf8')
const review = readFileSync(path.join(root, 'components/community/mbti/MbtiExperienceReview.tsx'), 'utf8')
const stats = readFileSync(path.join(root, 'components/community/mbti/MbtiStats.tsx'), 'utf8')
const manager = readFileSync(path.join(root, 'components/community/mbti/MbtiResponseManager.tsx'), 'utf8')
const navigationGuard = readFileSync(path.join(root, 'components/community/mbti/MbtiDraftNavigationGuard.tsx'), 'utf8')

test('option three uses a 4 by 4 tap-to-count grid and explicit plus/minus controls', () => {
  assert.match(editor, /grid-cols-4/)
  assert.match(editor, /같은 유형을 여러 번 눌러도 돼요/)
  assert.match(editor, /aria-label=\{`\$\{type\} 경험 1회 추가`\}/)
  assert.match(editor, /aria-label=\{`\$\{type\} 경험 1회 줄이기`\}/)
  assert.match(editor, /선택한 경험/)
})

test('draft is tab-memory only and leaving with unsaved relationship data warns the user', () => {
  assert.doesNotMatch(hub, /localStorage|sessionStorage/)
  assert.doesNotMatch(navigationGuard, /localStorage|sessionStorage/)
  assert.match(navigationGuard, /beforeunload/)
  assert.match(navigationGuard, /입력 중인 내용은 저장되지 않아요/)
  assert.match(navigationGuard, /addEventListener\('click', beforeLinkNavigation, true\)/)
  assert.match(hub, /MbtiDraftNavigationGuard active=\{hasUnsavedDraft\}/)
})

test('review supports per-experience gender status and optional distinct ratings', () => {
  assert.match(review, /지난 연애/)
  assert.match(review, /현재 연애/)
  assert.match(review, /경험별로 평가하기/)
  assert.match(review, /대화/)
  assert.match(review, /가치관/)
})

test('statistics-first access is visible and unavailable statistics never fabricate numbers', () => {
  assert.ok(editor.indexOf('통계 먼저 보기') < editor.indexOf('상대 유형을 잘 모르겠어요'))
  assert.match(hub, /통계 먼저 보기/)
  assert.match(stats, /아직 공개할 수 있는 통계가 없어요/)
  assert.match(stats, /응답자 n명|실제 커플 수가 아니에요/)
  assert.doesNotMatch(stats, /가상|예시 통계|더미/)
})

test('every MBTI screen clears the fixed 64px bottom navigation', () => {
  for (const source of [hub, editor, review, stats, manager]) {
    assert.match(source, /pb-24/)
    assert.doesNotMatch(source, /pb-(10|12)/)
  }
})

test('deletion copy distinguishes immediate raw exclusion from the 24-hour public snapshot window', () => {
  assert.match(manager, /서버 집계에서 바로 제외되고 공개 통계는 24시간 안에 갱신/)
  assert.doesNotMatch(manager, /공개 통계에서도 즉시 제외/)
})

test('old experience snapshots change only through an explicit per-experience action', () => {
  assert.match(manager, /당시 내 유형을 현재 .*로 수정/)
  assert.match(manager, /confirm_self_snapshot_change: true/)
})

test('response management can page beyond the first 50 experiences', () => {
  assert.match(hub, /loadMoreExperiences/)
  assert.match(hub, /current\.nextCursor/)
  assert.match(manager, /다음 경험 불러오기/)
  assert.match(manager, /state\.nextCursor/)
})

test('large count bundles explain their bounded 100-item expansion step', () => {
  assert.match(manager, /한 번에 최대 100개씩/)
  assert.match(manager, /Math\.min\(experience\.reportedCount, 100\)/)
  assert.match(manager, /experience\.reportedCount < 100/)
  assert.match(manager, /entry_mode: 'count_only'[\s\S]*reported_count: 1/)
})

test('mobile quick entry keeps the approved title, compact grid and primary review before helper choices', () => {
  assert.match(editor, /내 연애 경험/)
  assert.match(editor, /h-\[54px\]/)
  assert.ok(editor.indexOf('선택한 경험 검토하기') < editor.indexOf('상대 유형을 잘 모르겠어요'))
  assert.ok(editor.indexOf('선택한 경험 검토하기') < editor.indexOf('연애 경험 없음'))
})

test('desktop quick entry keeps every MBTI tile compact instead of stretching with its column', () => {
  assert.match(editor, /sm:h-\[68px\]/)
  assert.doesNotMatch(editor, /sm:aspect-/)
})

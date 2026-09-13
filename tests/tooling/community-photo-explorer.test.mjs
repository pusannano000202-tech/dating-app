import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const modelPath = 'lib/community/experience-explorer.ts'
async function model() {
  assert.ok(existsSync(modelPath), 'photo explorer selection model must exist')
  const { outputText } = ts.transpileModule(readFileSync(modelPath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  })
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
}

test('three active photo topics retain distinct copy, local photos and real destinations', async () => {
  const { COMMUNITY_EXPERIENCES: topics } = await model()
  assert.deepEqual(topics.map(t => t.id), ['visit', 'mbti', 'places'])
  assert.deepEqual(topics.map(t => t.href), ['/community/campus-eats?mode=choose', '/community/mbti', '/community/places'])
  for (const key of ['image', 'title', 'description', 'cta']) assert.equal(new Set(topics.map(t => t[key])).size, 3)
  for (const topic of topics) assert.ok(existsSync(`public${topic.image}`), topic.image)
  assert.match(topics[1].notice, /자기보고.*과학적/)
  assert.match(topics[1].description, /자기보고.*과학적/)
  assert.doesNotMatch(topics[1].description, /INFP 두 번, INTP 한 번\./)
  assert.match(topics[2].notice, /후보.*확인/)
  assert.ok(topics.every(t => /연출 이미지/.test(t.imageNote)))
})

test('previous and next wrap through active topics without losing the selected index', async () => {
  const { nextExperienceIndex: next } = await model()
  assert.equal(next(0, -1), 2)
  assert.equal(next(2, 1), 0)
  assert.equal(next(0, 1), 1)
  assert.equal(next(1, -1), 0)
})

test('swipes require 44px and horizontal intent, leaving vertical scroll alone', async () => {
  const { experienceSwipeDirection: swipe } = await model()
  assert.equal(swipe(-44, 0), 1)
  assert.equal(swipe(60, 10), -1)
  assert.equal(swipe(43, 0), 0)
  assert.equal(swipe(-50, 90), 0)
  assert.equal(swipe(50, 45), 0)
})

test('keyboard moves and jumps with the same selection logic', async () => {
  const { experienceKeyboardIndex: key } = await model()
  assert.equal(key('ArrowRight', 2), 0)
  assert.equal(key('ArrowLeft', 0), 2)
  assert.equal(key('Home', 2), 0)
  assert.equal(key('End', 0), 2)
  assert.equal(key('Tab', 1), null)
  assert.equal(key('Enter', 1), null)
})

test('content destination exposes in-place selection with production feature gates', () => {
  const page = readFileSync('app/community/content/page.tsx', 'utf8')
  assert.ok(page.includes('<CommunityExperienceExplorer'))
  assert.match(page, /isCommunityFeatureEnabled/)
  assert.match(page, /campusEatsEnabled=\{isCampusEatsFeatureEnabled\(\)\}/)
  assert.match(readFileSync('components/community/CommunityExperienceExplorer.tsx','utf8'), /disabled:.*visit.*!campusEatsEnabled/)
})

test('photo controls preserve vertical scrolling, cancellation, focus and reduced motion', () => {
  const path = 'components/social/PhotoSceneCarousel.tsx'
  assert.ok(existsSync(path), 'interactive photo component must exist')
  const source = readFileSync(path, 'utf8')
  for (const pattern of [/aria-pressed=/, /onPointerCancel=/, /onLostPointerCapture=/, /onKeyDown=/, /aria-live="polite"/, /aria-controls=/]) assert.match(source, pattern)
  assert.doesNotMatch(source, /setInterval|setTimeout|router.push/)
  const css = readFileSync('components/social/social-scenes.module.css','utf8')
  assert.match(css,/touch-action:pan-y/)
  assert.match(css,/prefers-reduced-motion:reduce/)
  assert.match(css,/:focus-visible\{outline:3px/)
})

test('arrow shortcuts are scoped to selectors and the photo, never the CTA link', () => {
  const source = readFileSync('components/social/PhotoSceneCarousel.tsx', 'utf8')
  assert.doesNotMatch(source, /<section[^>]*onKeyDown=/)
  assert.match(source, /role="group" onKeyDown=\{keyboard\}/)
  assert.match(source, /aria-roledescription=\{showNavigation \? '캐러셀' : undefined\}[^>]*onKeyDown=\{keyboard\}/)
  assert.match(source, /function keyboard\([^)]*\)\s*\{\s*if \(!showNavigation\) return/)
})

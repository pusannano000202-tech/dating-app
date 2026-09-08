import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  getNextSocialRailIndex,
  getSocialRailScrollBehavior,
  getSocialRailSwipeDirection,
} from '../../lib/community/social-rail-navigation'

test('social recommendation rail wraps previous and next choices while rejecting vertical swipes', () => {
  assert.equal(getNextSocialRailIndex(0, -1, 3), 2)
  assert.equal(getNextSocialRailIndex(2, 1, 3), 0)
  assert.equal(getSocialRailSwipeDirection(-72, 12), 1)
  assert.equal(getSocialRailSwipeDirection(72, 12), -1)
  assert.equal(getSocialRailSwipeDirection(18, 0), 0)
  assert.equal(getSocialRailSwipeDirection(60, 84), 0)
})

test('social rail keeps horizontal motion local and honors reduced motion', () => {
  assert.equal(getSocialRailScrollBehavior(false), 'smooth')
  assert.equal(getSocialRailScrollBehavior(true), 'auto')
})

test('social recommendation rail connects every navigation method to the selected lane', () => {
  const source = readFileSync('components/meetups/MeetupHub.tsx', 'utf8')

  assert.match(source, /data-swipe-surface="social-recommendations"/)
  assert.match(source, /onPointerDown=\{handleSocialRailPointerDown\}/)
  assert.match(source, /onPointerUp=\{handleSocialRailPointerUp\}/)
  assert.match(source, /touch-pan-y/)
  assert.match(source, /onKeyDown=\{handleSocialRailKeyDown\}/)
  assert.match(source, /aria-label="이전 친목 추천"/)
  assert.match(source, /aria-label="다음 친목 추천"/)
  assert.match(source, /aria-label="친목 추천 직접 선택"/)
  assert.match(source, /aria-current=\{selected \? 'true' : undefined\}/)
  assert.match(source, /suppressSocialRailClickRef/)
  assert.match(source, /\}, \[socialLane\]\)/)
  assert.match(source, /rail\.scrollTo\(\{ left: nextLeft, behavior: getSocialRailScrollBehavior/)
  assert.match(source, /function alignSocialRailToSelectedLane\(\)/)
  assert.match(source, /new ResizeObserver\(alignSocialRailToSelectedLane\)/)
  assert.match(source, /observer\.observe\(rail\)/)
  assert.match(source, /observer\.disconnect\(\)/)
  assert.doesNotMatch(source, /socialRailRef[\s\S]{0,500}scrollIntoView/)
  assert.match(source, /window\.addEventListener\('pointerup'/)
  assert.match(source, /onLostPointerCapture=\{clearSocialRailPointerStart\}/)
  assert.match(source, /window\.requestAnimationFrame\(\(\) => \{ suppressSocialRailClickRef\.current = false \}\)/)
  assert.match(source, /suppressSocialRailClickRef\.current = false/)
  assert.match(source, /grid-cols-3/)
  assert.match(source, /whitespace-normal/)
})

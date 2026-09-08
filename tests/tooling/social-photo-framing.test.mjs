import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const css = readFileSync('components/social/social-scenes.module.css', 'utf8')

test('shared scene photos preserve the whole image instead of cropping heads at intermediate widths', () => {
  const imageRule = css.match(/\.sceneImage\s*\{([^}]+)\}/)?.[1] ?? ''
  assert.match(imageRule, /object-fit:\s*contain/)
  assert.doesNotMatch(imageRule, /object-fit:\s*cover/)
})

test('the photo frame scales with its width on phone, tablet and desktop', () => {
  const rules = [...css.matchAll(/\.photo\s*\{([^}]+)\}/g)].map(match => match[1])
  assert.match(rules[0], /aspect-ratio:\s*4\s*\/\s*3/)
  for (const rule of rules) assert.doesNotMatch(rule, /(?:^|;)\s*height:\s*\d+px/)
  assert.match(rules[0], /touch-action:\s*pan-y/)
})

test('photo transitions do not translate the full image under a clipping frame', () => {
  const animation = css.match(/@keyframes sceneIn\{[^\n]+/)?.[0] ?? ''
  assert.doesNotMatch(animation, /translate|scale/)
  assert.match(css, /prefers-reduced-motion:reduce/)
})

test('meetup idea photos have a separate contain frame instead of filling a portrait text card', () => {
  const source = readFileSync('components/meetups/MeetupIdeaCylinder.tsx', 'utf8')
  assert.match(source, /data-part="idea-photo"/)
  assert.match(source, /className="object-contain"/)
  assert.doesNotMatch(source, /className="object-cover"/)
  assert.doesNotMatch(source, /absolute inset-0 bg-gradient-to-t/)
  assert.match(source, /draggable=\{false\}/)
})

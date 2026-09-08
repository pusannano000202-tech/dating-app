import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('activity rooms remain one vertical column at every breakpoint', () => {
  const css = readFileSync(new URL('../../components/meetups/activity-rooms.module.css', import.meta.url), 'utf8')
  const roomRules = [...css.matchAll(/\.rooms\s*\{([^}]+)\}/g)].map(match => match[1])
  assert.ok(roomRules.length > 0)
  assert.match(roomRules[0], /grid-template-columns\s*:\s*minmax\(0,\s*1fr\)/)
  for (const rule of roomRules) assert.doesNotMatch(rule, /grid-template-columns\s*:\s*1fr\s+1fr/)
})

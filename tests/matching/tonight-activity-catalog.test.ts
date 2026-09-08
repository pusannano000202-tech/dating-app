import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import {
  TONIGHT_ACTIVITY_TEMPLATE_CATALOG,
  selectTonightActivityTemplates,
} from '../../lib/matching/tonight-ranked/activity-catalog'

test('curated Tonight catalog is concrete, photo-backed, and excludes basketball', () => {
  assert.ok(TONIGHT_ACTIVITY_TEMPLATE_CATALOG.length >= 6)

  const ids = new Set<string>()
  for (const template of TONIGHT_ACTIVITY_TEMPLATE_CATALOG) {
    assert.ok(!ids.has(template.id), `duplicate template id: ${template.id}`)
    ids.add(template.id)
    assert.match(template.title, /\S/)
    assert.ok(template.title.length >= 8)
    assert.ok(template.description.length >= 20)
    assert.ok(template.durationMinutes >= 45 && template.durationMinutes <= 90)
    assert.ok(template.venueCategories.length > 0)
    assert.ok(!/농구|카페에서\s*한\s*시간/i.test(`${template.title} ${template.description}`))
    assert.match(template.imageUrl, /^\/images\/match\/events\/[a-z0-9-]+\.(webp|png)$/)
    assert.equal(existsSync(join(process.cwd(), 'public', template.imageUrl)), true)
  }
})

test('daily selection returns exactly three unique replayable photo activities', () => {
  const first = selectTonightActivityTemplates({ marketCode: 'PNU', serviceDate: '2026-09-03' })
  const replay = selectTonightActivityTemplates({ marketCode: 'PNU', serviceDate: '2026-09-03' })

  assert.equal(first.length, 3)
  assert.equal(new Set(first.map((item) => item.id)).size, 3)
  assert.deepEqual(replay, first)
  const venueCategories = new Set(first.flatMap((item) => item.venueCategories))
  assert.equal(venueCategories.has('bar'), true)
  assert.equal(venueCategories.has('activity'), true)
  assert.equal(venueCategories.has('cafe') || venueCategories.has('restaurant'), true)
})

test('selection changes every service day and repeats only on a bounded cycle', () => {
  const signatures = Array.from({ length: 8 }, (_, offset) => {
    const date = new Date(Date.UTC(2026, 8, 1 + offset)).toISOString().slice(0, 10)
    return selectTonightActivityTemplates({ marketCode: 'PNU', serviceDate: date })
      .map((item) => item.id)
      .sort()
      .join('|')
  })

  signatures.forEach((signature, index) => {
    if (index > 0) assert.notEqual(signature, signatures[index - 1])
  })
  assert.equal(new Set(signatures).size, 8)
})

test('invalid market or service date fails closed', () => {
  assert.throws(
    () => selectTonightActivityTemplates({ marketCode: '', serviceDate: '2026-09-03' }),
    /invalid_market_code/,
  )
  assert.throws(
    () => selectTonightActivityTemplates({ marketCode: 'PNU', serviceDate: '2026-9-3' }),
    /invalid_service_date/,
  )
  assert.throws(
    () => selectTonightActivityTemplates({ marketCode: 'PNU', serviceDate: '2026-02-30' }),
    /invalid_service_date/,
  )
})

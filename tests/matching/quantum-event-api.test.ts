import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { getQuantumEventApiCatalog } from '../../lib/matching/quantum-event-catalog'

test('event API catalog exposes four five-person choices in each mode', () => {
  const catalog = getQuantumEventApiCatalog()

  assert.equal(catalog.tonight.length, 4)
  assert.equal(catalog.scheduled.length, 4)
  for (const [mode, events] of Object.entries(catalog)) {
    for (const event of events) {
      assert.equal(event.mode, mode)
      assert.equal(event.total_people, 5)
      assert.equal(event.male_count + event.female_count, 5)
      assert.equal(event.remaining, null)
      assert.ok(event.description.length > 10)
    }
  }
})

test('public event route returns the canonical server catalog', () => {
  const routePath = path.join(process.cwd(), 'app/api/match/events/route.ts')
  assert.ok(fs.existsSync(routePath), 'event catalog API route must exist')
  const route = fs.readFileSync(routePath, 'utf8')

  assert.match(route, /getQuantumEventApiCatalog/)
  assert.match(route, /availability:\s*'ready'/)
  assert.doesNotMatch(route, /service_role|SUPABASE_SECRET_KEY/)
})

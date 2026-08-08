import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

test('participation input accepts only catalog events and approved party types', () => {
  const helperPath = path.join(process.cwd(), 'lib/matching/quantum-event-participation.ts')
  assert.ok(fs.existsSync(helperPath), 'quantum-event-participation.ts must exist')

  const contract = require('../../lib/matching/quantum-event-participation') as {
    parseQuantumEventParticipationInput: (value: unknown) =>
      | { ok: true; value: { eventId: string; eventMode: string; partyType: string } }
      | { ok: false; error: string }
  }

  assert.deepEqual(
    contract.parseQuantumEventParticipationInput({
      event_id: 'tonight-board-game',
      party_type: 'solo',
    }),
    {
      ok: true,
      value: {
        eventId: 'tonight-board-game',
        eventMode: 'tonight',
        partyType: 'solo',
      },
    },
  )
  assert.deepEqual(
    contract.parseQuantumEventParticipationInput({ event_id: 'fake-event', party_type: 'solo' }),
    { ok: false, error: 'invalid_event' },
  )
  assert.deepEqual(
    contract.parseQuantumEventParticipationInput({ event_id: 'tonight-board-game', party_type: 'mixed' }),
    { ok: false, error: 'invalid_party_type' },
  )
})

test('participation API has read, replace, and cancel boundaries', () => {
  const routePath = path.join(process.cwd(), 'app/api/match/event-participation/route.ts')
  assert.ok(fs.existsSync(routePath), 'event participation API route must exist')
  const route = fs.readFileSync(routePath, 'utf8')

  assert.match(route, /export async function GET/)
  assert.match(route, /export async function POST/)
  assert.match(route, /export async function DELETE/)
  assert.match(route, /get_my_quantum_event_participation/)
  assert.match(route, /set_my_quantum_event_participation/)
  assert.match(route, /cancel_my_quantum_event_participation/)
  assert.match(route, /auth_required/)
  assert.match(route, /schema_unavailable/)
})

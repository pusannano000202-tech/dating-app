import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

async function model() {
  const { outputText } = ts.transpileModule(readFileSync('lib/meetups/challenge-discovery.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext } })
  return import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'))
}

test('challenge discovery shows only the selected sport without changing rows or access flags', async () => {
  const { filterDiscoveryChallenges } = await model()
  const rows = [{ id: '1', category: 'soccer', may_request_roster: false }, { id: '2', category: 'gaming', may_request_roster: true }]
  assert.deepEqual(filterDiscoveryChallenges(rows, 'soccer'), [rows[0]])
  assert.deepEqual(filterDiscoveryChallenges(rows, 'gaming'), [rows[1]])
  assert.deepEqual(filterDiscoveryChallenges(rows, undefined), rows)
  assert.deepEqual(filterDiscoveryChallenges([], 'soccer'), [])
  assert.equal(filterDiscoveryChallenges(rows, 'soccer')[0], rows[0])
})

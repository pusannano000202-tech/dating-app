import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = await readFile(new URL('../../lib/meetups/league-honors.ts', import.meta.url), 'utf8').catch(error => {
  if (error.code === 'ENOENT') return ''
  throw error
})
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const honors = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'))
const group = rows => {
  assert.equal(typeof honors.groupLeagueHonors, 'function', 'the pure honors grouping contract must exist')
  return honors.groupLeagueHonors(rows)
}
const row = (department, rank, points = 1000, played = 1) => ({ department, rank, points, played, wins: played, losses: 0, draws: 0, is_me: false })

test('honors shows the existing top three ranks in semantic order without changing points', () => {
  const result = group([row('D', 4, 900), row('C', 3, 1100), row('A', 1, 1300), row('B', 2, 1200)])
  assert.deepEqual(result.map(item => [item.rank, item.rows.map(team => [team.department, team.points])]), [
    [1, [['A', 1300]]], [2, [['B', 1200]]], [3, [['C', 1100]]],
  ])
})

test('honors includes every department in a tied rank rather than taking only three rows', () => {
  const result = group([row('A', 1), row('B', 1), row('C', 1), row('D', 1), row('E', 2), row('F', 3)])
  assert.deepEqual(result.map(item => [item.rank, item.rows.map(team => team.department)]), [
    [1, ['A', 'B', 'C', 'D']], [2, ['E']], [3, ['F']],
  ])
})

test('honors never awards zero-played or unranked departments and leaves an empty league empty', () => {
  assert.deepEqual(group([]), [])
  assert.deepEqual(group([row('Baseline', null, 1000, 0), row('No matches', 1, 1500, 0), row('Unranked', null)]), [])
  assert.deepEqual(group([row('Baseline', null, 1000, 0), row('Played', 1, 970)]).map(item => item.rows[0].department), ['Played'])
})

test('honors does not fabricate missing rank groups or break a sole tied group into podium places', () => {
  assert.deepEqual(group([row('A', 1), row('B', 1)]).map(item => item.rank), [1])
  assert.deepEqual(group([row('A', 1), row('C', 3)]).map(item => item.rank), [1, 3])
})

test('honors preserves original ranks after filtering and never mutates its input records', () => {
  const input = Object.freeze([Object.freeze(row('A', 1, 1700)), Object.freeze(row('D', 3, 1250))])
  const before = JSON.stringify(input)
  const filtered = group(input.filter(team => team.department === 'D'))
  assert.equal(filtered[0].rank, 3)
  assert.equal(filtered[0].rows[0].points, 1250)
  group(input)
  assert.equal(JSON.stringify(input), before)
})

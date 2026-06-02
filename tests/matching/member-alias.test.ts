import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ANIMAL_ALIAS_POOL, assignMemberAliases } from '../../lib/matching/member-alias'

test('assignMemberAliases creates stable aliases by sorted user id', () => {
  const aliases = assignMemberAliases(['u3', 'u1', 'u2'])

  assert.deepEqual(
    aliases.map((item) => item.userId),
    ['u1', 'u2', 'u3'],
  )
  assert.deepEqual(
    aliases.map((item) => item.alias),
    ['오소리', '꿀벌', '개구리'],
  )
  assert.deepEqual(
    aliases.map((item) => item.sortOrder),
    [0, 1, 2],
  )
})

test('assignMemberAliases deduplicates repeated user ids', () => {
  const aliases = assignMemberAliases(['u2', 'u1', 'u2'])

  assert.deepEqual(
    aliases.map((item) => item.userId),
    ['u1', 'u2'],
  )
})

test('assignMemberAliases rejects groups larger than the alias pool', () => {
  const tooManyUserIds = ANIMAL_ALIAS_POOL.map((_, index) => `u${index}`)
  tooManyUserIds.push('overflow')

  assert.throws(
    () => assignMemberAliases(tooManyUserIds),
    /alias_pool_exhausted/,
  )
})

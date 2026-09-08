import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const ROOT = process.cwd()

function readSource(path: string): string {
  const absolutePath = join(ROOT, path)
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf8') : ''
}

test('Campus Eats exposes a category API route backed by the repository boundary', () => {
  const route = readSource('app/api/campus-eats/route.ts')
  const repository = readSource('lib/campus-eats/repository.ts')

  assert.match(route, /export async function GET/)
  assert.match(route, /getCampusEatsCategoryResponse/)
  assert.match(route, /resolveCampusEatsCategoryId/)
  assert.match(route, /invalid_category/)
  assert.match(repository, /restaurant_id/)
})

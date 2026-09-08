import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(path, 'utf8')

test('unselected Campus Eats entry offers all approved food categories before mounting a battle', () => {
  const entryPath = 'components/campus-eats/CampusEatsEntry.tsx'
  assert.ok(existsSync(entryPath), 'category chooser component must exist')

  const entry = read(entryPath)
  assert.match(entry, /PNU_CAMPUS_EATS_CATEGORIES/)
  assert.match(entry, /category\.id/)
  assert.match(entry, /어떤 음식부터 골라볼까요\?/) 
  assert.match(entry, /이전 결과는 자동으로 열지 않아요/) 
  assert.match(entry, /mode=setup/) 
  assert.match(entry, /CampusEatsCategoryIcon/) 
  assert.match(entry, /grid-cols-2/) 
  assert.match(entry, /sm:grid-cols-3/) 
  assert.match(entry, /min-h-11/) 
  assert.match(entry, /href="\/community"/)
})

test('Campus Eats route gates the pilot behind chooser mode or an explicit category', () => {
  const page = read('app/(campus-eats)/community/campus-eats/page.tsx')
  const entry = read('components/campus-eats/CampusEatsEntry.tsx')

  assert.match(page, /Suspense/)
  assert.match(entry, /useSearchParams/)
  assert.match(entry, /mode === 'choose'/)
  assert.match(entry, /!category && mode !== 'map'/)
  assert.match(page, /CampusEatsEntry/)
  assert.match(entry, /CampusEatsPilot/)
})

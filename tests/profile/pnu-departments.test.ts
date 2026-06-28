import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getDepartmentCollege,
  PNU_DEPARTMENT_GROUPS,
  PNU_DEPARTMENTS,
  searchDepartments,
} from '../../lib/pnu-departments'

test('PNU department source includes the user-provided college groups', () => {
  const colleges = PNU_DEPARTMENT_GROUPS.map((group) => group.college)

  assert.ok(colleges.includes('인문대학'))
  assert.ok(colleges.includes('공과대학'))
  assert.ok(colleges.includes('정보의생명공학대학'))
  assert.ok(colleges.includes('학부대학'))
})

test('PNU department source includes recently requested department names', () => {
  for (const department of [
    '노어노문학과',
    '미디어커뮤니케이션학과',
    '전기전자공학부',
    '컴퓨터공학전공',
    '정보컴퓨터공학부',
    '글로벌자유전공학부',
  ]) {
    assert.ok(PNU_DEPARTMENTS.includes(department), `${department} should be selectable`)
  }
})

test('searchDepartments supports partial department and college searches', () => {
  assert.deepEqual(searchDepartments('컴퓨터', 5), ['정보컴퓨터공학부', '컴퓨터공학전공'])
  assert.ok(searchDepartments('공과', 30).includes('기계공학부'))
  assert.ok(searchDepartments('의생명', 10).includes('의생명융합공학부'))
})

test('searchDepartments returns browseable suggestions when query is empty', () => {
  const suggestions = searchDepartments('', 4)

  assert.equal(suggestions.length, 4)
  assert.deepEqual(suggestions, ['국어국문학과', '일어일문학과', '불어불문학과', '노어노문학과'])
})

test('getDepartmentCollege returns the college label for suggestion context', () => {
  assert.equal(getDepartmentCollege('컴퓨터공학전공'), '정보의생명공학대학')
  assert.equal(getDepartmentCollege('기계공학부'), '공과대학')
  assert.equal(getDepartmentCollege('없는학과'), null)
})

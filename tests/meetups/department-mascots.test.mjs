import test from 'node:test'
import assert from 'node:assert/strict'
import { departmentMascot } from '../../lib/meetups/department-mascots.ts'

test('approved department characters have stable, distinct identities', () => {
  const names=['건축학과','경영학과','고고학과','컴퓨터공학부','기계공학부','간호학과']
  const mascots=names.map(departmentMascot)
  assert.equal(new Set(mascots.map(m=>m.image)).size,6)
  assert.ok(mascots.every(m=>m.image?.startsWith('/images/departments/')))
  assert.equal(departmentMascot('정보컴퓨터공학부').image,departmentMascot('컴퓨터공학부').image)
  assert.notEqual(departmentMascot('건축공학과').icon,departmentMascot('경제학부').icon)
})
test('remaining departments receive subject symbols, never an unrelated mascot', () => {
  assert.equal(departmentMascot('경제학부').icon,'ChartNoAxesCombined')
  assert.equal(departmentMascot('고분자공학과').icon,'Network')
  assert.equal(departmentMascot('간호학과').label,'간호학과 돌봄 수달')
  assert.equal(departmentMascot('이름이 없는 학과').image,undefined)
})

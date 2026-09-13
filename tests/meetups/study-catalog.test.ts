import assert from 'node:assert/strict'
import test from 'node:test'
import { createManualStudyCourse, getDepartmentCourseSuggestions, getStudyCourse, searchStudyCourses, STUDY_CURRICULUM_SOURCE } from '../../lib/meetups/study-catalog'

test('future energy first-year suggestions use verified common-department course identities', () => {
  const suggestions = getDepartmentCourseSuggestions({ department: '미래에너지전공', year: 1, semester: 1 })
  assert.deepEqual(suggestions.map(item => item.course.code), ['AN1600527', 'AN1500214', 'AN1500845', 'AN1501213', 'AN1101168'])
  assert.ok(suggestions.every(item => item.offeringDepartmentLabel === '첨단융합학부' && item.suggestedYear === 1))
  assert.equal(suggestions[0].course.id, 'pnu:AN1600527')
})

test('second-year relations are separate and an unknown department never inherits a curriculum', () => {
  const suggestions = getDepartmentCourseSuggestions({ department: '미래에너지공학과', year: 2, semester: 2 })
  assert.deepEqual(suggestions.map(item => item.course.code), ['NY2500249', 'NY2100768', 'NY2300811', 'NY3400019', 'NY2700318', 'NY2002085', 'NY2000242', 'NY2600051'])
  assert.ok(suggestions.every(item => item.offeringDepartmentLabel === '미래에너지전공'))
  for (const department of ['', '기계공학과', '나노에너지공학과', 'future energy', '<script>']) {
    assert.deepEqual(getDepartmentCourseSuggestions({ department, year: 1 }), [])
  }
  assert.deepEqual(getDepartmentCourseSuggestions({ department: '첨단융합학부', year: 2 }), [])
})

test('year is a suggestion filter, not an enrollment gate on explicitly searched courses', () => {
  assert.deepEqual(searchStudyCourses('일반물리', { department: '미래에너지전공', year: 4 }).map(course => course.code).sort(), ['AN1500214', 'AN1500215', 'CB1501005', 'CB1501009'])
  assert.equal(searchStudyCourses('AN 1500214', { department: '기계공학과', year: 4 })[0].id, 'pnu:AN1500214')
  assert.deepEqual(searchStudyCourses(''), [])
  assert.deepEqual(searchStudyCourses('확인되지 않은 과목'), [])
  assert.deepEqual(getDepartmentCourseSuggestions({ department: '미래에너지전공', year: 999 }), [])
})

test('manual subjects are explicitly unverified user input and reject empty or excessive input', () => {
  assert.deepEqual(createManualStudyCourse('  재료  역학  '), { kind: 'manual', title: '재료 역학' })
  assert.equal(createManualStudyCourse('  '), null)
  assert.equal(createManualStudyCourse('a'.repeat(81)), null)
  assert.equal(createManualStudyCourse('과목\u0000명'), null)
})

test('canonical course identity is stable, unique and independent from suggestion context', () => {
  const energy = getDepartmentCourseSuggestions({ department: 'pnu-future-energy' })
  const common = getDepartmentCourseSuggestions({ department: 'pnu-advanced-convergence' })
  assert.equal(energy.length, 62)
  assert.equal(new Set(energy.map(item => item.course.id)).size, 62)
  assert.equal(common.length, 11)
  for (const item of common) assert.equal(item.course, getStudyCourse(item.course.id))
  assert.equal(getStudyCourse('pnu:an1500214'), null)
  assert.equal(getStudyCourse('another-school:AN1500214'), null)
  assert.equal(getStudyCourse('custom'), null)
  assert.equal(getStudyCourse('__proto__'), null)
})

test('returned source-backed course records cannot overwrite later suggestions', () => {
  const first = getStudyCourse('pnu:AN1600527')!
  assert.throws(() => { (first as { title: string }).title = 'changed' }, TypeError)
  assert.equal(getStudyCourse(first.id)?.title, '공학미적분학')
  assert.equal(new URL(STUDY_CURRICULUM_SOURCE.url).hostname, 'ste.pusan.ac.kr')
  assert.match(STUDY_CURRICULUM_SOURCE.coverageNote, /연도 미표기/)
  assert.match(STUDY_CURRICULUM_SOURCE.coverageNote, /확인되지/)
})

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getDepartmentCourseSuggestions, getDepartmentStudyCoverage, getStudyCourse, getStudyCoursePhoto, searchStudyCourses, STUDY_DEPARTMENT_OPTIONS } from '../../lib/meetups/study-catalog'
import { PNU_DEPARTMENTS, getDepartmentCollege, searchDepartments } from '../../lib/pnu-departments'

test('2026 official departments include engineering additions and Yangsan undergraduate-entry programs', () => {
  for (const department of ['X-모빌리티융합학부', '스마트가전공학과', '약학부', '의생명공학전공', '데이터사이언스전공', '치의예과', '한의학전문대학원 학·석사통합과정']) {
    assert.ok(PNU_DEPARTMENTS.includes(department), department)
  }
  assert.equal(getDepartmentCollege('식물생명과학과'), '생명자원과학대학')
  assert.equal(getDepartmentCollege('간호학과'), '간호대학')
  assert.ok(searchDepartments('X-모빌리티').includes('X-모빌리티융합학부'))
  assert.equal(PNU_DEPARTMENTS.length, new Set(PNU_DEPARTMENTS).size)
  assert.deepEqual(STUDY_DEPARTMENT_OPTIONS.map(item => item.label), PNU_DEPARTMENTS)
})

test('coverage is explicit and course photos describe the subject rather than the selected department', () => {
  assert.equal(getDepartmentStudyCoverage('경영학과')?.courseCount, 13)
  assert.equal(getDepartmentStudyCoverage('인공지능전공')?.courseCount, 52)
  assert.equal(getDepartmentStudyCoverage('컴퓨터공학전공')?.courseCount, 56)
  assert.equal(getDepartmentStudyCoverage('국어국문학과'), null)
  for (const [title, photo] of [['공학미적분학', 'calculus'], ['경영통계학', 'calculus'], ['일반물리학(Ⅰ)', 'physics'], ['일반화학(Ⅰ)', 'chemistry'], ['C++프로그래밍과실습', 'programming'], ['자료구조', 'programming'], ['회계학원리', 'business']]) {
    assert.equal(getStudyCoursePhoto(title).src, `/social-scenes/course-${photo}.png`)
    assert.ok(getStudyCoursePhoto(title).description.includes('예시'))
  }
  assert.equal(getStudyCoursePhoto('사용자가 입력한 수업').src, '/images/meetups/meetup-study.webp')
})

test('verified curricula are department-specific, without silently inheriting energy or sibling majors', () => {
  assert.deepEqual(getDepartmentCourseSuggestions({ department: '경영학과', year: 1, semester: 1 }).map(item => item.course.code), ['DB1600346', 'DB1600357'])
  assert.deepEqual(getDepartmentCourseSuggestions({ department: '컴퓨터공학전공', year: 2, semester: 2 }).map(item => item.course.code), ['CB1501018', 'CB1501019', 'CB1501022', 'CB2001103', 'CB2001104', 'CB2001105', 'CB2001106'])
  assert.deepEqual(getDepartmentCourseSuggestions({ department: '인공지능전공', year: 1, semester: 1 }).map(item => item.course.code), ['CA1501006', 'CA1501028', 'CA2001141'])
  for (const department of ['간호학과', '국어국문학과', '기계공학부', '정보컴퓨터공학부', '데이터사이언스전공']) {
    assert.deepEqual(getDepartmentCourseSuggestions({ department }), [], department)
  }
  assert.equal(getDepartmentCourseSuggestions({ department: '컴퓨터공학전공', year: 1 }).length, 9)
})

test('new canonical subjects retain distinct course codes and remain explicitly searchable across majors', () => {
  assert.equal(getStudyCourse('pnu:DB1600358')?.title, '회계학원리')
  assert.equal(getStudyCourse('pnu:CB1501019')?.title, '자료구조')
  assert.equal(getStudyCourse('pnu:CA2001147')?.title, '자료구조')
  assert.equal(searchStudyCourses('자료구조', { department: '컴퓨터공학전공' })[0]?.code, 'CB1501019')
  assert.equal(searchStudyCourses('자료구조', { department: '인공지능전공' })[0]?.code, 'CA2001147')
  assert.equal(getDepartmentCourseSuggestions({ department: '미래에너지전공' }).length, 62)
})

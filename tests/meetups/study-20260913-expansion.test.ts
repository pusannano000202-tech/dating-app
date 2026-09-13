import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { getDepartmentCourseSuggestions, getDepartmentStudyCoverage, getDepartmentStudyOptions, getStudyCourse } from '../../lib/meetups/study-catalog'

test('math first-year courses come preloaded with official identities', () => {
  const rows = getDepartmentCourseSuggestions({ department: '수학과', year: 1 })
  assert.ok(rows.some(row => row.course.code === 'MA1500619' && row.course.title === '수학(I)'))
  assert.ok(rows.some(row => row.course.code === 'MA2200301' && row.suggestedSemester === 2))
  assert.ok(rows.every(row => row.offeringDepartmentLabel === '수학과'))
  assert.equal(getDepartmentStudyCoverage('수학과')?.curriculumYear, 2026)
})

test('faculty labels offer programmes without treating siblings as enrolled students', () => {
  for (const department of ['컴퓨터공학부', '정보컴퓨터공학부']) {
    assert.deepEqual(getDepartmentStudyOptions(department), ['컴퓨터공학전공', '인공지능전공'])
    assert.deepEqual(getDepartmentCourseSuggestions({ department }), [])
  }
  assert.deepEqual(getDepartmentStudyOptions('수학과'), [])
  assert.deepEqual(getDepartmentStudyOptions('정보컴퓨터공학부 임의이름'), [])
})

test('computer and AI cover all four regular years, never silently invent summer terms', () => {
  for (const department of ['컴퓨터공학전공', '인공지능전공']) {
    for (const year of [1, 2, 3, 4]) assert.ok(getDepartmentCourseSuggestions({ department, year }).length > 0, `${department} ${year}`)
  }
  assert.equal(getStudyCourse('pnu:CB2002509'), null)
  assert.equal(getStudyCourse('pnu:CA2002525'), null)
  assert.equal(getStudyCourse('pnu:CB2003050')?.title, '모빌리티보안')
  assert.equal(getStudyCourse('pnu:CA2001623')?.title, '인간컴퓨터상호작용')
})

test('each imported public source row retains code, title, year and term without duplicates', () => {
  type Row = {code:string;title:string;year:number;semesters:number[]}
  const sources = JSON.parse(readFileSync('docs/research/pnu-curriculum-20260913.json', 'utf8')) as {cse:{major:string;rows:Row[]}[];math:{rows:Row[]}}
  const groups = [...sources.cse.map(source => ({department:source.major === 'computer' ? '컴퓨터공학전공' : '인공지능전공',rows:source.rows})), {department:'수학과',rows:sources.math.rows}]
  for (const group of groups) for (const row of group.rows) {
    assert.equal(getStudyCourse(`pnu:${row.code}`)?.title, row.title, row.code)
    for (const semester of row.semesters) {
      const actual = getDepartmentCourseSuggestions({department:group.department,year:row.year,semester:semester as 1|2})
      assert.equal(actual.filter(item => item.course.code === row.code).length, 1, `${row.code} ${row.year}-${semester}`)
    }
  }
})

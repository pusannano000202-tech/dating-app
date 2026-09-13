import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { getDepartmentCourseSuggestions, getDepartmentStudyCoverage, getStudyCatalogCoverage, getStudyCourse, searchStudyCourses } from '../../lib/meetups/study-catalog'

test('official statistics, tourism and energy rows populate the requested real years', () => {
  const cases = [
    ['통계학과', 2, ['ST2200402', 'ST2200456', 'ST1600138', 'ST2200419', 'ST2200439', 'ST2000206', 'ST1600769', 'ST2200404', 'ST3600013']],
    ['관광컨벤션학과', 4, ['TC2700374', 'TC2900982', 'TC3200300', 'TC3400505', 'TC2001314', 'TC2700348', 'TC2700380', 'TC2900983', 'TC3500284']],
    ['미래에너지전공', 3, ['NY3400710', 'NY3500761', 'NY3300811', 'NY2002665', 'NY3300793', 'NY3400006', 'NY3600577', 'NY2002666', 'NY3400003', 'NY3300862', 'NY3300801', 'NY3500765', 'NY3600578', 'NY2002086', 'NY2002087', 'NY2200734', 'NY3600469', 'NY3300829', 'NY3300802', 'NY3500767']],
  ] as const
  for (const [department, year, codes] of cases) {
    const suggestions = getDepartmentCourseSuggestions({ department, year })
    assert.deepEqual(suggestions.map(item => item.course.code), [...codes])
    assert.ok(suggestions.every(item => item.suggestedYear === year && item.offeringDepartmentLabel === department))
  }
})

test('both statistics semesters share one canonical identity and one unfiltered card/search result', () => {
  const first = getDepartmentCourseSuggestions({ department: '통계학과', year: 1, semester: 1 })
  const second = getDepartmentCourseSuggestions({ department: '통계학과', year: 1, semester: 2 })
  const firstRelation = first.find(item => item.course.code === 'ST1600528')
  assert.ok(firstRelation)
  const firstCourse = firstRelation.course
  assert.equal(second.find(item => item.course.code === 'ST1600528')!.course, firstCourse)
  assert.equal(getStudyCourse('pnu:ST1600528'), firstCourse)
  assert.equal(searchStudyCourses('ST1600528').length, 1)
  assert.equal(getDepartmentCourseSuggestions({ department: '통계학과', year: 1 }).length, 4)
  assert.equal(getStudyCourse('pnu:ST2200419')?.title, '수리통계학(I)')
  assert.equal(getStudyCourse('pnu:ST2200439')?.title, '수리통계학(II)')
  assert.equal(getStudyCourse('pnu:ST1500644')?.title, '수학(Ⅱ)')
})

test('new official common rows are shared with energy without being assigned to unverified sibling profiles', () => {
  const common = getDepartmentCourseSuggestions({ department: '첨단융합학부' })
  const energyFirst = getDepartmentCourseSuggestions({ department: '미래에너지전공', year: 1 })
  assert.equal(common.length, 11)
  assert.deepEqual(common.map(item => item.course.id), energyFirst.map(item => item.course.id))
  for (const item of common) assert.equal(item.course, getStudyCourse(item.course.id))
  for (const department of ['광반도체전공', '양자기술전공', '나노에너지공학과', '관광학과']) {
    assert.deepEqual(getDepartmentCourseSuggestions({ department }), [], department)
  }
  assert.equal(getStudyCourse('pnu:NY1200765'), null, 'summer course is not forced into a regular semester')
})

test('coverage counts unique courses and distinguishes unknown curriculum year from retrieval date', () => {
  for (const [department, count] of [['통계학과', 32], ['관광컨벤션학과', 43], ['첨단융합학부', 11], ['미래에너지전공', 62]] as const) {
    assert.equal(getDepartmentStudyCoverage(department)?.courseCount, count)
  }
  const energy = getDepartmentStudyCoverage('미래에너지전공')!
  assert.equal(energy.curriculumYear, null)
  assert.match(energy.coverageNote, /연도 미표기/)
  assert.doesNotMatch(energy.title, /2026/)
  assert.match(getDepartmentStudyCoverage('첨단융합학부')!.title, /2026/)
  assert.match(getDepartmentStudyCoverage('통계학과')!.title, /2026/)
  assert.equal(getDepartmentStudyCoverage('통계학과')!.curriculumYear, 2026)
  assert.equal(getStudyCatalogCoverage().verifiedCourses, 305)
  assert.equal(getStudyCatalogCoverage().registeredDepartments, 133)
  assert.deepEqual([...getStudyCatalogCoverage().supportedDepartments].sort(), ['경영학과', '관광컨벤션학과', '미래에너지전공', '수학과', '인공지능전공', '첨단융합학부', '컴퓨터공학전공', '통계학과'].sort())
})

test('all 137 researched codes and 138 regular-term memberships match source rows, preserving numbered titles', () => {
  type SourceRow = { courseCode: string; rawTitle: string; year: number; semesters: (1 | 2)[] }
  const research = JSON.parse(readFileSync('artifacts/research/pnu-curriculum-20260912/verified-html-courses.json', 'utf8')) as { sources: { department: string; records: SourceRow[] }[] }
  const codes = new Set<string>()
  let memberships = 0
  for (const source of research.sources) for (const row of source.records) {
    codes.add(row.courseCode)
    // English parentheticals are omitted, but (I)/(II) and Korean subtitles are not.
    const title = row.rawTitle.replace(/^[◎♣]\s*/, '').split(/\s*\((?!I{1,3}\))(?=[A-Za-z])/)[0].trim().replace(/\s*\(\s*/g, '(').replace(/\s*\)/g, ')')
    assert.equal(getStudyCourse(`pnu:${row.courseCode}`)?.title, title, row.courseCode)
    for (const semester of row.semesters) {
      memberships++
      const actual = getDepartmentCourseSuggestions({ department: source.department, year: row.year, semester })
      assert.equal(actual.filter(item => item.course.code === row.courseCode).length, 1, `${row.courseCode} / ${row.year}-${semester}`)
    }
  }
  assert.equal(codes.size, 137)
  assert.equal(memberships, 138)
})

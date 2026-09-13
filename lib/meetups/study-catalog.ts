import type { StudyGuideKind } from './study-guide'
import { PNU_DEPARTMENTS } from '../pnu-departments'
import { ADDITIONAL_STUDY_COURSE_ROWS, ADDITIONAL_STUDY_CURRICULA } from './study-course-data'

export type StudyCourse = Readonly<{ id: string; schoolId: 'pnu'; code: string; title: string; guideKind: StudyGuideKind }>
export type StudyCourseSuggestion = Readonly<{ course: StudyCourse; suggestedYear: number; suggestedSemester: 1 | 2; curriculumId: string; offeringDepartmentLabel: string }>
export type StudyCourseContext = Readonly<{ department: string; year?: number; semester?: 1 | 2 }>

export const STUDY_CURRICULUM_SOURCE = Object.freeze({
  title: '부산대학교 미래에너지전공 현행 교육과정 (연도 미표기)',
  url: 'https://ste.pusan.ac.kr/ste/9579/subview.do',
  registrationNoticeUrl: 'https://energy.pusan.ac.kr/bbs/energy/586/1035751/artclView.do',
  retrievedAt: '2026-09-12',
  curriculumYear: null,
  coverageNote: '공식 현행 표의 2~4학년 정규학기 51과목(교육과정 연도 미표기)과 2026 첨단융합 공통 1학년 11과목을 연결했어요. 여름 산학프로젝트는 제외했으며 실제 개설 분반·시간표·개인 적용 교육과정은 확인되지 않았어요.',
})

export const STUDY_DEPARTMENT_OPTIONS = Object.freeze(PNU_DEPARTMENTS.map(label => Object.freeze({
  id: label === '미래에너지전공' ? 'pnu-future-energy' : label === '첨단융합학부' ? 'pnu-advanced-convergence' : `pnu:${label}`,
  label,
})))

// Curriculum membership is deliberately separate from course identity. A course can
// be used by another curriculum without creating a second recruitment identity.
const curriculumId = 'pnu-future-energy-reference-20260910'
const courseRows: readonly (readonly [string, string, StudyGuideKind, 1 | 2, 1 | 2])[] = [
  ['AN1600527', '공학미적분학', 'major-math', 1, 1],
  ['AN1500214', '일반물리학(Ⅰ)', 'major-physics', 1, 1],
  ['AN1500845', '일반화학(Ⅰ)', 'major-general', 1, 1],
  ['AN1500385', '공학수학', 'major-math', 1, 2],
  ['AN1500215', '일반물리학(Ⅱ)', 'major-physics', 1, 2],
  ['AN1500847', '일반화학(Ⅱ)', 'major-general', 1, 2],
  ['AN1501145', '인공지능프로그래밍', 'major-general', 1, 2],
  ['NY2600025', '전자기학', 'major-physics', 2, 1],
  ['NY2600840', '재료공학개론', 'major-general', 2, 1],
  ['NY3400004', '회로이론및실험', 'major-general', 2, 1],
  ['NY2200581', '정역학', 'major-physics', 2, 1],
  ['NY2500249', '파동및광학', 'major-physics', 2, 2],
  ['NY2100768', '전기화학', 'major-general', 2, 2],
  ['NY2300811', '동역학', 'major-physics', 2, 2],
  ['NY3400019', '기능성재료공학', 'major-general', 2, 2],
]

const coursesById = new Map<string, StudyCourse>()
function canonicalCourse(code: string, title: string, guideKind: StudyGuideKind): StudyCourse {
  const id = `pnu:${code}`
  const existing = coursesById.get(id)
  if (existing) {
    if (existing.title !== title || existing.guideKind !== guideKind) throw new Error(`Conflicting study course: ${id}`)
    return existing
  }
  const course = Object.freeze({ id, schoolId: 'pnu' as const, code, title, guideKind })
  coursesById.set(id, course)
  return course
}

const energyRelations: readonly StudyCourseSuggestion[] = Object.freeze(courseRows.map(([code, title, guideKind, suggestedYear, suggestedSemester]) => Object.freeze({
  course: canonicalCourse(code, title, guideKind),
  suggestedYear,
  suggestedSemester,
  curriculumId,
  offeringDepartmentLabel: suggestedYear === 1 ? '첨단융합학부' : '미래에너지전공',
})))

const relations: readonly StudyCourseSuggestion[] = Object.freeze([...energyRelations, ...ADDITIONAL_STUDY_COURSE_ROWS.map(([sourceId, code, title, guideKind, suggestedYear, suggestedSemester]) => Object.freeze({
  course: canonicalCourse(code, title, guideKind),
  suggestedYear,
  suggestedSemester,
  curriculumId: sourceId,
  offeringDepartmentLabel: ADDITIONAL_STUDY_CURRICULA.find(source => source.id === sourceId)!.department,
}))])

function normalizeQuery(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, '').toLocaleLowerCase('ko-KR')
}

function departmentKind(department: string): 'energy' | 'common' | null {
  const value = normalizeQuery(department)
  if (['pnu-future-energy', '미래에너지전공', '미래에너지공학과', '첨단융합학부미래에너지전공'].includes(value)) return 'energy'
  if (['pnu-advanced-convergence', '첨단융합학부'].includes(value)) return 'common'
  return null
}

/** An ambiguous faculty is a chooser, never silently assigned to one major.
 * Current CSE curriculum source lists these two programmes separately.
 * This changes recommendations only; profile membership and room pools stay intact.
 */
export function getDepartmentStudyOptions(department: string): readonly string[] {
  const value = normalizeQuery(department)
  if (['컴퓨터공학부', '정보컴퓨터공학부'].includes(value)) return ['컴퓨터공학전공', '인공지능전공']
  return []
}

/** Suggestions only: this must never be used as enrollment or room authorization. */
export function getDepartmentCourseSuggestions(context: StudyCourseContext): readonly StudyCourseSuggestion[] {
  const kind = departmentKind(context.department)
  const source = ADDITIONAL_STUDY_CURRICULA.find(item => normalizeQuery(item.department) === normalizeQuery(context.department))
  if (!kind && !source) return []
  const matching = relations.filter(item => (kind ? [curriculumId, 'pnu-advanced-convergence-2026', 'pnu-future-energy-current'].includes(item.curriculumId) && (kind === 'energy' || item.suggestedYear === 1) : item.curriculumId === source?.id)
    && (context.year === undefined || item.suggestedYear === context.year)
    && (context.semester === undefined || item.suggestedSemester === context.semester))
  // One card per course; a semester filter selects the matching curriculum relation.
  const seen = new Set<string>()
  return matching.filter(item => {
    if (seen.has(item.course.id)) return false
    seen.add(item.course.id)
    return true
  })
}

/** Coverage describes verified recommendations, never enrollment or access. */
export function getDepartmentStudyCoverage(department: string) {
  const kind = departmentKind(department)
  if (kind) {
    const source = kind === 'common' ? ADDITIONAL_STUDY_CURRICULA.find(item => item.id === 'pnu-advanced-convergence-2026')! : STUDY_CURRICULUM_SOURCE
    return { ...source, courseCount: getDepartmentCourseSuggestions({ department }).length }
  }
  const source = ADDITIONAL_STUDY_CURRICULA.find(item => normalizeQuery(item.department) === normalizeQuery(department))
  return source ? { ...source, courseCount: getDepartmentCourseSuggestions({ department }).length } : null
}

export function getStudyCatalogCoverage() {
  return {
    registeredDepartments: PNU_DEPARTMENTS.length,
    supportedDepartments: PNU_DEPARTMENTS.filter(department => getDepartmentStudyCoverage(department) !== null),
    verifiedCourses: new Set(relations.map(item => item.course.id)).size,
  }
}

/** Editorial subject photos, not photos of actual courses, students or live rooms. */
export function getStudyCoursePhoto(title: string): Readonly<{ src: string; description: string }> {
  if (/미적분|수학|대수|통계|확률|해석학|기하학|방정식|집합론|정수론|조합론|함수론|벡터해석/.test(title)) return { src: '/social-scenes/course-calculus.png', description: '수식과 풀이 노트 · 과목 활동 예시' }
  if (/화학|재료/.test(title)) return { src: '/social-scenes/course-chemistry.png', description: '화학·재료 탐구 · 과목 활동 예시' }
  if (/물리|역학|전자기|광학|회로/.test(title)) return { src: '/social-scenes/course-physics.png', description: '물리·회로 실험 · 과목 활동 예시' }
  if (/프로그래밍|자료구조|컴퓨터|인공지능|데이터|인터넷|AI|머신러닝|딥러닝|소프트웨어|운영체제|알고리즘|컴파일러|유닉스|네트워크|보안|클라우드|IoT|블록체인|자연어|가상현실|멀티미디어|프로그래밍언어|시각컴퓨팅|생성모델|강화학습|임베디드/.test(title)) return { src: '/social-scenes/course-programming.png', description: '코드와 컴퓨터 · 과목 활동 예시' }
  if (/경영|경제|회계|재무|마케팅|투자|매니지먼트|인적자원/.test(title)) return { src: '/social-scenes/course-business.png', description: '경영 노트와 차트 · 과목 활동 예시' }
  return { src: '/images/meetups/meetup-study.webp', description: '함께 공부하는 활동 예시' }
}

/** Explicit search includes other years for retakes / dual majors; no silent enrollment. */
export function searchStudyCourses(query: string, context?: Partial<StudyCourseContext>): readonly StudyCourse[] {
  const normalized = normalizeQuery(query)
  if (!normalized || normalized.length > 80) return []
  const preferred = new Set(context?.department
    ? getDepartmentCourseSuggestions({ department: context.department, year: context.year }).map(item => item.course.id)
    : [])
  return [...coursesById.values()]
    .filter(course => normalizeQuery(`${course.title}${course.code}`).includes(normalized))
    .sort((left, right) => Number(preferred.has(right.id)) - Number(preferred.has(left.id)))
}

export function getStudyCourse(courseId: string): StudyCourse | null {
  return coursesById.get(courseId) ?? null
}

/** Manual input stays distinguishable from the source-backed canonical catalog. */
export function createManualStudyCourse(title: string): Readonly<{ kind: 'manual'; title: string }> | null {
  if (/[\u0000-\u001f\u007f]/u.test(title)) return null
  const normalized = title.normalize('NFC').trim().replace(/\s+/g, ' ')
  if (!normalized || [...normalized].length > 80) return null
  return { kind: 'manual', title: normalized }
}

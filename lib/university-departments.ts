import rawDepartmentData from './data/quantum-university-departments.json'
import { findUniversityThemeBySchool, getUniversityThemeOptions } from './university-theme'

export interface UniversityDepartmentOption {
  universityId: string
  universityName: string
  sourceSchoolName: string
  college: string
  name: string
  rawName: string
  dayNight: string
  status: string
  departmentCode: string
  majorCategory: string
  degreeCourse: string
  departmentLocation: string
}

export interface UniversityDepartmentGroup {
  universityId: string
  universityName: string
  sourceSchoolName: string
  college: string
  departmentNamesForAppSearch: string[]
  departments: UniversityDepartmentOption[]
}

export interface UniversityDepartmentStats {
  universityCount: number
  activeDepartmentRows: number
  themeIdsMissingOfficialDepartments: string[]
  officialDepartmentIdsNotInThemeRegistry: string[]
}

type RawDepartmentData = {
  universities: RawUniversityDepartment[]
}

type RawUniversityDepartment = {
  id: string
  universityName: string
  sourceSchoolName: string
  activeDepartmentRows?: number
  departments: RawDepartmentGroup[]
}

type RawDepartmentGroup = {
  college: string
  departmentNamesForAppSearch?: string[]
  departments?: RawDepartmentRow[]
}

type RawDepartmentRow = {
  name: string
  rawName?: string
  dayNight?: string
  status?: string
  departmentCode?: string
  majorCategoryLarge?: string
  majorCategoryMedium?: string
  majorCategorySmall?: string
  degreeCourse?: string
  departmentLocation?: string
}

const DEPARTMENT_DATA = rawDepartmentData as RawDepartmentData
const OFFICIAL_UNIVERSITIES = DEPARTMENT_DATA.universities
const UNIVERSITIES_BY_ID = new Map(OFFICIAL_UNIVERSITIES.map((university) => [university.id, university]))

export function getUniversityDepartmentGroupsBySchool(
  school: string | null | undefined,
): UniversityDepartmentGroup[] {
  const theme = findUniversityThemeBySchool(school)
  return getUniversityDepartmentGroupsByThemeId(theme.id)
}

export function getUniversityDepartmentGroupsByThemeId(
  themeId: string | null | undefined,
): UniversityDepartmentGroup[] {
  const university = UNIVERSITIES_BY_ID.get((themeId ?? '').trim())
  if (!university) return []

  return university.departments.map((group) => ({
    universityId: university.id,
    universityName: university.universityName,
    sourceSchoolName: university.sourceSchoolName,
    college: group.college,
    departmentNamesForAppSearch: group.departmentNamesForAppSearch ?? [],
    departments: normalizeDepartmentRows(university, group),
  }))
}

export function searchUniversityDepartments(
  school: string | null | undefined,
  query: string,
  limit = 48,
): UniversityDepartmentOption[] {
  const groups = getUniversityDepartmentGroupsBySchool(school)
  const normalizedQuery = normalizeDepartmentSearchText(query)
  const options = dedupeDepartmentOptions(groups.flatMap((group) => group.departments))

  if (!normalizedQuery) return options.slice(0, limit)

  return options
    .filter((option) => {
      const haystack = normalizeDepartmentSearchText([
        option.name,
        option.college,
        option.majorCategory,
        option.dayNight,
        option.degreeCourse,
        option.departmentLocation,
      ].join(' '))
      return haystack.includes(normalizedQuery)
    })
    .slice(0, limit)
}

export function getUniversityDepartmentStats(): UniversityDepartmentStats {
  const officialDepartmentIds = new Set(OFFICIAL_UNIVERSITIES.map((university) => university.id))
  const themeIds = new Set(getUniversityThemeOptions().map((theme) => theme.id))

  return {
    universityCount: OFFICIAL_UNIVERSITIES.length,
    activeDepartmentRows: OFFICIAL_UNIVERSITIES.reduce(
      (sum, university) => sum + countActiveDepartmentRows(university),
      0,
    ),
    themeIdsMissingOfficialDepartments: Array.from(themeIds)
      .filter((id) => !officialDepartmentIds.has(id))
      .sort(),
    officialDepartmentIdsNotInThemeRegistry: Array.from(officialDepartmentIds)
      .filter((id) => !themeIds.has(id))
      .sort(),
  }
}

function normalizeDepartmentRows(
  university: RawUniversityDepartment,
  group: RawDepartmentGroup,
): UniversityDepartmentOption[] {
  return (group.departments ?? [])
    .filter((row) => !isClosedDepartmentStatus(row.status))
    .map((row) => ({
      universityId: university.id,
      universityName: university.universityName,
      sourceSchoolName: university.sourceSchoolName,
      college: group.college,
      name: row.name,
      rawName: row.rawName ?? row.name,
      dayNight: row.dayNight ?? '',
      status: row.status ?? '',
      departmentCode: row.departmentCode ?? '',
      majorCategory: [row.majorCategoryLarge, row.majorCategoryMedium, row.majorCategorySmall]
        .filter(Boolean)
        .join(' / '),
      degreeCourse: row.degreeCourse ?? '',
      departmentLocation: row.departmentLocation ?? '',
    }))
}

function countActiveDepartmentRows(university: RawUniversityDepartment): number {
  return university.departments.reduce(
    (sum, group) => sum + normalizeDepartmentRows(university, group).length,
    0,
  )
}

function dedupeDepartmentOptions(options: UniversityDepartmentOption[]): UniversityDepartmentOption[] {
  const seen = new Set<string>()
  const result: UniversityDepartmentOption[] = []

  for (const option of options) {
    const key = normalizeDepartmentSearchText(`${option.name}|${option.college}`)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(option)
  }

  return result
}

function isClosedDepartmentStatus(status: string | null | undefined): boolean {
  return (status ?? '').includes('폐지')
}

function normalizeDepartmentSearchText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '')
    .trim()
}

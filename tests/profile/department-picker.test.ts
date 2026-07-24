import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import DepartmentPicker, {
  type DepartmentPickerProps,
} from '../../components/profile/DepartmentPicker'
import {
  hasExactDepartment,
  parseDepartmentCatalog,
  readDepartmentCatalogResponse,
  resolveDepartmentLoadStateForSchoolChange,
  resolveDepartmentValidationForSchoolChange,
  resolveDepartmentPickerValidationState,
  resolveHydrationSafeInitialProfileSchool,
  resolveInitialProfileSchool,
  searchDepartmentCatalog,
  shouldConfirmDepartmentMismatch,
  shouldConfirmUnverifiedDepartment,
} from '../../lib/profile/department-catalog'

const ROOT = process.cwd()
const COMPONENT_PATH = join(ROOT, 'components', 'profile', 'DepartmentPicker.tsx')
const BASIC_INFO_FORM_PATH = join(ROOT, 'components', 'profile', 'BasicInfoForm.tsx')

const VALID_CATALOG = {
  schoolId: 'pnu',
  schoolName: '부산대학교',
  sourceType: '대학알리미',
  sourceDate: '2024-10-07',
  departments: [
    { name: 'Computer   Science', college: '공과 대학', status: '기존' },
    { name: '간호학과', college: '간호대학', status: '기존' },
  ],
}

function renderPicker(overrides: Partial<DepartmentPickerProps> = {}): string {
  return renderToStaticMarkup(React.createElement(DepartmentPicker, {
    schoolId: '',
    value: '기존 학과',
    onChange: () => undefined,
    allowCustomEntry: true,
    ...overrides,
  }))
}

test('catalog parser accepts only the requested school and valid department rows', () => {
  const catalog = parseDepartmentCatalog(VALID_CATALOG, 'pnu')

  assert.ok(catalog)
  assert.equal(catalog.schoolName, '부산대학교')
  assert.equal(catalog.departments.length, 2)
  assert.equal(parseDepartmentCatalog(VALID_CATALOG, 'yonsei'), null)
  assert.equal(parseDepartmentCatalog({
    ...VALID_CATALOG,
    departments: [{ name: '컴퓨터공학과', college: '' }],
  }, 'pnu'), null)
})

test('catalog parser rejects stale metadata, oversized payloads, and abolished rows', () => {
  assert.equal(parseDepartmentCatalog({ ...VALID_CATALOG, sourceDate: '2025-01-01' }, 'pnu'), null)
  assert.equal(parseDepartmentCatalog({ ...VALID_CATALOG, sourceType: 'unknown' }, 'pnu'), null)
  assert.equal(parseDepartmentCatalog({
    ...VALID_CATALOG,
    departments: Array.from({ length: 501 }, (_, index) => ({
      name: `학과 ${index}`,
      college: '단과대',
      status: '기존',
    })),
  }, 'pnu'), null)
  assert.equal(parseDepartmentCatalog({
    ...VALID_CATALOG,
    departments: [{ name: '폐지학과', college: '단과대', status: '폐지' }],
  }, 'pnu'), null)
  assert.equal(parseDepartmentCatalog({
    ...VALID_CATALOG,
    departments: [{ name: '가'.repeat(301), college: '단과대', status: '기존' }],
  }, 'pnu'), null)
})

test('runtime catalog response rejects oversized bodies before JSON parsing', async () => {
  const validResponse = new Response(JSON.stringify(VALID_CATALOG), {
    headers: { 'content-type': 'application/json' },
  })
  assert.deepEqual(await readDepartmentCatalogResponse(validResponse), VALID_CATALOG)

  const oversizedResponse = new Response(`{"padding":"${'x'.repeat(300_000)}"}`, {
    headers: { 'content-type': 'application/json' },
  })
  await assert.rejects(
    () => readDepartmentCatalogResponse(oversizedResponse),
    /Department catalog response is too large/,
  )
})

test('department search normalizes whitespace and case across names and colleges', () => {
  const catalog = parseDepartmentCatalog(VALID_CATALOG, 'pnu')
  assert.ok(catalog)

  assert.deepEqual(
    searchDepartmentCatalog(catalog.departments, '  computer science  '),
    [catalog.departments[0]],
  )
  assert.deepEqual(
    searchDepartmentCatalog(catalog.departments, '  공과   대학 '),
    [catalog.departments[0]],
  )
  assert.deepEqual(searchDepartmentCatalog(catalog.departments, ''), catalog.departments)
})

test('existing department validation uses exact catalog names', () => {
  const catalog = parseDepartmentCatalog(VALID_CATALOG, 'pnu')
  assert.ok(catalog)

  assert.equal(hasExactDepartment(catalog.departments, 'Computer   Science'), true)
  assert.equal(hasExactDepartment(catalog.departments, 'computer science'), false)
  assert.equal(hasExactDepartment(catalog.departments, 'Computer Science'), false)
})

test('mismatch confirmation stays latched until the school-change value is cleared', () => {
  const catalog = parseDepartmentCatalog(VALID_CATALOG, 'pnu')
  assert.ok(catalog)

  assert.equal(
    shouldConfirmDepartmentMismatch(catalog.departments, '기존 학과', '기존 학과'),
    true,
  )
  assert.equal(
    shouldConfirmDepartmentMismatch(catalog.departments, '공과', '기존 학과'),
    true,
  )
  assert.equal(
    shouldConfirmDepartmentMismatch(catalog.departments, '간호학과', '기존 학과'),
    true,
  )
  assert.equal(
    shouldConfirmDepartmentMismatch(catalog.departments, '새 입력', ''),
    false,
  )
  assert.equal(
    shouldConfirmUnverifiedDepartment('기존 학과', '기존 학과', true, true),
    true,
  )
  assert.equal(
    shouldConfirmUnverifiedDepartment('기존 학과', '기존 학과', false, true),
    false,
  )
  assert.equal(
    shouldConfirmUnverifiedDepartment('새 입력', '기존 학과', true, true),
    true,
  )
  assert.equal(
    shouldConfirmUnverifiedDepartment('새 입력', '', true, true),
    false,
  )
})

test('department validation blocks only loading or unresolved confirmation states', () => {
  assert.equal(resolveDepartmentPickerValidationState({
    value: '',
    loadState: 'loading',
    requiresConfirmation: false,
    explicitlyKept: false,
  }), 'ready')
  assert.equal(resolveDepartmentPickerValidationState({
    value: '컴퓨터공학과',
    loadState: 'loading',
    requiresConfirmation: false,
    explicitlyKept: false,
  }), 'loading')
  assert.equal(resolveDepartmentPickerValidationState({
    value: '기존 학과',
    loadState: 'ready',
    requiresConfirmation: true,
    explicitlyKept: false,
  }), 'confirmation-required')
  assert.equal(resolveDepartmentPickerValidationState({
    value: '기존 학과',
    loadState: 'ready',
    requiresConfirmation: true,
    explicitlyKept: true,
  }), 'ready')
})

test('route school only overrides an existing profile inside explicit dev preview', () => {
  assert.equal(resolveInitialProfileSchool({
    profileSchool: '부산대학교',
    routeSchool: '아주대학교',
    storedSchool: '연세대학교',
    isDevPreview: false,
  }), '부산대학교')
  assert.equal(resolveInitialProfileSchool({
    profileSchool: '부산대학교',
    routeSchool: '아주대학교',
    storedSchool: '연세대학교',
    isDevPreview: true,
  }), '아주대학교')
  assert.equal(resolveInitialProfileSchool({
    routeSchool: '아주대학교',
    storedSchool: '연세대학교',
    isDevPreview: false,
  }), '아주대학교')
  assert.equal(resolveInitialProfileSchool({
    profileSchool: '  ',
    storedSchool: '연세대학교',
    isDevPreview: false,
  }), '연세대학교')
})

test('hydration-safe school initialization uses only server-known values', () => {
  assert.equal(resolveHydrationSafeInitialProfileSchool({
    profileSchool: '  부산대학교  ',
    defaultSchool: '서울대학교',
  }), '부산대학교')
  assert.equal(resolveHydrationSafeInitialProfileSchool({
    profileSchool: '  ',
    defaultSchool: '부산대학교',
  }), '부산대학교')
})

test('school changes lock only non-empty departments until the new catalog is ready', () => {
  assert.equal(resolveDepartmentValidationForSchoolChange({
    currentSchoolId: 'pnu',
    nextSchoolId: 'pnu',
    department: '컴퓨터공학과',
    currentState: 'confirmation-required',
  }), 'confirmation-required')
  assert.equal(resolveDepartmentValidationForSchoolChange({
    currentSchoolId: 'pnu',
    nextSchoolId: 'ajou',
    department: '컴퓨터공학과',
    currentState: 'ready',
  }), 'loading')
  assert.equal(resolveDepartmentValidationForSchoolChange({
    currentSchoolId: 'pnu',
    nextSchoolId: 'ajou',
    department: '  ',
    currentState: 'confirmation-required',
  }), 'ready')
  assert.equal(resolveDepartmentValidationForSchoolChange({
    currentSchoolId: '',
    nextSchoolId: '',
    department: '직접입력학과',
    currentState: 'ready',
  }), 'ready')
})

test('picker treats the first render for a new school as loading before effects run', () => {
  assert.equal(resolveDepartmentLoadStateForSchoolChange({
    schoolId: 'ajou',
    schoolChanged: true,
    loadState: 'ready',
  }), 'loading')
  assert.equal(resolveDepartmentLoadStateForSchoolChange({
    schoolId: 'ajou',
    schoolChanged: false,
    loadState: 'ready',
  }), 'ready')
  assert.equal(resolveDepartmentLoadStateForSchoolChange({
    schoolId: '',
    schoolChanged: true,
    loadState: 'error',
  }), 'loading')
})

test('no-school state keeps custom entry available only when allowed', () => {
  const customMarkup = renderPicker()
  assert.match(customMarkup, /학교를 먼저 선택/)
  assert.match(customMarkup, /직접 입력/)
  assert.doesNotMatch(customMarkup, /<input[^>]+\sdisabled=""/)

  const listOnlyMarkup = renderPicker({ allowCustomEntry: false })
  assert.match(listOnlyMarkup, /<input[^>]+\sdisabled=""/)
  assert.doesNotMatch(listOnlyMarkup, /기존 입력 유지/)
})

test('picker owns one school catalog request, aborts stale requests, and exposes mismatch actions', () => {
  const source = readFileSync(COMPONENT_PATH, 'utf8')

  assert.match(source, /new AbortController\(\)/)
  assert.match(source, /fetch\(`\/university-departments\/\$\{encodeURIComponent\(schoolId\)\}\.json`/)
  assert.match(source, /signal:\s*controller\.signal/)
  assert.match(source, /controller\.abort\(\)/)
  assert.match(source, /학과 비우기/)
  assert.match(source, /onChange\(''\)/)
  assert.match(source, /department\.name/)
  assert.match(source, /department\.college/)
  assert.match(source, /z-50/)
  assert.match(source, /break-words/)
  assert.match(source, /suggestionMaxHeight/)
  assert.match(source, /window\.innerHeight/)
  assert.match(source, /readDepartmentCatalogResponse\(response\)/)
  assert.match(source, /htmlFor=\{inputId\}/)
  assert.match(source, /aria-activedescendant/)
  assert.match(source, /event\.key === 'ArrowDown'/)
  assert.match(source, /event\.key === 'ArrowUp'/)
  assert.match(source, /setActiveIndex/)
  assert.match(source, /onValidationChange\?\.\(validationState\)/)
  assert.match(source, /effectiveLoadState = resolveDepartmentLoadStateForSchoolChange/)
  assert.match(source, /inputDisabled = hasCatalogMismatch \|\|/)
  assert.match(source, /role="option"[\s\S]*tabIndex=\{-1\}/)
  assert.doesNotMatch(source, /기존 입력 유지/)
  assert.match(source, /학과 비우기/)
})

test('BasicInfoForm delegates school-aware department selection without PNU-only state', () => {
  const source = readFileSync(BASIC_INFO_FORM_PATH, 'utf8')

  assert.match(source, /import DepartmentPicker from ['"]@\/components\/profile\/DepartmentPicker['"]/)
  assert.doesNotMatch(source, /pnu-departments/)
  assert.doesNotMatch(source, /getDepartmentCollege|searchDepartments|deptSuggestions|deptRef/)
  assert.match(
    source,
    /<DepartmentPicker[\s\S]*schoolId=\{selectedSchoolTheme\?\.id \?\? ''\}[\s\S]*value=\{department\}[\s\S]*onChange=\{setDepartment\}[\s\S]*allowCustomEntry=\{true\}/,
  )
  assert.match(source, /const selectedSchoolTheme = resolveSchoolTheme\(school\)/)
  assert.match(source, /resolveInitialFormSchool\(initialValue\?\.school\)/)
  assert.match(source, /routeTheme = resolveSchoolTheme\(params\.get\('school'\)/)
  assert.match(source, /resolveInitialProfileSchool\(\{/)
  assert.match(source, /isDevPreview = isDevPreviewClientSession\(\)/)
  assert.match(source, /applySchoolThemeIfKnown\(school\)/)
  assert.match(source, /window\.history\.replaceState/)
  assert.match(source, /changeSchool\(theme\.name\)[\s\S]*persistFormSchoolTheme\(theme\)/)
  assert.match(source, /onValidationChange=\{setDepartmentValidationState\}/)
  assert.match(source, /departmentValidationState === 'confirmation-required'/)
  assert.match(source, /departmentValidationState !== 'ready'/)
})

test('BasicInfoForm keeps browser-only school restoration out of the first render', () => {
  const source = readFileSync(BASIC_INFO_FORM_PATH, 'utf8')

  assert.doesNotMatch(source, /useState\(\(\) => resolveInitialFormSchool\(/)
  assert.match(source, /resolveHydrationSafeInitialProfileSchool/)
  assert.match(source, /useEffect\(\(\) => \{[\s\S]*resolveInitialFormSchool[\s\S]*setSchool/)
  assert.ok(
    source.indexOf('const restoredSchool = resolveInitialFormSchool') <
      source.indexOf('applySchoolThemeIfKnown(school)'),
  )
  assert.match(source, /const \[schoolRestoreComplete, setSchoolRestoreComplete\] = useState\(false\)/)
  assert.match(source, /setSchoolRestoreComplete\(true\)/)
  assert.doesNotMatch(source, /if \(restoredSchool === hydrationSafeInitialSchool\) return/)
  assert.match(
    source,
    /useEffect\(\(\) => \{\s*if \(!schoolRestoreComplete\) return\s*applySchoolThemeIfKnown\(school\)/,
  )
})

test('BasicInfoForm locks department validation synchronously before changing schools', () => {
  const source = readFileSync(BASIC_INFO_FORM_PATH, 'utf8')

  assert.match(
    source,
    /setDepartmentValidationState\([\s\S]*resolveDepartmentValidationForSchoolChange[\s\S]*\)[\s\S]*setSchool\(nextSchool\)/,
  )
  assert.match(source, /onChange=\{\(event\) => changeSchool\(event\.target\.value\)\}/)
  assert.match(source, /changeSchool\(theme\.name\)[\s\S]*persistFormSchoolTheme\(theme\)/)
  assert.match(source, /currentSchoolId: selectedSchoolTheme\?\.id \?\? ''/)
  assert.match(source, /nextSchoolId: resolveSchoolTheme\(nextSchool\)\?\.id \?\? ''/)
})

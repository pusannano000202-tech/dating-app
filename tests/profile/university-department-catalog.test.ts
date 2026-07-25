import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { SCHOOL_THEMES, type SchoolTheme } from '../../lib/school-theme'

type Department = {
  name: string
  college: string
  status: string
}

type SchoolCatalog = {
  schoolId: string
  schoolName: string
  sourceType: '대학알리미'
  sourceDate: '2024-10-07'
  departments: Department[]
}

const ROOT = process.cwd()
const RUNTIME_DIRECTORY = join(ROOT, 'public', 'university-departments')
const EXPECTED_RUNTIME_KEYS = [
  'schoolId',
  'schoolName',
  'sourceType',
  'sourceDate',
  'departments',
]
const EXPECTED_DEPARTMENT_KEYS = ['name', 'college', 'status']

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

function readRuntimeCatalog(theme: SchoolTheme): SchoolCatalog {
  return readJson<SchoolCatalog>(join(RUNTIME_DIRECTORY, `${theme.id}.json`))
}

function assertSortedUniqueSegments(value: string, label: string): void {
  const segments = value.split(' / ')
  assert.deepEqual(
    segments,
    [...new Set(segments)].sort(),
    `${label} must contain sorted unique values`,
  )
}

test('runtime catalog file ids exactly match all 59 school theme ids', () => {
  assert.equal(SCHOOL_THEMES.length, 59, 'SCHOOL_THEMES must contain exactly 59 schools')
  assert.equal(
    new Set(SCHOOL_THEMES.map((theme) => theme.id)).size,
    59,
    'SCHOOL_THEMES must not contain duplicate ids',
  )
  assert.ok(existsSync(RUNTIME_DIRECTORY), 'runtime catalog directory must exist')

  const actualFiles = readdirSync(RUNTIME_DIRECTORY)
    .filter((fileName) => fileName.endsWith('.json'))
    .sort()
  const expectedFiles = SCHOOL_THEMES
    .map((theme) => `${theme.id}.json`)
    .sort()

  assert.deepEqual(actualFiles, expectedFiles, 'runtime file ids must exactly match theme ids')
})

test('every runtime catalog has valid school identity and active unique departments', () => {
  for (const theme of SCHOOL_THEMES) {
    const catalog = readRuntimeCatalog(theme)

    assert.deepEqual(Object.keys(catalog), EXPECTED_RUNTIME_KEYS, `${theme.id}: runtime schema keys`)
    assert.equal(catalog.schoolId, theme.id, `${theme.id}: schoolId must match its file id`)
    assert.equal(catalog.schoolName, theme.name, `${theme.id}: schoolName must match SCHOOL_THEMES`)
    assert.equal(catalog.sourceType, '대학알리미', `${theme.id}: sourceType`)
    assert.equal(catalog.sourceDate, '2024-10-07', `${theme.id}: sourceDate`)
    assert.ok(catalog.departments.length > 0, `${theme.id}: departments must not be empty`)

    const departmentNames = catalog.departments.map((department) => department.name)
    assert.equal(
      new Set(departmentNames).size,
      departmentNames.length,
      `${theme.id}: duplicate department names are not allowed`,
    )
    assert.deepEqual(
      departmentNames,
      [...departmentNames].sort(),
      `${theme.id}: departments must use deterministic name order`,
    )

    for (const department of catalog.departments) {
      assert.deepEqual(
        Object.keys(department),
        EXPECTED_DEPARTMENT_KEYS,
        `${theme.id}/${department.name}: department schema keys`,
      )
      assert.ok(department.name.trim(), `${theme.id}: department name must not be empty`)
      assert.ok(department.college.trim(), `${theme.id}/${department.name}: college must not be empty`)
      assert.ok(
        !department.status.includes('폐지'),
        `${theme.id}/${department.name}: abolished status must be excluded`,
      )
      assertSortedUniqueSegments(department.college, `${theme.id}/${department.name}: college`)
      assertSortedUniqueSegments(department.status, `${theme.id}/${department.name}: status`)
    }
  }
})

test('pnu, ajou, doowon, yonsei, and soongsil load their own department data', () => {
  const sampleIds = ['pnu', 'ajou', 'doowon', 'yonsei', 'soongsil']
  const samples = sampleIds.map((schoolId) => {
    const theme = SCHOOL_THEMES.find((candidate) => candidate.id === schoolId)
    assert.ok(theme, `${schoolId}: sample theme must exist`)
    return readRuntimeCatalog(theme)
  })

  assert.deepEqual(samples.map((catalog) => catalog.schoolId), sampleIds)
  assert.equal(
    new Set(samples.map((catalog) => JSON.stringify(catalog.departments))).size,
    sampleIds.length,
    'sample schools must not share a copied department catalog',
  )
})

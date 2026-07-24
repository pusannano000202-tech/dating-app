import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
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

type AggregateCatalog = {
  metadata: {
    sourceType: '대학알리미'
    sourceFile: 'academyinfo_school_education_units_20241007.xlsx'
    sourceDate: '2024-10-07'
    schoolCount: 59
    generationRules: string[]
  }
  schools: SchoolCatalog[]
}

const ROOT = process.cwd()
const RUNTIME_DIRECTORY = join(ROOT, 'public', 'university-departments')
const SOURCE_PATH = join(
  ROOT,
  'docs',
  'research',
  'university-departments',
  'source-data',
  'academyinfo_school_education_units_20241007.xlsx',
)
const GENERATOR_PATH = join(ROOT, 'scripts', 'generate_university_department_catalogs.py')
const SOURCE_README_PATH = join(
  ROOT,
  'docs',
  'research',
  'university-departments',
  'source-data',
  'README.md',
)
const EXPECTED_SOURCE_SHA256 = 'C47323B0E9F2A5D4BF017597968DF533AB4F6EBFF64B702411DECC4974E6A3B6'
const EXPECTED_DEPARTMENT_COUNT = 5_423
const AGGREGATE_PATH = join(
  ROOT,
  'docs',
  'research',
  'university-departments',
  'quantum_59_university_departments_2026-07-15.json',
)
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

function runGeneratorCheck(): void {
  const candidates: Array<{ command: string; prefix: string[] }> = process.platform === 'win32'
    ? [
        { command: 'py', prefix: ['-3'] },
        { command: 'python', prefix: [] },
      ]
    : [
        { command: 'python3', prefix: [] },
        { command: 'python', prefix: [] },
      ]

  for (const candidate of candidates) {
    const result = spawnSync(
      candidate.command,
      [...candidate.prefix, GENERATOR_PATH, '--check'],
      { cwd: ROOT, encoding: 'utf8' },
    )
    if (result.error && 'code' in result.error && result.error.code === 'ENOENT') continue

    assert.equal(
      result.status,
      0,
      `official XLSX and generated catalogs drifted:\n${result.stdout}\n${result.stderr}`,
    )
    return
  }

  assert.fail('Python 3 is required to verify department catalogs against the official XLSX')
}

test('official XLSX checksum and generated outputs remain in sync', () => {
  assert.ok(existsSync(SOURCE_PATH), 'official AcademyInfo XLSX must exist')
  assert.ok(existsSync(GENERATOR_PATH), 'department catalog generator must exist')
  const checksum = createHash('sha256').update(readFileSync(SOURCE_PATH)).digest('hex').toUpperCase()
  assert.equal(checksum, EXPECTED_SOURCE_SHA256, 'official AcademyInfo XLSX changed unexpectedly')
  runGeneratorCheck()
})

test('official source provenance and archive safety limits stay documented', () => {
  assert.ok(existsSync(SOURCE_README_PATH), 'official source README must exist')
  const readme = readFileSync(SOURCE_README_PATH, 'utf8')
  const generator = readFileSync(GENERATOR_PATH, 'utf8')

  assert.match(readme, /대학알리미/)
  assert.match(readme, /2024-10-07/)
  assert.match(readme, new RegExp(EXPECTED_SOURCE_SHA256))
  assert.match(readme, /academyinfo\.go\.kr/)
  assert.match(generator, /EXPECTED_SOURCE_SHA256/)
  assert.match(generator, /MAX_SOURCE_BYTES/)
  assert.match(generator, /MAX_ZIP_ENTRIES/)
  assert.match(generator, /MAX_ZIP_ENTRY_BYTES/)
  assert.match(generator, /MAX_ZIP_UNCOMPRESSED_BYTES/)
  assert.match(generator, /validate_source_archive\(SOURCE_PATH\)/)
})

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

test('aggregate research JSON metadata and school objects match all runtime catalogs', () => {
  assert.ok(existsSync(AGGREGATE_PATH), 'aggregate research JSON must exist')
  const aggregate = readJson<AggregateCatalog>(AGGREGATE_PATH)
  const runtimeCatalogs = SCHOOL_THEMES.map(readRuntimeCatalog)

  assert.deepEqual(Object.keys(aggregate), ['metadata', 'schools'])
  assert.deepEqual(Object.keys(aggregate.metadata), [
    'sourceType',
    'sourceFile',
    'sourceDate',
    'schoolCount',
    'generationRules',
  ])
  assert.equal(aggregate.metadata.sourceType, '대학알리미')
  assert.equal(aggregate.metadata.sourceFile, 'academyinfo_school_education_units_20241007.xlsx')
  assert.equal(aggregate.metadata.sourceDate, '2024-10-07')
  assert.equal(aggregate.metadata.schoolCount, 59)
  assert.ok(aggregate.metadata.generationRules.length >= 4, 'generation rules must be documented')
  assert.deepEqual(aggregate.schools, runtimeCatalogs)
  assert.equal(
    aggregate.schools.reduce((total, school) => total + school.departments.length, 0),
    EXPECTED_DEPARTMENT_COUNT,
    'all active departments from the fixed official source must remain present',
  )

  const skkuSoftware = aggregate.schools
    .find((school) => school.schoolId === 'skku')
    ?.departments.find((department) => department.name === '소프트웨어학과')
  assert.equal(
    skkuSoftware?.college,
    '소프트웨어융합대학 / 정보통신대학',
    'duplicate departments must preserve every distinct college in sorted order',
  )
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

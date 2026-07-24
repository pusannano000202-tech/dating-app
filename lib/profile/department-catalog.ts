export type DepartmentCatalogEntry = {
  name: string
  college: string
  status: string
}

export type DepartmentCatalog = {
  schoolId: string
  schoolName: string
  sourceType: '대학알리미'
  sourceDate: '2024-10-07'
  departments: DepartmentCatalogEntry[]
}

export type DepartmentPickerValidationState =
  | 'ready'
  | 'loading'
  | 'confirmation-required'

export type DepartmentCatalogLoadState = 'idle' | 'loading' | 'ready' | 'error'

const MAX_DEPARTMENT_COUNT = 500
const MAX_SCHOOL_NAME_LENGTH = 100
const MAX_DEPARTMENT_NAME_LENGTH = 300
const MAX_COLLEGE_LENGTH = 500
const MAX_STATUS_LENGTH = 200
const MAX_DEPARTMENT_CATALOG_RESPONSE_BYTES = 256 * 1024

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readRequiredString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > maxLength) return null
  return trimmed
}

export function parseDepartmentCatalog(
  value: unknown,
  expectedSchoolId: string,
): DepartmentCatalog | null {
  if (!isRecord(value)) return null

  const schoolId = readRequiredString(value.schoolId, 64)
  const schoolName = readRequiredString(value.schoolName, MAX_SCHOOL_NAME_LENGTH)
  if (!schoolId || schoolId !== expectedSchoolId || !schoolName) return null
  if (value.sourceType !== '대학알리미' || value.sourceDate !== '2024-10-07') return null
  if (
    !Array.isArray(value.departments) ||
    value.departments.length === 0 ||
    value.departments.length > MAX_DEPARTMENT_COUNT
  ) return null

  const seenNames = new Set<string>()
  const departments: DepartmentCatalogEntry[] = []

  for (const item of value.departments) {
    if (!isRecord(item)) return null

    const name = readRequiredString(item.name, MAX_DEPARTMENT_NAME_LENGTH)
    const college = readRequiredString(item.college, MAX_COLLEGE_LENGTH)
    const status = readRequiredString(item.status, MAX_STATUS_LENGTH)
    if (!name || !college || !status || status.includes('폐지') || seenNames.has(name)) {
      return null
    }

    seenNames.add(name)
    departments.push({ name, college, status })
  }

  return {
    schoolId,
    schoolName,
    sourceType: '대학알리미',
    sourceDate: '2024-10-07',
    departments,
  }
}

export async function readDepartmentCatalogResponse(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get('content-length') ?? 0)
  if (Number.isFinite(declaredLength) && declaredLength > MAX_DEPARTMENT_CATALOG_RESPONSE_BYTES) {
    throw new Error('Department catalog response is too large')
  }

  if (!response.body) {
    const text = await response.text()
    if (new TextEncoder().encode(text).byteLength > MAX_DEPARTMENT_CATALOG_RESPONSE_BYTES) {
      throw new Error('Department catalog response is too large')
    }
    return JSON.parse(text)
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let receivedBytes = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue

    receivedBytes += value.byteLength
    if (receivedBytes > MAX_DEPARTMENT_CATALOG_RESPONSE_BYTES) {
      await reader.cancel()
      throw new Error('Department catalog response is too large')
    }
    chunks.push(value)
  }

  const payload = new Uint8Array(receivedBytes)
  let offset = 0
  for (const chunk of chunks) {
    payload.set(chunk, offset)
    offset += chunk.byteLength
  }

  return JSON.parse(new TextDecoder().decode(payload))
}

export function resolveDepartmentPickerValidationState({
  value,
  loadState,
  requiresConfirmation,
  explicitlyKept,
}: {
  value: string
  loadState: 'idle' | 'loading' | 'ready' | 'error'
  requiresConfirmation: boolean
  explicitlyKept: boolean
}): DepartmentPickerValidationState {
  if (!value.trim()) return 'ready'
  if (loadState === 'loading') return 'loading'
  if (requiresConfirmation && !explicitlyKept) return 'confirmation-required'
  return 'ready'
}

export function resolveInitialProfileSchool({
  profileSchool,
  routeSchool,
  storedSchool,
  isDevPreview,
}: {
  profileSchool?: string
  routeSchool?: string
  storedSchool: string
  isDevPreview: boolean
}): string {
  const savedSchool = profileSchool?.trim()
  if (routeSchool && (!savedSchool || isDevPreview)) return routeSchool
  return savedSchool || storedSchool
}

export function resolveHydrationSafeInitialProfileSchool({
  profileSchool,
  defaultSchool,
}: {
  profileSchool?: string
  defaultSchool: string
}): string {
  return profileSchool?.trim() || defaultSchool
}

export function resolveDepartmentValidationForSchoolChange({
  currentSchoolId,
  nextSchoolId,
  department,
  currentState,
}: {
  currentSchoolId: string
  nextSchoolId: string
  department: string
  currentState: DepartmentPickerValidationState
}): DepartmentPickerValidationState {
  if (currentSchoolId === nextSchoolId) return currentState
  return department.trim() ? 'loading' : 'ready'
}

export function resolveDepartmentLoadStateForSchoolChange({
  schoolId,
  schoolChanged,
  loadState,
}: {
  schoolId: string
  schoolChanged: boolean
  loadState: DepartmentCatalogLoadState
}): DepartmentCatalogLoadState {
  if (schoolChanged) return 'loading'
  if (!schoolId) return 'idle'
  return loadState
}

export function normalizeDepartmentSearch(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

export function searchDepartmentCatalog(
  departments: DepartmentCatalogEntry[],
  query: string,
): DepartmentCatalogEntry[] {
  const normalizedQuery = normalizeDepartmentSearch(query)
  if (!normalizedQuery) return departments

  return departments.filter((department) => (
    normalizeDepartmentSearch(department.name).includes(normalizedQuery) ||
    normalizeDepartmentSearch(department.college).includes(normalizedQuery)
  ))
}

export function hasExactDepartment(
  departments: DepartmentCatalogEntry[],
  value: string,
): boolean {
  return departments.some((department) => department.name === value)
}

export function shouldConfirmDepartmentMismatch(
  departments: DepartmentCatalogEntry[],
  _currentValue: string,
  valueAtCatalogChange: string,
): boolean {
  return Boolean(
    valueAtCatalogChange &&
    !hasExactDepartment(departments, valueAtCatalogChange),
  )
}

export function shouldConfirmUnverifiedDepartment(
  _currentValue: string,
  valueAtSchoolChange: string,
  schoolChanged: boolean,
  catalogUnavailable: boolean,
): boolean {
  return Boolean(
    schoolChanged &&
    catalogUnavailable &&
    valueAtSchoolChange,
  )
}

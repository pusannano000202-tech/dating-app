export type BasicProfileInput = {
  displayName: string
  phone: string
  gender: 'male' | 'female'
  age: number
  height: number | null
  bodyType: 'slim' | 'average' | 'athletic' | 'chubby' | null
  hairDensity: 'full' | 'thinning' | 'bald' | null
  school: string
  department: string | null
  year: number | null
}

export type BasicProfileInputResult =
  | { ok: true; value: BasicProfileInput }
  | { ok: false; error: string }

export function parseBasicProfileInput(input: unknown): BasicProfileInputResult {
  if (!isRecord(input)) return { ok: false, error: 'invalid_request' }

  const displayName = normalizeText(input.display_name)
  const phone = normalizePhone(typeof input.phone === 'string' ? input.phone : '')
  const gender = input.gender === 'male' || input.gender === 'female' ? input.gender : null
  const age = readInteger(input.age)
  const height = input.height == null ? null : readInteger(input.height)
  const bodyType = input.body_type == null ? null : readBodyType(input.body_type)
  const hairDensity = input.hair_density == null ? null : readHairDensity(input.hair_density)
  const school = normalizeText(input.school)
  const department = input.department == null ? null : normalizeText(input.department)
  const year = input.year == null ? null : readInteger(input.year)

  if (displayName.length < 2 || displayName.length > 20) return { ok: false, error: 'invalid_nickname' }
  if (typeof input.phone === 'string' && input.phone.trim() && !phone) {
    return { ok: false, error: 'invalid_phone' }
  }
  if (!gender) return { ok: false, error: 'invalid_gender' }
  if (age == null || age < 18 || age > 35) return { ok: false, error: 'invalid_age' }
  if (height != null && (height < 100 || height > 250)) return { ok: false, error: 'invalid_height' }
  if (input.body_type != null && bodyType == null) return { ok: false, error: 'invalid_body_type' }
  if (input.hair_density != null && hairDensity == null) return { ok: false, error: 'invalid_hair_density' }
  if (!school) return { ok: false, error: 'invalid_school' }
  if (department != null && !department) return { ok: false, error: 'invalid_department' }
  if (year != null && (year < 1 || year > 6)) return { ok: false, error: 'invalid_year' }

  return {
    ok: true,
    value: {
      displayName,
      phone,
      gender,
      age,
      height,
      bodyType,
      hairDensity: gender === 'male' ? hairDensity : null,
      school,
      department,
      year,
    },
  }
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (!/^010\d{8}$/.test(digits)) return ''
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
}

function readInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

function readBodyType(value: unknown): BasicProfileInput['bodyType'] {
  return value === 'slim' || value === 'average' || value === 'athletic' || value === 'chubby' ? value : null
}

function readHairDensity(value: unknown): BasicProfileInput['hairDensity'] {
  return value === 'full' || value === 'thinning' || value === 'bald' ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

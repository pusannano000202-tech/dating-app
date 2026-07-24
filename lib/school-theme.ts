export const SCHOOL_THEME_STORAGE_KEY = 'quantum_school_theme'
export const SCHOOL_THEME_COOKIE_NAME = 'quantum_school_theme'
export const SCHOOL_THEME_CHANGE_EVENT = 'quantum:school-theme-change'
export const LEGACY_DEV_SCHOOL_PREVIEW_STORAGE_KEY = 'booting_dev_school_preview'
const SCHOOL_THEME_WINDOW_NAME_PREFIX = 'quantum_school_theme:'

export type SchoolTheme = {
  id: string
  name: string
  shortName: string
  region: string
  primary: string
  coral: string
  amber: string
  canvas: string
  soft: string
}

export const SCHOOL_THEMES: SchoolTheme[] = [
  { id: 'pnu', name: '부산대학교', shortName: '부산대', region: '부산', primary: '#0F8B8D', coral: '#FF6B4A', amber: '#F2A541', canvas: '#EAF7F6', soft: '#DFF2F0' },
  { id: 'snu', name: '서울대학교', shortName: '서울대', region: '서울', primary: '#003478', coral: '#B8A369', amber: '#E6C76E', canvas: '#EAF0F8', soft: '#DDE8F5' },
  { id: 'yonsei', name: '연세대학교', shortName: '연세대', region: '서울', primary: '#003876', coral: '#B41D2A', amber: '#D9B55E', canvas: '#EAF1FA', soft: '#DDE8F6' },
  { id: 'korea', name: '고려대학교', shortName: '고려대', region: '서울', primary: '#8B0029', coral: '#D4A017', amber: '#E8C766', canvas: '#FAEEF2', soft: '#F6DFE7' },
  { id: 'skku', name: '성균관대학교', shortName: '성균관대', region: '서울/수원', primary: '#006272', coral: '#B08A2E', amber: '#D9BA61', canvas: '#EAF5F7', soft: '#DDF0F2' },
  { id: 'hanyang', name: '한양대학교', shortName: '한양대', region: '서울', primary: '#004C97', coral: '#00A3E0', amber: '#F5B335', canvas: '#EAF3FB', soft: '#DCECF8' },
  { id: 'cau', name: '중앙대학교', shortName: '중앙대', region: '서울', primary: '#005BAC', coral: '#E31B23', amber: '#F4B942', canvas: '#EAF3FC', soft: '#DDEBFA' },
  { id: 'khu', name: '경희대학교', shortName: '경희대', region: '서울/용인', primary: '#A40E2D', coral: '#D4A017', amber: '#F2C75C', canvas: '#FAEEF2', soft: '#F7E2E8' },
  { id: 'konkuk', name: '건국대학교', shortName: '건국대', region: '서울', primary: '#007A3D', coral: '#F15A24', amber: '#F2B544', canvas: '#ECF8F0', soft: '#DFF3E7' },
  { id: 'dongguk', name: '동국대학교', shortName: '동국대', region: '서울', primary: '#F58220', coral: '#B43B2A', amber: '#F6C15A', canvas: '#FFF2E8', soft: '#FFE6D2' },
  { id: 'hongik', name: '홍익대학교', shortName: '홍익대', region: '서울', primary: '#005BAC', coral: '#E54545', amber: '#F0B84A', canvas: '#EAF3FC', soft: '#DDEBFA' },
  { id: 'hufs', name: '한국외국어대학교', shortName: '한국외대', region: '서울/용인', primary: '#002F6C', coral: '#00A0DF', amber: '#F1B84B', canvas: '#EAF1FA', soft: '#DDE8F6' },
  { id: 'ewha', name: '이화여자대학교', shortName: '이화여대', region: '서울', primary: '#00664F', coral: '#87BDA8', amber: '#D7B85D', canvas: '#EAF7F1', soft: '#DDF1E8' },
  { id: 'sookmyung', name: '숙명여자대학교', shortName: '숙명여대', region: '서울', primary: '#003B7A', coral: '#8E6AC8', amber: '#D8B65A', canvas: '#EAF1FA', soft: '#E3E0F5' },
  { id: 'ajou', name: '아주대학교', shortName: '아주대', region: '수원', primary: '#005BAC', coral: '#00A3E0', amber: '#F2B544', canvas: '#EAF3FC', soft: '#DDEBFA' },
  { id: 'soongsil', name: '숭실대학교', shortName: '숭실대', region: '서울', primary: '#003D79', coral: '#64A4D8', amber: '#D9B55E', canvas: '#EAF2FA', soft: '#DDEAF6' },
  { id: 'kookmin', name: '국민대학교', shortName: '국민대', region: '서울', primary: '#004098', coral: '#00A3E0', amber: '#F2B544', canvas: '#EAF3FC', soft: '#DDEBFA' },
  { id: 'kyonggi', name: '경기대학교', shortName: '경기대', region: '수원/서울', primary: '#005BAC', coral: '#3CB371', amber: '#F0B84A', canvas: '#EAF4FC', soft: '#DDF0EA' },
  { id: 'inha', name: '인하대학교', shortName: '인하대', region: '인천', primary: '#005BAC', coral: '#00A3E0', amber: '#F2B544', canvas: '#EAF3FC', soft: '#DDEBFA' },
  { id: 'gachon', name: '가천대학교', shortName: '가천대', region: '성남', primary: '#0072BC', coral: '#00A88E', amber: '#F4B942', canvas: '#EAF5FB', soft: '#DDF1EF' },
  { id: 'dankook', name: '단국대학교', shortName: '단국대', region: '용인/천안', primary: '#005BAC', coral: '#D11F2F', amber: '#F2B544', canvas: '#EAF3FC', soft: '#DDEBFA' },
  { id: 'sejong', name: '세종대학교', shortName: '세종대', region: '서울', primary: '#C8102E', coral: '#005BAC', amber: '#F2B544', canvas: '#FAEEF2', soft: '#F7E2E8' },
  { id: 'uos', name: '서울시립대학교', shortName: '서울시립대', region: '서울', primary: '#004C97', coral: '#00A86B', amber: '#F2B544', canvas: '#EAF3FC', soft: '#DDF1E8' },
  { id: 'seoultech', name: '서울과학기술대학교', shortName: '서울과기대', region: '서울', primary: '#003F87', coral: '#00A3E0', amber: '#F2B544', canvas: '#EAF2FA', soft: '#DDEAF6' },
  { id: 'pknu', name: '국립부경대학교', shortName: '부경대', region: '부산', primary: '#005BAC', coral: '#00A3E0', amber: '#F2B544', canvas: '#EAF3FC', soft: '#DDEBFA' },
  { id: 'knu', name: '경북대학교', shortName: '경북대', region: '대구', primary: '#C8102E', coral: '#005BAC', amber: '#F0B84A', canvas: '#FAEEF2', soft: '#F7E2E8' },
  { id: 'jnu', name: '전남대학교', shortName: '전남대', region: '광주', primary: '#005BAC', coral: '#00A86B', amber: '#F2B544', canvas: '#EAF3FC', soft: '#DDF1E8' },
  { id: 'cnu', name: '충남대학교', shortName: '충남대', region: '대전', primary: '#004098', coral: '#00A3E0', amber: '#F2B544', canvas: '#EAF2FA', soft: '#DDEAF6' },
  { id: 'jbnu', name: '전북대학교', shortName: '전북대', region: '전주', primary: '#007A3D', coral: '#D11F2F', amber: '#F2B544', canvas: '#ECF8F0', soft: '#DFF3E7' },
  { id: 'chungbuk', name: '충북대학교', shortName: '충북대', region: '청주', primary: '#0066B3', coral: '#00A86B', amber: '#F2B544', canvas: '#EAF3FC', soft: '#DDF1E8' },
  { id: 'kangwon', name: '강원대학교', shortName: '강원대', region: '춘천', primary: '#007A3D', coral: '#005BAC', amber: '#F2B544', canvas: '#ECF8F0', soft: '#DFF3E7' },
  { id: 'gnu', name: '경상국립대학교', shortName: '경상국립대', region: '진주', primary: '#005BAC', coral: '#00A86B', amber: '#F2B544', canvas: '#EAF3FC', soft: '#DDF1E8' },
  { id: 'daegu', name: '대구대학교', shortName: '대구대', region: '경산', primary: '#005BAC', coral: '#00A86B', amber: '#F2B544', canvas: '#EAF3FC', soft: '#DDF1E8' },
  { id: 'yeungnam', name: '영남대학교', shortName: '영남대', region: '경산', primary: '#005BAC', coral: '#D11F2F', amber: '#F2B544', canvas: '#EAF3FC', soft: '#DDEBFA' },
  { id: 'keimyung', name: '계명대학교', shortName: '계명대', region: '대구', primary: '#B00020', coral: '#005BAC', amber: '#F2B544', canvas: '#FAEEF2', soft: '#F7E2E8' },
  { id: 'chosun', name: '조선대학교', shortName: '조선대', region: '광주', primary: '#005BAC', coral: '#00A86B', amber: '#F2B544', canvas: '#EAF3FC', soft: '#DDF1E8' },
  { id: 'donga', name: '동아대학교', shortName: '동아대', region: '부산', primary: '#003F87', coral: '#00A3E0', amber: '#F2B544', canvas: '#EAF2FA', soft: '#DDEAF6' },
  { id: 'dongeui', name: '동의대학교', shortName: '동의대', region: '부산', primary: '#005BAC', coral: '#00A86B', amber: '#F2B544', canvas: '#EAF3FC', soft: '#DDF1E8' },
  { id: 'dongseo', name: '동서대학교', shortName: '동서대', region: '부산', primary: '#0066B3', coral: '#00A3E0', amber: '#F2B544', canvas: '#EAF3FC', soft: '#DDEBFA' },
  { id: 'ulsan', name: '울산대학교', shortName: '울산대', region: '울산', primary: '#005BAC', coral: '#00A3E0', amber: '#F2B544', canvas: '#EAF3FC', soft: '#DDEBFA' },
  { id: 'wonkwang', name: '원광대학교', shortName: '원광대', region: '익산', primary: '#00664F', coral: '#D4A017', amber: '#F2C75C', canvas: '#EAF7F1', soft: '#DDF1E8' },
  { id: 'hoseo', name: '호서대학교', shortName: '호서대', region: '아산/천안', primary: '#005BAC', coral: '#00A86B', amber: '#F2B544', canvas: '#EAF3FC', soft: '#DDF1E8' },
  { id: 'hannam', name: '한남대학교', shortName: '한남대', region: '대전', primary: '#003F87', coral: '#D4A017', amber: '#F2C75C', canvas: '#EAF2FA', soft: '#DDEAF6' },
  { id: 'baekseok', name: '백석대학교', shortName: '백석대', region: '천안', primary: '#004098', coral: '#00A86B', amber: '#F2B544', canvas: '#EAF2FA', soft: '#DDF1E8' },
  { id: 'cheongju', name: '청주대학교', shortName: '청주대', region: '청주', primary: '#005BAC', coral: '#00A3E0', amber: '#F2B544', canvas: '#EAF3FC', soft: '#DDEBFA' },
  { id: 'dcu', name: '대구가톨릭대학교', shortName: '대구가톨릭대', region: '경산', primary: '#7A0019', coral: '#D4A017', amber: '#F2C75C', canvas: '#FAEEF2', soft: '#F7E2E8' },
  { id: 'dju', name: '대전대학교', shortName: '대전대', region: '대전', primary: '#004098', coral: '#00A86B', amber: '#F2B544', canvas: '#EAF2FA', soft: '#DDF1E8' },
  { id: 'inu', name: '인천대학교', shortName: '인천대', region: '인천', primary: '#005BAC', coral: '#00A3E0', amber: '#F2B544', canvas: '#EAF3FC', soft: '#DDEBFA' },
  { id: 'jejunu', name: '제주대학교', shortName: '제주대', region: '제주', primary: '#006A4E', coral: '#00A3E0', amber: '#F2B544', canvas: '#EAF7F1', soft: '#DDF1E8' },
  { id: 'jj', name: '전주대학교', shortName: '전주대', region: '전주', primary: '#003F87', coral: '#00A3E0', amber: '#F2B544', canvas: '#EAF2FA', soft: '#DDEAF6' },
  { id: 'kongju', name: '국립공주대학교', shortName: '공주대', region: '공주/천안', primary: '#006A4E', coral: '#005BAC', amber: '#F2B544', canvas: '#EAF7F1', soft: '#DDF1E8' },
  { id: 'ks', name: '경성대학교', shortName: '경성대', region: '부산', primary: '#005BAC', coral: '#D11F2F', amber: '#F2B544', canvas: '#EAF3FC', soft: '#DDEBFA' },
  { id: 'kyungnam', name: '경남대학교', shortName: '경남대', region: '창원', primary: '#004098', coral: '#00A86B', amber: '#F2B544', canvas: '#EAF2FA', soft: '#DDF1E8' },
  { id: 'nsu', name: '남서울대학교', shortName: '남서울대', region: '천안', primary: '#005BAC', coral: '#00A3E0', amber: '#F2B544', canvas: '#EAF3FC', soft: '#DDEBFA' },
  { id: 'sch', name: '순천향대학교', shortName: '순천향대', region: '아산', primary: '#005BAC', coral: '#00A86B', amber: '#F2B544', canvas: '#EAF3FC', soft: '#DDF1E8' },
  { id: 'sunmoon', name: '선문대학교', shortName: '선문대', region: '아산', primary: '#005BAC', coral: '#00A3E0', amber: '#F2B544', canvas: '#EAF3FC', soft: '#DDEBFA' },
  { id: 'suwon', name: '수원대학교', shortName: '수원대', region: '화성', primary: '#003F87', coral: '#D11F2F', amber: '#F2B544', canvas: '#EAF2FA', soft: '#DDEAF6' },
  { id: 'wsu', name: '우송대학교', shortName: '우송대', region: '대전', primary: '#7A0019', coral: '#005BAC', amber: '#F2B544', canvas: '#FAEEF2', soft: '#F7E2E8' },
  { id: 'doowon', name: '두원공과대학교', shortName: '두원공과대', region: '파주/안성', primary: '#006A4E', coral: '#0072BC', amber: '#F2B544', canvas: '#EAF7F1', soft: '#DDF1E8' },
]

export const DEFAULT_SCHOOL_THEME_ID = 'pnu'
let currentSchoolTheme: SchoolTheme | null = null

export function getDefaultSchoolTheme(): SchoolTheme {
  return SCHOOL_THEMES[0]
}

export function resolveSchoolTheme(idOrName: string | null | undefined): SchoolTheme | null {
  const query = (idOrName ?? '').trim().toLowerCase()
  if (!query) return null

  return SCHOOL_THEMES.find((school) =>
    school.id === query ||
    school.name.toLowerCase() === query ||
    school.shortName.toLowerCase() === query,
  ) ?? null
}

export function findSchoolTheme(idOrName: string | null | undefined): SchoolTheme {
  return resolveSchoolTheme(idOrName) ?? getDefaultSchoolTheme()
}

function readLocalStorageValue(key: string): string | null {
  if (typeof window === 'undefined' || !window.localStorage) return null

  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function readCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null

  const encodedName = `${encodeURIComponent(name)}=`
  const cookie = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(encodedName))

  if (!cookie) return null

  try {
    return decodeURIComponent(cookie.slice(encodedName.length))
  } catch {
    return cookie.slice(encodedName.length)
  }
}

function readWindowNameThemeId(): string | null {
  if (typeof window === 'undefined') return null
  if (!window.name.startsWith(SCHOOL_THEME_WINDOW_NAME_PREFIX)) return null
  return window.name.slice(SCHOOL_THEME_WINDOW_NAME_PREFIX.length) || null
}

function readUrlThemeId(): string | null {
  if (typeof window === 'undefined') return null

  try {
    const params = new URLSearchParams(window.location.search)
    return params.get('school') ?? params.get('theme')
  } catch {
    return null
  }
}

export function readStoredSchoolTheme(): SchoolTheme {
  if (typeof window === 'undefined') return getDefaultSchoolTheme()

  const storedTheme = (
    resolveSchoolTheme(readUrlThemeId()) ??
    currentSchoolTheme ??
    resolveSchoolTheme(readLocalStorageValue(SCHOOL_THEME_STORAGE_KEY)) ??
    resolveSchoolTheme(readCookieValue(SCHOOL_THEME_COOKIE_NAME)) ??
    resolveSchoolTheme(readWindowNameThemeId()) ??
    resolveSchoolTheme(readLocalStorageValue(LEGACY_DEV_SCHOOL_PREVIEW_STORAGE_KEY)) ??
    getDefaultSchoolTheme()
  )
  currentSchoolTheme = storedTheme
  return storedTheme
}

export function persistSchoolTheme(school: SchoolTheme): void {
  currentSchoolTheme = school
  if (typeof window === 'undefined') return

  try {
    window.localStorage?.setItem(SCHOOL_THEME_STORAGE_KEY, school.id)
    window.localStorage?.setItem(LEGACY_DEV_SCHOOL_PREVIEW_STORAGE_KEY, school.id)
  } catch {
    // localStorage can fail in restricted browser contexts. The app keeps the current theme.
  }

  try {
    document.cookie = `${encodeURIComponent(SCHOOL_THEME_COOKIE_NAME)}=${encodeURIComponent(school.id)}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`
  } catch {
    // Cookie writes can fail in unusual preview contexts. The in-memory event still updates this page.
  }

  try {
    window.name = `${SCHOOL_THEME_WINDOW_NAME_PREFIX}${school.id}`
  } catch {
    // window.name is only a same-tab fallback for preview navigation.
  }

  window.dispatchEvent(new CustomEvent(SCHOOL_THEME_CHANGE_EVENT, { detail: school }))
}

export function hexToRgbTriplet(hex: string): string {
  const normalized = hex.replace('#', '')
  const value = normalized.length === 3
    ? normalized.split('').map((char) => char + char).join('')
    : normalized
  const parsed = Number.parseInt(value, 16)
  if (Number.isNaN(parsed)) return '255 79 95'
  return `${(parsed >> 16) & 255} ${(parsed >> 8) & 255} ${parsed & 255}`
}

function setCssVariable(name: string, value: string): void {
  document.documentElement.style.setProperty(name, value)
}

export function applySchoolThemeToDocument(school: SchoolTheme): void {
  if (typeof document === 'undefined') return

  setCssVariable('--boot-canvas-rgb', hexToRgbTriplet(school.canvas))
  setCssVariable('--boot-surface-rgb', '255 253 248')
  setCssVariable('--boot-soft-rgb', hexToRgbTriplet(school.soft))
  setCssVariable('--boot-primary-rgb', hexToRgbTriplet(school.primary))
  setCssVariable('--boot-coral-rgb', hexToRgbTriplet(school.coral))
  setCssVariable('--boot-amber-rgb', hexToRgbTriplet(school.amber))
  setCssVariable('--boot-ink-rgb', '23 20 18')
  setCssVariable('--boot-body-rgb', '75 67 61')
  setCssVariable('--boot-muted-rgb', '113 105 98')
  setCssVariable('--boot-hairline-rgb', '232 222 212')
  setCssVariable('--boot-preview-school', `"${school.shortName}"`)
}

export const SORTED_SCHOOL_THEMES = [...SCHOOL_THEMES].sort((a, b) =>
  a.shortName.localeCompare(b.shortName, 'ko-KR'),
)

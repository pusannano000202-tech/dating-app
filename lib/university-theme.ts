import rawColorTokens from './data/quantum-university-theme-tokens.json'

export const DEFAULT_UNIVERSITY_THEME_ID = 'pnu'
export const UNIVERSITY_THEME_STORAGE_KEY = 'quantum_university_theme_id'
export const UNIVERSITY_THEME_COOKIE_NAME = UNIVERSITY_THEME_STORAGE_KEY
export const UNIVERSITY_THEME_CHANGE_EVENT = 'quantum:university-theme-change'
export const UNIVERSITY_THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export type MascotPose = 'welcome' | 'guide' | 'waiting' | 'support' | 'confirm' | 'refund' | 'avatar'
export type UniversityThemeAssetKind = MascotPose
export type UniversityThemeTokenStatus = 'locked' | 'draft' | 'needsOfficialCheck'

export interface UniversityThemeToken {
  id: string
  name: string
  primary: string
  secondary: string
  accent: string
  backgroundTint: string
  textOnPrimary: string
  status: UniversityThemeTokenStatus
  source: string
}

export interface UniversityTheme {
  id: string
  shortName: string
  displayName: string
  tokenStatus: UniversityThemeTokenStatus
  source: string
  colors: {
    primary: string
    secondary: string
    accent: string
    backgroundTop: string
    backgroundBottom: string
    surface: string
    surfaceTint: string
    deepCard: string
    deepCardText: string
    cta: string
    ctaText: string
    ctaShadow: string
    border: string
    muted: string
    danger: string
    success: string
    queueMale: string
    queueFemale: string
    queueMixed: string
  }
  gradients: {
    page: string
    hero: string
    primaryButton: string
    queueRing: string
    deepCard: string
  }
  shadow: {
    card: string
    button: string
    deepCard: string
    bottomNav: string
  }
  assets: Record<UniversityThemeAssetKind, string>
  copy: {
    loginKicker: string
    loginTitle: string
    homeGreeting: string
    matchWaiting: string
    refundAsk: string
    notificationTone: string
  }
  designTheme: {
    mascotRole: string
    landmarkCue: string
    pattern: string
  }
}

export interface UniversityThemeSchoolOption {
  id: string
  label: string
  value: string
  displayName: string
}

export type UniversityThemeCssVariables = Record<`--${string}`, string>

const MASCOT_POSES: MascotPose[] = ['welcome', 'guide', 'waiting', 'support', 'confirm', 'refund', 'avatar']
const DISPLAY_MASCOT_ROOT = '/university-mascots/app-assets-v3-display'

const HANDOFF_SUPPLEMENTAL_COLOR_TOKENS: UniversityThemeToken[] = [
  {
    id: 'ajou',
    name: '아주대',
    primary: '#005BAC',
    secondary: '#F7941D',
    accent: '#FDB813',
    backgroundTint: '#EAF3FF',
    textOnPrimary: '#FFFFFF',
    status: 'draft',
    source: '아주대 치토/불씨/횃불 교정본 기준. 2026-07-04 색상 JSON에는 누락되어 런타임 QA용으로 보강.',
  },
]

const UNIVERSITY_COLOR_TOKENS = [
  ...(rawColorTokens as UniversityThemeToken[]).filter((token) => token.id !== 'dcu'),
  ...HANDOFF_SUPPLEMENTAL_COLOR_TOKENS,
]
const UNIVERSITY_THEMES = UNIVERSITY_COLOR_TOKENS.map(buildThemeFromToken)
const THEMES_BY_ID = new Map(UNIVERSITY_THEMES.map((theme) => [theme.id, theme]))
const ALIAS_TO_ID = new Map<string, string>()

const EXTRA_ALIASES: Record<string, string> = {
  pnu: 'pnu',
  pusan: 'pnu',
  'pusan national university': 'pnu',
  부산대학교: 'pnu',
  부산대: 'pnu',

  doowon: 'doowon',
  'doowon technical university': 'doowon',
  'doowon university of technology': 'doowon',
  두원공과대학교: 'doowon',
  두원공과대: 'doowon',

  snu: 'snu',
  'seoul national university': 'snu',
  서울대학교: 'snu',
  서울대: 'snu',

  yonsei: 'yonsei',
  연세대학교: 'yonsei',
  연세대: 'yonsei',

  korea: 'korea',
  고려대학교: 'korea',
  고려대: 'korea',

  skku: 'skku',
  성균관대학교: 'skku',
  성균관대: 'skku',

  hanyang: 'hanyang',
  한양대학교: 'hanyang',
  한양대: 'hanyang',

  cau: 'cau',
  중앙대학교: 'cau',
  중앙대: 'cau',

  khu: 'khu',
  경희대학교: 'khu',
  경희대: 'khu',

  hufs: 'hufs',
  'hankuk university of foreign studies': 'hufs',
  한국외국어대학교: 'hufs',
  한국외대: 'hufs',
  외대: 'hufs',

  ewha: 'ewha',
  이화여자대학교: 'ewha',
  이화여대: 'ewha',
  이화: 'ewha',

  sookmyung: 'sookmyung',
  숙명여자대학교: 'sookmyung',
  숙명여대: 'sookmyung',
  숙명: 'sookmyung',

  pknu: 'pknu',
  부경대학교: 'pknu',
  부경대: 'pknu',

  kookmin: 'kookmin',
  국민대학교: 'kookmin',
  국민대: 'kookmin',

  soongsil: 'soongsil',
  숭실대학교: 'soongsil',
  숭실대: 'soongsil',

  sejong: 'sejong',
  세종대학교: 'sejong',
  세종대: 'sejong',

  ajou: 'ajou',
  아주대학교: 'ajou',
  아주대: 'ajou',

  hoseo: 'hoseo',
  호서대학교: 'hoseo',
  호서대: 'hoseo',

  hannam: 'hannam',
  한남대학교: 'hannam',
  한남대: 'hannam',

  keimyung: 'keimyung',
  계명대학교: 'keimyung',
  계명대: 'keimyung',
}

for (const theme of UNIVERSITY_THEMES) {
  for (const alias of buildGeneratedAliases(theme)) {
    ALIAS_TO_ID.set(normalizeSchoolText(alias), theme.id)
  }
}

for (const [alias, id] of Object.entries(EXTRA_ALIASES)) {
  ALIAS_TO_ID.set(normalizeSchoolText(alias), id)
}

export function getUniversityThemeOptions(): UniversityTheme[] {
  return UNIVERSITY_THEMES
}

export function getUniversityThemeSchoolOptions(): UniversityThemeSchoolOption[] {
  return UNIVERSITY_THEMES.map((theme) => ({
    id: theme.id,
    label: theme.shortName,
    value: theme.shortName,
    displayName: theme.displayName,
  }))
}

export function getUniversityThemeById(id: string | null | undefined): UniversityTheme {
  return THEMES_BY_ID.get(normalizeThemeId(id)) ?? getDefaultUniversityTheme()
}

export function getDefaultUniversityTheme(): UniversityTheme {
  return THEMES_BY_ID.get(DEFAULT_UNIVERSITY_THEME_ID) ?? UNIVERSITY_THEMES[0]
}

export function findUniversityThemeBySchool(school: string | null | undefined): UniversityTheme {
  const normalized = normalizeSchoolText(school ?? '')
  if (!normalized) return getDefaultUniversityTheme()

  const directId = ALIAS_TO_ID.get(normalized)
  if (directId) return getUniversityThemeById(directId)

  const looseMatch = UNIVERSITY_THEMES.find((theme) => {
    const aliases = buildGeneratedAliases(theme).map(normalizeSchoolText)
    return aliases.some((alias) => alias && (normalized.includes(alias) || alias.includes(normalized)))
  })

  return looseMatch ?? getDefaultUniversityTheme()
}

export function getPublicMascotAssetPath(
  theme: UniversityTheme,
  kind: UniversityThemeAssetKind,
): string {
  return theme.assets[kind]
}

const UNIVERSITY_BACKDROP_PATHS: Record<string, string> = {
  pnu: '/university-backdrops/pnu-campus-preview.png',
}

export function getUniversityBackdropAssetPath(theme: UniversityTheme): string | null {
  return UNIVERSITY_BACKDROP_PATHS[theme.id] ?? null
}

export function buildUniversityThemeCssVariables(theme: UniversityTheme): UniversityThemeCssVariables {
  return {
    '--boot-canvas': theme.colors.backgroundTop,
    '--boot-surface': theme.colors.backgroundBottom,
    '--boot-soft': theme.colors.surfaceTint,
    '--boot-primary': theme.colors.primary,
    '--boot-coral': theme.colors.secondary,
    '--boot-amber': theme.colors.accent,
    '--boot-ink': theme.colors.cta,
    '--boot-body': '#4B433D',
    '--boot-muted': theme.colors.muted,
    '--boot-hairline': '#E8DED4',
    '--boot-mint': theme.colors.success,
    '--boot-sky': theme.colors.queueMale,
    '--boot-lavender': theme.colors.queueMixed,
    '--boot-primary-rgb': hexToRgbChannels(theme.colors.primary),
    '--boot-coral-rgb': hexToRgbChannels(theme.colors.secondary),
    '--boot-amber-rgb': hexToRgbChannels(theme.colors.accent),
    '--boot-canvas-rgb': hexToRgbChannels(theme.colors.backgroundTop),
    '--boot-ink-rgb': hexToRgbChannels(theme.colors.cta),
    '--boot-body-rgb': '75 67 61',
    '--boot-muted-rgb': hexToRgbChannels(theme.colors.muted),
    '--boot-hairline-rgb': '232 222 212',
    '--boot-soft-rgb': hexToRgbChannels(theme.colors.surfaceTint),
    '--boot-surface-rgb': hexToRgbChannels(theme.colors.surface),
    '--boot-mint-rgb': hexToRgbChannels(theme.colors.success),
    '--boot-sky-rgb': hexToRgbChannels(theme.colors.queueMale),
    '--boot-lavender-rgb': hexToRgbChannels(theme.colors.queueMixed),
    '--boot-page-gradient': theme.gradients.page,
    '--boot-hero-gradient': theme.gradients.hero,
    '--boot-button-gradient': theme.gradients.primaryButton,
    '--boot-queue-ring': theme.gradients.queueRing,
    '--boot-deep-card-gradient': theme.gradients.deepCard,
    '--boot-card-shadow': theme.shadow.card,
    '--boot-button-shadow': theme.shadow.button,
    '--boot-deep-shadow': theme.shadow.deepCard,
    '--boot-bottom-nav-shadow': theme.shadow.bottomNav,
  }
}

export function setStoredUniversityThemeFromSchool(school: string): UniversityTheme {
  const theme = findUniversityThemeBySchool(school)
  storeUniversityThemeId(theme.id)
  return theme
}

export function storeUniversityThemeId(themeId: string): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(UNIVERSITY_THEME_STORAGE_KEY, themeId)
    window.document.cookie = [
      `${UNIVERSITY_THEME_COOKIE_NAME}=${encodeURIComponent(themeId)}`,
      'path=/',
      `max-age=${UNIVERSITY_THEME_COOKIE_MAX_AGE}`,
      'samesite=lax',
    ].join('; ')
    window.dispatchEvent(new CustomEvent(UNIVERSITY_THEME_CHANGE_EVENT, {
      detail: { themeId },
    }))
  }
}

function buildThemeFromToken(token: UniversityThemeToken): UniversityTheme {
  const backgroundBottom = '#FFFDF8'
  const surface = '#FFFFFF'
  const cta = '#171412'
  const deepCard = mixHex(token.primary, '#171412', 0.72)
  const secondary = normalizeReadableSecondary(token.secondary, token.primary)
  const assetRoot = DISPLAY_MASCOT_ROOT

  return {
    id: token.id,
    shortName: token.name,
    displayName: `Quantum ${token.name}`,
    tokenStatus: token.status,
    source: token.source,
    colors: {
      primary: token.primary,
      secondary,
      accent: token.accent,
      backgroundTop: token.backgroundTint,
      backgroundBottom,
      surface,
      surfaceTint: token.backgroundTint,
      deepCard,
      deepCardText: backgroundBottom,
      cta,
      ctaText: '#FFFFFF',
      ctaShadow: `0 18px 42px ${hexToRgba(token.primary, 0.28)}`,
      border: hexToRgba(token.primary, 0.22),
      muted: '#6F6A63',
      danger: '#F05858',
      success: '#2E9D68',
      queueMale: '#7DD3FC',
      queueFemale: '#FF8FA2',
      queueMixed: token.accent,
    },
    gradients: {
      page: `linear-gradient(180deg, ${token.backgroundTint} 0%, ${backgroundBottom} 72%)`,
      hero: [
        `radial-gradient(circle at 20% 8%, ${hexToRgba(token.accent, 0.40)}, transparent 34%)`,
        `radial-gradient(circle at 82% 12%, ${hexToRgba(token.primary, 0.22)}, transparent 30%)`,
        `linear-gradient(180deg, ${token.backgroundTint}, ${backgroundBottom})`,
      ].join(', '),
      primaryButton: `linear-gradient(135deg, ${cta} 0%, ${mixHex(token.primary, cta, 0.36)} 72%, ${secondary} 160%)`,
      queueRing: `conic-gradient(from 180deg, #7DD3FC, #FF8FA2, ${token.accent}, #7DD3FC)`,
      deepCard: `linear-gradient(145deg, ${deepCard} 0%, ${cta} 64%, ${hexToRgba(token.primary, 0.62)} 140%)`,
    },
    shadow: {
      card: `0 18px 46px ${hexToRgba(token.primary, 0.14)}`,
      button: `0 18px 42px ${hexToRgba(token.primary, 0.28)}`,
      deepCard: `0 24px 56px ${hexToRgba(deepCard, 0.34)}`,
      bottomNav: `0 12px 34px ${hexToRgba(token.primary, 0.15)}`,
    },
    assets: Object.fromEntries(
      MASCOT_POSES.map((pose) => [pose, `${assetRoot}/${token.id}/${pose}.png`]),
    ) as Record<UniversityThemeAssetKind, string>,
    copy: {
      loginKicker: `${token.name} Quantum`,
      loginTitle: `${token.name} 기준으로 과팅을 시작해요`,
      homeGreeting: `${token.name} 분위기로 오늘의 매칭을 준비했어요`,
      matchWaiting: `${token.name} 기준으로 조건이 맞는 상대를 찾는 중이에요`,
      refundAsk: `${token.name} 친구들이 안전하게 만날 수 있게 1,000원만 앱 운영을 응원해줄래요?`,
      notificationTone: `${token.name} 톤은 친근하지만 과장하지 않고, 다음 행동을 한 문장으로 안내`,
    },
    designTheme: {
      mascotRole: `${token.name} Quantum 도우미`,
      landmarkCue: token.source,
      pattern: `${token.id} campus tint`,
    },
  }
}

function buildGeneratedAliases(theme: UniversityTheme): string[] {
  const aliases = new Set<string>([
    theme.id,
    theme.shortName,
    theme.displayName,
    `${theme.shortName}학교`,
    `${theme.shortName} 학생`,
  ])

  if (theme.shortName.endsWith('대')) {
    const base = theme.shortName.slice(0, -1)
    aliases.add(base)
    aliases.add(`${base}대학교`)
  }

  if (theme.shortName.endsWith('여대')) {
    const base = theme.shortName.slice(0, -2)
    aliases.add(base)
    aliases.add(`${base}여자대학교`)
  }

  return Array.from(aliases)
}

function normalizeThemeId(id: string | null | undefined): string {
  return (id ?? '').trim().toLowerCase()
}

function normalizeSchoolText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/quantum|퀀텀/g, '')
    .replace(/university|college|national|technical|polytechnic|institute/g, '')
    .replace(/대학교|대학|학교/g, '')
    .replace(/여자/g, '여')
    .replace(/외국어/g, '외')
    .replace(/[\s·._\-()]/g, '')
    .trim()
}

function normalizeReadableSecondary(secondary: string, primary: string): string {
  return secondary.toUpperCase() === '#FFFFFF' ? mixHex(primary, '#FFFFFF', 0.70) : secondary
}

function hexToRgbChannels(hex: string): string {
  const normalized = hex.replace('#', '').trim()
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return '23 20 18'
  const value = Number.parseInt(normalized, 16)
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255
  return `${r} ${g} ${b}`
}

function hexToRgba(hex: string, alpha: number): string {
  return `rgba(${hexToRgbChannels(hex).replaceAll(' ', ', ')}, ${alpha})`
}

function mixHex(hexA: string, hexB: string, weightB: number): string {
  const a = hexToRgb(hexA)
  const b = hexToRgb(hexB)
  if (!a || !b) return hexA

  const weightA = 1 - weightB
  return rgbToHex({
    r: Math.round(a.r * weightA + b.r * weightB),
    g: Math.round(a.g * weightA + b.g * weightB),
    b: Math.round(a.b * weightA + b.b * weightB),
  })
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.replace('#', '').trim()
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null
  const value = Number.parseInt(normalized, 16)
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  }
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string {
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('').toUpperCase()}`
}

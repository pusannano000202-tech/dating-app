import rawColorTokens from '../docs/design-mockups/quantum_41_frontend_color_tokens_2026-07-04.json'
import additionalBrandProfiles from '../docs/design-mockups/quantum_top60_additional_university_brand_profiles_2026-07-06.json'

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
  shortName?: string
  primary: string
  secondary: string
  accent: string
  backgroundTint: string
  textOnPrimary: string
  status: UniversityThemeTokenStatus
  source: string
  sourceUrls?: string[]
  rank?: number
  students?: number
  mascotAnimal?: string
  mascotCharacter?: string
  notes?: string
}

export interface UniversityTheme {
  id: string
  name: string
  shortName: string
  displayName: string
  tokenStatus: UniversityThemeTokenStatus
  source: string
  sourceUrls: string[]
  mascotAnimal: string
  mascotCharacter: string
  notes?: string
  rank?: number
  students?: number
  colors: {
    primary: string
    secondary: string
    accent: string
    backgroundTop: string
    backgroundBottom: string
    surfaceTint: string
    surface: string
    cta: string
    muted: string
    success: string
    queueMale: string
    queueMixed: string
    textOnPrimary: string
  }
  copy: {
    matchWaiting: string
    notificationTone: string
    refundAsk: string
  }
  designTheme: {
    moodKeywords: string[]
    landmarkCue: string
    loginBackground: string
    matchingQueueMood: string
    depositRefundScene: string
    dailyCardMood: string
    notificationTone: string
  }
  assets: Record<UniversityThemeAssetKind, string>
  searchAliases: string[]
}

export interface UniversityThemeSchoolOption {
  id: string
  value: string
  label: string
  name: string
  shortName: string
  displayName: string
  aliases: string[]
  tokenStatus: UniversityThemeTokenStatus
}

export type UniversityThemeCssVariables = Record<`--${string}`, string>

type RawColorToken = {
  id: string
  name: string
  primary: string
  secondary: string
  accent: string
  backgroundTint: string
  textOnPrimary?: string
  status?: string
  source?: string
}

type AdditionalBrandProfile = {
  id: string
  name: string
  short?: string
  rank?: number
  students?: number
  animal?: string
  character?: string
  colors?: {
    primary?: string
    secondary?: string
    accent?: string
    background?: string
    backgroundTint?: string
  }
  confidence?: string
  source?: string
  notes?: string
  sourceUrls?: string[]
}

type AdditionalBrandProfilesPayload = {
  universities?: AdditionalBrandProfile[]
}

const MASCOT_POSES: MascotPose[] = ['welcome', 'guide', 'waiting', 'support', 'confirm', 'refund', 'avatar']
const DISPLAY_MASCOT_ROOT = '/university-mascots/app-assets-v3-display'

const OFFICIAL_NAME_OVERRIDES: Record<string, string> = {
  doowon: '두원공과대학교',
  konkuk: '건국대학교',
  pnu: '부산대학교',
  yonsei: '연세대학교',
  skku: '성균관대학교',
  hanyang: '한양대학교',
  korea: '고려대학교',
  khu: '경희대학교',
  cau: '중앙대학교',
  snu: '서울대학교',
  hufs: '한국외국어대학교',
  ewha: '이화여자대학교',
  knu: '경북대학교',
  gachon: '가천대학교',
  yeungnam: '영남대학교',
  keimyung: '계명대학교',
  chosun: '조선대학교',
  inha: '인하대학교',
  jbnu: '전북대학교',
  cnu: '충남대학교',
  donga: '동아대학교',
  jnu: '전남대학교',
  gnu: '경상국립대학교',
  daegu: '대구대학교',
  pknu: '부경대학교',
  kookmin: '국민대학교',
  soongsil: '숭실대학교',
  dongeui: '동의대학교',
  kangwon: '강원대학교',
  dongguk: '동국대학교',
  chungbuk: '충북대학교',
  sejong: '세종대학교',
  hongik: '홍익대학교',
  wonkwang: '원광대학교',
  hoseo: '호서대학교',
  cheongju: '청주대학교',
  kyonggi: '경기대학교',
  hannam: '한남대학교',
  baekseok: '백석대학교',
  dankook: '단국대학교',
  dcu: '대구가톨릭대학교',
  ajou: '아주대학교',
}

const SHORT_NAME_OVERRIDES: Record<string, string> = {
  doowon: '두원공과대',
  konkuk: '건국대',
  pnu: '부산대',
  yonsei: '연세대',
  skku: '성균관대',
  hanyang: '한양대',
  korea: '고려대',
  khu: '경희대',
  cau: '중앙대',
  snu: '서울대',
  hufs: '한국외대',
  ewha: '이화여대',
  knu: '경북대',
  gachon: '가천대',
  yeungnam: '영남대',
  keimyung: '계명대',
  chosun: '조선대',
  inha: '인하대',
  jbnu: '전북대',
  cnu: '충남대',
  donga: '동아대',
  jnu: '전남대',
  gnu: '경상국립대',
  daegu: '대구대',
  pknu: '부경대',
  kookmin: '국민대',
  soongsil: '숭실대',
  dongeui: '동의대',
  kangwon: '강원대',
  dongguk: '동국대',
  chungbuk: '충북대',
  sejong: '세종대',
  hongik: '홍익대',
  wonkwang: '원광대',
  hoseo: '호서대',
  cheongju: '청주대',
  kyonggi: '경기대',
  hannam: '한남대',
  baekseok: '백석대',
  dankook: '단국대',
  dcu: '대구가톨릭대',
  ulsan: '울산대',
  ks: '경성대',
  kongju: '공주대',
  inu: '인천대',
  kyungnam: '경남대',
  jj: '전주대',
  seoultech: '서울과기대',
  sch: '순천향대',
  jejunu: '제주대',
  ajou: '아주대',
  dongseo: '동서대',
  sunmoon: '선문대',
  nsu: '남서울대',
  wsu: '우송대',
  uos: '서울시립대',
  dju: '대전대',
  suwon: '수원대',
  sookmyung: '숙명여대',
}

const THEME_ALIASES: Record<string, string[]> = {
  doowon: ['두원공과대학교', '두원공대', '두원공과대', 'doowon', 'dtu'],
  konkuk: ['건국대학교', '건국대', 'konkuk', 'ku'],
  pnu: ['부산대학교', '부산대', 'pusan national university', 'pnu'],
  yonsei: ['연세대학교', '연세대', 'yonsei', 'ysu'],
  skku: ['성균관대학교', '성균관대', 'skku'],
  hanyang: ['한양대학교', '한양대', 'hanyang', 'hyu'],
  korea: ['고려대학교', '고려대', 'korea university', 'ku'],
  khu: ['경희대학교', '경희대', 'kyung hee', 'khu'],
  cau: ['중앙대학교', '중앙대', 'chung-ang', 'cau'],
  snu: ['서울대학교', '서울대', 'seoul national university', 'snu'],
  hufs: ['한국외국어대학교', '한국외대', '외대', 'hufs'],
  ewha: ['이화여자대학교', '이화여대', '이대', 'ewha'],
  knu: ['경북대학교', '경북대', 'knu'],
  gachon: ['가천대학교', '가천대', 'gachon'],
  yeungnam: ['영남대학교', '영남대', 'ynu'],
  keimyung: ['계명대학교', '계명대', 'kmu'],
  chosun: ['조선대학교', '조선대', 'chosun'],
  inha: ['인하대학교', '인하대', 'inha'],
  jbnu: ['전북대학교', '전북대', 'jbnu'],
  cnu: ['충남대학교', '충남대', 'cnu'],
  donga: ['동아대학교', '동아대', 'donga'],
  jnu: ['전남대학교', '전남대', 'jnu'],
  gnu: ['경상국립대학교', '경상국립대', '경상대', 'gnu'],
  daegu: ['대구대학교', '대구대', 'daegu university'],
  pknu: ['부경대학교', '부경대', 'pknu'],
  kookmin: ['국민대학교', '국민대', 'kookmin'],
  soongsil: ['숭실대학교', '숭실대', 'soongsil', 'ssu'],
  dongeui: ['동의대학교', '동의대', 'dongeui'],
  kangwon: ['강원대학교', '강원대', 'kangwon', 'knu'],
  dongguk: ['동국대학교', '동국대', 'dongguk'],
  chungbuk: ['충북대학교', '충북대', 'chungbuk', 'cbnu'],
  sejong: ['세종대학교', '세종대', 'sejong'],
  hongik: ['홍익대학교', '홍익대', 'hongik'],
  wonkwang: ['원광대학교', '원광대', 'wonkwang'],
  hoseo: ['호서대학교', '호서대', 'hoseo'],
  cheongju: ['청주대학교', '청주대', 'cheongju'],
  kyonggi: ['경기대학교', '경기대', 'kyonggi'],
  hannam: ['한남대학교', '한남대', 'hannam'],
  baekseok: ['백석대학교', '백석대', 'baekseok'],
  dankook: ['단국대학교', '단국대', 'dankook', 'dku'],
  dcu: ['대구가톨릭대학교', '대구가톨릭대', '대가대', 'dcu'],
  ulsan: ['울산대학교', '울산대', 'ulsan'],
  ks: ['경성대학교', '경성대', 'kyungsung', 'ksu'],
  kongju: ['공주대학교', '공주대', 'kongju', 'knu'],
  inu: ['인천대학교', '인천대', 'incheon national university', 'inu'],
  kyungnam: ['경남대학교', '경남대', 'kyungnam'],
  jj: ['전주대학교', '전주대', 'jeonju'],
  seoultech: ['서울과학기술대학교', '서울과기대', '서울과학기술대', 'seoultech'],
  sch: ['순천향대학교', '순천향대', 'soonchunhyang', 'sch'],
  jejunu: ['제주대학교', '제주대', 'jejunu'],
  ajou: ['아주대학교', '아주대', 'ajou'],
  dongseo: ['동서대학교', '동서대', 'dongseo'],
  sunmoon: ['선문대학교', '선문대', 'sunmoon'],
  nsu: ['남서울대학교', '남서울대', 'namseoul', 'nsu'],
  wsu: ['우송대학교', '우송대', 'woosong', 'wsu'],
  uos: ['서울시립대학교', '서울시립대', '시립대', 'uos'],
  dju: ['대전대학교', '대전대', 'daejeon', 'dju'],
  suwon: ['수원대학교', '수원대', 'suwon'],
  sookmyung: ['숙명여자대학교', '숙명여대', '숙대', 'sookmyung'],
}

const LANDMARK_CUES: Record<string, string> = {
  pnu: '넉넉한터/새벽벌도서관',
  yonsei: '언더우드관/백양로',
  korea: '본관/민족고대 광장',
  snu: '샤로수길/중앙도서관',
  khu: '평화의 전당/캠퍼스 광장',
  hanyang: '애지문/한양플라자',
  skku: '명륜당/성균관길',
  cau: '청룡연못/중앙광장',
  hufs: '사이버관/외대앞',
  ewha: 'ECC/이화캠퍼스복합단지',
  dcu: '효성캠퍼스 중앙도서관',
  ulsan: '중앙정원/아산스포츠센터',
  ks: '문화골목/예술관',
  kongju: '중앙도서관/곰나루',
  inu: '송도캠퍼스/미추홀공원',
  kyungnam: '월영지/한마미래관',
  jj: '스타센터/천잠산 캠퍼스',
  seoultech: '붕어방/다산관',
  sch: '향설동문/피닉스광장',
  jejunu: '아라캠퍼스/중앙도서관',
  ajou: '원천관/중앙도서관',
  dongseo: '민석도서관/센텀캠퍼스',
  sunmoon: '아산캠퍼스/원화관',
  nsu: '성암문화체육관/캠퍼스 광장',
  wsu: '솔브릿지/철도물류관',
  uos: '전농관/중앙로',
  dju: '혜화문화관/맥센터',
  suwon: '미래혁신관/벨칸토아트센터',
  sookmyung: '순헌관/청파로',
}

const MASCOT_HINTS: Record<string, { animal: string; character: string }> = {
  doowon: { animal: '천마/말', character: '초록 갈기 천마형 자체 캐릭터' },
  dcu: { animal: '펠리컨/디쿠 계열', character: '대구가톨릭대 펠리컨 상징을 참고한 파랑·금색 자체 캐릭터' },
  pnu: { animal: '독수리/산지니 계열', character: '부산대 독수리 상징을 참고한 파랑·청록 자체 캐릭터' },
  yonsei: { animal: '독수리', character: '연세대 블루 독수리 상징을 참고한 절제형 자체 캐릭터' },
  korea: { animal: '호랑이', character: '고려대 호랑이 상징을 참고한 크림슨 머플러 자체 캐릭터' },
  soongsil: { animal: '백마', character: '숭실대 백마 상징을 참고한 흰 말 자체 캐릭터' },
  konkuk: { animal: '황소', character: '건국대 황소 상징을 참고한 단단한 자체 캐릭터' },
  cnu: { animal: '백마', character: '충남대 백마 상징을 참고한 남색 망토 흰 말 자체 캐릭터' },
  kyonggi: { animal: '기룡이/아기거북이', character: '경기대 기룡이의 거북 모티브를 참고한 청록 기룡형 자체 캐릭터' },
  hoseo: { animal: '호수리·호오리/독수리·오리', character: '호서대 공식 마스코트 모티브를 참고한 붉은 새 계열 자체 캐릭터' },
  sejong: { animal: '기린형 캠퍼스 캐릭터 후보', character: '세종대 시계탑·기린 문화와 crimson 톤을 참고한 기린형 자체 캐릭터' },
  ajou: { animal: '치토/불꽃 캐릭터 후보', character: '아주대 파랑+금빛 불꽃 요정형 자체 캐릭터' },
  dongseo: { animal: '독수리 공식 상징 + ATO 계열 캐릭터 문화', character: '동서대 ATO-inspired 비동물 companion' },
  wsu: { animal: '공식 동물 확인 낮음', character: '소나무·철도·글로벌 상징 기반 companion' },
}

const UNIVERSITY_COLOR_TOKENS = buildUniversityColorTokens()
const UNIVERSITY_THEMES = UNIVERSITY_COLOR_TOKENS.map(buildThemeFromToken)
const THEMES_BY_ID = new Map(UNIVERSITY_THEMES.map((theme) => [theme.id, theme]))
const THEME_ID_BY_ALIAS = new Map<string, string>()

for (const theme of UNIVERSITY_THEMES) {
  for (const alias of theme.searchAliases) {
    const normalized = normalizeSearchKey(alias)
    if (normalized && !THEME_ID_BY_ALIAS.has(normalized)) {
      THEME_ID_BY_ALIAS.set(normalized, theme.id)
    }
  }
}

export function getUniversityThemeOptions(): UniversityTheme[] {
  return UNIVERSITY_THEMES
}

export function getUniversityThemeSchoolOptions(): UniversityThemeSchoolOption[] {
  return UNIVERSITY_THEMES.map((theme) => ({
    id: theme.id,
    value: theme.name,
    label: theme.name,
    name: theme.name,
    shortName: theme.shortName,
    displayName: theme.name,
    aliases: theme.searchAliases,
    tokenStatus: theme.tokenStatus,
  }))
}

export function getUniversityThemeById(id: string | null | undefined): UniversityTheme {
  return THEMES_BY_ID.get(normalizeThemeId(id)) ?? getDefaultUniversityTheme()
}

export function getDefaultUniversityTheme(): UniversityTheme {
  return THEMES_BY_ID.get(DEFAULT_UNIVERSITY_THEME_ID) ?? UNIVERSITY_THEMES[0]
}

export function findUniversityThemeBySchool(school: string | null | undefined): UniversityTheme {
  const normalized = normalizeSearchKey(school)
  if (!normalized) return getDefaultUniversityTheme()

  const directId = THEMES_BY_ID.has(normalized) ? normalized : THEME_ID_BY_ALIAS.get(normalized)
  if (directId) return getUniversityThemeById(directId)

  const looseMatch = UNIVERSITY_THEMES.find((theme) =>
    theme.searchAliases.some((alias) => {
      const normalizedAlias = normalizeSearchKey(alias)
      return normalizedAlias.length >= 2 && (normalized.includes(normalizedAlias) || normalizedAlias.includes(normalized))
    }),
  )

  return looseMatch ?? getDefaultUniversityTheme()
}

export function getPublicMascotAssetPath(
  theme: UniversityTheme,
  kind: UniversityThemeAssetKind,
): string {
  return theme.assets[kind] ?? theme.assets.avatar
}

export function getUniversityBackdropAssetPath(theme: UniversityTheme): string | null {
  if (theme.id === 'pnu') return '/university-backdrops/pnu-campus-preview.png'
  return null
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
    '--boot-muted': theme.colors.muted,
    '--boot-mint': theme.colors.success,
    '--boot-sky': theme.colors.queueMale,
    '--boot-lavender': theme.colors.queueMixed,
    '--boot-page-gradient': `linear-gradient(180deg, ${theme.colors.backgroundTop} 0%, ${theme.colors.backgroundBottom} 100%)`,
    '--boot-primary-rgb': hexToRgbChannels(theme.colors.primary),
    '--boot-coral-rgb': hexToRgbChannels(theme.colors.secondary),
    '--boot-amber-rgb': hexToRgbChannels(theme.colors.accent),
    '--boot-canvas-rgb': hexToRgbChannels(theme.colors.backgroundTop),
    '--boot-ink-rgb': hexToRgbChannels(theme.colors.cta),
    '--boot-muted-rgb': hexToRgbChannels(theme.colors.muted),
    '--boot-soft-rgb': hexToRgbChannels(theme.colors.surfaceTint),
    '--boot-surface-rgb': hexToRgbChannels(theme.colors.surface),
    '--boot-mint-rgb': hexToRgbChannels(theme.colors.success),
    '--boot-sky-rgb': hexToRgbChannels(theme.colors.queueMale),
    '--boot-lavender-rgb': hexToRgbChannels(theme.colors.queueMixed),
    '--quantum-university-primary': theme.colors.primary,
    '--quantum-university-secondary': theme.colors.secondary,
    '--quantum-university-accent': theme.colors.accent,
    '--quantum-university-background': theme.colors.backgroundTop,
  }
}

export function setStoredUniversityThemeFromSchool(school: string): UniversityTheme {
  const theme = findUniversityThemeBySchool(school)
  storeUniversityThemeId(theme.id)
  return theme
}

export function storeUniversityThemeId(themeId: string): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(UNIVERSITY_THEME_STORAGE_KEY, themeId)
  } catch {
    // Ignore private-mode storage failures. Cookie + event still keep the current screen in sync.
  }

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

function buildUniversityColorTokens(): UniversityThemeToken[] {
  const byId = new Map<string, UniversityThemeToken>()
  const baseTokens = (rawColorTokens as RawColorToken[]).map(normalizeRawColorToken)
  const additionalTokens = (((additionalBrandProfiles as unknown) as AdditionalBrandProfilesPayload).universities ?? [])
    .map(normalizeAdditionalProfile)

  for (const token of [...baseTokens, ...additionalTokens]) {
    byId.set(token.id, token)
  }

  return Array.from(byId.values())
}

function normalizeRawColorToken(token: RawColorToken): UniversityThemeToken {
  const id = normalizeThemeId(token.id)
  const name = OFFICIAL_NAME_OVERRIDES[id] ?? token.name
  return {
    id,
    name,
    shortName: SHORT_NAME_OVERRIDES[id] ?? deriveShortName(token.name),
    primary: normalizeHex(token.primary, '#1F5C99'),
    secondary: normalizeHex(token.secondary, '#FFFFFF'),
    accent: normalizeHex(token.accent, '#F2C94C'),
    backgroundTint: normalizeHex(token.backgroundTint, '#F7FAFC'),
    textOnPrimary: normalizeHex(token.textOnPrimary, '#FFFFFF'),
    status: normalizeStatus(token.status),
    source: token.source ?? '기존 41개 프론트 색상 토큰',
    sourceUrls: [],
    mascotAnimal: MASCOT_HINTS[id]?.animal,
    mascotCharacter: MASCOT_HINTS[id]?.character,
  }
}

function normalizeAdditionalProfile(profile: AdditionalBrandProfile): UniversityThemeToken {
  const id = normalizeThemeId(profile.id)
  const name = OFFICIAL_NAME_OVERRIDES[id] ?? profile.name
  return {
    id,
    name,
    shortName: SHORT_NAME_OVERRIDES[id] ?? profile.short ?? deriveShortName(name),
    primary: normalizeHex(profile.colors?.primary, '#1F5C99'),
    secondary: normalizeHex(profile.colors?.secondary, '#FFFFFF'),
    accent: normalizeHex(profile.colors?.accent, '#F2C94C'),
    backgroundTint: normalizeHex(profile.colors?.background ?? profile.colors?.backgroundTint, '#F7FAFC'),
    textOnPrimary: '#FFFFFF',
    status: statusFromConfidence(profile.confidence),
    source: profile.source ?? 'Top60 추가 학교 리서치 기반 색상 토큰',
    sourceUrls: profile.sourceUrls ?? [],
    rank: profile.rank,
    students: profile.students,
    mascotAnimal: profile.animal ?? MASCOT_HINTS[id]?.animal,
    mascotCharacter: profile.character ?? MASCOT_HINTS[id]?.character,
    notes: profile.notes,
  }
}

function buildThemeFromToken(token: UniversityThemeToken): UniversityTheme {
  const shortName = token.shortName ?? deriveShortName(token.name)
  const mascotHint = MASCOT_HINTS[token.id]
  const mascotAnimal = token.mascotAnimal ?? mascotHint?.animal ?? '학교 상징 기반 자체 캐릭터'
  const mascotCharacter = token.mascotCharacter ?? mascotHint?.character ?? `${shortName} 상징을 참고한 앱 전용 자체 캐릭터`
  const landmarkCue = LANDMARK_CUES[token.id] ?? `${shortName} 캠퍼스`

  return {
    id: token.id,
    name: token.name,
    shortName,
    displayName: `퀀텀 ${shortName}`,
    tokenStatus: token.status,
    source: token.source,
    sourceUrls: token.sourceUrls ?? [],
    mascotAnimal,
    mascotCharacter,
    notes: token.notes,
    rank: token.rank,
    students: token.students,
    colors: {
      primary: token.primary,
      secondary: token.secondary,
      accent: token.accent,
      backgroundTop: token.backgroundTint,
      backgroundBottom: '#FFFFFF',
      surfaceTint: token.backgroundTint,
      surface: '#FFFFFF',
      cta: '#211A1A',
      muted: '#6F6A65',
      success: token.secondary === '#FFFFFF' ? token.primary : token.secondary,
      queueMale: token.primary,
      queueMixed: token.accent,
      textOnPrimary: token.textOnPrimary,
    },
    copy: {
      matchWaiting: `${shortName} 기준으로 조건이 맞는 팀을 찾는 중입니다`,
      notificationTone: `${shortName} 분위기에 맞춰 필요한 알림만 차분하게 알려드릴게요.`,
      refundAsk: `정상 만남 후 보증금은 안전하게 환불돼요. 괜찮았다면 ${shortName} 퀀텀 운영을 1,000원만 응원해줄래요?`,
    },
    designTheme: {
      moodKeywords: buildMoodKeywords(token),
      landmarkCue,
      loginBackground: `${landmarkCue}의 색감은 배경 tint로만 약하게 반영`,
      matchingQueueMood: `${shortName} 학생에게 익숙한 색상 포인트로 대기 상태를 표시`,
      depositRefundScene: `${mascotCharacter}가 CTA를 가리지 않는 우하단 보조 포즈로 안심/부탁`,
      dailyCardMood: `${shortName} 색상 token의 accent를 카드 뱃지에만 절제 적용`,
      notificationTone: `${shortName} 말투는 친근하지만 과장하지 않음`,
    },
    assets: buildMascotAssets(token.id),
    searchAliases: buildSearchAliases(token.id, token.name, shortName),
  }
}

function buildMoodKeywords(token: UniversityThemeToken): string[] {
  const statusKeyword = token.status === 'locked' ? 'official-leaning' : token.status === 'draft' ? 'draft-safe' : 'needs-check'
  return [statusKeyword, 'campus-native', 'cta-safe']
}

function buildMascotAssets(id: string): Record<UniversityThemeAssetKind, string> {
  return Object.fromEntries(
    MASCOT_POSES.map((pose) => [pose, `${DISPLAY_MASCOT_ROOT}/${id}/${pose}.png`]),
  ) as Record<UniversityThemeAssetKind, string>
}

function buildSearchAliases(id: string, name: string, shortName: string): string[] {
  return uniqueStrings([
    id,
    name,
    shortName,
    name.replace(/대학교$/, '대'),
    name.replace(/여자대학교$/, '여대'),
    name.replace(/공과대학교$/, '공과대'),
    `퀀텀 ${shortName}`,
    ...(THEME_ALIASES[id] ?? []),
  ])
}

function deriveShortName(name: string): string {
  return name
    .replace(/여자대학교$/, '여대')
    .replace(/공과대학교$/, '공과대')
    .replace(/대학교$/, '대')
}

function normalizeThemeId(id: string | null | undefined): string {
  return String(id ?? '').trim().toLowerCase()
}

function normalizeSearchKey(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
}

function normalizeStatus(status: string | null | undefined): UniversityThemeTokenStatus {
  if (status === 'locked' || status === 'draft' || status === 'needsOfficialCheck') return status
  return 'draft'
}

function statusFromConfidence(confidence: string | null | undefined): UniversityThemeTokenStatus {
  if (confidence === 'high') return 'locked'
  if (confidence === 'medium') return 'draft'
  return 'needsOfficialCheck'
}

function normalizeHex(value: string | null | undefined, fallback: string): string {
  const raw = String(value ?? '').trim()
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toUpperCase()
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`.toUpperCase()
  }
  return fallback
}

function hexToRgbChannels(hex: string): string {
  const normalized = normalizeHex(hex, '#000000')
  const value = normalized.slice(1)
  const red = parseInt(value.slice(0, 2), 16)
  const green = parseInt(value.slice(2, 4), 16)
  const blue = parseInt(value.slice(4, 6), 16)
  return `${red} ${green} ${blue}`
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const trimmed = String(value ?? '').trim()
    const key = normalizeSearchKey(trimmed)
    if (!trimmed || seen.has(key)) continue
    seen.add(key)
    result.push(trimmed)
  }

  return result
}

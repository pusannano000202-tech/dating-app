import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEFAULT_UNIVERSITY_THEME_ID,
  UNIVERSITY_THEME_COOKIE_MAX_AGE,
  UNIVERSITY_THEME_COOKIE_NAME,
  UNIVERSITY_THEME_STORAGE_KEY,
  buildUniversityThemeCssVariables,
  findUniversityThemeBySchool,
  getUniversityBackdropAssetPath,
  getPublicMascotAssetPath,
  getUniversityThemeSchoolOptions,
  getUniversityThemeById,
  getUniversityThemeOptions,
} from '../../lib/university-theme'
import {
  getUniversityDepartmentStats,
  searchUniversityDepartments,
} from '../../lib/university-departments'

const ROOT = process.cwd()
const MASCOT_KINDS = ['welcome', 'guide', 'waiting', 'support', 'confirm', 'refund', 'avatar'] as const

function readSource(path: string) {
  return readFileSync(join(ROOT, path), 'utf8')
}


test('university theme registry exposes Top60 unique school themes plus Doowon', () => {
  const options = getUniversityThemeOptions()
  const ids = options.map((option) => option.id)
  const uniqueIds = new Set(ids)
  const uniquePalettes = new Set(options.map((option) => [
    option.colors.primary,
    option.colors.secondary,
    option.colors.accent,
    option.colors.backgroundTop,
  ].join('|')))
  const requiredIds = [
    'doowon', 'pnu', 'kookmin', 'soongsil', 'sejong', 'ajou', 'hoseo', 'hannam', 'keimyung',
    'dcu', 'ulsan', 'ks', 'kongju', 'inu', 'kyungnam', 'jj', 'seoultech', 'sch', 'jejunu',
    'dongseo', 'sunmoon', 'nsu', 'wsu', 'uos', 'dju', 'suwon', 'sookmyung',
  ]

  assert.equal(options.length, 59)
  assert.equal(uniqueIds.size, 59)
  assert.ok(uniquePalettes.size >= 45)
  for (const id of requiredIds) assert.ok(ids.includes(id), `${id} theme should be registered`)
  assert.equal(DEFAULT_UNIVERSITY_THEME_ID, 'pnu')
  assert.equal(UNIVERSITY_THEME_STORAGE_KEY, 'quantum_university_theme_id')
  assert.equal(UNIVERSITY_THEME_COOKIE_NAME, UNIVERSITY_THEME_STORAGE_KEY)
  assert.equal(UNIVERSITY_THEME_COOKIE_MAX_AGE, 60 * 60 * 24 * 365)
  assert.equal(getUniversityThemeById('pnu').displayName, '퀀텀 부산대')
  assert.equal(getUniversityThemeById('doowon').displayName, '퀀텀 두원공과대')
  assert.equal(getUniversityThemeById('yonsei').displayName, '퀀텀 연세대')
  assert.equal(getUniversityThemeById('korea').displayName, '퀀텀 고려대')
  assert.equal(getUniversityThemeById('sookmyung').displayName, '퀀텀 숙명여대')
})


test('basic profile school picker exposes every registered university and updates theme while typing', () => {
  const schoolOptions = getUniversityThemeSchoolOptions()
  const basicInfoForm = readSource('components/profile/BasicInfoForm.tsx')

  assert.equal(schoolOptions.length, 59)
  assert.equal(new Set(schoolOptions.map((option) => option.id)).size, 59)
  assert.ok(schoolOptions.some((option) => option.id === 'pnu' && option.label === '부산대학교'))
  assert.ok(schoolOptions.some((option) => option.id === 'doowon' && option.label === '두원공과대학교'))
  assert.ok(schoolOptions.some((option) => option.id === 'hoseo' && option.label === '호서대학교'))
  assert.ok(schoolOptions.some((option) => option.id === 'ajou' && option.label === '아주대학교'))
  assert.ok(schoolOptions.some((option) => option.id === 'dcu' && option.label === '대구가톨릭대학교'))
  assert.ok(schoolOptions.some((option) => option.id === 'sookmyung' && option.label === '숙명여자대학교'))
  assert.match(basicInfoForm, /getUniversityThemeSchoolOptions/)
  assert.match(basicInfoForm, /const UNIVERSITY_SCHOOL_OPTIONS = getUniversityThemeSchoolOptions\(\)/)
  assert.match(basicInfoForm, /const QUICK_SCHOOL_OPTIONS = \[\.\.\.UNIVERSITY_SCHOOL_OPTIONS\]\.sort/)
  assert.match(basicInfoForm, /localeCompare\(b\.label, 'ko-KR'\)/)
  assert.match(basicInfoForm, /handleSchoolChange/)
  assert.match(basicInfoForm, /setStoredUniversityThemeFromSchool\(nextSchool\)/)
  assert.match(basicInfoForm, /setStoredUniversityThemeFromSchool\(school\)/)
  assert.match(basicInfoForm, /htmlFor="basic-school-input"/)
  assert.match(basicInfoForm, /id="basic-school-input"/)
  assert.match(basicInfoForm, /list="university-school-options"/)
  assert.match(basicInfoForm, /<datalist id="university-school-options">/)
  assert.match(basicInfoForm, /UNIVERSITY_SCHOOL_OPTIONS\.map/)
  assert.match(basicInfoForm, /QUICK_SCHOOL_OPTIONS\.map/)
  assert.match(basicInfoForm, /aria-label=\{`\$\{option\.label\} 테마로 바꾸기`\}/)
})


test('official department data coverage is explicit for Top60 theme expansion', () => {
  const stats = getUniversityDepartmentStats()
  const pnuComputer = searchUniversityDepartments('부산대학교', '컴퓨터')
  const hoseoGame = searchUniversityDepartments('호서대학교', '게임')
  const ajouSearch = searchUniversityDepartments('아주대학교', '전자')
  const expectedMissing = [
    'dcu', 'dju', 'dongseo', 'inu', 'jejunu', 'jj', 'kongju', 'ks', 'kyungnam', 'nsu',
    'sch', 'seoultech', 'sookmyung', 'sunmoon', 'suwon', 'ulsan', 'uos', 'wsu',
  ]

  assert.equal(stats.universityCount, 41)
  assert.equal(stats.activeDepartmentRows, 3984)
  assert.deepEqual(stats.themeIdsMissingOfficialDepartments, expectedMissing)
  assert.deepEqual(stats.officialDepartmentIdsNotInThemeRegistry, [])
  assert.ok(pnuComputer.length > 0)
  assert.ok(pnuComputer.every((option) => option.universityId === 'pnu'))
  assert.ok(pnuComputer.some((option) => option.name.includes('컴퓨터')))
  assert.ok(pnuComputer.every((option) => !option.status.includes('추정')))
  assert.ok(hoseoGame.length > 0)
  assert.ok(hoseoGame.every((option) => option.universityId === 'hoseo'))
  assert.ok(hoseoGame.some((option) => option.name.includes('게임')))
  assert.ok(ajouSearch.length > 0)
  assert.ok(ajouSearch.every((option) => option.universityId === 'ajou'))
})

test('basic profile department picker follows the currently selected university', () => {
  const basicInfoForm = readSource('components/profile/BasicInfoForm.tsx')

  assert.match(basicInfoForm, /searchUniversityDepartments/)
  assert.match(basicInfoForm, /getUniversityDepartmentGroupsBySchool/)
  assert.match(basicInfoForm, /searchUniversityDepartments\(school,/)
  assert.match(basicInfoForm, /departmentOptions/)
  assert.match(basicInfoForm, /official department/)
  assert.doesNotMatch(basicInfoForm, /searchDepartments/)
  assert.doesNotMatch(basicInfoForm, /getDepartmentCollege/)
})


test('school text from basic profile maps to a matching university theme', () => {
  assert.equal(findUniversityThemeBySchool('부산대학교').id, 'pnu')
  assert.equal(findUniversityThemeBySchool('부산대').id, 'pnu')
  assert.equal(findUniversityThemeBySchool('PNU').id, 'pnu')
  assert.equal(findUniversityThemeBySchool('연세대학교').id, 'yonsei')
  assert.equal(findUniversityThemeBySchool('연세대').id, 'yonsei')
  assert.equal(findUniversityThemeBySchool('고려대학교').id, 'korea')
  assert.equal(findUniversityThemeBySchool('고려대').id, 'korea')
  assert.equal(findUniversityThemeBySchool('두원공과대학교').id, 'doowon')
  assert.equal(findUniversityThemeBySchool('두원공과대').id, 'doowon')
  assert.equal(findUniversityThemeBySchool('국민대학교').id, 'kookmin')
  assert.equal(findUniversityThemeBySchool('숭실대').id, 'soongsil')
  assert.equal(findUniversityThemeBySchool('세종대학교').id, 'sejong')
  assert.equal(findUniversityThemeBySchool('아주대').id, 'ajou')
  assert.equal(findUniversityThemeBySchool('대구가톨릭대').id, 'dcu')
  assert.equal(findUniversityThemeBySchool('서울과학기술대학교').id, 'seoultech')
  assert.equal(findUniversityThemeBySchool('숙명여대').id, 'sookmyung')
  assert.equal(findUniversityThemeBySchool('호서대학교').id, 'hoseo')
  assert.equal(findUniversityThemeBySchool('한남대학교').id, 'hannam')
  assert.equal(findUniversityThemeBySchool('이화여자대학교').id, 'ewha')
  assert.equal(findUniversityThemeBySchool('한국외국어대학교').id, 'hufs')
  assert.equal(findUniversityThemeBySchool('아직 모르는 학교').id, DEFAULT_UNIVERSITY_THEME_ID)
})

test('theme CSS variables and mascot assets are derived from the selected university', () => {
  const pnu = getUniversityThemeById('pnu')
  const doowon = getUniversityThemeById('doowon')
  const hoseo = getUniversityThemeById('hoseo')
  const hannam = getUniversityThemeById('hannam')
  const yonsei = getUniversityThemeById('yonsei')
  const korea = getUniversityThemeById('korea')
  const pnuCss = buildUniversityThemeCssVariables(pnu)
  const doowonCss = buildUniversityThemeCssVariables(doowon)
  const yonseiCss = buildUniversityThemeCssVariables(yonsei)
  const koreaCss = buildUniversityThemeCssVariables(korea)

  assert.equal(pnuCss['--boot-primary'], '#005BAA')
  assert.equal(doowonCss['--boot-primary'], '#169B73')
  assert.equal(yonseiCss['--boot-primary'], '#003876')
  assert.equal(koreaCss['--boot-primary'], '#8B0029')
  assert.notEqual(pnuCss['--boot-page-gradient'], doowonCss['--boot-page-gradient'])
  assert.notEqual(pnuCss['--boot-page-gradient'], yonseiCss['--boot-page-gradient'])
  assert.notEqual(yonseiCss['--boot-page-gradient'], koreaCss['--boot-page-gradient'])
  assert.equal(getPublicMascotAssetPath(pnu, 'guide'), '/university-mascots/app-assets-v3-display/pnu/guide.png')
  assert.equal(getPublicMascotAssetPath(doowon, 'support'), '/university-mascots/app-assets-v3-display/doowon/support.png')
  assert.equal(getPublicMascotAssetPath(hoseo, 'guide'), '/university-mascots/app-assets-v3-display/hoseo/guide.png')
  assert.equal(getPublicMascotAssetPath(hannam, 'guide'), '/university-mascots/app-assets-v3-display/hannam/guide.png')
  assert.equal(getPublicMascotAssetPath(yonsei, 'waiting'), '/university-mascots/app-assets-v3-display/yonsei/waiting.png')
  assert.equal(getPublicMascotAssetPath(korea, 'avatar'), '/university-mascots/app-assets-v3-display/korea/avatar.png')
  assert.equal(getUniversityBackdropAssetPath(pnu), '/university-backdrops/pnu-campus-preview.png')
  assert.equal(getUniversityBackdropAssetPath(yonsei), null)
})

test('school theme headings keep readable ink contrast instead of bright accent-only gradients', () => {
  const globals = readSource('app/globals.css')
  const gradientFateText = globals.match(/\.gradient-fate-text\s*\{[^}]+\}/)?.[0] ?? ''

  assert.match(gradientFateText, /var\(--boot-primary\)/)
  assert.match(gradientFateText, /var\(--boot-ink\)/)
  assert.doesNotMatch(gradientFateText, /var\(--boot-amber\)/)
})

test('every registered university theme has all runtime mascot image assets', () => {
  for (const theme of getUniversityThemeOptions()) {
    for (const kind of MASCOT_KINDS) {
      const publicPath = getPublicMascotAssetPath(theme, kind)
      const assetPath = join(ROOT, 'public', ...publicPath.replace(/^\//, '').split('/'))

      assert.equal(
        existsSync(assetPath),
        true,
        `${theme.id} is missing ${kind} mascot asset at ${publicPath}`,
      )
    }
  }
})

test('mascot component keeps school assets secondary to existing app actions', () => {
  const mascot = readSource('components/theme/UniversityMascot.tsx')

  assert.match(mascot, /pointer-events-none/)
  assert.match(mascot, /object-contain/)
  assert.doesNotMatch(mascot, /object-cover/)
  assert.match(mascot, /overflow-hidden/)
  assert.doesNotMatch(mascot, /overflow-visible/)
  assert.doesNotMatch(mascot, /scale-\[1\.8\]/)
  assert.doesNotMatch(mascot, /scale-100/)
  assert.match(mascot, /xl: 'h-40 w-40'/)
  assert.match(mascot, /max-h-full/)
  assert.match(mascot, /max-w-full/)
  assert.match(mascot, /aria-hidden="true"/)
})

test('basic profile save and app layout are wired to the university theme provider', () => {
  const basicPage = readSource('app/profile/basic/page.tsx')
  const layout = readSource('app/layout.tsx')
  const template = readSource('app/template.tsx')
  const bottomNav = readSource('components/navigation/AppBottomNav.tsx')
  const provider = readSource('components/theme/UniversityThemeProvider.tsx')
  const themeRegistry = readSource('lib/university-theme.ts')

  assert.match(layout, /<body className="min-h-screen safe-area-padding">/)
  assert.match(template, /cookies\(\)\.get\(UNIVERSITY_THEME_COOKIE_NAME\)\?\.value/)
  assert.match(template, /<UniversityThemeProvider initialThemeId=\{initialThemeId\}>/)
  assert.match(template, /<AppBottomNav \/>/)
  assert.match(bottomNav, /hiddenOnboardingRoutes/)
  assert.ok(bottomNav.includes("'/profile/basic'"))
  assert.ok(bottomNav.includes("'/profile/match-card'"))
  assert.ok(bottomNav.includes("pathname === '/profile/edit'"))
  assert.equal(bottomNav.includes("pathname.startsWith('/profile/')"), false)
  assert.match(basicPage, /setStoredUniversityThemeFromSchool\(data\.school\)/)
  assert.match(provider, /DEV_BASIC_PROFILE_STORAGE_KEY/)
  assert.match(provider, /useState<UniversityTheme>\(\(\) => getUniversityThemeById\(initialThemeId\)\)/)
  assert.match(provider, /useLayoutEffect/)
  assert.match(provider, /UNIVERSITY_THEME_COOKIE_NAME/)
  assert.match(provider, /readThemeIdFromCookie/)
  assert.match(provider, /storeUniversityThemeId\(theme\.id\)/)
  assert.match(provider, /buildUniversityThemeCssVariables/)
  assert.match(provider, /document\.documentElement\.style\.setProperty/)
  assert.match(provider, /data-university-theme/)
  assert.match(provider, /isSupabaseConfigured/)
  assert.match(provider, /profiles/)
  assert.match(provider, /\.select\('school'\)/)
  assert.match(themeRegistry, /quantum_41_frontend_color_tokens_2026-07-04\.json/)
  assert.match(themeRegistry, /storeUniversityThemeId\(theme\.id\)/)
  assert.match(themeRegistry, /window\.document\.cookie/)
})

test('school-specific mascot and backdrop start after basic profile school selection', () => {
  const login = readSource('app/(auth)/login/page.tsx')
  const profileBasic = readSource('app/profile/basic/page.tsx')
  const coachCard = readSource('components/theme/MascotCoachCard.tsx')
  const backdrop = readSource('components/theme/UniversityBackdrop.tsx')

  assert.doesNotMatch(login, /UniversityMascot/)
  assert.doesNotMatch(login, /useUniversityTheme/)
  assert.doesNotMatch(login, /theme\.copy\.loginKicker/)
  assert.match(login, /<BootingLogo size="md" showSubtitle=\{false\} \/>/)
  assert.doesNotMatch(profileBasic, /UniversityMascot/)
  assert.match(profileBasic, /setStoredUniversityThemeFromSchool\(data\.school\)/)
  assert.match(coachCard, /UniversityMascot/)
  assert.match(coachCard, /UniversityBackdrop/)
  assert.match(coachCard, /text-2xl/)
  assert.match(backdrop, /getUniversityBackdropAssetPath/)
  assert.match(backdrop, /opacity-/)
})

test('mascot coach cards are placed on post-school main app surfaces', () => {
  const matchHub = readSource('app/match/page.tsx')
  const groupCreate = readSource('app/group/create/page.tsx')
  const depositPanel = readSource('components/matching/DepositPaymentPanel.tsx')
  const refundPage = readSource('app/match/[id]/refund/page.tsx')
  const matchDetail = readSource('app/match/[id]/page.tsx')
  const notifications = readSource('app/notifications/page.tsx')
  const profileMatchCard = readSource('app/profile/match-card/page.tsx')
  const home = readSource('app/page.tsx')
  const homeCoach = readSource('components/theme/HomeUniversityCoachCard.tsx')
  const coachCard = readSource('components/theme/MascotCoachCard.tsx')
  const community = readSource('app/community/page.tsx')

  assert.match(coachCard, /overflow-hidden/)
  assert.match(coachCard, /grid grid-cols-\[minmax\(0,1fr\)_9rem\]/)
  assert.match(coachCard, /min-h-\[156px\]/)
  assert.match(coachCard, /h-36 w-36 rounded-\[28px\]/)
  assert.match(coachCard, /size="xl"/)
  assert.doesNotMatch(coachCard, /absolute right-1/)
  assert.match(home, /HomeUniversityCoachCard/)
  assert.match(homeCoach, /MascotCoachCard/)
  assert.match(homeCoach, /useUniversityTheme/)
  assert.match(homeCoach, /kind="guide"/)
  assert.doesNotMatch(home, /kind="avatar"/)
  assert.doesNotMatch(home, /PNU Coach/)
  assert.doesNotMatch(home, /부산대 팀 준비/)
  assert.match(matchHub, /MascotCoachCard/)
  assert.match(matchHub, /kind="waiting"/)
  assert.doesNotMatch(matchHub, /1:1 Waiting Coach/)
  assert.doesNotMatch(matchHub, /Group Waiting Coach/)
  assert.doesNotMatch(matchHub, /1:1 Matching Update/)
  assert.doesNotMatch(matchHub, /Group Matching Update/)
  assert.match(groupCreate, /MascotCoachCard/)
  assert.match(groupCreate, /kind="waiting"/)
  assert.doesNotMatch(groupCreate, /PNU Group Coach/)
  assert.doesNotMatch(groupCreate, /부산대 팀 준비/)
  assert.match(community, /MascotCoachCard/)
  assert.match(community, /kind="guide"/)
  assert.match(depositPanel, /kind="waiting"/)
  assert.match(refundPage, /kind="refund"/)
  assert.doesNotMatch(refundPage, /SanjiCharacter/)
  assert.match(matchDetail, /kind="waiting"/)
  assert.match(matchDetail, /getDevPreviewVenue\(theme\)/)
  assert.doesNotMatch(matchDetail, /PNU Station Cafe/)
  assert.match(notifications, /kind="avatar"/)
  assert.match(profileMatchCard, /kind="guide"/)
})

test('delayed matching guidance uses waiting mascot without backend notification changes', () => {
  const matchHub = readSource('app/match/page.tsx')
  const notifications = readSource('app/notifications/page.tsx')
  const notificationApi = readSource('app/api/notifications/route.ts')

  assert.match(matchHub, /아직 매칭이 안 잡혔어요/)
  assert.match(matchHub, /MascotCoachCard/)
  assert.match(matchHub, /kind="waiting"/)
  assert.match(notifications, /match_delayed/)
  assert.match(notifications, /MascotCoachCard/)
  assert.match(notifications, /kind="waiting"/)
  assert.match(notifications, /아직 매칭이 안 잡혔어요/)
  assert.doesNotMatch(notificationApi, /match_delayed/)
})

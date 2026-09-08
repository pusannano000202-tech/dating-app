export type CheerLeague = 'lck' | 'kbo'

export type CheerTeam = Readonly<{
  id: string
  league: CheerLeague
  name: string
  shortName: string
  logo: string
  sourceUrl: string
  verifiedAt: string
}>

const LCK_SOURCE_URL =
  'https://lolesports.com/en-US/tournament/113503357263583149/overview'
const KBO_SOURCE_URL =
  'https://www.koreabaseball.com/Kbo/League/TeamInfo.aspx'
const VERIFIED_AT = '2026-09-07'

function team(value: CheerTeam): CheerTeam {
  return Object.freeze(value)
}

export const CHEER_TEAMS: readonly CheerTeam[] = Object.freeze([
  team({
    id: 'lck-hanwha-life-esports',
    league: 'lck',
    name: 'Hanwha Life Esports',
    shortName: 'HLE',
    logo: '/social-scenes/teams/lck-hanwha-life-esports.png',
    sourceUrl: LCK_SOURCE_URL,
    verifiedAt: VERIFIED_AT,
  }),
  team({
    id: 'lck-t1',
    league: 'lck',
    name: 'T1',
    shortName: 'T1',
    logo: '/social-scenes/teams/lck-t1.png',
    sourceUrl: LCK_SOURCE_URL,
    verifiedAt: VERIFIED_AT,
  }),
  team({
    id: 'lck-bnk-fearx',
    league: 'lck',
    name: 'BNK FEARX',
    shortName: 'BFX',
    logo: '/social-scenes/teams/lck-bnk-fearx.png',
    sourceUrl: LCK_SOURCE_URL,
    verifiedAt: VERIFIED_AT,
  }),
  team({
    id: 'lck-dn-soopers',
    league: 'lck',
    name: 'DN SOOPers',
    shortName: 'DNS',
    logo: '/social-scenes/teams/lck-dn-soopers.webp',
    sourceUrl: LCK_SOURCE_URL,
    verifiedAt: VERIFIED_AT,
  }),
  team({
    id: 'lck-hanjin-brion',
    league: 'lck',
    name: 'HANJIN BRION',
    shortName: 'BRO',
    logo: '/social-scenes/teams/lck-hanjin-brion.png',
    sourceUrl: LCK_SOURCE_URL,
    verifiedAt: VERIFIED_AT,
  }),
  team({
    id: 'lck-gen-g-esports',
    league: 'lck',
    name: 'Gen.G Esports',
    shortName: 'GEN',
    logo: '/social-scenes/teams/lck-gen-g-esports.png',
    sourceUrl: LCK_SOURCE_URL,
    verifiedAt: VERIFIED_AT,
  }),
  team({
    id: 'lck-dplus-kia',
    league: 'lck',
    name: 'Dplus KIA',
    shortName: 'DK',
    logo: '/social-scenes/teams/lck-dplus-kia.png',
    sourceUrl: LCK_SOURCE_URL,
    verifiedAt: VERIFIED_AT,
  }),
  team({
    id: 'lck-kt-rolster',
    league: 'lck',
    name: 'kt Rolster',
    shortName: 'KT',
    logo: '/social-scenes/teams/lck-kt-rolster.png',
    sourceUrl: LCK_SOURCE_URL,
    verifiedAt: VERIFIED_AT,
  }),
  team({
    id: 'lck-nongshim-red-force',
    league: 'lck',
    name: 'NONGSHIM RED FORCE',
    shortName: 'NS',
    logo: '/social-scenes/teams/lck-nongshim-red-force.png',
    sourceUrl: LCK_SOURCE_URL,
    verifiedAt: VERIFIED_AT,
  }),
  team({
    id: 'lck-kiwoom-drx',
    league: 'lck',
    name: 'KIWOOM DRX',
    shortName: 'KRX',
    logo: '/social-scenes/teams/lck-kiwoom-drx.png',
    sourceUrl: LCK_SOURCE_URL,
    verifiedAt: VERIFIED_AT,
  }),
  team({
    id: 'kbo-lg-twins',
    league: 'kbo',
    name: 'LG 트윈스',
    shortName: 'LG',
    logo: '/social-scenes/teams/kbo-lg-twins.png',
    sourceUrl: KBO_SOURCE_URL,
    verifiedAt: VERIFIED_AT,
  }),
  team({
    id: 'kbo-hanwha-eagles',
    league: 'kbo',
    name: '한화 이글스',
    shortName: '한화',
    logo: '/social-scenes/teams/kbo-hanwha-eagles.png',
    sourceUrl: KBO_SOURCE_URL,
    verifiedAt: VERIFIED_AT,
  }),
  team({
    id: 'kbo-ssg-landers',
    league: 'kbo',
    name: 'SSG 랜더스',
    shortName: 'SSG',
    logo: '/social-scenes/teams/kbo-ssg-landers.png',
    sourceUrl: KBO_SOURCE_URL,
    verifiedAt: VERIFIED_AT,
  }),
  team({
    id: 'kbo-samsung-lions',
    league: 'kbo',
    name: '삼성 라이온즈',
    shortName: '삼성',
    logo: '/social-scenes/teams/kbo-samsung-lions.png',
    sourceUrl: KBO_SOURCE_URL,
    verifiedAt: VERIFIED_AT,
  }),
  team({
    id: 'kbo-nc-dinos',
    league: 'kbo',
    name: 'NC 다이노스',
    shortName: 'NC',
    logo: '/social-scenes/teams/kbo-nc-dinos.png',
    sourceUrl: KBO_SOURCE_URL,
    verifiedAt: VERIFIED_AT,
  }),
  team({
    id: 'kbo-kt-wiz',
    league: 'kbo',
    name: 'KT 위즈',
    shortName: 'KT',
    logo: '/social-scenes/teams/kbo-kt-wiz.png',
    sourceUrl: KBO_SOURCE_URL,
    verifiedAt: VERIFIED_AT,
  }),
  team({
    id: 'kbo-lotte-giants',
    league: 'kbo',
    name: '롯데 자이언츠',
    shortName: '롯데',
    logo: '/social-scenes/teams/kbo-lotte-giants.png',
    sourceUrl: KBO_SOURCE_URL,
    verifiedAt: VERIFIED_AT,
  }),
  team({
    id: 'kbo-kia-tigers',
    league: 'kbo',
    name: 'KIA 타이거즈',
    shortName: 'KIA',
    logo: '/social-scenes/teams/kbo-kia-tigers.png',
    sourceUrl: KBO_SOURCE_URL,
    verifiedAt: VERIFIED_AT,
  }),
  team({
    id: 'kbo-doosan-bears',
    league: 'kbo',
    name: '두산 베어스',
    shortName: '두산',
    logo: '/social-scenes/teams/kbo-doosan-bears.png',
    sourceUrl: KBO_SOURCE_URL,
    verifiedAt: VERIFIED_AT,
  }),
  team({
    id: 'kbo-kiwoom-heroes',
    league: 'kbo',
    name: '키움 히어로즈',
    shortName: '키움',
    logo: '/social-scenes/teams/kbo-kiwoom-heroes.png',
    sourceUrl: KBO_SOURCE_URL,
    verifiedAt: VERIFIED_AT,
  }),
])

const TEAMS_BY_LEAGUE: Readonly<Record<CheerLeague, readonly CheerTeam[]>> =
  Object.freeze({
    lck: Object.freeze(CHEER_TEAMS.filter((value) => value.league === 'lck')),
    kbo: Object.freeze(CHEER_TEAMS.filter((value) => value.league === 'kbo')),
  })

const TEAMS_BY_ID = new Map(CHEER_TEAMS.map((value) => [value.id, value]))

export function getCheerTeams(league?: CheerLeague): readonly CheerTeam[] {
  return league ? TEAMS_BY_LEAGUE[league] : CHEER_TEAMS
}

export function getCheerTeam(id: string): CheerTeam | null {
  return TEAMS_BY_ID.get(id) ?? null
}

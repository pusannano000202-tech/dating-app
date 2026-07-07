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

export interface UniversityLocalDesignProfile {
  id: string
  shortName: string
  lifeArea: string
  primaryPlace: string
  placeChips: string[]
  matchChips: string[]
  campusPattern: string
  notificationTone: string
  profileCopy: string
  matchCopy: string
  groupCopy: string
  refundCopy: string
  dailyCardQuestions: string[]
  mascotGuardrail: string
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

type UniversityLocalDesignSeed = {
  lifeArea: string
  placeChips: readonly [string, string, string]
  campusPattern: string
  notificationTone: string
  mascotGuardrail?: string
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

const LOCAL_DESIGN_SEEDS: Record<string, UniversityLocalDesignSeed> = {
  pnu: { lifeArea: '부산대역/장전동', placeChips: ['넉터', '새벽벌', '부산대역'], campusPattern: '금정산 능선+넉터 라인', notificationTone: '담백하고 살짝 직설적' },
  yonsei: { lifeArea: '신촌/백양로', placeChips: ['백양로', '언더우드관', '신촌'], campusPattern: '백양로 축선+석조 건물 라인', notificationTone: '정중하고 차분함' },
  korea: { lifeArea: '안암/참살이길', placeChips: ['본관', '중앙광장', '안암'], campusPattern: '고딕 arch+crimson line', notificationTone: '자신감 있지만 과격하지 않게' },
  snu: { lifeArea: '관악/샤로수길', placeChips: ['관악', '중앙도서관', '샤로수길'], campusPattern: '관악산 능선+도서관 grid', notificationTone: '간결하고 정보형' },
  khu: { lifeArea: '회기/평화의전당', placeChips: ['평화의 전당', '회기', '노천극장'], campusPattern: '평전 첨탑+gold grain', notificationTone: '우아하지만 가볍게' },
  hanyang: { lifeArea: '왕십리/서울캠', placeChips: ['애지문', '왕십리', '한양플라자'], campusPattern: 'blueprint grid+gate line', notificationTone: '명확하고 빠름' },
  skku: { lifeArea: '혜화/명륜/율전', placeChips: ['명륜당', '은행나무', '혜화'], campusPattern: '은행잎+서책 line', notificationTone: '단정하고 신뢰감' },
  cau: { lifeArea: '흑석/청룡연못', placeChips: ['청룡연못', '중앙광장', '흑석'], campusPattern: '연못 ripple+blue line', notificationTone: '밝고 또렷함' },
  hufs: { lifeArea: '외대앞/이문동/글로벌캠', placeChips: ['외대앞', '사이버관', '글로벌캠'], campusPattern: 'globe grid+speech dots', notificationTone: '가볍고 국제적' },
  ewha: { lifeArea: '이대역/ECC/신촌', placeChips: ['ECC', '이대역', '대강당'], campusPattern: 'ECC step line+flower dot', notificationTone: '부드럽고 명확' },
  konkuk: { lifeArea: '건대입구/일감호', placeChips: ['일감호', '건대입구', '새천년관'], campusPattern: 'lake ripple+green blocks', notificationTone: '친근하고 가벼움' },
  dongguk: { lifeArea: '충무로/동대입구/남산', placeChips: ['정각원', '남산', '충무로'], campusPattern: 'lotus line+warm gray', notificationTone: '차분하고 온화' },
  hongik: { lifeArea: '홍대입구/와우산', placeChips: ['홍문관', '와우산', '홍대입구'], campusPattern: 'sketch grid+sticker edge', notificationTone: '재치 있지만 과하지 않게' },
  sookmyung: { lifeArea: '숙대입구/청파동', placeChips: ['순헌관', '청파로', '숙대입구'], campusPattern: 'snowflake dot+paper grain', notificationTone: '다정하고 또렷' },
  knu: { lifeArea: '대구 북문', placeChips: ['일청담/북문', '중앙도서관', '대구 북구'], campusPattern: '일청담/북문 silhouette + campus line pattern', notificationTone: '장소 chip 중심의 짧고 다정한 안내' },
  jnu: { lifeArea: '광주 용봉동', placeChips: ['용봉관', '용봉탑', '민주마루'], campusPattern: '용봉관 silhouette + campus line pattern', notificationTone: '장소 chip 중심의 짧고 다정한 안내' },
  cnu: { lifeArea: '대전 궁동', placeChips: ['백마광장', '중앙도서관', '궁동'], campusPattern: '백마광장 silhouette + campus line pattern', notificationTone: '장소 chip 중심의 짧고 다정한 안내' },
  jbnu: { lifeArea: '전주 덕진/건지', placeChips: ['건지광장', '중앙도서관', '전주'], campusPattern: '건지광장 silhouette + campus line pattern', notificationTone: '장소 chip 중심의 짧고 다정한 안내' },
  pknu: { lifeArea: '부산 대연동/광안리', placeChips: ['대연캠', '백경광장', '광안리'], campusPattern: '대연캠 silhouette + campus line pattern', notificationTone: '장소 chip 중심의 짧고 다정한 안내' },
  keimyung: { lifeArea: '대구 성서', placeChips: ['성서캠', '동산도서관', '계명아트센터'], campusPattern: '성서캠 silhouette + campus line pattern', notificationTone: '장소 chip 중심의 짧고 다정한 안내' },
  gachon: { lifeArea: '가천대역/성남', placeChips: ['비전타워', '가천관', '가천대역'], campusPattern: '비전타워 silhouette + campus line pattern', notificationTone: '장소 chip 중심의 짧고 다정한 안내' },
  inha: { lifeArea: '인천 용현동', placeChips: ['정석학술정보관', '인하광장', '용현동'], campusPattern: '정석학술정보관 silhouette + campus line pattern', notificationTone: '장소 chip 중심의 짧고 다정한 안내' },
  donga: { lifeArea: '부산 승학/부민', placeChips: ['승학캠', '부민캠', '승학산'], campusPattern: '승학캠 silhouette + campus line pattern', notificationTone: '장소 chip 중심의 짧고 다정한 안내' },
  daegu: { lifeArea: '경산', placeChips: ['경산캠', '중앙도서관', '비호동산'], campusPattern: '경산캠 silhouette + campus line pattern', notificationTone: '장소 chip 중심의 짧고 다정한 안내' },
  chosun: { lifeArea: '광주 동구', placeChips: ['본관', '장미원', '무등산'], campusPattern: '본관 silhouette + campus line pattern', notificationTone: '장소 chip 중심의 짧고 다정한 안내' },
  gnu: { lifeArea: '진주 가좌', placeChips: ['가좌캠', '중앙도서관', '진주'], campusPattern: '가좌캠 silhouette + campus line pattern', notificationTone: '장소 chip 중심의 짧고 다정한 안내' },
  kookmin: { lifeArea: '정릉/북악', placeChips: ['북악관', '정릉', '북악산'], campusPattern: '북악관 silhouette + campus line pattern', notificationTone: '장소 chip 중심의 짧고 다정한 안내' },
  dongeui: { lifeArea: '부산 가야', placeChips: ['가야캠', '중앙도서관', '부산 가야'], campusPattern: '가야캠 silhouette + campus line pattern', notificationTone: '장소 chip 중심의 짧고 다정한 안내' },
  wonkwang: { lifeArea: '익산', placeChips: ['중앙도서관', '원광대병원', '익산'], campusPattern: '중앙도서관 silhouette + campus line pattern', notificationTone: '장소 chip 중심의 짧고 다정한 안내' },
  kangwon: { lifeArea: '춘천/강원', placeChips: ['백령광장', '춘천캠', '강원 산맥'], campusPattern: '백령광장 silhouette + campus line pattern', notificationTone: '장소 chip 중심의 짧고 다정한 안내' },
  chungbuk: { lifeArea: '청주 개신동', placeChips: ['개신문화관', '중앙도서관', '개신동'], campusPattern: '개신문화관 silhouette + campus line pattern', notificationTone: '장소 chip 중심의 짧고 다정한 안내' },
  sejong: { lifeArea: '군자동/어린이대공원', placeChips: ['대양홀', '애지헌', '어린이대공원'], campusPattern: '대양홀 silhouette + campus line pattern', notificationTone: '장소 chip 중심의 짧고 다정한 안내' },
  hoseo: { lifeArea: '아산/천안', placeChips: ['아산캠', '벤처산학협력관', '천안/아산'], campusPattern: '아산캠 silhouette + campus line pattern', notificationTone: '장소 chip 중심의 짧고 다정한 안내' },
  cheongju: { lifeArea: '청주 우암동', placeChips: ['청석학원', '중앙도서관', '우암동'], campusPattern: '청석학원 silhouette + campus line pattern', notificationTone: '장소 chip 중심의 짧고 다정한 안내' },
  kyonggi: { lifeArea: '수원/서울', placeChips: ['수원캠', '서울캠', '광교/서대문'], campusPattern: '수원캠 silhouette + campus line pattern', notificationTone: '장소 chip 중심의 짧고 다정한 안내', mascotGuardrail: '경기대는 기룡이/아기거북이 맥락을 유지하고 거북 등껍질 인상을 남긴다.' },
  hannam: { lifeArea: '대전 오정동', placeChips: ['오정동 캠퍼스', '린튼공원', '대전'], campusPattern: '오정동 캠퍼스 silhouette + campus line pattern', notificationTone: '장소 chip 중심의 짧고 다정한 안내' },
  baekseok: { lifeArea: '천안', placeChips: ['천안캠', '백석홀', '기독교 대학 분위기'], campusPattern: '천안캠 silhouette + campus line pattern', notificationTone: '장소 chip 중심의 짧고 다정한 안내' },
  dankook: { lifeArea: '죽전/천안', placeChips: ['죽전캠', '혜당관', '천안캠'], campusPattern: '죽전캠 silhouette + campus line pattern', notificationTone: '장소 chip 중심의 짧고 다정한 안내' },
  dcu: { lifeArea: '경산 효성캠', placeChips: ['효성캠퍼스', '중앙도서관', '경산'], campusPattern: '효성캠퍼스 silhouette + campus line pattern', notificationTone: '장소 chip 중심의 짧고 다정한 안내' },
  ulsan: { lifeArea: '울산 무거동', placeChips: ['중앙정원', '아산스포츠센터', '무거동'], campusPattern: '중앙정원 silhouette + campus line pattern', notificationTone: '장소 chip 중심의 짧고 다정한 안내' },
  ks: { lifeArea: '부산 대연동', placeChips: ['문화골목', '예술관', '대연동'], campusPattern: '문화골목 silhouette + campus line pattern', notificationTone: '장소 chip 중심의 짧고 다정한 안내' },
  kongju: { lifeArea: '공주/신관', placeChips: ['중앙도서관', '곰나루', '공주'], campusPattern: '중앙도서관 silhouette + campus line pattern', notificationTone: '장소 chip 중심의 짧고 다정한 안내' },
  inu: { lifeArea: '송도', placeChips: ['송도캠', '미추홀공원', '인천대입구'], campusPattern: '송도캠 silhouette + campus line pattern', notificationTone: '장소 chip 중심의 짧고 다정한 안내' },
  kyungnam: { lifeArea: '마산 월영동', placeChips: ['월영지', '한마미래관', '마산'], campusPattern: '월영지 silhouette + campus line pattern', notificationTone: '장소 chip 중심의 짧고 다정한 안내' },
  jj: { lifeArea: '전주', placeChips: ['스타센터', '천잠산 캠퍼스', '전주'], campusPattern: '스타센터 silhouette + campus line pattern', notificationTone: '장소 chip 중심의 짧고 다정한 안내', mascotGuardrail: '전주대는 백마/제이제이 맥락의 흰 말 자체 캐릭터를 유지한다.' },
  seoultech: { lifeArea: '공릉', placeChips: ['붕어방', '다산관', '공릉'], campusPattern: '붕어방 silhouette + campus line pattern', notificationTone: '장소 chip 중심의 짧고 다정한 안내' },
  sch: { lifeArea: '아산', placeChips: ['향설동문', '피닉스광장', '아산'], campusPattern: '향설동문 silhouette + campus line pattern', notificationTone: '장소 chip 중심의 짧고 다정한 안내' },
  jejunu: { lifeArea: '제주 아라동', placeChips: ['아라캠', '중앙도서관', '제주 오름'], campusPattern: '아라캠 silhouette + campus line pattern', notificationTone: '장소 chip 중심의 짧고 다정한 안내' },
  ajou: { lifeArea: '수원/광교', placeChips: ['원천관', '중앙도서관', '광교'], campusPattern: '원천관 silhouette + campus line pattern', notificationTone: '장소 chip 중심의 짧고 다정한 안내' },
  dongseo: { lifeArea: '부산 주례/센텀', placeChips: ['민석도서관', '센텀캠퍼스', '부산'], campusPattern: '민석도서관 silhouette + campus line pattern', notificationTone: '장소 chip 중심의 짧고 다정한 안내' },
  sunmoon: { lifeArea: '아산', placeChips: ['아산캠', '원화관', '천안/아산'], campusPattern: '아산캠 silhouette + campus line pattern', notificationTone: '장소 chip 중심의 짧고 다정한 안내' },
  nsu: { lifeArea: '천안', placeChips: ['성암문화체육관', '캠퍼스 광장', '천안'], campusPattern: '성암문화체육관 silhouette + campus line pattern', notificationTone: '장소 chip 중심의 짧고 다정한 안내' },
  wsu: { lifeArea: '대전 동구', placeChips: ['솔브릿지', '철도물류관', '대전역권'], campusPattern: '솔브릿지 silhouette + campus line pattern', notificationTone: '장소 chip 중심의 짧고 다정한 안내' },
  uos: { lifeArea: '전농동/청량리', placeChips: ['전농관', '중앙로', '청량리'], campusPattern: '전농관 silhouette + campus line pattern', notificationTone: '장소 chip 중심의 짧고 다정한 안내' },
  dju: { lifeArea: '대전 용운동', placeChips: ['혜화문화관', '맥센터', '용운동'], campusPattern: '혜화문화관 silhouette + campus line pattern', notificationTone: '장소 chip 중심의 짧고 다정한 안내' },
  suwon: { lifeArea: '수원/화성', placeChips: ['미래혁신관', '벨칸토아트센터', '수원'], campusPattern: '미래혁신관 silhouette + campus line pattern', notificationTone: '장소 chip 중심의 짧고 다정한 안내' },
  soongsil: { lifeArea: '상도/숭실대입구', placeChips: ['백마상', '조만식기념관', '숭실대입구'], campusPattern: '백마상 silhouette + campus line pattern', notificationTone: '장소 chip 중심의 짧고 다정한 안내', mascotGuardrail: '숭실대는 백마형 자체 캐릭터를 유지한다.' },
  yeungnam: { lifeArea: '경산/영남대역', placeChips: ['천마아트센터', '중앙도서관', '러브로드'], campusPattern: '천마아트센터 silhouette + campus line pattern', notificationTone: '장소 chip 중심의 짧고 다정한 안내' },
  doowon: { lifeArea: '파주/안성', placeChips: ['파주캠', '안성캠', '기술 실습 공간'], campusPattern: '파주캠 silhouette + campus line pattern', notificationTone: '장소 chip 중심의 짧고 다정한 안내', mascotGuardrail: '두원공과대는 초록 갈기 천마형 자체 캐릭터를 유지한다.' },
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

export function getUniversityLocalDesignProfiles(): UniversityLocalDesignProfile[] {
  return UNIVERSITY_THEMES.map((theme) => getUniversityLocalDesignProfile(theme))
}

export function getUniversityLocalDesignProfile(
  themeOrId: UniversityTheme | string | null | undefined,
): UniversityLocalDesignProfile {
  const theme = typeof themeOrId === 'string' || themeOrId == null
    ? getUniversityThemeById(themeOrId)
    : themeOrId
  const seed = LOCAL_DESIGN_SEEDS[theme.id] ?? buildFallbackLocalDesignSeed(theme)
  const [primaryPlace, secondaryPlace, tertiaryPlace] = seed.placeChips
  const matchChips = [primaryPlace, secondaryPlace]
  const notificationTone = buildLocalNotificationTone(seed, primaryPlace)

  return {
    id: theme.id,
    shortName: theme.shortName,
    lifeArea: seed.lifeArea,
    primaryPlace,
    placeChips: [...seed.placeChips],
    matchChips,
    campusPattern: seed.campusPattern,
    notificationTone,
    profileCopy: `${theme.shortName} 선택 후에는 ${primaryPlace} 기준 생활권, 학과, 매칭 범위가 함께 맞춰져요.`,
    matchCopy: `${matchChips.join(' · ')} 생활권을 참고하되, 실제 약속 장소는 확정 전까지 단정하지 않아요.`,
    groupCopy: `${primaryPlace} 기준으로 친구 초대와 팀 준비를 맞춰볼게요. 장소감은 살리고 입력 동선은 그대로 유지해요.`,
    refundCopy: `${theme.shortName} 기준 정산 화면이에요. 만남 후 보증금은 안전하게 환불되고, 앱 기여금은 자율 선택이에요.`,
    dailyCardQuestions: [
      `공강에는 ${primaryPlace} 근처와 ${seed.lifeArea} 쪽 중 어디가 더 편해요?`,
      `시험기간에는 ${secondaryPlace} 근처 조용한 자리와 학교 앞 카페 중 어디가 좋아요?`,
      `첫 만남은 ${tertiaryPlace} 쪽 가벼운 약속과 캠퍼스 안 약속 중 어느 쪽이 좋아요?`,
    ],
    mascotGuardrail: seed.mascotGuardrail ?? `${theme.shortName} 공식 로고나 원본 캐릭터를 복제하지 않고 앱 전용 자체 캐릭터로만 사용한다.`,
  }
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

function buildFallbackLocalDesignSeed(theme: UniversityTheme): UniversityLocalDesignSeed {
  const chips = normalizePlaceChips(theme.designTheme.landmarkCue, theme.shortName)

  return {
    lifeArea: `${theme.shortName} 생활권`,
    placeChips: chips,
    campusPattern: `${chips[0]} silhouette + campus line pattern`,
    notificationTone: '장소 chip 중심의 짧고 다정한 안내',
  }
}

function buildLocalNotificationTone(seed: UniversityLocalDesignSeed, primaryPlace: string): string {
  if (seed.notificationTone.includes('장소 chip 중심')) {
    return `${primaryPlace} 기준으로 필요한 순간만 짧고 다정하게 알려드릴게요.`
  }

  return `${seed.notificationTone}. ${primaryPlace} 기준으로 필요한 순간만 알려드릴게요.`
}

function normalizePlaceChips(landmarkCue: string, shortName: string): [string, string, string] {
  const parsed = landmarkCue
    .split(/[\/,]/)
    .map((value) => value.trim())
    .filter(Boolean)
  const unique = uniqueStrings([...parsed, `${shortName} 캠퍼스`, `${shortName} 생활권`, '학교 앞'])

  return [unique[0], unique[1], unique[2]]
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

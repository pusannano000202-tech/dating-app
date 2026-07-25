type ScreenKey = 'home' | 'profile_basic' | 'match' | 'group_create' | 'community'

type ScreenSpec = {
  label: string
  pose: 'avatar' | 'guide' | 'waiting' | 'support'
  suffix: string
  placement: string
  slot: number
  cardTop: number
  chip: string
  title: string
  body: string
}

const SCHOOL_NAMES: Record<string, string> = {
  ajou: '아주대',
  baekseok: '백석대',
  cau: '중앙대',
  cheongju: '청주대',
  chosun: '조선대',
  chungbuk: '충북대',
  cnu: '충남대',
  daegu: '대구대',
  dankook: '단국대',
  dcu: '대구가톨릭대',
  dju: '대전대',
  donga: '동아대',
  dongeui: '동의대',
  dongguk: '동국대',
  dongseo: '동서대',
  doowon: '두원공과대',
  ewha: '이화여대',
  gachon: '가천대',
  gnu: '경상국립대',
  hannam: '한남대',
  hanyang: '한양대',
  hongik: '홍익대',
  hoseo: '호서대',
  hufs: '한국외대',
  inha: '인하대',
  inu: '인천대',
  jbnu: '전북대',
  jejunu: '제주대',
  jj: '전주대',
  jnu: '전남대',
  kangwon: '강원대',
  keimyung: '계명대',
  khu: '경희대',
  knu: '경북대',
  kongju: '공주대',
  konkuk: '건국대',
  kookmin: '국민대',
  korea: '고려대',
  ks: '경성대',
  kyonggi: '경기대',
  kyungnam: '경남대',
  nsu: '남서울대',
  pknu: '부경대',
  pnu: '부산대',
  sch: '순천향대',
  sejong: '세종대',
  seoultech: '서울과기대',
  skku: '성균관대',
  snu: '서울대',
  sookmyung: '숙명여대',
  soongsil: '숭실대',
  sunmoon: '선문대',
  suwon: '수원대',
  ulsan: '울산대',
  uos: '서울시립대',
  wonkwang: '원광대',
  wsu: '우송대',
  yeungnam: '영남대',
  yonsei: '연세대',
}

const SCREENS: Record<ScreenKey, ScreenSpec> = {
  home: {
    label: '홈',
    pose: 'avatar',
    suffix: 'home_avatar',
    placement: '상단 안내 카드 우측 avatar slot',
    slot: 82,
    cardTop: 96,
    chip: '오늘의 캠퍼스',
    title: '오늘 학교 기준 매칭',
    body: '학교 생활권에 맞춰 가볍게 시작해요.',
  },
  profile_basic: {
    label: '기본정보',
    pose: 'guide',
    suffix: 'profile_basic_guide',
    placement: '/profile/basic 안내 카드 우측 guide slot',
    slot: 118,
    cardTop: 144,
    chip: '학교 선택 완료',
    title: '기본정보를 맞춰볼게요',
    body: '학과와 캠퍼스 기준으로 매칭 범위를 준비합니다.',
  },
  match: {
    label: '매칭',
    pose: 'waiting',
    suffix: 'match_waiting',
    placement: '/match 매칭 카드 우하단 waiting slot',
    slot: 118,
    cardTop: 154,
    chip: '매칭 대기',
    title: '조건에 맞는 그룹을 찾는 중',
    body: '장소는 아직 확정하지 않고 범위만 참고합니다.',
  },
  group_create: {
    label: '그룹 생성',
    pose: 'guide',
    suffix: 'group_create_guide',
    placement: '/group/create 친구 초대 카드 우측 guide slot',
    slot: 118,
    cardTop: 144,
    chip: '친구 초대',
    title: '공강 맞는 친구를 불러요',
    body: '학교 앞 약속 감성은 살리고 화면은 가볍게 유지합니다.',
  },
  community: {
    label: '커뮤니티/모임',
    pose: 'guide',
    suffix: 'community_guide',
    placement: '/community 모임 카드 우측 guide slot',
    slot: 114,
    cardTop: 138,
    chip: '모임 분위기',
    title: '우리 학교 모임을 살펴봐요',
    body: '작은 보조 캐릭터로 분위기만 더합니다.',
  },
}

function pickScreen(value?: string): ScreenKey {
  if (value === 'profile_basic' || value === 'match' || value === 'group_create' || value === 'community') {
    return value
  }

  return 'home'
}

function hashColor(input: string) {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    hash = input.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return {
    accent: `hsl(${hue} 42% 36%)`,
    soft: `hsl(${hue} 42% 91%)`,
    tint: `hsl(${hue} 38% 96%)`,
  }
}

export default function MascotScreenReportPage({
  searchParams,
}: {
  searchParams?: { school?: string; screen?: string }
}) {
  const schoolId = searchParams?.school || 'pnu'
  const screenKey = pickScreen(searchParams?.screen)
  const spec = SCREENS[screenKey]
  const schoolName = SCHOOL_NAMES[schoolId] || schoolId
  const colors = hashColor(schoolId)
  const mascotSrc = `/university-mascots/app-assets-v3-normalized-v2/${schoolId}/${spec.pose}.png`

  return (
    <main
      data-report-screen="actual-next-route"
      data-school={schoolId}
      data-screen={screenKey}
      data-pose={spec.pose}
      data-placement={spec.placement}
      data-slot={`${spec.slot}x${spec.slot}`}
      style={
        {
          '--accent': colors.accent,
          '--soft': colors.soft,
          '--tint': colors.tint,
        } as React.CSSProperties
      }
      className="mx-auto min-h-screen w-full max-w-[390px] overflow-hidden bg-[var(--tint)] px-[18px] pb-28 pt-10 text-slate-900"
    >
      <section className="mb-14">
        <p className="text-[26px] font-black leading-none tracking-[-0.06em]">Quantum</p>
        <p className="mt-2 text-[12px] tracking-[-0.03em] text-slate-600">
          {schoolName} 실제 Next 화면 검수
        </p>
      </section>

      <section
        className="relative overflow-hidden rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-[0_18px_44px_rgba(15,23,42,0.06)]"
        style={{ marginTop: spec.cardTop - 110, minHeight: spec.slot + 54 }}
      >
        <div className="pointer-events-none absolute inset-0 opacity-[0.09]">
          <div
            className="h-full w-full"
            style={{
              backgroundImage:
                'repeating-linear-gradient(110deg, transparent 0 22px, var(--accent) 23px, transparent 24px)',
            }}
          />
        </div>

        <div
          className="relative mb-3 inline-flex rounded-full px-3 py-1 text-[11px] font-bold tracking-[-0.03em]"
          style={{ background: 'var(--soft)', color: 'var(--accent)' }}
        >
          {spec.chip}
        </div>

        <div className="relative max-w-[210px]">
          <h1 className="text-[19px] font-black leading-tight tracking-[-0.06em]">{spec.title}</h1>
          <p className="mt-2 text-[12px] leading-relaxed tracking-[-0.04em] text-slate-600">{spec.body}</p>
        </div>

        <div
          className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-[18px] border border-slate-200 bg-white/80"
          style={{ width: spec.slot, height: spec.slot }}
          data-mascot-slot="true"
        >
          <img
            src={mascotSrc}
            alt={`${schoolName} ${spec.pose} mascot`}
            className="h-full w-full object-contain"
            draggable={false}
          />
        </div>
      </section>

      <section className="mt-[360px]">
        <button
          type="button"
          className="h-[54px] w-full rounded-[18px] text-[15px] font-bold text-white shadow-[0_14px_30px_rgba(15,23,42,0.14)]"
          style={{ background: 'var(--accent)' }}
          data-cta="true"
        >
          다음 단계로
        </button>
      </section>
    </main>
  )
}

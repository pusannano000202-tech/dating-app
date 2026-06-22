import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import Link from 'next/link'
import {
  Bell,
  CalendarCheck2,
  ChevronRight,
  LockKeyhole,
  Search,
  Settings2,
  Sparkles,
  UserPlus,
  UsersRound,
  Zap,
} from 'lucide-react'
import { DEV_AUTH_COOKIE, getDevAuthCookieValue, isDevAuthBypassEnabled } from '@/lib/dev-auth'
import { isSupabaseConfigured } from '@/lib/utils'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import BootingLogo from '@/components/BootingLogo'
import HomeInfoButton from '@/components/matching/HomeInfoButton'
import HomeTodayTaskCard from '@/components/matching/HomeTodayTaskCard'
import LockedOpponentCard from '@/components/matching/LockedOpponentCard'

type ServerSupabaseClient = ReturnType<typeof createSupabaseServerClient>

type ProfileGate = {
  gender: string | null
  appearance_type: string | null
  big5_openness: number | null
}

async function getOnboardingRedirect(
  supabase: ServerSupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('gender, appearance_type, big5_openness')
    .eq('user_id', userId)
    .maybeSingle<ProfileGate>()

  if (!profile?.gender) return '/profile/basic'
  if (!profile.appearance_type) return '/profile/worldcup'
  if (profile.big5_openness == null) return '/profile/survey'

  const { count } = await supabase
    .from('photos')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)

  if (!count || count === 0) return '/profile/photos'

  return null
}

function LandingPage() {
  return (
    <main className="min-h-screen booting-paper px-7 pb-10 pt-14 text-boot-ink">
      <div className="mx-auto flex min-h-[calc(100vh-6rem)] w-full max-w-[calc(100vw-3.5rem)] flex-col sm:max-w-md">
        <header className="text-center">
          <BootingLogo size="md" className="justify-center" />
        </header>

        <section className="flex flex-1 flex-col items-center justify-center py-12 text-center">
          <div className="booting-deep-card mb-12 w-full rounded-[32px] p-7 text-left">
            <div className="mb-12 flex items-center justify-between">
              <div>
                <p className="text-sm font-black text-white/55">부산대 과팅</p>
                <h2 className="mt-2 text-3xl font-black text-white">오늘의 매칭</h2>
              </div>
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-boot-primary to-boot-coral text-white shadow-[0_12px_28px_rgba(255,79,95,0.25)]">
                <Zap size={28} />
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-boot-primary to-boot-coral" />
            </div>
            <p className="mt-3 text-sm font-black text-white/60">친구와 프로필을 준비하면 탐색이 시작돼요</p>
          </div>

          <h1 className="text-[26px] font-black leading-snug tracking-normal">
            당신의 연애세포를
            <br />
            <span className="text-boot-primary">부팅하세요!</span>
          </h1>
          <p className="mt-3 text-sm leading-6 text-boot-muted">
            친구와 그룹을 만들고, 조건이 맞는 상대 그룹과
            <br />
            토요일 14:00에 자동 매칭돼요.
          </p>

          <div className="mt-8 w-full">
            <Link
              href="/login"
              className="btn-gradient-animated block w-full rounded-2xl py-4 text-center text-base font-black"
            >
              이메일로 시작하기
            </Link>
            <Link href="/dev/preview" className="mt-4 block text-xs font-bold text-boot-muted">
              로컬 미리보기로 둘러보기
            </Link>
          </div>
        </section>

        <section className="glass-card rounded-[30px] p-5">
          <p className="text-xs font-black uppercase tracking-normal text-boot-primary">How it works</p>
          <h2 className="mt-2 text-lg font-black text-boot-ink">프로필은 가리고, 흐름은 간단하게</h2>
          <div className="mt-4 space-y-3">
            <LandingFlowRow
              Icon={UsersRound}
              title="친구와 그룹 만들기"
              desc="초대 링크로 같이 과팅할 친구를 모아요."
            />
            <LandingFlowRow
              Icon={Search}
              title="조건이 맞을 때 자동 매칭"
              desc="성향, 시간, 비중이 맞는 그룹을 찾아요."
            />
            <LandingFlowRow
              Icon={LockKeyhole}
              title="확정 전까지 비공개"
              desc="상대 정보와 카드는 단계별로 열려요."
            />
          </div>
        </section>
      </div>
    </main>
  )
}

function LandingFlowRow({
  Icon,
  title,
  desc,
}: {
  Icon: typeof Search
  title: string
  desc: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-boot-hairline bg-white px-3 py-3">
      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-boot-soft text-boot-primary">
        <Icon size={18} />
      </span>
      <span className="min-w-0 text-left">
        <span className="block text-sm font-black text-boot-ink">{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-boot-muted">{desc}</span>
      </span>
    </div>
  )
}

function HomeDashboard() {
  return (
    <main className="min-h-screen booting-paper px-5 pb-28 pt-7 text-boot-ink">
      <div className="mx-auto w-full max-w-[calc(100vw-2.5rem)] sm:max-w-md">
        <header className="mb-7 flex items-center justify-between">
          <BootingLogo size="md" />
          <div className="flex items-center gap-2">
            <HomeInfoButton />
            <Link
              href="/notifications"
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-boot-hairline bg-white/90 text-boot-body shadow-sm"
              aria-label="알림"
            >
              <Bell size={18} />
            </Link>
          </div>
        </header>

        <section className="mb-5">
          <p className="text-sm font-bold text-boot-muted">좋은 저녁이에요</p>
          <h1 className="mt-1 text-4xl font-black leading-tight">오늘의 매칭</h1>
        </section>

        <HomeTodayTaskCard />

        <LockedOpponentCard
          className="mb-5"
          title="추천 상대팀"
          chemi={92}
          chips={['차분한', '카페파', '수요일']}
          description="상대 프로필은 매칭 확정 후에 공개돼요"
        />

        <section className="mb-5 grid grid-cols-2 gap-3">
          <HomeActionCard
            href="/friends"
            title="친구 초대"
            desc="링크로 같이 과팅할 친구를 모아요"
            Icon={UserPlus}
          />
          <HomeActionCard
            href="/match/start"
            title="매칭 찾기"
            desc="성향, 시간, 비중을 확인해요"
            Icon={Search}
            primary
          />
        </section>

        <div className="grid gap-2.5">
          <UtilityLink
            href="/group/create"
            label="내 그룹 보기"
            desc="초대, 준비 상태, 큐 진입 상태 확인"
            Icon={UsersRound}
          />
          <UtilityLink
            href="/profile/edit"
            label="프로필 수정"
            desc="기본정보, 사진, 성향 설정 다시 확인"
            Icon={Settings2}
          />
          <UtilityLink
            href="/match"
            label="매칭 현황"
            desc="대기 큐와 진행 중인 매칭 확인"
            Icon={CalendarCheck2}
          />
        </div>

        <div className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-boot-muted">
          <LockKeyhole size={13} />
          매칭 전까지 이름과 사진은 공개되지 않아요.
        </div>
      </div>
    </main>
  )
}

function HomeActionCard({
  href,
  title,
  desc,
  Icon,
  primary = false,
}: {
  href: string
  title: string
  desc: string
  Icon: typeof Search
  primary?: boolean
}) {
  return (
    <Link
      href={href}
      className={[
        'glass-card rounded-3xl border p-4 shadow-sm transition-colors',
        primary
          ? 'border-boot-primary/20 bg-boot-soft hover:border-boot-primary/40'
          : 'border-boot-hairline hover:border-boot-primary/30',
      ].join(' ')}
    >
      <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-boot-primary">
        <Icon size={21} strokeWidth={2.5} />
      </span>
      <span className="block text-lg font-black">{title}</span>
      <span className="mt-1 block text-xs leading-5 text-boot-muted">{desc}</span>
    </Link>
  )
}

function UtilityLink({
  href,
  label,
  desc,
  Icon,
}: {
  href: string
  label: string
  desc: string
  Icon: typeof Sparkles
}) {
  return (
    <Link
      href={href}
      className="glass flex items-center gap-3 rounded-2xl border border-boot-hairline bg-white/85 px-4 py-3.5 shadow-sm transition-colors hover:border-boot-primary/30"
    >
      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-boot-soft text-boot-primary">
        <Icon size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-black">{label}</span>
        <span className="mt-0.5 block text-xs text-boot-muted">{desc}</span>
      </span>
      <ChevronRight size={16} className="text-boot-muted" />
    </Link>
  )
}

export default async function Home() {
  const devAuthed =
    isDevAuthBypassEnabled() &&
    cookies().get(DEV_AUTH_COOKIE)?.value === getDevAuthCookieValue()

  if (devAuthed) return <HomeDashboard />
  if (!isSupabaseConfigured()) return <LandingPage />

  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return <LandingPage />

  const onboardingRedirect = await getOnboardingRedirect(supabase, user.id)
  if (onboardingRedirect) redirect(onboardingRedirect)

  return <HomeDashboard />
}

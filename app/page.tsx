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
  ShieldCheck,
  UserPlus,
  UsersRound,
} from 'lucide-react'
import { DEV_AUTH_COOKIE, getDevAuthCookieValue, isDevAuthBypassEnabled } from '@/lib/dev-auth'
import { isSupabaseConfigured } from '@/lib/utils'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import BootingLogo from '@/components/BootingLogo'
import ActiveMatchingHomeCard from '@/components/matching/ActiveMatchingHomeCard'
import MatchingPool, { type PoolStats } from '@/components/MatchingPool'
import { aggregateMatchPoolStats, type MatchPoolStatsRow } from '@/lib/match-pool-stats'

type ServerSupabaseClient = ReturnType<typeof createSupabaseServerClient>

type ProfileGate = {
  gender: string | null
  appearance_type: string | null
  big5_openness: number | null
}

const EMPTY_POOL: PoolStats = {
  female: 0,
  male: 0,
  bySize: { '2': { female: 0, male: 0 }, '3': { female: 0, male: 0 } },
}

async function loadPoolStats(supabase: ServerSupabaseClient | null): Promise<PoolStats> {
  if (!supabase) return EMPTY_POOL
  const { data, error } = await supabase.rpc('get_match_pool_stats')
  if (error) return EMPTY_POOL
  return aggregateMatchPoolStats((data ?? []) as MatchPoolStatsRow[])
}

async function getOnboardingRedirect(
  supabase: ServerSupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data: appUser } = await supabase
    .from('users')
    .select('school_email_verified_at')
    .eq('id', userId)
    .maybeSingle()

  if (!appUser?.school_email_verified_at) return '/profile/school'

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

function LandingPage({ poolStats }: { poolStats: PoolStats }) {
  return (
    <main className="min-h-screen overflow-hidden booting-band px-5 pb-16 pt-7 text-boot-ink">
      <div className="mx-auto flex w-full max-w-md flex-col">
        <header className="mb-9 flex items-center justify-between">
          <BootingLogo size="md" />
          <Link
            href="/login"
            className="rounded-full border border-boot-hairline bg-white px-3 py-2 text-xs font-black text-boot-body shadow-sm"
          >
            로그인
          </Link>
        </header>

        <section className="mb-7">
          <p className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-boot-hairline bg-white px-3 py-1.5 text-[11px] font-black text-boot-primary shadow-sm">
            <UsersRound size={13} />
            부산대 그룹 과팅
          </p>
          <h1 className="text-[34px] font-black leading-[1.12] tracking-normal text-boot-ink">
            친구랑 같이
            <br />
            <span className="gradient-brand-text">부팅</span>하세요
            </h1>
            <p className="mt-4 text-sm leading-6 text-boot-muted">
              친구와 그룹을 만들면, 상대 그룹과 시간, 장소를 시스템이 맞춰줘요. 지금은 무료 베타로 운영해요.
            </p>
        </section>

        <div className="glass-card mb-6 w-full rounded-[28px] p-5">
          <MatchingPool stats={poolStats} />
        </div>

        <div className="mb-7 grid gap-2.5">
          {[
            { Icon: LockKeyhole, title: '프로필 비공개', desc: '만날 때까지 이름과 사진을 잠가둬요' },
            { Icon: CalendarCheck2, title: '자동 확정', desc: '가능한 시간과 장소를 시스템이 맞춰요' },
              { Icon: ShieldCheck, title: '무료 베타', desc: '초기 사용자 확보를 위해 결제 없이 매칭을 열어둬요' },
          ].map(({ Icon, title, desc }) => (
            <div key={title} className="glass flex items-center gap-3 rounded-2xl px-4 py-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-boot-soft text-boot-primary">
                <Icon size={18} />
              </div>
              <div>
                <p className="text-sm font-black text-boot-ink">{title}</p>
                <p className="mt-0.5 text-xs text-boot-muted">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <Link
          href="/login"
          className="btn-gradient-animated block w-full rounded-2xl py-4 text-center text-base font-black"
        >
          시작하기
        </Link>
        <p className="mt-3 text-center text-xs text-boot-muted">이메일로 가입하고 바로 둘러볼 수 있어요</p>
      </div>
    </main>
  )
}

function HomeDashboard({ poolStats }: { poolStats: PoolStats }) {
  return (
    <main className="min-h-screen booting-band px-5 pb-12 pt-7 text-boot-ink">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-7 flex items-center justify-between">
          <BootingLogo size="md" />
          <Link
            href="/notifications"
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-boot-hairline bg-white/90 text-boot-body shadow-sm"
            aria-label="알림"
          >
            <Bell size={18} />
          </Link>
        </header>

        <section className="mb-5">
          <p className="text-xs font-black uppercase tracking-normal text-boot-primary">Home</p>
          <h1 className="mt-2 text-3xl font-black leading-tight">오늘은 뭘 해볼까요?</h1>
          <p className="mt-2 text-sm leading-6 text-boot-muted">
            친구를 먼저 추가하거나, 매칭찾기로 바로 이번 주 과팅 준비를 시작할 수 있어요.
          </p>
        </section>

        <ActiveMatchingHomeCard />

        <section className="mb-5 grid grid-cols-2 gap-3">
          <Link
            href="/friends"
            className="glass-card rounded-3xl border border-boot-hairline p-4 shadow-sm transition-colors hover:border-boot-primary/30"
          >
            <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-boot-soft text-boot-primary">
              <UserPlus size={21} strokeWidth={2.5} />
            </span>
            <span className="block text-lg font-black">친구추가</span>
            <span className="mt-1 block text-xs leading-5 text-boot-muted">같이 과팅할 친구를 초대해요</span>
          </Link>

          <Link
            href="/match/start"
            className="glass-card rounded-3xl border border-boot-primary/20 bg-boot-soft p-4 shadow-sm transition-colors hover:border-boot-primary/40"
          >
            <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-boot-primary">
              <Search size={21} strokeWidth={2.5} />
            </span>
            <span className="block text-lg font-black">매칭찾기</span>
            <span className="mt-1 block text-xs leading-5 text-boot-muted">선호 설정 후 그룹을 만들어요</span>
          </Link>
        </section>

        <section className="glass-card mb-5 rounded-3xl border border-boot-hairline p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-black">현재 매칭 풀</h2>
              <p className="mt-1 text-xs text-boot-muted">대기 중인 그룹 기준이에요</p>
            </div>
            <UsersRound size={19} className="text-boot-primary" />
          </div>
          <MatchingPool stats={poolStats} />
        </section>

        <div className="grid gap-2.5">
          {[
            { href: '/group/create', label: '내 그룹 보기', desc: '초대, 무료 베타 참여, 큐 진입 상태 확인', Icon: UsersRound },
            { href: '/profile/edit', label: '프로필 수정', desc: '기본정보, 사진, 설문을 다시 확인', Icon: Settings2 },
            { href: '/match', label: '매칭 결과', desc: '확정된 매칭과 약속 정보 확인', Icon: CalendarCheck2 },
          ].map(({ href, label, desc, Icon }) => (
            <Link
              key={href}
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
          ))}
        </div>
      </div>
    </main>
  )
}

export default async function Home() {
  const devAuthed =
    isDevAuthBypassEnabled() &&
    cookies().get(DEV_AUTH_COOKIE)?.value === getDevAuthCookieValue()

  if (devAuthed) return <HomeDashboard poolStats={EMPTY_POOL} />
  if (!isSupabaseConfigured()) return <LandingPage poolStats={EMPTY_POOL} />

  const supabase = createSupabaseServerClient()
  const poolStats = await loadPoolStats(supabase)
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return <LandingPage poolStats={poolStats} />

  const onboardingRedirect = await getOnboardingRedirect(supabase, user.id)
  if (onboardingRedirect) redirect(onboardingRedirect)

  return <HomeDashboard poolStats={poolStats} />
}

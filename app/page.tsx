import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import Link from 'next/link'
import {
  Bell,
  ChevronRight,
  LockKeyhole,
  Search,
  Settings2,
  Sparkles,
  UserPlus,
  UsersRound,
} from 'lucide-react'
import { DEV_AUTH_COOKIE, getDevAuthCookieValue, isDevAuthBypassEnabled } from '@/lib/dev-auth'
import { isSupabaseConfigured } from '@/lib/utils'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import BootingLogo from '@/components/BootingLogo'
import HomeInfoButton from '@/components/matching/HomeInfoButton'
import HomeTodayTaskCard from '@/components/matching/HomeTodayTaskCard'

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

        <section className="mb-5 grid grid-cols-2 gap-3">
          <HomeActionCard
            href="/friends"
            title="친구 초대"
            desc="링크로 같이 과팅할 친구를 모아요"
            Icon={UserPlus}
          />
          <HomeActionCard
            href="/match"
            title="매칭 현황"
            desc="그룹과 부족한 준비를 한 번에 확인해요"
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
  if (!isSupabaseConfigured()) redirect('/login')

  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const onboardingRedirect = await getOnboardingRedirect(supabase, user.id)
  if (onboardingRedirect) redirect(onboardingRedirect)

  return <HomeDashboard />
}

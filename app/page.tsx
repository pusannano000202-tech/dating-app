import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { Bell, LockKeyhole } from 'lucide-react'
import { DEV_AUTH_COOKIE, getDevAuthCookieValue, isDevAuthBypassEnabled } from '@/lib/dev-auth'
import { isSupabaseConfigured } from '@/lib/utils'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import BootingLogo from '@/components/BootingLogo'
import HomeInfoButton from '@/components/matching/HomeInfoButton'
import HomeTodayTaskCard from '@/components/matching/HomeTodayTaskCard'
import QuantumHomeRecommendations from '@/components/home/QuantumHomeRecommendations'

type ServerSupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>

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
    <main className="min-h-screen booting-paper px-4 pb-24 pt-5 text-boot-ink sm:px-6 sm:pt-7">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-8 flex items-center justify-between">
          <BootingLogo size="md" />
          <div className="flex items-center gap-2">
            <HomeInfoButton />
            <Link
              href="/notifications"
              className="flex h-11 w-11 items-center justify-center rounded-md border border-boot-hairline bg-white text-boot-body transition-colors hover:border-boot-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-boot-primary"
              aria-label="알림"
            >
              <Bell size={18} />
            </Link>
          </div>
        </header>

        <section className="mb-4">
          <p className="text-sm font-bold text-boot-muted">지금 필요한 것부터</p>
          <h1 className="mt-1 text-[28px] font-black leading-tight">다음 한 번만 누르면 돼요</h1>
        </section>

        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
          <HomeTodayTaskCard />
          <QuantumHomeRecommendations />
        </div>

        <div className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-boot-muted">
          <LockKeyhole size={13} />
          필요한 순간 전까지 이름과 사진은 상대에게 공개되지 않아요.
        </div>
      </div>
    </main>
  )
}

export default async function Home() {
  const cookieStore = await cookies()
  const devAuthed =
    isDevAuthBypassEnabled() &&
    cookieStore.get(DEV_AUTH_COOKIE)?.value === getDevAuthCookieValue()

  if (devAuthed) return <HomeDashboard />
  if (!isSupabaseConfigured()) redirect('/login')

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const onboardingRedirect = await getOnboardingRedirect(supabase, user.id)
  if (onboardingRedirect) redirect(onboardingRedirect)

  return <HomeDashboard />
}

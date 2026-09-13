import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { LockKeyhole } from 'lucide-react'
import { DEV_AUTH_COOKIE, getDevAuthCookieValue, isDevAuthBypassEnabled } from '@/lib/dev-auth'
import { isSupabaseConfigured } from '@/lib/utils'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import BootingLogo from '@/components/BootingLogo'
import HomeInfoButton from '@/components/matching/HomeInfoButton'
import NotificationBell from '@/components/NotificationBell'
import QuantumHomeLead from '@/components/home/QuantumHomeLead'
import QuantumHomeParticipation from '@/components/home/QuantumHomeParticipation'
import QuantumHomeMyMeetups from '@/components/home/QuantumHomeMyMeetups'
import QuantumHomePulse from '@/components/home/QuantumHomePulse'
import QuantumHomeRecommendations from '@/components/home/QuantumHomeRecommendations'
import { DailyIdentityCard } from '@/components/daily-identity'
import RelationshipSummary from '@/components/relationship/RelationshipSummary'

type ServerSupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>

async function getOnboardingRedirect(
  supabase: ServerSupabaseClient,
): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_my_profile_readiness')
  const readiness = Array.isArray(data) ? data[0] : data
  return error || readiness?.minimum_signup_complete !== true ? '/profile/basic' : null
}

function HomeDashboard() {
  return (
    <main className="min-h-screen bg-[#fffaf6] px-5 pb-28 pt-5 text-[#292320] sm:px-7 sm:pt-7">
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-7 flex items-center justify-between">
          <BootingLogo size="md" />
          <div className="flex items-center gap-2">
            <HomeInfoButton />
            <NotificationBell />
          </div>
        </header>

        <section className="mb-4">
          <h1 className="text-[27px] font-black leading-tight tracking-tight sm:text-4xl">오늘은 누구랑 놀까?</h1>
          <p className="mt-2 text-sm text-[#807169]">내 약속부터, 오늘 끌리는 것까지.</p>
        </section>

        <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div className="space-y-3" aria-label="내가 참여한 약속">
            <RelationshipSummary />
            <QuantumHomeMyMeetups />
            <QuantumHomeParticipation fallback={<QuantumHomeLead />} />
            <DailyIdentityCard />
          </div>
          <div><QuantumHomeRecommendations />
            <details className="mt-5 border-t border-[#edddd4] pt-3">
              <summary className="min-h-11 cursor-pointer py-3 text-sm font-bold text-[#807169]">최근 모집·학교 소식 더 보기</summary>
              <div className="mt-3"><QuantumHomePulse /></div>
            </details>
          </div>
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

  const onboardingRedirect = await getOnboardingRedirect(supabase)
  if (onboardingRedirect) redirect(onboardingRedirect)

  return <HomeDashboard />
}

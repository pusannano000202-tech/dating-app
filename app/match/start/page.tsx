import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowRight,
  CalendarClock,
  Check,
  ChevronLeft,
  HeartHandshake,
  SlidersHorizontal,
  UsersRound,
} from 'lucide-react'
import { DEV_AUTH_COOKIE, getDevAuthCookieValue, isDevAuthBypassEnabled } from '@/lib/dev-auth'
import { DEV_MATCH_SETUP_COOKIES, getDevMatchSetupCookieValue } from '@/lib/dev-match-setup'
import {
  DEFAULT_MATCH_PREFERENCE_WEIGHTS,
  getMatchSetupStatus,
  type MatchSetupProfile,
} from '@/lib/matching/match-setup-status'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { isSupabaseConfigured } from '@/lib/utils'

type SetupStep = {
  href: string
  label: string
  desc: string
  done: boolean
  Icon: typeof HeartHandshake
}

const REDIRECT_TO = '/match/start'

function buildSetupSteps(profile: MatchSetupProfile | null): SetupStep[] {
  const status = getMatchSetupStatus(profile)

  return [
    {
      href: `/profile/personality-preference?redirect=${encodeURIComponent(REDIRECT_TO)}`,
      label: '성향 선호',
      desc: '어떤 성향의 상대와 편한지 선택합니다.',
      done: status.personality,
      Icon: HeartHandshake,
    },
    {
      href: `/profile/schedule?redirect=${encodeURIComponent(REDIRECT_TO)}`,
      label: '가능 시간',
      desc: '이번 주 만날 수 있는 시간대를 고릅니다.',
      done: status.schedule,
      Icon: CalendarClock,
    },
    {
      href: `/profile/preferences?redirect=${encodeURIComponent(REDIRECT_TO)}`,
      label: '매칭 비중',
      desc: '외모, 성격, 키, 체형 중 무엇을 더 볼지 정합니다.',
      done: status.preferences,
      Icon: SlidersHorizontal,
    },
  ]
}

function buildDevMatchSetupProfile(cookieStore: ReturnType<typeof cookies>): MatchSetupProfile {
  const isDone = (key: keyof typeof DEV_MATCH_SETUP_COOKIES) =>
    cookieStore.get(DEV_MATCH_SETUP_COOKIES[key])?.value === getDevMatchSetupCookieValue()

  return {
    personality_preference_completed_at: isDone('personality') ? 'dev-preview' : null,
    available_timeslots: isDone('schedule')
      ? { slots: [{ day: 'friday', start: '18:00', end: '22:00' }] }
      : null,
    preference_weights: isDone('preferences') ? DEFAULT_MATCH_PREFERENCE_WEIGHTS : null,
  }
}

function getCurrentSetupState(steps: SetupStep[]) {
  const currentIndex = steps.findIndex((step) => !step.done)

  return {
    allDone: currentIndex === -1,
    currentIndex,
    currentStep: currentIndex === -1 ? null : steps[currentIndex],
  }
}

function MatchStartView({ steps }: { steps: SetupStep[] }) {
  const current = getCurrentSetupState(steps)
  const currentStep = current.currentStep

  if (!currentStep) {
    return (
      <main className="min-h-screen booting-band px-5 pb-12 pt-7 text-boot-ink">
        <div className="mx-auto w-full max-w-[calc(100vw-2.5rem)] sm:max-w-md">
          <header className="mb-6 flex items-center gap-3">
            <Link href="/" className="glass rounded-xl border border-boot-hairline p-2 text-boot-body hover:text-boot-primary">
              <ChevronLeft size={18} />
            </Link>
            <div>
              <h1 className="text-2xl font-black">매칭찾기 준비 완료</h1>
              <p className="mt-0.5 text-xs text-boot-muted">
                이제 친구와 그룹을 만들고 큐에 들어가면 됩니다.
              </p>
            </div>
          </header>

          <section className="glass-card mb-6 rounded-3xl border border-boot-hairline p-6 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
              <Check size={24} strokeWidth={3} />
            </div>
            <h2 className="text-xl font-black">설정이 모두 끝났어요</h2>
            <p className="mt-2 text-sm leading-6 text-boot-muted">
              성향 선호, 가능 시간, 매칭 비중이 모두 저장되었습니다.
            </p>
          </section>

          <Link
            href="/group/create"
            className="btn-gradient-animated flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-center text-base font-black"
          >
            그룹 만들고 매칭 찾기
            <ArrowRight size={18} />
          </Link>
        </div>
      </main>
    )
  }

  const CurrentIcon = currentStep.Icon

  return (
    <main className="min-h-screen booting-band px-5 pb-12 pt-7 text-boot-ink">
      <div className="mx-auto w-full max-w-[calc(100vw-2.5rem)] sm:max-w-md">
        <header className="mb-6 flex items-center gap-3">
          <Link href="/" className="glass rounded-xl border border-boot-hairline p-2 text-boot-body hover:text-boot-primary">
            <ChevronLeft size={18} />
          </Link>
          <div>
            <h1 className="text-2xl font-black">매칭찾기 준비</h1>
            <p className="mt-0.5 text-xs text-boot-muted">
              매칭에 필요한 정보만 차례대로 확인합니다.
            </p>
          </div>
        </header>

        <div className="mb-5 grid grid-cols-3 gap-2">
          {steps.map((step, index) => {
            const active = index === current.currentIndex
            return (
              <div
                key={step.href}
                aria-current={index === current.currentIndex ? 'step' : undefined}
                className={[
                  'rounded-2xl border px-2.5 py-2 text-center text-[11px] font-black shadow-sm',
                  step.done
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : active
                      ? 'border-boot-primary/30 bg-white text-boot-primary'
                      : 'border-boot-hairline bg-white/55 text-boot-muted',
                ].join(' ')}
              >
                <span className="mx-auto mb-1 flex h-6 w-6 items-center justify-center rounded-full bg-white text-[11px] shadow-sm">
                  {step.done ? <Check size={13} strokeWidth={3} /> : index + 1}
                </span>
                <span className="block truncate">{step.label}</span>
              </div>
            )
          })}
        </div>

        <section className="glass-card mb-5 rounded-3xl border border-boot-hairline p-5">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-boot-soft text-boot-primary">
              <UsersRound size={22} />
            </div>
            <div>
              <h2 className="text-lg font-black">그룹 매칭 전 설정</h2>
              <p className="mt-1 text-sm leading-6 text-boot-muted">
                내가 원하는 성향과 시간, 중요하게 보는 기준이 실제 매칭 점수에 반영됩니다.
              </p>
            </div>
          </div>
        </section>

        <section className="glass mb-6 rounded-3xl border border-boot-primary/20 bg-white/90 p-6 shadow-sm">
          <p className="mb-4 text-xs font-black text-boot-primary">
            STEP {current.currentIndex + 1} / {steps.length}
          </p>
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-boot-soft text-boot-primary">
            <CurrentIcon size={25} strokeWidth={2.5} />
          </div>
          <h2 className="text-2xl font-black">{currentStep.label}</h2>
          <p className="mt-2 text-sm leading-6 text-boot-muted">{currentStep.desc}</p>
        </section>

        <Link
          href={currentStep.href}
          className="btn-gradient-animated flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-center text-base font-black"
        >
          {currentStep.label} 시작하기
          <ArrowRight size={18} />
        </Link>
      </div>
    </main>
  )
}

export default async function MatchStartPage() {
  const cookieStore = cookies()
  const devAuthed =
    isDevAuthBypassEnabled() &&
    cookieStore.get(DEV_AUTH_COOKIE)?.value === getDevAuthCookieValue()

  if (devAuthed || !isSupabaseConfigured()) {
    const profile = devAuthed ? buildDevMatchSetupProfile(cookieStore) : null
    return <MatchStartView steps={buildSetupSteps(profile)} />
  }

  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?redirect=${encodeURIComponent(REDIRECT_TO)}`)

  const { data: profile } = await supabase
    .from('profiles')
    .select('available_timeslots, preference_weights, personality_preference_completed_at')
    .eq('user_id', user.id)
    .maybeSingle()

  const steps = buildSetupSteps((profile as MatchSetupProfile | null) ?? null)
  if (steps.every((step) => step.done)) redirect('/group/create')

  return <MatchStartView steps={steps} />
}

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowRight,
  CalendarClock,
  Check,
  ChevronLeft,
  HeartHandshake,
  Info,
  SlidersHorizontal,
  StickyNote,
  UsersRound,
} from 'lucide-react'
import { DEV_AUTH_COOKIE, getDevAuthCookieValue, isDevAuthBypassEnabled } from '@/lib/dev-auth'
import { DEV_MATCH_SETUP_COOKIES, getDevMatchSetupCookieValue } from '@/lib/dev-match-setup'
import {
  DEFAULT_MATCH_PREFERENCE_WEIGHTS,
  getMatchSetupStatus,
  type MatchSetupProfile,
} from '@/lib/matching/match-setup-status'
import {
  PRE_MATCH_CARD_DRAFT_COOKIE,
  isPreMatchCardDraftCookieDone,
} from '@/lib/matching/pre-match-card-draft'
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

function buildSetupSteps(profile: MatchSetupProfile | null, cardDraftDone: boolean): SetupStep[] {
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
      label: '안 되는 시간',
      desc: '이번 주 만날 수 없는 시간만 눌러서 막아둡니다.',
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
    {
      href: `/profile/match-card?redirect=${encodeURIComponent(REDIRECT_TO)}`,
      label: '사전 카드 초안',
      desc: '매칭 후 하루 한 장씩 공개될 내 카드 초안을 미리 적습니다.',
      done: cardDraftDone,
      Icon: StickyNote,
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
      <main className="min-h-screen booting-paper px-5 pb-28 pt-7 text-boot-ink">
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
              성향 선호, 안 되는 시간, 매칭 비중, 사전 카드 초안이 준비됐습니다.
            </p>
          </section>

          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/group/create?size=2"
              className="flex min-h-[112px] flex-col justify-between rounded-3xl border border-boot-hairline bg-white px-4 py-4 shadow-sm transition hover:border-boot-primary/30 hover:bg-boot-soft"
            >
              <span className="text-xs font-black text-boot-primary">빠른 매칭</span>
              <span className="text-2xl font-black text-boot-ink">2:2</span>
              <span className="flex items-center gap-1 text-[11px] font-bold text-boot-muted">
                둘이서 바로 준비
                <ArrowRight size={13} />
              </span>
            </Link>
            <Link
              href="/group/create?size=3"
              className="flex min-h-[112px] flex-col justify-between rounded-3xl bg-boot-ink px-4 py-4 text-white shadow-[0_16px_34px_rgba(23,20,18,0.22)] transition hover:-translate-y-0.5"
            >
              <span className="text-xs font-black text-white/70">활기찬 매칭</span>
              <span className="text-2xl font-black">3:3</span>
              <span className="flex items-center gap-1 text-[11px] font-bold text-white/70">
                셋이서 과팅 시작
                <ArrowRight size={13} />
              </span>
            </Link>
          </div>
        </div>
      </main>
    )
  }

  const CurrentIcon = currentStep.Icon

  return (
    <main className="min-h-screen booting-paper px-5 pb-28 pt-7 text-boot-ink">
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

        <details className="mb-5 rounded-2xl border border-boot-primary/15 bg-white/85 px-4 py-3 shadow-sm">
          <summary className="flex cursor-pointer items-center gap-2 text-xs font-black text-boot-ink">
            <Info size={15} className="text-boot-primary" />
            매칭 찾기는 이렇게 진행돼요
          </summary>
          <p className="mt-2 text-xs leading-5 text-boot-muted">
            내 성향, 안 되는 시간, 매칭 비중, 사전 카드 초안을 먼저 끝내고 친구 그룹을 만들어요.
            그룹원이 준비되면 큐에 들어가고, 매칭이 잡힌 뒤 상대 카드와 오늘의 카드가 보입니다.
          </p>
        </details>

        <div className="mb-5 grid grid-cols-4 gap-2">
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
    const cardDraftDone = isPreMatchCardDraftCookieDone(
      cookieStore.get(PRE_MATCH_CARD_DRAFT_COOKIE)?.value,
    )
    return <MatchStartView steps={buildSetupSteps(profile, cardDraftDone)} />
  }

  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?redirect=${encodeURIComponent(REDIRECT_TO)}`)

  const { data: profile } = await supabase
    .from('profiles')
    .select('available_timeslots, preference_weights, personality_preference_completed_at')
    .eq('user_id', user.id)
    .maybeSingle()

  const { data: cardDraft } = await supabase
    .from('pre_match_card_drafts')
    .select('completed_items')
    .eq('user_id', user.id)
    .maybeSingle()

  const cardDraftDone =
    typeof cardDraft?.completed_items === 'number' &&
    cardDraft.completed_items >= 4
  const steps = buildSetupSteps((profile as MatchSetupProfile | null) ?? null, cardDraftDone)
  if (steps.every((step) => step.done)) redirect('/group/create')

  return <MatchStartView steps={steps} />
}

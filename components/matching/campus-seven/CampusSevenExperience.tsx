'use client'

import Image from 'next/image'
import Link from 'next/link'
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  Gamepad2,
  Heart,
  Loader2,
  LockKeyhole,
  MapPin,
  PhoneCall,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Upload,
  UserRound,
  UsersRound,
  WalletCards,
  X,
} from 'lucide-react'
import BootingLogo from '@/components/BootingLogo'
import CampusSevenPushControl from '@/components/matching/campus-seven/CampusSevenPushControl'
import ParticipantChoiceGrid, {
  ParticipantPortrait,
  participantDisplayName,
  type CampusSevenChoiceParticipant,
} from '@/components/matching/campus-seven/ParticipantChoiceGrid'
import {
  getCampusSevenActionAvailability,
  getCampusSevenNextRefreshAt,
  type CampusSevenActionAvailability,
} from '@/lib/campus-seven/action-availability'
import {
  getCampusSevenRefreshDelay,
  type CampusSevenLiveGuide,
} from '@/lib/campus-seven/live-guide'
import { createClient } from '@/lib/supabase'
import {
  CAMPUS_SEVEN_GAMES,
  CAMPUS_SEVEN_PREFERENCE_QUESTIONS,
} from '@/lib/campus-seven/program'

export type CampusSevenTab = 'live' | 'people' | 'safety'

type Participant = CampusSevenChoiceParticipant & {
  gender: 'male' | 'female'
  department: string | null
  phone: string | null
}

type Team = {
  teamCode: string
  members: Array<{ userId: string; alias: string }>
}

export type CampusSevenDashboard = {
  application: null | { id: string; status: string; appliedAt: string; cardSalePreference: boolean }
  enrollment: null | {
    id: string
    userId: string
    alias: string
    gender: 'male' | 'female'
    entryRole: 'starter' | 'newcomer'
    status: string
  }
  cohort: null | {
    id: string
    school: string
    status: string
    startDate: string
    activityBudgetCapWon: number
    refundableDepositWon: number
  }
  dayNumber: number
  participants: Participant[]
  liveGuide: CampusSevenLiveGuide | null
  actionAvailability: CampusSevenActionAvailability
  schedule: null | {
    id: string
    dayNumber: number
    title: string
    summary: string
    meetingMode: 'campus_then_venue' | 'direct_to_venue'
    budgetWon: number
    startsAt: string
    endsAt: string
    meetingPointName: string | null
    meetingPointAddress: string | null
    venueName: string | null
    venueAddress: string | null
    venueBookingUrl: string | null
    venueStatus: string
    allowedMenuNote: string | null
  }
  reservationTask: null | {
    id: string
    scheduleId: string
    status: string
    remindersSent: number
    deadline: string
    confirmationReference: string | null
  }
  attendance: null | { status: string; capturedAt: string; deleteAfter: string }
  interestVote: null | { dayNumber: number; targetUserId: string; submittedAt: string }
  dayTwoTeam: Team | null
  dayFourTeam: Team | null
  gameResults: Array<{ gameName: string; teamCode: string; rank: number; points: number; lockedAt: string }>
  myGameRanks: Array<{ gameName: string; rank: number; updatedAt: string }>
  dateChoiceEligible: boolean
  incomingDateChoices: Array<{ id: string; chooserUserId: string; chooserAlias: string; status: string }>
  outgoingDateChoice: null | { id: string; targetUserId: string; targetAlias: string; status: string }
  incomingFinalProposals: Array<{ proposerUserId: string; proposerAlias: string }>
  outgoingFinalProposal: null | { targetUserId: string; targetAlias: string; response: string }
  finalPairs: Array<{
    proposerUserId: string
    proposerAlias: string
    targetUserId: string
    targetAlias: string
  }>
  deposit: null | { status: string; amountWon: number }
  depositReviews: Array<{
    id: string
    reason: string
    amountWon: number
    status: string
    appealDeadline: string
  }>
  cardPublication: null | {
    saleEnabled: boolean
    salesOpenAt: string
    salesCloseAt: string
    salesCount: number
  }
}

type ApiPayload = {
  dashboard: CampusSevenDashboard
  applicationsOpen: boolean
  cardPaymentsEnabled: boolean
}

type CampusSevenExperienceProps = {
  applicationsOpen: boolean
  cardPaymentsEnabled: boolean
  preview?: CampusSevenExperiencePreview
}

export type CampusSevenExperiencePreview = {
  dashboard: CampusSevenDashboard
  initialTab: CampusSevenTab
  label: string
}

const EMPTY_DASHBOARD: CampusSevenDashboard = {
  application: null,
  enrollment: null,
  cohort: null,
  dayNumber: 0,
  participants: [],
  liveGuide: null,
  actionAvailability: getCampusSevenActionAvailability({ schedule: null }),
  schedule: null,
  reservationTask: null,
  attendance: null,
  interestVote: null,
  dayTwoTeam: null,
  dayFourTeam: null,
  gameResults: [],
  myGameRanks: [],
  dateChoiceEligible: false,
  incomingDateChoices: [],
  outgoingDateChoice: null,
  incomingFinalProposals: [],
  outgoingFinalProposal: null,
  finalPairs: [],
  deposit: null,
  depositReviews: [],
  cardPublication: null,
}

const CONSENTS = [
  ['adult_eligibility', '만 19세 이상이며 참가 자격 확인에 동의합니다.'],
  ['seven_day_schedule', '7일 연속 19:00 일정에 참여합니다.'],
  ['activity_budget', '활동비는 각자 현장에서 결제하며 1인 총 상한은 10만 원입니다.'],
  ['public_venues_no_alcohol', '공개된 장소만 이용하고 음주하지 않습니다.'],
  ['external_contact_prohibited', '최종 커플 전에는 외부 연락처를 교환하지 않습니다.'],
  ['cohort_photo_display', '프로그램 진행 중 같은 기수 참가자에게 내 대표사진 1장을 표시합니다.'],
  ['attendance_photo', '워터마크 출석 사진의 수집과 기한 후 삭제에 동의합니다.'],
  ['final_contact_reveal', '최종 커플이 되면 실명·학과·전화번호가 서로 공개됩니다.'],
  ['privacy_policy', '프로그램 개인정보 처리 안내를 확인했습니다.'],
] as const

const INTEREST_REASON_OPTIONS = [
  '대화가 편했어요',
  '더 궁금해요',
  '배려가 느껴졌어요',
  '함께 있을 때 즐거웠어요',
] as const

const inputClass = 'h-11 w-full rounded-lg border border-boot-hairline bg-white px-3 text-sm font-bold text-boot-ink outline-none transition focus:border-boot-primary'
const textareaClass = 'min-h-[88px] w-full resize-none rounded-lg border border-boot-hairline bg-white px-3 py-2.5 text-sm font-bold leading-5 text-boot-ink outline-none transition focus:border-boot-primary'
const primaryButton = 'inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-boot-ink px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40'
const secondaryButton = 'inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-boot-hairline bg-white px-3 text-xs font-black text-boot-body disabled:cursor-not-allowed disabled:opacity-40'

export default function CampusSevenExperience({
  applicationsOpen: initialApplicationsOpen,
  cardPaymentsEnabled: initialCardPaymentsEnabled,
  preview,
}: CampusSevenExperienceProps) {
  const [tab, setTab] = useState<CampusSevenTab>(preview?.initialTab ?? 'live')
  const [dashboard, setDashboard] = useState<CampusSevenDashboard | null>(preview?.dashboard ?? null)
  const [applicationsOpen, setApplicationsOpen] = useState(initialApplicationsOpen)
  const [cardPaymentsEnabled, setCardPaymentsEnabled] = useState(initialCardPaymentsEnabled)
  const [loading, setLoading] = useState(!preview)
  const [authRequired, setAuthRequired] = useState(false)
  const [runtimeNotice, setRuntimeNotice] = useState('')
  const [showApplication, setShowApplication] = useState(false)

  const refresh = useCallback(async () => {
    if (preview) {
      setDashboard(preview.dashboard)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const response = await fetch('/api/campus-seven', { cache: 'no-store' })
      if (response.status === 401) {
        setAuthRequired(true)
        setDashboard(null)
        return
      }
      const payload = await response.json() as Partial<ApiPayload> & { error?: string }
      if (!response.ok || !payload.dashboard) {
        setRuntimeNotice(payload.error === 'program_setup_required'
          ? '서버 프로그램은 아직 적용 전이라 미리보기만 보여드려요.'
          : '참가 상태를 불러오지 못해 미리보기로 열었어요.')
        setDashboard(EMPTY_DASHBOARD)
        return
      }
      setAuthRequired(false)
      setDashboard(payload.dashboard)
      setApplicationsOpen(payload.applicationsOpen === true)
      setCardPaymentsEnabled(payload.cardPaymentsEnabled === true)
      setRuntimeNotice('')
    } catch {
      setRuntimeNotice('서버 연결 전이라 미리보기만 보여드려요.')
      setDashboard(EMPTY_DASHBOARD)
    } finally {
      setLoading(false)
    }
  }, [preview])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (preview) return
    const nextRefreshAt = getCampusSevenNextRefreshAt({
      guideNextUnlockAt: dashboard?.liveGuide?.nextUnlockAt ?? null,
      actionNextChangeAt: dashboard?.actionAvailability.nextChangeAt ?? null,
    })
    const delay = getCampusSevenRefreshDelay({
      nextUnlockAt: nextRefreshAt,
    })
    if (delay === null) return
    const timeoutId = window.setTimeout(() => void refresh(), delay)
    return () => window.clearTimeout(timeoutId)
  }, [dashboard?.actionAvailability.nextChangeAt, dashboard?.liveGuide?.nextUnlockAt, preview, refresh])

  const activeDashboard = dashboard ?? EMPTY_DASHBOARD
  const hasEnrollment = Boolean(activeDashboard.enrollment && activeDashboard.cohort)

  return (
    <main className="min-h-screen bg-boot-canvas pb-28 text-boot-ink">
      <div className="mx-auto w-full max-w-4xl">
        <header className="flex h-16 items-center justify-between border-b border-boot-hairline bg-white px-4 sm:px-6">
          <Link href="/match" aria-label="매칭으로 돌아가기" className="flex h-10 w-10 items-center justify-center rounded-lg text-boot-body hover:bg-boot-soft">
            <ArrowLeft size={20} />
          </Link>
          <BootingLogo size="sm" />
          <button type="button" onClick={() => void refresh()} aria-label="상태 새로고침" className="flex h-10 w-10 items-center justify-center rounded-lg text-boot-body hover:bg-boot-soft">
            <RefreshCw className={loading ? 'animate-spin' : ''} size={18} />
          </button>
        </header>

        {hasEnrollment ? <EnrolledProgramBanner dashboard={activeDashboard} /> : (
        <section className="relative aspect-[4/5] min-h-[430px] overflow-hidden border-b border-boot-hairline bg-white sm:aspect-[16/9] sm:min-h-[470px]">
          <Image
            src="/campus-seven/campus-seven-hero.png"
            alt="캠퍼스에서 새로운 인연을 만나는 여덟 명의 대학생"
            fill
            priority
            sizes="(max-width: 768px) 100vw, 896px"
            className="object-cover object-[58%_center] sm:object-center"
          />
          <div className="absolute inset-x-0 top-0 h-2 bg-boot-primary" />
          <div className="absolute left-5 top-6 max-w-[250px] sm:left-8 sm:top-9 sm:max-w-sm">
            <p className="text-xs font-black text-boot-coral">QUANTUM ORIGINAL</p>
            <h1 className="mt-2 text-[34px] font-black leading-none text-boot-ink sm:text-[46px]">7일 캠퍼스</h1>
            <p className="mt-3 text-sm font-black leading-6 text-boot-body sm:text-base">오늘 밤, 다음 장면이 열린다</p>
          </div>
          <div className="absolute inset-x-4 bottom-4 flex flex-wrap gap-2 sm:inset-x-8 sm:bottom-7">
            <span className="rounded-full bg-white/95 px-3 py-2 text-[11px] font-black text-boot-primary shadow-sm">성인 참가자</span>
            <span className="rounded-full bg-white/95 px-3 py-2 text-[11px] font-black text-boot-coral shadow-sm">8명의 실제 만남</span>
            <span className="rounded-full bg-white/95 px-3 py-2 text-[11px] font-black text-boot-body shadow-sm">앱 실시간 안내</span>
          </div>
        </section>
        )}

        <nav className="sticky top-0 z-20 grid grid-cols-3 border-b border-boot-hairline bg-white/95 px-4 py-2 backdrop-blur sm:px-6" aria-label="프로그램 메뉴">
          <TabButton active={tab === 'live'} onClick={() => setTab('live')} icon={<Sparkles size={17} />} label="LIVE" />
          <TabButton active={tab === 'people'} onClick={() => setTab('people')} icon={<UsersRound size={17} />} label="참가자" />
          <TabButton active={tab === 'safety'} onClick={() => setTab('safety')} icon={<ShieldCheck size={17} />} label="안전" />
        </nav>

        {preview && (
          <div data-testid="campus-seven-preview-banner" className="mx-4 mt-4 rounded-lg border border-boot-primary/20 bg-boot-soft px-4 py-3 text-xs font-black text-boot-primary sm:mx-6">
            개발 전용 화면 미리보기 · {preview.label} · 실제 데이터는 저장되지 않아요.
          </div>
        )}

        {runtimeNotice && (
          <div className="mx-4 mt-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold leading-5 text-amber-900 sm:mx-6">
            <CircleAlert className="mt-0.5 shrink-0" size={17} />
            {runtimeNotice}
          </div>
        )}

        {tab === 'live' && (
          <div className="space-y-4 px-4 py-5 sm:px-6">
            {loading && !dashboard ? <LoadingPanel /> : hasEnrollment ? (
              <ParticipantDashboard
                dashboard={activeDashboard}
                cardPaymentsEnabled={cardPaymentsEnabled}
                refresh={refresh}
                readOnlyPreview={Boolean(preview)}
              />
            ) : (
              <>
                <PilotStatus
                  dashboard={activeDashboard}
                  applicationsOpen={applicationsOpen}
                  authRequired={authRequired}
                  onApply={() => setShowApplication(true)}
                />
                {showApplication && applicationsOpen && !authRequired && (
                  <ApplicationForm onApplied={refresh} onClose={() => setShowApplication(false)} />
                )}
                <LivePreview />
              </>
            )}
          </div>
        )}

        {tab === 'people' && (
          <div className="px-4 py-5 sm:px-6">
            {hasEnrollment
              ? <ParticipantList participants={activeDashboard.participants} />
              : <LockedParticipants />}
          </div>
        )}
        {tab === 'safety' && (
          <SafetyPanel
            dashboard={hasEnrollment ? activeDashboard : null}
            onSubmitted={refresh}
            readOnlyPreview={Boolean(preview)}
          />
        )}
      </div>
    </main>
  )
}

function EnrolledProgramBanner({ dashboard }: { dashboard: CampusSevenDashboard }) {
  const isLive = dashboard.liveGuide?.isLive === true
  const dayLabel = dashboard.dayNumber > 0 ? `DAY ${dashboard.dayNumber}` : '시작 준비'

  return (
    <section data-testid="campus-seven-enrolled-banner" className="relative h-[152px] overflow-hidden border-b border-boot-hairline bg-white sm:h-[176px]">
      <Image
        src="/campus-seven/campus-seven-hero.png"
        alt=""
        fill
        priority
        sizes="(max-width: 768px) 100vw, 896px"
        className="object-cover object-[72%_42%] opacity-45 sm:object-[72%_38%]"
      />
      <div className="absolute inset-0 bg-white/45" />
      <div className="absolute inset-y-0 left-0 w-1.5 bg-boot-primary" />
      <div className="relative flex h-full max-w-[70%] flex-col justify-center px-5 sm:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${isLive ? 'bg-red-600 text-white' : 'bg-boot-primary text-white'}`}>
            {isLive ? 'LIVE' : dayLabel}
          </span>
          <span className="text-xs font-black text-boot-primary">{dashboard.cohort?.school}</span>
        </div>
        <h1 className="mt-3 text-2xl font-black leading-tight text-boot-ink">7일 캠퍼스</h1>
        <p className="mt-1 text-sm font-bold text-boot-body">{dashboard.enrollment?.alias}님, 지금 열린 장면만 안내할게요.</p>
      </div>
    </section>
  )
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-10 items-center justify-center gap-2 rounded-lg text-xs font-black transition ${active ? 'bg-boot-primary text-white' : 'text-boot-muted hover:bg-boot-soft'}`}
    >
      {icon}{label}
    </button>
  )
}

function LoadingPanel() {
  return (
    <section className="flex min-h-48 items-center justify-center rounded-lg border border-boot-hairline bg-white">
      <Loader2 className="animate-spin text-boot-primary" size={24} />
      <span className="ml-2 text-sm font-black text-boot-muted">참가 상태 확인 중</span>
    </section>
  )
}

function PilotStatus({
  dashboard,
  applicationsOpen,
  authRequired,
  onApply,
}: {
  dashboard: CampusSevenDashboard
  applicationsOpen: boolean
  authRequired: boolean
  onApply: () => void
}) {
  const applicationStatus = dashboard.application?.status
  return (
    <section className="rounded-lg border border-boot-hairline bg-white p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-boot-soft text-boot-primary">
          <LockKeyhole size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black text-boot-primary">모집 상태</p>
          <h2 className="mt-1 text-lg font-black">
            {applicationStatus ? '신청 정보를 확인하고 있어요' : applicationsOpen ? '첫 파일럿 신청 가능' : '현재 실제 모집은 열지 않았어요'}
          </h2>
          <p className="mt-2 text-sm font-bold leading-6 text-boot-muted">
            {applicationStatus
              ? '학교·성인 인증이 끝난 뒤 4명씩 여덟 명이 모두 준비되면 기수가 확정됩니다.'
              : '개인정보·결제·약관 검토와 장소 확정이 끝나야 부산대 한 기수만 열립니다.'}
          </p>
        </div>
      </div>

      {!applicationStatus && applicationsOpen && !authRequired && (
        <button type="button" onClick={onApply} className={`${primaryButton} mt-4 w-full`}>
          참가 신청서 열기 <ChevronRight size={17} />
        </button>
      )}
      {authRequired && (
        <Link href="/login?next=%2Fmatch%2Fcampus-seven" className={`${primaryButton} mt-4 w-full`}>
          로그인하고 상태 확인
        </Link>
      )}
    </section>
  )
}

function LivePreview() {
  return (
    <section className="overflow-hidden rounded-lg border border-boot-primary/20 bg-white">
      <div className="bg-boot-primary px-5 py-4 text-white">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-black text-white/75">Quantum 제작진</p>
            <h2 className="mt-1 text-lg font-black">만나는 동안 안내가 도착해요</h2>
          </div>
          <span className="rounded-full bg-boot-coral px-3 py-1 text-[11px] font-black">LIVE</span>
        </div>
        <div className="mt-4 border-l-2 border-boot-amber pl-4">
          <p className="text-sm font-black">첫 장면이 시작됐어요</p>
          <p className="mt-1 text-xs font-bold leading-5 text-white/80">지금 필요한 장소, 대화, 자리 이동과 선택만 그 시간에 맞춰 알려드려요.</p>
        </div>
      </div>
      <div className="p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black text-boot-primary">운영 원칙</p>
          <h2 className="mt-1 text-lg font-black">앱은 안내하고, 만남은 각자가 판단해요</h2>
        </div>
        <ShieldCheck className="shrink-0 text-emerald-700" size={26} />
      </div>
      <div className="mt-4 divide-y divide-boot-hairline border-y border-boot-hairline">
        <BoundaryRow icon={<UsersRound size={17} />} text="Quantum 직원이 현장에 가지 않아요." />
        <BoundaryRow icon={<MapPin size={17} />} text="공식 일정은 밝은 교내·공개 장소만 안내해요." />
        <BoundaryRow icon={<WalletCards size={17} />} text="활동비는 현장에서 각자 결제하고 앱이 받지 않아요." />
        <BoundaryRow icon={<PhoneCall size={17} />} text="최종 커플 전에는 외부 연락처를 교환하지 않아요." />
      </div>
      <div className="mt-4 rounded-lg bg-boot-soft px-4 py-3 text-xs font-bold leading-5 text-boot-body">
        종료 뒤 열리는 비공개 콘텐츠와 결제 기능은 아직 열리지 않았어요.
      </div>
      </div>
    </section>
  )
}

function BoundaryRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex min-h-12 items-center gap-3 py-2 text-sm font-bold text-boot-body">
      <span className="text-boot-primary">{icon}</span>{text}
    </div>
  )
}

function LockedParticipants() {
  return (
    <section className="rounded-lg border border-boot-hairline bg-white p-6 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-boot-soft text-boot-primary"><LockKeyhole size={21} /></span>
      <h2 className="mt-3 text-lg font-black">참가자가 확정되면 열려요</h2>
      <p className="mt-2 text-sm font-bold leading-6 text-boot-muted">공개 시점이 되기 전에는 닉네임과 개인정보를 보여주지 않아요.</p>
    </section>
  )
}

function ApplicationForm({ onApplied, onClose }: { onApplied: () => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [consents, setConsents] = useState<Record<string, boolean>>({})
  const [cardSalePreference, setCardSalePreference] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const response = await fetch('/api/campus-seven/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submittedName: name,
          dateOfBirth,
          preferenceAnswers: answers,
          requiredConsents: Object.fromEntries(CONSENTS.map(([key]) => [key, consents[key] === true])),
          cardSalePreference,
        }),
      })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(applicationError(payload.error))
      await onApplied()
      onClose()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '신청을 완료하지 못했어요.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-boot-primary/25 bg-white p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-black text-boot-primary">자기선택형 신청</p>
          <h2 className="mt-1 text-lg font-black">참가 신청</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="신청서 닫기" className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-boot-soft"><X size={18} /></button>
      </div>
      <p className="mt-2 text-xs font-bold leading-5 text-boot-muted">연애 경험 증명은 받지 않아요. 실명은 인증용이며 Day 5 전에는 다른 참가자에게 보이지 않습니다.</p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-xs font-black text-boot-body">인증할 실명
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={50} required className={`${inputClass} mt-1.5`} />
        </label>
        <label className="text-xs font-black text-boot-body">생년월일
          <input type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} required className={`${inputClass} mt-1.5`} />
        </label>
      </div>

      <fieldset className="mt-6">
        <legend className="text-sm font-black">취향 8문항</legend>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {CAMPUS_SEVEN_PREFERENCE_QUESTIONS.map((question) => (
            <label key={question.id} className="text-xs font-black text-boot-body">{question.label}
              <input
                value={answers[question.id] ?? ''}
                onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
                maxLength={80}
                required
                className={`${inputClass} mt-1.5`}
              />
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-6">
        <legend className="text-sm font-black">필수 확인</legend>
        <div className="mt-3 divide-y divide-boot-hairline border-y border-boot-hairline">
          {CONSENTS.map(([key, label]) => (
            <label key={key} className="flex min-h-12 cursor-pointer items-start gap-3 py-3 text-xs font-bold leading-5 text-boot-body">
              <input type="checkbox" checked={consents[key] === true} onChange={(event) => setConsents((current) => ({ ...current, [key]: event.target.checked }))} required className="mt-0.5 h-4 w-4 accent-boot-primary" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="mt-4 flex items-start gap-3 rounded-lg bg-boot-soft px-4 py-3 text-xs font-bold leading-5 text-boot-body">
        <input type="checkbox" checked={cardSalePreference} onChange={(event) => setCardSalePreference(event.target.checked)} className="mt-0.5 h-4 w-4 accent-boot-primary" />
        종료 후 내 관심카드 판매를 검토할 의향이 있어요. 실제 판매 전 전체 내용을 다시 보고 별도 동의합니다.
      </label>
      {error && <p className="mt-3 text-xs font-black text-red-600">{error}</p>}
      <button disabled={submitting} className={`${primaryButton} mt-5 w-full`}>
        {submitting ? <Loader2 className="animate-spin" size={17} /> : <Check size={17} />} 신청 제출
      </button>
    </form>
  )
}

function ParticipantDashboard({
  dashboard,
  cardPaymentsEnabled,
  refresh,
  readOnlyPreview,
}: {
  dashboard: CampusSevenDashboard
  cardPaymentsEnabled: boolean
  refresh: () => Promise<void>
  readOnlyPreview: boolean
}) {
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [selectedTarget, setSelectedTarget] = useState('')
  const [interestReason, setInterestReason] = useState('')
  const [reservationReference, setReservationReference] = useState('')
  const [dayTwoTargets, setDayTwoTargets] = useState<string[]>([])
  const [appealTexts, setAppealTexts] = useState<Record<string, string>>({})

  const otherGender = dashboard.enrollment?.gender === 'male' ? 'female' : 'male'
  const availableTargets = dashboard.participants.filter((participant) => participant.gender === otherGender)
  const participantById = useMemo(
    () => new Map(dashboard.participants.map((participant) => [participant.userId, participant])),
    [dashboard.participants],
  )
  const selectedParticipant = selectedTarget ? participantById.get(selectedTarget) ?? null : null

  async function action(body: Record<string, unknown>, key: string) {
    if (readOnlyPreview) {
      setNotice('개발 전용 화면이라 실제 데이터는 저장하지 않았어요.')
      return
    }
    setBusy(key)
    setNotice('')
    try {
      const response = await fetch('/api/campus-seven/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(actionError(payload.error))
      setNotice('서버 기록에 반영했어요.')
      await refresh()
    } catch (requestError) {
      setNotice(requestError instanceof Error ? requestError.message : '처리하지 못했어요.')
    } finally {
      setBusy('')
    }
  }

  async function uploadAttendance(file: File) {
    if (!dashboard.schedule) return
    setBusy('attendance')
    setNotice('사진에 날짜 워터마크를 넣는 중이에요.')
    const capturedAt = new Date().toISOString()
    const watermarkText = `Quantum Day ${dashboard.schedule.dayNumber} | ${kstDate(dashboard.schedule.startsAt)}`
    try {
      const watermarked = await addWatermark(file, watermarkText)
      const ticketResponse = await fetch('/api/campus-seven/attendance-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduleId: dashboard.schedule.id, contentType: 'image/jpeg' }),
      })
      const ticket = await ticketResponse.json() as { path?: string; token?: string; error?: string }
      if (!ticketResponse.ok || !ticket.path || !ticket.token) throw new Error('사진 업로드 준비에 실패했어요.')
      const supabase = createClient()
      const { error } = await supabase.storage
        .from('campus-seven-attendance')
        .uploadToSignedUrl(ticket.path, ticket.token, watermarked, { contentType: 'image/jpeg' })
      if (error) throw error
      await action({
        action: 'attendance',
        scheduleId: dashboard.schedule.id,
        objectPath: ticket.path,
        capturedAt,
        watermarkText,
      }, 'attendance-submit')
    } catch (uploadError) {
      setNotice(uploadError instanceof Error ? uploadError.message : '출석 사진을 제출하지 못했어요.')
    } finally {
      setBusy('')
    }
  }

  const schedule = dashboard.schedule

  return (
    <>
      {!readOnlyPreview && <CampusSevenPushControl />}
      <LiveGuidePanel guide={dashboard.liveGuide} />

      <section className="overflow-hidden rounded-lg border border-boot-hairline bg-white">
        <div className="flex items-start justify-between gap-4 border-b border-boot-hairline px-5 py-4">
          <div>
            <p className="text-xs font-black text-boot-primary">{dashboard.cohort?.school} · {dashboard.enrollment?.alias}</p>
            <h2 className="mt-1 text-xl font-black">{dashboard.dayNumber > 0 ? `Day ${dashboard.dayNumber}` : '시작 준비 중'}</h2>
          </div>
          <span className="rounded-full bg-boot-mint px-3 py-1 text-xs font-black text-emerald-800">{cohortStatus(dashboard.cohort?.status)}</span>
        </div>
        {schedule ? (
          <div className="px-5 py-5">
            <p className="text-xs font-black text-boot-coral">오늘 필요한 정보</p>
            <h3 className="mt-1 text-lg font-black">장소와 시간을 확인해 주세요</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <InfoLine icon={<Clock3 size={17} />} title={`${formatTime(schedule.startsAt)}–${formatTime(schedule.endsAt)}`} detail={`${schedule.budgetWon.toLocaleString()}원 상한`} />
              <InfoLine icon={<MapPin size={17} />} title={schedule.venueName ?? schedule.meetingPointName ?? '시작 20분 전에 공개'} detail={schedule.venueAddress ?? schedule.meetingPointAddress ?? '도착 안내가 열리면 지도와 함께 보여드려요'} />
            </div>
            {schedule.allowedMenuNote && <p className="mt-3 rounded-lg bg-boot-soft px-3 py-2 text-xs font-bold text-boot-body">{schedule.allowedMenuNote}</p>}
          </div>
        ) : (
          <div className="px-5 py-5 text-sm font-bold leading-6 text-boot-muted">장소와 참가 상태가 모두 확인되면 첫 안내가 열립니다.</div>
        )}
      </section>

      {notice && <div className="rounded-lg border border-boot-hairline bg-white px-4 py-3 text-xs font-black text-boot-body">{notice}</div>}

      {dashboard.reservationTask && (
        <ActionSection icon={<MapPin size={19} />} eyebrow="오늘의 당번" title="예약 상태를 알려주세요">
          <p className="text-xs font-bold leading-5 text-boot-muted">만석·연락 실패·대체 요청에는 불이익이 없어요. 알림을 받고도 아무 행동이 없을 때만 사람의 확인 대상으로 갑니다.</p>
          <input value={reservationReference} onChange={(event) => setReservationReference(event.target.value)} placeholder="예약자명 또는 확인 내용" className={`${inputClass} mt-3`} />
          <div className="mt-3 grid grid-cols-3 gap-2">
            <button type="button" disabled={Boolean(busy)} onClick={() => void action({ action: 'reservation', scheduleId: dashboard.reservationTask?.scheduleId, status: 'confirmed', confirmationReference: reservationReference }, 'reservation')} className={secondaryButton}>예약 완료</button>
            <button type="button" disabled={Boolean(busy)} onClick={() => void action({ action: 'reservation', scheduleId: dashboard.reservationTask?.scheduleId, status: 'venue_unavailable' }, 'reservation')} className={secondaryButton}>만석</button>
            <button type="button" disabled={Boolean(busy)} onClick={() => void action({ action: 'reservation', scheduleId: dashboard.reservationTask?.scheduleId, status: 'substitute_requested' }, 'reservation')} className={secondaryButton}>대체 요청</button>
          </div>
        </ActionSection>
      )}

      {schedule && (
        <ActionSection icon={<Upload size={19} />} eyebrow="개인정보 보호 출석" title={dashboard.attendance ? '오늘 출석을 제출했어요' : '워터마크 단체 사진 제출'}>
          <p className="text-xs font-bold leading-5 text-boot-muted">얼굴 인식에는 사용하지 않고 보증금 정산 후 30일이 지나면 삭제합니다.</p>
          {!dashboard.attendance && (
            <label className={`${primaryButton} mt-3 w-full cursor-pointer`}>
              {busy === 'attendance' ? <Loader2 className="animate-spin" size={17} /> : <Upload size={17} />} 카메라로 촬영
              <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void uploadAttendance(file)
              }} />
            </label>
          )}
        </ActionSection>
      )}

      {dashboard.actionAvailability.dayTwoChoices.isOpen && dashboard.dayNumber === 2 && dashboard.enrollment?.entryRole === 'newcomer' && !dashboard.dayTwoTeam && (
        <ActionSection icon={<UsersRound size={19} />} eyebrow="Day 2 팀 만들기" title="함께 식사할 두 명을 골라주세요">
          <p className="text-xs font-bold leading-5 text-boot-muted">신규 참가자 두 명의 선택이 모두 끝나면 2남2녀 두 팀을 서버가 확정합니다.</p>
          <div className="mt-4">
            <ParticipantChoiceGrid
              participants={availableTargets.filter((participant) => participant.entryRole === 'starter')}
              selectedUserIds={dayTwoTargets}
              maxSelections={2}
              disabled={Boolean(busy)}
              label="Day 2 식사팀으로 함께할 두 명 선택"
              onToggle={(userId) => setDayTwoTargets((current) => (
                current.includes(userId)
                  ? current.filter((id) => id !== userId)
                  : [...current, userId]
              ))}
            />
          </div>
          <p className="mt-3 text-center text-xs font-black text-boot-primary">{dayTwoTargets.length}/2명 선택</p>
          <button type="button" disabled={dayTwoTargets.length !== 2 || Boolean(busy)} onClick={() => void action({ action: 'day_two_choices', targetUserIds: dayTwoTargets }, 'day-two')} className={`${primaryButton} mt-3 w-full`}>두 명 선택 확정</button>
        </ActionSection>
      )}

      {dashboard.dayTwoTeam && <TeamSection title="Day 2 식사 팀" team={dashboard.dayTwoTeam} />}
      {dashboard.dayFourTeam && <TeamSection title="Day 4 보드게임 팀" team={dashboard.dayFourTeam} />}

      {dashboard.actionAvailability.gameRank.isOpen && dashboard.dayNumber === 4 && dashboard.dayFourTeam && (
        <GameRankPanel dashboard={dashboard} busy={busy} onAction={action} />
      )}

      {dashboard.actionAvailability.interestVote.isOpen && [1, 3, 5].includes(dashboard.dayNumber) && !dashboard.interestVote && (
        <ActionSection icon={<Heart size={19} />} eyebrow="비공개 마음 기록" title="오늘 더 알아가고 싶은 한 사람">
          <p className="text-xs font-bold leading-5 text-boot-muted">사진을 눌러 한 사람을 선택하세요. 선택 내용은 다른 참가자에게 공개되지 않아요.</p>
          <div className="mt-4">
            <ParticipantChoiceGrid participants={availableTargets} selectedUserIds={selectedTarget ? [selectedTarget] : []} disabled={Boolean(busy)} label="오늘 더 알아가고 싶은 한 사람 선택" onToggle={(userId) => setSelectedTarget((current) => current === userId ? '' : userId)} />
          </div>
          {selectedParticipant && <SelectedPersonSummary participant={selectedParticipant} message="이 사람에게 오늘의 마음을 기록합니다." />}
          <div className="mt-4 flex flex-wrap gap-2" aria-label="선택 이유">
            {INTEREST_REASON_OPTIONS.map((reason) => (
              <button key={reason} type="button" aria-pressed={interestReason === reason} onClick={() => setInterestReason(reason)} className={`min-h-9 rounded-full border px-3 py-2 text-xs font-black transition ${interestReason === reason ? 'border-boot-primary bg-boot-soft text-boot-primary' : 'border-boot-hairline bg-white text-boot-body'}`}>{reason}</button>
            ))}
          </div>
          <textarea value={interestReason} onChange={(event) => setInterestReason(event.target.value)} maxLength={60} placeholder="또는 긍정적인 이유를 직접 적어주세요" className={`${textareaClass} mt-3`} />
          <button type="button" disabled={!selectedTarget || interestReason.trim().length < 2 || Boolean(busy)} onClick={() => void action({ action: 'interest_vote', dayNumber: dashboard.dayNumber, targetUserId: selectedTarget, positiveReason: interestReason }, 'interest')} className={`${primaryButton} mt-3 w-full`}>이 사람으로 비공개 제출</button>
        </ActionSection>
      )}

      {dashboard.actionAvailability.dateChoice.isOpen && dashboard.dayNumber === 6 && dashboard.dateChoiceEligible && !dashboard.outgoingDateChoice && (
        <ActionSection icon={<Sparkles size={19} />} eyebrow="특별 데이트 선택권" title="함께할 한 사람을 초대하세요">
          <div className="mt-4">
            <ParticipantChoiceGrid participants={availableTargets} selectedUserIds={selectedTarget ? [selectedTarget] : []} disabled={Boolean(busy)} label="특별 데이트에 초대할 사람 선택" onToggle={(userId) => setSelectedTarget((current) => current === userId ? '' : userId)} />
          </div>
          {selectedParticipant && <SelectedPersonSummary participant={selectedParticipant} message="선택한 사람에게 비공개 초대를 보냅니다." />}
          <button type="button" disabled={!selectedTarget || Boolean(busy)} onClick={() => void action({ action: 'date_choice', targetUserId: selectedTarget }, 'date-choice')} className={`${primaryButton} mt-3 w-full`}>이 사람에게 요청</button>
        </ActionSection>
      )}

      {dashboard.outgoingDateChoice && (
        <SubmittedChoice participant={participantById.get(dashboard.outgoingDateChoice.targetUserId)} eyebrow="보낸 특별 데이트 요청" status={dashboard.outgoingDateChoice.status} />
      )}

      {dashboard.actionAvailability.dateResponse.isOpen && dashboard.incomingDateChoices.map((choice) => (
        <ResponseSection key={choice.id} participant={participantById.get(choice.chooserUserId)} title={`${choice.chooserAlias}님의 특별 데이트 요청`} onAccept={() => void action({ action: 'date_response', choiceId: choice.id, accept: true }, `date-${choice.id}`)} onDecline={() => void action({ action: 'date_response', choiceId: choice.id, accept: false }, `date-${choice.id}`)} disabled={Boolean(busy)} />
      ))}

      {dashboard.actionAvailability.finalProposal.isOpen && dashboard.dayNumber === 7 && dashboard.enrollment?.gender === 'male' && !dashboard.outgoingFinalProposal && (
        <ActionSection icon={<Heart size={19} />} eyebrow="마지막 비공개 제안" title="최종 선택을 보낼 한 사람">
          <div className="mt-4">
            <ParticipantChoiceGrid participants={availableTargets} selectedUserIds={selectedTarget ? [selectedTarget] : []} disabled={Boolean(busy)} label="최종 선택을 보낼 사람 선택" onToggle={(userId) => setSelectedTarget((current) => current === userId ? '' : userId)} />
          </div>
          {selectedParticipant && <SelectedPersonSummary participant={selectedParticipant} message="마지막 선택은 제출 후 바꿀 수 없어요." />}
          <button type="button" disabled={!selectedTarget || Boolean(busy)} onClick={() => void action({ action: 'final_proposal', targetUserId: selectedTarget }, 'final-proposal')} className={`${primaryButton} mt-3 w-full`}>이 사람에게 최종 선택 보내기</button>
        </ActionSection>
      )}

      {dashboard.outgoingFinalProposal && (
        <SubmittedChoice participant={participantById.get(dashboard.outgoingFinalProposal.targetUserId)} eyebrow="보낸 최종 선택" status={dashboard.outgoingFinalProposal.response} />
      )}

      {dashboard.actionAvailability.finalResponse.isOpen && dashboard.incomingFinalProposals.map((proposal) => (
        <ResponseSection key={proposal.proposerUserId} participant={participantById.get(proposal.proposerUserId)} title={`${proposal.proposerAlias}님의 최종 선택`} onAccept={() => void action({ action: 'final_response', proposerUserId: proposal.proposerUserId, accept: true }, `final-${proposal.proposerUserId}`)} onDecline={() => void action({ action: 'final_response', proposerUserId: proposal.proposerUserId, accept: false }, `final-${proposal.proposerUserId}`)} disabled={Boolean(busy)} />
      ))}

      {dashboard.finalPairs.length > 0 && (
        <section className="rounded-lg border border-boot-primary/25 bg-white p-5">
          <p className="text-xs font-black text-boot-primary">성사된 최종 커플</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {dashboard.finalPairs.map((pair) => <FinalPair key={`${pair.proposerUserId}-${pair.targetUserId}`} proposer={participantById.get(pair.proposerUserId)} target={participantById.get(pair.targetUserId)} proposerAlias={pair.proposerAlias} targetAlias={pair.targetAlias} />)}
          </div>
        </section>
      )}

      {dashboard.depositReviews.map((review) => (
        <ActionSection key={review.id} icon={<WalletCards size={19} />} eyebrow="자동 차감 아님" title={`${review.amountWon.toLocaleString()}원 보증금 확인 대상`}>
          <p className="text-xs font-bold leading-5 text-boot-muted">현재 상태는 {review.status}입니다. 사람의 확인 전에는 보증금이 차감되지 않아요.</p>
          {review.status === 'pending_review' && (
            <>
              <textarea value={appealTexts[review.id] ?? ''} onChange={(event) => setAppealTexts((current) => ({ ...current, [review.id]: event.target.value }))} placeholder="질병, 교통, 안전 이탈 등 사유를 적어주세요" className={`${textareaClass} mt-3`} />
              <button type="button" disabled={(appealTexts[review.id] ?? '').trim().length < 2 || Boolean(busy)} onClick={() => void action({ action: 'deposit_appeal', reviewId: review.id, appealText: appealTexts[review.id] }, `appeal-${review.id}`)} className={`${primaryButton} mt-3 w-full`}>이의신청 제출</button>
            </>
          )}
        </ActionSection>
      ))}

      {dashboard.cohort?.status === 'completed' && (
        <ActionSection icon={<WalletCards size={19} />} eyebrow="종료 후 7일" title="내 비공개 관심카드">
          <p className="text-xs font-bold leading-5 text-boot-muted">전체 내용을 먼저 본 뒤 같은 기수 안에서만 판매 여부를 정합니다. 구매자 신원은 공개하지 않아요.</p>
          {!cardPaymentsEnabled && <p className="mt-3 rounded-lg bg-boot-soft px-3 py-2 text-xs font-black text-boot-body">결제 기능은 아직 열리지 않았어요.</p>}
          <button type="button" disabled={!cardPaymentsEnabled || Boolean(busy)} onClick={() => void action({ action: 'card_publication', saleEnabled: true }, 'card')} className={`${primaryButton} mt-3 w-full`}>내용 확인 후 판매 동의</button>
        </ActionSection>
      )}
    </>
  )
}

function LiveGuidePanel({ guide }: { guide: CampusSevenLiveGuide | null }) {
  const current = guide?.currentMessage
  const phaseLabel = guide?.phase === 'complete'
    ? '오늘 종료'
    : guide?.isLive
      ? '지금 진행 중'
      : current
        ? '사전 안내'
        : '시작 전'

  return (
    <section className="overflow-hidden rounded-lg border border-boot-primary/25 bg-white shadow-sm">
      <div className="bg-boot-primary px-5 py-5 text-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-black text-white/70">Quantum 제작진 · {guide?.dayLabel ?? 'READY'}</p>
            <h2 className="mt-1 text-xl font-black">{current?.title ?? '다음 장면을 준비하고 있어요'}</h2>
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-black ${guide?.isLive ? 'bg-boot-coral text-white' : 'bg-white text-boot-primary'}`}>
            {phaseLabel}
          </span>
        </div>
        <p className="mt-3 max-w-xl text-sm font-bold leading-6 text-white/85">
          {current?.body ?? '미래 미션은 미리 보여주지 않아요. 필요한 순간에 이 화면으로 안내할게요.'}
        </p>
        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/25">
          <div className="h-full rounded-full bg-boot-amber transition-[width]" style={{ width: `${guide?.progressPercent ?? 0}%` }} />
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] font-black text-white/70">
          <span>{guide?.progressPercent ?? 0}%</span>
          <span>{guide?.nextUnlockAt ? `다음 안내 ${formatTime(guide.nextUnlockAt)}` : guide?.phase === 'complete' ? '오늘 안내 완료' : current ? '현재 안내를 따라주세요' : '시작 시간을 기다리는 중'}</span>
        </div>
      </div>

      <div className="px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-black">도착한 메시지</h3>
          <span className="text-[11px] font-black text-boot-muted">서버 시간 기준</span>
        </div>
        {guide?.messages.length ? (
          <ol className="mt-3 space-y-3">
            {[...guide.messages].reverse().map((message, index) => (
              <li key={message.id} className={`border-l-2 pl-4 ${index === 0 ? 'border-boot-coral' : 'border-boot-hairline'}`}>
                <div className="flex items-center gap-2">
                  <time className="text-[11px] font-black text-boot-primary">{formatTime(message.at)}</time>
                  {index === 0 && <span className="rounded-full bg-boot-coral/10 px-2 py-0.5 text-[10px] font-black text-boot-coral">NOW</span>}
                </div>
                <p className="mt-1 text-sm font-black">{message.title}</p>
                <p className="mt-1 text-xs font-bold leading-5 text-boot-muted">{message.body}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-3 rounded-lg bg-boot-soft px-4 py-3 text-xs font-bold leading-5 text-boot-body">아직 도착한 메시지가 없어요. 열린 화면을 새로고침하면 서버 시간이 반영됩니다.</p>
        )}
      </div>
    </section>
  )
}

function InfoLine({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  return <div className="flex items-start gap-3 rounded-lg bg-boot-soft px-3 py-3"><span className="mt-0.5 text-boot-primary">{icon}</span><div className="min-w-0"><p className="truncate text-xs font-black">{title}</p><p className="mt-1 truncate text-[11px] font-bold text-boot-muted">{detail}</p></div></div>
}

function ActionSection({ icon, eyebrow, title, children }: { icon: React.ReactNode; eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-boot-hairline bg-white p-5">
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-boot-soft text-boot-primary">{icon}</span>
        <div><p className="text-[11px] font-black text-boot-primary">{eyebrow}</p><h2 className="text-base font-black">{title}</h2></div>
      </div>
      {children}
    </section>
  )
}

function TeamSection({ title, team }: { title: string; team: Team }) {
  return (
    <section className="rounded-lg border border-boot-hairline bg-white p-5">
      <div className="flex items-center justify-between"><h2 className="text-base font-black">{title}</h2><span className="rounded-full bg-boot-soft px-3 py-1 text-xs font-black text-boot-primary">{team.teamCode}팀</span></div>
      <div className="mt-3 grid grid-cols-2 gap-2">{team.members.map((member) => <div key={member.userId} className="rounded-lg bg-boot-soft px-3 py-2 text-center text-xs font-black">{member.alias}</div>)}</div>
    </section>
  )
}

function GameRankPanel({ dashboard, busy, onAction }: { dashboard: CampusSevenDashboard; busy: string; onAction: (body: Record<string, unknown>, key: string) => Promise<void> }) {
  const [ranks, setRanks] = useState<Record<string, number>>({})
  const lockedGames = useMemo(() => new Set(dashboard.gameResults.map((result) => result.gameName)), [dashboard.gameResults])
  return (
    <ActionSection icon={<Gamepad2 size={19} />} eyebrow={`${dashboard.dayFourTeam?.teamCode}팀`} title="우리 팀 순위를 제출하세요">
      <p className="text-xs font-bold leading-5 text-boot-muted">네 팀이 1~4위를 서로 다르게 제출해야 그 게임 결과가 잠깁니다.</p>
      <div className="mt-3 divide-y divide-boot-hairline border-y border-boot-hairline">
        {CAMPUS_SEVEN_GAMES.map((game) => {
          const locked = lockedGames.has(game)
          const own = dashboard.myGameRanks.find((rank) => rank.gameName === game)?.rank
          return <div key={game} className="grid grid-cols-[minmax(0,1fr)_76px_68px] items-center gap-2 py-2.5"><span className="text-xs font-black">{game}</span><select aria-label={`${game} 순위`} value={ranks[game] ?? own ?? ''} disabled={locked} onChange={(event) => setRanks((current) => ({ ...current, [game]: Number(event.target.value) }))} className="h-9 rounded-lg border border-boot-hairline bg-white px-2 text-xs font-black"><option value="">순위</option>{[1, 2, 3, 4].map((rank) => <option key={rank} value={rank}>{rank}위</option>)}</select><button type="button" disabled={locked || !ranks[game] || Boolean(busy)} onClick={() => void onAction({ action: 'game_rank', gameName: game, rank: ranks[game] }, `game-${game}`)} className={secondaryButton}>{locked ? '확정' : '제출'}</button></div>
        })}
      </div>
    </ActionSection>
  )
}

function SelectedPersonSummary({ participant, message }: { participant: Participant; message: string }) {
  return (
    <div className="mt-4 flex items-center gap-3 rounded-lg bg-boot-soft p-3">
      <ParticipantPortrait participant={participant} className="h-16 w-14 shrink-0 rounded-lg" sizes="56px" />
      <div className="min-w-0">
        <p className="truncate text-sm font-black">{participantDisplayName(participant)}</p>
        <p className="mt-1 text-xs font-bold leading-5 text-boot-muted">{message}</p>
      </div>
    </div>
  )
}

function SubmittedChoice({ participant, eyebrow, status }: { participant: Participant | undefined; eyebrow: string; status: string }) {
  return (
    <section className="rounded-lg border border-boot-hairline bg-white p-5">
      <p className="text-xs font-black text-boot-primary">{eyebrow}</p>
      <div className="mt-3 flex items-center gap-3">
        <ParticipantPortrait participant={participant} className="h-20 w-16 shrink-0 rounded-lg" sizes="64px" />
        <div className="min-w-0">
          <h2 className="truncate text-base font-black">{participant ? participantDisplayName(participant) : '참가자'}</h2>
          <p className="mt-1 text-xs font-bold text-boot-muted">{choiceStatus(status)}</p>
        </div>
      </div>
    </section>
  )
}

function ResponseSection({ participant, title, onAccept, onDecline, disabled }: { participant: Participant | undefined; title: string; onAccept: () => void; onDecline: () => void; disabled: boolean }) {
  return (
    <section className="rounded-lg border border-boot-primary/25 bg-white p-5">
      <p className="text-xs font-black text-boot-primary">응답은 항상 자유로워요</p>
      <div className="mt-3 flex items-center gap-3">
        <ParticipantPortrait participant={participant} className="h-24 w-20 shrink-0 rounded-lg" sizes="80px" />
        <div className="min-w-0"><h2 className="text-base font-black">{title}</h2><p className="mt-1 text-xs font-bold leading-5 text-boot-muted">사진과 이름을 확인한 뒤 편하게 결정하세요.</p></div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={onDecline} disabled={disabled} className={secondaryButton}><X size={16} />거절</button><button type="button" onClick={onAccept} disabled={disabled} className={primaryButton}><Check size={16} />수락</button></div>
    </section>
  )
}

function FinalPair({ proposer, target, proposerAlias, targetAlias }: { proposer: Participant | undefined; target: Participant | undefined; proposerAlias: string; targetAlias: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-lg bg-boot-soft p-3 text-center">
      <div className="min-w-0">
        <ParticipantPortrait participant={proposer} className="mx-auto aspect-[4/5] w-full max-w-24 rounded-lg" sizes="96px" />
        <p className="mt-2 truncate text-xs font-black">{proposer ? participantDisplayName(proposer) : proposerAlias}</p>
      </div>
      <Heart className="fill-boot-primary text-boot-primary" size={20} />
      <div className="min-w-0">
        <ParticipantPortrait participant={target} className="mx-auto aspect-[4/5] w-full max-w-24 rounded-lg" sizes="96px" />
        <p className="mt-2 truncate text-xs font-black">{target ? participantDisplayName(target) : targetAlias}</p>
      </div>
    </div>
  )
}

function ParticipantList({ participants }: { participants: Participant[] }) {
  return (
    <section className="rounded-lg border border-boot-hairline bg-white p-5">
      <div className="flex items-center gap-3"><UserRound className="text-boot-primary" size={20} /><h2 className="text-base font-black">현재 공개된 참가자</h2></div>
      <div className="mt-3 divide-y divide-boot-hairline border-y border-boot-hairline">
        {participants.map((participant) => (
          <div key={participant.userId} className="flex min-h-14 items-center justify-between gap-3 py-2">
            <div className="flex min-w-0 items-center gap-3">
              <ParticipantPortrait participant={participant} className="h-14 w-12 shrink-0 rounded-lg" sizes="48px" />
              <div className="min-w-0"><p className="truncate text-sm font-black">{participantDisplayName(participant)}{participant.exactAge ? ` · ${participant.exactAge}세` : ''}</p><p className="mt-0.5 truncate text-[11px] font-bold text-boot-muted">{participant.entryRole === 'newcomer' ? 'Day 2 합류' : 'Day 1 시작'}{participant.department ? ` · ${participant.department}` : ''}</p></div>
            </div>
            {participant.phone && <a href={`tel:${participant.phone}`} aria-label={`${participant.verifiedName ?? participant.alias}에게 전화`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-boot-soft text-boot-primary"><PhoneCall size={16} /></a>}
          </div>
        ))}
      </div>
    </section>
  )
}

function SafetyPanel({ dashboard, onSubmitted, readOnlyPreview }: { dashboard: CampusSevenDashboard | null; onSubmitted: () => Promise<void>; readOnlyPreview: boolean }) {
  const [targetUserId, setTargetUserId] = useState('')
  const [category, setCategory] = useState('harassment')
  const [detail, setDetail] = useState('')
  const [safetyExit, setSafetyExit] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  async function submit() {
    if (readOnlyPreview) {
      setNotice('개발 전용 화면이라 신고를 저장하지 않았어요.')
      return
    }
    setBusy(true)
    setNotice('')
    try {
      const response = await fetch('/api/campus-seven/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'safety_report', targetUserId: targetUserId || null, category, detail, safetyExitRequested: safetyExit }),
      })
      if (!response.ok) throw new Error('신고를 접수하지 못했어요.')
      setNotice(safetyExit ? '신고를 접수하고 이후 배정을 중단했어요.' : '비공개 신고를 접수했어요.')
      setDetail('')
      await onSubmitted()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '신고를 접수하지 못했어요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4 px-4 py-5 sm:px-6">
      <section className="rounded-lg border border-red-200 bg-white p-5">
        <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-700"><ShieldAlert size={20} /></span><div><p className="text-xs font-black text-red-700">긴급상황</p><h2 className="mt-1 text-lg font-black">앱보다 현장 도움을 먼저 요청하세요</h2><p className="mt-2 text-sm font-bold leading-6 text-boot-muted">즉시 위험하면 112·119 또는 장소 직원에게 직접 도움을 요청하고 안전한 곳으로 이동하세요.</p></div></div>
        <div className="mt-4 grid grid-cols-2 gap-2"><a href="tel:112" className={secondaryButton}><PhoneCall size={16} />112</a><a href="tel:119" className={secondaryButton}><PhoneCall size={16} />119</a></div>
      </section>

      <section className="rounded-lg border border-boot-hairline bg-white p-5">
        <div className="flex items-center gap-3"><ShieldCheck className="text-emerald-700" size={21} /><h2 className="text-lg font-black">안전 원칙</h2></div>
        <div className="mt-3 divide-y divide-boot-hairline border-y border-boot-hairline text-xs font-bold leading-5 text-boot-body">
          <p className="py-3">거절, 현장 이탈, 신고 때문에 보증금 불이익을 주지 않아요.</p>
          <p className="py-3">일반 신고만으로는 전체 배정이 자동 중단되지 않아요. 즉시 멈추려면 전체 안전 이탈을 함께 선택해 주세요.</p>
          <p className="py-3">전체 안전 이탈은 이후 예약·데이트·최종 선택 배정을 중단해요.</p>
          <p className="py-3">음주, 외부 연락처 요구, 괴롭힘과 스토킹은 금지해요.</p>
        </div>
      </section>

      {dashboard?.enrollment && (
        <section className="rounded-lg border border-boot-hairline bg-white p-5">
          <p className="text-xs font-black text-boot-primary">비공개 접수</p><h2 className="mt-1 text-lg font-black">신고 또는 안전 이탈</h2>
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-sm font-black text-boot-ink">관련된 사람이 있나요?</p>
            <button type="button" aria-pressed={!targetUserId} onClick={() => setTargetUserId('')} className={`${secondaryButton} ${!targetUserId ? 'border-boot-primary bg-boot-soft text-boot-primary' : ''}`}>특정 상대 없음</button>
          </div>
          <div className="mt-3">
            <ParticipantChoiceGrid
              participants={dashboard.participants.filter((participant) => participant.userId !== dashboard.enrollment?.userId)}
              selectedUserIds={targetUserId ? [targetUserId] : []}
              disabled={busy}
              label="신고할 상대 선택"
              onToggle={(userId) => setTargetUserId((current) => current === userId ? '' : userId)}
            />
          </div>
          <label className="mt-4 block text-xs font-black text-boot-body">어떤 일이었나요?</label>
          <select aria-label="신고 유형" value={category} onChange={(event) => setCategory(event.target.value)} className={`${inputClass} mt-2`}><option value="harassment">괴롭힘</option><option value="stalking">스토킹</option><option value="contact_request">연락처 요구</option><option value="threat">위협</option><option value="intoxication">음주</option><option value="emergency">응급상황</option><option value="other">기타</option></select>
          <textarea value={detail} onChange={(event) => setDetail(event.target.value)} maxLength={1000} placeholder="무슨 일이 있었는지 적어주세요" className={`${textareaClass} mt-3`} />
          <label className={`mt-3 flex items-start gap-3 rounded-lg border px-4 py-3 text-xs font-bold leading-5 ${safetyExit ? 'border-red-200 bg-red-50 text-red-900' : 'border-transparent bg-boot-soft text-boot-body'}`}><input type="checkbox" checked={safetyExit} onChange={(event) => setSafetyExit(event.target.checked)} className="mt-0.5 h-4 w-4 accent-red-700" /><span><strong className="block text-sm">전체 안전 이탈</strong>오늘 이후 예약·데이트·최종 선택 배정을 중단합니다. 이 선택 자체로 보증금 불이익은 없어요.</span></label>
          {notice && <p className="mt-3 text-xs font-black text-boot-body">{notice}</p>}
          <button type="button" disabled={detail.trim().length < 2 || busy} onClick={() => void submit()} className={`${primaryButton} mt-4 w-full`}>{busy ? <Loader2 className="animate-spin" size={17} /> : <ShieldAlert size={17} />}{safetyExit ? '신고 접수 후 전체 안전 이탈' : '비공개 신고 접수'}</button>
        </section>
      )}
    </div>
  )
}

async function addWatermark(file: File, watermark: string): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const maxWidth = 1600
  const scale = Math.min(1, maxWidth / bitmap.width)
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('사진을 처리하지 못했어요.')
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const bandHeight = Math.max(54, Math.round(height * 0.08))
  context.fillStyle = 'rgba(0, 0, 0, 0.72)'
  context.fillRect(0, height - bandHeight, width, bandHeight)
  context.fillStyle = '#ffffff'
  context.font = `700 ${Math.max(18, Math.round(bandHeight * 0.34))}px sans-serif`
  context.fillText(watermark, Math.round(bandHeight * 0.35), height - Math.round(bandHeight * 0.34))
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('사진을 저장하지 못했어요.')), 'image/jpeg', 0.88))
}

function kstDate(value: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value))
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
}

function cohortStatus(status?: string): string {
  if (status === 'running') return '진행 중'
  if (status === 'completed') return '종료'
  if (status === 'ready') return '시작 확정'
  return '준비 중'
}

function choiceStatus(status: string): string {
  if (status === 'accepted') return '서로 수락했어요.'
  if (status === 'declined' || status === 'rejected') return '응답이 완료됐어요.'
  return '상대의 비공개 응답을 기다리고 있어요.'
}

function applicationError(code?: string): string {
  if (code === 'complete_profile_required') return '성별·학교·학과 프로필을 먼저 완료해주세요.'
  if (code === 'profile_photo_required') return '대표 프로필 사진을 먼저 등록해주세요.'
  if (code === 'adult_only') return '만 19세 이상만 신청할 수 있어요.'
  if (code === 'applications_closed' || code === 'application_window_closed') return '현재 실제 모집은 열지 않았어요.'
  return '신청을 완료하지 못했어요. 입력 내용을 확인해주세요.'
}

function actionError(code?: string): string {
  const messages: Record<string, string> = {
    game_rank_locked: '이미 확정된 게임이에요.',
    game_rank_window_closed: 'Day 4 운영 시간에만 제출할 수 있어요.',
    interest_vote_closed: '오늘 관심 선택 시간이 아니에요.',
    date_choice_right_required: '이번 특별 데이트 선택 대상이 아니에요.',
    day_six_choice_closed: '특별 데이트 요청 시간이 끝났어요.',
    date_response_window_closed: '특별 데이트 응답 시간이 끝났어요.',
    participant_already_has_special_date: '한 사람은 특별 데이트를 한 번만 할 수 있어요.',
    final_proposal_window_closed: '마지막 모임이 끝난 뒤 열린 최종 선택 시간에만 제출할 수 있어요.',
    final_response_window_closed: '최종 선택 응답 시간이 끝났어요.',
    card_payments_disabled: '카드 결제는 아직 열리지 않았어요.',
    deposit_review_appeal_expired: '이의신청 기간이 지났어요.',
  }
  return messages[code ?? ''] ?? '요청을 처리하지 못했어요. 잠시 뒤 다시 확인해주세요.'
}

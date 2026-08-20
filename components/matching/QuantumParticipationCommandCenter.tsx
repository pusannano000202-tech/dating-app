'use client'

import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Clock3,
  MapPin,
  MessageCircle,
  Star,
  UsersRound,
} from 'lucide-react'

import {
  getQuantumEventById,
  quantumEventPhotos,
} from '@/lib/matching/quantum-event-catalog'
import {
  deriveQuantumEventLifecycleStage,
  isQuantumEventLifecycle,
  type QuantumEventLifecycle,
  type QuantumEventLifecycleStage,
} from '@/lib/matching/quantum-event-lifecycle'
import type { QuantumEventParticipation } from '@/lib/matching/quantum-event-participation'
import type { QuantumEventApplicantStats } from '@/lib/matching/quantum-event-stats'

type Props = {
  participation: QuantumEventParticipation | QuantumEventLifecycle
  applicantStats?: QuantumEventApplicantStats
  placement?: 'home' | 'match' | 'preview'
  onCancel?: () => void
  cancelling?: boolean
}

const stateCopy: Record<QuantumEventLifecycleStage, {
  eyebrow: string
  title: string
  body: string
  action: string
}> = {
  recruiting: {
    eyebrow: '지금 편성 중',
    title: '함께할 사람을 모으고 있어요',
    body: '신청은 정상적으로 들어갔어요. 인원이 모이면 확정 시간과 장소를 바로 알려드릴게요.',
    action: '내 신청 현황 보기',
  },
  confirmed: {
    eyebrow: '약속 확정',
    title: '만날 팀과 일정이 정해졌어요',
    body: '시간과 장소를 확인해 주세요. 팀 채팅은 약속 20분 전에 자동으로 열려요.',
    action: '약속 상세 보기',
  },
  chat_open: {
    eyebrow: '팀 채팅 오픈',
    title: '이제 도착 위치를 나눌 수 있어요',
    body: '확정된 참가자끼리만 채팅할 수 있어요. 길을 헤매거나 늦을 것 같으면 먼저 알려주세요.',
    action: '팀 채팅 열기',
  },
  in_progress: {
    eyebrow: '만남 진행 중',
    title: '오늘의 활동을 함께 즐겨요',
    body: '안내된 미션을 따라가고, 마무리할 때 단체 사진을 남겨 주세요.',
    action: '진행 화면 보기',
  },
  cancelled: {
    eyebrow: '이번 회차 취소',
    title: '아쉽게도 필요한 인원이 모이지 않았어요',
    body: '보증금에는 불이익이 없어요. 남은 자리나 다음 회차를 바로 다시 고를 수 있어요.',
    action: '다른 약속 고르기',
  },
  completed: {
    eyebrow: '만남 완료',
    title: '오늘 만남은 어땠나요?',
    body: '만남 사진을 확인하고 후기를 남겨 주세요. 보증금 반환 또는 이월도 여기서 이어집니다.',
    action: '사진과 후기 남기기',
  },
}

export default function QuantumParticipationCommandCenter({
  participation,
  applicantStats,
  placement = 'home',
  onCancel,
  cancelling = false,
}: Props) {
  const lifecycle = isQuantumEventLifecycle(participation) ? participation : null
  const stage = lifecycle ? deriveQuantumEventLifecycleStage(lifecycle) : 'recruiting'
  const event = getQuantumEventById(participation.event_id)
  if (!event) return null

  const photo = quantumEventPhotos[event.kind]
  const copy = stage === 'cancelled'
    ? getCancelledCopy(lifecycle?.cancel_reason)
    : stateCopy[stage]
  const total = lifecycle?.participant_counts.total
    ?? applicantStats?.waiting_accounts
    ?? 1
  const required = lifecycle?.participant_counts.required_total ?? event.totalPeople
  const progress = Math.min(100, Math.max(8, Math.round((total / required) * 100)))
  const actionHref = getActionHref(participation, lifecycle, stage)
  const statusIcon = getStatusIcon(stage)
  const StatusIcon = statusIcon

  return (
    <section
      aria-live="polite"
      aria-label="내 약속 진행 상태"
      data-lifecycle-stage={stage}
      className={`overflow-hidden rounded-lg border border-[#147A70]/20 bg-white shadow-[0_16px_40px_rgba(18,24,33,0.12)] ${placement === 'match' ? 'mx-auto mb-5 w-full max-w-3xl' : ''}`}
    >
      <div className="grid sm:grid-cols-[220px_1fr]">
        <div className="relative min-h-[176px] overflow-hidden bg-[#121821] sm:min-h-[240px]">
          <Image
            src={photo.src}
            alt={photo.alt}
            fill
            priority={placement === 'home' || placement === 'preview'}
            sizes="(min-width: 640px) 220px, 100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-[#121821]/38" aria-hidden="true" />
          <div className="absolute inset-x-0 bottom-0 p-4 text-white">
            <p className="text-[11px] font-black text-[#F3B95F]">{copy.eyebrow}</p>
            <p className="mt-1 text-xl font-black leading-tight">{event.title}</p>
            <p className="mt-1 text-xs font-bold text-white/78">
              {lifecycle ? formatDateTime(lifecycle.starts_at) : event.schedule}
            </p>
          </div>
        </div>

        <div className="flex min-w-0 flex-col p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${getIconClass(stage)}`}>
              <StatusIcon size={20} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-black text-boot-primary">내 약속 현황</p>
              <h2 className="mt-1 text-lg font-black leading-snug text-boot-ink">{copy.title}</h2>
            </div>
          </div>

          <p className="mt-3 text-sm font-bold leading-6 text-boot-muted">{copy.body}</p>

          {stage === 'recruiting' ? (
            <div className="mt-4 border-y border-boot-hairline py-3">
              {lifecycle ? (
                <div className="mb-3 flex items-center justify-between gap-3 rounded-md bg-[#EAF7F5] px-3 py-2">
                  <span className="text-sm font-black text-[#126B63]">{lifecycle.room_label} 편성 중</span>
                  <span className="text-xs font-black text-[#476C68]">남 {lifecycle.participant_counts.male} · 여 {lifecycle.participant_counts.female}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-3 text-xs font-black">
                <span className="inline-flex items-center gap-1.5 text-boot-body">
                  <UsersRound size={15} aria-hidden="true" /> 현재 {total}명
                </span>
                <span className="text-boot-primary">목표 {required}명</span>
              </div>
              <div
                className="mt-2 h-2 overflow-hidden rounded-full bg-[#E8EEEC]"
                role="progressbar"
                aria-label="모집 진행"
                aria-valuemin={0}
                aria-valuemax={required}
                aria-valuenow={Math.min(total, required)}
                aria-valuetext={`${total}명 중 목표 ${required}명`}
              >
                <div className="h-full rounded-full bg-[#16A69A] transition-[width]" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-2 text-[11px] font-bold text-boot-muted">
                {participation.party_type === 'friends'
                  ? `${lifecycle?.party_members.length || 2}명이 친구 팀으로 함께 기다리고 있어요.`
                  : '혼자 신청으로 접수됐어요. 맞는 팀을 편성하고 있어요.'}
              </p>
            </div>
          ) : null}

          {lifecycle && stage !== 'recruiting' && stage !== 'cancelled' ? (
            <div className="mt-4 grid gap-2 border-y border-boot-hairline py-3 text-xs font-bold text-boot-body sm:grid-cols-2">
              <span className="inline-flex items-center gap-2"><CalendarClock size={15} className="text-boot-primary" />{formatDateTime(lifecycle.starts_at)}</span>
              <span className="inline-flex items-center gap-2"><MapPin size={15} className="text-[#E65D4D]" />{lifecycle.location_name || '장소 확정 중'}</span>
              {stage === 'confirmed' ? (
                <span className="inline-flex items-center gap-2 sm:col-span-2"><Clock3 size={15} className="text-[#D58A18]" />채팅 {formatDateTime(lifecycle.chat_opens_at)} 오픈</span>
              ) : null}
            </div>
          ) : null}

          {lifecycle?.party_members.length ? (
            <div className="mt-3 flex items-center gap-2" aria-label="같이 참여하는 친구">
              <div className="flex -space-x-2">
                {lifecycle.party_members.slice(0, 3).map((member) => (
                  <span key={member.user_id} title={member.display_name} className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-[#EAF7F5] text-xs font-black text-[#147A70]">
                    {member.display_name.slice(0, 1)}
                  </span>
                ))}
              </div>
              <p className="text-xs font-black text-boot-body">{getPartyMemberCopy(stage)}</p>
            </div>
          ) : null}

          <Link
            href={actionHref}
            className={`mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-black text-white transition-transform active:scale-[0.98] sm:mt-auto ${stage === 'cancelled' ? 'bg-[#E65D4D]' : 'bg-boot-primary'}`}
          >
            {stage === 'chat_open' ? <MessageCircle size={17} aria-hidden="true" /> : null}
            {stage === 'completed' ? <Star size={17} aria-hidden="true" /> : null}
            {copy.action} <ArrowRight size={17} aria-hidden="true" />
          </Link>
          {stage === 'recruiting' && onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              disabled={cancelling}
              className="mt-2 min-h-11 w-full rounded-md border border-[#d6e2df] bg-white px-4 text-xs font-black text-[#607875] hover:bg-[#f4f8f7] disabled:opacity-50"
            >
              {cancelling ? '취소 처리 중' : '이 약속 참여 취소'}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function getActionHref(
  participation: QuantumEventParticipation | QuantumEventLifecycle,
  lifecycle: QuantumEventLifecycle | null,
  stage: QuantumEventLifecycleStage,
) {
  if (stage === 'cancelled') return '/match?choose=another'
  if (lifecycle?.match_id) {
    const matchId = encodeURIComponent(lifecycle.match_id)
    if (stage === 'chat_open') return `/match/${matchId}/chat`
  }
  return `/match/events/${encodeURIComponent(participation.event_id)}?party=${participation.party_type}`
}

function getCancelledCopy(cancelReason: string | null | undefined) {
  if (cancelReason === 'user_cancelled') {
    return {
      eyebrow: '참여 취소됨',
      title: '요청한 대로 참여를 취소했어요',
      body: '일정 시간이 지나서 취소된 것이 아니에요. 같은 약속이나 다른 약속을 다시 고를 수 있어요.',
      action: '다른 약속 고르기',
    }
  }

  return stateCopy.cancelled
}

function getStatusIcon(stage: QuantumEventLifecycleStage) {
  if (stage === 'cancelled') return CircleAlert
  if (stage === 'chat_open') return MessageCircle
  if (stage === 'completed') return Star
  if (stage === 'confirmed' || stage === 'in_progress') return CheckCircle2
  return UsersRound
}

function getIconClass(stage: QuantumEventLifecycleStage) {
  if (stage === 'cancelled') return 'bg-[#FFF0ED] text-[#D84F40]'
  if (stage === 'confirmed' || stage === 'chat_open') return 'bg-[#FFF4DA] text-[#A96B0A]'
  if (stage === 'completed') return 'bg-[#EEF3FF] text-[#4366B0]'
  return 'bg-[#EAF7F5] text-[#147A70]'
}

function getPartyMemberCopy(stage: QuantumEventLifecycleStage) {
  if (stage === 'cancelled') return '이전에 함께 신청한 친구'
  if (stage === 'completed') return '오늘 함께한 친구'
  return '친구와 함께 참여 중'
}

function formatDateTime(value: string) {
  const koreaTime = new Date(Date.parse(value) + (9 * 60 * 60 * 1000))
  const weekdays = ['일', '월', '화', '수', '목', '금', '토']
  const month = koreaTime.getUTCMonth() + 1
  const day = koreaTime.getUTCDate()
  const weekday = weekdays[koreaTime.getUTCDay()]
  const hour = String(koreaTime.getUTCHours()).padStart(2, '0')
  const minute = String(koreaTime.getUTCMinutes()).padStart(2, '0')
  return `${month}. ${day}. (${weekday}) ${hour}:${minute}`
}

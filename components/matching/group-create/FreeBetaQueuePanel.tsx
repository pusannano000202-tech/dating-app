import Link from 'next/link'
import {
  CalendarClock,
  CheckCircle2,
  HeartHandshake,
  Radar,
  SlidersHorizontal,
  StickyNote,
  UserRoundCheck,
  Wallet,
} from 'lucide-react'

import type { MatchSetupStatus } from '@/lib/matching/match-setup-status'
import type { DepositSummary } from './types'

type FreeBetaQueuePanelProps = {
  saving: boolean
  canEnterQueue: boolean
  isLeader: boolean
  requiredMemberCount: number
  membersLength: number
  needsSetupCount: number
  currentUserSetupStatus: MatchSetupStatus
  currentUserSetupReady: boolean
  currentUserCardReady: boolean
  myDepositPaid: boolean
  depositSummary: DepositSummary | null
  groupStats: Array<{ label: string; value: string }>
  onConfirmParticipation: () => void
  onEnterQueue: () => void
}

export function FreeBetaQueuePanel({
  saving,
  canEnterQueue,
  isLeader,
  requiredMemberCount,
  membersLength,
  needsSetupCount,
  currentUserSetupStatus,
  currentUserSetupReady,
  currentUserCardReady,
  myDepositPaid,
  depositSummary,
  groupStats,
  onConfirmParticipation,
  onEnterQueue,
}: FreeBetaQueuePanelProps) {
  const groupIsFull = membersLength >= requiredMemberCount
  const allMembersReady = needsSetupCount === 0
  const missingMembers = Math.max(0, requiredMemberCount - membersLength)
  const setupSteps = [
    {
      key: 'personality',
      label: '성향 선호',
      desc: '어떤 성향의 상대와 편한지',
      done: currentUserSetupStatus.personality,
      href: '/profile/personality-preference?redirect=%2Fmatch%2Fstart',
      Icon: HeartHandshake,
    },
    {
      key: 'schedule',
      label: '안 되는 시간',
      desc: '이번 주 절대 안 되는 시간',
      done: currentUserSetupStatus.schedule,
      href: '/profile/schedule?redirect=%2Fmatch%2Fstart',
      Icon: CalendarClock,
    },
    {
      key: 'preferences',
      label: '매칭 비중',
      desc: '외모, 성격, 키, 체형 비율',
      done: currentUserSetupStatus.preferences,
      href: '/profile/preferences?redirect=%2Fmatch%2Fstart',
      Icon: SlidersHorizontal,
    },
    {
      key: 'match-card',
      label: '사전 카드 초안',
      desc: '하루 한 장 카드 초안',
      done: currentUserCardReady,
      href: '/profile/match-card?redirect=%2Fmatch%2Fstart',
      Icon: StickyNote,
    },
  ]
  const nextSetupStep = setupSteps.find((step) => !step.done)
  const requirements = [
    {
      label: '내 매칭 설정',
      desc: currentUserSetupReady
        ? '성향 선호, 안 되는 시간, 매칭 비중, 사전 카드 초안 완료'
        : `${nextSetupStep?.label ?? '매칭 설정'}부터 완료하면 돼요`,
      done: currentUserSetupReady,
      href: nextSetupStep?.href ?? '/match/start',
      cta: nextSetupStep ? `${nextSetupStep.label} 하기` : '입력하러 가기',
    },
    {
      label: `${requiredMemberCount}명 그룹 완성`,
      desc: groupIsFull
        ? '그룹 정원이 모두 채워졌어요'
        : `친구 ${missingMembers}명이 더 들어와야 해요`,
      done: groupIsFull,
      href: '/friends',
      cta: '친구 초대',
    },
    {
      label: '그룹원 매칭 준비',
      desc: allMembersReady
        ? '모든 멤버가 매칭 설정을 끝냈어요'
        : `${needsSetupCount}명이 성향/시간/비중 입력을 끝내야 해요`,
      done: allMembersReady,
      href: '/match/start',
      cta: '내 설정 보기',
    },
    {
      label: '리더 큐 진입',
      desc: isLeader ? '리더가 큐에 넣고 임시 매칭을 기다려요' : '리더만 큐 진입 버튼을 누를 수 있어요',
      done: isLeader,
    },
  ]

  return (
    <>
      <section className="glass mb-5 rounded-3xl p-4">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-rose-400/20 bg-rose-500/10">
            <CalendarClock size={18} className="text-boot-coral" />
          </div>
          <div>
            <h2 className="text-sm font-black">이번 주 매칭 큐</h2>
            <p className="text-xs text-boot-muted">
              그룹 준비가 끝나면 큐에 들어가고, 임시 매칭 후 카드와 보증금 결제로 확정합니다.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {groupStats.map((stat) => (
            <div key={stat.label} className="rounded-2xl bg-white/80 px-3 py-3">
              <p className="text-lg font-black">{stat.value}</p>
              <p className="mt-1 text-[10px] leading-snug text-boot-muted">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-5 rounded-3xl border border-boot-primary/15 bg-white/90 p-4 shadow-sm">
        <div className="mb-3 flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-boot-soft text-boot-primary">
            <UserRoundCheck size={18} />
          </div>
          <div>
            <h2 className="text-sm font-black">매칭찾기 버튼이 켜지는 조건</h2>
            <p className="mt-0.5 text-xs leading-5 text-boot-muted">
              아래 항목을 순서대로 끝내면 이번 주 매칭 큐에 들어갈 수 있어요.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="rounded-2xl border border-boot-hairline bg-boot-soft/50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-black text-boot-ink">내가 먼저 끝낼 4단계</p>
              <p className="text-[11px] font-bold text-boot-muted">
                {setupSteps.filter((step) => step.done).length}/{setupSteps.length}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {setupSteps.map((step) => {
                const StepIcon = step.Icon
                return (
                  <Link
                    key={step.key}
                    href={step.href}
                    className={[
                      'min-h-[86px] rounded-2xl border px-2.5 py-3 text-center transition-colors',
                      step.done
                        ? 'border-emerald-300/30 bg-emerald-50 text-emerald-800'
                        : 'border-boot-hairline bg-white text-boot-body hover:border-boot-primary/30 hover:text-boot-primary',
                    ].join(' ')}
                  >
                    <span className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-sm">
                      {step.done ? <CheckCircle2 size={16} strokeWidth={2.7} /> : <StepIcon size={16} />}
                    </span>
                    <span className="block text-[11px] font-black">{step.label}</span>
                    <span className="mt-1 block text-[10px] leading-4 text-boot-muted">{step.desc}</span>
                  </Link>
                )
              })}
            </div>
          </div>

          {requirements.map((item) => (
            <div
              key={item.label}
              className={[
                'flex items-center gap-3 rounded-2xl border px-3 py-3',
                item.done
                  ? 'border-emerald-300/30 bg-emerald-50'
                  : 'border-boot-hairline bg-white',
              ].join(' ')}
            >
              <CheckCircle2
                size={17}
                className={item.done ? 'text-emerald-700' : 'text-boot-muted'}
                strokeWidth={2.5}
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black text-boot-ink">{item.label}</p>
                <p className="mt-0.5 text-[11px] leading-4 text-boot-muted">{item.desc}</p>
              </div>
              {!item.done && item.href && (
                <Link
                  href={item.href}
                  className="flex-shrink-0 rounded-xl border border-boot-primary/20 bg-boot-soft px-3 py-2 text-[11px] font-bold text-boot-primary"
                >
                  {item.cta}
                </Link>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="mb-3 rounded-2xl border border-boot-hairline bg-white/80 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Wallet size={16} className={myDepositPaid ? 'text-emerald-700' : 'text-amber-700'} />
            <div>
              <p className="text-xs font-bold">보증금 결제</p>
              <p className="text-[11px] text-boot-muted">10,000원 보증금은 노쇼가 없으면 환불돼요.</p>
            </div>
          </div>
          {myDepositPaid ? (
            <span className="text-[11px] font-bold text-emerald-700">결제 확인</span>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={onConfirmParticipation}
              className="rounded-xl border border-boot-primary/25 bg-violet-400/15 px-3 py-2 text-xs font-bold text-boot-primary disabled:opacity-40"
            >
              결제 확인
            </button>
          )}
        </div>

        {depositSummary && depositSummary.total_active > 0 && (
          <div className="mt-3 border-t border-boot-hairline pt-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] text-boot-muted">그룹 전체</p>
              <p className="text-[11px] font-bold text-boot-muted">
                {depositSummary.paid_count}/{depositSummary.total_active}명 결제
              </p>
            </div>
            <div className="flex gap-1.5">
              {depositSummary.rows.map((row) => {
                const paid = row.deposit_status === 'paid' || row.deposit_status === 'held'
                return (
                  <div
                    key={row.user_id}
                    className={`min-w-0 flex-1 truncate rounded-lg px-2 py-1.5 text-center text-[10px] ${
                      paid
                        ? 'border border-emerald-400/20 bg-emerald-400/10 text-emerald-700'
                        : 'border border-boot-hairline bg-white/90 text-boot-muted'
                    }`}
                    title={row.display_name ?? row.user_id.slice(0, 8)}
                  >
                    {row.display_name ?? `친구 ${row.user_id.slice(0, 4)}`}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        disabled={saving || !canEnterQueue}
        onClick={onEnterQueue}
        className="btn-gradient flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Radar size={17} />
        이번 주 매칭 큐에 들어가기
      </button>

      {!canEnterQueue && (
        <p className="mt-3 text-center text-xs text-boot-muted">
          {!currentUserSetupReady
            ? '내 성향 선호, 안 되는 시간, 매칭 비중, 사전 카드 초안을 먼저 입력해 주세요.'
            : !groupIsFull
              ? `${requiredMemberCount}명 그룹이 완성되면 큐 진입 단계로 넘어갈 수 있어요.`
            : !isLeader
              ? '리더만 큐 진입을 시작할 수 있어요.'
              : needsSetupCount > 0
                ? '매칭 준비 항목(성향, 시간, 비중)을 아직 입력해야 하는 멤버가 있어요.'
                : '큐 진입 조건이 맞으면 버튼이 활성화됩니다.'}
        </p>
      )}
      {canEnterQueue && !myDepositPaid && (
        <p className="mt-3 text-center text-xs text-amber-700/80">
          큐 진입은 가능해요. 보증금 결제는 임시 매칭 후 확정 전에 반드시 끝내면 됩니다.
        </p>
      )}
      <p className="mt-2 text-center text-[10px] text-boot-muted">
        보증금 10,000원은 약속이 정상 진행되면 환불되고, 노쇼가 확정되면 환불이 제한됩니다.
      </p>
    </>
  )
}

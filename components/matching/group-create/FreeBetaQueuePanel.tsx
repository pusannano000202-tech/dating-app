import { CalendarClock, CreditCard, Wallet } from 'lucide-react'

import type { DepositSummary } from './types'

type FreeBetaQueuePanelProps = {
  saving: boolean
  canEnterQueue: boolean
  isLeader: boolean
  membersLength: number
  needsSetupCount: number
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
  membersLength,
  needsSetupCount,
  myDepositPaid,
  depositSummary,
  groupStats,
  onConfirmParticipation,
  onEnterQueue,
}: FreeBetaQueuePanelProps) {
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
              그룹 준비가 끝나면 무료 베타 참여 확인 후 큐에 들어갑니다.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {groupStats.map((stat) => (
            <div key={stat.label} className="rounded-2xl bg-white/80 px-3 py-3">
              <p className="text-lg font-black">{stat.value}</p>
              <p className="mt-1 text-[10px] leading-snug text-boot-muted">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="mb-3 rounded-2xl border border-boot-hairline bg-white/80 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Wallet size={16} className={myDepositPaid ? 'text-emerald-700' : 'text-amber-700'} />
            <div>
              <p className="text-xs font-bold">무료 베타 참여</p>
              <p className="text-[11px] text-boot-muted">현재는 결제 없이 참여 가능합니다.</p>
            </div>
          </div>
          {myDepositPaid ? (
            <span className="text-[11px] font-bold text-emerald-700">참여 확인</span>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={onConfirmParticipation}
              className="rounded-xl border border-boot-primary/25 bg-violet-400/15 px-3 py-2 text-xs font-bold text-boot-primary disabled:opacity-40"
            >
              참여 확인
            </button>
          )}
        </div>

        {depositSummary && depositSummary.total_active > 0 && (
          <div className="mt-3 border-t border-boot-hairline pt-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] text-boot-muted">그룹 전체</p>
              <p className="text-[11px] font-bold text-boot-muted">
                {depositSummary.paid_count}/{depositSummary.total_active}명 확인
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
        <CreditCard size={17} />
        이번 주 매칭 큐에 들어가기
      </button>

      {!canEnterQueue && (
        <p className="mt-3 text-center text-xs text-boot-muted">
          {membersLength < 2
            ? '친구 1명이 그룹에 참여하면 큐 진입 단계로 넘어갈 수 있어요.'
            : !isLeader
              ? '리더만 큐 진입을 시작할 수 있어요.'
              : needsSetupCount > 0
                ? '매칭 준비 항목(성향, 시간, 비중)을 아직 입력해야 하는 멤버가 있어요.'
                : '큐 진입 조건이 맞으면 버튼이 활성화됩니다.'}
        </p>
      )}
      {canEnterQueue && !myDepositPaid && (
        <p className="mt-3 text-center text-xs text-amber-700/80">
          무료 베타 참여 확인은 매칭 카드 작성 단계에서 한 번 더 확인됩니다.
        </p>
      )}
      <p className="mt-2 text-center text-[10px] text-boot-muted">
        현재는 전면 무료 베타입니다. 결제와 환불 정책은 사용자 확보 후 다시 열어둡니다.
      </p>
    </>
  )
}

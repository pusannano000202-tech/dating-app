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
      <section className="glass rounded-3xl p-4 mb-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-2xl bg-rose-500/10 border border-rose-400/20 flex items-center justify-center">
            <CalendarClock size={18} className="text-boot-coral" />
          </div>
          <div>
            <h2 className="text-sm font-black">이번 주 매칭 큐</h2>
            <p className="text-xs text-boot-muted">그룹이 완성되면 무료 베타 참여 확인 후 큐에 들어가요</p>
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

      <div className="rounded-2xl border border-boot-hairline bg-white/80 px-4 py-3 mb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Wallet size={16} className={myDepositPaid ? 'text-emerald-700' : 'text-amber-700'} />
            <div>
              <p className="text-xs font-bold">무료 베타 참여</p>
              <p className="text-[11px] text-boot-muted">현재 결제 없이 참여 가능</p>
            </div>
          </div>
          {myDepositPaid ? (
            <span className="text-[11px] font-bold text-emerald-700">참여 확인</span>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={onConfirmParticipation}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-violet-400/15 border border-boot-primary/25 text-boot-primary disabled:opacity-40"
            >
              참여 확인
            </button>
          )}
        </div>

        {depositSummary && depositSummary.total_active > 0 && (
          <div className="mt-3 pt-3 border-t border-boot-hairline">
            <div className="flex items-center justify-between mb-2">
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
                    className={`flex-1 min-w-0 px-2 py-1.5 rounded-lg text-[10px] truncate text-center ${
                      paid
                        ? 'bg-emerald-400/10 border border-emerald-400/20 text-emerald-700'
                        : 'bg-white/90 border border-boot-hairline text-boot-muted'
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
        className="btn-gradient w-full py-4 rounded-2xl font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
                ? '매칭 준비 항목(성향·시간·비중) 입력이 필요한 멤버가 있어요.'
                : '큐 진입 조건을 만족하면 버튼이 활성화돼요.'}
        </p>
      )}
      {canEnterQueue && !myDepositPaid && (
        <p className="mt-3 text-center text-xs text-amber-700/80">
          무료 베타 참여 확인은 가매칭 후 카드 작성 단계에서 진행해요.
        </p>
      )}
      <p className="mt-2 text-center text-[10px] text-boot-muted">
        현재는 무료 베타예요. 결제/환불 정책은 사용자 확보 후 다시 열어둘게요.
      </p>
    </>
  )
}

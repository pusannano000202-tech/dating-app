import { CheckCircle2, CreditCard, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'

type DepositPaymentPanelProps = {
  amount: number
  paidCount: number
  totalCount: number
  saving: boolean
  disabled?: boolean
  onPay: () => void
}

export default function DepositPaymentPanel({
  amount,
  paidCount,
  totalCount,
  saving,
  disabled = false,
  onPay,
}: DepositPaymentPanelProps) {
  const provider = (process.env.NEXT_PUBLIC_PAYMENT_PROVIDER || 'mock').toLowerCase()
  const tossClientReady = Boolean(process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY)
  const paid = totalCount > 0 && paidCount >= totalCount
  const isToss = provider === 'toss'
  const providerLabel = isToss ? 'Toss sandbox' : '로컬 mock'
  const providerTone = isToss && tossClientReady ? '준비됨' : isToss ? '키 설정 필요' : '검토용'

  return (
    <section className="mt-4 overflow-hidden rounded-[30px] border border-boot-primary/15 bg-white shadow-[0_18px_42px_rgba(23,20,18,0.08)]">
      <div className="bg-[radial-gradient(circle_at_18%_8%,rgba(255,90,111,0.18),transparent_30%),linear-gradient(135deg,#fff,#fff7f8)] px-5 py-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-boot-primary">
              Deposit
            </p>
            <h3 className="mt-2 text-xl font-black text-boot-ink">보증금으로 매칭 확정하기</h3>
            <p className="mt-2 text-xs leading-relaxed text-boot-muted">
              노쇼를 막기 위한 1인 보증금이에요. 정상 만남이 끝나면 환불 단계로 넘어갑니다.
            </p>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-boot-ink text-white shadow-[0_12px_28px_rgba(23,20,18,0.22)]">
            <CreditCard size={20} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <InfoTile label="보증금" value={`${amount.toLocaleString('ko-KR')}원`} />
          <InfoTile label="그룹 결제" value={`${paidCount}/${totalCount}명`} />
        </div>

        <div className="mt-3 rounded-2xl border border-boot-hairline bg-white/80 px-3 py-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-black text-boot-ink">{providerLabel}</span>
            <span className="rounded-full bg-boot-soft px-2 py-1 text-[10px] font-black text-boot-primary">
              {providerTone}
            </span>
          </div>
          <p className="text-[11px] leading-relaxed text-boot-muted">
            {isToss
              ? '공개 키는 브라우저에서 확인하고, 비밀 키와 환불용 내부 키는 서버에서만 확인합니다.'
              : '지금은 실제 돈이 나가지 않는 로컬 검토 모드예요. Toss sandbox 키가 들어오면 같은 버튼에서 결제창으로 이어집니다.'}
          </p>
        </div>
      </div>

      <div className="space-y-3 px-5 py-4">
        <StepRow
          icon={<ShieldCheck size={15} />}
          title="결제 후 공개"
          desc="상대팀 이름, 자세한 약속 정보, 연락처는 확정 단계에서 순서대로 열려요."
          done={paid}
        />
        <StepRow
          icon={<LockKeyhole size={15} />}
          title="환불 기준 분리"
          desc="보증금, 앱 기여금, 환불 예정 금액은 만남 후 정산 화면에서 따로 보여줍니다."
          done={false}
        />

        <button
          type="button"
          onClick={onPay}
          disabled={saving || paid || disabled}
          className="mt-2 flex h-14 w-full items-center justify-center gap-2 rounded-[24px] bg-boot-ink px-4 text-sm font-black text-white shadow-[0_16px_34px_rgba(23,20,18,0.22)] transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-45"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : paid ? <CheckCircle2 size={16} /> : <CreditCard size={16} />}
          {paid ? '우리 그룹 보증금 완료' : isToss ? 'Toss sandbox 결제하기' : '로컬 mock 결제하기'}
        </button>
      </div>
    </section>
  )
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white px-3 py-3 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-boot-muted">{label}</p>
      <p className="mt-1 text-base font-black text-boot-ink">{value}</p>
    </div>
  )
}

function StepRow({
  icon,
  title,
  desc,
  done,
}: {
  icon: ReactNode
  title: string
  desc: string
  done: boolean
}) {
  return (
    <div className="flex items-start gap-3">
      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl border ${
        done
          ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-700'
          : 'border-boot-primary/15 bg-boot-soft text-boot-primary'
      }`}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-black text-boot-ink">{title}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-boot-muted">{desc}</p>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { Info, X } from 'lucide-react'

export default function HomeInfoButton() {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-10 w-10 items-center justify-center rounded-2xl border border-boot-hairline bg-white/90 text-boot-body shadow-sm transition hover:border-boot-primary/30 hover:text-boot-primary"
        aria-label="앱 사용법 보기"
        aria-expanded={open}
      >
        {open ? <X size={17} /> : <Info size={18} />}
      </button>

      {open && (
        <section className="absolute right-0 top-12 z-30 w-[min(20rem,calc(100vw-2.5rem))] rounded-[28px] border border-boot-primary/15 bg-white p-4 text-left shadow-xl">
          <p className="text-xs font-black uppercase tracking-normal text-boot-primary">How it works</p>
          <h2 className="mt-1 text-lg font-black text-boot-ink">부팅은 기존 과팅이랑 이렇게 달라요</h2>
          <p className="mt-1 text-xs leading-5 text-boot-muted">
            홈에서는 다음 행동만 보고, 상대 카드와 큐 숫자는 매칭 찾기 이후 매칭 화면에서 확인해요.
          </p>
          <div className="mt-3 space-y-2">
            <InfoRow index={1} title="친구와 그룹 만들기" desc="닉네임으로 친구를 찾거나 초대 링크로 같이 과팅할 멤버를 모아요." />
            <InfoRow index={2} title="혼성 그룹도 가능" desc="남녀가 섞인 그룹도 참여할 수 있고, 통계는 대표 성별 기준으로 보여줘요." />
            <InfoRow index={3} title="프로필 비공개 자동 매칭" desc="성향, 시간, 비중이 맞을 때 상대 카드와 약속 정보가 단계별로 열려요." />
            <InfoRow index={4} title="보증금은 노쇼 방지" desc="초기 정책은 10,000원 보증금 기준이고, 정상 진행 시 환불되는 방향이에요." />
          </div>
        </section>
      )}
    </div>
  )
}

function InfoRow({ index, title, desc }: { index: number; title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-boot-hairline bg-boot-soft/45 px-3 py-2.5">
      <div className="flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-black text-boot-primary">
          {index}
        </span>
        <span>
          <span className="block text-xs font-black text-boot-ink">{title}</span>
          <span className="mt-0.5 block text-xs leading-5 text-boot-muted">{desc}</span>
        </span>
      </div>
    </div>
  )
}

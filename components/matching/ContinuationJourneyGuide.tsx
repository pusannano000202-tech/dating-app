'use client'

import { useState } from 'react'
import ContinuationContentGuide from '@/components/matching/ContinuationContentGuide'
import { getContinuationDayDefinitions } from '@/lib/matching/five-meeting-content'

/** Informational discovery only. Participation remains behind the real source/consent flow. */
export default function ContinuationJourneyGuide() {
  const [open, setOpen] = useState(false)
  const [programDay, setProgramDay] = useState(1)

  return (
    <section className="mx-auto mt-5 max-w-3xl overflow-hidden rounded-3xl border border-boot-hairline bg-white">
      <button type="button" aria-expanded={open} aria-controls="continuation-journey-guide" onClick={() => setOpen((value) => !value)} className="flex min-h-14 w-full items-center justify-between gap-3 px-5 py-4 text-left font-black focus-visible:outline-2 focus-visible:outline-boot-primary">
        <span><span className="block text-xs text-boot-primary">첫 만남이 좋았다면</span><span className="mt-1 block">이어 만나는 5일 코스 알아보기</span></span>
        <span aria-hidden="true" className="text-xl text-boot-primary">{open ? '−' : '+'}</span>
      </button>
      {open ? <div id="continuation-journey-guide" className="border-t border-boot-hairline p-4 sm:p-5">
        <p className="text-sm font-bold leading-6 text-boot-body">같은 사람들과 더 만나고 싶을 때 이어가는 코스예요. 보드게임으로 처음 만났다면 Day 2부터, 다른 활동으로 만났다면 Day 1부터 시작해요.</p>
        <p className="mt-2 text-xs font-bold leading-5 text-boot-muted">코스 안내이며 신청·확정 일정이 아니에요. 실제 만남을 마친 뒤 동의·비용 안내와 결제·다음 일정 확인을 거쳐 참여해요. 첫 활동을 포함해 실제 만남은 총 5회 또는 6회예요.</p>
        <div role="group" aria-label="5일 코스 안내 선택" className="my-4 grid grid-cols-5 gap-1.5">
          {getContinuationDayDefinitions().map((day) => <button key={day.day} type="button" aria-pressed={programDay === day.day} onClick={() => setProgramDay(day.day)} className={`min-h-11 rounded-xl border px-1 text-xs font-black focus-visible:outline-2 focus-visible:outline-boot-primary ${programDay === day.day ? 'border-boot-primary bg-boot-primary text-white' : 'border-boot-hairline text-boot-body'}`}>Day {day.day}</button>)}
        </div>
        <ContinuationContentGuide key={programDay} programDay={programDay} />
      </div> : null}
    </section>
  )
}

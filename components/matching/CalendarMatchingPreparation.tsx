'use client'

import { useHistoryAccount } from '@/components/content-history/useHistoryAccount'
import AppearanceScoreGate from './AppearanceScoreGate'
import CalendarReadinessGate, { useCalendarReadiness } from './CalendarReadinessGate'
import { CALENDAR_PREPARATION_PATH } from './calendar-readiness'
import Link from 'next/link'
import TonightPreparationGate from '@/components/tonight/TonightPreparationGate'

export default function CalendarMatchingPreparation({ expectedOwner, context = 'calendar', returnTo = '/tonight' }: {
  expectedOwner: string
  context?: 'calendar' | 'tonight'
  returnTo?: '/tonight' | '/tonight/invite/resume'
}) {
  const currentOwner = useHistoryAccount()
  const sameAccount = currentOwner === expectedOwner
  const readiness = useCalendarReadiness(true, sameAccount ? expectedOwner : null)
  const title = context === 'tonight' ? '오늘밤 참가 준비' : '달력 참가 준비'
  const returnLabel = context === 'tonight' ? '기존 오늘밤 탭' : '기존 행사 탭'

  if (sameAccount && readiness.value.status === 'missing' && readiness.value.profileHref === CALENDAR_PREPARATION_PATH) {
    return <AppearanceScoreGate expectedOwner={expectedOwner}
      eventTitle={title} eventMeta={`준비를 마친 뒤 ${returnLabel}으로 돌아가 주세요.`}
      onPrepared={async () => { await readiness.check() }} />
  }

  return <main className="mx-auto min-h-screen max-w-md px-5 pb-28 pt-10 text-boot-ink">
    <h1 className="text-2xl font-black">{title}</h1>
    {currentOwner === undefined ? <p className="mt-5 leading-7" role="status">로그인 계정을 확인하고 있어요.</p>
      : !sameAccount ? <p className="mt-5 leading-7" role="status">{returnLabel}과 같은 계정으로 로그인한 뒤 이 화면을 새로고침해 주세요.</p>
        : readiness.value.status === 'ready' ? <div className="mt-5 leading-7" role="status">
          <p>참가 준비가 끝났어요. {returnLabel}으로 돌아가 주세요.</p>
          <p className="mt-2 text-sm text-boot-muted">{context === 'tonight' ? '오늘밤에서 신청을 이어갈 수 있어요.' : '선택한 날짜에서 신청을 이어갈 수 있어요.'} 준비만으로 신청이나 결제가 진행되지는 않아요.</p>
          {context === 'tonight' && <Link href={returnTo} className="mt-5 inline-flex min-h-12 items-center rounded-xl bg-boot-primary px-5 font-bold text-white">{returnTo === '/tonight/invite/resume' ? '받은 초대로 돌아가기' : '오늘밤으로 돌아가기'}</Link>}
        </div> : <div className="mt-5">{context === 'tonight'
          ? <TonightPreparationGate value={readiness.value} onRetry={readiness.check} direct />
          : <CalendarReadinessGate value={readiness.value} onRetry={readiness.check} />}</div>}
  </main>
}

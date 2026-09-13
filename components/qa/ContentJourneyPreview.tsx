'use client'

import Link from 'next/link'
import { useState } from 'react'
import LiveActivityGuide from '@/components/meetups/LiveActivityGuide'
import { featuredMeetupIdeas } from '@/lib/community/catalog'

/** Development-only visual harness; no auth bypass, live members or API mutations. */
export default function ContentJourneyPreview() {
  const [key, setKey] = useState('campus-cafe-chat')
  const [notice, setNotice] = useState('')
  const activity = featuredMeetupIdeas.find(item => item.id === key)!
  return <main className="mx-auto max-w-3xl px-4 pb-28 pt-5">
    <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6"><strong>로컬 UI 검수 · 예시 상태</strong><p>실제 참가·출석·저장은 일어나지 않아요. 활동 안내 컴포넌트의 화면과 버튼을 확인하는 곳입니다.</p></div>
    <nav className="mb-5 flex flex-wrap gap-3"><Link className="min-h-11 rounded-full border px-4 py-3" href="/community/content">취향 콘텐츠</Link><Link className="min-h-11 rounded-full border px-4 py-3" href="/community/stories">이야기</Link><Link className="min-h-11 rounded-full border px-4 py-3" href="/community/voice">보이스</Link></nav>
    <label htmlFor="preview-activity" className="mb-2 block font-bold">활동별 진행 내용</label>
    <select id="preview-activity" value={key} onChange={event => { setKey(event.target.value); setNotice('') }} className="mb-5 min-h-12 w-full rounded-xl border border-boot-hairline bg-white px-3">{featuredMeetupIdeas.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
    <LiveActivityGuide key={key} guide={{ server_now:'2026-09-09T11:00:00Z', category:activity.category, activity_key:key, lifecycle_status:'open', scheduled_at:'2026-09-09T10:00:00Z', ends_at:null, shared_step:'activity', personal_acknowledged_step:null, meetup_revision:1, personal_revision:0, is_host:false }} busy={false} onAction={() => setNotice('버튼 작동을 확인했어요. 예시 화면에서는 실제 모임 상태를 변경하지 않아요.')}/>
    <p role="status" className="mt-4 text-sm font-bold text-boot-primary">{notice}</p>
  </main>
}

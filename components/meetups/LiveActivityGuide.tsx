'use client'

import { ChevronLeft, ChevronRight, Clock3, HelpCircle, PauseCircle } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useMemo, useState } from 'react'

import DalmutiRulesGuide from '@/components/matching/DalmutiRulesGuide'
import ActivityPromptDeck from './ActivityPromptDeck'
import type { MeetupCategory } from '@/lib/community/contracts'
import { getMeetupGuideTemplate } from '@/lib/meetups/guide-catalog'
import { resolveMeetupGuideView, type ActiveMeetupGuideSceneId, type MeetupGuideActionKind, type MeetupLifecycleStatus } from '@/lib/meetups/guide-contract'

export type LiveMeetupGuideDto = {
  server_now: string
  category: MeetupCategory
  activity_key: string | null
  lifecycle_status: MeetupLifecycleStatus
  scheduled_at: string | null
  schedule_status?: 'confirmed' | 'schedule_pending'
  ends_at: string | null
  shared_step: ActiveMeetupGuideSceneId | null
  personal_acknowledged_step: ActiveMeetupGuideSceneId | null
  meetup_revision: number
  personal_revision: number
  is_host: boolean
}

export default function LiveActivityGuide({
  guide,
  busy,
  onAction,
}: {
  guide: LiveMeetupGuideDto
  busy: boolean
  onAction: (action: MeetupGuideActionKind | 'advance_shared', sceneId: ActiveMeetupGuideSceneId) => void
}) {
  const template = useMemo(() => getMeetupGuideTemplate(guide.activity_key, guide.category), [guide.activity_key, guide.category])
  const [preview, setPreview] = useState(false)
  const [previewIndex, setPreviewIndex] = useState(0)
  const actual = resolveMeetupGuideView({
    mode: 'actual',
    lifecycleStatus: guide.lifecycle_status,
    serverNow: guide.server_now,
    scheduledAt: guide.scheduled_at,
    endsAt: guide.ends_at,
    sharedStep: guide.shared_step,
    personalAcknowledgedStep: guide.personal_acknowledged_step,
    previewStep: null,
  })
  if (!preview && actual.currentSceneId === 'cancelled') {
    return (
      <section className="rounded-[12px] border border-boot-coral/25 bg-white p-5 shadow-sm" aria-labelledby="meetup-guide-title">
        <p className="text-[11px] font-black tracking-[0.14em] text-boot-coral">모임 상태 안내</p>
        <h2 id="meetup-guide-title" className="mt-1 text-xl font-black">모임이 취소됐어요</h2>
        <p className="mt-2 text-sm font-bold leading-6 text-boot-muted">새 진행 상태를 만들지 않고, 상세의 취소 기록과 읽기 전용 대화만 확인할 수 있어요.</p>
        <button type="button" onClick={() => setPreview(true)} className="mt-4 min-h-11 rounded-[8px] border border-boot-hairline px-3 text-sm font-black text-boot-muted">기존 안내 미리보기</button>
      </section>
    )
  }
  if (guide.schedule_status === 'schedule_pending' && (guide.lifecycle_status === 'open' || guide.lifecycle_status === 'full')) return <section className="rounded-[12px] border border-boot-hairline bg-white p-5"><h2 className="text-xl font-black">약속은 채팅에서 함께 정해요</h2><p className="mt-2 text-sm leading-6 text-boot-muted">참가자 채팅의 + 메뉴에서 날짜와 장소 후보를 투표로 모아요. 주최자가 약속을 확정하면 모임 진행 안내가 시작돼요.</p><button type="button" disabled={busy} onClick={()=>onAction('open_chat','prepare')} className="mt-4 min-h-11 rounded-[8px] bg-boot-primary px-4 text-sm font-black text-white">참가자 대화 열기</button></section>
  const scene = preview
    ? template.scenes[Math.min(previewIndex, template.scenes.length - 1)]
    : template.scenes.find((candidate) => candidate.id === actual.currentSceneId) ?? template.scenes[0]
  if (!scene) return null

  return (
    <section className="overflow-hidden rounded-[12px] border border-boot-hairline bg-white shadow-sm" aria-labelledby="meetup-guide-title">
      <div className="flex items-center justify-between gap-3 border-b border-boot-hairline px-4 py-3">
        <div>
          <p className="text-[11px] font-black tracking-[0.14em] text-boot-primary">{preview ? '전체 안내 미리보기' : '지금 할 일'}</p>
          <h2 id="meetup-guide-title" className="mt-1 text-lg font-black">{template.title}</h2>
        </div>
        <button type="button" onClick={() => setPreview((value) => !value)} className="min-h-10 rounded-[8px] border border-boot-hairline px-3 text-xs font-black text-boot-muted">
          {preview ? '현재 단계 보기' : '전체 안내 보기'}
        </button>
      </div>

      <Image src={scene.artwork.src} alt={scene.artwork.alt} width={1280} height={720} sizes="(min-width: 768px) 720px, 100vw" className="max-h-[360px] w-full bg-boot-soft object-contain" />
      <div className="p-4">
        <p className="text-xs font-black text-boot-primary">{preview ? `${previewIndex + 1} / ${template.scenes.length}` : '서버 진행 상태 기준'}</p>
        <h3 className="mt-1 text-xl font-black">{scene.title}</h3>
        <p className="mt-2 text-sm font-bold leading-6 text-boot-muted">{scene.body}</p>
        {!preview ? <p className="mt-2 text-xs font-bold leading-5 text-boot-muted">안내를 넘겨 보는 것만으로 출석·결제·공용 게임·모임 완료 상태는 바뀌지 않아요.</p> : null}

        {template.usesDalmutiRules && scene.id === 'activity' ? <div className="mt-4"><DalmutiRulesGuide /></div> : null}
        {['greet', 'start', 'activity'].includes(scene.id) ? <ActivityPromptDeck key={template.id} activityKey={guide.activity_key} category={guide.category}/> : null}
        {['wrap', 'next'].includes(scene.id) ? <aside className="mt-4 rounded-2xl bg-boot-soft p-4">
          <h4 className="font-black">좋았다면, 다음은 내 선택으로</h4>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Link href="/meetups" className="flex min-h-11 items-center justify-center rounded-xl border border-boot-hairline bg-white px-3 text-sm font-bold">다른 활동 둘러보기</Link>
            <Link href="/friends" className="flex min-h-11 items-center justify-center rounded-xl border border-boot-hairline bg-white px-3 text-sm font-bold">친구와 대화 이어가기</Link>
          </div>
          <p className="mt-3 text-xs leading-5 text-boot-muted">새 참가나 친구 연결이 자동으로 되지는 않아요. 친구는 요청과 수락으로 연결해요.</p>
        </aside> : null}

        {preview ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" disabled={previewIndex === 0} onClick={() => setPreviewIndex((value) => Math.max(0, value - 1))} className="min-h-11 rounded-[8px] border border-boot-hairline text-sm font-black disabled:opacity-40"><ChevronLeft className="mr-1 inline" size={16} />이전</button>
            <button type="button" disabled={previewIndex >= template.scenes.length - 1} onClick={() => setPreviewIndex((value) => Math.min(template.scenes.length - 1, value + 1))} className="min-h-11 rounded-[8px] bg-boot-primary text-sm font-black text-white disabled:opacity-40">다음<ChevronRight className="ml-1 inline" size={16} /></button>
          </div>
        ) : (
          <>
            <button type="button" disabled={busy} onClick={() => onAction(scene.primaryAction, scene.id)} className="mt-4 min-h-12 w-full rounded-[8px] bg-boot-primary px-4 text-sm font-black text-white disabled:opacity-50">
              {primaryActionLabel(scene.primaryAction)}
            </button>
            {guide.is_host && scene.id !== 'next' ? (
              <button type="button" disabled={busy} onClick={() => onAction('advance_shared', nextScene(scene.id))} className="mt-2 min-h-11 w-full rounded-[8px] border border-boot-primary/25 bg-white px-4 text-sm font-black text-boot-primary disabled:opacity-45">모두의 다음 단계로</button>
            ) : null}
            <div className="mt-4 grid grid-cols-3 gap-2" aria-label="개인 보조 행동">
              <button type="button" disabled={busy} onClick={() => onAction('report_late', scene.id)} className={secondaryButton}><Clock3 size={16} />늦었어요</button>
              <button type="button" disabled={busy} onClick={() => onAction('request_help', scene.id)} className={secondaryButton}><HelpCircle size={16} />도움 요청</button>
              <button type="button" disabled={busy} onClick={() => onAction('take_break', scene.id)} className={secondaryButton}><PauseCircle size={16} />잠깐 쉬기</button>
            </div>
          </>
        )}
      </div>
    </section>
  )
}

const secondaryButton = 'flex min-h-12 flex-col items-center justify-center gap-1 rounded-[8px] border border-boot-hairline bg-white px-1 text-[11px] font-black text-boot-muted disabled:opacity-45'

function primaryActionLabel(action: MeetupGuideActionKind) {
  return ({
    acknowledge: '이 단계 확인',
    open_chat: '참가자 대화 열기',
    open_map: '장소 확인',
    open_activity: '활동 안내 이어가기',
    report_late: '늦는다고 알리기',
    request_help: '도움 요청',
    take_break: '잠깐 쉬기',
  } as const)[action]
}

function nextScene(scene: ActiveMeetupGuideSceneId): ActiveMeetupGuideSceneId {
  const order: ActiveMeetupGuideSceneId[] = ['prepare', 'gather', 'greet', 'start', 'activity', 'wrap', 'next']
  return order[Math.min(order.length - 1, Math.max(0, order.indexOf(scene) + 1))]
}

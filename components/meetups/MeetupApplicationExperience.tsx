'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Loader2, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { isSupabaseConfigured } from '@/lib/utils'
import { featuredMeetupIdeas, getMeetupCategoryLabel } from '@/lib/community/catalog'
import type { MeetupCategory } from '@/lib/community/contracts'
import { parseAdmissionDepositQuote, type AdmissionDepositQuote } from '@/lib/meetups/admission-contract'
import MeetupApplicationFlow from './MeetupApplicationFlow'
import MeetupAdmissionStatus from './MeetupAdmissionStatus'
import {useAdmissionCheckout} from './useAdmissionCheckout'
import {NEW_ADMISSION_DEPOSIT_KRW} from '@/lib/meetups/admission-deposit-policy'

type Context = {
  accountKey: string
  room: { kind: 'custom_meetup'; id: string }
  quote: AdmissionDepositQuote | null
  policy: { summary: string; conditions: string[] } | null
  checkoutEnabled: false
  meetup: { id: string; title: string; category: MeetupCategory; activity_key: string | null; description: string; scheduled_at: string | null; place_name: string | null; member_count: number; capacity: number }
}

export default function MeetupApplicationExperience({ meetupId }: { meetupId: string }) {
  return <MeetupAdmissionStatus meetupId={meetupId}><NewMeetupApplication meetupId={meetupId}/></MeetupAdmissionStatus>
}

function NewMeetupApplication({ meetupId }: { meetupId: string }) {
  const router = useRouter()
  const [context, setContext] = useState<Context | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const generation = useRef(0)
  const request = useRef<AbortController | null>(null)
  const account = useRef<string | null | undefined>(undefined)
  const checkout=useAdmissionCheckout({kind:'custom_meetup',id:meetupId},context?.accountKey??null)
  const load = useCallback(async () => {
    request.current?.abort()
    const controller = new AbortController(), ticket = ++generation.current
    request.current = controller
    setLoading(true); setError(''); setContext(null)
    const timer = setTimeout(() => controller.abort(), 12000)
    try {
      const response = await fetch(`/api/meetups/${encodeURIComponent(meetupId)}/application`, { cache: 'no-store', signal: controller.signal })
      const data = await response.json()
      if (controller.signal.aborted || ticket !== generation.current) return
      if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'unavailable')
      if (!data || data.room?.id !== meetupId || data.room?.kind !== 'custom_meetup' || data.meetup?.id !== meetupId
        || typeof data.accountKey !== 'string' || typeof data.meetup.title !== 'string' || data.checkoutEnabled !== false) throw new Error('unavailable')
      const quote = data.quote === null ? null : parseAdmissionDepositQuote(data.quote)
      if (data.quote !== null && !quote) throw new Error('unavailable')
      if (quote && (!data.policy || typeof data.policy.summary !== 'string' || !Array.isArray(data.policy.conditions) || !data.policy.conditions.every((value: unknown) => typeof value === 'string'))) throw new Error('unavailable')
      setContext({ ...data, quote })
    } catch (cause) {
      if (ticket !== generation.current) return
      setError(cause instanceof Error ? cause.message : 'unavailable')
    } finally {
      clearTimeout(timer)
      if (ticket === generation.current) { setLoading(false); request.current = null }
    }
  }, [meetupId])
  useEffect(() => {
    void load()
    const client = isSupabaseConfigured() ? createClient() : null
    let disposed = false
    const subscription = client?.auth.onAuthStateChange((_event, session) => {
      const nextAccount = session?.user.id ?? null
      if (account.current === nextAccount) return
      account.current = nextAccount
      // Immediately hide the prior account's context; late reads cannot restore it.
      ++generation.current; request.current?.abort(); setContext(null)
      queueMicrotask(() => { if (!disposed) void load() })
    }).data.subscription
    return () => { disposed = true; ++generation.current; request.current?.abort(); subscription?.unsubscribe() }
  }, [load])

  const backHref = `/meetups/${encodeURIComponent(meetupId)}`
  if (loading) return <main className="min-h-[70vh] px-5 pt-20 text-center"><Loader2 className="mx-auto animate-spin text-boot-primary" /><p className="mt-4 text-boot-muted">모임과 보증금 조건을 확인하고 있어요.</p></main>
  if (!context) return <main className="mx-auto max-w-md px-5 pb-28 pt-8"><Link href={backHref} className="inline-flex min-h-11 items-center gap-2 text-boot-muted"><ArrowLeft size={19} />모임으로</Link><div className="mt-8 rounded-3xl border border-boot-hairline bg-white p-6"><ShieldCheck className="mb-5 text-boot-primary" size={30} /><h1 className="text-2xl font-black">{error === 'already_meetup_member' ? '이미 참여 중인 모임이에요' : error === 'Unauthorized' ? '로그인 후 신청할 수 있어요' : error === 'meetup_not_available' ? '지금은 신청할 수 없는 모임이에요' : '보증금 연결을 확인해 주세요'}</h1><p className="mt-4 text-sm leading-7 text-boot-muted">{error === 'already_meetup_member' ? '모임 상세에서 기존 참가자 채팅을 이어갈 수 있어요.' : '모임 정보와 보증금 조건이 확인되기 전에는 결제하거나 신청하지 않아요. 실제 결제와 신청은 발생하지 않았어요.'}</p><button onClick={() => void load()} className="mt-6 min-h-12 w-full rounded-xl bg-boot-primary px-4 font-bold text-white">다시 확인하기</button>{error === 'Unauthorized' ? <Link href={`/login?redirect=${encodeURIComponent(`/meetups/${meetupId}/apply`)}`} className="mt-3 flex min-h-11 items-center justify-center font-bold text-boot-primary">로그인하기</Link> : null}</div></main>
  const item = context.meetup
  const photo = featuredMeetupIdeas.find(idea => idea.id === item.activity_key) ?? featuredMeetupIdeas.find(idea => idea.category === item.category)
  const scheduled = item.scheduled_at && Number.isFinite(Date.parse(item.scheduled_at))
    ? new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(item.scheduled_at)) : '시간은 채팅에서 함께 정해요'
  return <MeetupApplicationFlow
    room={context.room} accountKey={context.accountKey} quote={context.quote} policy={context.policy}
    meetup={{ title: item.title, activityLabel: getMeetupCategoryLabel(item.category), imageSrc: photo?.imageSrc ?? '/images/meetups/meetup-cafe-friends-v1.webp', imageAlt: photo?.imageAlt, summary: `${item.member_count} / ${item.capacity}명 · ${item.description}`, scheduleLabel: scheduled, locationLabel: item.place_name ?? '장소는 채팅에서 함께 정해요' }}
    newDepositAmountKrw={NEW_ADMISSION_DEPOSIT_KRW} onSubmit={checkout.submit} onRefreshStatus={checkout.refresh} onResumeCheckout={checkout.resume} application={checkout.application}
    onOpenChat={result=>{if(result.chatHref===`/chat/rooms/meetup/${meetupId}`)router.push(result.chatHref)}}
    onCancel={() => router.push(backHref)}
  />
}

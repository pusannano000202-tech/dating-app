'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowRight, Coffee, RefreshCw, UsersRound } from 'lucide-react'
import { useHistoryAccount } from '@/components/content-history/useHistoryAccount'
import { isChatUuid, parseSocialRoomsResponse } from '@/lib/chat/social-rooms-contract'
import { socialChatHref } from '@/lib/chat/social-room-presentation'
import { parseMyMeetups } from '@/lib/home/my-meetups'
import { homeParticipatingRooms, type HomeParticipatingRoom } from '@/lib/home/participating-rooms'
import { getSocialActivityPresentation } from '@/lib/social/activity-presentation'
import s from './home-my-meetups.module.css'

type HomeRoomsState = {
  owner: string
  rooms: HomeParticipatingRoom[]
  hasMore: boolean
  detailsUnavailable: boolean
}

export default function QuantumHomeMyMeetups() {
  const account = useHistoryAccount()
  const [state, setState] = useState<HomeRoomsState | null>(null)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    setError('')
    setState(null)
    setExpanded(false)
    if (account === undefined) return () => controller.abort()
    if (!isChatUuid(account)) {
      setError(account === null ? '로그인 상태를 다시 확인해 주세요.' : '계정 연결 상태를 확인하지 못했어요.')
      return () => controller.abort()
    }
    const owner = account
    void (async () => {
      try {
        const options = { cache: 'no-store' as const, signal: controller.signal, headers: { 'X-Expected-Account': owner } }
        const [socialResult, mineResult] = await Promise.allSettled([
          fetch('/api/chat/social-rooms', options).then(async response => ({
            ok: response.ok, status: response.status, payload: await response.json(),
          })),
          fetch('/api/meetups/mine', options).then(async response => response.ok ? parseMyMeetups((await response.json()).data) : null),
        ])
        if (controller.signal.aborted) return
        if (socialResult.status !== 'fulfilled') throw new Error('참여한 모임을 불러오지 못했어요.')
        const response = socialResult.value
        const social = response.ok ? parseSocialRoomsResponse(response.payload, owner) : null
        if (!social) throw new Error(response.status === 401 ? '로그인 상태를 다시 확인해 주세요.' : '참여한 모임을 불러오지 못했어요.')
        const mine = mineResult.status === 'fulfilled' ? mineResult.value : null
        setState({
          owner,
          rooms: homeParticipatingRooms(social, mine),
          hasMore: social.has_more || (mine?.has_more ?? false),
          detailsUnavailable: !mine || (!social.rooms.length && mine.items.length > 0),
        })
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : '모임 연결을 확인해 주세요.')
      }
    })()
    return () => controller.abort()
  }, [account, version])

  // Never render the previous account's rooms while a new identity is resolving.
  const current = state?.owner === account ? state : null
  if (error && !current) return <section id="my-meetups" role="status" className="rounded-2xl border border-[#e8cfc4] bg-white px-4 py-3">
    <p className="text-sm font-bold">내 모임 · 연결 확인 필요</p>
    <p className="mt-1 text-xs leading-5 text-[#807169]">{error} 저장된 참여를 취소하거나 바꾸지는 않았어요.</p>
    <div className="mt-2 flex gap-4"><button type="button" onClick={() => setVersion(v => v + 1)} className="inline-flex min-h-11 items-center gap-1 text-xs font-bold text-[#a43f32]"><RefreshCw size={14} />다시 확인</button><Link href="/chat" className="inline-flex min-h-11 items-center text-xs font-bold text-[#807169]">채팅 목록으로</Link></div>
  </section>
  if (!current) return <div id="my-meetups" role="status" aria-label="내 모임 확인 중" className="h-28 animate-pulse rounded-2xl bg-[#f1e3d9]" />
  if (!current.rooms.length && !current.detailsUnavailable) return <Link id="my-meetups" href="/meetups" className="flex min-h-20 items-center gap-3 rounded-2xl bg-[#f2e6de] px-4 py-3"><Coffee size={24} className="shrink-0 text-[#a43f32]" /><span className="min-w-0 flex-1"><strong className="block text-sm">오늘의 첫 모임, 골라볼까요?</strong><span className="mt-1 block text-xs text-[#807169]">참여하면 이곳에서 대화를 이어가요.</span></span><ArrowRight size={18} /></Link>

  return <section id="my-meetups" aria-label="내가 참여한 모임" className={s.section}>
    <header className={s.heading}><h2>내 모임</h2><Link href="/chat">채팅 전체 <ArrowRight size={13} aria-hidden="true" /></Link></header>
    <div className={s.rooms}>
      {(expanded ? current.rooms : current.rooms.slice(0, 2)).map(room => {
        const href = socialChatHref(room)
        if (!href) return null
        const activity = getSocialActivityPresentation(room)
        return <Link key={room.kind + ':' + room.id} href={href} className={s.card}>
          <span className={s.photo}><Image src={activity.imageSrc} alt={activity.imageAlt} fill sizes="(min-width: 1024px) 150px, 38vw" /></span>
          <span className={s.copy}>
            <span className={s.category}>{activity.categoryLabel}</span>
            <span className={s.activity}>{activity.activityLabel}</span>
            <strong className={s.title}>{room.title}</strong>
            <span className={s.members}><UsersRound size={12} aria-hidden="true" />{room.member_count}{room.capacity ? '/' + room.capacity : ''}명 · {room.statusLabel}</span>
            <span className={s.detail}>{room.detail}</span>
            <span className={s.action}>{room.writable ? '내 방 채팅으로' : '대화 기록 보기'} <ArrowRight size={15} aria-hidden="true" /></span>
          </span>
        </Link>
      })}
    </div>
    {current.rooms.length > 2 ? <button type="button" aria-expanded={expanded} onClick={() => setExpanded(v => !v)} className={s.toggle}>{expanded ? '모임 접기' : `다른 참여 모임 ${current.rooms.length - 2}개 보기`}</button> : null}
    {current.detailsUnavailable ? <p role="status" className={s.note}>참여 정보 일부를 확인하지 못했어요. 모임 일정·정원은 방에서 확인해 주세요. <button type="button" onClick={() => setVersion(v => v + 1)}>다시 확인</button></p> : null}
    {current.hasMore ? <p className={s.note}>더 많은 참여 방은 <Link href="/chat">채팅 전체에서 확인해 주세요.</Link></p> : null}
  </section>
}

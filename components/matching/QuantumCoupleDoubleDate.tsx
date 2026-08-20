'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Clock3, Loader2, LockKeyhole, Send, ShieldCheck, UserRoundPlus, UsersRound, X } from 'lucide-react'
import Link from 'next/link'

type Friend = { user_id: string; display_name: string | null; status: string }
type CoupleParty = {
  party_id: string
  role: 'leader' | 'partner'
  partner_display_name?: string
  status: 'pending_partner' | 'ready' | 'matched' | 'completed'
  matched: boolean
  completed?: boolean
  participant_count: number
  opponent_couple_ready: boolean
  starts_at?: string | null
  location_name?: string | null
}

type Props = { devPreview?: boolean }

const DEV_PARTY: CoupleParty = {
  party_id: 'dev-couple-party',
  role: 'leader',
  partner_display_name: '민지',
  status: 'ready',
  matched: false,
  participant_count: 2,
  opponent_couple_ready: false,
}

export default function QuantumCoupleDoubleDate({ devPreview = false }: Props) {
  const [party, setParty] = useState<CoupleParty | null>(devPreview ? DEV_PARTY : null)
  const [friends, setFriends] = useState<Friend[]>(devPreview ? [{ user_id: 'dev-friend', display_name: '민지', status: 'active' }] : [])
  const [selectedFriend, setSelectedFriend] = useState('')
  const [state, setState] = useState<'loading' | 'ready' | 'auth' | 'unavailable'>(devPreview ? 'ready' : 'loading')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  const refresh = useCallback(async (silent = false) => {
    if (devPreview) return
    if (!silent) setState('loading')
    const response = await fetch('/api/match/couple-parties', { cache: 'no-store' }).catch(() => null)
    if (response?.status === 401) return setState('auth')
    if (!response?.ok) return setState('unavailable')
    const payload = await response.json() as { party?: CoupleParty | null; friends?: Friend[] }
    setParty(payload.party ?? null)
    setFriends((payload.friends ?? []).filter((friend) => friend.status === 'active'))
    setState('ready')
  }, [devPreview])

  useEffect(() => {
    void refresh()
    if (devPreview) return
    const interval = window.setInterval(() => void refresh(true), 10_000)
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refresh(true)
    }
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [devPreview, refresh])

  async function createParty() {
    if (!selectedFriend || busy) return
    setBusy(true)
    setNotice('')
    const response = await fetch('/api/match/couple-parties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partner_user_id: selectedFriend }),
    }).catch(() => null)
    const payload = response ? await response.json().catch(() => ({})) as { party?: CoupleParty; error?: string } : {}
    if (response?.ok && payload.party) setParty(payload.party)
    else setNotice(mapError(payload.error))
    setBusy(false)
  }

  async function acceptParty() {
    if (!party || busy) return
    setBusy(true)
    const response = await fetch('/api/match/couple-parties/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ party_id: party.party_id }),
    }).catch(() => null)
    const payload = response ? await response.json().catch(() => ({})) as { party?: CoupleParty; error?: string } : {}
    if (response?.ok && payload.party) setParty(payload.party)
    else setNotice(mapError(payload.error))
    setBusy(false)
  }

  async function cancelParty() {
    if (busy || party?.status === 'matched') return
    if (!window.confirm('커플 더블데이트 신청을 취소할까요?')) return
    setBusy(true)
    const response = await fetch('/api/match/couple-parties', { method: 'DELETE' }).catch(() => null)
    if (response?.ok) {
      setParty(null)
      setNotice('신청을 취소했어요.')
    } else setNotice('신청 취소에 실패했어요.')
    setBusy(false)
  }

  if (state === 'loading') return <Status icon={Loader2} copy="커플 신청 상태를 불러오는 중이에요." spinning />
  if (state === 'auth') return <Status icon={ShieldCheck} copy="로그인하면 파트너를 초대하고 더블데이트를 신청할 수 있어요." />
  if (state === 'unavailable') return <Status icon={Clock3} copy="커플 신청 저장 구조를 준비하고 있어요. 잠시 후 다시 확인해 주세요." />

  return (
    <section className="space-y-5" aria-live="polite">
      <div className="rounded-lg border border-[#E8CFC7] bg-[#FFFDFC] p-5">
        <div className="flex items-start gap-3">
          <LockKeyhole className="mt-0.5 shrink-0 text-[#B96657]" size={20} />
          <div>
            <h2 className="text-base font-black">상대 커플 프로필은 만남 종료 후 열려요</h2>
            <p className="mt-1 text-sm font-bold leading-6 text-boot-muted">상대 커플의 사진·이름·학과는 보여주지 않아요. 만남 종료 후 자동 친구 연결이 완료되면 프로필이 열려요.</p>
          </div>
        </div>
      </div>

      {!party ? (
        <div className="rounded-lg border border-[#E8CFC7] bg-white p-5 shadow-[0_14px_32px_rgba(109,70,61,0.08)]">
          <p className="text-xs font-black text-[#A85F50]">1단계 · 파트너 선택</p>
          <h2 className="mt-1 text-xl font-black">함께 갈 파트너를 초대하세요</h2>
          <p className="mt-2 text-sm font-bold leading-6 text-boot-muted">이미 Quantum 친구인 사람만 선택할 수 있고, 상대가 직접 수락해야 커플팀이 완성돼요.</p>
          {friends.length > 0 ? (
            <>
              <label htmlFor="couple-partner" className="mt-5 block text-sm font-black">내 친구</label>
              <select id="couple-partner" value={selectedFriend} onChange={(event) => setSelectedFriend(event.target.value)} className="mt-2 min-h-13 w-full rounded-lg border border-[#E8CFC7] bg-[#FFF9F6] px-4 text-sm font-black outline-none focus:border-[#C86F60]">
                <option value="">파트너를 선택해 주세요</option>
                {friends.map((friend) => <option key={friend.user_id} value={friend.user_id}>{friend.display_name || '내 친구'}</option>)}
              </select>
              <button type="button" onClick={() => void createParty()} disabled={!selectedFriend || busy || devPreview} className="mt-4 flex min-h-13 w-full items-center justify-center gap-2 rounded-lg bg-[#C86F60] px-5 text-sm font-black text-white disabled:opacity-45">
                {busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />} 파트너에게 초대 보내기
              </button>
            </>
          ) : (
            <Link href="/friends" className="mt-5 flex min-h-13 items-center justify-center gap-2 rounded-lg border border-[#D9A69B] bg-[#FFF7F3] text-sm font-black text-[#A85F50]"><UserRoundPlus size={18} /> 친구 먼저 연결하기</Link>
          )}
        </div>
      ) : (
        <CouplePartyStatus party={party} busy={busy} devPreview={devPreview} onAccept={acceptParty} onCancel={cancelParty} />
      )}

      {notice ? <p className="rounded-lg bg-[#FFF0EC] px-4 py-3 text-sm font-black text-[#A84F43]">{notice}</p> : null}
    </section>
  )
}

function CouplePartyStatus({ party, busy, devPreview, onAccept, onCancel }: { party: CoupleParty; busy: boolean; devPreview: boolean; onAccept: () => void; onCancel: () => void }) {
  const waitingForPartner = party.status === 'pending_partner'
  const completed = party.status === 'completed' || party.completed === true
  const matched = party.status === 'matched' || party.matched
  return (
    <div className="overflow-hidden rounded-lg border border-[#E2BBB2] bg-white shadow-[0_18px_38px_rgba(109,70,61,0.1)]">
      <div className="bg-[#442E2A] px-5 py-5 text-white">
        <p className="text-[11px] font-black text-[#FFC7B5]">내 커플팀 현황</p>
        <div className="mt-2 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black">{completed ? '더블데이트가 끝났어요' : matched ? '두 커플이 만날 준비 완료' : waitingForPartner ? '파트너 수락 대기 중' : '상대 커플을 찾고 있어요'}</h2>
            <p className="mt-2 text-sm font-bold text-white/72">나 + {party.partner_display_name || '내 파트너'}</p>
          </div>
          <p className="shrink-0 text-3xl font-black text-[#FFC07A]">{party.participant_count}/4</p>
        </div>
      </div>

      <div className="p-5">
        <div className="grid grid-cols-4 gap-2" aria-label="익명 참가 좌석">
          <Seat label="나" filled mine />
          <Seat label="파트너" filled={party.status !== 'pending_partner'} mine />
          <Seat label="상대 1" filled={matched || completed} />
          <Seat label="상대 2" filled={matched || completed} />
        </div>
        <p className="mt-4 flex items-center gap-2 text-xs font-bold leading-5 text-boot-muted"><LockKeyhole size={15} /> 상대 커플은 익명 좌석과 인원 상태만 보여요.</p>

        {completed ? (
          <div className="mt-5 rounded-lg bg-[#FFF0EB] p-4">
            <p className="text-xs font-black text-[#A85F50]">친구 연결 완료</p>
            <p className="mt-1 text-lg font-black">네 사람의 프로필이 열렸어요</p>
            <p className="mt-2 text-sm font-bold leading-6 text-boot-muted">친구 목록에서 함께 만난 사람을 확인하고 앱 안에서 대화를 이어갈 수 있어요.</p>
            <Link href="/friends" className="mt-4 flex min-h-12 items-center justify-center rounded-lg bg-[#C86F60] px-4 text-sm font-black text-white">새 친구 프로필 보기</Link>
          </div>
        ) : matched ? (
          <div className="mt-5 rounded-lg bg-[#FFF6ED] p-4">
            <p className="text-xs font-black text-[#A85F50]">약속 확정</p>
            <p className="mt-1 text-lg font-black">{formatDate(party.starts_at)} · {party.location_name || '장소 확인 중'}</p>
          </div>
        ) : waitingForPartner && party.role === 'partner' ? (
          <button type="button" onClick={() => void onAccept()} disabled={busy || devPreview} className="mt-5 flex min-h-13 w-full items-center justify-center gap-2 rounded-lg bg-[#C86F60] text-sm font-black text-white disabled:opacity-45"><Check size={18} /> 파트너 초대 수락하기</button>
        ) : (
          <div className="mt-5 flex items-center gap-3 rounded-lg bg-[#FFF9F6] p-4"><Loader2 size={19} className="animate-spin text-[#B96657]" /><p className="text-sm font-black">{waitingForPartner ? '파트너가 수락하면 다음 단계로 넘어가요.' : '준비된 다른 커플팀을 안전하게 편성하고 있어요.'}</p></div>
        )}

        {!matched ? <button type="button" onClick={() => void onCancel()} disabled={busy || devPreview} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 text-sm font-black text-boot-muted disabled:opacity-45"><X size={16} /> 신청 취소</button> : null}
      </div>
    </div>
  )
}

function Seat({ label, filled, mine = false }: { label: string; filled: boolean; mine?: boolean }) {
  return <div className={`flex aspect-square min-w-0 flex-col items-center justify-center rounded-lg border text-center ${filled ? (mine ? 'border-[#D89688] bg-[#FFF0EB] text-[#9D5144]' : 'border-[#D8C8C2] bg-[#F5F0EE] text-[#6B5C57]') : 'border-dashed border-[#D8C8C2] bg-white text-[#A99B96]'}`}><UsersRound size={18} /><span className="mt-1 text-[10px] font-black">{filled ? label : '빈자리'}</span></div>
}

function Status({ icon: Icon, copy, spinning = false }: { icon: typeof Clock3; copy: string; spinning?: boolean }) {
  return <section className="flex items-center gap-3 rounded-lg border border-[#E8CFC7] bg-white p-5"><Icon size={20} className={spinning ? 'animate-spin text-[#B96657]' : 'text-[#B96657]'} /><p className="text-sm font-bold text-boot-muted">{copy}</p></section>
}

function mapError(error?: string) {
  if (error === 'active_friendship_required') return '현재 친구로 연결된 사람만 파트너로 초대할 수 있어요.'
  if (error === 'active_couple_party_exists') return '둘 중 한 명이 이미 진행 중인 커플 신청에 참여하고 있어요.'
  if (error === 'couple_invite_not_active') return '초대가 만료되었어요. 다시 초대해 주세요.'
  return '커플 신청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.'
}

function formatDate(value?: string | null) {
  if (!value) return '토요일 오후 4:00'
  const date = new Date(value)
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

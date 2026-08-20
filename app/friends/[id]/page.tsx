'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useParams, useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  CalendarHeart,
  Check,
  Coffee,
  Footprints,
  Loader2,
  MessageCircle,
  RefreshCw,
  Send,
  Utensils,
  X,
} from 'lucide-react'

import { isDevPreviewClientSession } from '@/lib/dev-match-setup'

type ProposalKind = 'meal' | 'cafe' | 'walk' | 'custom'
type ProposalStatus = 'pending' | 'accepted' | 'declined' | 'cancelled'

interface Proposal {
  id: string
  proposer_user_id: string
  recipient_user_id: string
  other_user_id: string
  other_display_name: string | null
  kind: ProposalKind
  message: string | null
  status: ProposalStatus
  responded_at: string | null
  created_at: string
}

interface FriendProfile {
  user_id: string
  display_name: string | null
  age: number
  school: string
  department: string | null
  year: number | null
  height: number | null
  body_type: string | null
  photo_urls: string[]
}

const QUICK_PROPOSALS: Array<{
  kind: ProposalKind
  label: string
  message: string
  icon: typeof Utensils
}> = [
  { kind: 'meal', label: '밥', message: '밥 먹을래요?', icon: Utensils },
  { kind: 'cafe', label: '카페', message: '카페 갈래요?', icon: Coffee },
  { kind: 'walk', label: '산책', message: '같이 산책할래요?', icon: Footprints },
]

const PREVIEW_USER_ID = '00000000-0000-4000-8000-000000000001'

export default function FriendDatePage() {
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const friendUserId = decodeURIComponent(params.id ?? '')
  const routeName = searchParams.get('name')?.trim() || 'Quantum 친구'
  const preview = isDevPreviewClientSession()
  const [currentUserId, setCurrentUserId] = useState<string | null>(preview ? PREVIEW_USER_ID : null)
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [friendProfile, setFriendProfile] = useState<FriendProfile | null>(null)
  const [kind, setKind] = useState<ProposalKind>('meal')
  const [message, setMessage] = useState('밥 먹을래요?')
  const [loading, setLoading] = useState(!preview)
  const [sending, setSending] = useState(false)
  const [workingId, setWorkingId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const friendName = useMemo(
    () => routeName || proposals[0]?.other_display_name || 'Quantum 친구',
    [proposals, routeName],
  )

  const refresh = useCallback(async () => {
    if (preview) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const [proposalResponse, friendResponse, profileResponse] = await Promise.all([
        fetch(`/api/friend-date-proposals?friend_user_id=${encodeURIComponent(friendUserId)}`, { cache: 'no-store' }),
        fetch('/api/friend-requests', { cache: 'no-store' }),
        fetch(`/api/friends/${encodeURIComponent(friendUserId)}/profile`, { cache: 'no-store' }),
      ])
      if (proposalResponse.status === 401 || friendResponse.status === 401 || profileResponse.status === 401) {
        setError('로그인이 필요해요.')
        return
      }
      if (!proposalResponse.ok || !friendResponse.ok || !profileResponse.ok) throw new Error('load_failed')

      const proposalPayload = await proposalResponse.json() as { proposals?: Proposal[] }
      const friendPayload = await friendResponse.json() as {
        current_user_id?: string
        friends?: Array<{ user_id: string }>
      }
      const profilePayload = await profileResponse.json() as { profile?: FriendProfile }
      if (!friendPayload.friends?.some((friend) => friend.user_id === friendUserId)) {
        setError('현재 친구인 사용자에게만 약속을 제안할 수 있어요.')
        return
      }
      setCurrentUserId(friendPayload.current_user_id ?? null)
      setFriendProfile(profilePayload.profile ?? null)
      setProposals([...(proposalPayload.proposals ?? [])].reverse())
    } catch {
      setError('약속 대화를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      setLoading(false)
    }
  }, [friendUserId, preview])

  useEffect(() => {
    void refresh()
  }, [refresh])

  function chooseProposal(selected: typeof QUICK_PROPOSALS[number]) {
    setKind(selected.kind)
    setMessage(selected.message)
    setNotice(null)
  }

  async function sendProposal() {
    const trimmed = message.trim()
    if (!trimmed || sending) return
    setSending(true)
    setError(null)
    setNotice(null)

    if (preview) {
      setProposals((current) => [{
        id: `preview-${Date.now()}`,
        proposer_user_id: PREVIEW_USER_ID,
        recipient_user_id: friendUserId,
        other_user_id: friendUserId,
        other_display_name: friendName,
        kind,
        message: trimmed,
        status: 'pending',
        responded_at: null,
        created_at: new Date().toISOString(),
      }, ...current])
      setNotice('미리보기에서 약속 제안 상태를 확인했어요.')
      setSending(false)
      return
    }

    try {
      const response = await fetch('/api/friend-date-proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_user_id: friendUserId, kind, message: trimmed }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string }
        setError(translateError(body.error))
        return
      }
      setNotice(`${friendName}님에게 약속을 제안했어요.`)
      await refresh()
    } catch {
      setError('약속 제안을 보내지 못했어요.')
    } finally {
      setSending(false)
    }
  }

  async function respond(proposalId: string, accept: boolean) {
    if (workingId) return
    setWorkingId(proposalId)
    setError(null)
    try {
      const response = await fetch(`/api/friend-date-proposals/${encodeURIComponent(proposalId)}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accept }),
      })
      if (!response.ok) throw new Error('respond_failed')
      setNotice(accept ? '좋아요. 이제 채팅으로 시간과 장소를 정해 보세요.' : '이번 제안은 정중하게 거절했어요.')
      await refresh()
    } catch {
      setError('제안 상태를 바꾸지 못했어요.')
    } finally {
      setWorkingId(null)
    }
  }

  async function cancel(proposalId: string) {
    if (workingId) return
    setWorkingId(proposalId)
    setError(null)
    try {
      const response = await fetch(`/api/friend-date-proposals/${encodeURIComponent(proposalId)}/cancel`, { method: 'POST' })
      if (!response.ok) throw new Error('cancel_failed')
      setNotice('보낸 제안을 취소했어요.')
      await refresh()
    } catch {
      setError('제안을 취소하지 못했어요.')
    } finally {
      setWorkingId(null)
    }
  }

  return (
    <main className="min-h-screen booting-paper px-4 pb-28 pt-6 text-boot-ink">
      <div className="mx-auto w-full max-w-md">
        <header className="flex items-center gap-3">
          <Link href="/friends" aria-label="친구 목록으로" className="flex h-11 w-11 items-center justify-center rounded-lg border border-boot-hairline bg-white text-boot-body">
            <ArrowLeft size={20} />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xl font-black">{friendName}</p>
            <p className="text-xs font-bold text-boot-muted">친구끼리 가볍게 약속 잡기</p>
          </div>
          <button type="button" onClick={() => void refresh()} aria-label="새로고침" className="flex h-11 w-11 items-center justify-center rounded-lg border border-boot-hairline bg-white text-boot-primary">
            <RefreshCw size={18} />
          </button>
        </header>

        {friendProfile ? (
          <section className="mt-5 overflow-hidden rounded-lg border border-boot-hairline bg-white shadow-sm">
            <div className="grid grid-cols-[96px_1fr] gap-4 p-4">
              <div className="relative h-24 w-24 overflow-hidden rounded-md bg-boot-soft">
                {friendProfile.photo_urls[0] ? (
                  <Image
                    src={friendProfile.photo_urls[0]}
                    alt={`${friendProfile.display_name ?? '친구'} 프로필 사진`}
                    fill
                    sizes="96px"
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-2xl font-black text-boot-primary">
                    {(friendProfile.display_name ?? 'Q').slice(0, 1)}
                  </div>
                )}
              </div>
              <div className="min-w-0 self-center">
                <p className="text-[11px] font-black text-boot-primary">친구 연결 후 공개된 프로필</p>
                <h2 className="mt-1 truncate text-xl font-black">{friendProfile.display_name ?? friendName}</h2>
                <p className="mt-2 text-sm font-bold text-boot-body">{friendProfile.age}세 · {friendProfile.school}</p>
                <p className="mt-1 text-xs leading-5 text-boot-muted">
                  {[friendProfile.department, friendProfile.year ? `${friendProfile.year}학년` : null, friendProfile.height ? `${friendProfile.height}cm` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
            </div>
          </section>
        ) : null}

        <section className="mt-5 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <CalendarHeart className="mt-0.5 shrink-0 text-emerald-700" size={19} />
          <p className="text-sm leading-6 text-emerald-950">제안만 보내는 단계예요. 상대가 수락한 뒤 채팅에서 시간과 장소를 정할 수 있어요.</p>
        </section>

        {error ? <Status tone="error">{error}</Status> : null}
        {notice ? <Status tone="success">{notice}</Status> : null}

        <section className="mt-5 rounded-lg border border-boot-hairline bg-white p-4 shadow-sm">
          <h2 className="text-base font-black">무엇을 같이 할까요?</h2>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {QUICK_PROPOSALS.map((proposal) => {
              const Icon = proposal.icon
              const selected = kind === proposal.kind
              return (
                <button key={proposal.kind} type="button" onClick={() => chooseProposal(proposal)} className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border text-xs font-black ${selected ? 'border-boot-primary bg-boot-soft text-boot-primary' : 'border-boot-hairline bg-white text-boot-muted'}`}>
                  <Icon size={18} />
                  {proposal.label}
                </button>
              )
            })}
            <button type="button" onClick={() => { setKind('custom'); setMessage('') }} className={`min-h-16 rounded-lg border text-xs font-black ${kind === 'custom' ? 'border-boot-primary bg-boot-soft text-boot-primary' : 'border-boot-hairline text-boot-muted'}`}>직접</button>
          </div>
          <div className="mt-3 flex gap-2">
            <input value={message} onChange={(event) => setMessage(event.target.value)} maxLength={300} placeholder="예: 수업 끝나고 밥 먹을래요?" className="min-w-0 flex-1 rounded-lg border border-boot-hairline bg-white px-3 text-sm outline-none focus:border-boot-primary" />
            <button type="button" onClick={() => void sendProposal()} disabled={sending || !message.trim()} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-boot-ink text-white disabled:opacity-40" aria-label="약속 제안 보내기">
              {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </div>
        </section>

        <section className="mt-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-black">주고받은 제안</h2>
            <span className="text-xs font-bold text-boot-muted">{proposals.length}개</span>
          </div>
          {loading ? (
            <div className="flex min-h-28 items-center justify-center rounded-lg border border-boot-hairline bg-white"><Loader2 className="animate-spin text-boot-primary" /></div>
          ) : proposals.length === 0 ? (
            <div className="rounded-lg border border-dashed border-boot-hairline bg-white/70 p-6 text-center">
              <MessageCircle className="mx-auto text-boot-primary" size={25} />
              <p className="mt-3 text-sm font-black">아직 제안이 없어요</p>
              <p className="mt-1 text-xs leading-5 text-boot-muted">짧고 편한 문장으로 먼저 물어보세요.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {proposals.map((proposal) => {
                const mine = proposal.proposer_user_id === currentUserId
                const canRespond = !mine && proposal.status === 'pending'
                const canCancel = mine && proposal.status === 'pending'
                return (
                  <article key={proposal.id} className={`rounded-lg border p-4 ${mine ? 'ml-8 border-boot-primary/20 bg-boot-soft' : 'mr-8 border-boot-hairline bg-white'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-black text-boot-primary">{kindLabel(proposal.kind)}</span>
                      <span className="text-[11px] font-bold text-boot-muted">{statusLabel(proposal.status)}</span>
                    </div>
                    <p className="mt-2 text-sm font-bold leading-6">{proposal.message || defaultMessage(proposal.kind)}</p>
                    {canRespond ? (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button type="button" disabled={Boolean(workingId)} onClick={() => void respond(proposal.id, false)} className="flex h-10 items-center justify-center gap-1 rounded-lg border border-red-200 bg-white text-xs font-black text-red-600"><X size={15} />거절</button>
                        <button type="button" disabled={Boolean(workingId)} onClick={() => void respond(proposal.id, true)} className="flex h-10 items-center justify-center gap-1 rounded-lg bg-boot-primary text-xs font-black text-white"><Check size={15} />수락</button>
                      </div>
                    ) : null}
                    {canCancel ? <button type="button" disabled={Boolean(workingId)} onClick={() => void cancel(proposal.id)} className="mt-3 text-xs font-bold text-boot-muted underline">제안 취소</button> : null}
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

function Status({ tone, children }: { tone: 'error' | 'success'; children: React.ReactNode }) {
  return <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${tone === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{children}</div>
}

function kindLabel(kind: ProposalKind) {
  return kind === 'meal' ? '식사' : kind === 'cafe' ? '카페' : kind === 'walk' ? '산책' : '직접 제안'
}

function defaultMessage(kind: ProposalKind) {
  return kind === 'meal' ? '밥 먹을래요?' : kind === 'cafe' ? '카페 갈래요?' : kind === 'walk' ? '같이 산책할래요?' : '같이 시간 보낼래요?'
}

function statusLabel(status: ProposalStatus) {
  return status === 'pending' ? '답변 대기' : status === 'accepted' ? '수락됨' : status === 'declined' ? '거절됨' : '취소됨'
}

function translateError(code?: string) {
  if (code === 'proposal_already_pending') return '답변을 기다리는 제안이 이미 있어요.'
  if (code === 'active_friendship_required') return '현재 친구인 사용자에게만 제안할 수 있어요.'
  if (code === 'proposal_message_too_long') return '메시지는 300자 이하로 적어 주세요.'
  return '약속 제안을 보내지 못했어요.'
}

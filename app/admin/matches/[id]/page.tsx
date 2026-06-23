'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ChevronLeft, Loader2, Check, X } from 'lucide-react'

interface Member {
  user_id: string
  display_name: string | null
  age: number | null
  gender: string | null
  school: string | null
  department: string | null
  appearance_type: string | null
  effective_score: number | null
  score_source: string | null
  primary_photo_url: string | null
}

interface Review {
  match_id: string
  group_a_id: string
  group_b_id: string
  status: string
  approval_status: string
  is_forced: boolean
  score: number | null
  score_breakdown: Record<string, number> | null
  matched_at: string | null
  reviewed_at: string | null
  review_reason: string | null
  group_a_members: Member[]
  group_b_members: Member[]
  evidence?: AdminMatchEvidence
}

interface AdminMatchEvidence {
  meeting: {
    meeting: {
      scheduled_start: string | null
      scheduled_end: string | null
      status: string | null
      checkin_radius_m: number | null
    } | null
    venue: {
      name: string | null
      address: string | null
      map_url: string | null
      latitude: number | null
      longitude: number | null
      checkin_radius_m: number | null
    } | null
  }
  attendances: Array<{
    user_id: string
    gps_lat: number | null
    gps_lng: number | null
    within_radius: boolean | null
    checked_at: string | null
    peer_confirmed: boolean | null
  }>
  deposits: Array<{
    user_id: string
    group_id: string
    amount: number | null
    status: string | null
    paid_at: string | null
    refunded_at: string | null
    notes: string | null
  }>
  refunds: Array<{
    user_id: string
    deposit_id: string
    requested_refund_amount: number | null
    status: string | null
    processed_at: string | null
    zero_refund_reasons: string[] | null
    zero_refund_comment: string | null
  }>
}

export default function AdminMatchDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [review, setReview] = useState<Review | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/matches/${encodeURIComponent(id)}`)
      if (!res.ok) { setError('불러오지 못했어요.'); return }
      const d = await res.json() as { review: Review | null }
      setReview(d.review)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { refresh() }, [refresh])

  async function decide(decision: 'approve' | 'reject') {
    if (busy) return
    const addExcluded = decision === 'reject'
      ? confirm('이 두 그룹을 앞으로도 매칭 금지(excluded_pairs)할까요?')
      : false
    if (decision === 'reject' && !confirm('거절하면 두 그룹은 풀로 복귀합니다. 진행할까요?')) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/matches/${encodeURIComponent(id)}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, add_excluded: addExcluded }),
      })
      if (res.ok) router.push('/admin/matches/review')
      else setError('처리에 실패했어요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="px-5 pb-10">
      <div className="max-w-3xl mx-auto pt-6">
        <header className="mb-6 flex items-center gap-3">
          <Link href="/admin/matches/review" className="p-2 glass rounded-xl"><ChevronLeft size={18} /></Link>
          <h1 className="text-xl font-black">매칭 상세 · 근거</h1>
        </header>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
        )}

        {loading ? (
          <section className="glass rounded-3xl p-5 flex items-center gap-3 text-sm text-gray-400">
            <Loader2 size={18} className="animate-spin" /> 불러오는 중
          </section>
        ) : review ? (
          <>
            <section className="glass-card rounded-3xl p-5 mb-4 border border-white/[0.06]">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold">
                  종합 점수 <span className="gradient-fate-text text-lg">{review.score != null ? (review.score * 100).toFixed(0) : '–'}</span>
                  {review.is_forced && <span className="ml-2 text-[10px] text-amber-300">강제매칭</span>}
                </p>
                <span className="text-[11px] text-gray-500">{review.approval_status}</span>
              </div>
              {review.score_breakdown && (
                <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-gray-400">
                  {Object.entries(review.score_breakdown).map(([k, v]) => (
                    <div key={k} className="rounded-lg bg-white/[0.04] px-2 py-1.5">
                      <span className="text-gray-500">{k}</span>{' '}
                      <span className="text-gray-200 font-medium">{typeof v === 'number' ? v.toFixed(2) : String(v)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <AdminEvidencePanel review={review} />

            <GroupBlock title="그룹 A" members={review.group_a_members} />
            <GroupBlock title="그룹 B" members={review.group_b_members} />

            {review.approval_status === 'pending_review' && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => decide('approve')} disabled={busy}
                  className="btn-gradient py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-40">
                  <Check size={16} /> 승인
                </button>
                <button type="button" onClick={() => decide('reject')} disabled={busy}
                  className="py-3 rounded-2xl text-sm font-bold border border-white/15 text-gray-300 hover:border-red-400/40 hover:text-red-200 flex items-center justify-center gap-1.5 disabled:opacity-40">
                  <X size={16} /> 거절
                </button>
              </div>
            )}
          </>
        ) : null}
      </div>
    </main>
  )
}

function AdminEvidencePanel({ review }: { review: Review }) {
  const evidence = review.evidence
  const members = [...(review.group_a_members ?? []), ...(review.group_b_members ?? [])]
  const memberById = new Map(members.map((member) => [member.user_id, member]))
  const meeting = evidence?.meeting?.meeting ?? null
  const venue = evidence?.meeting?.venue ?? null
  const deposits = evidence?.deposits ?? []
  const attendances = evidence?.attendances ?? []
  const refunds = evidence?.refunds ?? []
  const checkedCount = attendances.filter((row) => row.within_radius).length
  const forfeitedCount = deposits.filter((row) => row.status === 'forfeited').length
  const refundedCount = deposits.filter((row) => row.status === 'refunded').length

  return (
    <section className="glass-card rounded-3xl p-5 mb-4 border border-white/[0.06]">
      <div className="mb-4">
        <p className="text-xs font-bold text-gray-400">운영자 판단 체크리스트</p>
        <h2 className="mt-1 text-lg font-black">노쇼·환불 판단 근거</h2>
        <p className="mt-1 text-xs leading-relaxed text-gray-500">
          약속 정보, 사진 증거, 체크인 위치, 보증금 상태를 같이 보고 승인/거절 또는 노쇼 처리를 판단합니다.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <EvidenceCard title="약속 시간·장소">
          <EvidenceRow label="시간" value={meeting?.scheduled_start ? new Date(meeting.scheduled_start).toLocaleString('ko-KR') : '배정 전'} />
          <EvidenceRow label="장소" value={venue?.name ?? '장소 미배정'} />
          <EvidenceRow label="주소" value={venue?.address ?? '주소 없음'} />
          <EvidenceRow label="반경" value={`${meeting?.checkin_radius_m ?? venue?.checkin_radius_m ?? 50}m`} />
          {venue?.map_url && (
            <a href={venue.map_url} target="_blank" rel="noreferrer" className="mt-2 block text-xs font-bold text-boot-primary">
              지도 열기
            </a>
          )}
        </EvidenceCard>

        <EvidenceCard title="체크인/노쇼 증거">
          <EvidenceRow label="체크인" value={`${checkedCount}/${members.length}명 반경 안`} />
          <EvidenceRow label="노쇼 위험" value={forfeitedCount > 0 ? `${forfeitedCount}명 보증금 몰수` : '확정 전'} />
          <div className="mt-2 space-y-1.5">
            {attendances.length === 0 ? (
              <p className="text-xs text-gray-500">아직 체크인 기록이 없어요.</p>
            ) : attendances.map((row) => (
              <p key={row.user_id} className="rounded-xl bg-white/[0.04] px-3 py-2 text-[11px] text-gray-400">
                {memberById.get(row.user_id)?.display_name ?? row.user_id.slice(0, 8)}
                {' · '}
                {row.within_radius ? '반경 안' : '반경 밖'}
                {' · '}
                {row.checked_at ? new Date(row.checked_at).toLocaleTimeString('ko-KR') : '시간 없음'}
              </p>
            ))}
          </div>
        </EvidenceCard>

        <EvidenceCard title="보증금/환불 상태">
          <EvidenceRow label="결제" value={`${deposits.filter((row) => row.status === 'paid' || row.status === 'held').length}/${members.length}명`} />
          <EvidenceRow label="환불" value={`${refundedCount}명 환불 완료`} />
          <EvidenceRow label="환불 요청" value={`${refunds.length}건`} />
          <div className="mt-2 space-y-1.5">
            {deposits.length === 0 ? (
              <p className="text-xs text-gray-500">보증금 기록을 불러오지 못했어요.</p>
            ) : deposits.map((row) => (
              <p key={`${row.user_id}-${row.status}`} className="rounded-xl bg-white/[0.04] px-3 py-2 text-[11px] text-gray-400">
                {memberById.get(row.user_id)?.display_name ?? row.user_id.slice(0, 8)}
                {' · '}
                {depositStatusLabel(row.status)}
                {' · '}
                {(row.amount ?? 0).toLocaleString()}원
              </p>
            ))}
          </div>
        </EvidenceCard>

        <EvidenceCard title="사진 증거">
          <div className="grid grid-cols-4 gap-2">
            {members.map((member) => (
              <div key={member.user_id} className="overflow-hidden rounded-2xl bg-white/[0.04]">
                <div className="aspect-square bg-white/[0.05]">
                  {member.primary_photo_url
                    ? /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={member.primary_photo_url} alt="" className="h-full w-full object-cover" />
                    : <div className="flex h-full items-center justify-center text-[10px] text-gray-600">사진 없음</div>}
                </div>
                <p className="truncate px-2 py-1.5 text-[10px] text-gray-500">{member.display_name ?? '이름없음'}</p>
              </div>
            ))}
          </div>
        </EvidenceCard>
      </div>
    </section>
  )
}

function EvidenceCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
      <p className="mb-3 text-xs font-bold text-gray-300">{title}</p>
      {children}
    </div>
  )
}

function EvidenceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
      <span className="text-gray-500">{label}</span>
      <span className="min-w-0 truncate text-right font-bold text-gray-300">{value}</span>
    </div>
  )
}

function depositStatusLabel(status: string | null) {
  switch (status) {
    case 'paid': return '결제 완료'
    case 'held': return '보관 중'
    case 'refunded': return '환불 완료'
    case 'forfeited': return '몰수'
    case 'compensated': return '보상 분배'
    case 'pending': return '대기'
    default: return status ?? '알 수 없음'
  }
}

function GroupBlock({ title, members }: { title: string; members: Member[] }) {
  return (
    <section className="glass-card rounded-3xl p-5 mb-4 border border-white/[0.06]">
      <p className="text-xs font-bold text-gray-400 mb-3">{title} · {members?.length ?? 0}명</p>
      <div className="space-y-3">
        {(members ?? []).map((m) => (
          <Link
            key={m.user_id}
            href={`/admin/users/${encodeURIComponent(m.user_id)}`}
            className="flex items-center gap-3 rounded-2xl bg-white/[0.03] p-3 hover:bg-white/[0.06]"
          >
            <div className="h-12 w-12 rounded-xl overflow-hidden bg-white/[0.06] shrink-0">
              {m.primary_photo_url
                ? /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={m.primary_photo_url} alt="" className="h-full w-full object-cover" />
                : <div className="h-full w-full flex items-center justify-center text-gray-600 text-xs">無</div>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate">
                {m.display_name ?? '이름없음'} · {m.age ?? '?'}세
              </p>
              <p className="text-[11px] text-gray-500 truncate">{m.school ?? ''} {m.department ?? ''}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-black">{m.effective_score != null ? Math.round(m.effective_score) : '–'}</p>
              <p className="text-[10px] text-gray-600">{m.score_source ?? ''}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

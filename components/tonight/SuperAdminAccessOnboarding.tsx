'use client'

import { useEffect, useMemo, useState } from 'react'
import { Building2, Check, Copy, Search, ShieldCheck, UserCog } from 'lucide-react'

import { PEACH_PANEL, StatusPill } from './TonightUi'
import type { TonightUiMode } from './types'

type Account = { userId: string; name: string; email: string | null }
type Venue = { venueId: string; name: string; address: string | null }
type PartnerInvite = {
  invite_id: string
  venue_name: string
  invited_user_name: string | null
  invited_user_email: string | null
  claimed_user_name: string | null
  claimed_user_email: string | null
  status: string
  expires_at: string
  revision: number
}
type MarketRequest = {
  request_id: string
  display_name: string | null
  school: string | null
  department: string | null
  status: string
  verification_state: string
  revision: number
}

function idempotencyKey(prefix: string): string {
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replaceAll('-', '')
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`
  return `${prefix}_${suffix}`.slice(0, 120)
}

async function jsonRequest(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(path, { cache: 'no-store', credentials: 'same-origin', ...init })
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'request_failed')
  return payload
}

export default function SuperAdminAccessOnboarding({ mode }: { mode: TonightUiMode }) {
  const [query, setQuery] = useState('')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [selectedVenueId, setSelectedVenueId] = useState('')
  const [partnerRole, setPartnerRole] = useState<'owner' | 'staff'>('owner')
  const [invites, setInvites] = useState<PartnerInvite[]>([])
  const [marketRequests, setMarketRequests] = useState<MarketRequest[]>([])
  const [oneTimeLink, setOneTimeLink] = useState<string | null>(null)
  const [adminStatus, setAdminStatus] = useState('일반 사용자')
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.userId === selectedAccountId) ?? null,
    [accounts, selectedAccountId],
  )

  async function refreshQueues() {
    const [invitePayload, marketPayload] = await Promise.all([
      jsonRequest('/api/admin/super-admin/tonight/partner-invites'),
      jsonRequest('/api/admin/super-admin/tonight/market-requests'),
    ])
    setInvites(Array.isArray(invitePayload.invites) ? invitePayload.invites as PartnerInvite[] : [])
    setMarketRequests(Array.isArray(marketPayload.requests) ? marketPayload.requests as MarketRequest[] : [])
  }

  useEffect(() => {
    if (mode === 'rehearsal') {
      setMarketRequests([{
        request_id: 'rehearsal-market-request',
        display_name: '김부산',
        school: '부산대학교',
        department: '경영학과',
        status: 'pending',
        verification_state: 'manual_review',
        revision: 1,
      }])
      return
    }
    void refreshQueues().catch(() => {
      // The surrounding protected page owns the main auth error surface.
    })
  }, [mode])

  async function searchAccounts() {
    if (query.trim().length < 2) return
    setBusy('search')
    setError(null)
    try {
      if (mode === 'rehearsal') {
        setAccounts([
          { userId: 'rehearsal-owner-candidate', name: '정장전', email: 'owner***@mail.com' },
          { userId: 'rehearsal-operator-candidate', name: '이가영', email: 'ops***@quantum.kr' },
        ])
        setVenues([
          { venueId: 'rehearsal-venue-board', name: '장전 보드라운지', address: '부산 금정구 금정로 68번길 12, 3층' },
          { venueId: 'rehearsal-venue-table', name: '장전 저녁테이블', address: '부산 금정구 부산대학로 48' },
        ])
        setNotice('체험 검색 결과를 불러왔어요. 실제 계정이나 업장은 변경하지 않았어요.')
        return
      }
      const payload = await jsonRequest(`/api/admin/super-admin/tonight/directory?q=${encodeURIComponent(query.trim())}`)
      const users = Array.isArray(payload.users) ? payload.users as Array<Record<string, unknown>> : []
      setAccounts(users.map((row) => ({
        userId: String(row.user_id ?? ''),
        name: String(row.display_name ?? '이름 미설정 계정'),
        email: typeof row.email_hint === 'string' ? row.email_hint : null,
      })).filter((row) => row.userId))
      const venueRows = Array.isArray(payload.venues) ? payload.venues as Array<Record<string, unknown>> : []
      setVenues(venueRows.map((row) => ({
        venueId: String(row.id ?? ''),
        name: String(row.name ?? '업장'),
        address: typeof row.address === 'string' ? row.address : null,
      })).filter((row) => row.venueId))
    } catch {
      setError('계정 검색 결과를 불러오지 못했어요.')
    } finally {
      setBusy(null)
    }
  }

  async function loadAdminState(userId: string) {
    if (mode === 'rehearsal') {
      setAdminStatus(userId === 'rehearsal-operator-candidate' ? 'admin' : '일반 사용자')
      return
    }
    const payload = await jsonRequest(`/api/admin/super-admin/tonight/access/admin?user_id=${encodeURIComponent(userId)}`)
    const rows = Array.isArray(payload.memberships) ? payload.memberships as Array<Record<string, unknown>> : []
    const state = rows[0]
    setAdminStatus(state?.is_active === true ? String(state.role ?? '운영자') : '일반 사용자')
  }

  async function grantAdmin() {
    if (!selectedAccountId) return
    setBusy('admin')
    setError(null)
    try {
      if (mode === 'rehearsal') {
        setAdminStatus('admin')
        setNotice('체험 운영자 권한을 부여했어요. 실제 계정 권한은 변경하지 않았어요.')
        return
      }
      const statePayload = await jsonRequest(`/api/admin/super-admin/tonight/access/admin?user_id=${encodeURIComponent(selectedAccountId)}`)
      const rows = Array.isArray(statePayload.memberships) ? statePayload.memberships as Array<Record<string, unknown>> : []
      const revision = Number(rows[0]?.revision ?? 0)
      await jsonRequest('/api/admin/super-admin/tonight/access/admin', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_id: selectedAccountId, role: 'admin', expected_revision: revision, idempotency_key: idempotencyKey('onboarding_admin') }),
      })
      setAdminStatus('admin')
      setNotice('운영자 권한을 부여했어요. 다음 로그인부터 운영 화면이 열립니다.')
    } catch {
      setError('운영자 권한을 부여하지 못했어요. 재로그인 후 최신 상태로 다시 시도해 주세요.')
    } finally {
      setBusy(null)
    }
  }

  async function createPartnerInvite() {
    if (!selectedAccountId || !selectedVenueId) return
    setBusy('partner')
    setError(null)
    setOneTimeLink(null)
    try {
      if (mode === 'rehearsal') {
        const account = accounts.find((item) => item.userId === selectedAccountId)
        const venue = venues.find((item) => item.venueId === selectedVenueId)
        if (!account || !venue) throw new Error('rehearsal_selection_missing')
        const invite: PartnerInvite = {
          invite_id: `rehearsal-partner-invite-${Date.now()}`,
          venue_name: venue.name,
          invited_user_name: account.name,
          invited_user_email: account.email,
          claimed_user_name: null,
          claimed_user_email: null,
          status: 'pending',
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString(),
          revision: 1,
        }
        setInvites((current) => [invite, ...current])
        setOneTimeLink(`${window.location.origin}/onboarding/partner/rehearsal-invite`)
        setNotice('체험 업장 초대 링크를 만들었어요. 실제 계정이나 업장 권한은 변경하지 않았어요.')
        return
      }
      const state = await jsonRequest(`/api/admin/super-admin/tonight/access/partner?user_id=${encodeURIComponent(selectedAccountId)}&venue_id=${encodeURIComponent(selectedVenueId)}`)
      const membershipState = state.membership_state && typeof state.membership_state === 'object'
        ? state.membership_state as Record<string, unknown>
        : {}
      const payload = await jsonRequest('/api/admin/super-admin/tonight/partner-invites', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          venue_id: selectedVenueId,
          invited_user_id: selectedAccountId,
          partner_role: partnerRole,
          expires_in_hours: 24,
          expected_membership_revision: Number(membershipState.revision ?? 0),
          idempotency_key: idempotencyKey('partner_invite'),
        }),
      })
      const invitePath = typeof payload.invite_path === 'string' ? payload.invite_path : null
      if (!invitePath) throw new Error('missing_invite_path')
      setOneTimeLink(`${window.location.origin}${invitePath}`)
      setNotice('24시간 동안 한 번만 수락할 수 있는 업장 초대 링크를 만들었어요.')
      await refreshQueues()
    } catch {
      setError('업장 초대 링크를 만들지 못했어요. 현재 권한 상태를 새로 확인해 주세요.')
    } finally {
      setBusy(null)
    }
  }

  async function decideMarketRequest(request: MarketRequest, decision: 'approve' | 'reject') {
    setBusy(`market-${request.request_id}`)
    setError(null)
    try {
      if (mode === 'rehearsal') {
        setMarketRequests((current) => current.filter((item) => item.request_id !== request.request_id))
        setNotice(decision === 'approve' ? '체험 부산대 자격을 승인했어요.' : '체험 인증 요청을 반려했어요.')
        return
      }
      await jsonRequest(`/api/admin/super-admin/tonight/market-requests/${encodeURIComponent(request.request_id)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision, expected_revision: request.revision, idempotency_key: idempotencyKey(`market_${decision}`) }),
      })
      setNotice(decision === 'approve' ? '부산대 파일럿 자격을 승인했어요.' : '인증 요청을 반려했어요.')
      await refreshQueues()
    } catch {
      setError('인증 요청을 처리하지 못했어요. 최신 상태로 다시 시도해 주세요.')
    } finally {
      setBusy(null)
    }
  }

  async function decideInvite(invite: PartnerInvite, decision: 'approve' | 'cancel') {
    setBusy(`invite-${invite.invite_id}`)
    setError(null)
    try {
      if (mode === 'rehearsal') {
        setInvites((current) => current.map((item) => item.invite_id === invite.invite_id ? {
          ...item,
          status: decision === 'approve' ? 'approved' : 'cancelled',
          revision: item.revision + 1,
        } : item))
        setNotice(decision === 'approve' ? '체험 업장 연결을 승인했어요.' : '체험 업장 초대를 취소했어요.')
        return
      }
      const path = `/api/admin/super-admin/tonight/partner-invites/${encodeURIComponent(invite.invite_id)}${decision === 'approve' ? '/approve' : ''}`
      await jsonRequest(path, {
        method: decision === 'approve' ? 'POST' : 'DELETE', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expected_revision: invite.revision, idempotency_key: idempotencyKey(`partner_${decision}`) }),
      })
      setNotice(decision === 'approve' ? '업장 연결을 승인했어요.' : '업장 초대를 취소했어요.')
      await refreshQueues()
    } catch {
      setError('업장 초대 상태가 바뀌었어요. 새로고침 후 다시 시도해 주세요.')
    } finally {
      setBusy(null)
    }
  }

  function simulateInviteClaim(invite: PartnerInvite) {
    if (mode !== 'rehearsal' || invite.status !== 'pending') return
    setInvites((current) => current.map((item) => item.invite_id === invite.invite_id ? {
      ...item,
      claimed_user_name: item.invited_user_name,
      claimed_user_email: item.invited_user_email,
      status: 'claimed',
      revision: item.revision + 1,
    } : item))
    setNotice('초대받은 계정의 수락을 체험했어요. 이제 최고관리자가 최종 승인할 차례예요.')
  }

  return (
    <section className={`${PEACH_PANEL} overflow-hidden xl:col-span-2`} aria-labelledby="safe-onboarding-title">
      <div className="border-b border-[#ead9d2] p-5 sm:p-6">
        <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 text-[#b94b3f]" aria-hidden /><div><h2 id="safe-onboarding-title" className="font-black">안전한 계정·업장 온보딩</h2><p className="mt-1 text-sm font-semibold leading-6 text-[#8b7e78]">공개 가입은 모두 일반 사용자예요. 운영자는 여기서 부여하고, 업장은 일회용 초대 수락 뒤 승인합니다.</p></div></div>
      </div>
      <div className="grid gap-5 p-5 lg:grid-cols-2 sm:p-6">
        <div>
          <label htmlFor="onboarding-account-query" className="text-sm font-black">계정 검색</label>
          <div className="mt-2 flex gap-2"><input id="onboarding-account-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름 또는 이메일" className="min-h-12 min-w-0 flex-1 rounded-xl border border-[#ddcbc3] px-4 text-sm font-bold" /><button type="button" onClick={() => void searchAccounts()} disabled={busy !== null || query.trim().length < 2} className="min-h-12 rounded-xl bg-[#292321] px-4 text-white disabled:opacity-40"><Search className="h-4 w-4" aria-hidden /><span className="sr-only">검색</span></button></div>
          <div className="mt-3 space-y-2">{accounts.map((account) => <button key={account.userId} type="button" onClick={() => { setSelectedAccountId(account.userId); void loadAdminState(account.userId).catch(() => setAdminStatus('확인 필요')) }} className={`w-full rounded-xl border p-3 text-left ${selectedAccountId === account.userId ? 'border-[#b94b3f] bg-[#fff0eb]' : 'border-[#ead9d2]'}`}><strong className="block text-sm">{account.name}</strong><span className="mt-1 block text-xs font-semibold text-[#8b7e78]">{account.email ?? '로그인 계정 확인됨'}</span></button>)}</div>
          {selectedAccount && <div className="mt-4 rounded-2xl bg-[#fff7f3] p-4"><p className="text-xs font-black text-[#b94b3f]">현재 상태</p><p className="mt-1 font-black">{selectedAccount.name} · {adminStatus}</p><p className="mt-3 text-xs font-black text-[#b94b3f]">다음 행동</p><p className="mt-1 text-sm font-semibold">운영자 부여 또는 특정 업장 초대 중 필요한 작업만 선택하세요.</p><button type="button" onClick={() => void grantAdmin()} disabled={busy !== null} className="mt-3 min-h-11 w-full rounded-xl border border-[#ddcbc3] bg-white px-4 text-sm font-black disabled:opacity-40"><UserCog className="mr-2 inline h-4 w-4" aria-hidden />운영자 권한 부여</button></div>}
        </div>
        <div>
          <h3 className="flex items-center gap-2 text-sm font-black"><Building2 className="h-4 w-4 text-[#b94b3f]" aria-hidden />업장 초대 링크 만들기</h3>
          <p className="mt-1 text-xs font-semibold leading-5 text-[#8b7e78]">계정과 업장을 고정한 24시간 일회용 링크예요. 수락 뒤 다시 승인해야 활성화됩니다.</p>
          <select aria-label="초대할 업장" value={selectedVenueId} onChange={(event) => setSelectedVenueId(event.target.value)} className="mt-3 min-h-12 w-full rounded-xl border border-[#ddcbc3] bg-white px-4 text-sm font-bold"><option value="">검색된 업장 선택</option>{venues.map((venue) => <option key={venue.venueId} value={venue.venueId}>{venue.name}{venue.address ? ` · ${venue.address}` : ''}</option>)}</select>
          <div className="mt-2 grid grid-cols-2 gap-2">{(['owner', 'staff'] as const).map((role) => <button key={role} type="button" aria-pressed={partnerRole === role} onClick={() => setPartnerRole(role)} className={`min-h-11 rounded-xl text-sm font-black ${partnerRole === role ? 'bg-[#b94b3f] text-white' : 'border border-[#ddcbc3] bg-white'}`}>{role === 'owner' ? '사장님' : '직원'}</button>)}</div>
          <button type="button" onClick={() => void createPartnerInvite()} disabled={!selectedAccountId || !selectedVenueId || busy !== null} className="mt-3 min-h-12 w-full rounded-xl bg-[#292321] px-4 text-sm font-black text-white disabled:opacity-40">업장 초대 링크 만들기</button>
          {oneTimeLink && <div className="mt-3 rounded-xl bg-emerald-50 p-3"><p className="break-all text-xs font-bold text-emerald-950">{oneTimeLink}</p><button type="button" onClick={() => void navigator.clipboard.writeText(oneTimeLink)} className="mt-2 min-h-10 rounded-lg bg-white px-3 text-xs font-black"><Copy className="mr-1 inline h-3 w-3" aria-hidden />한 번만 복사</button></div>}
        </div>
      </div>
      {(error || notice) && <div className={`mx-5 mb-5 rounded-xl p-3 text-sm font-bold sm:mx-6 sm:mb-6 ${error ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-900'}`} role={error ? 'alert' : 'status'}>{error ?? notice}</div>}
      <div className="grid border-t border-[#ead9d2] lg:grid-cols-2">
        <div className="border-b border-[#ead9d2] p-5 lg:border-b-0 lg:border-r sm:p-6"><h3 className="font-black">부산대 인증 요청</h3><p className="mt-1 text-xs font-semibold text-[#8b7e78]">폐기된 학교 이메일 값을 자동 승인하지 않고 직접 검토합니다.</p><div className="mt-3 space-y-2">{marketRequests.length === 0 ? <p className="text-sm font-semibold text-[#8b7e78]">대기 요청 없음</p> : marketRequests.map((request) => <div key={request.request_id} className="rounded-xl border border-[#ead9d2] p-3"><div className="flex items-center justify-between gap-2"><div><p className="text-sm font-black">{request.display_name ?? '이름 미설정'}</p><p className="mt-1 text-xs font-semibold text-[#8b7e78]">{request.school ?? '학교 확인 필요'} · {request.department ?? '학과 미설정'}</p></div><StatusPill tone="warn">검토 필요</StatusPill></div><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => void decideMarketRequest(request, 'reject')} disabled={busy !== null} className="min-h-10 rounded-lg border border-[#ddcbc3] text-xs font-black">반려</button><button type="button" onClick={() => void decideMarketRequest(request, 'approve')} disabled={busy !== null} className="min-h-10 rounded-lg bg-[#b94b3f] text-xs font-black text-white">승인</button></div></div>)}</div></div>
        <div className="p-5 sm:p-6">
          <h3 className="font-black">수락·승인 대기 업장 초대</h3>
          <div className="mt-3 space-y-2">
            {invites.length === 0 ? <p className="text-sm font-semibold text-[#8b7e78]">초대 없음</p> : invites.map((invite) => (
              <div key={invite.invite_id} className="rounded-xl border border-[#ead9d2] p-3">
                <div className="flex items-center justify-between gap-2"><p className="text-sm font-black">{invite.venue_name}</p><StatusPill tone={invite.status === 'claimed' ? 'warn' : invite.status === 'approved' ? 'good' : 'plain'}>{invite.status}</StatusPill></div>
                <dl className="mt-2 space-y-1 text-xs font-semibold text-[#665c58]">
                  <div className="flex gap-2"><dt className="font-black">초대 대상</dt><dd>{invite.invited_user_name ?? '이름 미설정'}{invite.invited_user_email ? ` · ${invite.invited_user_email}` : ''}</dd></div>
                  <div className="flex gap-2"><dt className="font-black">수락 계정</dt><dd>{invite.claimed_user_name ?? (invite.status === 'pending' ? '아직 수락 전' : '이름 미설정')}{invite.claimed_user_email ? ` · ${invite.claimed_user_email}` : ''}</dd></div>
                </dl>
                <p className="mt-2 text-xs font-semibold text-[#8b7e78]">만료 {new Date(invite.expires_at).toLocaleString('ko-KR')}</p>
                {['pending', 'claimed'].includes(invite.status) && (
                  <div className={`mt-3 grid gap-2 ${mode === 'rehearsal' && invite.status === 'pending' ? 'grid-cols-3' : 'grid-cols-2'}`}>
                    <button type="button" onClick={() => void decideInvite(invite, 'cancel')} disabled={busy !== null} className="min-h-10 rounded-lg border border-[#ddcbc3] text-xs font-black">취소</button>
                    {mode === 'rehearsal' && invite.status === 'pending' && <button type="button" onClick={() => simulateInviteClaim(invite)} disabled={busy !== null} className="min-h-10 rounded-lg border border-[#ddcbc3] bg-white text-xs font-black">초대 수락 체험</button>}
                    <button type="button" onClick={() => void decideInvite(invite, 'approve')} disabled={busy !== null || invite.status !== 'claimed'} className="min-h-10 rounded-lg bg-[#292321] text-xs font-black text-white disabled:opacity-40"><Check className="mr-1 inline h-3 w-3" aria-hidden />수락 후 승인</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

'use client'

import { Send } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useHistoryAccount } from '@/components/content-history/useHistoryAccount'
import { PLACE_CATEGORIES, parsePlaceSuggestion, type PlaceCandidate, type PlaceCategory } from '@/lib/place-worldcup/contract'

type Attempt = { fingerprint: string; key: string }

export default function PlaceSuggestionForm({ category, candidates }: { category: PlaceCategory; candidates: readonly PlaceCandidate[] }) {
  const account = useHistoryAccount()
  const [kind, setKind] = useState<'new' | 'correction'>('new')
  const [target, setTarget] = useState('')
  const [placeName, setPlaceName] = useState('')
  const [address, setAddress] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)
  const [formOwner, setFormOwner] = useState<string | null>(null)
  const attempt = useRef<Attempt | null>(null)
  const requestRef = useRef<AbortController | null>(null)
  const authGeneration = useRef(0)
  const accountRef = useRef(account)
  accountRef.current = account
  const label = useMemo(() => PLACE_CATEGORIES.find(item => item.id === category)?.label ?? '장소', [category])
  const activeForm = isAccountId(account) && formOwner === account

  const clearDraft = useCallback(() => {
    attempt.current = null
    setKind('new')
    setTarget('')
    setPlaceName('')
    setAddress('')
    setSourceUrl('')
    setNote('')
    setBusy(false)
    setNotice(null)
  }, [])

  useEffect(() => {
    authGeneration.current += 1
    requestRef.current?.abort()
    requestRef.current = null
    clearDraft()
    setFormOwner(isAccountId(account) ? account : null)
  }, [account, category, clearDraft])

  function invalidateAccountLease(message: string) {
    authGeneration.current += 1
    requestRef.current?.abort()
    requestRef.current = null
    clearDraft()
    setFormOwner(null)
    setNotice({ kind: 'error', message })
  }

  function changeKind(next: 'new' | 'correction') {
    setKind(next)
    setTarget('')
    setPlaceName('')
    setAddress('')
    setSourceUrl('')
    setNote('')
    setNotice(null)
    attempt.current = null
  }

  function changeTarget(id: string) {
    setTarget(id)
    const candidate = candidates.find(item => item.id === id)
    setPlaceName(candidate?.name ?? '')
    setAddress(candidate?.address ?? '')
    setSourceUrl('')
    setNotice(null)
    attempt.current = null
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const requestAccount = accountRef.current
    const requestGeneration = authGeneration.current
    if (busy || !isAccountId(requestAccount) || formOwner !== requestAccount) return
    setNotice(null)
    try {
      const fingerprint = JSON.stringify({ kind, category, target, placeName, address, sourceUrl, note })
      if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: crypto.randomUUID() }
      const payload = parsePlaceSuggestion({
        kind,
        category,
        targetCandidateId: kind === 'correction' ? target : null,
        placeName,
        address,
        sourceUrl,
        note,
        idempotencyKey: attempt.current.key,
      })
      setBusy(true)
      const controller = new AbortController()
      requestRef.current = controller
      const response = await fetch('/api/place-worldcup/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Expected-Account': requestAccount },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
      const data: unknown = await response.json()
      if (requestGeneration !== authGeneration.current || accountRef.current !== requestAccount || controller.signal.aborted) return
      if (response.status === 401 || response.status === 403) {
        invalidateAccountLease(messageFrom(data, '로그인 계정이 바뀌었어요. 현재 계정에서 다시 작성해 주세요.'))
        return
      }
      if (!response.ok) {
        throw new Error(messageFrom(data, '제안을 보내지 못했어요. 잠시 후 다시 시도해 주세요.'))
      }
      setNotice({ kind: 'success', message: '검수 요청을 보냈어요. Quantum 운영자 승인 전에는 후보에 표시되지 않아요.' })
      attempt.current = null
      setTarget('')
      setPlaceName('')
      setAddress('')
      setSourceUrl('')
      setNote('')
    } catch (error) {
      if (requestGeneration === authGeneration.current && accountRef.current === requestAccount) {
        setNotice({ kind: 'error', message: error instanceof Error ? error.message : '입력한 장소 정보를 확인해 주세요.' })
      }
    } finally {
      if (requestGeneration === authGeneration.current && accountRef.current === requestAccount) {
        requestRef.current = null
        setBusy(false)
      }
    }
  }

  return <details className="mt-5 rounded-2xl border border-boot-hairline bg-white p-4">
    <summary className="min-h-11 cursor-pointer py-2 font-black">후보 제안·정보 수정 요청</summary>
    {activeForm ? <form onSubmit={submit} className="mt-3 space-y-4">
      <fieldset>
        <legend className="text-xs font-bold text-boot-muted">요청 종류</legend>
        <div className="mt-2 flex gap-2">
          <button type="button" aria-pressed={kind === 'new'} onClick={() => changeKind('new')} className={`min-h-11 flex-1 rounded-xl border px-3 text-sm font-bold ${kind === 'new' ? 'border-boot-primary bg-boot-soft text-boot-primary' : 'border-boot-hairline'}`}>새 후보</button>
          <button type="button" disabled={candidates.length === 0} aria-pressed={kind === 'correction'} onClick={() => changeKind('correction')} className={`min-h-11 flex-1 rounded-xl border px-3 text-sm font-bold disabled:opacity-40 ${kind === 'correction' ? 'border-boot-primary bg-boot-soft text-boot-primary' : 'border-boot-hairline'}`}>공개 후보 수정</button>
        </div>
      </fieldset>
      {kind === 'correction' && <label className="block text-sm font-bold">수정할 후보
        <select required value={target} onChange={event => changeTarget(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-boot-hairline bg-white px-3 font-normal">
          <option value="">선택해 주세요</option>
          {candidates.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
        </select>
      </label>}
      <label className="block text-sm font-bold">{label} 이름
        <input required maxLength={80} value={placeName} onChange={event => { setPlaceName(event.target.value); attempt.current = null }} className="mt-2 min-h-12 w-full rounded-xl border border-boot-hairline px-3 font-normal" placeholder="지도에 표시된 업장명"/>
      </label>
      <label className="block text-sm font-bold">주소
        <input required maxLength={200} value={address} onChange={event => { setAddress(event.target.value); attempt.current = null }} className="mt-2 min-h-12 w-full rounded-xl border border-boot-hairline px-3 font-normal" placeholder="도로명 또는 지번 주소"/>
      </label>
      <label className="block text-sm font-bold">확인 근거 링크
        <input required type="url" inputMode="url" maxLength={500} value={sourceUrl} onChange={event => { setSourceUrl(event.target.value); attempt.current = null }} className="mt-2 min-h-12 w-full rounded-xl border border-boot-hairline px-3 font-normal" placeholder="https://로 시작하는 공식 페이지"/>
      </label>
      <label className="block text-sm font-bold">검수 참고사항 <span className="font-normal text-boot-muted">(선택)</span>
        <textarea maxLength={500} rows={3} value={note} onChange={event => { setNote(event.target.value); attempt.current = null }} className="mt-2 w-full rounded-xl border border-boot-hairline p-3 font-normal" placeholder="운영시간 변경 등 운영자가 확인할 내용"/>
      </label>
      <p className="text-xs leading-5 text-boot-muted">링크는 검수 근거로 저장만 하며 서버가 자동으로 접속하지 않아요. 업장 관계자도 공개 승인 권한은 없고, Quantum 운영자가 현재 운영 여부를 확인합니다.</p>
      <button disabled={busy} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-boot-primary px-4 font-black text-white disabled:opacity-50"><Send size={16}/>{busy ? '중복 확인 중…' : 'Quantum 검수 요청 보내기'}</button>
    </form> : <p className="mt-3 rounded-xl border border-dashed p-4 text-sm text-boot-muted">로그인 계정을 확인한 뒤 제안서를 작성할 수 있어요.</p>}
    {notice && <p role={notice.kind === 'error' ? 'alert' : 'status'} className={`mt-3 text-sm font-bold ${notice.kind === 'error' ? 'text-red-700' : 'text-emerald-700'}`}>{notice.message}</p>}
  </details>
}

function messageFrom(value: unknown, fallback: string) {
  return value && typeof value === 'object' && 'message' in value && typeof value.message === 'string' ? value.message : fallback
}

function isAccountId(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value)
}

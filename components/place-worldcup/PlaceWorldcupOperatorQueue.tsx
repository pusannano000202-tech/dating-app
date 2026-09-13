'use client'

import { ExternalLink, RefreshCw, ShieldCheck, ShieldX } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useHistoryAccount } from '@/components/content-history/useHistoryAccount'
import { PLACE_CATEGORIES, parsePlaceQueue, type PlaceQueueItem } from '@/lib/place-worldcup/contract'

export default function PlaceWorldcupOperatorQueue() {
  const account = useHistoryAccount()
  const [items, setItems] = useState<readonly PlaceQueueItem[]>([])
  const [itemsOwner, setItemsOwner] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [generation, setGeneration] = useState(0)
  const attempts = useRef(new Map<string, string>())
  const authGeneration = useRef(0)
  const accountRef = useRef(account)
  accountRef.current = account
  const reload = useCallback(() => setGeneration(value => value + 1), [])

  function clearPrivilegedState(message: string | null = null) {
    authGeneration.current += 1
    attempts.current.clear()
    setItems([])
    setItemsOwner(null)
    setBusy(null)
    setLoading(false)
    setError(message)
  }

  useEffect(() => {
    const requestAccount = account
    const requestGeneration = ++authGeneration.current
    attempts.current.clear()
    setItems([])
    setItemsOwner(null)
    setBusy(null)
    setError(null)
    if (!isAccountId(requestAccount)) {
      setLoading(requestAccount === undefined)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    void (async () => {
      try {
        const response = await fetch('/api/place-worldcup/operator', {
          cache: 'no-store',
          headers: { 'X-Expected-Account': requestAccount },
          signal: controller.signal,
        })
        const data: unknown = await response.json()
        if (requestGeneration !== authGeneration.current || accountRef.current !== requestAccount || controller.signal.aborted) return
        if (response.status === 401 || response.status === 403) {
          clearPrivilegedState(messageFrom(data, '운영자 세션을 다시 확인해 주세요.'))
          return
        }
        if (!response.ok) throw new Error(messageFrom(data, '검수 대기열을 불러오지 못했어요.'))
        setItems(parsePlaceQueue(data))
        setItemsOwner(requestAccount)
      } catch (error) {
        if (requestGeneration === authGeneration.current && accountRef.current === requestAccount && !controller.signal.aborted) {
          setError(error instanceof Error ? error.message : '검수 대기열을 불러오지 못했어요.')
        }
      } finally {
        if (requestGeneration === authGeneration.current && accountRef.current === requestAccount && !controller.signal.aborted) setLoading(false)
      }
    })()
    return () => controller.abort()
  }, [account, generation])

  async function review(item: PlaceQueueItem, decision: 'approve' | 'reject') {
    const requestAccount = accountRef.current
    const requestGeneration = authGeneration.current
    if (!isAccountId(requestAccount) || itemsOwner !== requestAccount) return
    const fingerprint = `${item.entityKind}:${item.id}:${item.revision}:${decision}`
    if (busy) return
    setBusy(fingerprint)
    setError(null)
    try {
      if (!attempts.current.has(fingerprint)) attempts.current.set(fingerprint, crypto.randomUUID())
      const response = await fetch('/api/place-worldcup/operator', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Expected-Account': requestAccount },
        body: JSON.stringify({
          entity_kind: item.entityKind,
          entity_id: item.id,
          decision,
          expected_revision: item.revision,
          idempotency_key: attempts.current.get(fingerprint),
        }),
      })
      const data: unknown = await response.json()
      if (requestGeneration !== authGeneration.current || accountRef.current !== requestAccount) return
      if (response.status === 401 || response.status === 403) {
        clearPrivilegedState(messageFrom(data, '운영자 세션을 다시 확인해 주세요.'))
        return
      }
      if (!response.ok) throw new Error(messageFrom(data, '검수 결과를 저장하지 못했어요.'))
      attempts.current.delete(fingerprint)
      reload()
    } catch (error) {
      if (requestGeneration === authGeneration.current && accountRef.current === requestAccount) {
        setError(error instanceof Error ? error.message : '검수 결과를 저장하지 못했어요.')
      }
    } finally {
      if (requestGeneration === authGeneration.current && accountRef.current === requestAccount) setBusy(null)
    }
  }

  const visibleItems = isAccountId(account) && itemsOwner === account ? items : []

  return <section className="mx-auto max-w-4xl px-5 py-8" aria-labelledby="place-review-title">
    <p className="text-xs font-black tracking-wide text-boot-primary">QUANTUM OPERATOR ONLY</p>
    <h1 id="place-review-title" className="mt-2 text-3xl font-black tracking-tight">장소 후보 검수</h1>
    <p className="mt-3 max-w-2xl text-sm leading-6 text-boot-muted">공식 근거와 현재 운영 여부를 사람이 확인한 뒤 공개합니다. 업장 파트너 권한만으로는 승인할 수 없습니다.</p>
    {error && <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">{error}<button type="button" onClick={reload} className="ml-3 inline-flex min-h-11 items-center gap-1 underline"><RefreshCw size={14}/>다시 불러오기</button></div>}
    {loading ? <p aria-live="polite" className="mt-6 rounded-2xl border p-5">대기열을 확인하고 있어요…</p> : visibleItems.length === 0 ? <p className="mt-6 rounded-2xl border border-dashed p-6 text-boot-muted">검수할 후보가 없습니다.</p> : <div className="mt-6 space-y-4">
      {visibleItems.map(item => {
        const category = PLACE_CATEGORIES.find(value => value.id === item.category)?.label ?? item.category
        return <article key={`${item.entityKind}:${item.id}`} className="rounded-2xl border border-boot-hairline bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-black text-boot-primary">{item.entityKind === 'candidate' ? '운영 조사 초안' : item.kind === 'correction' ? '정보 수정 요청' : '사용자 후보 제안'} · {category}</p><span className="text-xs text-boot-muted">revision {item.revision}</span></div>
          <h2 className="mt-3 text-xl font-black">{item.name}</h2>
          <p className="mt-1 text-sm text-boot-muted">{item.address}</p>
          {item.kind === 'correction' && <p className="mt-2 text-xs font-bold text-amber-800">수정 기준 대상 revision {item.targetCandidateRevision} · 달라졌다면 승인하지 마세요.</p>}
          {item.note && <p className="mt-3 rounded-xl bg-stone-50 p-3 text-sm leading-6">{item.note}</p>}
          <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-bold underline">제출된 근거 직접 열기<ExternalLink size={14}/></a>
          <p className="text-xs leading-5 text-boot-muted">자동 확인이 아닙니다. 주소·공식 매장 목록·현재 운영 여부를 직접 대조해 주세요.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button type="button" disabled={busy !== null} onClick={() => void review(item, 'approve')} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 font-black text-white disabled:opacity-45"><ShieldCheck size={17}/>{busy === `${item.entityKind}:${item.id}:${item.revision}:approve` ? '승인 중…' : '확인 후 승인'}</button>
            <button type="button" disabled={busy !== null} onClick={() => void review(item, 'reject')} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-red-200 px-4 font-black text-red-700 disabled:opacity-45"><ShieldX size={17}/>{busy === `${item.entityKind}:${item.id}:${item.revision}:reject` ? '반려 중…' : '반려'}</button>
          </div>
        </article>
      })}
    </div>}
  </section>
}

function messageFrom(value: unknown, fallback: string) {
  return value && typeof value === 'object' && 'message' in value && typeof value.message === 'string' ? value.message : fallback
}

function isAccountId(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value)
}

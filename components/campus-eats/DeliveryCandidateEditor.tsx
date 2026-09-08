'use client'

import { useEffect, useState } from 'react'
import { Check, Plus, RotateCcw } from 'lucide-react'
import { formatDeliveryPrice, validateDeliveryCandidate, type DeliveryCandidate } from '@/lib/campus-eats/delivery'
import { DELIVERY_PUBLIC_REGION, deliveryVerification } from '@/lib/campus-eats/delivery-verification'

const fieldClass = 'mt-1 min-h-11 w-full rounded-lg border border-[#d9c4ba] bg-white px-3 text-sm'
function blank(): DeliveryCandidate {
  return { id: `delivery-${crypto.randomUUID()}`, storeName: '', menuName: '', region: '부산대 정문', menuPrice: null, mandatoryOptionPrice: null, minimumOrderPrice: null, deliveryFee: null, singleServing: false, membershipCondition: '', benefit: null, orderUrl: '', sourceUrl: '', verifiedAt: null, benefitVerifiedAt: null, expiresAt: null, imagePath: null, imageRights: null, publicationStatus: 'draft', revision: 0 }
}

export default function DeliveryCandidateEditor() {
  const [rows, setRows] = useState<DeliveryCandidate[]>([])
  const [photoAvailability, setPhotoAvailability] = useState<Record<string, boolean>>({})
  const [draft, setDraft] = useState<DeliveryCandidate | null>(null)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  async function load() {
    setBusy(true)
    try {
      const response = await fetch('/api/admin/campus-eats/delivery', { cache: 'no-store' })
      if (!response.ok) throw new Error(response.status === 403 ? '최근 재인증한 최고관리자만 관리할 수 있어요.' : '후보를 불러오지 못했어요. 로그인과 DB 연결을 확인해 주세요.')
      const payload = await response.json() as { candidates: DeliveryCandidate[]; photoAvailability: Record<string, boolean> }
      setRows(payload.candidates)
      setPhotoAvailability(payload.photoAvailability)
      setNotice('')
    } catch (error) { setNotice(error instanceof Error ? error.message : '조회 실패') }
    finally { setBusy(false) }
  }
  useEffect(() => { void load() }, [])
  function edit(row: DeliveryCandidate) { setDraft({ ...row, region: DELIVERY_PUBLIC_REGION }); setAcknowledged(false); setNotice('') }
  function update<K extends keyof DeliveryCandidate>(key: K, value: DeliveryCandidate[K]) { setAcknowledged(false); setDraft((old) => old ? { ...old, [key]: value } : old) }
  async function save() {
    if (!draft || busy) return
    const result = validateDeliveryCandidate(draft)
    if (!result.ok) { setNotice('필수 항목과 허용된 배달 링크를 확인해 주세요. 금액 미확인은 빈칸으로 둡니다.'); return }
    if (draft.publicationStatus === 'verified' && (!acknowledged || !deliveryVerification(draft, new Date()).eligible)) { setNotice('1인 메뉴 주문 조건과 확인 시각을 검증하고 공개 검수 확인을 선택해 주세요.'); return }
    setBusy(true)
    try {
      const response = await fetch('/api/admin/campus-eats/delivery', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) })
      if (!response.ok) throw new Error(response.status === 409 ? '다른 관리자가 수정했어요. 목록을 다시 불러온 후 비교해 주세요. 입력은 유지됩니다.' : '저장하지 못했어요. 권한·연결을 확인해 주세요.')
      const saved = await response.json() as { revision: number }
      setDraft({ ...draft, revision: saved.revision })
      setAcknowledged(false)
      await load()
      setNotice('후보가 저장됐어요. 공개 조건은 조회 시각에도 다시 검사됩니다.')
    } catch (error) { setNotice(error instanceof Error ? error.message : '저장 실패') }
    finally { setBusy(false) }
  }
  const textFields: { key: 'storeName' | 'menuName' | 'region' | 'membershipCondition' | 'orderUrl' | 'sourceUrl'; label: string }[] = [
    { key: 'storeName', label: '가게 이름' }, { key: 'menuName', label: '대표 1인 메뉴' }, { key: 'region', label: '확인한 공공 배달 권역 (개인 주소 금지)' },
    { key: 'membershipCondition', label: '회원·시간 조건 (없다면 없음으로 명시)' }, { key: 'orderUrl', label: '배달 서비스 주문 확인 링크 (HTTPS)' }, { key: 'sourceUrl', label: '가게·메뉴 조건을 확인한 원본 링크' },
  ]
  const amounts: { key: 'menuPrice' | 'mandatoryOptionPrice' | 'minimumOrderPrice' | 'deliveryFee'; label: string }[] = [
    { key: 'menuPrice', label: '메뉴 가격' }, { key: 'mandatoryOptionPrice', label: '필수 옵션 추가 금액' }, { key: 'minimumOrderPrice', label: '해당 메뉴에 적용되는 최소 주문 금액' }, { key: 'deliveryFee', label: '배달비 (미확인은 빈칸)' },
  ]
  return <main className="min-h-screen bg-[#fff9f6] px-4 pb-24 pt-6 text-[#292321]"><div className="mx-auto max-w-5xl">
    <h1 className="text-2xl font-black">배달 후보 검수</h1><p className="mt-2 text-sm leading-6 text-[#77645b]">가게와 메뉴, 주문 조건의 출처를 직접 확인해 기록합니다. 확인하지 않은 혜택·배달비·사진 권리는 추정하지 않습니다.</p>
    <div className="my-4 flex gap-2"><button disabled={busy} onClick={() => edit(blank())} className="flex min-h-11 items-center gap-2 rounded-xl bg-[#B94B3F] px-4 text-sm font-bold text-white"><Plus size={17} /> 후보 추가</button><button disabled={busy} onClick={() => void load()} className="flex min-h-11 items-center gap-2 rounded-xl border border-[#d9c4ba] px-4 text-sm"><RotateCcw size={17} /> 목록 새로고침</button></div>
    {notice ? <p role="status" className="my-4 rounded-xl bg-white p-4 text-sm leading-6">{notice}</p> : null}
    <div className="grid items-start gap-5 md:grid-cols-[250px_1fr]">
      <section aria-label="등록된 배달 후보" className="space-y-2">{rows.length ? rows.map((row) => <button key={row.id} type="button" onClick={() => edit(row)} className="w-full rounded-xl border border-[#eadbd4] bg-white p-4 text-left"><strong className="block text-sm">{row.storeName} · {row.menuName}</strong><span className="mt-1 block text-xs text-[#77645b]">{formatDeliveryPrice(row.menuPrice)} · {deliveryVerification(row, new Date()).reason}</span>{photoAvailability[row.id] !== true ? <span className="mt-1 block text-xs font-bold text-[#B94B3F]">사진 파일 미확인 · 공개 제외</span> : null}</button>) : <p className="rounded-xl border border-[#eadbd4] bg-white p-4 text-sm">등록된 후보가 없거나 아직 조회하지 못했어요.</p>}</section>
      {draft ? <form onSubmit={(event) => { event.preventDefault(); void save() }} className="rounded-2xl border border-[#eadbd4] bg-white p-5">
        <h2 className="font-black">{draft.revision ? '후보 수정' : '새 후보'}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {textFields.map(({ key, label }) => <label key={key} className="text-xs font-bold">{label}<input className={fieldClass} required readOnly={key === 'region'} maxLength={key.endsWith('Url') ? 2048 : 200} value={key === 'region' ? DELIVERY_PUBLIC_REGION : draft[key]} onChange={(event) => update(key, event.target.value)} /></label>)}
          {amounts.map(({ key, label }) => <label key={key} className="text-xs font-bold">{label}<input className={fieldClass} type="number" min={0} max={1000000} step={1} value={draft[key] ?? ''} onChange={(event) => update(key, event.target.value === '' ? null : Number(event.target.value))} /></label>)}
          <label className="text-xs font-bold">혜택 설명 (없으면 빈칸)<input className={fieldClass} maxLength={300} value={draft.benefit ?? ''} onChange={(event) => update('benefit', event.target.value || null)} /></label>
          <label className="text-xs font-bold">공개 상태<select className={fieldClass} value={draft.publicationStatus} onChange={(event) => update('publicationStatus', event.target.value as DeliveryCandidate['publicationStatus'])}><option value="draft">검수 중</option><option value="verified">확인 완료 · 조건 충족 시 공개</option><option value="retired">공개 중단</option></select></label>
          {(['verifiedAt', 'benefitVerifiedAt', 'expiresAt'] as const).map((key) => <label key={key} className="text-xs font-bold">{key === 'verifiedAt' ? '메뉴·주문 조건 확인 시각' : key === 'benefitVerifiedAt' ? '혜택 확인 시각' : '알려진 조건 만료 시각 (선택)'}<input className={fieldClass} type="datetime-local" value={draft[key] ? localDateTime(draft[key]!) : ''} onChange={(event) => update(key, event.target.value ? new Date(event.target.value).toISOString() : null)} /></label>)}
          <label className="text-xs font-bold">대표 메뉴 사진 경로 (공개 시 필수)<input className={fieldClass} value={draft.imagePath ?? ''} onChange={(event) => update('imagePath', event.target.value || null)} placeholder="/campus-eats/delivery/menu.webp" /></label>
          <label className="text-xs font-bold sm:col-span-2">사진 사용 권리 근거 (공개 시 필수)<input className={fieldClass} maxLength={500} value={draft.imageRights ?? ''} onChange={(event) => update('imageRights', event.target.value || null)} /></label>
        </div>
        <label className="mt-4 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={draft.singleServing} onChange={(event) => update('singleServing', event.target.checked)} /> 한 사람용 메뉴임을 확인했습니다.</label>
        <label className="flex min-h-11 items-start gap-2 text-sm leading-6"><input className="mt-1" type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /> 원본 출처의 메뉴 한 개 주문 조건·회원 조건·확인 시각과 사진 사용 권리를 직접 검수했습니다.</label>
        <button disabled={busy} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#B94B3F] text-sm font-bold text-white disabled:opacity-50"><Check size={17} /> {busy ? '저장 확인 중' : '후보 저장'}</button>
      </form> : <p className="rounded-2xl border border-[#eadbd4] bg-white p-6 text-sm">후보를 선택하거나 새 후보를 추가해 주세요.</p>}
    </div>
  </div></main>
}

function localDateTime(iso: string) { const value = new Date(iso); return new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 16) }

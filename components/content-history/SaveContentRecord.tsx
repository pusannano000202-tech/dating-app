'use client'
import Link from 'next/link'
import { BookmarkCheck, BookmarkPlus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ContentRecordInput } from '@/lib/content-history/contract'
import { useHistoryAccount } from './useHistoryAccount'

export default function SaveContentRecord({snapshot}:{snapshot:ContentRecordInput}) {
  const account=useHistoryAccount()
  const accountReady=typeof account==='string'&&account!=='unavailable'
  const [confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[recordId,setRecordId]=useState<string|null>(null),[error,setError]=useState<string|null>(null)
  const generation=useRef(0)
  const operation=useRef(false)
  const scopeKey=JSON.stringify([account,snapshot.sourceKey])
  const [savedFor,setSavedFor]=useState<string|null>(null)
  useEffect(()=>{generation.current+=1;operation.current=false;setConfirm(false);setBusy(false);setRecordId(null);setSavedFor(null);setError(null);return ()=>{generation.current+=1}},[scopeKey])
  async function save() {
    if(operation.current||!accountReady||!account) return
    operation.current=true
    const current=generation.current
    setBusy(true);setError(null)
    try {
      const response=await fetch('/api/content-history',{method:'POST',headers:{'Content-Type':'application/json','X-Expected-Account':account},body:JSON.stringify(snapshot)})
      const data=await response.json()
      if(current!==generation.current) return
      if(response.status===401||response.status===403){setConfirm(false);setRecordId(null);setSavedFor(null)}
      if(!response.ok) throw new Error(data.message??'계정에 저장하지 못했어요. 기기 기록은 그대로예요.')
      if(typeof data.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.id)) throw new Error('저장 상태를 확인하지 못했어요. 다시 확인해 주세요.')
      setRecordId(data.id);setSavedFor(scopeKey);setConfirm(false)
    } catch(error) {if(current===generation.current)setError(error instanceof Error?error.message:'계정 저장에 실패했어요. 기기 기록은 유지돼요.')}
    finally {if(current===generation.current){operation.current=false;setBusy(false)}}
  }
  const winner=snapshot.candidates.find(item=>item.id===snapshot.winnerId)
  return <section aria-label="내 결과 계정 저장" className="mt-5 rounded-2xl border border-boot-hairline bg-white p-4 text-left">
    <p className="text-xs font-bold text-boot-muted">내가 고른 결과 · 비공개 기록</p>
    {recordId&&savedFor===scopeKey?<><p role="status" className="mt-2 flex items-center gap-2 font-bold text-boot-primary"><BookmarkCheck size={18}/>계정에 저장했어요</p><Link href={`/community/content-history/${recordId}`} className="mt-3 flex min-h-11 items-center font-bold underline">저장한 결과 보기 →</Link></>:<>
      <button type="button" disabled={busy||!accountReady} onClick={()=>setConfirm(!confirm)} className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-boot-primary px-3 font-bold text-white disabled:opacity-50"><BookmarkPlus size={18}/>{accountReady?'내 계정에 이 결과 저장':'로그인 상태를 확인해 주세요'}</button>
      {confirm&&<div className="mt-3 space-y-3">
        <p className="text-sm leading-6">현재 로그인한 내 계정에 <strong>{winner?.name}</strong> 1위와 {snapshot.candidates.length}개 후보·{snapshot.selections.length}번의 선택을 저장해요. 공유 기기라면 내 결과인지 확인해 주세요. 공개 통계에는 더하지 않아요.</p>
        <p className="text-xs text-boot-muted">기기 원본은 삭제하지 않습니다. 과거 기록에 날짜가 없으면 임의로 만들지 않아요.</p>
        <div className="flex gap-2"><button disabled={busy} onClick={()=>void save()} className="min-h-11 flex-1 rounded-xl bg-boot-primary p-2 font-bold text-white">{busy?'저장 확인 중…':'확인하고 저장'}</button><button disabled={busy} onClick={()=>setConfirm(false)} className="min-h-11 rounded-xl border px-4">닫기</button></div>
      </div>}
    </>}
    {error&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {account===null&&<Link className="mt-3 block min-h-11 py-3 text-sm underline" href={`/login?next=${encodeURIComponent(typeof window==='undefined'?'/community/content-history':window.location.pathname+window.location.search)}`}>내 계정으로 로그인</Link>}
  </section>
}

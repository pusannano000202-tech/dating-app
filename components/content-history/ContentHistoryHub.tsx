'use client'
import Link from 'next/link'
import { ArrowLeft, Bookmark, ExternalLink, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { contentMapHref,contentRestartHref,parseSavedContentRecord,type ContentRecord } from '@/lib/content-history/contract'
import { useHistoryAccount } from './useHistoryAccount'
import DeviceContentImports from './DeviceContentImports'

type Cursor={savedAt:string;id:string}
function kindForLink(kind:string){return kind==='visit'||kind==='places'?kind:''}
export default function ContentHistoryHub({recordId,initialKind='',section='profile'}:{recordId?:string;initialKind?:string;section?:'profile'|'community'}) {
  const account=useHistoryAccount(), epoch=useRef(0)
  const historyRoot=section==='community'?'/community/content-history':'/profile/content-history'
  const [kind,setKind]=useState(['visit','places'].includes(initialKind)?initialKind:'')
  const kindQuery=kindForLink(kind)?'?type='+kindForLink(kind):''
  const listHref=historyRoot+kindQuery
  const [records,setRecords]=useState<ContentRecord[]>([]),[cursor,setCursor]=useState<Cursor|null>(null)
  const [loadedFor,setLoadedFor]=useState<string|null|undefined>(undefined)
  const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[unauthenticated,setUnauthenticated]=useState(false)
  const [note,setNote]=useState(''),[confirmDelete,setConfirmDelete]=useState(false),[notice,setNotice]=useState('')
  const operation=useRef(false)
  const endpoint=recordId?`/api/content-history/${encodeURIComponent(recordId)}`:'/api/content-history'
  const scopeKey=JSON.stringify([account,endpoint,kind])
  const clearPrivateView=useCallback(()=>{
    setRecords([]);setCursor(null);setNote('');setLoadedFor(undefined);setNotice('');setConfirmDelete(false)
  },[])
  const load=useCallback(async(more?:Cursor)=>{
    if(!account||account==='unavailable') {
      clearPrivateView();setBusy(false);setUnauthenticated(account===null)
      setError(account===null?'로그인 후 내 기록을 볼 수 있어요.':'로그인 상태를 확인하지 못했어요. 화면을 다시 열어 주세요.')
      return
    }
    if(operation.current)return
    operation.current=true
    const version=epoch.current
    setBusy(true);setError(null)
    const params=new URLSearchParams()
    if(kind)params.set('type',kind)
    if(more){params.set('beforeAt',more.savedAt);params.set('beforeId',more.id)}
    try {
      const response=await fetch(endpoint+(recordId?'':`?${params}`),{cache:'no-store',headers:{'X-Expected-Account':account}})
      const data=await response.json()
      if(version!==epoch.current)return
      setUnauthenticated(response.status===401)
      if(response.status===401||response.status===403)clearPrivateView()
      if(!response.ok)throw new Error(data.message??'기록을 불러오지 못했어요.')
      if(recordId){const record=parseSavedContentRecord(data);setRecords([record]);setNote(record.note)}
      else {
        if(!Array.isArray(data.records))throw new Error('기록 응답을 확인하지 못했어요.')
        const parsed=data.records.map(parseSavedContentRecord)
        setRecords(current=>more?[...current,...parsed.filter((item:ContentRecord)=>!current.some(known=>known.id===item.id))]:parsed);setCursor(data.nextCursor)
      }
      setLoadedFor(scopeKey)
    }catch(error){if(version===epoch.current)setError(error instanceof Error?error.message:'연결을 확인해 주세요.')}
    finally {if(version===epoch.current){operation.current=false;setBusy(false)}}
  },[account,clearPrivateView,endpoint,kind,recordId,scopeKey])
  useEffect(()=>{
    epoch.current+=1;operation.current=false;clearPrivateView();setBusy(false);setError(null);setUnauthenticated(false)
    if(account!==undefined)void load()
    return ()=>{epoch.current+=1}
  },[account,clearPrivateView,load])
  async function mutate(method:'PATCH'|'DELETE') {
    const record=records[0];if(!record||operation.current||loadedFor!==scopeKey||!account||account==='unavailable')return
    operation.current=true
    const version=epoch.current
    setBusy(true);setError(null)
    try {
      const response=await fetch(endpoint,{method,headers:{'Content-Type':'application/json','If-Match':String(record.revision),'X-Expected-Account':account},...(method==='PATCH'?{body:JSON.stringify({note})}:{})})
      const data=await response.json()
      if(version!==epoch.current)return
      setUnauthenticated(response.status===401)
      if(response.status===401||response.status===403)clearPrivateView()
      if(!response.ok)throw new Error(data.message??'변경을 저장하지 못했어요.')
      if(method==='DELETE'){setRecords([]);setNotice('계정의 이 기록을 삭제했어요. 기기 원본은 그대로예요.');setConfirmDelete(false)}
      else{setRecords([parseSavedContentRecord(data)]);setNotice('개인 메모를 저장했어요.')}
    }catch(error){if(version===epoch.current)setError(error instanceof Error?error.message:'변경에 실패했어요.')}
    finally{if(version===epoch.current){operation.current=false;setBusy(false)}}
  }
  const visibleRecords=loadedFor===scopeKey?records:[]
  const record=visibleRecords[0], winner=record?.candidates.find(item=>item.id===record.winnerId)
  return <main className="mx-auto min-h-screen max-w-3xl px-5 pb-28 pt-5 text-boot-ink">
    <Link href={recordId?listHref:section==='community'?'/community/content':'/profile/edit'} className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm"><ArrowLeft size={18}/>{recordId?'내 취향 기록':section==='community'?'취향 찾기':'마이'}</Link>
    <p className="text-xs font-black tracking-widest text-boot-primary">MY WORLDCUP HISTORY</p><h1 className="mt-2 text-3xl font-black">{recordId?'그날, 내가 고른 1위':'내가 참여한 월드컵 기록'}</h1>
    <p className="mt-3 text-sm leading-6 text-boot-muted">이곳은 나만 보는 참여 기록이에요. 부산대 학생들의 공동 순위와는 별도로 보관해요. 기존 개인 기록을 학교 통계에 자동으로 더하지 않아요.</p>
    {!recordId&&<><div className="my-5 flex gap-2">{[['','전체'],['visit','방문 맛집'],['places','장소']].map(([id,label])=><button key={id} onClick={()=>setKind(id)} aria-pressed={kind===id} className={`min-h-11 rounded-full border px-5 text-sm font-bold ${kind===id?'bg-boot-primary text-white':'bg-white'}`}>{label}</button>)}</div><Link href="/community/mbti?view=manage" className="mb-5 block rounded-xl bg-boot-soft p-4 text-sm font-bold">MBTI 응답은 별도로 관리하기 →</Link></>}
    {(busy||account===undefined)&&<p role="status" className="py-4 text-sm">내 기록을 확인하고 있어요…</p>}
    {error&&<div role="alert" className="my-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm"><p>{error}</p>{unauthenticated?<Link href={`/login?next=${encodeURIComponent(recordId?`${historyRoot}/${encodeURIComponent(recordId)}${kindQuery}`:listHref)}`} className="mt-2 block py-2 underline">로그인하고 돌아오기</Link>:<button disabled={busy} onClick={()=>account==='unavailable'?window.location.reload():void load()} className="mt-2 min-h-11 underline">다시 불러오기</button>}</div>}
    {notice&&<p role="status" className="my-4 rounded-xl bg-green-50 p-4 text-sm">{notice}</p>}
    {!busy&&!error&&account!==undefined&&records.length===0&&!notice&&<section className="my-5 rounded-3xl border bg-white p-6"><Bookmark className="text-boot-primary"/><h2 className="mt-3 text-xl font-bold">아직 계정에 저장한 기록이 없어요</h2><p className="my-3 text-sm text-boot-muted">월드컵 결과에서 직접 저장한 기록이 여기에 모여요.</p><Link href="/community/content" className="inline-flex min-h-11 items-center font-bold text-boot-primary">취향 고르러 가기 →</Link></section>}
    {!recordId&&visibleRecords.map(item=><Link href={`${historyRoot}/${encodeURIComponent(item.id)}${kindQuery}`} key={item.id} className="mb-3 block rounded-2xl border border-boot-hairline bg-white p-5"><span className="text-xs text-boot-primary">{item.kind==='visit'?'방문 맛집':'장소'} · 계정 저장 {new Date(item.savedAt).toLocaleDateString('ko-KR')}</span><h2 className="mt-2 text-xl font-black">{item.candidates.find(candidate=>candidate.id===item.winnerId)?.name}</h2><p className="mt-2 text-sm text-boot-muted">{item.title} · 후보 {item.candidates.length}곳</p><span className="mt-4 block text-sm font-bold">그때의 선택 보기 →</span></Link>)}
    {!recordId&&cursor&&<button disabled={busy} onClick={()=>void load(cursor)} className="my-3 min-h-12 w-full rounded-xl border">이전 기록 더 보기</button>}
    {recordId&&record&&<section className="mt-6 rounded-3xl border border-boot-hairline bg-white p-5 sm:p-8">
      <p className="text-sm text-boot-primary">{record.title}</p><h2 className="mt-2 text-3xl font-black">{winner?.name}</h2>
      <p className="mt-3 text-xs leading-5 text-boot-muted">계정에 저장한 날: {new Date(record.savedAt).toLocaleDateString('ko-KR')}<br/>{record.completedAt?`대결 완료: ${new Date(record.completedAt).toLocaleDateString('ko-KR')}`:'원래 기기 기록에 완료 날짜가 없어 대결 날짜는 표시하지 않아요.'}</p>
      <details className="my-5 rounded-xl bg-boot-soft p-4"><summary className="cursor-pointer font-bold">당시 선택 {record.selections.length}번 보기</summary><ol className="mt-3 space-y-2 text-sm">{record.selections.map((selection,index)=><li key={index}>{record.candidates.find(c=>c.id===selection.winnerId)?.name} 선택 · {record.candidates.find(c=>c.id===selection.loserId)?.name}와 비교</li>)}</ol></details>
      <label htmlFor="content-note" className="block text-sm font-bold">나만 보는 메모</label><textarea id="content-note" maxLength={500} value={note} onChange={event=>setNote(event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border p-3" placeholder="다음에 함께 가고 싶은 사람, 기억할 것…"/>
      <button disabled={busy} onClick={()=>void mutate('PATCH')} className="mt-2 min-h-11 w-full rounded-xl bg-boot-primary px-4 font-bold text-white">메모 저장</button>
      <div className="mt-5 grid gap-2 sm:grid-cols-2"><Link href={contentRestartHref(record)} className="flex min-h-12 items-center justify-center rounded-xl border px-3 font-bold">현재 후보로 새 대결 →</Link><a href={contentMapHref(winner?.name??'')} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 text-sm">지도에서 현재 정보 검색<ExternalLink size={15}/></a></div>
      <p className="mt-2 text-xs leading-5 text-boot-muted">당시 결과를 보존한 기록입니다. 폐점·변경 여부는 지도에서 다시 확인해 주세요. 새 대결은 이 기록을 덮어쓰지 않아요.</p>
      <button onClick={()=>setConfirmDelete(!confirmDelete)} className="mt-5 flex min-h-11 items-center gap-2 text-sm text-boot-muted"><Trash2 size={15}/>이 계정 기록 삭제</button>
      {confirmDelete&&<div className="rounded-xl border border-red-200 p-4"><p className="text-sm">계정의 이 결과와 메모를 삭제할까요? 기기 원본이나 다른 기록은 삭제하지 않아요.</p><div className="mt-3 flex gap-2"><button disabled={busy} onClick={()=>void mutate('DELETE')} className="min-h-11 rounded-xl bg-red-700 px-4 text-white">이 기록 삭제</button><button disabled={busy} onClick={()=>setConfirmDelete(false)} className="min-h-11 px-4">취소</button></div></div>}
    </section>}
    {!recordId&&<DeviceContentImports onSaved={()=>void load()}/>}
  </main>
}

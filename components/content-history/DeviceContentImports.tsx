'use client'
import { useState } from 'react'
import { CAMPUS_EATS_SCHOOLS } from '@/lib/campus-eats/fixtures/regional'
import { isSupportedPilotRecord } from '@/lib/campus-eats/preserved-storage'
import type { BracketSession } from '@/lib/campus-eats/types'
import { visitResultSnapshot, type ContentRecordInput } from '@/lib/content-history/contract'
import SaveContentRecord from './SaveContentRecord'

export default function DeviceContentImports({onSaved}:{onSaved:()=>void}) {
  const [snapshots,setSnapshots]=useState<ContentRecordInput[]|null>(null),[notice,setNotice]=useState(''),[selected,setSelected]=useState<string|null>(null)
  function inspect() {
    const found:ContentRecordInput[]=[];let skipped=0
    try {
      for(const school of CAMPUS_EATS_SCHOOLS)for(const category of school.categories) {
        const raw=localStorage.getItem(`quantum-campus-eats-${school.id}-${category.id}-v4`)
        if(!raw)continue
        try {
          const stored:unknown=JSON.parse(raw)
          if(!isSupportedPilotRecord(stored,category.candidates.map(item=>item.id))){skipped+=1;continue}
          const row=stored as {session:BracketSession;tournamentId:string}
          const snapshot=visitResultSnapshot({school:school.id,category:category.id,label:category.label,tournamentId:row.tournamentId,candidates:category.candidates,session:row.session})
          if(snapshot)found.push(snapshot)
        } catch {skipped+=1}
      }
      setSnapshots(found);setNotice(skipped?`${skipped}개 기기 기록은 현재 정보로 충분히 복원할 수 없어 가져오지 않아요. 원본은 그대로 두었습니다.`:found.length?'대결이 끝난 방문 맛집 기록만 표시해요. 내 기록인지 확인하고 원하는 것만 선택하세요.':'이 기기에서 가져올 수 있는 완료된 방문 맛집 기록이 없어요.')
    } catch {setNotice('이 기기의 저장소에 접근하지 못했어요. 원본은 변경하지 않았습니다.')}
  }
  return <section className="mt-8 border-t border-boot-hairline pt-6">
    <h2 className="text-lg font-black">이 기기에 남아 있는 기록</h2><p className="mt-2 text-sm leading-6 text-boot-muted">로그인 전에 고른 결과는 자동으로 계정에 합치지 않아요. 기기를 함께 썼다면 내 결과인지 먼저 확인해 주세요. 배달 기록은 보관만 하고 새로 가져오지 않습니다.</p>
    <button onClick={inspect} className="mt-3 min-h-12 rounded-xl border bg-white px-5 font-bold">이 기기 기록 찾아보기</button>
    {notice&&<p role="status" className="mt-3 text-sm leading-6">{notice}</p>}
    {snapshots?.map(snapshot=><div key={snapshot.sourceKey} className="mt-3 rounded-2xl border bg-white p-4"><button onClick={()=>setSelected(selected===snapshot.sourceKey?null:snapshot.sourceKey)} aria-expanded={selected===snapshot.sourceKey} className="min-h-11 w-full text-left font-bold">{snapshot.title} · {snapshot.candidates.find(item=>item.id===snapshot.winnerId)?.name} <span className="text-boot-primary">확인하기 →</span></button>{selected===snapshot.sourceKey&&<SaveContentRecord snapshot={snapshot}/>}</div>)}
    {!!snapshots?.length&&<button onClick={onSaved} className="mt-3 min-h-11 text-sm underline">가져온 계정 기록 새로고침</button>}
  </section>
}

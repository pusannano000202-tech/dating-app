'use client'

import {MessageCircle, ShieldCheck} from 'lucide-react'
import s from './league-application-intro.module.css'

export type ApplicationIntro = {aspiration:string;strengths:string}

export function LeagueApplicationIntro({value,onChange,disabled=false}:{value:ApplicationIntro;onChange:(value:ApplicationIntro)=>void;disabled?:boolean}){
 const count=Array.from(value.aspiration).length+Array.from(value.strengths).length
 return <details className={s.editor}>
  <summary><MessageCircle size={18} aria-hidden="true"/><span>한마디로 나 소개하기 <small>선택</small></span><span className={s.hint}>{count?'작성 중':'열기'}</span></summary>
  <div className={s.fields}>
   <p>잘하는 것 하나, 함께하고 싶은 마음 하나면 충분해요.</p>
   <label>포부 한마디<input value={value.aspiration} disabled={disabled} placeholder="예: 이기든 지든 끝까지 즐겁게 함께할게요!" onChange={event=>onChange({...value,aspiration:Array.from(event.target.value).slice(0,80).join('')})}/><small>{Array.from(value.aspiration).length}/80</small></label>
   <label>내 장점<textarea rows={2} value={value.strengths} disabled={disabled} placeholder="예: 팀원 콜을 잘 듣고, 약속 시간을 잘 지켜요." onChange={event=>onChange({...value,strengths:Array.from(event.target.value).slice(0,120).join('')})}/><small>{Array.from(value.strengths).length}/120</small></label>
   <p className={s.privacy}><ShieldCheck size={15} aria-hidden="true"/>나와 이 팀 주장만 볼 수 있어요. 연락처는 적지 마세요.</p>
  </div>
 </details>
}

export function LeagueApplicationSummary({value}:{value:ApplicationIntro|null|undefined}){
 if(!value?.aspiration&&!value?.strengths)return null
 return <dl className={s.summary} aria-label="참가 신청 소개">
  {value.aspiration?<div><dt>포부 한마디</dt><dd>{value.aspiration}</dd></div>:null}
  {value.strengths?<div><dt>내 장점</dt><dd>{value.strengths}</dd></div>:null}
 </dl>
}

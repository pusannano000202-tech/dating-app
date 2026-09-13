'use client'

import Link from 'next/link'
import {useCallback,useEffect,useRef,useState} from 'react'
import {ChevronRight,Heart,LockKeyhole,RefreshCw} from 'lucide-react'
import {useHistoryAccount} from '@/components/content-history/useHistoryAccount'
import {useQuantumLocale} from '@/components/i18n/QuantumLocaleProvider'
import {parseRelationshipState,type RelationshipState} from '@/lib/relationship/contract'
import s from './relationship-summary.module.css'

/** Read-only summary. Existing server admission checks, 30-day lock and match chats are untouched. */
export default function RelationshipSummary(){
 const account=useHistoryAccount(),ownerRef=useRef(account);ownerRef.current=account
 const {t}=useQuantumLocale(),epoch=useRef(0),controller=useRef<AbortController|null>(null)
 const [snapshot,setSnapshot]=useState<{owner:string;state:RelationshipState}|null>(null),[failed,setFailed]=useState(false)
 const load=useCallback(async()=>{
  if(!account||account==='unavailable')return
  controller.current?.abort();const abort=new AbortController(),ticket=++epoch.current;controller.current=abort
  const timer=setTimeout(()=>abort.abort(),12000)
  try{
   const response=await fetch('/api/profile/relationship',{cache:'no-store',signal:abort.signal}),body=await response.json()
   if(ticket!==epoch.current||ownerRef.current!==account)return
   const state=response.ok?parseRelationshipState(body?.data):null
   if(!state)throw Error('unavailable')
   setSnapshot({owner:account,state});setFailed(false)
  }catch{if(ticket===epoch.current&&ownerRef.current===account){setSnapshot(null);setFailed(true)}}
  finally{clearTimeout(timer);if(ticket===epoch.current)controller.current=null}
 },[account])
 useEffect(()=>{
  ++epoch.current;controller.current?.abort();setSnapshot(null);setFailed(false);void load()
  const focus=()=>{if(document.visibilityState==='visible'&&!controller.current)void load()}
  window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus)
  return()=>{++epoch.current;controller.current?.abort();window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus)}
 },[load])
 const state=snapshot&&snapshot.owner===account?snapshot.state:null
 return <RelationshipSummaryCard state={state} unavailable={failed||account==='unavailable'||account===null} onRetry={()=>void load()} title={t('relationship.title')}/>
}

export function RelationshipSummaryCard({state,unavailable=false,onRetry,title}:{state:RelationshipState|null;unavailable?:boolean;onRetry:()=>void;title?:string}){
 const {locale,t}=useQuantumLocale()
 const date=state?.next_change_at&&!state.can_change?new Intl.DateTimeFormat({ko:'ko-KR',en:'en-GB',ja:'ja-JP',zh:'zh-CN'}[locale],{timeZone:'Asia/Seoul',month:'short',day:'numeric'}).format(new Date(state.next_change_at)):null
 return <section className={s.card} aria-label={title??t('relationship.title')}>
  <span className={s.icon}><Heart size={23}/></span><div className={s.body}>
   <small><LockKeyhole size={11}/>{t('relationship.private')}</small>
   <strong>{state?t(`relationship.${state.status}`):t(unavailable?'relationship.summaryUnknown':'common.loading')}</strong>
   <p>{state?t(state.status==='in_relationship'?'relationship.takenHint':'relationship.summarySingle'):unavailable?t('relationship.summaryRetry'):t('relationship.summaryChecking')}</p>
   {date?<span className={s.lock}>{t('relationship.next')} · {date}</span>:null}
   {unavailable?<button onClick={onRetry} className={s.retry}><RefreshCw size={13}/>{t('common.retry')}</button>:null}
  </div><Link href="/profile/relationship" className={s.open} aria-label={t('relationship.promptAction')}><ChevronRight size={20}/></Link>
 </section>
}

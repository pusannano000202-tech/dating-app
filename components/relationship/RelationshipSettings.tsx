'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, Heart, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react'
import { useQuantumLocale } from '@/components/i18n/QuantumLocaleProvider'
import { createClient } from '@/lib/supabase'
import { parseRelationshipState, type RelationshipState, type RelationshipStatus } from '@/lib/relationship/contract'
import s from './relationship.module.css'

export default function RelationshipSettings() {
  const {locale,t}=useQuantumLocale()
  const [state,setState]=useState<RelationshipState|null>(null)
  const [choice,setChoice]=useState<RelationshipStatus>('single')
  const [confirm,setConfirm]=useState(false)
  const [busy,setBusy]=useState(false)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [saved,setSaved]=useState(false)
  const epoch=useRef(0), inFlight=useRef(false), controller=useRef<AbortController|null>(null)
  const invalidate=useCallback(()=>{++epoch.current;controller.current?.abort()},[])
  const request=useCallback(async (status?:RelationshipStatus) => {
    const ticket=++epoch.current
    controller.current?.abort()
    const abort=new AbortController();controller.current=abort
    const timeout=setTimeout(()=>abort.abort(),12000)
    if(status===undefined) setLoading(true)
    setError('')
    try {
      const response=await fetch('/api/profile/relationship',{method:status===undefined?'GET':'PATCH',cache:'no-store',signal:abort.signal,
        ...(status===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify({status})})})
      const payload:unknown=await response.json()
      if(ticket!==epoch.current) return
      const data=payload && typeof payload==='object' ? payload as {data?:unknown;error?:unknown}:{}
      if(!response.ok) {
        if(response.status===401||response.status===403) {setState(null);throw new Error('relationship.auth')}
        if(data.error==='relationship_change_locked') throw new Error('relationship.locked')
        throw new Error('relationship.error')
      }
      const parsed=parseRelationshipState(data.data)
      if(!parsed) throw new Error('relationship.error')
      setState(parsed);setChoice(parsed.status);setConfirm(false);setSaved(status!==undefined)
    } catch(caught) {
      if(ticket!==epoch.current) return
      const key=caught instanceof Error && caught.message.startsWith('relationship.')?caught.message:'relationship.error'
      setError(key)
      // No stale usable form when the server did not verify this snapshot.
      if(key!=='relationship.locked') setState(null)
    } finally {clearTimeout(timeout);if(ticket===epoch.current) setLoading(false)}
  },[])
  useEffect(()=>{
    void request()
    const client=createClient()
    let userId:string|null|undefined
    const {data:{subscription}}=client.auth.onAuthStateChange((_event,session)=>{
      const next=session?.user.id??null
      if(userId!==undefined && userId!==next) {
        invalidate();setState(null);setConfirm(false);setSaved(false);setError('relationship.auth');setLoading(false)
      }
      userId=next
    })
    return ()=>{invalidate();subscription.unsubscribe()}
  },[invalidate,request])
  async function save() {
    if(inFlight.current || !state?.can_change || state.status===choice) return
    inFlight.current=true;setBusy(true)
    try {await request(choice)} finally {inFlight.current=false;setBusy(false)}
  }
  const date=state?.next_change_at ? new Intl.DateTimeFormat({ko:'ko-KR',en:'en-GB',ja:'ja-JP',zh:'zh-CN'}[locale],{timeZone:'Asia/Seoul',year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(state.next_change_at)) : null
  return <main className={s.page}>
    <Link href="/profile" className={s.back}><ArrowLeft size={18}/>{t('common.back')}</Link>
    <header><span className={s.eyebrow}><LockKeyhole size={15}/>{t('relationship.private')}</span><h1>{t('relationship.title')}</h1><p>{t('relationship.intro')}</p></header>
    {loading ? <div className={s.loading} role="status"><RefreshCw size={22}/>{t('common.loading')}</div> : null}
    {error ? <section className={s.error} role="alert"><p>{t(error)}</p>{error==='relationship.auth'?<Link href="/login?returnTo=%2Fprofile%2Frelationship">{t('relationship.login')}</Link>:<button disabled={busy} onClick={()=>void request()}>{t('common.retry')}</button>}</section>:null}
    {state&&!loading ? <>
      <section className={s.current}><span className={s.heart}><Heart size={30}/></span><div><small>{t('relationship.current')}</small><h2>{t(`relationship.${state.status}`)}</h2><p>{t(state.status==='single'?'relationship.singleHint':'relationship.takenHint')}</p></div></section>
      {saved?<p className={s.notice} role="status"><Check size={17}/>{t('relationship.saved')}</p>:null}
      {!state.can_change&&date?<section className={s.locked}><LockKeyhole size={19}/><div><strong>{t('relationship.next')}</strong><p>{date}</p><small>{t('relationship.serverTime')}</small></div><button disabled={busy} onClick={()=>void request()} aria-label={t('common.retry')}><RefreshCw size={18}/></button></section>:null}
      <fieldset className={s.choices} disabled={!state.can_change||busy||Boolean(error)}><legend>{t('relationship.choose')}</legend>{(['single','in_relationship'] as const).map(status=><button key={status} type="button" aria-pressed={choice===status} className={choice===status?s.selected:''} onClick={()=>{setChoice(status);setConfirm(false);setSaved(false)}}><span>{t(`relationship.${status}`)}</span>{choice===status?<Check size={18}/>:null}</button>)}</fieldset>
      {state.can_change&&!error&&choice!==state.status?<section className={s.confirm}>
        {confirm?<><h2>{t('relationship.confirmTitle')} · {t(`relationship.${choice}`)}</h2><p>{t('relationship.cooldown')}</p><div className={s.actions}><button className={s.secondary} disabled={busy} onClick={()=>setConfirm(false)}>{t('common.cancel')}</button><button className={s.primary} disabled={busy} onClick={()=>void save()}>{t(busy?'relationship.saving':'relationship.confirm')}</button></div></>:<button className={s.primary} onClick={()=>setConfirm(true)}>{t('relationship.review')}</button>}
      </section>:null}
    </>:null}
    <section className={s.rules}><h2><ShieldCheck size={20}/>{t('relationship.rules')}</h2><ul><li>{t('relationship.cooldown')}</li><li>{t('relationship.preserve')}</li><li>{t('relationship.noShare')}</li></ul></section>
  </main>
}

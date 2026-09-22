'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Plus, RefreshCw } from 'lucide-react'
import { useQuantumLocale } from '@/components/i18n/QuantumLocaleProvider'
import { createdMeetupHref, customMeetupBrowseHref } from '@/lib/meetups/create-flow'
import { buildContextualMeetupCreateHref } from '@/lib/meetups/create-context'
import { parseMeetupPagination } from '@/lib/meetups/list-page'
import { featuredMeetupIdeas, getMeetupCategoryLabel } from '@/lib/community/catalog'
import type { MeetupCategory } from '@/lib/community/contracts'
import type { MeetupGenderMode } from '@/lib/community/meetup-gender'
import s from './meetup-discovery.module.css'

type Item={id:string;title:string;category:MeetupCategory;member_count:number;capacity:number}
export default function CustomMeetupShelf({categories,genderMode,imageSrc,topicGroup,fromHref}:{categories:MeetupCategory[];genderMode:MeetupGenderMode;imageSrc:string;topicGroup?:string;fromHref?:string}){
  const {t}=useQuantumLocale()
  const [items,setItems]=useState<Item[]>([]),[state,setState]=useState<'loading'|'ready'|'error'|'auth'>('loading'),[reload,setReload]=useState(0)
  const [hasMore,setHasMore]=useState(false),[loadingMore,setLoadingMore]=useState(false),[pageError,setPageError]=useState(false)
  const cursors=useRef<Record<string,string|null>>({}),request=useRef<AbortController|null>(null),generation=useRef(0),busy=useRef(false)
  const categoryKey=[...new Set(categories)].sort().join(',')
  const load=useCallback(async(more=false)=>{
    if(more&&busy.current)return
    request.current?.abort();const controller=new AbortController();request.current=controller
    const version=++generation.current;busy.current=true
    const timeout=window.setTimeout(()=>controller.abort(),12000)
    setPageError(false);setLoadingMore(more)
    if(!more){cursors.current={};setItems([]);setHasMore(false);setState('loading')}
    try{
      const pages=await Promise.all(categoryKey.split(',').filter(category=>category&&(!more||cursors.current[category])).map(async category=>{
        const params=new URLSearchParams({category,scope_type:'school',gender_mode:genderMode,limit:'3'})
        if(more&&cursors.current[category])params.set('cursor',cursors.current[category]!)
        const response=await fetch('/api/meetups?'+params,{cache:'no-store',signal:controller.signal}),payload=await response.json()
        if(response.status===401||payload.availability==='auth_required')throw new Error('auth')
        const pagination=parseMeetupPagination(payload)
        if(!response.ok||payload.availability!=='ready'||!Array.isArray(payload.meetups)||!pagination)throw new Error('unavailable')
        const rows=payload.meetups as Item[]
        if(rows.some(item=>!createdMeetupHref({meetup:item})||typeof item.title!=='string'||item.category!==category||!Number.isInteger(item.member_count)||!Number.isInteger(item.capacity)||item.member_count<0||item.capacity<2))throw new Error('unavailable')
        return{category,rows,...pagination}
      }))
      if(version!==generation.current||controller.signal.aborted)return
      for(const page of pages)cursors.current[page.category]=page.nextCursor
      setItems(previous=>Array.from(new Map([...(more?previous:[]),...pages.flatMap(page=>page.rows)].map(item=>[item.id,item])).values()))
      setHasMore(Object.values(cursors.current).some(Boolean));setState('ready')
    }catch(error){
      if(version===generation.current){
        if(error instanceof Error&&error.message==='auth'){setItems([]);setHasMore(false);setState('auth')}
        else if(more)setPageError(true)
        else setState('error')
      }
    }finally{window.clearTimeout(timeout);if(version===generation.current){busy.current=false;setLoadingMore(false)}}
  },[categoryKey,genderMode,reload])
  useEffect(()=>{void load();return()=>{++generation.current;request.current?.abort();busy.current=false}},[load])
  const first=categories[0]
  if(!first)return null
  const createHref=buildContextualMeetupCreateHref({category:first,genderMode,topicGroup,from:fromHref})
  return <section className="mt-8 border-t border-boot-hairline pt-7">
    <div className={s.shelfHeading}><h2 className="text-xl font-black">{t('친구들이 직접 연 모임')}</h2><div className={s.shelfActions}>{createHref?<Link className={s.createMeetup} href={createHref}><Plus size={17} aria-hidden="true"/>{t('만들기')}</Link>:null}<button className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-boot-hairline" aria-label={t('common.retry')} type="button" onClick={()=>setReload(value=>value+1)}><RefreshCw size={17}/></button></div></div>
    {state==='loading'?<p role="status" className={s.availabilityNote}>{t('common.loading')}</p>:state==='ready'?items.length?<div className={s.activityRows}>{items.map(item=><Link key={item.id} href={'/meetups/'+item.id} className={s.photoRow}><Image className={s.rowPhoto} src={featuredMeetupIdeas.find(idea=>idea.category===item.category)?.imageSrc ?? imageSrc} alt="" width={700} height={460}/><div className={s.rowText}><h3 className="text-lg font-black">{item.title}</h3><p>{item.member_count} / {item.capacity}</p><span className={s.rowAction}>{t('모임방 보기')}<ArrowRight size={14}/></span></div></Link>)}</div>:<p className={s.availabilityNote}>{t('아직 열린 모임이 없어요. 첫 모임을 열어볼까요?')}</p>:<p role="status" className={s.availabilityNote}>{state==='auth'?<Link href={'/login?redirect='+encodeURIComponent(customMeetupBrowseHref(first,'school',genderMode))}>{t('mentor.login')}</Link>:t('모임 목록을 가져오지 못했어요. 다시 확인해 주세요.')}</p>}
    {pageError?<p role="status" className={s.availabilityNote}>{t('다음 모임을 불러오지 못했어요. 더 보기로 다시 확인해 주세요.')}</p>:null}
    {state==='ready'&&hasMore?<button type="button" disabled={loadingMore} className="mt-4 min-h-11 w-full rounded-lg border border-boot-hairline text-sm font-bold disabled:opacity-50" onClick={()=>void load(true)}>{t(loadingMore?'common.loading':'모임 더 보기')}</button>:null}
    <div className="mt-4 flex flex-wrap gap-3">{categories.map(category=><Link className={s.back} key={category} href={customMeetupBrowseHref(category,'school',genderMode)}>{t('모임방 보기')} · {t(getMeetupCategoryLabel(category))}<ArrowRight size={15}/></Link>)}</div>
  </section>
}

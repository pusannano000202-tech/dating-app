'use client'
import {useState} from 'react'
import Link from 'next/link'
import TonightActivityExplorer from '@/components/tonight/TonightActivityExplorer'
import ActivityRanker from '@/components/tonight/ActivityRanker'
import MeetingCoachingCards from './MeetingCoachingCards'
import OccurrenceComicGuide from './OccurrenceComicGuide'
import type {TonightActivityCard} from '@/components/tonight/types'
import s from '@/components/tonight/tonight-journey.module.css'

// Static component review only: no auth bypass, adapters, fetch, application or payment calls.
const activities: [TonightActivityCard,TonightActivityCard,TonightActivityCard]=[
  {id:'design-game',title:'보드게임 한 판',description:'함께 규칙을 읽고 가볍게 한 판 시작해요.',imageUrl:'/images/match/calendar-play-20260915.webp',imageAlt:'보드게임 활동 분위기 예시',durationMinutes:80,kind:'board_game'},
  {id:'design-food',title:'함께 저녁 먹기',description:'맛있는 저녁을 나누며 서로의 취향을 알아가요.',imageUrl:'/images/match/events/event-dinner.webp',imageAlt:'함께 저녁을 먹는 활동 분위기 예시',durationMinutes:75,kind:'cafe'},
  {id:'design-talk',title:'가벼운 이야기 나누기',description:'편안한 공간에서 오늘 있었던 일을 이야기해요.',imageUrl:'/images/match/events/event-drinks.webp',imageAlt:'테이블에서 함께 이야기하는 활동 분위기 예시',durationMinutes:70,kind:'bar'},
]
export default function TonightDesignPreview(){
  const [step,setStep]=useState('browse'),[index,setIndex]=useState(0),[rank,setRank]=useState<readonly string[]>(activities.map(a=>a.id))
  const [guideMode,setGuideMode]=useState('single'),[cue,setCue]=useState('introduce')
  const [day1Phase,setDay1Phase]=useState('introduction')
  const day1Vote=day1Phase==='vote', day1Result=day1Phase==='result'||day1Phase==='wrap'
  const currentSnapshot = guideMode==='day1' ? {
    programDay:1, status:'in_progress', startsAt:'2026-09-20T10:00:00Z', endsAt:'2026-09-20T12:30:00Z',
    serverNow:day1Phase==='wrap'?'2026-09-20T12:26:00Z':day1Result?'2026-09-20T11:26:00Z':day1Vote?'2026-09-20T11:21:00Z':'2026-09-20T10:30:00Z',
    elapsedMs:day1Phase==='offline'?75_000:0, verified:true,
    contentState:{game_started:day1Phase!=='introduction',game_finished:['waiting','vote','result','wrap'].includes(day1Phase)},
    runtime:{kind:'day1',vote_open:day1Vote,can_vote:day1Vote,result_available:day1Result,my_vote:null,selected_game:day1Result?'halligalli':null,can_finish:day1Phase==='wrap'},
  } : {
    programDay:2, status:'in_progress', startsAt:'2026-09-20T10:00:00Z', endsAt:'2026-09-20T12:00:00Z', serverNow:'2026-09-20T10:50:00Z',
    elapsedMs:0, verified:true,
    runtime:{kind:'day2',ready:true,scene:'day2_rotation_round_2',round_opened_at:'2026-09-20T10:45:00Z',round_closes_at:'2026-09-20T11:15:00Z'},
  }
  return <main className={s.page}><div className={s.container}>
    <p className="mb-3 text-xs leading-5 text-[#9e4736]">화면 검수용 정적 예시 · 실제 모집·인원·신청·결제 아님</p>
    {step==='guide'?<div className="mb-3 flex flex-wrap gap-2"><label className="text-xs">안내 예시 <select aria-label="만화 검수 유형" value={guideMode} onChange={event=>setGuideMode(event.target.value)} className="ml-2 rounded-xl border p-3"><option value="single">첫 만남</option><option value="couple">커플 모임</option><option value="cue">단계 전환 예시</option><option value="scheduled">회차 진행 장면</option><option value="day1">첫 회차 상태 연결</option></select></label>{guideMode==='cue'?<button className={s.back} onClick={()=>setCue(value=>value==='introduce'?'conversation':'introduce')}>예시 단계 바꾸기</button>:null}{guideMode==='day1'?<label className="text-xs">예시 상태 <select aria-label="첫 회차 예시 상태" value={day1Phase} onChange={event=>setDay1Phase(event.target.value)} className="ml-2 rounded-xl border p-3"><option value="introduction">시작 전 인사</option><option value="play">달무티 진행 중</option><option value="waiting">게임 완료 · 투표 대기</option><option value="vote">비공개 투표 열림</option><option value="result">할리갈리 결과 확인</option><option value="wrap">마무리 가능</option><option value="offline">최신 상태 확인 실패</option></select></label>:null}</div>:null}
    {step!=='browse'?<button className={s.back} onClick={()=>setStep('browse')}>활동 둘러보기로</button>:null}
    {step==='browse'?<TonightActivityExplorer activities={activities} activeIndex={index} onActiveIndexChange={setIndex} onContinue={()=>setStep('rank')} onPreview={()=>setStep('guide')} dateLabel="오늘밤 · 예시 화면" summary={<section className={s.participation} aria-label="예시 신청 현황"><span className="text-xs">신청 현황 디자인 예시</span><dl className={s.stats}><div><dt>남성 신청</dt><dd>18명</dd></div><div><dt>여성 신청</dt><dd>12명</dd></div><div><dt>편성된 팀</dt><dd>3팀</dd></div></dl><p className={s.statsNote}>실제 화면은 서버 집계와 조회 시각을 표시해요.</p></section>}/>:step==='guide'?['scheduled','day1'].includes(guideMode)?<OccurrenceComicGuide preview snapshot={currentSnapshot} rosterSize={5} onRefresh={()=>setDay1Phase('vote')}/>:<MeetingCoachingCards preview={guideMode!=='cue'} unlocked={guideMode==='cue'} currentCue={guideMode==='cue'?{cardId:cue,label:'단계 전환 디자인 예시'}:undefined} audience={guideMode==='couple'?'couples':'singles'} activityKind={activities[index].kind}/>:<><h1 className="mb-5 text-2xl font-bold">세 활동 순위를 정해 주세요</h1><ActivityRanker activities={activities} rankedIds={rank} onChange={setRank}/><p className="mt-5 text-sm">순위 조작만 체험할 수 있어요. 실제 참가 신청은 전송하지 않아요.</p></>}
    <Link href="/match" className={s.back}>매칭 화면으로</Link>
  </div></main>
}

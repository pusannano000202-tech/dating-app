'use client'
import Link from 'next/link'
import {useState} from 'react'
import {CandidateBoardView} from '@/components/meetups/CandidateBoard'
import {createDemoBoard,applyDemoAction,demoIncoming,demoJoined} from '@/lib/meetups/candidate-board-demo'
import type {CandidateScope} from '@/lib/meetups/candidate-board-contract'
import type {CandidateLeagueTeam} from '@/components/meetups/useCandidateLeagueMembership'
import {Bell,ArrowRight} from 'lucide-react'
import s from '@/components/meetups/candidate-board.module.css'
export default function CandidateBoardRehearsal({scope}:{scope:CandidateScope}){
 const [board,setBoard]=useState(()=>createDemoBoard(scope)),[filter,setFilter]=useState('all'),[error,setError]=useState(''),[reset,setReset]=useState(0),[otherNotice,setOtherNotice]=useState(false)
 const [multipleTeams,setMultipleTeams]=useState(false)
 const exampleTeam=(id:string,title:string,sport:CandidateLeagueTeam['sport']):CandidateLeagueTeam=>({id,challengeId:id,sport,title,department:'건축학과',memberCount:sport==='football'?8:3,href:`/meetups/dev-flow?scene=league&design=multiteam&flow=recruitment&sport=${sport}`,chatHref:`/chat/league-team/${id}`})
 const teams:CandidateLeagueTeam[]=scope.kind==='league'?[...(multipleTeams?[
  exampleTeam('96000000-0000-4000-8000-000000000001','건축 캐리단 · 예시','lol'),
  exampleTeam('96000000-0000-4000-8000-000000000002','야간 설계단 · 예시','lol'),
  exampleTeam('96000000-0000-4000-8000-000000000003','건축 FC · 예시','football'),
 ]:[]),...board.incoming.filter(invite=>invite.status==='joined').map(invite=>exampleTeam(invite.room_id,invite.room_title,scope.key as CandidateLeagueTeam['sport']))]:[]
 function showMultipleTeams(){let next=createDemoBoard(scope);next=applyDemoAction(next,'register',{positions:scope.key==='lol'?['top','jungle','mid']:['defender','forward'],tier:scope.key==='lol'?'emerald':'intermediate',intro:'즐겁게 소통하면서 한 판 해요.',availability:'수 · 금 · 저녁',consent:true,expected_revision:null});setBoard(demoIncoming(next,2));setMultipleTeams(true);setFilter('all');setError('');setReset(v=>v+1)}
 function demoCommand(action:string,args:Record<string,unknown>){try{const next=applyDemoAction(board,action,{...args,filter});setBoard(next);setError('');return next}catch{setError('현재 상태에서 진행할 수 없어요. 등록과 초대 상태를 확인해 주세요.');return null}}
 return <><CandidateBoardView key={reset} scope={scope} board={board} leagueMembership={teams.length?{status:'member',teams}:{status:'none'}} busy={false} error={error} filter={filter} onFilter={value=>{setFilter(value);try{setBoard(applyDemoAction(board,'overview',{filter:value}))}catch{setError('필터를 확인하지 못했어요.')}}} onMore={()=>{demoCommand('more',{})}} onRefresh={()=>{demoCommand('overview',{})}} onAction={async(action,args)=>demoCommand(action,args)} demo/>
  {otherNotice&&<aside className={s.depositNotice} aria-label="다른 팀장이 받는 알림 예시"><span><Bell size={17}/>다른 팀장에게 보이는 알림 · 예시</span><h2>초대한 사람의 모집이 종료됐어요.</h2><p>다른 대기자를 찾아보세요.</p><button className={s.secondary} onClick={()=>{setBoard(applyDemoAction(board,'overview',{filter:'all'}));setFilter('all');setReset(v=>v+1);setOtherNotice(false);window.scrollTo({top:0,behavior:'smooth'})}}>다른 대기자 찾아보기<ArrowRight size={17}/></button><small>상대가 합류한 팀 이름은 다른 팀장에게 공개하지 않아요. 실제 알림 발송이 아닌 화면 체험입니다.</small></aside>}
  <details className={s.demoTools}><summary>로컬 체험 도구 · 실제 사용자에게 보이지 않아요</summary><p>가상 계정 30명의 상태 예시입니다. 소개 → 예시 보증금 → 공개 → 초대 수신 → 합류 확정 순서로 눌러 보세요. 실제 결제·알림 발송·가입·채팅은 발생하지 않습니다.</p>{scope.kind==='league'&&<button onClick={showMultipleTeams}>3개 팀 참여 + 대기 중 체험</button>}<button disabled={board.mine?.status!=='waiting'} onClick={()=>{try{setBoard(demoIncoming(board));setError('')}catch{setError('대기 등록을 먼저 해 주세요.')}}}>초대 도착 체험</button><button disabled={board.mine?.status!=='waiting'} onClick={()=>{try{setBoard(demoIncoming(board,2));setError('')}catch{setError('대기 등록을 먼저 해 주세요.')}}}>A·B 두 팀의 초대 받기</button><button disabled={board.mine?.status!=='joining'} onClick={()=>{try{const next=demoJoined(board);setBoard(next);setOtherNotice(next.incoming.some(i=>i.status==='unavailable'));setError('')}catch{setError('참가 확인을 먼저 진행해 주세요.')}}}>합류 확정 체험</button><button onClick={()=>{setBoard(createDemoBoard(scope));setMultipleTeams(false);setFilter('all');setError('');setReset(v=>v+1);setOtherNotice(false)}}>처음부터 다시</button><div><Link href="/meetups/dev-candidates?kind=league&key=lol">LoL</Link><Link href="/meetups/dev-candidates?kind=league&key=football">축구</Link><Link href="/meetups/dev-candidates?kind=league&key=futsal">풋살</Link><Link href="/meetups/dev-candidates?kind=study&key=pnu%3AAN1600527">전공 스터디</Link><Link href="/meetups/dev-candidates?kind=mentoring&key=courses">멘토링</Link></div></details>
 </>
}

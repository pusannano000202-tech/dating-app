'use client'

import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react'
import {useQuantumLocale} from '@/components/i18n/QuantumLocaleProvider'
import {LEAGUE_SPORTS,leagueTeamName,type JourneyState,type JourneyTeam,type JourneyPlayer,type LeagueSport} from '@/lib/meetups/challenge-journey'
import {LOL_TIERS,SOCCER_LEVELS,isCompatible} from '@/lib/meetups/challenge-league'
import {leagueDemoLobby,type LeagueDemoAction} from '@/lib/meetups/challenge-journey-demo'
import {parseLeagueLobbyState,type LeagueLobbyState,type LeagueLobbyTeam} from '@/lib/meetups/league-lobby'
import s from './league-lobby.module.css'

const endpoint='/api/community/department/league/lobby'
const scores={...LOL_TIERS,...SOCCER_LEVELS}
export function leagueTeamSum(team:JourneyTeam){return team.players.filter(p=>p.status==='accepted').reduce((sum,p)=>sum+(scores[p.tier as keyof typeof scores]??0),0)}
function demoSnapshot(state:JourneyState,own:JourneyTeam|null):LeagueLobbyState{
 const pending=leagueDemoLobby(state,state.challenges.find(challenge=>challenge.teams.some(team=>team.id===own?.id))?.id)
 const teams=state.challenges.filter(c=>c.status==='recruiting').flatMap(c=>c.teams.filter(team=>team.waiting&&team.ready).map(team=>({
  team_id:team.id,challenge_id:c.id,title:c.title,team_name:leagueTeamName(team,c.title),department:team.department,capacity:LEAGUE_SPORTS[state.sport].capacity,accepted_count:team.players.filter(p=>p.status==='accepted').length,score_sum:leagueTeamSum(team),compatibility_score:team.score??0,gap:team.gap,is_mine:team.id===own?.id,is_captain:team.is_captain,
  can_propose:!!own?.ready&&own.is_captain&&team.id!==own.id&&team.department!==own.department&&isCompatible(own.players.filter(p=>p.status==='accepted').map(p=>scores[p.tier as keyof typeof scores]),team.players.map(p=>scores[p.tier as keyof typeof scores]),own.gap,team.gap),incoming:false,outgoing:pending.proposal===team.id,
  players:team.players.filter(p=>p.status==='accepted').map((p,index)=>({roster_id:p.id,alias:p.alias,slot:p.slot!,position:p.position!,tier:p.tier!,score:scores[p.tier as keyof typeof scores],is_captain:index===0,is_me:p.is_me}))
 })))
 return {sport:state.sport,total_count:teams.length,teams,next_cursor:null,transfers:pending.transfer&&own?[{id:own.id,team_id:own.id,from_alias:'현재 주장',to_alias:pending.transfer.to_alias,to_roster_id:pending.transfer.to_roster_id,is_recipient:pending.transfer.is_recipient,can_cancel:own.is_captain,expires_at:new Date(Date.now()+86400000).toISOString()}]:[]}
}
export default function LeagueLobby({sport,state,own,revision,demo,onDemo,onRoster,onPaired,onRefresh,renderRoster,captainOnly=false,gap=200}:{sport:LeagueSport;captainOnly?:boolean;gap?:200|300;state:JourneyState;own:JourneyTeam|null;revision:number;demo:boolean;onDemo:(action:LeagueDemoAction)=>void;onRoster:()=>void;onPaired:(id?:string)=>void;onRefresh:()=>Promise<unknown>;renderRoster:(players:JourneyPlayer[],selected:string,onSelect:(slot:string)=>void)=>ReactNode}){
 const {t}=useQuantumLocale()
 const ownName=own?leagueTeamName(own,state.challenges.find(challenge=>challenge.teams.some(team=>team.id===own.id))?.title):state.my_department
 const [live,setLive]=useState<LeagueLobbyState|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[selected,setSelected]=useState<string|null>(null),[view,setView]=useState<'detail'|'proposal'|'waiting'>('detail'),[side,setSide]=useState<'own'|'other'>('other'),[slot,setSlot]=useState(''),[recipient,setRecipient]=useState(''),[notice,setNotice]=useState('')
 const generation=useRef(0),mutation=useRef(false)
 const invalidateLoad=useCallback(()=>{++generation.current},[])
 const snapshot=demo?demoSnapshot(state,own):live
 const candidate=snapshot?.teams.find(team=>team.team_id===selected)
 const candidates=snapshot?.teams.filter(team=>!team.is_mine)??[]
 const viewerAccepted=!!own?.players.some(player=>player.is_me&&player.status==='accepted')
 const acceptedTeamId=viewerAccepted?own?.id??null:null
 const load=useCallback(async(cursor?:string)=>{
  if(demo)return
  const version=++generation.current
  try{
   const query=new URLSearchParams({sport,...(acceptedTeamId?{team_id:acceptedTeamId}:{}),...(cursor?{cursor}:{})})
   const response=await fetch(`${endpoint}?${query}`,{cache:'no-store'}),body=await response.json().catch(()=>null),parsed=parseLeagueLobbyState(body?.lobby)
   if(!response.ok||!parsed||parsed.sport!==sport)throw new Error('lobby_unavailable')
   if(version===generation.current){setLive(previous=>cursor&&previous?{...parsed,teams:[...previous.teams,...parsed.teams.filter(team=>!previous.teams.some(old=>old.team_id===team.team_id))]}:parsed);setError('')}
  }catch{if(version===generation.current){setLive(null);setError('대기 팀을 불러오지 못했어요. 다시 연결해 주세요.')}}
 },[demo,acceptedTeamId,sport])
 useEffect(()=>{if(demo)return;setLive(null);void load();const timer=window.setInterval(()=>{if(!mutation.current&&document.visibilityState==='visible'){void load();if(!captainOnly&&viewerAccepted)void onRefresh()}},8000);return()=>{invalidateLoad();window.clearInterval(timer)}},[load,demo,captainOnly,viewerAccepted,onRefresh,invalidateLoad])
 useEffect(()=>{if(candidate?.outgoing)setView('waiting')},[candidate?.outgoing])
 useEffect(()=>{if(!demo&&candidate&&!candidate.outgoing&&view==='waiting'){setView('detail');setNotice('제안 상태가 변경됐어요. 팀 정보를 확인해 주세요.')}},[candidate,demo,view])
 async function command(action:string,args:Record<string,unknown>,next?:()=>void){
  if(mutation.current)return
  mutation.current=true;setBusy(true);setError('');setNotice('')
  try{const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,args:{...args,idempotency_key:crypto.randomUUID()}})}),body=await response.json().catch(()=>null);if(!response.ok||!body?.lobby)throw new Error('command_failed');await onRefresh();await load();if(action==='accept'){const id=body.lobby.challenge_id;if(typeof id!=='string')throw new Error('invalid_match');onPaired(id)}else{if(action==='transfer_respond'&&args.accept===true)setNotice('주장 위임이 완료됐어요. 이전 주장의 미수락 친구 초대는 취소됐어요. 새 주장이 다시 초대할 수 있어요.');next?.()}}
  catch{setError('요청이 완료됐는지 확인하지 못했어요. 새로고침한 뒤 현재 상태를 확인해 주세요.')}
  finally{mutation.current=false;setBusy(false)}
 }
 async function queue(waiting:boolean){if(!own||mutation.current)return;mutation.current=true;setBusy(true);setError('');try{const response=await fetch('/api/community/department/league',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'queue',args:{team_id:own.id,gap,waiting}})});if(!response.ok)throw new Error('queue_failed');await onRefresh();await load()}catch{setError('대기 등록 상태를 바꾸지 못했어요. 다시 연결해 주세요.')}finally{mutation.current=false;setBusy(false)}}
 function actDemo(action:LeagueDemoAction,next?:()=>void){try{onDemo(action);setError('');next?.()}catch{setError('팀과 주장 상태를 확인하고 다시 시도해 주세요.')}}
 const accepted=own?.players.filter(p=>p.status==='accepted')??[]
 const otherPlayers:JourneyPlayer[]=candidate?.players.map(p=>({id:p.roster_id,alias:p.alias,slot:p.slot,position:p.position,tier:p.tier,status:'accepted',is_me:false}))??[]
 const transfer=snapshot?.transfers.find(item=>item.team_id===own?.id)
 const pending=demo?leagueDemoLobby(state,state.challenges.find(challenge=>challenge.teams.some(team=>team.id===own?.id))?.id).proposal:null
 const selectTeam=(team:LeagueLobbyTeam)=>{setSelected(team.team_id);setSide('other');setSlot('');setView(team.outgoing?'waiting':'detail');setNotice('')}
 const delegation=own?.is_mine?<details className={s.delegation}><summary>주장 {own.is_captain?'· 내가 맡고 있어요':'· 팀에서 제안과 수락을 맡아요'}</summary>{transfer?<div className={s.card}><p>{transfer.to_alias}님에게 주장 위임을 요청했어요. 수락 전까지 현재 주장이 유지돼요.</p>{transfer.is_recipient||demo?<div className={s.actions}><button type="button" className={s.primary} disabled={busy} onClick={()=>demo?actDemo({type:'captain_accept'},()=>setNotice('수령자가 동의해 주장이 바뀌었어요.')):void command('transfer_respond',{transfer_id:transfer.id,accept:true})}>{demo&&!transfer.is_recipient?'예시 수령자: 위임 수락':'주장 위임 수락'}</button><button type="button" className={s.secondary} disabled={busy} onClick={()=>demo?actDemo({type:'captain_decline'}):void command('transfer_respond',{transfer_id:transfer.id,accept:false})}>위임 거절</button></div>:null}{transfer.can_cancel?<button type="button" className={s.back} disabled={busy} onClick={()=>demo?actDemo({type:'captain_cancel'}):void command('transfer_cancel',{transfer_id:transfer.id})}>위임 요청 취소</button>:null}</div>:own.is_captain?<div className={s.delegateForm}><label>위임받을 팀원<select aria-label="위임받을 팀원" value={recipient} onChange={event=>setRecipient(event.target.value)}><option value="">팀원 선택</option>{accepted.filter(player=>!player.is_me).map(player=><option key={player.id} value={player.id}>{player.alias} · {player.slot?.toUpperCase()}</option>)}</select></label><button type="button" className={s.secondary} disabled={busy||!recipient} onClick={()=>demo?actDemo({type:'captain_offer',recipientRosterId:recipient}):void command('transfer_propose',{team_id:own.id,recipient_roster_id:recipient,expected_revision:revision})}>주장 위임 요청</button></div>:demo&&accepted.some(p=>p.is_me)?<button type="button" className={s.secondary} onClick={()=>actDemo({type:'captain_request_to_me'})}>예시 현재 주장: 나에게 위임 요청</button>:<p className={s.note}>현재 주장이 위임을 제안하면 받을 팀원이 직접 수락해요.</p>}</details>:null
 if(captainOnly)return <section className={s.lobby} aria-label="경기 주장 관리">{error?<p className={s.error} role="alert">{error}</p>:null}{notice?<p className={s.notice} role="status">{notice}</p>:null}{delegation}</section>
 return <section className={s.lobby} aria-label="리그 대기실">
  {error?<div className={s.error} role="alert">{error}<button type="button" disabled={busy} onClick={()=>void load()}>다시 연결</button></div>:null}
  {notice?<p className={s.notice} role="status">{notice}</p>:null}
  {selected&&candidate?<>
   <button type="button" className={s.back} onClick={()=>{setSelected(null);setView('detail')}}>← 대기 팀 목록</button>
   <div className={s.compare}><div><small>우리 팀 · {accepted.length}/{LEAGUE_SPORTS[sport].capacity}</small><strong>{ownName}</strong><span>팀 합계 {own?leagueTeamSum(own).toLocaleString():'—'}</span></div><b>VS</b><div><small>상대 팀 · {candidate.accepted_count}/{candidate.capacity}</small><strong>{leagueTeamName(candidate,candidate.title)}</strong><span>팀 합계 {candidate.score_sum.toLocaleString()}</span></div></div>
   {view==='waiting'?<div className={s.card} data-league-proposal="waiting"><span className={s.eyebrow}>제안 보냄</span><h2>상대 주장의 수락을 기다려요</h2><p>{leagueTeamName(candidate,candidate.title)}에서 수락하면 양 팀의 경기 채팅이 열려요.</p><button type="button" className={s.secondary} disabled={busy||!own?.is_captain} onClick={()=>demo?actDemo({type:'cancel_proposal'},()=>{setView('detail');setNotice('제안을 취소했어요.')}):void command('proposal_cancel',{team_id:own?.id,opponent_team_id:candidate.team_id},()=>{setView('detail');setNotice('제안을 취소했어요.')})}>제안 취소</button>{demo?<div className={s.rehearsal}><strong>예시 상대 주장 역할</strong><p>이 버튼을 눌러야 상대가 동의한 상황으로 넘어가요.</p><div className={s.actions}><button type="button" className={s.primary} onClick={()=>actDemo({type:'accept_proposal'},()=>onPaired())}>예시 상대 주장: 제안 수락</button><button type="button" className={s.secondary} onClick={()=>actDemo({type:'decline_proposal'},()=>{setView('detail');setNotice('예시 상대가 제안을 거절했어요. 다른 팀을 볼 수 있어요.')})}>예시 상대 주장: 거절</button></div></div>:<button type="button" className={s.back} disabled={busy} onClick={()=>{void onRefresh();void load()}}>수락 상태 새로고침</button>}</div>:view==='proposal'?<div className={s.card}><span className={s.eyebrow}>주장 최종 확인</span><h2>{leagueTeamName(candidate,candidate.title)}에 경기 제안을 보낼까요?</h2><p>수락 후 양 팀이 채팅에서 날짜와 장소를 함께 정해요.</p><div className={s.actions}><button type="button" className={s.secondary} onClick={()=>setView('detail')}>돌아가기</button><button type="button" className={s.primary} disabled={busy||!candidate.can_propose||!!pending} onClick={()=>demo?actDemo({type:'propose',opponentTeamId:candidate.team_id},()=>setView('waiting')):void command('propose',{team_id:own?.id,opponent_team_id:candidate.team_id},()=>setView('waiting'))}>경기 제안 보내기</button></div></div>:<>
    <div className={s.tabs} role="group" aria-label="팀 포지션 보기"><button type="button" aria-pressed={side==='other'} onClick={()=>{setSide('other');setSlot('')}}>상대 포지션·티어</button><button type="button" aria-pressed={side==='own'} disabled={!own} onClick={()=>{setSide('own');setSlot('')}}>우리 팀 포지션·티어</button></div>
    <div className={s.detailMap}>{renderRoster(side==='other'?otherPlayers:accepted,slot,setSlot)}</div>
    <p className={s.note}>포지션을 눌러 별명과 직접 입력한 티어를 확인해요. 팀 합계는 참가자 점수의 합이며, 상대 선택은 별도의 내부 비교 점수와 최고 점수 차이 제한을 함께 사용해요. 공식 MMR이 아니에요.</p>
    {candidate.incoming?<div className={s.card}><h2>이 팀의 경기 제안이 도착했어요</h2><div className={s.actions}><button type="button" className={s.secondary} disabled={busy||!own?.is_captain} onClick={()=>void command('proposal_decline',{team_id:own?.id,opponent_team_id:candidate.team_id},()=>setNotice('제안을 거절했어요.'))}>거절</button><button type="button" className={s.primary} disabled={busy||!own?.is_captain} onClick={()=>void command('accept',{team_id:own?.id,opponent_team_id:candidate.team_id})}>주장으로 수락하고 경기 채팅 열기</button></div></div>:<button type="button" className={s.primary} disabled={busy||!candidate.can_propose||!!pending} onClick={()=>setView('proposal')}>이 팀에 경기 제안</button>}
    {!candidate.can_propose&&!candidate.incoming?<p className={s.note}>{!own?.ready?'우리 팀 정원을 채운 뒤 주장이 제안할 수 있어요.':!own.is_captain?'경기 제안은 우리 팀 주장이 보내요.':!demo&&!own.waiting?'목록에서 대기 등록을 완료하면 조건에 맞는 팀에 제안할 수 있어요.':'양 팀의 점수 차이와 참가 조건이 맞아야 제안할 수 있어요.'}</p>:null}
   </>}
  </>:<>
   <header className={s.heading}><div><span className={s.eyebrow}>WAITING TEAMS</span><h2>지금 기다리는 팀 <b>{snapshot?snapshot.total_count:'—'}</b></h2></div><button type="button" className={s.back} disabled={busy} onClick={()=>{void onRefresh();void load()}}>새로고침</button></header>
   <div className={s.ownTeam}><div><small>우리 팀</small><strong>{ownName}</strong><span>{accepted.length}/{LEAGUE_SPORTS[sport].capacity}명 · 팀 합계 {own?leagueTeamSum(own).toLocaleString():0}</span></div><button type="button" className={s.secondary} onClick={onRoster}>{own?.is_mine?'내 팀·포지션':'팀 참가하기'} →</button></div>
   <p className={s.note}>우리 팀을 모으는 동안에도 상대 명단을 둘러볼 수 있어요. 정원이 찬 팀의 주장이 상대를 골라 제안해요.</p>
   {own?.is_captain&&own.ready&&!demo?<button type="button" className={own.waiting?s.secondary:s.primary} disabled={busy} onClick={()=>void queue(!own.waiting)}>{own.waiting?'대기 등록 취소':'우리 팀 대기 등록'}</button>:null}
   {delegation}
   {!snapshot&&!error?<p className={s.notice} role="status">대기 팀을 확인하고 있어요.</p>:snapshot&&candidates.length===0?<div className={s.card}><h2>아직 대기 중인 상대 팀이 없어요</h2><p>팀을 모으거나 나중에 다시 확인해 주세요.</p></div>:<div className={s.teams}>{candidates.map(team=><button type="button" className={s.teamRow} key={team.team_id} onClick={()=>selectTeam(team)}><div><small>{team.incoming?'받은 제안':team.outgoing?'상대 수락 대기':`${team.accepted_count}/${team.capacity}명 · 준비 완료`}</small><strong>{leagueTeamName(team,team.title)}</strong><small>{team.department}</small><span>{team.players.map(player=>`${player.slot.toUpperCase()} ${t(`challenge.${player.tier}`)}`).join(' · ')}</span></div><div className={s.teamPoints}><small>팀 합계</small><b>{team.score_sum.toLocaleString()}</b><span>명단 보기 →</span></div></button>)}</div>}
   {snapshot?.next_cursor?<button type="button" className={s.secondary} onClick={()=>void load(snapshot.next_cursor!)}>대기 팀 더 보기</button>:null}
  </>}
 </section>
}

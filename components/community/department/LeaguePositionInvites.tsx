'use client'

import {useCallback,useEffect,useId,useRef,useState,type ReactNode} from 'react'
import {Bell,Check,UserPlus,X} from 'lucide-react'
import {useQuantumLocale} from '@/components/i18n/QuantumLocaleProvider'
import {LEAGUE_SPORTS,sportTiers,type LeagueSport,type JourneyPlayer} from '@/lib/meetups/challenge-journey'
import {parseLeagueInviteState,type LeagueInviteState,type LeaguePositionInvite} from '@/lib/meetups/league-invites'
import type {LeagueInviteDemoAction} from '@/lib/meetups/league-invites-demo'
import {leagueInviteNotificationPresentation} from '@/lib/notifications/league-invite-presentation'
import s from './league-position-invites.module.css'

type MutationResult={id:string;challenge_id:string;team_id:string;slot:string;status:LeaguePositionInvite['status'];revision:number;replayed:boolean}
const endpoint='/api/community/department/league/invites'
export function leagueInviteError(error:unknown){
 const code=error instanceof Error?error.message:String(error)
 if(/slot|occupied|capacity|full/.test(code))return '그 자리에 먼저 참가한 팀원이 있어요. 새로고침해서 현재 지도를 확인해 주세요.'
 if(/expired|not_pending|cancelled|unavailable/.test(code))return '만료되거나 변경된 초대예요. 현재 상태를 새로고침해 주세요.'
 if(/stale|revision|formation|position|format/.test(code))return '팀 구성이나 자리가 바뀌었어요. 새 지도를 확인한 뒤 다시 선택해 주세요.'
 if(/friend|blocked|restricted|forbidden/.test(code))return '현재 친구·팀 참가 조건으로는 이 요청을 진행할 수 없어요.'
 if(/tier/.test(code))return '내 티어 또는 실력 수준을 선택해 주세요.'
 return '초대 요청을 완료했는지 확인하지 못했어요. 새로고침 후 다시 시도해 주세요.'
}
export function useLeaguePositionInvites({sport,challengeId,demo,demoState,onDemo,onJourneyRefresh}:{sport:LeagueSport|null;challengeId:string|null;demo:boolean;demoState:LeagueInviteState|null;onDemo:(action:LeagueInviteDemoAction)=>void;onJourneyRefresh:()=>Promise<unknown>}){
 const [live,setLive]=useState<LeagueInviteState|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false)
 const generation=useRef(0),scope=useRef(0),mutation=useRef(false),pending=useRef<{signature:string;key:string}|null>(null)
 const invalidate=useCallback(()=>{++generation.current;++scope.current},[])
 const load=useCallback(async()=>{
  if(demo||!sport)return
  const version=++generation.current
  try{
   const read=async(id:string|null)=>{const query=new URLSearchParams({sport,...(id?{challenge_id:id}:{})}),response=await fetch(`${endpoint}?${query}`,{cache:'no-store'}),payload=await response.json().catch(()=>null),parsed=parseLeagueInviteState(payload?.invites);if(!response.ok||!parsed||parsed.sport!==sport||parsed.challenge_id!==id)throw new Error(payload?.error??'invite_read_failed');return parsed}
   const [inbox,context]=await Promise.all([read(null),challengeId?read(challengeId):Promise.resolve(null)])
   if(version!==generation.current)return
   setLive(context?{...context,incoming:Array.from(new Map([...inbox.incoming,...context.incoming].map(invite=>[invite.id,invite])).values())}:inbox);setError('')
  }catch(failure){if(version===generation.current){setLive(null);setError(leagueInviteError(failure))}}
  finally{if(version===generation.current)setLoading(false)}
 },[challengeId,demo,sport])
 useEffect(()=>{if(demo)return;setLive(null);setLoading(!!sport);setBusy(false);mutation.current=false;pending.current=null;void load();const timer=window.setInterval(()=>{if(!mutation.current&&document.visibilityState==='visible'){void load();if(challengeId)void onJourneyRefresh()}},10000);return()=>{invalidate();window.clearInterval(timer)}},[load,demo,sport,challengeId,invalidate,onJourneyRefresh])
 async function command(action:'invite'|'accept'|'decline'|'cancel',args:Record<string,unknown>,demoAction:LeagueInviteDemoAction):Promise<MutationResult|null>{
  if(mutation.current||!sport)return null
  setError('')
  if(demo){try{onDemo(demoAction);return{id:String(args.invite_id??'demo'),challenge_id:String(args.challenge_id??challengeId??''),team_id:String(args.team_id??''),slot:String(args.slot??''),status:action==='invite'?'pending':action==='accept'?'accepted':action==='decline'?'declined':'cancelled',revision:0,replayed:false}}catch(failure){setError(leagueInviteError(failure));return null}}
  mutation.current=true;setBusy(true);const lifecycle=scope.current,signature=JSON.stringify({action,args})
  if(pending.current?.signature!==signature)pending.current={signature,key:crypto.randomUUID()}
  try{
   const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,args:{...args,sport,idempotency_key:pending.current.key}})}),payload=await response.json().catch(()=>null),result=payload?.invite
   if(!response.ok||!result||typeof result.id!=='string'||typeof result.challenge_id!=='string'||!['pending','accepted','declined','cancelled','expired'].includes(result.status))throw new Error(payload?.error??'invite_write_failed')
   if(lifecycle!==scope.current)return null
   pending.current=null;await Promise.all([load(),onJourneyRefresh()]);return result as MutationResult
  }catch(failure){if(lifecycle===scope.current)setError(leagueInviteError(failure));return null}
  finally{if(lifecycle===scope.current){mutation.current=false;setBusy(false)}}
 }
 return{state:demo?demoState:live,error,loading:demo?false:loading,busy,refresh:load,command}
}
export type LeagueInvitesController=ReturnType<typeof useLeaguePositionInvites>
export function LeagueInviteBell({controller,onOpen}:{controller:LeagueInvitesController;onOpen:()=>void}){
 const count=controller.state?.incoming.filter(invite=>invite.status==='pending'&&Date.parse(invite.expires_at)>Date.now()).length
 return <button type="button" className={s.bell} onClick={onOpen} aria-label={`받은 초대 ${count??'확인 중'}`}><Bell size={16}/><span>받은 초대</span><b>{count??'—'}</b></button>
}
export function LeagueInviteInbox({controller,onSelect,onBack}:{controller:LeagueInvitesController;onSelect:(invite:LeaguePositionInvite)=>void;onBack:()=>void}){
 const records=controller.state?.incoming??[]
 return <section className={s.inbox}><button type="button" className={s.back} onClick={onBack}>← 리그로 돌아가기</button><div className={s.heading}><h2>받은 포지션 초대</h2><button type="button" className={s.back} disabled={controller.busy} onClick={()=>void controller.refresh()}>새로고침</button></div>{controller.error?<p className={s.error} role="alert">{controller.error}</p>:controller.loading?<p role="status">받은 초대를 확인하고 있어요.</p>:records.length?records.map(invite=>{const notification=leagueInviteNotificationPresentation('department_league_invite',{sport:invite.sport,slot:invite.slot,invite_id:invite.id,challenge_id:invite.challenge_id,status:invite.status,inviter_display_name:invite.inviter_name});return <button type="button" key={invite.id} className={s.inviteCard} onClick={()=>onSelect(invite)}><div><small>{invite.inviter_name}님의 초대 · {invite.department}</small><strong>{notification?.title??invite.title}</strong><span>{LEAGUE_SPORTS[invite.sport].slots.find(slot=>slot.key===invite.slot)?.label} · {invite.status==='pending'?'내 자리 확인하고 수락하기':statusLabel(invite.status)}</span></div><span>→</span></button>}):<p className={s.empty}>아직 받은 초대가 없어요.</p>}</section>
}
const statusLabel=(status:LeaguePositionInvite['status'])=>({pending:'수락 대기',accepted:'참가 확정',declined:'거절한 초대',cancelled:'취소된 초대',expired:'만료된 초대'})[status]
export function LeaguePositionInviteSheet({sport,slot,teamId,challengeId,revision,controller,demo,onClose,onViewRecipient}:{sport:LeagueSport;slot:string;teamId:string;challengeId:string;revision:number;controller:LeagueInvitesController;demo:boolean;onClose:()=>void;onViewRecipient:(invite:LeaguePositionInvite)=>void}){
 const dialog=useRef<HTMLDialogElement>(null),heading=useId(),[friend,setFriend]=useState(''),[search,setSearch]=useState('')
 const pending=controller.state?.sent.find(invite=>invite.team_id===teamId&&invite.slot===slot&&invite.status==='pending'&&Date.parse(invite.expires_at)>Date.now())
 const label=LEAGUE_SPORTS[sport].slots.find(item=>item.key===slot)?.label??slot.toUpperCase()
 useEffect(()=>{const element=dialog.current;if(element&&!element.open)element.showModal();return()=>{if(element?.open)element.close()}},[])
 async function send(){const result=await controller.command('invite',{challenge_id:challengeId,team_id:teamId,friend_user_id:friend,slot,expected_revision:controller.state?.revision??revision},{type:'invite',challengeId,slot,friendId:friend});if(result)onClose()}
 return <dialog className={s.dialog} ref={dialog} aria-labelledby={heading} onCancel={event=>{event.preventDefault();onClose()}}><div className={s.sheetTop}><span className={s.eyebrow}>{label} · 빈자리 초대</span><button type="button" onClick={onClose} aria-label="초대창 닫기"><X size={20}/></button></div><h2 id={heading}>{pending?`${pending.invitee_name}님의 수락을 기다려요`:`${label} 자리에 친구를 초대해요`}</h2>{controller.error?<p className={s.error} role="alert">{controller.error}</p>:null}{pending?<><p className={s.note}>초대만으로 자리가 확정되지는 않아요. 친구가 지도와 자리를 확인하고 본인의 티어를 선택해 수락해요.</p><button type="button" className={s.secondary} disabled={controller.busy||!pending.can_cancel} onClick={async()=>{const result=await controller.command('cancel',{invite_id:pending.id,expected_revision:pending.revision},{type:'cancel',inviteId:pending.id});if(result)onClose()}}>이 자리 초대 취소</button>{demo?<button type="button" className={s.demoButton} onClick={()=>onViewRecipient(pending)}>예시 수신자 화면으로 보기 →</button>:null}</>:<><p className={s.note}>수락한 친구만 팀 인원에 포함돼요. 같은 학교·학과의 초대 가능한 친구가 표시돼요.</p><input className={s.search} value={search} onChange={event=>setSearch(event.target.value)} aria-label="초대할 친구 검색" placeholder="친구 이름 검색"/>{controller.loading?<p role="status">친구 목록을 확인하고 있어요.</p>:<div className={s.friends} role="group" aria-label="초대할 친구 선택">{controller.state?.candidates.filter(candidate=>candidate.display_name.includes(search)).map(candidate=><button type="button" key={candidate.user_id} aria-pressed={friend===candidate.user_id} onClick={()=>setFriend(candidate.user_id)}><span className={s.avatar}>{candidate.display_name.slice(0,1)}</span><strong>{candidate.display_name}</strong>{friend===candidate.user_id?<Check size={19}/>:<UserPlus size={18}/>}</button>)}</div>}{!controller.loading&&controller.state?.candidates.length===0?<p className={s.empty}>지금 초대할 수 있는 친구가 없어요. 이미 참가했거나 초대 중인 친구는 제외돼요.</p>:null}<button type="button" className={s.primary} disabled={controller.busy||!friend||!controller.state||!!controller.error} onClick={()=>void send()}>{label} 자리로 초대 보내기</button><button type="button" className={s.back} disabled={controller.busy} onClick={()=>void controller.refresh()}>친구 목록 새로고침</button></>}</dialog>
}
export function LeagueInviteReceiver({sport,inviteId,controller,demo,renderMap,onBack,onJoined}:{sport:LeagueSport;inviteId:string;controller:LeagueInvitesController;demo:boolean;renderMap:(players:JourneyPlayer[],slot:string,pending:{slot:string;alias:string}[])=>ReactNode;onBack:()=>void;onJoined:(challengeId:string)=>void}){
 const {t}=useQuantumLocale(),[tier,setTier]=useState(''),[outcome,setOutcome]=useState<LeaguePositionInvite['status']|null>(null),[known,setKnown]=useState<LeaguePositionInvite|null>(null)
 const incoming=controller.state?.incoming.find(invite=>invite.id===inviteId)
 useEffect(()=>{setOutcome(null);setKnown(null);setTier('')},[inviteId])
 useEffect(()=>{if(incoming)setKnown(incoming)},[incoming])
 const invite=incoming??known,preview=controller.state?.preview,status=outcome??invite?.status
 const expired=!!invite&&Date.parse(invite.expires_at)<=Date.now(),activePreview=status==='accepted'||(status==='pending'&&!expired),validPreview=activePreview&&!!preview&&preview.challenge_id===invite?.challenge_id&&preview.team_id===invite.team_id
 const occupied=validPreview&&preview.players.some(player=>player.slot===invite?.slot)&&status!=='accepted'
 async function respond(accept:boolean){if(!invite)return;const result=await controller.command(accept?'accept':'decline',{invite_id:invite.id,expected_revision:invite.revision,...(accept?{tier}:{})},accept?{type:'accept',inviteId:invite.id,tier}:{type:'decline',inviteId:invite.id});if(result)setOutcome(result.status)}
 return <section className={s.receiver}><button type="button" className={s.back} onClick={onBack}>← 받은 초대</button>{controller.error?<p className={s.error} role="alert">{controller.error}</p>:null}{!invite?<div className={s.empty}>{controller.loading?'초대를 확인하고 있어요.':'이 초대를 찾을 수 없어요. 받은 초대 목록을 다시 확인해 주세요.'}<button type="button" className={s.back} onClick={()=>void controller.refresh()}>다시 확인</button></div>:<><header className={s.heading}><div><span className={s.eyebrow}>{invite.inviter_name}님의 포지션 초대</span><h2>{invite.title}</h2><p>{invite.department}{validPreview?` · ${preview.players.length}/${LEAGUE_SPORTS[sport].capacity}명 확정`:''}</p></div><strong className={s.position}>{LEAGUE_SPORTS[sport].slots.find(slot=>slot.key===invite.slot)?.label}</strong></header>{validPreview?<div className={s.previewMap}>{renderMap(preview.players,invite.slot,status==='pending'?[{slot:invite.slot,alias:'내 초대 자리'}]:[])}</div>:activePreview?<p className={s.empty}>현재 팀 지도를 불러오지 못했어요. 다시 확인해 주세요.</p>:null}{status==='accepted'?<div className={s.accepted} role="status"><Check size={22}/><strong>이 자리로 참가가 확정됐어요</strong><p>별도의 주장 승인 없이 팀 지도에 반영됐어요.</p><button type="button" className={s.primary} onClick={()=>onJoined(invite.challenge_id)}>{demo?'예시 주장 팀 지도로 돌아가기':'내 팀 지도 보기'} →</button></div>:status!=='pending'||expired?<div className={s.empty} role="status">{statusLabel(expired&&status==='pending'?'expired':status??'expired')}예요. 새 초대가 필요하면 주장에게 알려 주세요.</div>:<div className={s.acceptForm}><p className={s.note}>초대한 자리를 확인하고 내 실력을 직접 선택해요. 수락하면 이 포지션으로 바로 참가해요.</p>{occupied?<p className={s.error}>이미 이 자리에 참가한 팀원이 있어요. 지도를 새로고침해 주세요.</p>:null}<label>{sport==='lol'?'내 티어':'내 실력 수준'}<select required value={tier} onChange={event=>setTier(event.target.value)} disabled={controller.busy}><option value="">선택해 주세요</option>{sportTiers(sport).map(value=><option key={value} value={value}>{t(`challenge.${value}`)}</option>)}</select></label><div className={s.actions}><button type="button" className={s.secondary} disabled={controller.busy||!invite.is_recipient} onClick={()=>void respond(false)}>초대 거절</button><button type="button" className={s.primary} disabled={controller.busy||!tier||!invite.is_recipient||!validPreview||!!occupied||!!controller.error} onClick={()=>void respond(true)}>이 자리로 수락하기</button></div></div>}<button type="button" className={s.back} disabled={controller.busy} onClick={()=>void controller.refresh()}>현재 지도·초대 새로고침</button></>}</section>
}

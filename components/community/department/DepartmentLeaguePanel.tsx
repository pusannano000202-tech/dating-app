'use client'

import Image from 'next/image'
import {useCallback,useEffect,useState} from 'react'
import {ArrowRight,Check,Loader2,ShieldCheck,Trophy,UsersRound} from 'lucide-react'
import {useQuantumLocale} from '@/components/i18n/QuantumLocaleProvider'
import {LOL_POSITIONS,LOL_TIERS,SOCCER_POSITIONS,SOCCER_LEVELS,teamCompatibility,parseLeagueState,parseLeagueCandidates,type LeagueCategory,type LeagueState,type LeagueTeam,type LeagueCandidate} from '@/lib/meetups/challenge-league'
import styles from './department-league.module.css'

export async function leagueCommand(action:string,args:Record<string,unknown>) {
 const response=await fetch('/api/community/department/league',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,args})})
 const payload=await response.json().catch(()=>null)
 if(!response.ok)throw new Error(typeof payload?.error==='string'?payload.error:'request_failed')
 return payload?.league as unknown
}
export default function DepartmentLeaguePanel({category,onChanged,refreshKey=0}:{category:LeagueCategory;onChanged:()=>void;refreshKey?:number}){
 const {t,locale}=useQuantumLocale()
 const [state,setState]=useState<LeagueState|null>(null),[error,setError]=useState(false),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[notice,setNotice]=useState('')
 const load=useCallback(async(signal?:AbortSignal)=>{
  setLoading(true);setError(false)
  try{const response=await fetch(`/api/community/department/league?category=${category}`,{cache:'no-store',signal});const payload=await response.json();const parsed=response.ok?parseLeagueState(payload?.league):null;if(!parsed)throw new Error('invalid_league');if(!signal?.aborted)setState(parsed)}
  catch{if(!signal?.aborted){setState(null);setError(true)}}finally{if(!signal?.aborted)setLoading(false)}
 },[category])
 useEffect(()=>{const controller=new AbortController();setState(null);setNotice('');void load(controller.signal);return()=>controller.abort()},[load,refreshKey])
 async function command(action:string,args:Record<string,unknown>){
  if(busy)return false;setBusy(true);setNotice('')
  try{await leagueCommand(action,args);setNotice(action==='accept'?'challenge.paired':'challenge.saved');await load();onChanged();return true}
  catch{setNotice('challenge.failed');await load();return false}finally{setBusy(false)}
 }
 const sport=category==='gaming'?'lol':'soccer'
 return <section className={styles.panel} aria-label={t('challenge.title')}>
  <div className={styles.hero}>
   <Image src={category==='gaming'?'/social-scenes/department-clubhouse-gaming.webp':'/social-scenes/home-playmaker-football.webp'} alt={t(`challenge.${sport}Intro`)} fill sizes="(max-width: 700px) 100vw, 780px" priority />
   <div className={styles.heroCopy}><span>QUANTUM · CAMPUS LEAGUE</span><h2>{t(`challenge.${sport}`)}</h2><p>{t(`challenge.${sport}Intro`)}</p></div>
  </div>
  <section className={styles.records} aria-labelledby="league-record-title">
   <div className={styles.heading}><div><span className={styles.kicker}><Trophy size={15}/>{t('challenge.myDept')}</span><h3 id="league-record-title">{t('challenge.rankTitle')}</h3></div><button className={styles.iconButton} type="button" disabled={loading} onClick={()=>void load()} aria-label={t('challenge.retry')}><Loader2 className={loading?styles.spin:''} size={18}/></button></div>
   <p className={styles.note}>{t('challenge.rankNote')}</p>
   {loading?<p role="status" className={styles.empty}>{t('challenge.loading')}</p>:error?<p role="alert" className={styles.error}>{t('challenge.loadError')}</p>:state?.standings.length?<>
    {state.standings.filter(row=>row.is_me).map(row=><div key={row.department} className={styles.myRecord}><strong>{row.department}</strong><b>{t('challenge.rank',{rank:row.rank})}</b><span>{t('challenge.record',{played:row.played,wins:row.wins,draws:row.draws,losses:row.losses})}</span></div>)}
    {state.standings.every(row=>!row.is_me)?<div className={styles.myRecord}><strong>{state.my_department}</strong><span>{t('challenge.noMyRecord')}</span></div>:null}
    <details className={styles.details} open={state.standings.length<=3}><summary>{t('challenge.moreRecords')}</summary><ol className={styles.standings}>{state.standings.map(row=><li key={row.department}><b>{row.rank}</b><div><strong>{row.department}{row.is_me?<small>{t('challenge.myDept')}</small>:null}</strong><span>{t('challenge.record',{played:row.played,wins:row.wins,draws:row.draws,losses:row.losses})}</span></div></li>)}</ol></details>
   </>:<p className={styles.empty}>{t('challenge.rankEmpty')}</p>}
  </section>
  {notice?<p role="status" className={styles.notice}>{t(notice)}</p>:null}
  {state?.my_teams.length?<section className={styles.teams}><h3><UsersRound size={19}/>{t('challenge.myTeams')}</h3>{state.my_teams.map(team=><TeamPreparation key={`${team.team_id}:${team.waiting}:${team.status}:${team.players.map(p=>`${p.roster_id}-${p.position}-${p.tier}`).join(':')}`} team={team} category={category} busy={busy} command={command}/>)}</section>:null}
  {state?.restrictions.map(restriction=><section key={restriction.id} className={styles.restriction}><h3>{t('challenge.restriction')}</h3><p>{restriction.reason}</p><p>{restriction.revoked?t('challenge.restored'):t('challenge.until',{date:new Date(restriction.ends_at).toLocaleString(locale)})}</p>{restriction.appeal_status==='none'&&!restriction.revoked?<AppealForm busy={busy} onSubmit={reason=>command('appeal',{restriction_id:restriction.id,reason})}/>:<small>{restriction.appeal_response}<br/>{t(restriction.appeal_status==='pending'?'challenge.appealPending':'challenge.reviewed')}</small>}</section>)}
  <p className={styles.identity}><ShieldCheck size={16}/>{t('challenge.privateIdentity')}</p>
 </section>
}
function TeamPreparation({team,category,busy,command}:{team:LeagueTeam;category:LeagueCategory;busy:boolean;command:(action:string,args:Record<string,unknown>)=>Promise<boolean>}){
 const {t}=useQuantumLocale();const me=team.players.find(p=>p.is_me)
 const [position,setPosition]=useState(me?.position??''),[tier,setTier]=useState(me?.tier??''),[gap,setGap]=useState(team.gap),[candidates,setCandidates]=useState<LeagueCandidate[]|null>(null),[error,setError]=useState(false),[loading,setLoading]=useState(false)
 const positions=category==='gaming'?LOL_POSITIONS:SOCCER_POSITIONS,tiers=Object.keys(category==='gaming'?LOL_TIERS:SOCCER_LEVELS)
 const skillScale:Readonly<Record<string,number>>=category==='gaming'?LOL_TIERS:SOCCER_LEVELS
 const scores=team.players.map(player=>player.tier?skillScale[player.tier]:null)
 const compatibility=team.ready&&scores.length>0&&scores.every((score):score is number=>typeof score==='number')?teamCompatibility(scores):null
 const load=useCallback(async(signal?:AbortSignal)=>{setLoading(true);setError(false);try{const response=await fetch(`/api/community/department/league?action=candidates&team_id=${encodeURIComponent(team.team_id)}`,{cache:'no-store',signal});const payload=await response.json();const parsed=response.ok?parseLeagueCandidates(payload?.league):null;if(!parsed)throw new Error();if(!signal?.aborted)setCandidates(parsed)}catch{if(!signal?.aborted){setCandidates(null);setError(true)}}finally{if(!signal?.aborted)setLoading(false)}},[team.team_id])
 useEffect(()=>{if(!team.waiting||!team.is_captain)return;const c=new AbortController();void load(c.signal);return()=>c.abort()},[team.waiting,team.is_captain,load])
 return <article className={styles.team}>
  <div className={styles.heading}><strong>{team.department}</strong><span className={team.ready?styles.ready:styles.pending}>{t(team.ready?'challenge.ready':team.status==='recruiting'?'challenge.notReady':'challenge.fixedTeamIncomplete')}</span></div>
  <ul className={styles.players}>{team.players.map(player=><li key={player.roster_id}><span>{player.position?t(`challenge.${player.position}`):t('challenge.unset')}</span><strong>{player.alias}{player.is_me?<Check size={13}/>:null}</strong><small>{player.tier?t(`challenge.${player.tier}`):'—'}</small></li>)}</ul>
  {compatibility!==null?<p className={styles.note}>{t('challenge.teamScore',{score:compatibility})}</p>:null}
  {team.prior_polls.length?<details className={styles.details}><summary>{t('challenge.priorPolls')}</summary><p className={styles.note}>{t('challenge.priorPollNote')}</p>{team.prior_polls.map(poll=><section key={poll.id} className={styles.candidate}><strong>{poll.title}</strong>{poll.options.map((option,index)=><p key={index} className={styles.note}>{option.label} · {t('challenge.votes',{count:option.votes})}</p>)}</section>)}</details>:null}
  {team.status==='recruiting'?<details className={styles.details} open={!me?.tier}>
   <summary>{t('challenge.selfReport')}</summary><p className={styles.note}>{t('challenge.notVerified')}</p>
   <form onSubmit={e=>{e.preventDefault();void command('profile',{team_id:team.team_id,position,tier})}} className={styles.profileForm}>
    <label>{t('challenge.position')}<select required value={position} onChange={e=>setPosition(e.target.value)}><option value="">—</option>{positions.map(p=><option key={p} value={p} disabled={category==='gaming'&&team.players.some(other=>!other.is_me&&other.position===p)}>{t(`challenge.${p}`)}</option>)}</select></label>
    <label>{t('challenge.tier')}<select required value={tier} onChange={e=>setTier(e.target.value)}><option value="">—</option>{tiers.map(value=><option key={value} value={value}>{t(`challenge.${value}`)}</option>)}</select></label>
    <button type="submit" disabled={busy||!position||!tier} className={styles.secondary}>{t('challenge.saveProfile')}</button>
   </form>
  </details>:<p className={styles.note}>{t('challenge.rosterLocked')}</p>}
  {team.is_captain&&team.status==='recruiting'?<div className={styles.queue}>
   <label>{t('challenge.gap')}<select value={gap} disabled={team.waiting||busy} onChange={e=>setGap(Number(e.target.value) as 200|300)}>{[200,300].map(value=><option key={value} value={value}>{t('challenge.gapValue',{gap:value})}</option>)}</select></label>
   <details className={styles.details}><summary><ShieldCheck size={15}/>{t('challenge.gap')}</summary><p className={styles.note}>{t('challenge.gapExplain')}</p></details>
   <button type="button" className={team.waiting?styles.secondary:styles.primary} disabled={busy||(!team.waiting&&!team.ready)} onClick={()=>void command('queue',{team_id:team.team_id,waiting:!team.waiting,gap})}>{t(team.waiting?'challenge.stopQueue':'challenge.queue')}{!team.waiting?<ArrowRight size={17}/>:null}</button>
   {team.waiting?<section className={styles.opponents}><div className={styles.heading}><strong>{t('challenge.waiting')}</strong><button type="button" disabled={loading||busy} className={styles.iconButton} onClick={()=>void load()} aria-label={t('challenge.retry')}><Loader2 size={17} className={loading?styles.spin:''}/></button></div>{loading?<p role="status">{t('challenge.loading')}</p>:error?<p role="alert" className={styles.error}>{t('challenge.loadError')}</p>:candidates?.length?candidates.map(candidate=><div key={candidate.team_id} className={styles.candidate}><strong>{candidate.department}</strong><small>{t('challenge.gapValue',{gap:candidate.gap})}</small><button type="button" disabled={busy||(candidate.outgoing&&!candidate.incoming)} className={styles.secondary} onClick={()=>void command(candidate.incoming?'accept':'propose',{team_id:team.team_id,opponent_team_id:candidate.team_id}).then(ok=>{if(ok)void load()})}>{t(candidate.incoming?'challenge.accept':candidate.outgoing?'challenge.proposed':'challenge.propose')}</button></div>):<p className={styles.note}>{t('challenge.candidateEmpty')}</p>}</section>:null}
  </div>:null}
 </article>
}
function AppealForm({busy,onSubmit}:{busy:boolean;onSubmit:(reason:string)=>Promise<boolean>}){
 const{t}=useQuantumLocale();const[reason,setReason]=useState('')
 return <form onSubmit={e=>{e.preventDefault();void onSubmit(reason).then(saved=>{if(saved)setReason('')})}}><textarea minLength={10} maxLength={1000} required value={reason} onChange={e=>setReason(e.target.value)} aria-label={t('challenge.appeal')}/><button type="submit" disabled={busy||reason.trim().length<10} className={styles.secondary}>{t('challenge.appeal')}</button></form>
}

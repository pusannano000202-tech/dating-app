'use client'
import {useState} from 'react'
import {useQuantumLocale} from '@/components/i18n/QuantumLocaleProvider'
import {leagueCommand} from './DepartmentLeaguePanel'
import styles from './department-league.module.css'
type Target={id:string;alias:string;position:string}
export default function DepartmentLeagueReport({challengeId}:{challengeId:string}){
 const{t}=useQuantumLocale();const[targets,setTargets]=useState<Target[]|null>(null),[target,setTarget]=useState(''),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('')
 async function load(){
  setBusy(true);setNotice('')
  try{const response=await fetch(`/api/community/department/league?action=report_targets&challenge_id=${encodeURIComponent(challengeId)}`,{cache:'no-store'});const body=await response.json();const values=body?.league;if(!response.ok||!Array.isArray(values)||values.length>20||values.some(v=>!v||typeof v.id!=='string'||typeof v.alias!=='string'||typeof v.position!=='string'))throw new Error();setTargets(values)}catch{setTargets(null);setNotice('challenge.loadError')}finally{setBusy(false)}
 }
 async function submit(){setBusy(true);setNotice('');try{await leagueCommand('report',{challenge_id:challengeId,target_player_id:target,reason});setReason('');setNotice('challenge.saved')}catch{setNotice('challenge.failed')}finally{setBusy(false)}}
 return <details className={styles.report} onToggle={e=>{if(e.currentTarget.open&&targets===null&&!busy)void load()}}><summary>{t('challenge.report')}</summary><p className={styles.note}>{t('challenge.reportExplain')}</p>{busy?<p role="status">{t('challenge.loading')}</p>:null}{notice?<p role="status" className={styles.notice}>{t(notice)}</p>:null}<button className={styles.secondary} type="button" disabled={busy} onClick={()=>void load()}>{t('challenge.retry')}</button>{targets?.length?<form onSubmit={e=>{e.preventDefault();void submit()}}><label className={styles.note}>{t('challenge.position')}<select required value={target} onChange={e=>setTarget(e.target.value)}><option value="">—</option>{targets.map(player=><option key={player.id} value={player.id}>{t(`challenge.${player.position}`)} · {player.alias}</option>)}</select></label><textarea required minLength={10} maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)} aria-label={t('challenge.reportReason')} placeholder={t('challenge.reportReason')}/><button disabled={busy||!target||reason.trim().length<10} className={styles.secondary} type="submit">{t('challenge.sendReport')}</button></form>:null}</details>
}

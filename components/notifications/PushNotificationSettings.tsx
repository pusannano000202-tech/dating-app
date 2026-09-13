'use client'

import {useEffect,useRef,useState} from 'react'
import {BellRing,ShieldCheck} from 'lucide-react'
import {COMMON_PUSH_CONSENT_VERSION,COMMON_PUSH_SCOPE,COMMON_PUSH_WORKER} from '@/lib/notifications/web-push-contract'
import {commonPushDevice,checkedPushUnsubscribe} from '@/lib/notifications/web-push-device'
import styles from './push-settings.module.css'

type State='checking'|'unsupported'|'install'|'unavailable'|'denied'|'off'|'on'|'error'
type Config={owner_id:string;available:boolean;publicKey:string|null;consentVersion:string}
function canPush(){return typeof window!=='undefined'&&window.isSecureContext&&'serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window}
function needsIosInstall(){return (/iPad|iPhone|iPod/.test(navigator.userAgent)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)&&!window.matchMedia('(display-mode: standalone)').matches&&!(navigator as Navigator&{standalone?:boolean}).standalone}
function applicationKey(value:string):Uint8Array<ArrayBuffer>{const raw=atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4));return Uint8Array.from(raw,c=>c.charCodeAt(0))}
/** A local unsubscribe on sign-out/account switch stops this device receiving
 * old-account pushes. The server expires its endpoint on a 404/410 response. */
export async function stopCommonPushOnAccountChange(previousOwner:string){
 await commonPushDevice.removeForOwner(previousOwner,async()=>{
  if(!canPush())return
  const registration=await navigator.serviceWorker.getRegistration(COMMON_PUSH_SCOPE)
  if(registration?.active?.scriptURL!==new URL(COMMON_PUSH_WORKER,location.origin).href)return
  const subscription=await registration.pushManager.getSubscription()
  if(subscription)await checkedPushUnsubscribe(subscription)
 })
}
/** Mount once beside the global notification provider, not only in settings. */
export function CommonPushAccountBoundary({ownerId}:{ownerId:string|null|undefined}){
 const previous=useRef<string|null|undefined>(undefined),epoch=useRef(0)
 const [failure,setFailure]=useState<{owner:string;message:string}|null>(null)
 useEffect(()=>{
  if(ownerId===undefined)return
  const old=previous.current;previous.current=ownerId
  if(typeof old!=='string'||old===ownerId)return
  const ticket=++epoch.current
  void stopCommonPushOnAccountChange(old).then(()=>{if(ticket===epoch.current)setFailure(null)}).catch(()=>{if(ticket===epoch.current)setFailure({owner:old,message:'이전 계정의 기기 알림 해제를 확인하지 못했어요. 아래에서 다시 해제하거나 휴대폰 설정에서 이 사이트의 알림을 꺼 주세요.'})})
 },[ownerId])
 if(!failure)return null
 return <div className={styles.accountWarning} role="alert"><p>{failure.message}</p><button type="button" onClick={()=>{
  const ticket=++epoch.current
  void stopCommonPushOnAccountChange(failure.owner).then(()=>{if(ticket===epoch.current)setFailure(null)}).catch(()=>{if(ticket===epoch.current)setFailure({...failure})})
 }}>기기 알림 해제 다시 확인</button></div>
}
export default function PushNotificationSettings({ownerId}:{ownerId:string}){
 const [view,setView]=useState<{ownerId:string;state:State}>({ownerId,state:'checking'})
 const [busy,setBusy]=useState(false),[feedback,setFeedback]=useState('')
 const currentOwner=useRef(ownerId),config=useRef<Config|null>(null),mounted=useRef(true)
 currentOwner.current=ownerId
 const state=view.ownerId===ownerId?view.state:'checking'
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
 useEffect(()=>{
  let live=true;config.current=null;setFeedback('');setBusy(false)
  const show=(next:State)=>{if(live)setView({ownerId,state:next})}
  show('checking')
  if(!canPush()){show(needsIosInstall()?'install':'unsupported');return()=>{live=false}}
  if(needsIosInstall()){show('install');return()=>{live=false}}
  if(Notification.permission==='denied'){show('denied');return()=>{live=false}}
  void(async()=>{
   try{
    const response=await fetch('/api/notifications/push/config',{cache:'no-store',credentials:'same-origin'})
    const value=await response.json() as Config
    if(!live)return
    if(!response.ok||value.owner_id!==ownerId||!value.available||!value.publicKey||value.consentVersion!==COMMON_PUSH_CONSENT_VERSION){show('unavailable');return}
    config.current=value
    const registration=await navigator.serviceWorker.getRegistration(COMMON_PUSH_SCOPE)
    const subscription=registration?.active?.scriptURL===new URL(COMMON_PUSH_WORKER,location.origin).href?await registration.pushManager.getSubscription():null
    if(!subscription){show('off');return}
    const status=await fetch('/api/notifications/push/subscriptions/status',{method:'POST',headers:{'Content-Type':'application/json','X-Quantum-Owner':ownerId},body:JSON.stringify({endpoint:subscription.endpoint}),credentials:'same-origin'})
    const saved=await status.json();if(!live)return
    if(status.ok&&saved.owner_id===ownerId&&saved.registered)commonPushDevice.rememberOwner(ownerId)
    show(status.ok&&saved.owner_id===ownerId?(saved.registered?'on':'off'):'error')
   }catch{show('error')}
  })()
  return()=>{live=false}
 },[ownerId])
 const act=async()=>{
  if(busy)return
  const actor=ownerId,stillCurrent=()=>mounted.current&&currentOwner.current===actor
  setBusy(true);setFeedback('')
  try{
   // Keep the permission request in the explicit user gesture, before any
   // queued old-account cleanup can defer execution.
   if(state!=='on'){
    const settings=config.current;if(!settings||settings.owner_id!==actor||!settings.publicKey)throw new Error('push_unavailable')
    const permission=await Notification.requestPermission();if(!stillCurrent())return
    if(permission!=='granted'){setView({ownerId:actor,state:permission==='denied'?'denied':'off'});return}
   }
   await commonPushDevice.exclusive(async()=>{
   if(!stillCurrent())return
   if(state==='on'){
    const registration=await navigator.serviceWorker.getRegistration(COMMON_PUSH_SCOPE)
    const subscription=registration?.active?.scriptURL===new URL(COMMON_PUSH_WORKER,location.origin).href?await registration.pushManager.getSubscription():null
    if(subscription){
     const response=await fetch('/api/notifications/push/subscriptions',{method:'DELETE',headers:{'Content-Type':'application/json','X-Quantum-Owner':actor},credentials:'same-origin',body:JSON.stringify({endpoint:subscription.endpoint})})
     const result=await response.json();if(!response.ok||result.owner_id!==actor)throw new Error('unsubscribe_failed')
     await checkedPushUnsubscribe(subscription)
    }
    commonPushDevice.clearOwner()
    if(stillCurrent()){setView({ownerId:actor,state:'off'});setFeedback('이 기기의 퀀텀 일반 알림을 껐어요. 앱 안 알림은 그대로 볼 수 있어요.')}
    return
   }
   const settings=config.current;if(!settings||settings.owner_id!==actor||!settings.publicKey)throw new Error('push_unavailable')
   const registration=await navigator.serviceWorker.register(COMMON_PUSH_WORKER,{scope:COMMON_PUSH_SCOPE})
   await new Promise<void>((resolve,reject)=>{
    if(registration.active){resolve();return}
    const worker=registration.installing??registration.waiting
    if(!worker){reject(new Error('worker_unavailable'));return}
    const timeout=setTimeout(()=>reject(new Error('worker_timeout')),10000)
    worker.addEventListener('statechange',()=>{if(worker.state==='activated'){clearTimeout(timeout);resolve()}else if(worker.state==='redundant'){clearTimeout(timeout);reject(new Error('worker_unavailable'))}})
   })
   if(!stillCurrent())return
   // A local stale subscription may belong to a previously signed-in account.
   // It is never reassigned to the current account in the database.
   const previous=await registration.pushManager.getSubscription();if(previous)await checkedPushUnsubscribe(previous)
   commonPushDevice.clearOwner()
   const subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:applicationKey(settings.publicKey)})
   commonPushDevice.rememberOwner(actor)
   if(!stillCurrent()){await checkedPushUnsubscribe(subscription);return}
   const value=subscription.toJSON()
   const response=await fetch('/api/notifications/push/subscriptions',{method:'POST',headers:{'Content-Type':'application/json','X-Quantum-Owner':actor},credentials:'same-origin',body:JSON.stringify({endpoint:value.endpoint,keys:value.keys,consentVersion:COMMON_PUSH_CONSENT_VERSION})})
   const result=await response.json()
   if(!response.ok||result.owner_id!==actor||!stillCurrent()){await checkedPushUnsubscribe(subscription);if(stillCurrent())throw new Error('subscription_failed');return}
   setView({ownerId:actor,state:'on'});setFeedback('이 기기의 알림 수신을 등록했어요. 실제 도착 여부는 휴대폰 알림 설정과 연결 상태에 따라 달라요.')
   })
  }catch{if(stillCurrent()){setView({ownerId:actor,state:'error'});setFeedback('연결을 완료하지 못했어요. 잠시 뒤 다시 시도해 주세요.')}}
  finally{if(stillCurrent())setBusy(false)}
 }
 const description:Record<State,string>={checking:'이 기기의 알림 설정을 확인하고 있어요.',unsupported:'이 브라우저에서는 휴대폰 알림을 지원하지 않아요. 지원하는 최신 브라우저에서 열어 주세요.',install:'iPhone·iPad는 Safari에서 공유 → 홈 화면에 추가한 뒤, 추가한 퀀텀을 열어 알림을 켜 주세요.',unavailable:'알림 서버 연결이 아직 준비되지 않았어요. 앱 안 알림은 계속 확인할 수 있어요.',denied:'알림 권한이 꺼져 있어요. 휴대폰 또는 브라우저 설정에서 이 사이트의 알림을 허용해 주세요.',off:'신청·초대·승인과 새 대화 소식을, 다른 화면에 있어도 휴대폰 알림으로 받아요.',on:'이 기기에 알림 수신을 등록했어요. 앱 안 알림센터에서도 같은 소식을 확인할 수 있어요.',error:'이 기기의 알림 연결을 확인하지 못했어요. 등록 여부를 다시 확인해 주세요.'}
 return <section className={styles.card} aria-labelledby="push-settings-heading">
  <div className={styles.heading}><span className={styles.icon}><BellRing size={21}/></span><div><p className={styles.eyebrow}>놓치지 않는 소식</p><h3 id="push-settings-heading">휴대폰에서도 알려드릴까요?</h3></div>{state==='on'&&<span className={styles.badge}>등록됨</span>}</div>
  <p className={styles.description}>{description[state]}</p>
  <p className={styles.description}>앱 안의 빨간 배지는 알림함에 새 소식이 있다는 뜻이에요. 이 기기 등록이나 실제 휴대폰 수신 확인과는 별개예요.</p>
  <p className={styles.privacy}><ShieldCheck size={15}/> 잠금화면에는 이름·채팅 내용·보증금 금액을 표시하지 않아요.</p>
  {(state==='off'||state==='on'||state==='error'&&config.current)&&<button type="button" disabled={busy} onClick={()=>void act()} className={state==='on'?styles.secondary:styles.primary}>{busy?'설정 중…':state==='on'?'이 기기 알림 끄기':'이 기기에 알림 켜기'}</button>}
  {feedback&&<p className={styles.feedback} role="status">{feedback}</p>}
  <details className={styles.details}><summary>알림이 안 오는 경우</summary><p>집중 모드·절전·네트워크·기기 설정으로 늦어질 수 있어요. 중요 알림은 앱 안에도 남아요. 오늘밤 만나기와 캠퍼스7은 해당 화면의 전용 알림 설정을 따로 사용해요.</p></details>
 </section>
}

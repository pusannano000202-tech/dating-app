/** Shared types contain no provider secrets at runtime in the client bundle. */
export const COMMON_PUSH_CONSENT_VERSION = '2026-09-12-common-alerts-v1'
export const COMMON_PUSH_SCOPE = '/notifications/'
export const COMMON_PUSH_WORKER = '/quantum-notifications-sw.js'
export type CommonPushSubscription = { endpoint: string; keys: { p256dh: string; auth: string }; consentVersion: string }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const exactKeys = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && Object.keys(v).every(k => keys.includes(k))
export function allowedCommonPushEndpoint(value: unknown): value is string {
 if (typeof value !== 'string' || value.length > 2048 || /[\\\s]/.test(value)) return false
 try {
  const u = new URL(value)
  if(u.protocol !== 'https:' || u.username || u.password || u.port || u.hash || (u.pathname === '/' && !u.search))return false
  return u.hostname === 'fcm.googleapis.com' || u.hostname === 'updates.push.services.mozilla.com' || u.hostname === 'web.push.apple.com' || /^[a-z0-9-]+\.notify\.windows\.com$/.test(u.hostname)
 } catch { return false }
}
export function parseCommonPushSubscription(v: unknown): CommonPushSubscription | null {
 if(!object(v)||!exactKeys(v,['endpoint','keys','consentVersion'])||!allowedCommonPushEndpoint(v.endpoint)||v.consentVersion!==COMMON_PUSH_CONSENT_VERSION||!object(v.keys)||!exactKeys(v.keys,['p256dh','auth']))return null
 if(typeof v.keys.p256dh!=='string'||!/^B[A-Za-z0-9_-]{86}$/.test(v.keys.p256dh)||typeof v.keys.auth!=='string'||!/^[A-Za-z0-9_-]{22}$/.test(v.keys.auth))return null
 return v as CommonPushSubscription
}
export function commonPushConfig(env: Readonly<Record<string,string|undefined>>) {
 const publicKey=env.QUANTUM_WEB_PUSH_PUBLIC_KEY?.trim()??'', privateKey=env.QUANTUM_WEB_PUSH_PRIVATE_KEY?.trim()??'', subject=env.QUANTUM_WEB_PUSH_SUBJECT?.trim()??''
 const ready=env.QUANTUM_WEB_PUSH_ENABLED==='true'&&/^B[A-Za-z0-9_-]{86}$/.test(publicKey)&&/^[A-Za-z0-9_-]{43}$/.test(privateKey)&&/^(?:mailto:[^\s@]+@[^\s@]+\.[^\s@]+|https:\/\/[^\s]+)$/.test(subject)
 return {ready,publicKey,privateKey,subject}
}
export function commonPushPayload(id: string) {
 return {title:'Quantum',body:'새 알림이 도착했어요. 앱에서 확인해 주세요.',url:'/notifications',notificationId:/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)?id:'quantum-notification'}
}
/** Configuration is not evidence that a scheduler ran or that a phone displayed a push. */
export function commonPushReadiness(env:Readonly<Record<string,string|undefined>>,adminReady=Boolean(env.SUPABASE_SERVICE_ROLE_KEY?.trim()||env.SUPABASE_SECRET_KEY?.trim())){
 const providerReady=commonPushConfig(env).ready
 const dispatcherConfigured=Boolean(env.CRON_SECRET&&env.CRON_SECRET.length>=32&&adminReady)
 return {available:providerReady&&dispatcherConfigured,providerReady,dispatcherConfigured,schedulerVerified:false,phoneDeliveryVerified:false}
}
export function classifyCommonPushFailure(error: unknown): {code:string;revoke:boolean;retry:boolean} {
 const status=object(error)&&typeof error.statusCode==='number'?error.statusCode:null
 if(status===404||status===410)return {code:'endpoint_expired',revoke:true,retry:false}
 if(status===429)return {code:'rate_limited',revoke:false,retry:true}
 if(status===401||status===403)return {code:'provider_auth_failed',revoke:false,retry:true}
 if(status!==null&&status>=400&&status<500)return {code:'provider_rejected',revoke:false,retry:false}
 return {code:status!==null&&status>=500?'provider_unavailable':'transport_failed',revoke:false,retry:true}
}
export type CommonPushClaim = {delivery_id:string;revision:number;notification_id:string;subscription_id:string;endpoint:string;p256dh:string;auth_secret:string}

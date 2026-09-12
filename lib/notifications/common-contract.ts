export interface NotificationRow { id:string; kind:string; payload:Record<string,unknown>; read_at:string|null; created_at:string }
export const notificationUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const record=(v:unknown):v is Record<string,unknown>=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v)
export function parseReadRequest(value:unknown):{all:true}|{notification_id:string}|null {
 if(!record(value)||Object.keys(value).length!==1)return null
 if(value.all===true)return {all:true}
 return typeof value.notification_id==='string'&&notificationUuid.test(value.notification_id)?{notification_id:value.notification_id}:null
}
export function parseNotificationPage(value:unknown):NotificationRow[]|null {
 if(!record(value)||!Array.isArray(value.notifications))return null
 if(!value.notifications.every(n=>record(n)&&typeof n.id==='string'&&notificationUuid.test(n.id)&&typeof n.kind==='string'&&record(n.payload)&&typeof n.created_at==='string'&&Number.isFinite(Date.parse(n.created_at))&&(n.read_at===null||typeof n.read_at==='string'&&Number.isFinite(Date.parse(n.read_at)))))return null
 return value.notifications as NotificationRow[]
}
const order=(a:NotificationRow,b:NotificationRow)=>Date.parse(b.created_at)-Date.parse(a.created_at)||b.id.localeCompare(a.id)
export function mergeNotificationPages(old:NotificationRow[],fresh:NotificationRow[]):NotificationRow[]{return [...new Map([...old,...fresh].map(n=>[n.id,n])).values()].sort(order)}
/** Newer than the last observed head only: historical page loading is never a toast. */
export function newArrival(previous:NotificationRow[]|null,next:NotificationRow[]):NotificationRow|null {
 if(previous===null)return null
 const seen=new Set(previous.map(n=>n.id)),head=[...previous].sort(order)[0]
 return [...next].sort(order).find(n=>!n.read_at&&!seen.has(n.id)&&(!head||order(n,head)<0))??null
}
export function notificationCursor(rows:NotificationRow[]){const last=[...rows].sort(order).at(-1);return last?{before_created_at:last.created_at,before_id:last.id}:null}
/** Defense in depth after a server-side owner/current-state resolution. Never use payload.href. */
export function resolveSocialLink(value:unknown):string|null {
 if(!record(value)||value.status!=='current'||typeof value.href!=='string')return null
 const href=value.href
 if((!href.startsWith('/meetups/')&&!href.startsWith('/chat/'))||/[\\#]|\.\.|%2e|%2f|%5c/i.test(href))return null
 const url=new URL(href,'https://quantum.invalid')
 if(url.origin!=='https://quantum.invalid')return null
 const id='[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
 if(new RegExp('^/meetups/candidates\\?kind=(?:league|study|mentoring|meetup)&key=(?:[a-z0-9_-]|%3a){1,100}(?:&invite='+id+')?$','i').test(href))return href
 if(!url.search&&new RegExp('^/meetups/participation/(?:study|mentoring)/'+id+'/(?:applications|apply)$','i').test(url.pathname))return url.pathname
 if(url.pathname.startsWith('/chat/'))return !url.search&&new RegExp('^/chat/(league-team/'+id+'|rooms/(league_match|meetup|activity_room|study_room|mentoring)/'+id+')$','i').test(url.pathname)?url.pathname:null
 if(!new RegExp('^/meetups/(league|study|department/mentoring|rooms/'+id+'|'+id+'(?:/(?:applications|apply))?)$','i').test(url.pathname))return null
 for(const [key,val] of url.searchParams){
  if(url.searchParams.getAll(key).length!==1)return null
  if(['challenge','team','room','session','party','application','invite'].includes(key)){if(!notificationUuid.test(val))return null}
  else if(key==='sport'){if(!['lol','futsal','football'].includes(val))return null}
  else if(key==='panel'){if(!['applications','invitations'].includes(val))return null}
  else if(key==='slot'){if(!/^[a-z0-9_-]{1,40}$/.test(val))return null}
  else return null
 }
 return url.pathname+url.search
}
export function mentoringTargetMatches(snapshot:{session_id?:string|null;party_id?:string|null;invitations?:{party_id:string}[]},target:{session?:string|null;party?:string|null}):boolean {
 if(target.session&&(!notificationUuid.test(target.session)||snapshot.session_id!==target.session))return false
 if(target.party&&(!notificationUuid.test(target.party)||(snapshot.party_id!==target.party&&!snapshot.invitations?.some(i=>i.party_id===target.party))))return false
 return true
}
/** A valid invitation to X is not permission to display unrelated current session Y. */
export function mentoringInvitationOnly(snapshot:{party_id?:string|null;invitations?:{party_id:string}[]}|null,party:string|null):boolean {
 return Boolean(party&&snapshot&&snapshot.party_id!==party&&snapshot.invitations?.some(i=>i.party_id===party))
}
export function notificationEmptyState(filter:'all'|'unread',unread:number|null,hasMore:boolean){
 if(filter==='all')return 'empty'
 if(unread===null)return 'unknown'
 if(unread>0)return hasMore?'older_unread':'refresh_unread'
 return 'all_read'
}

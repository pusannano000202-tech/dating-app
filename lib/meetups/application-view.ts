export type ApplicationStateView = {
  id:string; admission:'pending'|'accepted'|'declined'|'cancelled'; payment:'held'|'refund_due'|'refunded';
  amountKrw:number; revision:number; chatHref:string|null
}
export type ApplicantView = Omit<ApplicationStateView,'chatHref'|'amountKrw'> & {alias:string;intro:string;strength:string;createdAt:string;metadata?:{role?:'mentor'|'mentee'}}
export type NativeApplicationKind = 'study'|'mentoring'
export function applicationBasePath(id:string,kind?:NativeApplicationKind):string {
 return kind?`/api/meetups/participation/${kind}/${encodeURIComponent(id)}`:`/api/meetups/${encodeURIComponent(id)}`
}
export function applicationPagePath(id:string,kind?:NativeApplicationKind):string {
 return kind?`/meetups/participation/${kind}/${encodeURIComponent(id)}`:`/meetups/${encodeURIComponent(id)}`
}
export function applicationChatPath(id:string,kind?:NativeApplicationKind):string {
 return `/chat/rooms/${kind==='study'?'study_room':kind==='mentoring'?'mentoring':'meetup'}/${encodeURIComponent(id)}`
}
export type ApplicationNoticeView = {id:string;kind:'application_received'|'application_accepted'|'application_closed';text:string;createdAt:string}
export type ApplicationManagementView = {
  accountKey:string; room:{id:string;title:string;memberCount:number;capacity:number};isHost:boolean;pendingCount:number;
  applications:ApplicantView[];notices:ApplicationNoticeView[];hasMore:boolean;nextCursor:string|null
}
export function latestApplicationNotices(notices:ApplicationNoticeView[]):ApplicationNoticeView[]{
 return [...notices].sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt)||a.id.localeCompare(b.id)).slice(-3)
}
export function canRestartApplication(application:ApplicationStateView|null,choice:{owner:string;applicationId:string}|null,owner:string|null|undefined):boolean{
 return !!application&&!!choice&&choice.owner===owner&&choice.applicationId===application.id&&['declined','cancelled'].includes(application.admission)
}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
const integer=(v:unknown):v is number=>Number.isSafeInteger(v)&&Number(v)>=0
const text=(v:unknown,max:number):v is string=>typeof v==='string'&&Array.from(v).length<=max
const time=(v:unknown):v is string=>typeof v==='string'&&Number.isFinite(Date.parse(v))
function validState(v:unknown,money=true):v is ApplicationStateView {
 return record(v)&&uuid(v.id)&&['pending','accepted','declined','cancelled'].includes(String(v.admission))
  &&['held','refund_due','refunded'].includes(String(v.payment))&&(!money||(integer(v.amountKrw)&&v.amountKrw>0))&&integer(v.revision)
}
export function parseApplicationStatusView(value:unknown,owner:string,roomId:string,kind?:NativeApplicationKind):{accountKey:string;application:ApplicationStateView|null}|null {
 if(!record(value)||!uuid(owner)||!uuid(roomId)||value.accountKey!==owner)return null
 if(value.application===null)return {accountKey:owner,application:null}
 const a=value.application
 if(!validState(a)||(a.chatHref!==null&&(a.admission!=='accepted'||a.chatHref!==applicationChatPath(roomId,kind))))return null
 return {accountKey:owner,application:a}
}
export function parseApplicationManagementView(value:unknown,owner:string,roomId:string,kind?:NativeApplicationKind):ApplicationManagementView|null {
 if(!record(value)||value.accountKey!==owner||!uuid(owner)||!record(value.room)||value.room.id!==roomId||!uuid(roomId)
  ||!text(value.room.title,160)||!integer(value.room.memberCount)||!integer(value.room.capacity)||value.room.capacity<1||value.room.memberCount>value.room.capacity
  ||typeof value.isHost!=='boolean'||!integer(value.pendingCount)||!Array.isArray(value.applications)||value.applications.length>100
  ||!Array.isArray(value.notices)||value.notices.length>100||typeof value.hasMore!=='boolean')return null
 if(!value.isHost&&value.applications.length)return null
 if(!value.applications.every(a=>record(a)&&text(a.alias,100)&&text(a.intro,80)&&text(a.strength,120)&&time(a.createdAt)&&validState(a,false)))return null
 if(kind==='mentoring'&&!value.applications.every(a=>record(a.metadata)&&Object.keys(a.metadata).length===1&&['mentor','mentee'].includes(String(a.metadata.role))))return null
 if(kind==='study'&&!value.applications.every(a=>record(a.metadata)&&Object.keys(a.metadata).length===0))return null
 if(!value.notices.every(n=>record(n)&&uuid(n.id)&&['application_received','application_accepted','application_closed'].includes(String(n.kind))&&text(n.text,300)&&time(n.createdAt)))return null
 if(value.hasMore?(!uuid(value.nextCursor)||!value.applications.length):value.nextCursor!==null)return null
 return value as unknown as ApplicationManagementView
}

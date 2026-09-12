/** Hosted rooms keep the existing mentoring chat ledger, but never auto-compose parties. */
export type HostedMentoringRole = 'mentor' | 'mentee'
export type HostedMentoringTopic = 'courses' | 'career' | 'campus'
export type HostedMentoringRoom = {
  id: string; title: string; topic: HostedMentoringTopic; side_size: 2 | 3;
  mentor_count: number; mentee_count: number; member_count: number;
  status: 'open' | 'full' | 'closed'; joined: boolean; is_host: boolean;
  revision: number; expires_at: string; department_label: string;
  /** Own unresolved membership only; not permission to read chat or the roster. */
  participation_restricted?: boolean;
}
export type HostedMentoringRoomDetail = HostedMentoringRoom & {
  my_role: HostedMentoringRole | null;
  members: Array<{id:string;role:HostedMentoringRole;label:string;mine:boolean;is_host:boolean}>;
  messages: Array<{id:string;mine:boolean;alias:string;text:string;created_at:string}>;
  meeting: {starts_at:string;place:string;revision:number} | null;
  report_targets: Array<{id:string;label:string}>;
}
export type HostedMentoringList = {owner_id:string;rooms:HostedMentoringRoom[]}
export type HostedMentoringDetail = {owner_id:string;room:HostedMentoringRoomDetail}
export type HostedMentoringCommand = {action:'create'|'message'|'plan'|'leave'|'report';args:Record<string,unknown>}
const object=(v:unknown):v is Record<string,unknown>=>Boolean(v&&typeof v==='object'&&!Array.isArray(v))
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k))
export const isHostedMentoringId=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
const text=(v:unknown,n:number):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=n
const stamp=(v:unknown):v is string=>typeof v==='string'&&v.length<=40&&Number.isFinite(Date.parse(v))
const int=(v:unknown,n=1000000):v is number=>Number.isSafeInteger(v)&&Number(v)>=0&&Number(v)<=n
const role=(v:unknown):v is HostedMentoringRole=>v==='mentor'||v==='mentee'
const topic=(v:unknown):v is HostedMentoringTopic=>['courses','career','campus'].includes(String(v))
const roomKeys=['id','title','topic','side_size','mentor_count','mentee_count','member_count','status','joined','is_host','revision','expires_at','department_label']
const exactRoom=(v:Record<string,unknown>,extra:string[]=[])=>exact(v,[...roomKeys,...extra,...(Object.hasOwn(v,'participation_restricted')?['participation_restricted']:[])])
export function parseHostedMentoringCommand(value:unknown):HostedMentoringCommand|null {
  if(!object(value)||!exact(value,['action','args'])||!object(value.args))return null
  const {action,args}=value
  const fields:Record<string,string[]>={create:['title','topic','role','side_size','client_id'],message:['session_id','text','client_id'],plan:['session_id','starts_at','place','revision'],leave:['session_id'],report:['session_id','member_id','reason']}
  if(typeof action!=='string'||!Object.hasOwn(fields,action)||!exact(args,fields[action]))return null
  if(action==='create') {
    if(!text(args.title,60)||!topic(args.topic)||!role(args.role)||![2,3].includes(Number(args.side_size))||typeof args.side_size!=='number'||!isHostedMentoringId(args.client_id))return null
  }else if(!isHostedMentoringId(args.session_id))return null
  if(action==='message'&&(!text(args.text,1000)||!isHostedMentoringId(args.client_id)))return null
  if(action==='plan'&&(!stamp(args.starts_at)||!text(args.place,160)||!int(args.revision)))return null
  if(action==='report'&&(!isHostedMentoringId(args.member_id)||!text(args.reason,2000)))return null
  return {action:action as HostedMentoringCommand['action'],args}
}
function validRoom(v:Record<string,unknown>) {
  return isHostedMentoringId(v.id)&&text(v.title,60)&&topic(v.topic)&&(v.side_size===2||v.side_size===3)
    &&int(v.mentor_count,Number(v.side_size))&&int(v.mentee_count,Number(v.side_size))&&v.member_count===Number(v.mentor_count)+Number(v.mentee_count)
    &&['open','full','closed'].includes(String(v.status))&&(v.status!=='full'||v.member_count===Number(v.side_size)*2)
    &&(v.status!=='open'||Number(v.member_count)<Number(v.side_size)*2)&&typeof v.joined==='boolean'&&typeof v.is_host==='boolean'
    &&int(v.revision)&&stamp(v.expires_at)&&text(v.department_label,120)
    &&(!Object.hasOwn(v,'participation_restricted')||typeof v.participation_restricted==='boolean')
    &&(v.participation_restricted!==true||(v.joined===false&&v.is_host===false&&v.status==='closed'&&v.member_count===0&&v.mentor_count===0&&v.mentee_count===0&&v.revision===0))
}
export function parseHostedMentoringList(value:unknown):HostedMentoringList|null {
  if(!object(value)||!exact(value,['owner_id','rooms'])||!isHostedMentoringId(value.owner_id)||!Array.isArray(value.rooms)||value.rooms.length>100)return null
  if(value.rooms.some(v=>!object(v)||!exactRoom(v)||!validRoom(v))||new Set(value.rooms.map(v=>v.id)).size!==value.rooms.length)return null
  return value as HostedMentoringList
}
export function parseHostedMentoringDetail(value:unknown):HostedMentoringDetail|null {
  if(!object(value)||!exact(value,['owner_id','room'])||!isHostedMentoringId(value.owner_id)||!object(value.room))return null
  const r=value.room
  if(!exactRoom(r,['my_role','members','messages','meeting','report_targets'])||!validRoom(r)||(r.my_role!==null&&!role(r.my_role))||(r.participation_restricted===true&&!role(r.my_role)))return null
  if(!Array.isArray(r.members)||r.members.length>6||r.members.some(m=>!object(m)||!exact(m,['id','role','label','mine','is_host'])||!isHostedMentoringId(m.id)||!role(m.role)||!text(m.label,160)||typeof m.mine!=='boolean'||typeof m.is_host!=='boolean'))return null
  if(!Array.isArray(r.messages)||r.messages.length>100||r.messages.some(m=>!object(m)||!exact(m,['id','mine','alias','text','created_at'])||!isHostedMentoringId(m.id)||typeof m.mine!=='boolean'||!text(m.alias,160)||!text(m.text,1000)||!stamp(m.created_at)))return null
  if(!Array.isArray(r.report_targets)||r.report_targets.length>50||r.report_targets.some(m=>!object(m)||!exact(m,['id','label'])||!isHostedMentoringId(m.id)||!text(m.label,160)))return null
  if(r.meeting!==null&&(!object(r.meeting)||!exact(r.meeting,['starts_at','place','revision'])||!stamp(r.meeting.starts_at)||!text(r.meeting.place,160)||!int(r.meeting.revision)||r.meeting.revision<1))return null
  if(!r.joined&&(r.members.length||r.messages.length||r.meeting!==null))return null
  if(new Set(r.members.map(m=>m.id)).size!==r.members.length||new Set(r.messages.map(m=>m.id)).size!==r.messages.length||new Set(r.report_targets.map(m=>m.id)).size!==r.report_targets.length)return null
  if(r.joined&&(r.members.length!==r.member_count||r.members.filter(m=>m.mine).length!==1||!role(r.my_role)
    ||r.members.find(m=>m.mine)?.role!==r.my_role||r.members.filter(m=>m.role==='mentor').length!==r.mentor_count
    ||r.members.filter(m=>m.role==='mentee').length!==r.mentee_count||r.members.filter(m=>m.is_host).length!==1))return null
  return value as HostedMentoringDetail
}
export function hostedMentoringError(error:{message?:string;code?:string}) {
  const message=error.message??''
  if(/not_authenticated/.test(message))return {error:'auth_required',status:401}
  if(/profile_required|department_identity_required/.test(message))return {error:'profile_required',status:409}
  if(/forbidden|account_deletion/.test(message)||error.code==='42501')return {error:'forbidden',status:403}
  if(/rate_limited/.test(message))return {error:'rate_limited',status:429}
  for(const code of ['full','closed','already_active','conflict','approval_required','not_found'])if(message.includes(`mentoring_${code}`))return {error:code,status:409}
  if(/invalid/.test(message)||['22P02','22007','22008','22003'].includes(error.code??''))return {error:'invalid',status:400}
  return {error:'unavailable',status:503}
}

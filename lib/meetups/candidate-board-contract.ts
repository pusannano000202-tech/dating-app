/** Public candidacy is consent to discovery, never membership or payment confirmation. */
export type CandidateScope={kind:'league'|'study'|'mentoring'|'meetup';key:string}
export type CandidateBoardAction='overview'|'register'|'cancel'|'invite'|'accept'|'decline'|'release'
export type CandidateRow={id:string;alias:string;positions:string[];tier:string|null;intro:string;availability:string;status:'waiting'|'joining'|'joined'|'cancelled'|'unavailable';revision:number;is_me:boolean;joining_until:string|null;next_href:string|null}
export type CandidateInvite={id:string;candidate_id:string;candidate_alias:string;room_id:string;room_title:string;slot:string|null;status:'pending'|'joining'|'joined'|'declined'|'cancelled'|'unavailable';revision:number;is_sender:boolean;joining_until:string|null;next_href:string|null;checkout_enabled:false}
export type HostRoom={id:string;title:string;capacity:number;member_count:number;revision:number;slots:string[]}
export type CandidateBoard={owner_id:string;scope:CandidateScope;department_label:string;total_count:number;filtered_count:number;candidates:CandidateRow[];next_cursor:string|null;mine:CandidateRow|null;incoming:CandidateInvite[];outgoing:CandidateInvite[];host_rooms:HostRoom[];result:null|{status:'updated'|'joining'|'preparation_required';next_href:string|null;checkout_enabled:false}}
const UUID='[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const uuid=(v:unknown):v is string=>typeof v==='string'&&new RegExp(`^${UUID}$`,'i').test(v)
const rec=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const exact=(v:Record<string,unknown>,keys:readonly string[])=>Object.keys(v).length===keys.length&&keys.every(k=>k in v)
const text=(v:unknown,max:number,min=0):v is string=>typeof v==='string'&&v===v.trim()&&v.length>=min&&v.length<=max&&!/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/.test(v)
const integer=(v:unknown,min=0,max=2147483647):v is number=>Number.isInteger(v)&&Number(v)>=min&&Number(v)<=max
const nullableDate=(v:unknown)=>v===null||typeof v==='string'&&v.length<=40&&Number.isFinite(Date.parse(v))
export function parseCandidateScope(value:unknown):CandidateScope|null{
 if(!rec(value)||!exact(value,['kind','key'])||!['league','study','mentoring','meetup'].includes(String(value.kind))||!text(value.key,100,1)||!/^[A-Za-z0-9:_-]+$/.test(value.key))return null
 if(value.kind==='league'&&!['lol','futsal','football'].includes(value.key)||value.kind==='mentoring'&&!['courses','career','campus'].includes(value.key))return null
 return{kind:value.kind as CandidateScope['kind'],key:value.key}
}
export function candidatePositions(scope:CandidateScope):string[]{return scope.kind==='league'?scope.key==='lol'?['top','jungle','mid','adc','support']:['goalkeeper','defender','midfielder','forward']:scope.kind==='mentoring'?['mentor','mentee']:[]}
function positions(v:unknown,s:CandidateScope):v is string[]{return Array.isArray(v)&&v.length<=5&&v.every(p=>typeof p==='string'&&candidatePositions(s).includes(p))&&new Set(v).size===v.length&&(candidatePositions(s).length===0?v.length===0:v.length>0)}
function tier(v:unknown,s:CandidateScope){return s.kind!=='league'?v===null:(s.key==='lol'?['iron','bronze','silver','gold','platinum','emerald','diamond','master','grandmaster','challenger']:['beginner','intermediate','advanced']).includes(String(v))}
function slot(v:unknown,s:CandidateScope){return s.kind==='league'?typeof v==='string'&&(s.key==='lol'?['top','jungle','mid','adc','support']:s.key==='futsal'?['gk','ld','rd','lm','rm','st']:['gk','lb','lcb','rcb','rb','lcm','cm','rcm','lw','st','rw']).includes(v):s.kind==='mentoring'?v==='mentor'||v==='mentee':v===null}
export function parseCandidateBoardArgs(action:unknown,value:unknown):Record<string,unknown>|null{
 if(!rec(value))return null
 const s=parseCandidateScope({kind:value.scope_kind,key:value.scope_key});if(!s)return null
 const keys:Record<string,string[]>={overview:['filter','cursor'],register:['positions','tier','intro','availability','consent','expected_revision','idempotency_key'],cancel:['expected_revision','idempotency_key'],invite:['candidate_id','candidate_revision','room_id','room_revision','slot','idempotency_key'],accept:['invite_id','expected_revision','idempotency_key'],decline:['invite_id','expected_revision','idempotency_key'],release:['invite_id','expected_revision','idempotency_key']}
 const k=keys[String(action)];if(!k||!exact(value,['scope_kind','scope_key',...k]))return null
 if(action==='overview')return(value.filter==='all'||candidatePositions(s).includes(String(value.filter)))&&(value.cursor===null||uuid(value.cursor))?{...value}:null
 if(!uuid(value.idempotency_key))return null
 if(action==='register')return positions(value.positions,s)&&tier(value.tier,s)&&text(value.intro,200)&&text(value.availability,100,1)&&value.consent===true&&(value.expected_revision===null||integer(value.expected_revision))?{...value}:null
 if(action==='invite')return uuid(value.candidate_id)&&integer(value.candidate_revision)&&uuid(value.room_id)&&integer(value.room_revision)&&slot(value.slot,s)?{...value}:null
 if(!integer(value.expected_revision))return null
 return action==='cancel'||uuid(value.invite_id)?{...value}:null
}
function nextHref(v:unknown,s:CandidateScope,id?:string):v is string|null{
 if(v===null)return true;if(typeof v!=='string')return false
 const rid=id??UUID
 const pattern=s.kind==='study'?`(?:/meetups/participation/study/${rid}/apply|/chat/rooms/study_room/${rid})`:s.kind==='mentoring'?`(?:/meetups/participation/mentoring/${rid}/apply\\?role=(?:mentor|mentee)|/chat/rooms/mentoring/${rid})`:s.kind==='league'?`/chat/league-team/${rid}`:`(?:/meetups/${rid}/apply|/chat/rooms/meetup/${rid})`
 return new RegExp(`^${pattern}$`,'i').test(v)
}
const rowKeys=['id','alias','positions','tier','intro','availability','status','revision','is_me','joining_until','next_href']
function row(v:unknown,s:CandidateScope):v is CandidateRow{return rec(v)&&exact(v,rowKeys)&&uuid(v.id)&&text(v.alias,100,1)&&positions(v.positions,s)&&tier(v.tier,s)&&text(v.intro,200)&&text(v.availability,100)&&['waiting','joining','joined','cancelled','unavailable'].includes(String(v.status))&&integer(v.revision)&&typeof v.is_me==='boolean'&&nullableDate(v.joining_until)&&nextHref(v.next_href,s)}
function invite(v:unknown,s:CandidateScope):v is CandidateInvite{return rec(v)&&exact(v,['id','candidate_id','candidate_alias','room_id','room_title','slot','status','revision','is_sender','joining_until','next_href','checkout_enabled'])&&uuid(v.id)&&uuid(v.candidate_id)&&text(v.candidate_alias,100,1)&&uuid(v.room_id)&&text(v.room_title,120,1)&&slot(v.slot,s)&&['pending','joining','joined','declined','cancelled','unavailable'].includes(String(v.status))&&integer(v.revision)&&typeof v.is_sender==='boolean'&&nullableDate(v.joining_until)&&nextHref(v.next_href,s,v.room_id)&&v.checkout_enabled===false}
function host(v:unknown,s:CandidateScope):v is HostRoom{return rec(v)&&exact(v,['id','title','capacity','member_count','revision','slots'])&&uuid(v.id)&&text(v.title,120,1)&&integer(v.capacity,1,100)&&integer(v.member_count,0,Number(v.capacity))&&integer(v.revision)&&Array.isArray(v.slots)&&v.slots.length<=11&&v.slots.every(x=>slot(x,s))&&new Set(v.slots).size===v.slots.length}
export function parseCandidateBoard(value:unknown):CandidateBoard|null{
 if(!rec(value)||!exact(value,['owner_id','scope','department_label','total_count','filtered_count','candidates','next_cursor','mine','incoming','outgoing','host_rooms','result']))return null
 const s=parseCandidateScope(value.scope)
 if(!s||!uuid(value.owner_id)||!text(value.department_label,120,1)||!integer(value.total_count)||!integer(value.filtered_count,0,value.total_count)||!(value.next_cursor===null||uuid(value.next_cursor)))return null
 if(!Array.isArray(value.candidates)||value.candidates.length>20||value.candidates.length>value.filtered_count||!value.candidates.every(v=>row(v,s)&&v.status==='waiting')||new Set(value.candidates.map(v=>v.id)).size!==value.candidates.length)return null
 if(value.mine!==null&&(!row(value.mine,s)||!value.mine.is_me))return null
 for(const field of ['incoming','outgoing']as const){const v=value[field];if(!Array.isArray(v)||v.length>100||!v.every(x=>invite(x,s)&&x.is_sender===(field==='outgoing'))||new Set(v.map(x=>x.id)).size!==v.length)return null}
 if(!Array.isArray(value.host_rooms)||value.host_rooms.length>100||!value.host_rooms.every(v=>host(v,s)))return null
 const r=value.result;if(r!==null&&(!rec(r)||!exact(r,['status','next_href','checkout_enabled'])||!['updated','joining','preparation_required'].includes(String(r.status))||!nextHref(r.next_href,s)||r.checkout_enabled!==false))return null
 return value as CandidateBoard
}

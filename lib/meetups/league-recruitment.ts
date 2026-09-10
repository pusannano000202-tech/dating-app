import {LEAGUE_SPORTS,isLeagueSport,parseJourneyState,type JourneyChallenge,type LeagueSport} from './challenge-journey'

export type LeagueRecruitmentNoticeStatus='open'|'filled'|'expired'|'closed'|'matched'
export type LeagueRecruitmentNotice={id:string;team_id:string;challenge_id:string;team_name:string;department:string;sport:LeagueSport;capacity:number;accepted_count:number;empty_slots:string[];reserved_slots:string[];preferred_at:string;summary:string;status:LeagueRecruitmentNoticeStatus;expires_at:string;created_at:string;updated_at:string;revision:number;is_captain:boolean;href:string}
export type LeagueRecruitmentTeam={team_id:string;challenge_id:string;team_name:string;title:string;department:string;sport:LeagueSport;status:JourneyChallenge['status'];revision:number;capacity:number;accepted_count:number;empty_slots:string[];reserved_slots:string[];is_captain:boolean;my_status:'none'|'requested'|'accepted';may_join:boolean;notice:LeagueRecruitmentNotice|null}
export type LeagueRecruitmentBrowse={sport:LeagueSport;my_department:string;total_count:number;next_cursor:string|null;teams:LeagueRecruitmentTeam[]}
export type LeagueRecruitmentNotices={sport:LeagueSport;my_department:string;total_count:number;next_cursor:string|null;notices:LeagueRecruitmentNotice[]}
export type LeagueRecruitmentDetail={sport:LeagueSport;my_department:string;team_id:string;challenge:JourneyChallenge;empty_slots:string[];reserved_slots:string[];notice:LeagueRecruitmentNotice|null}
export type LeagueRecruitmentResult={team_id:string;challenge_id:string;revision:number;notice:LeagueRecruitmentNotice|null;replayed:boolean}

const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
const text=(v:unknown,max=160,min=1):v is string=>typeof v==='string'&&Array.from(v.trim()).length>=min&&Array.from(v).length<=max&&!/[\u0000-\u001f\u007f\u200b\u202e\u2060\ufeff]/.test(v)
const integer=(v:unknown,max=2147483647):v is number=>Number.isSafeInteger(v)&&(v as number)>=0&&(v as number)<=max
const stamp=(v:unknown):v is string=>typeof v==='string'&&Number.isFinite(Date.parse(v))
const nullableId=(v:unknown)=>v===null||uuid(v)
function slots(sport:LeagueSport,empty:unknown,reserved:unknown){
 if(!Array.isArray(empty)||!Array.isArray(reserved))return false
 const all=[...empty,...reserved]
 return all.length<=LEAGUE_SPORTS[sport].capacity&&new Set(all).size===all.length&&all.every(key=>LEAGUE_SPORTS[sport].slots.some(s=>s.key===key))
}
export function leagueRecruitmentHref(sport:unknown,challenge:unknown):string|null{
 return isLeagueSport(sport)&&uuid(challenge)?`/meetups/league?sport=${sport}&challenge=${challenge}`:null
}
function notice(value:unknown,sport:LeagueSport):value is LeagueRecruitmentNotice{
 return object(value)&&uuid(value.id)&&uuid(value.team_id)&&uuid(value.challenge_id)&&text(value.team_name,80,2)&&text(value.department,120)&&value.sport===sport&&value.capacity===LEAGUE_SPORTS[sport].capacity&&integer(value.accepted_count,value.capacity as number)&&slots(sport,value.empty_slots,value.reserved_slots)&&['open','filled','expired','closed','matched'].includes(String(value.status))&&[value.preferred_at,value.expires_at,value.created_at,value.updated_at].every(stamp)&&text(value.summary)&&integer(value.revision)&&typeof value.is_captain==='boolean'&&value.href===leagueRecruitmentHref(sport,value.challenge_id)
}
function page(value:unknown):value is Record<string,unknown>&{sport:LeagueSport;my_department:string}{
 return object(value)&&isLeagueSport(value.sport)&&text(value.my_department,120)&&integer(value.total_count)&&nullableId(value.next_cursor)
}
export function parseLeagueRecruitmentBrowse(value:unknown):LeagueRecruitmentBrowse|null{
 if(!page(value)||!Array.isArray(value.teams)||value.teams.length>20)return null
 const sport=value.sport
 for(const team of value.teams){
  if(!object(team)||!uuid(team.team_id)||!uuid(team.challenge_id)||!text(team.team_name,80,2)||!text(team.title,80,2)||!text(team.department,120)||team.sport!==sport||team.status!=='recruiting'||!integer(team.revision)||team.capacity!==LEAGUE_SPORTS[sport].capacity||!integer(team.accepted_count,team.capacity as number)||!slots(sport,team.empty_slots,team.reserved_slots)||typeof team.is_captain!=='boolean'||typeof team.may_join!=='boolean'||!['none','requested','accepted'].includes(String(team.my_status))||!(team.notice===null||notice(team.notice,sport)))return null
  if(team.may_join&&(team.my_status!=='none'||!Array.isArray(team.empty_slots)||team.empty_slots.length===0))return null
 }
 return value as LeagueRecruitmentBrowse
}
export function parseLeagueRecruitmentNotices(value:unknown):LeagueRecruitmentNotices|null{
 return page(value)&&Array.isArray(value.notices)&&value.notices.length<=20&&value.notices.every(n=>notice(n,value.sport))?value as LeagueRecruitmentNotices:null
}
export function parseLeagueRecruitmentDetail(value:unknown):LeagueRecruitmentDetail|null{
 if(!object(value)||!isLeagueSport(value.sport)||!text(value.my_department,120)||!uuid(value.team_id)||!slots(value.sport,value.empty_slots,value.reserved_slots)||!(value.notice===null||notice(value.notice,value.sport)))return null
 const state=parseJourneyState({sport:value.sport,my_department:value.my_department,month:'2000-01',standings:[],monthly_standings:[],challenges:[value.challenge]})
 if(!state||!state.challenges[0].teams.some(team=>team.id===value.team_id))return null
 return value as LeagueRecruitmentDetail
}
export function parseLeagueRecruitmentResult(value:unknown,sport:unknown):LeagueRecruitmentResult|null{
 if(!isLeagueSport(sport)||!object(value)||!uuid(value.team_id)||!uuid(value.challenge_id)||!integer(value.revision)||typeof value.replayed!=='boolean'||!(value.notice===null||notice(value.notice,sport)))return null
 if(object(value.notice)&&(value.notice.team_id!==value.team_id||value.notice.challenge_id!==value.challenge_id||value.notice.revision!==value.revision))return null
 return value as LeagueRecruitmentResult
}
export function validateLeagueRecruitmentCommand(action:unknown,args:unknown):Record<string,unknown>{
 const shapes:Record<string,string[]>={browse:['sport','cursor'],notices:['sport','cursor'],detail:['sport','challenge_id'],publish:['sport','team_id','preferred_at','summary','expected_revision','idempotency_key'],close:['sport','team_id','expected_revision','idempotency_key'],reject:['sport','team_id','roster_id','expected_revision','idempotency_key']}
 if(typeof action!=='string'||!Object.hasOwn(shapes,action)||!object(args)||Object.keys(args).length!==shapes[action].length||Object.keys(args).some(key=>!shapes[action].includes(key)))throw new Error('invalid_recruitment_action')
 if(!isLeagueSport(args.sport))throw new Error('invalid_sport')
 for(const[key,value]of Object.entries(args)){
  if((key.endsWith('_id')||key==='idempotency_key')&&!uuid(value))throw new Error('invalid_identifier')
  if(key==='cursor'&&!nullableId(value))throw new Error('invalid_cursor')
  if(key==='expected_revision'&&!integer(value))throw new Error('invalid_revision')
  if(key==='preferred_at'&&!stamp(value))throw new Error('invalid_preferred_at')
  if(key==='summary'&&!text(value))throw new Error('invalid_summary')
 }
 return args
}

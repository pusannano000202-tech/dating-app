export type LeagueSport = 'lol' | 'futsal' | 'football'
export type LeagueSlot = {key:string;position:string;label:string;x:number;y:number}
export type LeagueSportDefinition = {label:string;category:'gaming'|'soccer';capacity:number;image:string;photo:string;slots:readonly LeagueSlot[]}
const slot=(key:string,position:string,label:string,x:number,y:number):LeagueSlot=>({key,position,label,x,y})
export const LEAGUE_SPORTS:Record<LeagueSport,LeagueSportDefinition>={
 lol:{label:'LoL 5 vs 5',category:'gaming',capacity:5,image:'/social-scenes/league-lol-map.png',photo:'/social-scenes/department-clubhouse-gaming.webp',slots:[slot('top','top','TOP',22,22),slot('jungle','jungle','JUNGLE',29,48),slot('mid','mid','MID',53,45),slot('adc','adc','BOTTOM',73,81),slot('support','support','SUPPORT',84,62)]},
 futsal:{label:'풋살 6 vs 6',category:'soccer',capacity:6,image:'/social-scenes/league-football-pitch.png',photo:'/social-scenes/home-playmaker-football.webp',slots:[slot('gk','goalkeeper','GK',50,85),slot('ld','defender','LD',27,65),slot('rd','defender','RD',73,65),slot('lm','midfielder','LM',26,40),slot('rm','midfielder','RM',74,40),slot('st','forward','ST',50,18)]},
 football:{label:'축구 11 vs 11',category:'soccer',capacity:11,image:'/social-scenes/league-football-pitch.png',photo:'/social-scenes/home-playmaker-football.webp',slots:[slot('gk','goalkeeper','GK',50,87),slot('lb','defender','LB',15,68),slot('lcb','defender','LCB',38,68),slot('rcb','defender','RCB',62,68),slot('rb','defender','RB',85,68),slot('lcm','midfielder','LCM',25,43),slot('cm','midfielder','CM',50,43),slot('rcm','midfielder','RCM',75,43),slot('lw','forward','LW',21,19),slot('st','forward','ST',50,19),slot('rw','forward','RW',79,19)]},
}
export const LEAGUE_INITIAL_POINTS=1000
// Local proposal only: the user approved the 1000 initial score, not this delta.
// Confirm this formula before deployment. A persisted rating always wins.
export const PROPOSED_LEAGUE_WIN_POINTS=30
export const PROPOSED_LEAGUE_LOSS_POINTS=-30
export const LEAGUE_POINTS_POLICY='proposal_pending_product_approval' as const
export type ConfirmedLeagueRecord={department:string;played:number;wins:number;losses:number;draws:number;rating?:number}
export type LeagueTableRow=ConfirmedLeagueRecord&{points:number;rank:number|null;is_me:boolean}
export function buildLeagueRows(registry:readonly string[],records:readonly ConfirmedLeagueRecord[],myDepartment:string,monthly:boolean):LeagueTableRow[]{
 const byDepartment=new Map(records.map(row=>[row.department,row]))
 const rows=Array.from(new Set([...registry,...records.map(row=>row.department),...(myDepartment?[myDepartment]:[])])).map(department=>{
  const record=byDepartment.get(department)??{department,played:0,wins:0,losses:0,draws:0}
  return {...record,points:record.rating??LEAGUE_INITIAL_POINTS+record.wins*PROPOSED_LEAGUE_WIN_POINTS+record.losses*PROPOSED_LEAGUE_LOSS_POINTS,rank:null as number|null,is_me:department===myDepartment}
 }).filter(row=>!monthly||row.played>0).sort((a,b)=>b.points-a.points||b.wins-a.wins||a.losses-b.losses||a.department.localeCompare(b.department,'ko'))
 let previous:string|null=null,rank=0
 for(const row of rows){if(!row.played)continue;const key=`${row.points}:${row.wins}:${row.losses}`;if(key!==previous)rank++;row.rank=rank;previous=key}
 return rows
}
export function isLeagueSport(value:unknown):value is LeagueSport{return typeof value==='string'&&Object.hasOwn(LEAGUE_SPORTS,value)}
export type LeagueApplicationIntro={aspiration:string;strengths:string}
export type JourneyPlayer={id:string;alias:string;status:'requested'|'accepted';is_me:boolean;slot:string|null;position:string|null;tier:string|null;application_intro?:LeagueApplicationIntro|null}
export type JourneyTeam={id:string;team_name?:string;department:string;is_mine:boolean;is_captain:boolean;may_join:boolean;ready:boolean;waiting:boolean;gap:200|300;score:number|null;players:JourneyPlayer[]}
export const leagueTeamName=(team:{team_name?:string;department:string},legacyTitle?:string)=>team.team_name?.trim()||legacyTitle?.trim()||team.department
export type JourneyScheduleProposal={team_id:string;is_mine:boolean;scheduled_at:string;ends_at:string;place_name:string}
export type JourneyChallenge={id:string;title:string;status:'recruiting'|'opponent_pending'|'scheduled'|'result_pending'|'completed';revision:number;scheduled_at:string|null;ends_at:string|null;place_name:string|null;teams:JourneyTeam[];schedule_proposals:JourneyScheduleProposal[];result:{first_score:number;second_score:number}|null}
export type JourneyState={sport:LeagueSport;my_department:string;month:string;standings:ConfirmedLeagueRecord[];monthly_standings:ConfirmedLeagueRecord[];challenges:JourneyChallenge[]}
/** A completed selected match still owns its result and post-match report flow. */
export function selectJourneyChallenge(state:JourneyState|null,selectedId:string|null,draft:boolean):JourneyChallenge|null{
 if(!state||draft)return null
 if(selectedId)return state.challenges.find(c=>c.id===selectedId)??null
 return state.challenges.find(c=>c.status!=='completed'&&c.teams.some(team=>team.is_mine))
  ??state.challenges.find(c=>c.status==='recruiting'&&c.teams.some(team=>team.department===state.my_department))
  ??state.challenges.find(c=>c.teams.some(team=>team.is_mine))??null
}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
const str=(v:unknown,max=120):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=max
const integer=(v:unknown,min=0,max=Number.MAX_SAFE_INTEGER):v is number=>Number.isSafeInteger(v)&&(v as number)>=min&&(v as number)<=max
const timestamp=(v:unknown)=>v===null||typeof v==='string'&&Number.isFinite(Date.parse(v))
const applicationText=(value:unknown,max:number,multiline=false):value is string=>typeof value==='string'&&Array.from(value).length<=max&&!/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/.test(multiline?value.replace(/\n/g,''):value)
export function isLeagueApplicationIntro(value:unknown):value is LeagueApplicationIntro{
 return object(value)&&Object.keys(value).length===2&&applicationText(value.aspiration,80)&&applicationText(value.strengths,120,true)
}
const tiers={lol:['iron','bronze','silver','gold','platinum','emerald','diamond','master','grandmaster','challenger'],futsal:['beginner','intermediate','advanced'],football:['beginner','intermediate','advanced']}
function validRecord(row:unknown):row is ConfirmedLeagueRecord{return object(row)&&str(row.department)&&[row.played,row.wins,row.losses,row.draws].every(value=>integer(value))&&row.played===(row.wins as number)+(row.losses as number)+(row.draws as number)&&(row.rating===undefined||integer(row.rating,0))}
export function parseJourneyState(value:unknown):JourneyState|null{
 if(!object(value)||!isLeagueSport(value.sport)||!str(value.my_department)||typeof value.month!=='string'||!/^\d{4}-\d{2}$/.test(value.month)||!Array.isArray(value.standings)||value.standings.length>300||!value.standings.every(validRecord)||!Array.isArray(value.monthly_standings)||value.monthly_standings.length>300||!value.monthly_standings.every(row=>validRecord(row)&&row.played>0)||!Array.isArray(value.challenges)||value.challenges.length>50)return null
 const sport=value.sport,definition=LEAGUE_SPORTS[sport]
 for(const challenge of value.challenges){
  if(!object(challenge)||!uuid(challenge.id)||!str(challenge.title,80)||!['recruiting','opponent_pending','scheduled','result_pending','completed'].includes(String(challenge.status))||!integer(challenge.revision)||![challenge.scheduled_at,challenge.ends_at].every(timestamp)||!(challenge.place_name===null||str(challenge.place_name,80))||!Array.isArray(challenge.teams)||challenge.teams.length<1||challenge.teams.length>2)return null
  if(challenge.status==='completed'&&(!object(challenge.result)||!integer(challenge.result.first_score,0,999)||!integer(challenge.result.second_score,0,999)))return null
  if(challenge.status!=='completed'&&challenge.result!==null)return null
  if(!Array.isArray(challenge.schedule_proposals)||challenge.schedule_proposals.length>2||challenge.schedule_proposals.some(p=>!object(p)||!uuid(p.team_id)||typeof p.is_mine!=='boolean'||typeof p.scheduled_at!=='string'||typeof p.ends_at!=='string'||!timestamp(p.scheduled_at)||!timestamp(p.ends_at)||Date.parse(p.ends_at)<=Date.parse(p.scheduled_at)||!str(p.place_name,80)))return null
  if(['scheduled','result_pending','completed'].includes(String(challenge.status))&&(!challenge.scheduled_at||!challenge.ends_at))return null
  for(const team of challenge.teams){
   if(object(team)&&team.team_name!==undefined&&!str(team.team_name,80))return null
   if(!object(team)||!uuid(team.id)||!str(team.department)||![team.is_mine,team.is_captain,team.may_join,team.ready,team.waiting].every(v=>typeof v==='boolean')||![200,300].includes(team.gap as number)||!(team.score===null||integer(team.score,100,1100))||!Array.isArray(team.players)||team.players.length>40)return null
   const occupied=new Set<string>()
   for(const player of team.players){
    if(!object(player)||!uuid(player.id)||!str(player.alias)||!['requested','accepted'].includes(String(player.status))||typeof player.is_me!=='boolean'||!(player.slot===null||definition.slots.some(slot=>slot.key===player.slot))||!(player.tier===null||tiers[sport].includes(String(player.tier)))||!(player.position===null||definition.slots.some(slot=>slot.position===player.position)))return null
    if(player.application_intro!==undefined&&player.application_intro!==null&&(!isLeagueApplicationIntro(player.application_intro)||(!player.is_me&&!team.is_captain)))return null
    if(player.status==='accepted'&&player.slot){if(occupied.has(String(player.slot)))return null;occupied.add(String(player.slot))}
   }
   if(team.players.filter(player=>player.status==='accepted').length>definition.capacity)return null
  }
 }
 return value as JourneyState
}
export function validateJourneyCommand(action:unknown,args:unknown):Record<string,unknown>{
 const shapes:Record<string,string[]>={overview:['sport'],report_targets:['challenge_id'],create:['sport','title','slot','tier','idempotency_key'],join:['sport','challenge_id','team_id','slot','tier','expected_revision','idempotency_key'],profile:['sport','challenge_id','team_id','slot','tier','expected_revision','idempotency_key']}
 if(typeof action!=='string'||!Object.hasOwn(shapes,action)||!object(args))throw new Error('invalid_journey_action')
 const optional=action==='join'?['aspiration','strengths']:[]
 if(shapes[action].some(key=>!Object.hasOwn(args,key))||Object.keys(args).some(key=>!shapes[action].includes(key)&&!optional.includes(key)))throw new Error('invalid_journey_action')
 for(const[key,value]of Object.entries(args)){
  if((key.endsWith('_id')||key==='idempotency_key')&&!uuid(value))throw new Error('invalid_identifier')
  if(key==='expected_revision'&&!integer(value))throw new Error('invalid_revision')
  if(key==='title'&&(!str(value,80)||value.trim().length<2))throw new Error('invalid_title')
  if((key==='aspiration'||key==='strengths')&&!applicationText(value,key==='aspiration'?80:120,key==='strengths'))throw new Error('invalid_application_intro')
 }
 if('sport'in args&&!isLeagueSport(args.sport))throw new Error('invalid_sport')
 if('slot'in args){const sport=args.sport as LeagueSport;if(!LEAGUE_SPORTS[sport].slots.some(slot=>slot.key===args.slot)||!tiers[sport].includes(String(args.tier)))throw new Error('invalid_slot_profile')}
 return args
}
export const sportTiers=(sport:LeagueSport):readonly string[]=>tiers[sport]

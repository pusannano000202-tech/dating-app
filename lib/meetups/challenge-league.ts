export const LOL_TIERS = { iron:100,bronze:200,silver:300,gold:400,platinum:500,emerald:600,diamond:700,master:900,grandmaster:1000,challenger:1100 } as const
export const LOL_POSITIONS = ['top','jungle','mid','adc','support'] as const
export const SOCCER_POSITIONS = ['goalkeeper','defender','midfielder','forward'] as const
export const SOCCER_LEVELS = { beginner:100,intermediate:300,advanced:500 } as const
// Recruitment-only self-assessment compatibility. Never an official LP, MMR,
// authenticated Riot tier, individual skill ranking or inferred performance.
export function teamCompatibility(scores: readonly number[]): number {
  if (!scores.length || scores.length > 20 || scores.some(s => !Number.isSafeInteger(s) || s < 100 || s > 1100)) throw new Error('invalid_skill_scores')
  return Math.round(scores.reduce((sum, s) => sum+s, 0) / scores.length * .7 + Math.max(...scores) * .3)
}
export function isCompatible(first: readonly number[], second: readonly number[], firstGap: number, secondGap: number): boolean {
  if (![200,300].includes(firstGap) || ![200,300].includes(secondGap)) throw new Error('invalid_skill_gap')
  const gap = Math.min(firstGap, secondGap)
  return Math.abs(teamCompatibility(first)-teamCompatibility(second)) <= gap && Math.abs(Math.max(...first)-Math.max(...second)) <= gap
}
export type LeagueCategory = 'gaming' | 'soccer'
export type LeagueStanding = {department:string;played:number;wins:number;losses:number;draws:number;rank:number;is_me:boolean}
export type LeaguePlayer = {roster_id:string;alias:string;position:string|null;tier:string|null;is_me:boolean}
export type LeagueArchivedPoll = {id:string;title:string;status:string;options:{label:string;votes:number}[]}
export type LeagueTeam = {team_id:string;challenge_id:string;department:string;status:string;is_captain:boolean;waiting:boolean;gap:200|300;ready:boolean;players:LeaguePlayer[];prior_polls:LeagueArchivedPoll[]}
export type LeagueReport = {id:string;status:'pending'|'dismissed'|'restricted';created_at:string}
export type LeagueRestriction = {id:string;ends_at:string;reason:string;appeal_status:'none'|'pending'|'reviewed';appeal_response:string|null;revoked:boolean}
export type LeagueState = {category:LeagueCategory;my_department:string;standings:LeagueStanding[];my_teams:LeagueTeam[];reports:LeagueReport[];restrictions:LeagueRestriction[]}
export type LeagueCandidate = {team_id:string;challenge_id:string;department:string;gap:200|300;incoming:boolean;outgoing:boolean}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
const text=(v:unknown,max=120):v is string=>typeof v==='string'&&v.length>0&&v.length<=max
const count=(v:unknown)=>Number.isSafeInteger(v)&&(v as number)>=0
const date=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v))
export function parseLeagueState(v: unknown): LeagueState | null {
  if (!object(v)||!['gaming','soccer'].includes(String(v.category))||!text(v.my_department)||!Array.isArray(v.standings)||v.standings.length>200||!Array.isArray(v.my_teams)||v.my_teams.length>50||!Array.isArray(v.reports)||v.reports.length>50||!Array.isArray(v.restrictions)||v.restrictions.length>50) return null
  if (v.standings.some(s=>!object(s)||!text(s.department)||![s.played,s.wins,s.losses,s.draws,s.rank].every(count)||s.rank===0||s.played!==(s.wins as number)+(s.losses as number)+(s.draws as number)||typeof s.is_me!=='boolean')) return null
  if (v.my_teams.some(t=>!object(t)||!uuid(t.team_id)||!uuid(t.challenge_id)||!text(t.department)||!['recruiting','opponent_pending','scheduled','result_pending'].includes(String(t.status))||typeof t.is_captain!=='boolean'||typeof t.waiting!=='boolean'||typeof t.ready!=='boolean'||![200,300].includes(t.gap as number)||!Array.isArray(t.players)||t.players.length>20||t.players.some(p=>!object(p)||!uuid(p.roster_id)||!text(p.alias)||typeof p.is_me!=='boolean'||!(p.position===null||[...LOL_POSITIONS,...SOCCER_POSITIONS].includes(p.position as never))||!(p.tier===null||Object.keys({...LOL_TIERS,...SOCCER_LEVELS}).includes(p.tier as string))))) return null
  if (v.reports.some(r=>!object(r)||!uuid(r.id)||!['pending','dismissed','restricted'].includes(String(r.status))||!date(r.created_at))) return null
  if(v.my_teams.some(team=>!Array.isArray(team.prior_polls)||team.prior_polls.length>20||team.prior_polls.some((p:unknown)=>!object(p)||!uuid(p.id)||!text(p.title,100)||!['open','closed','cancelled'].includes(String(p.status))||!Array.isArray(p.options)||p.options.length>8||p.options.some((o:unknown)=>!object(o)||!text(o.label,80)||!count(o.votes)))))return null
  if (v.restrictions.some(r=>!object(r)||!uuid(r.id)||!date(r.ends_at)||!text(r.reason,1000)||!(r.appeal_response===null||text(r.appeal_response,1000))||!['none','pending','reviewed'].includes(String(r.appeal_status))||typeof r.revoked!=='boolean')) return null
  return v as LeagueState
}
export function parseLeagueCandidates(v:unknown): LeagueCandidate[] | null {
  if (!Array.isArray(v)||v.length>30||v.some(c=>!object(c)||!uuid(c.team_id)||!uuid(c.challenge_id)||!text(c.department)||![200,300].includes(c.gap as number)||typeof c.incoming!=='boolean'||typeof c.outgoing!=='boolean')) return null
  return v as LeagueCandidate[]
}
export function validateLeagueAction(action:unknown,args:unknown,operator=false):Record<string,unknown>{
  const shapes:Record<string,string[]>=operator ? {list:[],dismiss:['report_id','note'],restrict:['report_id','days','note'],restore:['report_id','note'],appeal_review:['report_id','note']} : {
    overview:['category'],profile:['team_id','position','tier'],queue:['team_id','waiting','gap'],candidates:['team_id'],propose:['team_id','opponent_team_id'],accept:['team_id','opponent_team_id'],report_targets:['challenge_id'],report:['challenge_id','target_player_id','reason'],appeal:['restriction_id','reason'],
  }
  if(typeof action!=='string'||!Object.hasOwn(shapes,action)||!object(args)||Object.keys(args).length!==shapes[action].length||Object.keys(args).some(k=>!shapes[action].includes(k)))throw new Error('invalid_league_action')
  for(const [key,value] of Object.entries(args)) {
    if(key.endsWith('_id')&&!uuid(value))throw new Error('invalid_identifier')
    if(['reason','note'].includes(key)&&(!text(value,1000)||value.trim().length<10))throw new Error('invalid_text')
    if(key==='waiting'&&typeof value!=='boolean')throw new Error('invalid_waiting')
    if(key==='gap'&&![200,300].includes(value as number))throw new Error('invalid_skill_gap')
    if(key==='days'&&![14,21].includes(value as number))throw new Error('invalid_restriction_duration')
    if(key==='category'&&!['gaming','soccer'].includes(String(value)))throw new Error('invalid_category')
    if(key==='position'&&![...LOL_POSITIONS,...SOCCER_POSITIONS].includes(value as never))throw new Error('invalid_position')
    if(key==='tier'&&!Object.hasOwn({...LOL_TIERS,...SOCCER_LEVELS},String(value)))throw new Error('invalid_tier')
  }
  return args
}

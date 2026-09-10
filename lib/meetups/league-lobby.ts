import {LEAGUE_SPORTS,isLeagueSport,type LeagueSport,sportTiers} from './challenge-journey'

export type LeagueLobbyPlayer={roster_id:string;alias:string;slot:string;position:string;tier:string;score:number;is_captain:boolean;is_me:boolean}
export type LeagueLobbyTeam={team_id:string;challenge_id:string;title:string;team_name?:string;department:string;capacity:number;accepted_count:number;score_sum:number;compatibility_score:number;gap:200|300;is_mine:boolean;is_captain:boolean;can_propose:boolean;incoming:boolean;outgoing:boolean;players:LeagueLobbyPlayer[]}
export type LeagueCaptainTransfer={id:string;team_id:string;from_alias:string;to_alias:string;to_roster_id:string;is_recipient:boolean;can_cancel:boolean;expires_at:string}
export type LeagueLobbyState={sport:LeagueSport;total_count:number;teams:LeagueLobbyTeam[];next_cursor:string|null;transfers:LeagueCaptainTransfer[]}
export type LeagueChatMessage={id:string;body:string;alias:string;is_me:boolean;created_at:string}
export type LeagueChatState={challenge_id:string;messages:LeagueChatMessage[];has_more:boolean;next_cursor:string|null;writable:boolean}
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
const str=(value:unknown,max=120):value is string=>typeof value==='string'&&value.trim().length>0&&Array.from(value).length<=max
const integer=(value:unknown,min=0,max=Number.MAX_SAFE_INTEGER):value is number=>Number.isSafeInteger(value)&&(value as number)>=min&&(value as number)<=max
const timestamp=(value:unknown):value is string=>typeof value==='string'&&Number.isFinite(Date.parse(value))
const nullableUuid=(value:unknown)=>value===null||uuid(value)
const flags=(row:Record<string,unknown>,keys:string[])=>keys.every(key=>typeof row[key]==='boolean')

/** Tiers are member declarations; score_sum is their literal sum, never MMR. */
export function parseLeagueLobbyState(value:unknown):LeagueLobbyState|null{
 if(!object(value)||!isLeagueSport(value.sport)||!integer(value.total_count)||!nullableUuid(value.next_cursor)||!Array.isArray(value.teams)||value.teams.length>100||!Array.isArray(value.transfers)||value.transfers.length>50)return null
 const sport=value.sport,definition=LEAGUE_SPORTS[sport]
 for(const team of value.teams){
  if(object(team)&&team.team_name!==undefined&&!str(team.team_name,80))return null
  if(!object(team)||!uuid(team.team_id)||!uuid(team.challenge_id)||!str(team.title,80)||!str(team.department)||team.capacity!==definition.capacity||team.accepted_count!==definition.capacity||![200,300].includes(team.gap as number)||!integer(team.score_sum,100,22000)||!integer(team.compatibility_score,100,1100)||!flags(team,['is_mine','is_captain','can_propose','incoming','outgoing'])||!Array.isArray(team.players)||team.players.length!==team.accepted_count)return null
  for(const player of team.players)if(!object(player)||!uuid(player.roster_id)||!str(player.alias,160)||!definition.slots.some(slot=>slot.key===player.slot&&slot.position===player.position)||!sportTiers(sport).includes(String(player.tier))||!integer(player.score,100,1100)||!flags(player,['is_captain','is_me']))return null
  if(team.players.reduce((sum:number,player:LeagueLobbyPlayer)=>sum+player.score,0)!==team.score_sum||new Set(team.players.map((player:LeagueLobbyPlayer)=>player.slot)).size!==definition.capacity)return null
 }
 for(const transfer of value.transfers)if(!object(transfer)||!uuid(transfer.id)||!uuid(transfer.team_id)||!uuid(transfer.to_roster_id)||!str(transfer.from_alias,160)||!str(transfer.to_alias,160)||!timestamp(transfer.expires_at)||!flags(transfer,['is_recipient','can_cancel']))return null
 return value as LeagueLobbyState
}
export function parseLeagueChatMessage(value:unknown):LeagueChatMessage|null{
 return object(value)&&uuid(value.id)&&str(value.body,2000)&&str(value.alias,160)&&typeof value.is_me==='boolean'&&timestamp(value.created_at)?value as LeagueChatMessage:null
}
export function parseLeagueChatState(value:unknown):LeagueChatState|null{
 if(!object(value)||!uuid(value.challenge_id)||!Array.isArray(value.messages)||value.messages.length>50||!value.messages.every(parseLeagueChatMessage)||!flags(value,['has_more','writable'])||!nullableUuid(value.next_cursor))return null
 return value as LeagueChatState
}
export function validateLeagueLobbyAction(action:unknown,args:unknown):Record<string,unknown>{
 const pair=['team_id','opponent_team_id','idempotency_key']
 const shapes:Record<string,string[]>={overview:['sport','team_id','cursor'],propose:pair,accept:pair,proposal_cancel:pair,proposal_decline:pair,transfer_propose:['team_id','recipient_roster_id','expected_revision','idempotency_key'],transfer_respond:['transfer_id','accept','idempotency_key'],transfer_cancel:['transfer_id','idempotency_key'],chat_read:['challenge_id','before'],chat_send:['challenge_id','body','idempotency_key']}
 if(typeof action!=='string'||!Object.hasOwn(shapes,action)||!object(args)||Object.keys(args).length!==shapes[action].length||Object.keys(args).some(key=>!shapes[action].includes(key)))throw new Error('invalid_lobby_action')
 for(const[key,value]of Object.entries(args)){
  if(key.endsWith('_id')||key==='idempotency_key'){if(!(action==='overview'&&key==='team_id'&&value===null)&&!uuid(value))throw new Error('invalid_identifier')}
  if(['cursor','before'].includes(key)&&!nullableUuid(value))throw new Error('invalid_cursor')
  if(key==='sport'&&!isLeagueSport(value))throw new Error('invalid_sport')
  if(key==='accept'&&typeof value!=='boolean')throw new Error('invalid_consent')
  if(key==='expected_revision'&&!integer(value))throw new Error('invalid_revision')
  if(key==='body'&&(!str(value,2000)||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)))throw new Error('invalid_message')
 }
 return args
}

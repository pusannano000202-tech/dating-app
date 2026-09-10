import {LEAGUE_SPORTS,isLeagueSport,sportTiers,type JourneyPlayer,type LeagueSport} from './challenge-journey'

export type LeagueInviteStatus='pending'|'accepted'|'declined'|'cancelled'|'expired'
export type LeaguePositionInvite={id:string;challenge_id:string;team_id:string;title:string;department:string;sport:LeagueSport;slot:string;inviter_name:string;invitee_name:string;status:LeagueInviteStatus;expires_at:string;revision:number;is_recipient:boolean;can_cancel:boolean}
export type LeagueInvitePreview={challenge_id:string;team_id:string;title:string;department:string;capacity:number;players:JourneyPlayer[]}
export type LeagueInviteState={sport:LeagueSport;challenge_id:string|null;revision:number|null;candidates:{user_id:string;display_name:string}[];incoming:LeaguePositionInvite[];sent:LeaguePositionInvite[];preview:LeagueInvitePreview|null}
export type LeagueInviteResult={id:string;challenge_id:string;team_id:string;slot:string;status:LeagueInviteStatus;revision:number;replayed:boolean}

const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
const text=(v:unknown,max=160):v is string=>typeof v==='string'&&v.trim().length>0&&Array.from(v).length<=max&&!/[\u0000-\u001f\u007f]/.test(v)
const revision=(v:unknown):v is number=>Number.isSafeInteger(v)&&(v as number)>=0&&(v as number)<=2147483647
const status=(v:unknown):v is LeagueInviteStatus=>['pending','accepted','declined','cancelled','expired'].includes(String(v))
const timestamp=(v:unknown):v is string=>typeof v==='string'&&Number.isFinite(Date.parse(v))

/** Reconstruct the internal route from validated fields; never navigate to a supplied URL. */
export function leagueInviteHref(sport:unknown,inviteId:unknown,challengeId:unknown):string|null{
 if(!isLeagueSport(sport)||!uuid(inviteId)||!uuid(challengeId))return null
 return `/meetups/league?sport=${sport}&invite=${inviteId}&challenge=${challengeId}`
}

export function parseLeagueInviteState(value:unknown):LeagueInviteState|null{
 if(!object(value)||!isLeagueSport(value.sport)||!(value.challenge_id===null||uuid(value.challenge_id))||!(value.revision===null||revision(value.revision))||!Array.isArray(value.candidates)||value.candidates.length>100||!Array.isArray(value.incoming)||value.incoming.length>100||!Array.isArray(value.sent)||value.sent.length>100)return null
 const sport=value.sport,definition=LEAGUE_SPORTS[sport]
 if(value.candidates.some(c=>!object(c)||!uuid(c.user_id)||!text(c.display_name)))return null
 for(const invite of [...value.incoming,...value.sent]){
  if(!object(invite)||!uuid(invite.id)||!uuid(invite.challenge_id)||!uuid(invite.team_id)||!text(invite.title,80)||!text(invite.department,120)||invite.sport!==sport||!definition.slots.some(slot=>slot.key===invite.slot)||!text(invite.inviter_name)||!text(invite.invitee_name)||!status(invite.status)||!timestamp(invite.expires_at)||!revision(invite.revision)||typeof invite.is_recipient!=='boolean'||typeof invite.can_cancel!=='boolean')return null
  if(invite.can_cancel&&(invite.is_recipient||invite.status!=='pending'))return null
 }
 if(value.incoming.some(invite=>!invite.is_recipient)||value.sent.some(invite=>invite.is_recipient))return null
 if(value.preview!==null){
  const preview=value.preview
  if(!object(preview)||!uuid(preview.challenge_id)||preview.challenge_id!==value.challenge_id||!uuid(preview.team_id)||!text(preview.title,80)||!text(preview.department,120)||preview.capacity!==definition.capacity||!Array.isArray(preview.players)||preview.players.length>definition.capacity)return null
  const occupied=new Set<string>()
  for(const player of preview.players){
   if(!object(player)||!uuid(player.id)||!text(player.alias)||player.status!=='accepted'||typeof player.is_me!=='boolean'||!definition.slots.some(slot=>slot.key===player.slot&&slot.position===player.position)||!sportTiers(sport).includes(String(player.tier))||occupied.has(String(player.slot)))return null
   occupied.add(String(player.slot))
  }
 }
 return value as LeagueInviteState
}

export function validateLeagueInviteCommand(action:unknown,args:unknown):Record<string,unknown>{
 const shapes:Record<string,string[]>={overview:['sport','challenge_id'],invite:['sport','challenge_id','team_id','friend_user_id','slot','expected_revision','idempotency_key'],accept:['sport','invite_id','tier','expected_revision','idempotency_key'],decline:['sport','invite_id','expected_revision','idempotency_key'],cancel:['sport','invite_id','expected_revision','idempotency_key']}
 if(typeof action!=='string'||!Object.hasOwn(shapes,action)||!object(args)||Object.keys(args).length!==shapes[action].length||Object.keys(args).some(key=>!shapes[action].includes(key)))throw new Error('invalid_invite_action')
 if(!isLeagueSport(args.sport))throw new Error('invalid_sport')
 for(const[key,value]of Object.entries(args)){
  if((key.endsWith('_id')||key==='idempotency_key')&&!(action==='overview'&&key==='challenge_id'&&value===null)&&!uuid(value))throw new Error('invalid_identifier')
  if(key==='expected_revision'&&!revision(value))throw new Error('invalid_revision')
 }
 if(action==='invite'&&!LEAGUE_SPORTS[args.sport].slots.some(slot=>slot.key===args.slot))throw new Error('invalid_slot')
 if(action==='accept'&&!sportTiers(args.sport).includes(String(args.tier)))throw new Error('invalid_tier')
 return args
}

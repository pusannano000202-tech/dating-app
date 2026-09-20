import type {LeagueSport} from './challenge-journey'

export type LeagueStage='sport'|'league'|'roster'|'opponents'|'match'|'result'|'report'|'invite'|'recruitment'|'publish'|'team-chat'|'team-chat-list'|'team-map'
export type LeagueLocation={sport:LeagueSport|null;stage:LeagueStage;challengeId:string|null;teamId:string|null;opponentId:string|null;opponentCursor:string|null;inviteId:string|null;draft:boolean;review:boolean;slot:string|null;fromNotice:boolean}
const identifier=(value:string|null)=>value&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)?value:null
const detailStages=new Set(['roster','opponents','publish','match','result','report'])
export function readLeagueLocation(query:URLSearchParams):LeagueLocation{
 const rawSport=query.get('sport'),sport=rawSport==='lol'||rawSport==='football'||rawSport==='futsal'?rawSport:query.get('category')==='gaming'?'lol':null
 const challengeId=identifier(query.get('challenge')),inviteId=identifier(query.get('invite')),view=query.get('view')
 const draft=view==='new',stage:LeagueStage=!sport||view==='sport'?'sport':inviteId?'invite':view==='new'?'roster':view==='league'||view==='recruitment'||view==='invite'?view:detailStages.has(view??'')?view as LeagueStage:challengeId?(query.get('panel')==='result'?'result':'roster'):'league'
 const detail=detailStages.has(stage)&&!draft,opponentId=stage==='opponents'?identifier(query.get('opponent')):null
 return{sport,stage,challengeId:detail?challengeId:null,teamId:detail&&challengeId?identifier(query.get('team')):null,opponentId,opponentCursor:opponentId?identifier(query.get('opponent_cursor')):null,inviteId,draft,review:stage==='roster'&&!!challengeId&&query.get('panel')==='applications',slot:stage==='roster'&&/^[a-z]{2,8}$/.test(query.get('slot')??'')?query.get('slot'):null,fromNotice:stage==='roster'&&query.get('source')==='notice'}
}
export function leagueLocationHref(input:{sport:LeagueSport|null;stage:LeagueStage;challengeId?:string|null;teamId?:string|null;opponentId?:string|null;opponentCursor?:string|null;inviteId?:string|null;draft?:boolean;review?:boolean;slot?:string|null;fromNotice?:boolean}):string{
 const query=new URLSearchParams()
 if(input.sport)query.set('sport',input.sport)
 query.set('view',input.draft&&input.stage==='roster'?'new':input.stage)
 if(detailStages.has(input.stage)&&!input.draft){if(input.challengeId)query.set('challenge',input.challengeId);if(input.challengeId&&input.teamId)query.set('team',input.teamId)}
 if(input.stage==='opponents'&&identifier(input.opponentId??null)){query.set('opponent',input.opponentId!);if(identifier(input.opponentCursor??null))query.set('opponent_cursor',input.opponentCursor!)}
 if(input.stage==='invite'&&input.inviteId)query.set('invite',input.inviteId)
 if(input.stage==='roster'&&input.challengeId&&!input.draft){if(input.review)query.set('panel','applications');if(input.slot)query.set('slot',input.slot);if(input.fromNotice)query.set('source','notice')}
 return `/meetups/league?${query}`
}

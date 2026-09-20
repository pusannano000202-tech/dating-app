export type TonightRoundStats = {maleApplicationCount:number|null;femaleApplicationCount:number|null;teamCount:number|null}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const count=(v:unknown):number|null=>Number.isSafeInteger(v)&&Number(v)>=0?Number(v):null
/** Existing authorized participation summary remains the gender count authority. */
export function projectTonightRoundStats(summary:unknown,teamStats:unknown,roundId:string):TonightRoundStats|null{
 if(!record(summary)||summary.scopeId!==`tonight:${roundId}`||!record(summary.genderBreakdown))return null
 return {maleApplicationCount:count(summary.genderBreakdown.malePeople),femaleApplicationCount:count(summary.genderBreakdown.femalePeople),
  teamCount:record(teamStats)&&teamStats.roundId===roundId?count(teamStats.teamCount):null}
}
/** Browser projection only; absent fields stay unknown, not zero. */
export function parseTonightRoundStats(value:unknown):TonightRoundStats|null{
 if(!record(value))return null
 return {maleApplicationCount:count(value.maleApplicationCount),femaleApplicationCount:count(value.femaleApplicationCount),teamCount:count(value.teamCount)}
}

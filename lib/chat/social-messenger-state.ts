/** UI state only. Identity is supplied by the authenticated server, never by alias. */
export type SocialMessage = {id:string; alias:string; text:string; createdAt:string; isMe:boolean|null}
export type MeetupChatState = {phase:'send'|'read_only'|'hidden'; messages:Array<{id:string;sender_alias:string;message:string;created_at:string;is_me:boolean|null}>}
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export function parseMeetupChat(value:unknown):MeetupChatState|null{
 if(!record(value)||!['send','read_only','hidden'].includes(String(value.phase))||!Array.isArray(value.messages))return null
 const messages:MeetupChatState['messages']=[],ids=new Set<string>()
 for(const item of value.messages){
  if(!record(item)||typeof item.id!=='string'||!uuid.test(item.id)||ids.has(item.id)||typeof item.sender_alias!=='string'||typeof item.message!=='string'||typeof item.created_at!=='string'||!Number.isFinite(Date.parse(item.created_at))||(item.is_me!==undefined&&item.is_me!==null&&typeof item.is_me!=='boolean'))return null
  ids.add(item.id)
  // Legacy DB responses remain readable, but unknown authorship is not presented as mine/other.
  messages.push({id:item.id,sender_alias:item.sender_alias,message:item.message,created_at:item.created_at,is_me:typeof item.is_me==='boolean'?item.is_me:null})
 }
 return {phase:value.phase as MeetupChatState['phase'],messages}
}
export function clearSentDraft(current:string,sent:string){return current.trim()===sent.trim()?'':current}
export function isMeetupSendAcknowledged(value:unknown,text:string){
 if(!record(value)||!record(value.message))return false
 const parsed=parseMeetupChat({phase:'send',messages:[value.message]})
 return parsed?.messages[0].message===text
}
export function isNearChatBottom(height:number,top:number,viewport:number){return height-top-viewport<72}
export function chatScrollChange(previousIds:readonly string[],nextIds:readonly string[]){
 if(!previousIds.length)return 'initial' as const
 const firstIndex=nextIds.indexOf(previousIds[0]),last=previousIds[previousIds.length-1]
 if(firstIndex>0&&nextIds[nextIds.length-1]===last)return 'prepend' as const
 if(nextIds.length&&nextIds[nextIds.length-1]!==last)return 'append' as const
 return 'unchanged' as const
}
export class PendingChatSends{
 private keys=new Map<string,string>()
 key(text:string,create:()=>string){const old=this.keys.get(text);if(old)return old;const next=create();this.keys.set(text,next);return next}
 acknowledge(text:string){this.keys.delete(text)}
 clear(){this.keys.clear()}
}

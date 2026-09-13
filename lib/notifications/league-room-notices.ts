export type LeagueRoomNotice = {id:string;kind:'application_received';state:'pending'|'reviewed';body:string;created_at:string}
export function parseLeagueRoomNotices(value:unknown,owner:string,team:string):LeagueRoomNotice[]|null {
 if(!value||typeof value!=='object'||Array.isArray(value))return null
 const data=value as Record<string,unknown>
 if(data.owner_id!==owner||data.team_id!==team||!Array.isArray(data.notices)||data.notices.length>50)return null
 const ids=new Set<string>()
 for(const item of data.notices){
  if(!item||typeof item!=='object'||Array.isArray(item))return null
  const n=item as Record<string,unknown>
  if(Object.keys(n).some(k=>!['id','kind','state','body','created_at'].includes(k))||typeof n.id!=='string'||!/^[0-9a-f-]{36}$/i.test(n.id)||ids.has(n.id)||n.kind!=='application_received'||!['pending','reviewed'].includes(String(n.state))||typeof n.body!=='string'||n.body.length>300||typeof n.created_at!=='string'||!Number.isFinite(Date.parse(n.created_at)))return null
  ids.add(n.id)
 }
 return data.notices as LeagueRoomNotice[]
}

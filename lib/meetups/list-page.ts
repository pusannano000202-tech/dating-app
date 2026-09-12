const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const timestamp=(value:unknown)=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value))
export function isMeetupListCursor(value:unknown):value is string {
 if(typeof value!=='string'||value.length>300)return false
 try{const parts:unknown=JSON.parse(value);return Array.isArray(parts)&&parts.length===3&&(parts[0]===null||timestamp(parts[0]))&&timestamp(parts[1])&&typeof parts[2]==='string'&&uuid.test(parts[2])}catch{return false}
}
export function parseMeetupPagination(value:unknown):{hasMore:boolean;nextCursor:string|null}|null {
 if(!value||typeof value!=='object'||!('has_more'in value)||!('next_cursor'in value)||typeof value.has_more!=='boolean')return null
 if(value.has_more?!isMeetupListCursor(value.next_cursor):value.next_cursor!==null)return null
 return{hasMore:value.has_more,nextCursor:value.next_cursor as string|null}
}
/** Retain the legacy meetups array while adding keyset metadata beside it. */
export function presentMeetupPage(value:unknown,limit:number){
 if(!Array.isArray(value)||value.length>limit+1)return null
 for(const row of value){
  if(!row||typeof row!=='object'||typeof row.id!=='string'||!uuid.test(row.id)||!isMeetupListCursor(row.list_cursor)||JSON.parse(row.list_cursor)[2]!==row.id)return null
 }
 const visible=value.slice(0,limit),hasMore=value.length>limit
 return{meetups:visible.map(({list_cursor:_cursor,...row})=>row),availability:'ready' as const,has_more:hasMore,next_cursor:hasMore?visible.at(-1).list_cursor as string:null}
}

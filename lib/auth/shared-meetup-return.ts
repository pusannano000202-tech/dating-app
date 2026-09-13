// A signup return destination is a room, never an arbitrary privileged route.
export function parseSharedMeetupReturn(value:unknown):string|null {
  return typeof value==='string'&&/^\/meetups\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)?value:null
}
export function sharedMeetupProfileHref(room:string):string {
  const next=parseSharedMeetupReturn(room)
  return next?`/profile/basic?next=${encodeURIComponent(next)}`:'/profile/basic'
}
export async function resolveSharedMeetupOnboarding(client:{rpc:(name:string)=>PromiseLike<{data:unknown;error:unknown}>},destination:string):Promise<string>{
  const room=parseSharedMeetupReturn(destination)
  if(!room)return destination
  const {data,error}=await client.rpc('get_my_profile_readiness')
  if(error||!Array.isArray(data)||data.length!==1||!data[0]||typeof data[0].minimum_signup_complete!=='boolean')throw new Error('profile_readiness_unavailable')
  return data[0].minimum_signup_complete?room:sharedMeetupProfileHref(room)
}

import {allowedCommonPushEndpoint,parseCommonPushSubscription} from './web-push-contract'
export const pushJson=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}})
export async function readPushBody(request:Request):Promise<unknown> {
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??'')||!request.body)return null
 const reader=request.body.getReader(),chunks:Uint8Array[]=[];let total=0
 try {
  for(;;){const chunk=await reader.read();if(chunk.done)break;total+=chunk.value.byteLength;if(total>4096){await reader.cancel();return null}chunks.push(chunk.value)}
  const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))
 }catch{return null}finally{reader.releaseLock()}
}
export function pushBodyArgs(value:unknown,operation:'subscribe'|'status'|'delete'):Record<string,string>|null {
 if(operation==='subscribe'){const v=parseCommonPushSubscription(value);return v?{p_endpoint:v.endpoint,p_p256dh:v.keys.p256dh,p_auth_secret:v.keys.auth,p_consent_version:v.consentVersion}:null}
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==1||!('endpoint'in value)||!allowedCommonPushEndpoint(value.endpoint))return null
 return {p_endpoint:value.endpoint}
}

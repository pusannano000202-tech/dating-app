'use client'

import {useEffect,useRef,type RefObject} from 'react'
import {useHistoryAccount} from '@/components/content-history/useHistoryAccount'
import {isChatUuid,type SocialChatRoomKind} from './social-rooms-contract'

type Message={id:string;created_at?:string}
type ReadTransport=(ids:string[],signal:AbortSignal)=>Promise<unknown>
/** Receipt batches contain only messages actually visible in this document.
 * No newest-message watermark: unread history outside the viewport survives. */
export function useSocialChatRead(kind:SocialChatRoomKind,roomId:string|null|undefined,messages:readonly Message[],{root,enabled=true,transport,ownerId}:{root:RefObject<HTMLElement|null>;enabled?:boolean;transport?:ReadTransport;ownerId?:string}){
 const account=useHistoryAccount(),owner=ownerId??account
 const acknowledged=useRef({scope:'',ids:new Set<string>()})
 useEffect(()=>{
  const scope=`${owner}:${kind}:${roomId}`
  if(acknowledged.current.scope!==scope)acknowledged.current={scope,ids:new Set()}
  if(!enabled||!isChatUuid(owner)||!isChatUuid(roomId)||!root.current||typeof IntersectionObserver==='undefined')return
  let active=true,busy=false,timer:ReturnType<typeof setTimeout>|undefined
  const controller=new AbortController(),visible=new Set<string>(),pending=new Set<string>(),known=new Set(messages.map(m=>m.id))
  const flush=async()=>{
   timer=undefined
   if(!active||busy||document.visibilityState!=='visible')return
   const ids=[...pending].slice(0,100);if(!ids.length)return
   busy=true
   try{
    const payload=transport?await transport(ids,controller.signal):await fetch('/api/chat/social-rooms/read',{method:'POST',headers:{'Content-Type':'application/json','X-Expected-Account':owner},body:JSON.stringify({kind,room_id:roomId,message_ids:ids}),signal:controller.signal}).then(async response=>{if(!response.ok)throw Error('read_not_saved');return response.json()})
    if(!active||acknowledged.current.scope!==scope)return
    if(!payload||typeof payload!=='object'||!('owner_id'in payload)||payload.owner_id!==owner||!('ok'in payload)||payload.ok!==true)throw Error('invalid_read_response')
    for(const id of ids){acknowledged.current.ids.add(id);pending.delete(id)}
    window.dispatchEvent(new Event('social-chat-read'))
   }catch{/* Preserve unread on failure. A visible refresh retries; never claim saved. */}
   finally{busy=false;if(active&&pending.size)timer=setTimeout(()=>void flush(),5000)}
  }
  const schedule=()=>{if(document.visibilityState!=='visible')return;for(const id of visible)if(!acknowledged.current.ids.has(id))pending.add(id);if(pending.size&&!timer)timer=setTimeout(()=>void flush(),350)}
  const observer=new IntersectionObserver(entries=>{
   for(const entry of entries){const id=(entry.target as HTMLElement).dataset.socialMessageId;if(!id||!known.has(id))continue
    if(entry.isIntersecting&&entry.intersectionRect.height>=Math.min(24,entry.boundingClientRect.height)){visible.add(id)}else visible.delete(id)
   }
   schedule()
  },{threshold:[0,.25,.5,1]})
  root.current.querySelectorAll<HTMLElement>('[data-social-message-id]').forEach(node=>{if(node.dataset.socialMessageId&&known.has(node.dataset.socialMessageId))observer.observe(node)})
  document.addEventListener('visibilitychange',schedule)
  return()=>{active=false;observer.disconnect();controller.abort();if(timer)clearTimeout(timer);document.removeEventListener('visibilitychange',schedule)}
 },[enabled,kind,roomId,owner,messages,root,transport])
}

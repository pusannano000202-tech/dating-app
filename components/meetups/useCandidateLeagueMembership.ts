'use client'

import {useCallback,useEffect,useRef,useState} from 'react'
import {useHistoryAccount} from '@/components/content-history/useHistoryAccount'
import {parseSocialRoomsResponse,type SocialRoomsResponse} from '@/lib/chat/social-rooms-contract'
import {leagueLocationHref} from '@/lib/meetups/league-navigation'
import type {CandidateScope} from '@/lib/meetups/candidate-board-contract'
export type CandidateLeagueTeam={id:string;challengeId:string;sport:'lol'|'football'|'futsal';title:string;department:string;memberCount:number;href:string;chatHref:string}
export type CandidateLeagueMembership={status:'loading'|'unavailable'|'none'}|{status:'member';teams:CandidateLeagueTeam[]}

/** Actor-owned, all-sport directory. UI guidance only; mutations retain server guards.
 * Public challenges can be hidden by blocked opponents, so they cannot prove absence.
 * No partial count: every cursor page must belong to the current authenticated account.
 */
export function useMyLeagueTeams(expectedOwner?:string|null,enabled=true){
 const account=useHistoryAccount(),key=`${enabled}:${account}:${expectedOwner===undefined?'auto':expectedOwner??'awaiting'}`,current=useRef(key);current.current=key
 const epoch=useRef(0),request=useRef<AbortController|null>(null)
 const [snapshot,setSnapshot]=useState<{key:string;membership:CandidateLeagueMembership}|null>(null)
 const refresh=useCallback(async(background=false)=>{
  request.current?.abort();request.current=null;const ticket=++epoch.current
  if(!enabled||!account||account==='unavailable'||expectedOwner!==undefined&&expectedOwner!==account)return
  const abort=new AbortController();request.current=abort
  const timer=setTimeout(()=>abort.abort(),12000)
  setSnapshot(previous=>background&&previous?.key===key&&(previous.membership.status==='member'||previous.membership.status==='none')?previous:{key,membership:{status:'loading'}})
  try{
   const teams=new Map<string,CandidateLeagueTeam>(),seen=new Set<string>();let cursor:string|null=null
   for(let page=0;page<20;page++){
    const response:Response=await fetch(`/api/chat/social-rooms${cursor?`?cursor=${encodeURIComponent(cursor)}`:''}`,{cache:'no-store',signal:abort.signal})
    const payload=await response.json()
    if(current.current!==key||ticket!==epoch.current)return
    const data:SocialRoomsResponse|null=response.ok?parseSocialRoomsResponse(payload,account):null
    if(!data)throw Error('invalid_team_directory')
    for(const room of data.rooms){
     if(room.kind!=='league_team'||!room.writable)continue
     if(!room.sport||!room.challenge_id)throw Error('incomplete_team_metadata')
     teams.set(room.id,{id:room.id,challengeId:room.challenge_id,sport:room.sport,title:room.title,department:room.affiliation,memberCount:room.member_count,href:leagueLocationHref({sport:room.sport,stage:'roster',challengeId:room.challenge_id,teamId:room.id}),chatHref:`/chat/league-team/${room.id}`})
    }
    if(!data.has_more){setSnapshot({key,membership:teams.size?{status:'member',teams:[...teams.values()]}:{status:'none'}});return}
    if(!data.next_cursor||seen.has(data.next_cursor))throw Error('invalid_team_cursor')
    seen.add(data.next_cursor);cursor=data.next_cursor
   }
   throw Error('team_directory_page_limit')
  }catch{if(current.current===key&&ticket===epoch.current)setSnapshot({key,membership:{status:'unavailable'}})}
  finally{clearTimeout(timer);if(current.current===key&&ticket===epoch.current)request.current=null}
 },[account,expectedOwner,enabled,key])
 const retry=useCallback(()=>refresh(false),[refresh])
 useEffect(()=>{
  void refresh()
  const wake=()=>{if(document.visibilityState==='visible'&&!request.current)void refresh(true)}
  const timer=setInterval(wake,30000);window.addEventListener('focus',wake);document.addEventListener('visibilitychange',wake)
  return()=>{++epoch.current;request.current?.abort();request.current=null;clearInterval(timer);window.removeEventListener('focus',wake);document.removeEventListener('visibilitychange',wake)}
 },[refresh])
 const membership:CandidateLeagueMembership=!enabled||account===null?{status:'none'}:account==='unavailable'?{status:'unavailable'}:snapshot?.key===key?snapshot.membership:{status:'loading'}
 return {membership,retry}
}

export function useCandidateLeagueMembership(scope:CandidateScope,boardOwner:string|null){
 return useMyLeagueTeams(boardOwner,scope.kind==='league')
}

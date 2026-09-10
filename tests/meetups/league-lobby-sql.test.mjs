import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {registerHooks} from 'node:module'
import {fixture,ids} from './challenge-league-fixture.mjs'
import {installLeaguePollEngine} from './league-lobby-polls-fixture.mjs'
registerHooks({resolve(specifier,context,next){return next(specifier==='./challenge-journey'?'./challenge-journey.ts':specifier,context)}})
const {parseLeagueLobbyState,parseLeagueChatState,parseLeagueChatMessage,validateLeagueLobbyAction}=await import('../../lib/meetups/league-lobby.ts')
const journey=new URL('../../supabase/migrations/20260910035348_department_league_position_journey.sql',import.meta.url)
const migration=new URL('../../supabase/migrations/20260910095144_department_league_manual_lobby.sql',import.meta.url)
async function setup(realPolls=false){
 const f=await fixture([journey])
 // The existing full poll engine tests own its other room types. A resolver
 // stand-in lets this SQL suite prove this migration's added admission gate.
 if(realPolls)await installLeaguePollEngine(f.db)
 else await f.db.exec("create function quantum_private.resolve_chat_poll_room(text,uuid,uuid,boolean)returns uuid language sql as $$select $2$$;")
 await f.db.exec(await readFile(migration,'utf8'))
 const lobby=(user,action,args)=>f.rpc(user,'department_league_lobby',[action,JSON.stringify(args)])
 const command=(user,action,args,key=crypto.randomUUID())=>lobby(user,action,{...args,idempotency_key:key})
 const overview=(user,team_id=null,sport='lol',cursor=null)=>lobby(user,'overview',{sport,team_id,cursor})
 const chat=(user,challenge_id,before=null)=>lobby(user,'chat_read',{challenge_id,before})
 const revision=async id=>(await f.db.query('select revision from public.department_challenges where id=$1',[id])).rows[0].revision
 async function pair(){const a=await f.team(0),b=await f.team(5);for(const t of[a,b])await f.act(t.actor,'queue',{team_id:t.team,waiting:true,gap:200});await command(a.actor,'propose',{team_id:a.team,opponent_team_id:b.team});const paired=await command(b.actor,'accept',{team_id:b.team,opponent_team_id:a.team});return{a,b,id:paired.challenge_id}}
 return{...f,lobby,command,overview,chat,revision,pair}
}

test('lobby counts real accepted ready waiting teams, separates sum from compatibility, and never projects account IDs',async()=>{
 const{db,team,act,overview,rpc}=await setup();try{
  const a=await team(0),b=await team(5),c=await team(10,['diamond','diamond','diamond','diamond','diamond'])
  for(const t of[a,b,c])await act(t.actor,'queue',{team_id:t.team,waiting:true,gap:200})
  const lobby=await overview(a.actor,a.team);assert.ok(parseLeagueLobbyState(lobby));assert.equal(lobby.total_count,3)
  assert.equal(lobby.teams.find(t=>t.team_id===b.team).can_propose,true)
  assert.equal(lobby.teams.find(t=>t.team_id===c.team).can_propose,false)
  assert.equal(lobby.teams.find(t=>t.team_id===b.team).score_sum,2000)
  assert.equal(lobby.teams.find(t=>t.team_id===b.team).compatibility_score,400)
  assert.equal(lobby.teams.find(t=>t.team_id===a.team).accepted_count,5)
  assert.ok(ids.every(id=>!JSON.stringify(lobby).includes(id)))
  assert.equal((await overview(ids[15])).teams.length,3)
  assert.equal((await overview(ids[1],a.team)).teams.every(t=>!t.can_propose),true)
  assert.equal((await overview(a.actor,null,'football')).total_count,0)
  await assert.rejects(overview(ids[23]),/department_identity_required/)
  await assert.rejects(overview(ids[15],a.team),/team_membership_required/)
  await db.query('insert into quantum_private.test_blocks values($1,$2)',[ids[15],ids[5]])
  assert.equal((await overview(ids[15])).total_count,2)
  await db.query('update auth.users set banned_until=now()+interval \'1 day\' where id=$1',[ids[10]])
  assert.equal((await overview(a.actor,a.team)).total_count,2)
  // Role cannot bypass RPC projection to read account-linked tables.
  await db.exec('set role authenticated')
  await assert.rejects(db.query('select * from quantum_private.challenge_match_chat_members'),/permission denied/)
  await db.exec('reset role')
  await assert.rejects(rpc(null,'department_league_lobby',['overview',JSON.stringify({sport:'lol',team_id:null,cursor:null})]),/not_authenticated/)
 }finally{await db.close()}
})

test('manual proposal is reversible and only receiving captain consent opens one shared participant chat',async()=>{
 const{db,team,act,command,overview,chat}=await setup();try{
  const a=await team(0),b=await team(5);for(const t of[a,b])await act(t.actor,'queue',{team_id:t.team,waiting:true,gap:200})
  await assert.rejects(chat(a.actor,a.id),/match_chat_membership_required/)
  await assert.rejects(command(ids[1],'propose',{team_id:a.team,opponent_team_id:b.team}),/captain_required/)
  const args={team_id:a.team,opponent_team_id:b.team},key=crypto.randomUUID()
  const sent=await command(a.actor,'propose',args,key);assert.deepEqual(await command(a.actor,'propose',args,key),sent)
  assert.equal((await overview(b.actor,b.team)).teams.find(t=>t.team_id===a.team).incoming,true)
  await assert.rejects(chat(a.actor,a.id),/match_chat_membership_required/)
  await assert.rejects(command(a.actor,'accept',args),/proposal_not_available/)
  await command(b.actor,'proposal_decline',{team_id:b.team,opponent_team_id:a.team})
  await assert.rejects(command(b.actor,'accept',{team_id:b.team,opponent_team_id:a.team}),/proposal_not_available/)
  await command(a.actor,'propose',args);await command(a.actor,'proposal_cancel',args)
  assert.equal((await overview(b.actor,b.team)).teams.find(t=>t.team_id===a.team).incoming,false)
  await command(a.actor,'propose',args)
  const acceptArgs={team_id:b.team,opponent_team_id:a.team},acceptKey=crypto.randomUUID()
  const paired=await command(b.actor,'accept',acceptArgs,acceptKey)
  assert.equal(paired.status,'opponent_pending');assert.equal(paired.challenge_id,a.id)
  assert.deepEqual(await command(b.actor,'accept',acceptArgs,acceptKey),paired)
  assert.equal((await db.query('select count(*)::int n from quantum_private.challenge_match_chat_members')).rows[0].n,10)
  for(const user of ids.slice(0,10))assert.ok(parseLeagueChatState(await chat(user,a.id)))
  await assert.rejects(chat(ids[10],a.id),/match_chat_membership_required/)
  await assert.rejects(chat(b.actor,b.id),/match_chat_membership_required/)
 }finally{await db.close()}
})

test('chat binds alias to authenticated member, validates messages, paginates without overlap, and revokes left/blocked/banned access',async()=>{
 const{db,pair,command,chat,lobby,rpc,revision}=await setup();try{
  const{a,id}=await pair(),args={challenge_id:id,body:'  토요일 3시에 교내 PC방에서 만날까요?  '},key=crypto.randomUUID()
  const message=await command(a.actor,'chat_send',args,key);assert.ok(parseLeagueChatMessage(message));assert.equal(message.body,args.body.trim())
  assert.deepEqual(await command(a.actor,'chat_send',args,key),message)
  await assert.rejects(command(a.actor,'chat_send',{...args,body:'changed'},key),/idempotency_key_reused/)
  await assert.rejects(command(a.actor,'chat_send',{...args,alias:'주장 사칭'}),/invalid_lobby_action/)
  for(const body of['','  ','x'.repeat(2001),'bad\u0007control'])await assert.rejects(command(a.actor,'chat_send',{challenge_id:id,body}),/invalid_message/)
  const unicode=await command(a.actor,'chat_send',{challenge_id:id,body:'🎮'.repeat(2000)})
  assert.ok(parseLeagueChatMessage(unicode))
  await assert.rejects(command(ids[10],'chat_send',args),/match_chat_membership_required/)
  for(let i=0;i<51;i++)await command(ids[5],'chat_send',{challenge_id:id,body:`답변 ${i}`})
  const page=await chat(a.actor,id);assert.ok(parseLeagueChatState(page));assert.equal(page.messages.length,50);assert.equal(page.has_more,true)
  const older=await chat(a.actor,id,page.next_cursor);assert.equal(older.messages.length,3);assert.equal(older.has_more,false)
  assert.equal(new Set([...page.messages,...older.messages].map(m=>m.id)).size,53)
  assert.equal(older.messages[0].is_me,true);assert.ok(!JSON.stringify(page).includes(ids[5]))
  await assert.rejects(chat(a.actor,id,crypto.randomUUID()),/invalid_cursor/)
  await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1",[ids[1]])
  await assert.rejects(chat(ids[1],id),/forbidden/)
  await db.query('insert into quantum_private.test_blocks values($1,$2)',[ids[2],ids[6]])
  await assert.rejects(chat(ids[2],id),/match_chat_forbidden/)
  await db.exec('delete from quantum_private.test_blocks')
  await rpc(ids[3],'leave_my_department_challenge_roster',[id,a.team,await revision(id),crypto.randomUUID()])
  await assert.rejects(chat(ids[3],id),/match_chat_membership_required/)
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[3]])
  await assert.rejects(db.query("select quantum_private.resolve_chat_poll_room('department_challenge',$1,$2,false)",[id,ids[3]]),/match_chat_membership_required/)
  await assert.rejects(lobby(a.actor,'chat_read',{challenge_id:id,before:null,actor_id:ids[10]}),/invalid_lobby_action/)
 }finally{await db.close()}
})

test('captain transfer requires recipient consent and atomically invalidates old captain actions while retaining member leave',async()=>{
 const{db,team,act,command,overview,revision,rpc}=await setup();try{
  const a=await team(0),b=await team(5);for(const t of[a,b])await act(t.actor,'queue',{team_id:t.team,waiting:true,gap:200})
  await command(a.actor,'propose',{team_id:a.team,opponent_team_id:b.team})
  const invite=(await db.query("insert into public.department_challenge_friend_invites(challenge_id,team_id,inviter_user_id,invitee_user_id,create_idempotency_key,request_hash,resulting_revision)values($1,$2,$3,$4,$5,md5('pending-before-transfer'),8)returning id",[a.id,a.team,a.actor,ids[15],crypto.randomUUID()])).rows[0].id
  const player=(await db.query('select id from public.department_challenge_roster where team_id=$1 and user_id=$2',[a.team,ids[1]])).rows[0].id
  const args={team_id:a.team,recipient_roster_id:player,expected_revision:await revision(a.id)}
  await assert.rejects(command(ids[2],'transfer_propose',args),/captain_required/)
  const requested=await command(a.actor,'transfer_propose',args)
  assert.equal((await overview(ids[1])).transfers[0].is_recipient,true)
  assert.equal((await db.query('select captain_user_id from public.department_challenge_teams where id=$1',[a.team])).rows[0].captain_user_id,a.actor)
  await assert.rejects(command(ids[2],'transfer_respond',{transfer_id:requested.transfer_id,accept:true}),/recipient_membership_required/)
  const declined=await command(ids[1],'transfer_respond',{transfer_id:requested.transfer_id,accept:false});assert.equal(declined.status,'declined')
  assert.equal((await db.query('select status from public.department_challenge_friend_invites where id=$1',[invite])).rows[0].status,'pending')
  const next=await command(a.actor,'transfer_propose',args),key=crypto.randomUUID(),responseArgs={transfer_id:next.transfer_id,accept:true}
  const accepted=await command(ids[1],'transfer_respond',responseArgs,key);assert.equal(accepted.status,'accepted')
  assert.deepEqual(await command(ids[1],'transfer_respond',responseArgs,key),accepted)
  assert.equal((await db.query('select captain_user_id from public.department_challenge_teams where id=$1',[a.team])).rows[0].captain_user_id,ids[1])
  assert.equal((await db.query('select waiting from quantum_private.challenge_team_preferences where team_id=$1',[a.team])).rows[0].waiting,false)
  assert.equal((await db.query('select count(*)::int n from quantum_private.challenge_pair_proposals')).rows[0].n,0)
  assert.equal((await db.query('select status from public.department_challenge_friend_invites where id=$1',[invite])).rows[0].status,'cancelled')
  assert.equal((await db.query("select count(*)::int n from public.department_challenge_roster where team_id=$1 and status='accepted'",[a.team])).rows[0].n,5)
  await assert.rejects(act(a.actor,'queue',{team_id:a.team,waiting:true,gap:200}),/captain_required/)
  await act(ids[1],'queue',{team_id:a.team,waiting:true,gap:200})
  await assert.rejects(rpc(a.actor,'leave_my_department_challenge_roster',[a.id,a.team,args.expected_revision,crypto.randomUUID()]),/stale_revision/)
  const left=await rpc(a.actor,'leave_my_department_challenge_roster',[a.id,a.team,await revision(a.id),crypto.randomUUID()]);assert.equal(left.status,'left')
 }finally{await db.close()}
})

test('pending transfer is cancelled, expires, or becomes stale without secretly changing membership',async()=>{
 const{db,team,command,overview,revision,rpc}=await setup();try{
  const a=await team(0),player=(await db.query('select id from public.department_challenge_roster where team_id=$1 and user_id=$2',[a.team,ids[1]])).rows[0].id
  const make=()=>command(a.actor,'transfer_propose',{team_id:a.team,recipient_roster_id:player,expected_revision:8})
  assert.equal(await revision(a.id),8)
  const cancelled=await make();await command(a.actor,'transfer_cancel',{transfer_id:cancelled.transfer_id})
  assert.deepEqual((await overview(ids[1])).transfers,[])
  await assert.rejects(command(ids[1],'transfer_respond',{transfer_id:cancelled.transfer_id,accept:true}),/transfer_not_pending/)
  const expired=await make();await db.query("update quantum_private.challenge_captain_transfers set expires_at=now()-interval '1 minute' where id=$1",[expired.transfer_id])
  await assert.rejects(command(ids[1],'transfer_respond',{transfer_id:expired.transfer_id,accept:true}),/transfer_not_pending/)
  const stale=await make();await rpc(ids[2],'leave_my_department_challenge_roster',[a.id,a.team,8,crypto.randomUUID()])
  await assert.rejects(command(ids[1],'transfer_respond',{transfer_id:stale.transfer_id,accept:true}),/stale_revision/)
  assert.deepEqual((await overview(ids[1])).transfers,[])
  assert.equal((await db.query('select captain_user_id from public.department_challenge_teams where id=$1',[a.team])).rows[0].captain_user_id,a.actor)
 }finally{await db.close()}
})

test('post-pair captain changes reset pending consent while preserving a fully agreed schedule and match chat',async()=>{
 const{db,pair,command,revision,rpc,chat}=await setup();try{
  const{a,b,id}=await pair(),start=new Date(Date.now()+7200000).toISOString(),end=new Date(Date.now()+10800000).toISOString()
  let state=await rpc(a.actor,'confirm_my_department_challenge_schedule',[id,start,end,'교내 PC방',await revision(id),crypto.randomUUID()])
  async function transfer(from,to){
   const roster=(await db.query('select id from public.department_challenge_roster where team_id=$1 and user_id=$2',[a.team,to])).rows[0].id
   const proposal=await command(from,'transfer_propose',{team_id:a.team,recipient_roster_id:roster,expected_revision:await revision(id)})
   return command(to,'transfer_respond',{transfer_id:proposal.transfer_id,accept:true})
  }
  await transfer(a.actor,ids[1])
  assert.equal((await db.query('select count(*)::int n from public.department_challenge_schedule_confirmations where challenge_id=$1',[id])).rows[0].n,0)
  await assert.rejects(rpc(a.actor,'confirm_my_department_challenge_schedule',[id,start,end,'교내 PC방',await revision(id),crypto.randomUUID()]),/department_challenge_not_found/)
  state=await rpc(ids[1],'confirm_my_department_challenge_schedule',[id,start,end,'교내 PC방',await revision(id),crypto.randomUUID()])
  await rpc(b.actor,'confirm_my_department_challenge_schedule',[id,start,end,'교내 PC방',state.revision,crypto.randomUUID()])
  await transfer(ids[1],ids[2])
  assert.equal((await db.query('select status from public.department_challenges where id=$1',[id])).rows[0].status,'scheduled')
  assert.equal((await db.query('select count(*)::int n from public.department_challenge_schedule_confirmations where challenge_id=$1',[id])).rows[0].n,2)
  await db.query("update public.department_challenges set scheduled_at=now()-interval '2 hours',ends_at=now()-interval '1 hour' where id=$1",[id])
  await rpc(ids[2],'confirm_my_department_challenge_result',[id,2,1,await revision(id),crypto.randomUUID()])
  await transfer(ids[2],ids[3])
  assert.equal((await db.query('select status from public.department_challenges where id=$1',[id])).rows[0].status,'scheduled')
  assert.equal((await db.query('select count(*)::int n from public.department_challenge_result_confirmations where challenge_id=$1',[id])).rows[0].n,0)
  const result=await rpc(ids[3],'confirm_my_department_challenge_result',[id,2,1,await revision(id),crypto.randomUUID()])
  await rpc(b.actor,'confirm_my_department_challenge_result',[id,1,2,result.revision,crypto.randomUUID()])
  assert.equal((await chat(ids[3],id)).writable,false)
  await assert.rejects(command(ids[3],'chat_send',{challenge_id:id,body:'종료 후 쓰기'}),/match_chat_membership_required/)
 }finally{await db.close()}
})

test('HTTP contract rejects spoofed fields, invalid cursor, nonboolean consent and control characters',()=>{
 assert.throws(()=>validateLeagueLobbyAction('chat_send',{challenge_id:ids[0],body:'hello',idempotency_key:ids[1],alias:'fake'}),/invalid_lobby_action/)
 assert.throws(()=>validateLeagueLobbyAction('chat_read',{challenge_id:ids[0],before:'bad'}),/invalid_cursor/)
 assert.throws(()=>validateLeagueLobbyAction('transfer_respond',{transfer_id:ids[0],accept:'true',idempotency_key:ids[1]}),/invalid_consent/)
 assert.throws(()=>validateLeagueLobbyAction('chat_send',{challenge_id:ids[0],body:'x\u0001',idempotency_key:ids[1]}),/invalid_message/)
 assert.deepEqual(validateLeagueLobbyAction('overview',{sport:'lol',team_id:null,cursor:null}),{sport:'lol',team_id:null,cursor:null})
})

test('actual poll engine lets both paired teams author and vote, requires every member consent, and rejects outsiders or former members',async()=>{
 const{db,pair,rpc,revision}=await setup(true);try{
  const{a,id}=await pair(),kind='department_challenge'
  // Actual public RPCs execute under authenticated, not the fixture superuser.
  const key=crypto.randomUUID(),createArgs=[kind,id,'schedule','어느 날 만날까요?','single',['토요일 오후','일요일 오후'],key]
  const poll=await rpc(ids[1],'create_chat_room_poll',createArgs)
  assert.equal(poll.title,'어느 날 만날까요?');assert.equal(poll.creator_alias,'별친구')
  assert.equal((await rpc(ids[1],'create_chat_room_poll',createArgs)).id,poll.id)
  assert.equal((await rpc(ids[6],'get_chat_room_polls',[kind,id])).polls[0].id,poll.id)
  await assert.rejects(rpc(ids[10],'get_chat_room_polls',[kind,id]),/match_chat_membership_required/)
  await assert.rejects(rpc(ids[10],'create_chat_room_poll',[kind,id,'place','외부 참가자 질문','single',['A','B'],crypto.randomUUID()]),/match_chat_membership_required/)
  await assert.rejects(rpc(null,'get_chat_room_polls',[kind,id]),/forbidden|not_authenticated/)
  for(const user of ids.slice(0,10))await rpc(user,'vote_chat_room_poll',[kind,id,poll.id,[poll.options[0].id]])
  const board=await rpc(ids[6],'get_chat_room_polls',[kind,id])
  assert.equal(board.polls[0].ballot_count,10);assert.equal(board.polls[0].options[0].vote_count,10)
  assert.ok(ids.every(user=>!JSON.stringify(board).includes(user)))
  const closed=await rpc(ids[1],'close_chat_room_poll',[kind,id,poll.id,poll.revision])
  const proposal=await rpc(ids[1],'propose_chat_room_poll_agreement',[kind,id,poll.id,poll.options[0].id,closed.revision,crypto.randomUUID(),'토요일 오후에 만나요'])
  assert.equal(proposal.status,'proposal')
  for(const user of ids.slice(0,9)){
   const consent=await rpc(user,'confirm_chat_room_poll_agreement',[kind,id,poll.id,proposal.id,proposal.version])
   assert.equal(consent.status,'proposal')
  }
  const agreed=await rpc(ids[9],'confirm_chat_room_poll_agreement',[kind,id,poll.id,proposal.id,proposal.version])
  assert.equal(agreed.status,'confirmed')
  // Member-authored poll consensus remains advisory; only captain bilateral
  // schedule confirmation can mutate the actual match date or place.
  const match=(await db.query('select status,scheduled_at,place_name from public.department_challenges where id=$1',[id])).rows[0]
  assert.deepEqual(match,{status:'opponent_pending',scheduled_at:null,place_name:null})
  const second=await rpc(ids[6],'create_chat_room_poll',[kind,id,'place','어느 PC방으로 갈까요?','single',['정문 PC방','북문 PC방'],crypto.randomUUID()])
  assert.equal(second.is_creator,true)
  await rpc(ids[2],'leave_my_department_challenge_roster',[id,a.team,await revision(id),crypto.randomUUID()])
  await assert.rejects(rpc(ids[2],'get_chat_room_polls',[kind,id]),/match_chat_membership_required/)
  await assert.rejects(rpc(ids[2],'vote_chat_room_poll',[kind,id,second.id,[second.options[0].id]]),/match_chat_membership_required/)
  await db.query('insert into quantum_private.test_blocks values($1,$2)',[ids[3],ids[7]])
  await assert.rejects(rpc(ids[3],'get_chat_room_polls',[kind,id]),/match_chat_forbidden/)
  await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1",[ids[4]])
  await assert.rejects(rpc(ids[4],'vote_chat_room_poll',[kind,id,second.id,[second.options[0].id]]),/forbidden/)
 }finally{await db.close()}
})

import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'

/** Real poll migration on the real league tables. Other room domains stay empty. */
export async function installLeaguePollEngine(db){
 await db.exec(`
  create table public.friend_requests(id uuid primary key,sender_user_id uuid,receiver_user_id uuid,status text);
  create table public.friendships(user_id uuid,friend_user_id uuid,status text,created_from_request_id uuid,primary key(user_id,friend_user_id));
  create table public.activity_meetups(id uuid primary key,status text);
  create table public.activity_meetup_members(meetup_id uuid,user_id uuid,status text);
  create table quantum_private.activity_room_pools(id uuid primary key);
  create table quantum_private.activity_room_rooms(id uuid primary key,pool_id uuid,status text);
  create table quantum_private.activity_room_members(room_id uuid,pool_id uuid,user_id uuid,status text);
  create function quantum_private.activity_room_member_current(uuid,uuid)returns boolean language plpgsql as $$
   begin raise exception 'unexpected_activity_room_domain_in_league_test';end$$;
 `)
 async function actualFunction(file,name){
  const source=await readFile(new URL(`../../supabase/migrations/${file}`,import.meta.url),'utf8')
  const start=source.indexOf(`create or replace function quantum_private.${name}(`)
  assert.ok(start>=0)
  const tail=source.slice(start),end=tail.indexOf('$$;')
  assert.ok(end>=0)
  await db.exec(tail.slice(0,end+3))
 }
 await actualFunction('20260906133228_continuation_friend_fee_pair_guard.sql','friend_pair_lock_key')
 await actualFunction('20260907085612_friend_scene.sql','is_active_accepted_friend_pair')
 const source=await readFile(new URL('../../supabase/migrations/20260908164747_activity_room_chat_polls.sql',import.meta.url),'utf8')
 // challenge-league-fixture already installs the exact migration prefix:
 // polls, options, ballots, and choices. Install its remaining schema and all
 // production functions unchanged, including resolver/locks/auth/projections.
 const start=source.indexOf('create table quantum_private.activity_room_poll_agreements (')
 assert.ok(start>=0)
 await db.exec(`begin;\n${source.slice(start)}`)
}

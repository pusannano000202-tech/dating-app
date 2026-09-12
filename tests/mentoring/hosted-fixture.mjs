import {readFile} from 'node:fs/promises'
import {setup as chatSetup,ids} from '../chat/social-chat-fixture.mjs'
export {ids}
const source=name=>readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8')
export async function setup({beforeMigration}={}) {
 const f=await chatSetup()
 try {
  await f.db.exec(await source('20260911141714_social_chat_read_positions.sql'))
  await f.db.exec(`create table if not exists public.profiles(user_id uuid primary key,display_name text);
   alter table public.friendships add column if not exists created_at timestamptz default now();`)
  const friends=await source('20260907085612_friend_scene.sql'),tail=friends.slice(friends.indexOf('create or replace function public.get_friend_summaries()'))
  await f.db.exec(tail.slice(0,tail.indexOf('$$;')+3))
  if(beforeMigration)await beforeMigration(f)
  await f.db.exec(await source('20260912034346_mentoring_hosted_recruitment.sql'))
  const act=(user,action,args={})=>f.rpc(user,'mentoring_hosted_action',[action,JSON.stringify(args)])
  const create=(user=ids[0],extra={})=>act(user,'create',{title:'우리 과 진로 이야기',topic:'career',side_size:2,role:'mentor',client_id:crypto.randomUUID(),...extra})
  const admit=async(room,user,role='mentee')=>f.db.query('select quantum_private.hosted_mentoring_admit($1,$2,$3)',[room,user,JSON.stringify({role})])
  return {...f,act,create,admit}
 }catch(error){await f.db.close();throw error}
}

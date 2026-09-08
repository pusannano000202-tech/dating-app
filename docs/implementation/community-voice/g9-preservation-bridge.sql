begin;
-- Legacy scheduled jobs may finish an event, but never create a new friendship.
-- Existing friendships and provenance are intentionally left untouched.
create or replace function public.connect_completed_quantum_event_match(p_match_id uuid)
returns integer language sql volatile security definer set search_path='' as $$select 0$$;
revoke all on function public.connect_completed_quantum_event_match(uuid) from public,anon,authenticated,service_role;
grant execute on function public.connect_completed_quantum_event_match(uuid) to service_role;

create or replace function public.complete_due_quantum_couple_matches(p_now timestamptz default now())
returns integer language plpgsql volatile security definer set search_path='' as $$
declare
 m public.quantum_couple_matches%rowtype;
 n int:=0;
 previous_notifications_guard text:=pg_catalog.current_setting('app.bypass_notifications_guard',true);
begin
 if auth.role() is distinct from 'service_role' then raise exception 'forbidden';end if;
 perform pg_catalog.set_config('app.bypass_notifications_guard','on',true);
 for m in select * from public.quantum_couple_matches where status='confirmed' and starts_at+interval '150 minutes'<=p_now order by starts_at for update skip locked loop
   update public.quantum_couple_matches set status='completed',completed_at=p_now where id=m.id;
   update public.quantum_couple_parties set status='completed',updated_at=p_now where id in(m.pair_a_id,m.pair_b_id);
   insert into public.notifications(user_id,kind,payload)
   select member.user_id,'couple_party_completed',jsonb_build_object('couple_match_id',m.id,'event_id','scheduled-couple-double-date','friendship_created',false)
   from(select leader_user_id as user_id from public.quantum_couple_parties where id in(m.pair_a_id,m.pair_b_id)
        union select partner_user_id from public.quantum_couple_parties where id in(m.pair_a_id,m.pair_b_id))member;
    n:=n+1;
 end loop;
 perform pg_catalog.set_config('app.bypass_notifications_guard',coalesce(previous_notifications_guard,''),true);
 return n;
exception when others then
 perform pg_catalog.set_config('app.bypass_notifications_guard',coalesce(previous_notifications_guard,''),true);
 raise;
end;$$;
revoke all on function public.complete_due_quantum_couple_matches(timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.complete_due_quantum_couple_matches(timestamptz) to service_role;

-- Old auto-written a_agreed/b_agreed values are not proof of manual phone consent.
-- Keep the DTO stable while removing GET writes and contact disclosure. Use accepted-friend messaging instead.
create or replace function public.get_match_connections(p_match_id uuid)
returns table(target_user_id uuid,target_display_name text,contact_revealed_at timestamptz,scheduled_reveal_at timestamptz,target_phone text)
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid();m public.matches%rowtype;mine uuid;other_group uuid;
begin
 if u is null then raise exception 'not_authenticated';end if;
 if quantum_private.account_deletion_blocks_access(u) then raise exception 'forbidden';end if;
 if exists(select 1 from public.quantum_event_match_members where match_id=p_match_id) then raise exception 'event_match_contact_hidden';end if;
 select * into m from public.matches where id=p_match_id;if not found then raise exception 'match_not_found';end if;
 select group_id into mine from public.group_members where user_id=u and left_at is null and group_id in(m.group_a_id,m.group_b_id) limit 1;
 if mine is null then raise exception 'not_match_participant';end if;
 if m.status not in('confirmed','completed') then return;end if;
 other_group:=case when mine=m.group_a_id then m.group_b_id else m.group_a_id end;
 return query select gm.user_id,p.display_name,null::timestamptz,null::timestamptz,null::text
 from public.group_members gm left join public.profiles p on p.user_id=gm.user_id
 where gm.group_id=other_group and gm.left_at is null and gm.user_id<>u
 and not quantum_private.tonight_invite_pair_is_blocked(u,gm.user_id)
 and not quantum_private.account_deletion_blocks_access(gm.user_id);
end;$$;
revoke all on function public.get_match_connections(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_match_connections(uuid) to authenticated;

create or replace function quantum_private.voice_eligible(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from quantum_private.resolve_profile_readiness(p_user) where minimum_signup_complete)
 and exists(select 1 from auth.users where id=p_user and deleted_at is null and (banned_until is null or banned_until<=now()))
 and not exists(select 1 from quantum_private.voice_restrictions where user_id=p_user and until_at>now())
 and not quantum_private.account_deletion_blocks_access(p_user);
$$;
revoke all on function quantum_private.voice_eligible(uuid) from public,anon,authenticated,service_role;
commit;

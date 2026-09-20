-- Existing FIFO selection, scoped to the chosen operator event. Never enters
-- quantum_couple_matches or the legacy Saturday/completion/friendship cron.
begin;
alter table public.quantum_couple_parties drop constraint quantum_couple_parties_status_check;
alter table public.quantum_couple_parties add constraint quantum_couple_parties_status_check check(status in
  ('pending_partner','payment_pending','calendar_ready','calendar_matched','ready','matched','completed','cancelled'));
create table quantum_private.calendar_couple_assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references quantum_private.couple_calendar_events(id) on delete restrict,
  school_scope_key text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location_name text not null,
  status text not null default 'confirmed' check(status in ('confirmed','cancelled','completed')),
  created_at timestamptz not null default now(),
  check(ends_at>starts_at)
);
create table quantum_private.calendar_couple_assignment_parties (
  party_id uuid unique references public.quantum_couple_parties(id) on delete set null,
  assignment_id uuid not null references quantum_private.calendar_couple_assignments(id) on delete restrict,
  pair_number integer not null check(pair_number in (1,2)),
  primary key(assignment_id,pair_number)
);
alter table quantum_private.calendar_couple_assignments enable row level security;
alter table quantum_private.calendar_couple_assignment_parties enable row level security;
revoke all on quantum_private.calendar_couple_assignments,quantum_private.calendar_couple_assignment_parties from public,anon,authenticated,service_role;

create function quantum_private.calendar_pair_ready(p public.quantum_couple_parties) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare member_id uuid;
begin
 -- Reuse the same authoritative account/minimum-signup policy as checkout.
 -- The allocator calls this again for both pairs after acquiring member locks.
 for member_id in select m from unnest(array[p.leader_user_id,p.partner_user_id]) m loop
   begin
     perform 1 from quantum_private.assert_activity_room_access(member_id);
     if not found then return false; end if;
   exception
     when sqlstate '42501' then
       if sqlerrm in ('not_authenticated','account_deletion_pending','activity_room_forbidden') then return false; end if;
       raise;
     when sqlstate 'P0001' then
       if sqlerrm='profile_required' then return false; end if;
       raise;
   end;
 end loop;
 return p.status='calendar_ready' and p.calendar_event_id is not null and p.accepted_at is not null and p.calendar_consent_at is not null
   and not exists(select 1 from quantum_private.calendar_couple_assignment_parties a where a.party_id=p.id)
   and not quantum_private.tonight_invite_pair_is_blocked(p.leader_user_id,p.partner_user_id)
   and quantum_private.calendar_has_held_deposit('couple',p.calendar_event_id,p.id,p.leader_user_id)
   and quantum_private.calendar_has_held_deposit('couple',p.calendar_event_id,p.id,p.partner_user_id)
   and not exists(select 1 from unnest(array[p.leader_user_id,p.partner_user_id]) m where
     not exists(select 1 from quantum_private.relationship_states s where s.user_id=m and s.status='in_relationship')
     or not exists(select 1 from quantum_private.get_member_department_identity(m) i where i.school_scope_key=p.school_scope));
end
$$;

create or replace function quantum_private.guard_calendar_couple_party() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE' and old.calendar_event_id is not null and (new.calendar_event_id is distinct from old.calendar_event_id
    or new.leader_user_id<>old.leader_user_id or new.partner_user_id<>old.partner_user_id) then raise exception 'calendar_party_identity_locked'; end if;
  if new.calendar_event_id is not null then
    if new.status in ('ready','matched','completed') then raise exception 'calendar_date_assignment_required'; end if;
    if new.status in ('calendar_ready','calendar_matched') and (new.accepted_at is null or new.calendar_consent_at is null
      or not quantum_private.calendar_has_held_deposit('couple',new.calendar_event_id,new.id,new.leader_user_id)
      or not quantum_private.calendar_has_held_deposit('couple',new.calendar_event_id,new.id,new.partner_user_id)) then raise exception 'calendar_payment_not_ready'; end if;
    if new.status='calendar_matched' and not exists(
      select 1 from quantum_private.calendar_couple_assignment_parties member
      join quantum_private.calendar_couple_assignments assignment on assignment.id=member.assignment_id
      where member.party_id=new.id and assignment.event_id=new.calendar_event_id and assignment.school_scope_key=new.school_scope and assignment.status='confirmed'
        and 2=(select count(*) from quantum_private.calendar_couple_assignment_parties both_pairs where both_pairs.assignment_id=assignment.id)
    ) then raise exception 'calendar_assignment_required'; end if;
  end if;
  return new;
end $$;

create or replace function quantum_private.try_assign_calendar_couple(p_party_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare p public.quantum_couple_parties; candidate public.quantum_couple_parties; e quantum_private.couple_calendar_events;
  member_id uuid; assignment_id uuid;
begin
  select * into p from public.quantum_couple_parties where id=p_party_id and calendar_event_id is not null;
  if not found then return; end if;
  -- Every dated-couple mutation takes this lock before any member/payment lock.
  perform pg_advisory_xact_lock(hashtextextended('calendar-couple-event:'||p.calendar_event_id::text,0));
  select * into e from quantum_private.couple_calendar_events where id=p.calendar_event_id for update;
  select * into p from public.quantum_couple_parties where id=p_party_id for update;
  if e.status<>'recruiting' or e.application_closes_at<=clock_timestamp() or not quantum_private.calendar_pair_ready(p) then return; end if;
  for candidate in select c.* from public.quantum_couple_parties c
    where c.calendar_event_id=e.id and c.school_scope=e.school_scope_key and c.id<>p.id
      and c.leader_user_id not in (p.leader_user_id,p.partner_user_id)
      and c.partner_user_id not in (p.leader_user_id,p.partner_user_id)
      and quantum_private.calendar_pair_ready(c)
      and not exists(select 1 from unnest(array[c.leader_user_id,c.partner_user_id]) other_member
        cross join unnest(array[p.leader_user_id,p.partner_user_id]) mine
        where quantum_private.tonight_invite_pair_is_blocked(other_member,mine))
    order by c.created_at,c.id for update skip locked
  loop
    for member_id in select u from unnest(array[p.leader_user_id,p.partner_user_id,candidate.leader_user_id,candidate.partner_user_id]) u order by u loop
      perform pg_advisory_xact_lock(hashtextextended(member_id::text,71));
      perform pg_advisory_xact_lock(hashtextextended('relationship-state:'||member_id::text,0));
    end loop;
    perform 1 from quantum_private.calendar_payment_orders o where o.audience='couple' and o.event_id=e.id
      and o.application_id in (p.id,candidate.id) order by o.order_id for update;
    if not quantum_private.calendar_pair_ready(p) then return; end if;
    if not quantum_private.calendar_pair_ready(candidate) then continue; end if;
    if exists(select 1 from unnest(array[candidate.leader_user_id,candidate.partner_user_id]) other_member
      cross join unnest(array[p.leader_user_id,p.partner_user_id]) mine
      where quantum_private.tonight_invite_pair_is_blocked(other_member,mine)) then continue; end if;
    insert into quantum_private.calendar_couple_assignments(event_id,school_scope_key,starts_at,ends_at,location_name)
      values(e.id,e.school_scope_key,e.starts_at,e.ends_at,e.location_name) returning id into assignment_id;
    insert into quantum_private.calendar_couple_assignment_parties(party_id,assignment_id,pair_number)
      values(p.id,assignment_id,1),(candidate.id,assignment_id,2);
    update public.quantum_couple_parties set status='calendar_matched',updated_at=clock_timestamp() where id in (p.id,candidate.id);
    return;
  end loop;
end $$;

-- Exactly one assignment per party across either seat. No member identity read API.
revoke all on function quantum_private.calendar_pair_ready(public.quantum_couple_parties),quantum_private.try_assign_calendar_couple(uuid)
  from public,anon,authenticated,service_role;
commit;

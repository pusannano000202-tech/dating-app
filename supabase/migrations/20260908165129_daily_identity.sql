-- Server-owned daily character identities for matching and meetup privacy.
-- Character names are text references only. No logos, artwork, paid rerolls,
-- ranking benefits, or claims of official endorsement are part of this feature.
begin;

create table quantum_private.daily_identity_characters (
  pool_version text not null,
  gender_pool text not null check (gender_pool in ('male','female','neutral')),
  tier text not null check (tier in ('SS','A','B','C')),
  character_key text not null check (character_key ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  display_name text not null check (
    pg_catalog.char_length(pg_catalog.btrim(display_name)) between 1 and 60
    and display_name !~ '[[:cntrl:]]'
  ),
  selection_order smallint not null check (selection_order > 0),
  evidence_kind text not null check (evidence_kind in ('official_2026_top_results','official_2026_entry','official_character_profile')),
  primary key (pool_version,gender_pool,tier,character_key),
  unique (pool_version,gender_pool,tier,selection_order)
);

insert into quantum_private.daily_identity_characters(
  pool_version,gender_pool,tier,character_key,display_name,selection_order,evidence_kind
) values
  ('campus-characters-v1-2026-09','male','SS','pompompurin','폼폼푸린',1,'official_2026_top_results'),
  ('campus-characters-v1-2026-09','male','SS','cinnamoroll','시나모롤',2,'official_2026_top_results'),
  ('campus-characters-v1-2026-09','male','SS','pochacco','포차코',3,'official_2026_top_results'),
  ('campus-characters-v1-2026-09','male','A','hangyodon','한교동',1,'official_2026_entry'),
  ('campus-characters-v1-2026-09','male','A','ahirunopekkle','아히루노페클',2,'official_2026_top_results'),
  ('campus-characters-v1-2026-09','male','A','tuxedosam','턱시도샘',3,'official_2026_entry'),
  ('campus-characters-v1-2026-09','male','B','bad-badtz-maru','배드바츠마루',1,'official_2026_entry'),
  ('campus-characters-v1-2026-09','male','B','kerokerokeroppi','케로케로케로피',2,'official_2026_entry'),
  ('campus-characters-v1-2026-09','male','B','chococat','초코캣',3,'official_2026_entry'),
  ('campus-characters-v1-2026-09','male','C','dear-daniel','디어다니엘',1,'official_2026_entry'),
  ('campus-characters-v1-2026-09','male','C','osarunomonkichi','오사루노몽키치',2,'official_2026_entry'),
  ('campus-characters-v1-2026-09','male','C','corocorokuririn','코로코로크리링',3,'official_2026_entry'),
  ('campus-characters-v1-2026-09','female','SS','kuromi','쿠로미',1,'official_2026_top_results'),
  ('campus-characters-v1-2026-09','female','SS','hello-kitty','헬로키티',2,'official_2026_top_results'),
  ('campus-characters-v1-2026-09','female','SS','my-melody','마이멜로디',3,'official_2026_entry'),
  ('campus-characters-v1-2026-09','female','A','my-sweet-piano','마이스위트피아노',1,'official_2026_top_results'),
  ('campus-characters-v1-2026-09','female','A','cogimyun','코기뮹',2,'official_2026_entry'),
  ('campus-characters-v1-2026-09','female','A','wish-me-mell','위시미멜',3,'official_2026_entry'),
  ('campus-characters-v1-2026-09','female','B','u-sa-ha-na','우사하나',1,'official_2026_entry'),
  ('campus-characters-v1-2026-09','female','B','marroncream','마론크림',2,'official_2026_entry'),
  ('campus-characters-v1-2026-09','female','B','charmmykitty','참미키티',3,'official_2026_entry'),
  ('campus-characters-v1-2026-09','female','C','hello-mimmy','헬로미미',1,'official_2026_entry'),
  ('campus-characters-v1-2026-09','female','C','bonbonribbon','봉봉리본',2,'official_2026_entry'),
  ('campus-characters-v1-2026-09','female','C','aggretsuko','어그레츠코',3,'official_2026_entry'),
  ('campus-characters-v1-2026-09','neutral','SS','pompompurin','폼폼푸린',1,'official_2026_top_results'),
  ('campus-characters-v1-2026-09','neutral','SS','kuromi','쿠로미',2,'official_2026_top_results'),
  ('campus-characters-v1-2026-09','neutral','SS','hello-kitty','헬로키티',3,'official_2026_top_results'),
  ('campus-characters-v1-2026-09','neutral','A','cinnamoroll','시나모롤',1,'official_2026_top_results'),
  ('campus-characters-v1-2026-09','neutral','A','my-melody','마이멜로디',2,'official_2026_entry'),
  ('campus-characters-v1-2026-09','neutral','A','little-twin-stars','리틀트윈스타',3,'official_2026_entry'),
  ('campus-characters-v1-2026-09','neutral','B','gudetama','구데타마',1,'official_2026_entry'),
  ('campus-characters-v1-2026-09','neutral','B','kirimi-chan','키리미짱',2,'official_2026_entry'),
  ('campus-characters-v1-2026-09','neutral','B','sugarbunnies','슈가바니즈',3,'official_2026_entry'),
  ('campus-characters-v1-2026-09','neutral','C','jewelpet','주얼펫',1,'official_2026_entry'),
  ('campus-characters-v1-2026-09','neutral','C','show-by-rock','쇼바이락',2,'official_2026_entry'),
  ('campus-characters-v1-2026-09','neutral','C','noraneokoland','노라네코랜드',3,'official_2026_entry'),
  ('campus-characters-v1-2026-09','male','SS','spider-man','스파이더맨',4,'official_character_profile'),
  ('campus-characters-v1-2026-09','male','SS','batman','배트맨',5,'official_character_profile'),
  ('campus-characters-v1-2026-09','male','SS','iron-man','아이언맨',6,'official_character_profile'),
  ('campus-characters-v1-2026-09','male','A','thor','토르',4,'official_character_profile'),
  ('campus-characters-v1-2026-09','male','A','captain-america','캡틴 아메리카',5,'official_character_profile'),
  ('campus-characters-v1-2026-09','male','B','hawkeye','호크아이',4,'official_character_profile'),
  ('campus-characters-v1-2026-09','female','SS','elsa','엘사',4,'official_character_profile'),
  ('campus-characters-v1-2026-09','female','SS','rapunzel','라푼젤',5,'official_character_profile'),
  ('campus-characters-v1-2026-09','female','A','moana','모아나',4,'official_character_profile'),
  ('campus-characters-v1-2026-09','female','A','anna','안나',5,'official_character_profile'),
  ('campus-characters-v1-2026-09','female','B','black-widow','블랙 위도우',4,'official_character_profile');

create table quantum_private.daily_identity_assignments (
  user_id uuid not null references public.users(id) on delete cascade,
  local_date date not null,
  timezone text not null default 'Asia/Seoul' check (timezone = 'Asia/Seoul'),
  pool_version text not null,
  gender_pool text not null check (gender_pool in ('male','female','neutral')),
  tier text not null check (tier in ('SS','A','B','C')),
  character_key text not null,
  display_name text not null check (
    pg_catalog.char_length(pg_catalog.btrim(display_name)) between 1 and 60
    and display_name !~ '[[:cntrl:]]'
  ),
  entropy uuid not null,
  assigned_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (user_id,local_date),
  foreign key (pool_version,gender_pool,tier,character_key)
    references quantum_private.daily_identity_characters(pool_version,gender_pool,tier,character_key)
    on delete restrict
);

alter table quantum_private.daily_identity_characters enable row level security;
alter table quantum_private.daily_identity_assignments enable row level security;
revoke all on table quantum_private.daily_identity_characters from public,anon,authenticated,service_role;
revoke all on table quantum_private.daily_identity_assignments from public,anon,authenticated,service_role;

create function quantum_private.daily_identity_local_date(p_at timestamptz)
returns date
language sql
immutable
set search_path=''
as $$
  select (p_at at time zone 'Asia/Seoul')::date
$$;

create function quantum_private.daily_identity_tier(p_roll integer)
returns text
language plpgsql
immutable
set search_path=''
as $$
begin
  if p_roll is null or p_roll not between 0 and 99 then
    raise exception 'invalid_daily_identity_roll';
  end if;
  return case
    when p_roll < 5 then 'SS'
    when p_roll < 20 then 'A'
    when p_roll < 45 then 'B'
    else 'C'
  end;
end
$$;

create function quantum_private.daily_identity_gender_pool(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path=''
as $$
  select case coalesce(community.community_gender,profile.gender)
    when 'male' then 'male'
    when 'female' then 'female'
    else 'neutral'
  end
  from (select p_user_id as user_id) as requested
  left join quantum_private.community_member_profiles as community on community.user_id=requested.user_id
  left join public.profiles as profile on profile.user_id=requested.user_id
$$;

create function quantum_private.get_or_create_daily_identity(
  p_user_id uuid,
  p_at timestamptz default pg_catalog.clock_timestamp()
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  v_pool_version constant text := 'campus-characters-v1-2026-09';
  v_local_date date := quantum_private.daily_identity_local_date(p_at);
  v_gender_pool text;
  v_entropy uuid;
  v_tier text;
  v_tier_roll integer;
  v_candidate_count integer;
  v_candidate_offset integer;
  v_character quantum_private.daily_identity_characters%rowtype;
  v_assignment quantum_private.daily_identity_assignments%rowtype;
begin
  if p_user_id is null or not exists(select 1 from public.users as account where account.id=p_user_id) then
    raise exception 'daily_identity_user_required';
  end if;
  if p_at is null then raise exception 'daily_identity_time_required'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('daily-identity|'||p_user_id::text||'|'||v_local_date::text,0)
  );
  select assignment.* into v_assignment
  from quantum_private.daily_identity_assignments as assignment
  where assignment.user_id=p_user_id and assignment.local_date=v_local_date;

  if v_assignment.user_id is null then
    v_gender_pool := quantum_private.daily_identity_gender_pool(p_user_id);
    v_entropy := pg_catalog.gen_random_uuid();
    v_tier_roll := (('x'||pg_catalog.substr(pg_catalog.md5(v_entropy::text||':tier'),1,8))::bit(32)::bigint % 100)::integer;
    v_tier := quantum_private.daily_identity_tier(v_tier_roll);
    select pg_catalog.count(*)::integer into v_candidate_count
    from quantum_private.daily_identity_characters as candidate
    where candidate.pool_version=v_pool_version
      and candidate.gender_pool=v_gender_pool and candidate.tier=v_tier;
    if v_candidate_count < 2 then raise exception 'daily_identity_pool_invalid'; end if;
    v_candidate_offset := (('x'||pg_catalog.substr(pg_catalog.md5(v_entropy::text||':character'),1,8))::bit(32)::bigint % v_candidate_count)::integer;
    select candidate.* into v_character
    from quantum_private.daily_identity_characters as candidate
    where candidate.pool_version=v_pool_version
      and candidate.gender_pool=v_gender_pool and candidate.tier=v_tier
    order by candidate.selection_order
    offset v_candidate_offset limit 1;
    insert into quantum_private.daily_identity_assignments(
      user_id,local_date,timezone,pool_version,gender_pool,tier,character_key,display_name,entropy
    ) values (
      p_user_id,v_local_date,'Asia/Seoul',v_pool_version,v_gender_pool,v_tier,
      v_character.character_key,v_character.display_name,v_entropy
    ) on conflict (user_id,local_date) do nothing;
    select assignment.* into v_assignment
    from quantum_private.daily_identity_assignments as assignment
    where assignment.user_id=p_user_id and assignment.local_date=v_local_date;
  end if;

  return pg_catalog.jsonb_build_object(
    'local_date',v_assignment.local_date,
    'timezone',v_assignment.timezone,
    'pool_version',v_assignment.pool_version,
    'tier',v_assignment.tier,
    'character_key',v_assignment.character_key,
    'display_name',v_assignment.display_name,
    'odds',pg_catalog.jsonb_build_object('SS',5,'A',15,'B',25,'C',55)
  );
end
$$;

create function public.get_my_daily_identity()
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare v_actor uuid:=auth.uid();
begin
  if v_actor is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  -- Direct PostgREST/RPC callers must meet the same live-account boundary as the UI.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('account-delete|'||v_actor::text,0));
  perform 1 from auth.users as account where account.id=v_actor for share;
  if not exists(
    select 1 from auth.users as account where account.id=v_actor
      and account.deleted_at is null
      and (account.banned_until is null or account.banned_until<=pg_catalog.clock_timestamp())
  ) or quantum_private.account_deletion_blocks_access(v_actor) then
    raise exception 'daily_identity_account_unavailable' using errcode='42501';
  end if;
  return quantum_private.get_or_create_daily_identity(v_actor,pg_catalog.clock_timestamp());
end
$$;

revoke all on function quantum_private.daily_identity_local_date(timestamptz) from public,anon,authenticated,service_role;
revoke all on function quantum_private.daily_identity_tier(integer) from public,anon,authenticated,service_role;
revoke all on function quantum_private.daily_identity_gender_pool(uuid) from public,anon,authenticated,service_role;
revoke all on function quantum_private.get_or_create_daily_identity(uuid,timestamptz) from public,anon,authenticated,service_role;
revoke all on function public.get_my_daily_identity() from public,anon,authenticated,service_role;
grant execute on function public.get_my_daily_identity() to authenticated;

-- Match aliases are snapshots. A future insert receives the current server-owned
-- identity; UPDATE keeps the stored identity so old matches never rotate.
create function quantum_private.freeze_match_daily_identity()
returns trigger
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  v_identity jsonb;
  v_theme text;
  v_ordinal integer;
  v_existing public.match_member_aliases%rowtype;
begin
  if tg_op='UPDATE' then
    new.alias:=old.alias;
    new.alias_theme:=old.alias_theme;
    new.sort_order:=old.sort_order;
    return new;
  end if;
  select alias_row.* into v_existing
  from public.match_member_aliases as alias_row
  where alias_row.match_id=new.match_id and alias_row.viewer_group_id=new.viewer_group_id
    and alias_row.target_user_id=new.target_user_id;
  if v_existing.target_user_id is not null then
    new.alias:=v_existing.alias;
    new.alias_theme:=v_existing.alias_theme;
    new.sort_order:=v_existing.sort_order;
    return new;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('match-daily-identity|'||new.match_id::text||'|'||new.viewer_group_id::text,0)
  );
  v_identity:=quantum_private.get_or_create_daily_identity(new.target_user_id,pg_catalog.clock_timestamp());
  v_theme:='daily-character:'||(v_identity->>'pool_version')||':'||(v_identity->>'tier')||':'||(v_identity->>'character_key');
  select pg_catalog.count(*)::integer+1 into v_ordinal
  from public.match_member_aliases as alias_row
  where alias_row.match_id=new.match_id and alias_row.viewer_group_id=new.viewer_group_id
    and pg_catalog.regexp_replace(alias_row.alias,'·[0-9]+$','')=v_identity->>'display_name';
  new.alias:=(v_identity->>'display_name')||case when v_ordinal=1 then '' else '·'||v_ordinal::text end;
  new.alias_theme:=v_theme;
  return new;
end
$$;

create trigger trg_match_member_daily_identity
before insert or update of alias,alias_theme,sort_order on public.match_member_aliases
for each row execute function quantum_private.freeze_match_daily_identity();

revoke all on function quantum_private.freeze_match_daily_identity() from public,anon,authenticated,service_role;

-- Continuation aliases are stored once per participation and do not rotate at
-- midnight. The prior numeric aliases remain valid historical rows.
alter table public.quantum_continuation_occurrence_members
  drop constraint if exists quantum_continuation_occurrence_members_alias_check;
alter table public.quantum_continuation_occurrence_members
  add constraint quantum_continuation_occurrence_members_alias_check check (
    pg_catalog.char_length(pg_catalog.btrim(alias)) between 1 and 60
    and alias !~ '[[:cntrl:]]'
  );

create function quantum_private.freeze_continuation_daily_identity()
returns trigger
language plpgsql
volatile
security definer
set search_path=''
as $$
declare v_identity jsonb; v_ordinal integer;
begin
  if tg_op='UPDATE' then new.alias:=old.alias; return new; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('continuation-daily-identity|'||new.occurrence_id::text,0)
  );
  v_identity:=quantum_private.get_or_create_daily_identity(new.participant_user_id,pg_catalog.clock_timestamp());
  select pg_catalog.count(*)::integer+1 into v_ordinal
  from public.quantum_continuation_occurrence_members as member
  where member.occurrence_id=new.occurrence_id
    and pg_catalog.regexp_replace(member.alias,'·[0-9]+$','')=v_identity->>'display_name';
  new.alias:=(v_identity->>'display_name')||case when v_ordinal=1 then '' else '·'||v_ordinal::text end;
  return new;
end
$$;

create trigger trg_continuation_member_daily_identity
before insert or update of alias on public.quantum_continuation_occurrence_members
for each row execute function quantum_private.freeze_continuation_daily_identity();
revoke all on function quantum_private.freeze_continuation_daily_identity() from public,anon,authenticated,service_role;

-- Scheduled and automatic meetup rooms store a membership alias and copy it to
-- each message. Existing rows get a best-effort one-time snapshot because an
-- exact pre-migration historical name cannot be reconstructed.
alter table public.activity_meetup_members
  add column identity_alias_snapshot text,
  add column identity_character_key_snapshot text,
  add column identity_pool_version_snapshot text,
  add column identity_tier_snapshot text;
alter table public.activity_meetup_messages add column sender_alias_snapshot text;
alter table quantum_private.activity_room_members
  add column identity_alias_snapshot text,
  add column identity_character_key_snapshot text,
  add column identity_pool_version_snapshot text,
  add column identity_tier_snapshot text;
alter table quantum_private.activity_room_messages add column sender_alias_snapshot text;

update public.activity_meetup_members as member
set identity_alias_snapshot=coalesce(nullif(pg_catalog.btrim(community.display_name),''),nullif(pg_catalog.btrim(profile.display_name),''),'참가자'),
    identity_character_key_snapshot='legacy-'||pg_catalog.md5(member.user_id::text),
    identity_pool_version_snapshot='legacy-pre-daily',identity_tier_snapshot='C'
from public.profiles as profile
left join quantum_private.community_member_profiles as community on community.user_id=profile.user_id
where profile.user_id=member.user_id and member.identity_alias_snapshot is null;
update public.activity_meetup_members as member
set identity_alias_snapshot='참가자',identity_character_key_snapshot='legacy-'||pg_catalog.md5(member.user_id::text),
    identity_pool_version_snapshot='legacy-pre-daily',identity_tier_snapshot='C'
where member.identity_alias_snapshot is null;
update public.activity_meetup_messages as message
set sender_alias_snapshot=coalesce(member.identity_alias_snapshot,'참가자')
from public.activity_meetup_members as member
where member.meetup_id=message.meetup_id and member.user_id=message.sender_user_id
  and message.sender_alias_snapshot is null;
update public.activity_meetup_messages set sender_alias_snapshot='참가자' where sender_alias_snapshot is null;

update quantum_private.activity_room_members as member
set identity_alias_snapshot=coalesce(nullif(pg_catalog.btrim(community.display_name),''),nullif(pg_catalog.btrim(profile.display_name),''),'참가자'),
    identity_character_key_snapshot='legacy-'||pg_catalog.md5(member.user_id::text),
    identity_pool_version_snapshot='legacy-pre-daily',identity_tier_snapshot='C'
from public.profiles as profile
left join quantum_private.community_member_profiles as community on community.user_id=profile.user_id
where profile.user_id=member.user_id and member.identity_alias_snapshot is null;
update quantum_private.activity_room_members as member
set identity_alias_snapshot='참가자',identity_character_key_snapshot='legacy-'||pg_catalog.md5(member.user_id::text),
    identity_pool_version_snapshot='legacy-pre-daily',identity_tier_snapshot='C'
where member.identity_alias_snapshot is null;
update quantum_private.activity_room_messages as message
set sender_alias_snapshot=coalesce(member.identity_alias_snapshot,'참가자')
from quantum_private.activity_room_members as member
where member.room_id=message.room_id and member.user_id=message.sender_user_id
  and message.sender_alias_snapshot is null;
update quantum_private.activity_room_messages set sender_alias_snapshot='참가자' where sender_alias_snapshot is null;

alter table public.activity_meetup_members alter column identity_alias_snapshot set not null;
alter table public.activity_meetup_members alter column identity_character_key_snapshot set not null;
alter table public.activity_meetup_members alter column identity_pool_version_snapshot set not null;
alter table public.activity_meetup_members alter column identity_tier_snapshot set not null;
alter table public.activity_meetup_messages alter column sender_alias_snapshot set not null;
alter table quantum_private.activity_room_members alter column identity_alias_snapshot set not null;
alter table quantum_private.activity_room_members alter column identity_character_key_snapshot set not null;
alter table quantum_private.activity_room_members alter column identity_pool_version_snapshot set not null;
alter table quantum_private.activity_room_members alter column identity_tier_snapshot set not null;
alter table quantum_private.activity_room_messages alter column sender_alias_snapshot set not null;

create function quantum_private.freeze_meetup_member_daily_identity()
returns trigger language plpgsql volatile security definer set search_path='' as $$
declare v_identity jsonb; v_ordinal integer;
begin
  if tg_op='UPDATE' and old.identity_alias_snapshot is not null then
    new.identity_alias_snapshot:=old.identity_alias_snapshot;
    new.identity_character_key_snapshot:=old.identity_character_key_snapshot;
    new.identity_pool_version_snapshot:=old.identity_pool_version_snapshot;
    new.identity_tier_snapshot:=old.identity_tier_snapshot;
    return new;
  end if;
  if new.identity_alias_snapshot is not null then return new; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('meetup-daily-identity|'||new.meetup_id::text,0));
  v_identity:=quantum_private.get_or_create_daily_identity(new.user_id,pg_catalog.clock_timestamp());
  select pg_catalog.count(*)::integer+1 into v_ordinal from public.activity_meetup_members as member
  where member.meetup_id=new.meetup_id and member.identity_character_key_snapshot=v_identity->>'character_key';
  new.identity_alias_snapshot:=(v_identity->>'display_name')||case when v_ordinal=1 then '' else '·'||v_ordinal::text end;
  new.identity_character_key_snapshot:=v_identity->>'character_key';
  new.identity_pool_version_snapshot:=v_identity->>'pool_version';
  new.identity_tier_snapshot:=v_identity->>'tier';
  return new;
end
$$;

create function quantum_private.freeze_activity_room_member_daily_identity()
returns trigger language plpgsql volatile security definer set search_path='' as $$
declare v_identity jsonb; v_ordinal integer;
begin
  if tg_op='UPDATE' and old.identity_alias_snapshot is not null then
    new.identity_alias_snapshot:=old.identity_alias_snapshot;
    new.identity_character_key_snapshot:=old.identity_character_key_snapshot;
    new.identity_pool_version_snapshot:=old.identity_pool_version_snapshot;
    new.identity_tier_snapshot:=old.identity_tier_snapshot;
    return new;
  end if;
  if new.identity_alias_snapshot is not null then return new; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('activity-room-daily-identity|'||new.room_id::text,0));
  v_identity:=quantum_private.get_or_create_daily_identity(new.user_id,pg_catalog.clock_timestamp());
  select pg_catalog.count(*)::integer+1 into v_ordinal from quantum_private.activity_room_members as member
  where member.room_id=new.room_id and member.identity_character_key_snapshot=v_identity->>'character_key';
  new.identity_alias_snapshot:=(v_identity->>'display_name')||case when v_ordinal=1 then '' else '·'||v_ordinal::text end;
  new.identity_character_key_snapshot:=v_identity->>'character_key';
  new.identity_pool_version_snapshot:=v_identity->>'pool_version';
  new.identity_tier_snapshot:=v_identity->>'tier';
  return new;
end
$$;

create function quantum_private.freeze_meetup_message_alias()
returns trigger language plpgsql volatile security definer set search_path='' as $$
begin
  select member.identity_alias_snapshot into new.sender_alias_snapshot
  from public.activity_meetup_members as member
  where member.meetup_id=new.meetup_id and member.user_id=new.sender_user_id;
  if new.sender_alias_snapshot is null then raise exception 'activity_identity_membership_required'; end if;
  return new;
end
$$;

create function quantum_private.freeze_activity_room_message_alias()
returns trigger language plpgsql volatile security definer set search_path='' as $$
begin
  select member.identity_alias_snapshot into new.sender_alias_snapshot
  from quantum_private.activity_room_members as member
  where member.room_id=new.room_id and member.user_id=new.sender_user_id;
  if new.sender_alias_snapshot is null then raise exception 'activity_room_identity_membership_required'; end if;
  return new;
end
$$;

create trigger trg_meetup_member_daily_identity
before insert or update on public.activity_meetup_members
for each row execute function quantum_private.freeze_meetup_member_daily_identity();
create trigger trg_activity_room_member_daily_identity
before insert or update on quantum_private.activity_room_members
for each row execute function quantum_private.freeze_activity_room_member_daily_identity();
create trigger trg_meetup_message_alias_snapshot
before insert on public.activity_meetup_messages
for each row execute function quantum_private.freeze_meetup_message_alias();
create trigger trg_activity_room_message_alias_snapshot
before insert on quantum_private.activity_room_messages
for each row execute function quantum_private.freeze_activity_room_message_alias();

revoke all on function quantum_private.freeze_meetup_member_daily_identity() from public,anon,authenticated,service_role;
revoke all on function quantum_private.freeze_activity_room_member_daily_identity() from public,anon,authenticated,service_role;
revoke all on function quantum_private.freeze_meetup_message_alias() from public,anon,authenticated,service_role;
revoke all on function quantum_private.freeze_activity_room_message_alias() from public,anon,authenticated,service_role;

create or replace function public.get_my_activity_meetup_chat(p_meetup_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_meetup public.activity_meetups%rowtype;
  v_joined boolean;
  v_phase text;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  select meetup.* into v_meetup from public.activity_meetups as meetup where meetup.id=p_meetup_id;
  select exists(
    select 1 from public.activity_meetup_members as member
    where member.meetup_id=p_meetup_id and member.user_id=v_actor and member.status='joined'
  ) into v_joined;
  if v_meetup.id is null or not v_joined or not quantum_private.activity_meetup_scope_eligible(p_meetup_id,v_actor) then
    raise exception 'meetup_not_found';
  end if;
  v_phase:=case when v_meetup.status in ('open','full') then 'send' else 'read_only' end;
  return pg_catalog.jsonb_build_object(
    'phase',v_phase,
    'messages',(
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',message.id,'sender_alias',message.sender_alias_snapshot,
        'message',message.message,'created_at',message.created_at
      ) order by message.created_at,message.id),'[]'::jsonb)
      from public.activity_meetup_messages as message
      where message.meetup_id=p_meetup_id
        and not exists(
          select 1 from public.friendships as friendship
          where friendship.status='blocked'
            and ((friendship.user_id=v_actor and friendship.friend_user_id=message.sender_user_id)
              or (friendship.user_id=message.sender_user_id and friendship.friend_user_id=v_actor))
        )
    )
  );
end
$$;

create or replace function public.send_my_activity_meetup_chat_message(
  p_meetup_id uuid,p_message text,p_idempotency_key uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_meetup public.activity_meetups%rowtype;
  v_message public.activity_meetup_messages%rowtype;
  v_text text:=pg_catalog.btrim(p_message);
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_idempotency_key is null or v_text is null or pg_catalog.char_length(v_text) not between 1 and 1000 then
    raise exception 'invalid_chat_message';
  end if;
  if v_text ~* '(https?://|www[.]|[[:alnum:]_.%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,}|instagram|insta[[:space:]_-]*gram|인스타|카카오|카톡|telegram|텔레그램|discord|디스코드)'
     or pg_catalog.regexp_replace(v_text,'[^0-9]','','g') ~ '01[016789][0-9]{7,8}' then
    raise exception 'contact_sharing_not_allowed';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'activity-meetup-chat:'||v_actor::text||':'||p_idempotency_key::text,0
  ));
  select message.* into v_message
  from public.activity_meetup_messages as message
  where message.meetup_id=p_meetup_id and message.sender_user_id=v_actor
    and message.idempotency_key=p_idempotency_key
  for update;
  if v_message.id is not null then
    if v_message.message<>v_text then raise exception 'idempotency_key_reused'; end if;
    return pg_catalog.jsonb_build_object(
      'id',v_message.id,'sender_alias',v_message.sender_alias_snapshot,
      'message',v_message.message,'created_at',v_message.created_at,'phase','send','reused',true
    );
  end if;
  select meetup.* into v_meetup from public.activity_meetups as meetup where meetup.id=p_meetup_id;
  if v_meetup.id is null or v_meetup.status not in ('open','full')
     or not quantum_private.activity_meetup_scope_eligible(p_meetup_id,v_actor)
     or not exists(
       select 1 from public.activity_meetup_members as member
       where member.meetup_id=p_meetup_id and member.user_id=v_actor and member.status='joined'
     ) then raise exception 'meetup_chat_not_writable'; end if;
  insert into public.activity_meetup_messages(meetup_id,sender_user_id,idempotency_key,message)
  values(p_meetup_id,v_actor,p_idempotency_key,v_text)
  returning * into v_message;
  return pg_catalog.jsonb_build_object(
    'id',v_message.id,'sender_alias',v_message.sender_alias_snapshot,
    'message',v_message.message,'created_at',v_message.created_at,'phase','send','reused',false
  );
end
$$;

create or replace function public.get_my_activity_meetup_detail(p_meetup_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_meetup public.activity_meetups%rowtype;
  v_joined boolean;
  v_scope_eligible boolean;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  select meetup.* into v_meetup from public.activity_meetups as meetup where meetup.id=p_meetup_id;
  v_scope_eligible:=quantum_private.activity_meetup_scope_eligible(p_meetup_id,v_actor);
  if v_meetup.id is null or (not v_scope_eligible and v_meetup.host_user_id<>v_actor) then raise exception 'meetup_not_found'; end if;
  select exists(select 1 from public.activity_meetup_members as member where member.meetup_id=p_meetup_id and member.user_id=v_actor and member.status='joined') into v_joined;
  return pg_catalog.jsonb_build_object(
    'id',v_meetup.id,'category',v_meetup.category,'activity_key',v_meetup.activity_key,
    'title',v_meetup.title,'description',v_meetup.description,'place_name',v_meetup.place_name,
    'scheduled_at',v_meetup.scheduled_at,'ends_at',v_meetup.ends_at,'capacity',v_meetup.capacity,
    'status',v_meetup.status,'gender_mode',v_meetup.gender_mode,'scope_type',v_meetup.scope_type,
    'department_label',v_meetup.department_label,'revision',v_meetup.revision,'joined',v_joined,
    'is_host',v_meetup.host_user_id=v_actor,
    'scope_eligibility',case when v_scope_eligible then 'eligible' else 'department_restricted' end,
    'member_count',(select pg_catalog.count(*) from public.activity_meetup_members as member where member.meetup_id=p_meetup_id and member.status='joined' and quantum_private.activity_meetup_scope_eligible(p_meetup_id,member.user_id)),
    'members',case when v_joined or v_meetup.host_user_id=v_actor then (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'alias',member.identity_alias_snapshot,'role',member.role
      ) order by member.joined_at,member.user_id),'[]'::jsonb)
      from public.activity_meetup_members as member
      where member.meetup_id=p_meetup_id and member.status='joined'
        and quantum_private.activity_meetup_scope_eligible(p_meetup_id,member.user_id)
    ) else '[]'::jsonb end,
    'events',case when v_joined or v_meetup.host_user_id=v_actor then (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'action',event.action,'created_at',event.created_at,'resulting_revision',event.resulting_revision,
        'public_payload',event.public_payload
      ) order by event.created_at,event.id),'[]'::jsonb)
      from public.activity_meetup_events as event where event.meetup_id=p_meetup_id
    ) else '[]'::jsonb end
  );
end
$$;

create or replace function public.get_activity_room(p_room_id uuid)
returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_school_scope text;
  v_room quantum_private.activity_room_rooms%rowtype;
  v_pool quantum_private.activity_room_pools%rowtype;
  v_count integer;
begin
  select identity.school_scope into v_school_scope
    from quantum_private.assert_activity_room_access(v_actor) identity;
  select room.* into v_room from quantum_private.activity_room_rooms room where room.id=p_room_id;
  if v_room.id is null or v_room.status='retired' then raise exception 'activity_room_not_found'; end if;
  select pool.* into v_pool from quantum_private.activity_room_pools pool where pool.id=v_room.pool_id;
  if v_pool.status<>'active' or v_pool.school_scope<>v_school_scope then raise exception 'activity_room_not_found'; end if;
  if not exists(
    select 1 from quantum_private.activity_room_members member
    where member.room_id=p_room_id and member.user_id=v_actor and member.status='joined'
      and quantum_private.activity_room_member_current(v_pool.id,v_actor)
  ) then raise exception 'activity_room_membership_required'; end if;
  if exists(
    select 1 from quantum_private.activity_room_members member
    where member.room_id=p_room_id and member.status='joined'
      and quantum_private.activity_room_member_current(v_pool.id,member.user_id)
      and quantum_private.tonight_invite_pair_is_blocked(v_actor,member.user_id)
  ) then raise exception 'blocked_pair'; end if;
  select pg_catalog.count(*)::integer into v_count
  from quantum_private.activity_room_members member
  where member.room_id=p_room_id and member.status='joined'
    and quantum_private.activity_room_member_current(v_pool.id,member.user_id);
  return pg_catalog.jsonb_build_object(
    'id',v_room.id,'room_number',v_room.room_number,'member_count',v_count,'capacity',v_pool.capacity,
    'joined',true,'status',case when v_count>=v_pool.capacity then 'full' else 'recruiting' end,
    'joinable',false,'activity_key',v_pool.activity_key,'gender_mode',v_pool.gender_mode,
    'members',(
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'alias',member.identity_alias_snapshot,'is_me',member.user_id=v_actor
      ) order by member.joined_at,member.user_id),'[]'::jsonb)
      from quantum_private.activity_room_members member
      where member.room_id=p_room_id and member.status='joined'
        and quantum_private.activity_room_member_current(v_pool.id,member.user_id)
    ),
    'messages',(
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',message.id,'sender_alias',message.sender_alias_snapshot,'message',message.message,
        'created_at',message.created_at,'is_me',message.sender_user_id=v_actor
      ) order by message.created_at,message.id),'[]'::jsonb)
      from (
        select recent.* from quantum_private.activity_room_messages recent
        where recent.room_id=p_room_id
          and quantum_private.activity_room_member_current(v_pool.id,recent.sender_user_id)
        order by recent.created_at desc,recent.id desc limit 100
      ) message
    )
  );
end
$$;

create or replace function public.send_activity_room_message(
  p_room_id uuid,p_message text,p_idempotency_key uuid
)
returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_school_scope text;
  v_text text:=pg_catalog.btrim(p_message);
  v_room quantum_private.activity_room_rooms%rowtype;
  v_pool quantum_private.activity_room_pools%rowtype;
  v_message quantum_private.activity_room_messages%rowtype;
begin
  if v_actor is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('quantum:minimum-signup:user:'||v_actor::text,0));
  select identity.school_scope into v_school_scope from quantum_private.assert_activity_room_access(v_actor) identity;
  if p_idempotency_key is null or v_text is null or pg_catalog.char_length(v_text) not between 1 and 1000 then raise exception 'invalid_activity_room_message'; end if;
  if v_text ~* '(https?://|www[.]|[[:alnum:]_.%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,}|instagram|insta[[:space:]_-]*gram|인스타|카카오|카톡|telegram|텔레그램|discord|디스코드)'
     or pg_catalog.regexp_replace(v_text,'[^0-9]','','g') ~ '01[016789][0-9]{7,8}' then raise exception 'contact_sharing_not_allowed'; end if;
  select room.* into v_room from quantum_private.activity_room_rooms room where room.id=p_room_id;
  if v_room.id is null or v_room.status='retired' then raise exception 'activity_room_not_found'; end if;
  select pool.* into v_pool from quantum_private.activity_room_pools pool where pool.id=v_room.pool_id;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('activity-room-pool|'||v_pool.school_scope||'|'||v_pool.activity_key||'|'||v_pool.gender_mode,0));
  select pool.* into v_pool from quantum_private.activity_room_pools pool where pool.id=v_pool.id for update;
  select room.* into v_room from quantum_private.activity_room_rooms room where room.id=p_room_id for update;
  if v_pool.status<>'active' or v_pool.school_scope<>v_school_scope or v_room.status='retired' then raise exception 'activity_room_not_found'; end if;
  if not exists(
    select 1 from quantum_private.activity_room_members member
    where member.room_id=p_room_id and member.user_id=v_actor and member.status='joined'
      and quantum_private.activity_room_member_current(v_pool.id,v_actor)
  ) then raise exception 'activity_room_membership_required'; end if;
  if exists(
    select 1 from quantum_private.activity_room_members member
    where member.room_id=p_room_id and member.status='joined'
      and quantum_private.activity_room_member_current(v_pool.id,member.user_id)
      and quantum_private.tonight_invite_pair_is_blocked(v_actor,member.user_id)
  ) then raise exception 'blocked_pair'; end if;
  select message.* into v_message from quantum_private.activity_room_messages message
  where message.room_id=p_room_id and message.sender_user_id=v_actor and message.idempotency_key=p_idempotency_key
  for update;
  if v_message.id is not null then
    if v_message.message<>v_text then raise exception 'idempotency_key_reused'; end if;
    return pg_catalog.jsonb_build_object(
      'id',v_message.id,'sender_alias',v_message.sender_alias_snapshot,'message',v_message.message,
      'created_at',v_message.created_at,'is_me',true,'reused',true
    );
  end if;
  if (select pg_catalog.count(*) from quantum_private.activity_room_messages recent
      where recent.sender_user_id=v_actor and recent.created_at>=pg_catalog.clock_timestamp()-interval '1 minute')>=30 then
    raise exception 'activity_room_rate_limited';
  end if;
  insert into quantum_private.activity_room_messages(room_id,sender_user_id,idempotency_key,message)
  values(p_room_id,v_actor,p_idempotency_key,v_text) returning * into v_message;
  return pg_catalog.jsonb_build_object(
    'id',v_message.id,'sender_alias',v_message.sender_alias_snapshot,'message',v_message.message,
    'created_at',v_message.created_at,'is_me',true,'reused',false
  );
end
$$;

create or replace function public.get_activity_room_messages(
  p_room_id uuid,p_before_created_at timestamptz default null,p_before_message_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_pool_id uuid;
  v_messages jsonb;
  v_has_more boolean;
  v_next_cursor jsonb;
begin
  perform public.get_activity_room(p_room_id);
  if (p_before_created_at is null)<>(p_before_message_id is null) then raise exception 'invalid_activity_room_cursor'; end if;
  select room.pool_id into v_pool_id from quantum_private.activity_room_rooms room where room.id=p_room_id;
  if p_before_created_at is not null and not exists(
    select 1 from quantum_private.activity_room_messages message
    where message.room_id=p_room_id and message.id=p_before_message_id and message.created_at=p_before_created_at
  ) then raise exception 'invalid_activity_room_cursor'; end if;
  with page as (
    select message.* from quantum_private.activity_room_messages message
    where message.room_id=p_room_id
      and quantum_private.activity_room_member_current(v_pool_id,message.sender_user_id)
      and (p_before_created_at is null or (message.created_at,message.id)<(p_before_created_at,p_before_message_id))
    order by message.created_at desc,message.id desc limit 101
  ), selected as (
    select page.* from page order by page.created_at desc,page.id desc limit 100
  )
  select
    coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id',selected.id,'sender_alias',selected.sender_alias_snapshot,'message',selected.message,
      'created_at',selected.created_at,'is_me',selected.sender_user_id=v_actor
    ) order by selected.created_at,selected.id),'[]'::jsonb),
    (select pg_catalog.count(*)>100 from page),
    case when (select pg_catalog.count(*)>100 from page) then (
      select pg_catalog.jsonb_build_object('created_at',oldest.created_at,'id',oldest.id)
      from selected oldest order by oldest.created_at,oldest.id limit 1
    ) else null end
  into v_messages,v_has_more,v_next_cursor from selected;
  return pg_catalog.jsonb_build_object(
    'room_id',p_room_id,'messages',v_messages,'has_more',v_has_more,'next_cursor',v_next_cursor
  );
end
$$;

revoke all on function public.get_my_activity_meetup_chat(uuid) from public,anon,authenticated,service_role;
revoke all on function public.send_my_activity_meetup_chat_message(uuid,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.get_my_activity_meetup_detail(uuid) from public,anon,authenticated,service_role;
revoke all on function public.get_activity_room(uuid) from public,anon,authenticated,service_role;
revoke all on function public.send_activity_room_message(uuid,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.get_activity_room_messages(uuid,timestamptz,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_my_activity_meetup_chat(uuid) to authenticated;
grant execute on function public.send_my_activity_meetup_chat_message(uuid,text,uuid) to authenticated;
grant execute on function public.get_my_activity_meetup_detail(uuid) to authenticated;
grant execute on function public.get_activity_room(uuid) to authenticated;
grant execute on function public.send_activity_room_message(uuid,text,uuid) to authenticated;
grant execute on function public.get_activity_room_messages(uuid,timestamptz,uuid) to authenticated;

comment on table quantum_private.daily_identity_characters is
  'Immutable candidate pool campus-characters-v1-2026-09. Official 2026 ranking results support only explicitly tagged top-result rows; entry status alone is not a popularity claim.';
comment on table quantum_private.daily_identity_assignments is
  'One server-owned identity per user per Asia/Seoul day. Private gender bucket and entropy are never returned by the public self RPC.';
comment on function public.get_my_daily_identity() is
  'Returns the authenticated caller daily identity and disclosed SS 5/A 15/B 25/C 55 odds. No paid reroll or matching benefit.';

commit;

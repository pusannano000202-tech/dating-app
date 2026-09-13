begin;

create table quantum_private.place_worldcup_candidates (
  id uuid primary key default gen_random_uuid(),
  candidate_key text not null unique,
  category text not null check (category in ('pc', 'gym', 'boardgame')),
  place_name text not null check (char_length(place_name) between 1 and 80),
  address text not null check (char_length(address) between 1 and 200),
  map_query text not null check (char_length(map_query) between 1 and 120),
  source_url text not null check (char_length(source_url) between 9 and 500),
  status text not null default 'research_draft'
    check (status in ('research_draft', 'approved', 'rejected')),
  verified_at timestamptz,
  review_due_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (
    (status = 'approved' and verified_at is not null and review_due_at > verified_at)
    or (status <> 'approved')
  )
);

create table quantum_private.place_worldcup_suggestions (
  id uuid primary key default gen_random_uuid(),
  proposer_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('new', 'correction')),
  category text not null check (category in ('pc', 'gym', 'boardgame')),
  target_candidate_id uuid references quantum_private.place_worldcup_candidates(id) on delete restrict,
  target_candidate_revision integer check (target_candidate_revision > 0),
  proposed_name text not null check (char_length(proposed_name) between 1 and 80),
  proposed_address text not null check (char_length(proposed_address) between 1 and 200),
  proposed_source_url text not null check (char_length(proposed_source_url) between 9 and 500),
  note text not null default '' check (char_length(note) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  revision integer not null default 1 check (revision > 0),
  idempotency_key uuid not null,
  request_payload jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (proposer_id, idempotency_key),
  check (
    (kind = 'new' and target_candidate_id is null and target_candidate_revision is null)
    or (kind = 'correction' and target_candidate_id is not null and target_candidate_revision is not null)
  ),
  check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (status <> 'pending' and reviewed_at is not null)
  )
);

create table quantum_private.place_worldcup_review_events (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid references auth.users(id) on delete set null,
  idempotency_key uuid not null,
  request_payload jsonb not null,
  response_payload jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (operator_id, idempotency_key)
);

alter table quantum_private.place_worldcup_candidates enable row level security;
alter table quantum_private.place_worldcup_suggestions enable row level security;
alter table quantum_private.place_worldcup_review_events enable row level security;

revoke all on table quantum_private.place_worldcup_candidates from public, anon, authenticated;
revoke all on table quantum_private.place_worldcup_suggestions from public, anon, authenticated;
revoke all on table quantum_private.place_worldcup_review_events from public, anon, authenticated;

insert into quantum_private.place_worldcup_candidates (
  candidate_key, category, place_name, address, map_query, source_url, status
) values
  (
    'redbutton-busan-university',
    'boardgame',
    '레드버튼 부산대점',
    '부산 금정구 금정로 75 3층',
    '부산대 레드버튼',
    'https://redbutton.co.kr/store/%EB%A7%A4%EC%9E%A5%EC%B0%BE%EA%B8%B0/',
    'research_draft'
  ),
  (
    'hero-busan-university',
    'boardgame',
    '히어로 보드게임카페 부산대점',
    '부산 금정구 부산대학로 29 네오스퀘어 4층 401호',
    '부산대 히어로 보드게임카페',
    'https://funhero.co.kr/store/location.php',
    'research_draft'
  );

create or replace function quantum_private.place_worldcup_actor()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null
     or not exists (
       select 1
       from auth.users account
       where account.id = v_actor
         and account.deleted_at is null
         and (account.banned_until is null or account.banned_until <= clock_timestamp())
     )
     or quantum_private.account_deletion_blocks_access(v_actor) then
    raise exception 'account_unavailable' using errcode = '42501';
  end if;

  return v_actor;
end;
$$;

create or replace function quantum_private.place_worldcup_operator()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := quantum_private.place_worldcup_actor();
begin
  if coalesce(auth.jwt()->>'aal', '') <> 'aal2' then
    raise exception 'mfa_required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.admins operator
    where operator.user_id = v_actor
      and operator.role in ('admin', 'super_admin')
  ) then
    raise exception 'operator_required' using errcode = '42501';
  end if;

  return v_actor;
end;
$$;

create or replace function public.get_place_worldcup_catalog(p_category text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := quantum_private.place_worldcup_actor();
  v_fresh_count integer;
  v_has_stale boolean;
  v_has_review boolean;
  v_revision text;
  v_candidates jsonb;
begin
  if p_category not in ('pc', 'gym', 'boardgame') then
    raise exception 'invalid_category' using errcode = '22023';
  end if;

  with selected_candidates as (
    select candidate.*
    from quantum_private.place_worldcup_candidates candidate
    where candidate.category = p_category
      and candidate.status = 'approved'
      and candidate.review_due_at > clock_timestamp()
    order by candidate.verified_at desc, candidate.id asc
    limit 64
  )
  select count(*)::integer,
         coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id', candidate.id,
               'name', candidate.place_name,
               'address', candidate.address,
               'map_query', candidate.map_query,
               'verified_at', candidate.verified_at,
               'review_due_at', candidate.review_due_at
             ) order by candidate.place_name, candidate.id
           ),
           '[]'::jsonb
         ),
         md5(coalesce(string_agg(candidate.id::text || ':' || candidate.revision::text, ',' order by candidate.id), ''))
    into v_fresh_count, v_candidates, v_revision
  from selected_candidates candidate;

  if v_fresh_count >= 2 then
    return jsonb_build_object(
      'category', p_category,
      'state', 'ready',
      'required_minimum', 2,
      'catalog_revision', v_revision,
      'candidate_count', v_fresh_count,
      'candidates', v_candidates
    );
  end if;

  select exists (
           select 1
           from quantum_private.place_worldcup_candidates candidate
           where candidate.category = p_category
             and candidate.status = 'approved'
             and candidate.review_due_at <= clock_timestamp()
         ),
         exists (
           select 1
           from quantum_private.place_worldcup_candidates candidate
           where candidate.category = p_category
             and candidate.status = 'research_draft'
         ) or exists (
           select 1
           from quantum_private.place_worldcup_suggestions suggestion
           where suggestion.category = p_category
             and suggestion.status = 'pending'
         )
    into v_has_stale, v_has_review;

  return jsonb_build_object(
    'category', p_category,
    'state', case
      when v_has_stale then 'stale'
      when v_has_review then 'under_review'
      else 'insufficient'
    end,
    'required_minimum', 2,
    'catalog_revision', 'none',
    'candidate_count', 0,
    'candidates', '[]'::jsonb
  );
end;
$$;

create or replace function public.submit_place_worldcup_suggestion(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := quantum_private.place_worldcup_actor();
  v_kind text;
  v_category text;
  v_target uuid;
  v_name text;
  v_address text;
  v_source_url text;
  v_note text;
  v_key uuid;
  v_target_revision integer;
  v_normalized jsonb;
  v_existing quantum_private.place_worldcup_suggestions%rowtype;
  v_inserted quantum_private.place_worldcup_suggestions%rowtype;
begin
  if jsonb_typeof(p_payload) <> 'object'
     or (select count(*) from jsonb_object_keys(p_payload)) <> 8
     or not p_payload ?& array[
       'kind', 'category', 'target_candidate_id', 'place_name', 'address',
       'source_url', 'note', 'idempotency_key'
     ] then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;

  begin
    v_kind := p_payload->>'kind';
    v_category := p_payload->>'category';
    v_target := nullif(p_payload->>'target_candidate_id', '')::uuid;
    v_name := btrim(p_payload->>'place_name');
    v_address := btrim(p_payload->>'address');
    v_source_url := btrim(p_payload->>'source_url');
    v_note := btrim(coalesce(p_payload->>'note', ''));
    v_key := (p_payload->>'idempotency_key')::uuid;
  exception when others then
    raise exception 'invalid_payload' using errcode = '22023';
  end;

  if v_kind not in ('new', 'correction')
     or v_category not in ('pc', 'gym', 'boardgame')
     or char_length(v_name) not between 1 and 80
     or char_length(v_address) not between 1 and 200
     or char_length(v_note) > 500
     or v_source_url !~* '^https://[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::[0-9]{1,5})?(?:[/#?]|$)'
     or split_part(split_part(v_source_url, '://', 2), '/', 1) like '%@%'
     or split_part(split_part(v_source_url, '://', 2), '/', 1) ~* '^(localhost|\[|[0-9]{1,3}(\.|:)|.*\.local(?::[0-9]+)?)$'
     or char_length(v_source_url) > 500
     or (v_kind = 'new' and v_target is not null)
     or (v_kind = 'correction' and v_target is null) then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;

  v_normalized := jsonb_build_object(
    'kind', v_kind,
    'category', v_category,
    'target_candidate_id', v_target,
    'place_name', v_name,
    'address', v_address,
    'source_url', v_source_url,
    'note', v_note,
    'idempotency_key', v_key
  );

  perform pg_advisory_xact_lock(hashtextextended('place-worldcup:submit:' || v_actor::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text || ':' || v_key::text, 0));

  select * into v_existing
  from quantum_private.place_worldcup_suggestions suggestion
  where suggestion.proposer_id = v_actor
    and suggestion.idempotency_key = v_key;

  if found then
    if v_existing.request_payload <> v_normalized then
      raise exception 'idempotency_conflict' using errcode = '22023';
    end if;
    return jsonb_build_object('id', v_existing.id, 'status', v_existing.status, 'revision', v_existing.revision);
  end if;

  if v_kind = 'correction' then
    select candidate.revision into v_target_revision
    from quantum_private.place_worldcup_candidates candidate
    where candidate.id = v_target
      and candidate.category = v_category
      and candidate.status = 'approved'
    for share;
    if not found then
      raise exception 'invalid_target' using errcode = '22023';
    end if;
  end if;

  if (
    select count(*)
    from quantum_private.place_worldcup_suggestions suggestion
    where suggestion.proposer_id = v_actor
      and suggestion.created_at >= clock_timestamp() - interval '1 day'
  ) >= 20 then
    raise exception 'rate_limited' using errcode = '22023';
  end if;

  insert into quantum_private.place_worldcup_suggestions (
    proposer_id, kind, category, target_candidate_id, target_candidate_revision, proposed_name,
    proposed_address, proposed_source_url, note, idempotency_key, request_payload
  ) values (
    v_actor, v_kind, v_category, v_target, v_target_revision, v_name,
    v_address, v_source_url, v_note, v_key, v_normalized
  ) returning * into v_inserted;

  return jsonb_build_object('id', v_inserted.id, 'status', v_inserted.status, 'revision', v_inserted.revision);
end;
$$;

create or replace function public.operator_list_place_worldcup_queue()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_operator uuid := quantum_private.place_worldcup_operator();
  v_items jsonb;
begin
  select coalesce(jsonb_agg(queue.item order by queue.created_at, queue.id, queue.entity_kind), '[]'::jsonb)
    into v_items
  from (
    select jsonb_build_object(
      'entity_kind', 'candidate',
      'id', candidate.id,
      'kind', 'new',
      'category', candidate.category,
      'target_candidate_id', null,
      'target_candidate_revision', null,
      'name', candidate.place_name,
      'address', candidate.address,
      'source_url', candidate.source_url,
      'note', '공식 매장 목록 조사 초안. 현재 운영 여부를 검수해야 합니다.',
      'revision', candidate.revision,
      'created_at', candidate.created_at
    ) item,
      candidate.created_at,
      candidate.id,
      'candidate'::text entity_kind
    from quantum_private.place_worldcup_candidates candidate
    where candidate.status = 'research_draft'
    union all
    select jsonb_build_object(
      'entity_kind', 'suggestion',
      'id', suggestion.id,
      'kind', suggestion.kind,
      'category', suggestion.category,
      'target_candidate_id', suggestion.target_candidate_id,
      'target_candidate_revision', suggestion.target_candidate_revision,
      'name', suggestion.proposed_name,
      'address', suggestion.proposed_address,
      'source_url', suggestion.proposed_source_url,
      'note', suggestion.note,
      'revision', suggestion.revision,
      'created_at', suggestion.created_at
    ) item,
      suggestion.created_at,
      suggestion.id,
      'suggestion'::text entity_kind
    from quantum_private.place_worldcup_suggestions suggestion
    where suggestion.status = 'pending'
    order by created_at asc, id asc, entity_kind asc
    limit 500
  ) queue;

  return jsonb_build_object('items', v_items);
end;
$$;

create or replace function public.operator_review_place_worldcup(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_operator uuid := quantum_private.place_worldcup_operator();
  v_entity_kind text;
  v_entity_id uuid;
  v_decision text;
  v_expected_revision integer;
  v_idempotency_key uuid;
  v_candidate quantum_private.place_worldcup_candidates%rowtype;
  v_suggestion quantum_private.place_worldcup_suggestions%rowtype;
  v_new_candidate_id uuid;
  v_normalized jsonb;
  v_existing_request jsonb;
  v_existing_response jsonb;
  v_response jsonb;
begin
  if jsonb_typeof(p_payload) <> 'object'
     or (select count(*) from jsonb_object_keys(p_payload)) <> 5
     or not p_payload ?& array[
       'entity_kind', 'entity_id', 'decision', 'expected_revision', 'idempotency_key'
     ] then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;

  begin
    v_entity_kind := p_payload->>'entity_kind';
    v_entity_id := (p_payload->>'entity_id')::uuid;
    v_decision := p_payload->>'decision';
    v_expected_revision := (p_payload->>'expected_revision')::integer;
    v_idempotency_key := (p_payload->>'idempotency_key')::uuid;
  exception when others then
    raise exception 'invalid_payload' using errcode = '22023';
  end;

  if v_entity_kind not in ('candidate', 'suggestion')
     or v_decision not in ('approve', 'reject')
     or v_expected_revision < 1 then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;

  v_normalized := jsonb_build_object(
    'entity_kind', v_entity_kind,
    'entity_id', v_entity_id,
    'decision', v_decision,
    'expected_revision', v_expected_revision,
    'idempotency_key', v_idempotency_key
  );

  perform pg_advisory_xact_lock(hashtextextended(v_operator::text || ':' || v_idempotency_key::text, 0));
  select event.request_payload, event.response_payload
    into v_existing_request, v_existing_response
  from quantum_private.place_worldcup_review_events event
  where event.operator_id = v_operator
    and event.idempotency_key = v_idempotency_key;
  if found then
    if v_existing_request <> v_normalized then
      raise exception 'idempotency_conflict' using errcode = '22023';
    end if;
    return v_existing_response;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_entity_kind || ':' || v_entity_id::text, 0));

  if v_entity_kind = 'candidate' then
    select * into v_candidate
    from quantum_private.place_worldcup_candidates candidate
    where candidate.id = v_entity_id
      and candidate.status = 'research_draft';
    if not found then
      raise exception 'review_target_unavailable' using errcode = '22023';
    end if;
    if v_candidate.revision <> v_expected_revision then
      raise exception 'revision_conflict' using errcode = '40001';
    end if;

    update quantum_private.place_worldcup_candidates
    set status = case when v_decision = 'approve' then 'approved' else 'rejected' end,
        verified_at = case when v_decision = 'approve' then clock_timestamp() else null end,
        review_due_at = case when v_decision = 'approve' then clock_timestamp() + interval '90 days' else null end,
        reviewed_by = v_operator,
        revision = revision + 1,
        updated_at = clock_timestamp()
    where id = v_entity_id
    returning * into v_candidate;

    v_response := jsonb_build_object('entity_kind', 'candidate', 'id', v_candidate.id, 'status', v_candidate.status, 'revision', v_candidate.revision);
    insert into quantum_private.place_worldcup_review_events (
      operator_id, idempotency_key, request_payload, response_payload
    ) values (v_operator, v_idempotency_key, v_normalized, v_response);
    return v_response;
  end if;

  select * into v_suggestion
  from quantum_private.place_worldcup_suggestions suggestion
  where suggestion.id = v_entity_id
    and suggestion.status = 'pending';
  if not found then
    raise exception 'review_target_unavailable' using errcode = '22023';
  end if;
  if v_suggestion.revision <> v_expected_revision then
    raise exception 'revision_conflict' using errcode = '40001';
  end if;

  if v_decision = 'approve' and v_suggestion.kind = 'new' then
    insert into quantum_private.place_worldcup_candidates (
      candidate_key, category, place_name, address, map_query, source_url, status,
      verified_at, review_due_at, reviewed_by
    ) values (
      'suggested-' || v_suggestion.id::text,
      v_suggestion.category,
      v_suggestion.proposed_name,
      v_suggestion.proposed_address,
      v_suggestion.proposed_name,
      v_suggestion.proposed_source_url,
      'approved',
      clock_timestamp(),
      clock_timestamp() + interval '90 days',
      v_operator
    ) returning id into v_new_candidate_id;
  elsif v_decision = 'approve' then
    select * into v_candidate
    from quantum_private.place_worldcup_candidates candidate
    where candidate.id = v_suggestion.target_candidate_id
    for update;
    if not found
       or v_candidate.status <> 'approved'
       or v_candidate.revision <> v_suggestion.target_candidate_revision then
      raise exception 'target_revision_conflict' using errcode = '40001';
    end if;

    update quantum_private.place_worldcup_candidates
    set place_name = v_suggestion.proposed_name,
        address = v_suggestion.proposed_address,
        map_query = v_suggestion.proposed_name,
        source_url = v_suggestion.proposed_source_url,
        status = 'approved',
        verified_at = clock_timestamp(),
        review_due_at = clock_timestamp() + interval '90 days',
        reviewed_by = v_operator,
        revision = revision + 1,
        updated_at = clock_timestamp()
    where id = v_suggestion.target_candidate_id
      and status = 'approved'
      and revision = v_suggestion.target_candidate_revision
    returning id into v_new_candidate_id;
  end if;

  update quantum_private.place_worldcup_suggestions
  set status = case when v_decision = 'approve' then 'approved' else 'rejected' end,
      reviewed_by = v_operator,
      reviewed_at = clock_timestamp(),
      revision = revision + 1,
      updated_at = clock_timestamp()
  where id = v_entity_id
  returning * into v_suggestion;

  v_response := jsonb_build_object(
    'entity_kind', 'suggestion',
    'id', v_suggestion.id,
    'status', v_suggestion.status,
    'revision', v_suggestion.revision,
    'candidate_id', v_new_candidate_id
  );
  insert into quantum_private.place_worldcup_review_events (
    operator_id, idempotency_key, request_payload, response_payload
  ) values (v_operator, v_idempotency_key, v_normalized, v_response);
  return v_response;
end;
$$;

revoke all on function quantum_private.place_worldcup_actor() from public, anon, authenticated;
revoke all on function quantum_private.place_worldcup_operator() from public, anon, authenticated;

revoke all on function public.get_place_worldcup_catalog(text) from public, anon, authenticated;
revoke all on function public.submit_place_worldcup_suggestion(jsonb) from public, anon, authenticated;
revoke all on function public.operator_list_place_worldcup_queue() from public, anon, authenticated;
revoke all on function public.operator_review_place_worldcup(jsonb) from public, anon, authenticated;

grant execute on function public.get_place_worldcup_catalog(text) to authenticated;
grant execute on function public.submit_place_worldcup_suggestion(jsonb) to authenticated;
grant execute on function public.operator_list_place_worldcup_queue() to authenticated;
grant execute on function public.operator_review_place_worldcup(jsonb) to authenticated;

comment on table quantum_private.place_worldcup_candidates is
  'Operator-reviewed place candidates. There is intentionally no public voting or popularity table.';
comment on function public.get_place_worldcup_catalog(text) is
  'Returns at most 64 fresh approved candidates, newest verification first with id tie-breaking. candidate_count is the number included in this response, not the total approved row count.';
comment on function public.operator_list_place_worldcup_queue() is
  'Returns at most the oldest 500 pending rows with id and entity-kind tie-breaking. Reviewing rows lets later pending work enter the next response.';
comment on column quantum_private.place_worldcup_candidates.source_url is
  'Operator research evidence only. The application must never fetch user-submitted URLs.';
comment on table quantum_private.place_worldcup_suggestions is
  'Private suggestion queue. Pending submissions never appear in the live bracket.';
comment on table quantum_private.place_worldcup_review_events is
  'Private operator idempotency ledger. It is not a public vote or ranking source.';

commit;

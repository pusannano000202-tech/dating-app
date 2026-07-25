DO $$
DECLARE
  created_match_id UUID;
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'service_role', TRUE);

  INSERT INTO auth.users (id, email)
  VALUES
    ('00000000-0000-4000-8000-000000000101', 'atomic-a@example.invalid'),
    ('00000000-0000-4000-8000-000000000102', 'atomic-b@example.invalid');

  INSERT INTO public.users (id, email)
  VALUES
    ('00000000-0000-4000-8000-000000000101', 'atomic-a@example.invalid'),
    ('00000000-0000-4000-8000-000000000102', 'atomic-b@example.invalid')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.groups (
    id,
    leader_user_id,
    name,
    size,
    gender,
    status
  )
  VALUES
    (
      '00000000-0000-4000-8000-000000000201',
      '00000000-0000-4000-8000-000000000101',
      'Atomic A',
      2,
      'male',
      'ready'
    ),
    (
      '00000000-0000-4000-8000-000000000202',
      '00000000-0000-4000-8000-000000000102',
      'Atomic B',
      2,
      'female',
      'ready'
    );

  INSERT INTO public.match_pool (id, group_id, status)
  VALUES
    (
      '00000000-0000-4000-8000-000000000301',
      '00000000-0000-4000-8000-000000000201',
      'waiting'
    ),
    (
      '00000000-0000-4000-8000-000000000302',
      '00000000-0000-4000-8000-000000000202',
      'waiting'
    );

  created_match_id := public.admin_create_pending_match(
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000202',
    0.75,
    '{"contract": true}'::JSONB,
    FALSE
  );

  IF (
    SELECT COUNT(*)
    FROM public.matches AS match_row
    WHERE match_row.id = created_match_id
      AND match_row.status = 'pending'
  ) <> 1 THEN
    RAISE EXCEPTION 'expected_one_pending_match';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM public.match_pool AS pool
    WHERE pool.match_id = created_match_id
      AND pool.status = 'matched'
  ) <> 2 THEN
    RAISE EXCEPTION 'expected_two_linked_pool_rows';
  END IF;

  IF (
    SELECT COUNT(DISTINCT pool.match_id)
    FROM public.match_pool AS pool
    WHERE pool.group_id IN (
      '00000000-0000-4000-8000-000000000201',
      '00000000-0000-4000-8000-000000000202'
    )
  ) <> 1 THEN
    RAISE EXCEPTION 'expected_one_durable_match_id';
  END IF;

  DELETE FROM public.match_pool
  WHERE id IN (
    '00000000-0000-4000-8000-000000000301',
    '00000000-0000-4000-8000-000000000302'
  );

  DELETE FROM public.matches
  WHERE id = created_match_id;

  DELETE FROM public.groups
  WHERE id IN (
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000202'
  );

  DELETE FROM auth.users
  WHERE id IN (
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000102'
  );
END;
$$;

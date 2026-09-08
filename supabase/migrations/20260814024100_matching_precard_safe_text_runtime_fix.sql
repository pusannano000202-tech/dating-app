-- GREATEST is a PostgreSQL conditional expression, not a pg_catalog function.
-- The qualified form fails only when the B snapshot helper runs.

CREATE OR REPLACE FUNCTION private.quantum_event_safe_card_text(
  p_value TEXT,
  p_max_length INTEGER
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_value TEXT := NULLIF(pg_catalog.btrim(p_value), '');
BEGIN
  IF v_value IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_value ~* '(https?://|www\.)'
     OR v_value ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}'
     OR v_value ~* '(^|[^0-9])01[016789][ -]?[0-9]{3,4}[ -]?[0-9]{4}([^0-9]|$)'
     OR v_value ~* '(^|[[:space:]])@[[:alnum:]_.]{2,}'
     OR v_value ~* '(카카오|카톡|오픈채팅|인스타|instagram|텔레그램|telegram|연락처|전화번호|학번|학과|대학교|대학|학교)' THEN
    RETURN NULL;
  END IF;

  v_value := pg_catalog.regexp_replace(v_value, '[[:cntrl:]]+', ' ', 'g');
  v_value := pg_catalog.regexp_replace(v_value, '[[:space:]]+', ' ', 'g');
  RETURN NULLIF(pg_catalog.left(pg_catalog.btrim(v_value), GREATEST(1, p_max_length)), '');
END;
$$;

REVOKE ALL ON FUNCTION private.quantum_event_safe_card_text(TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;

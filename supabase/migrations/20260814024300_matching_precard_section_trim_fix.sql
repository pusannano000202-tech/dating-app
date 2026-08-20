-- Card values begin on the line after each section marker. PostgreSQL btrim
-- removes spaces by default, so explicitly trim tabs and line breaks as well.

CREATE OR REPLACE FUNCTION private.quantum_event_card_section(
  p_content TEXT,
  p_title TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_marker TEXT := '[' || p_title || ']';
  v_start INTEGER;
  v_rest TEXT;
  v_next INTEGER;
BEGIN
  IF p_content IS NULL OR p_title IS NULL THEN
    RETURN NULL;
  END IF;

  v_start := pg_catalog.strpos(p_content, v_marker);
  IF v_start = 0 THEN
    RETURN NULL;
  END IF;

  v_rest := pg_catalog.substr(p_content, v_start + pg_catalog.char_length(v_marker));
  v_next := pg_catalog.strpos(v_rest, E'\n\n[');
  IF v_next > 0 THEN
    v_rest := pg_catalog.substr(v_rest, 1, v_next - 1);
  END IF;

  RETURN NULLIF(pg_catalog.btrim(v_rest, E' \t\n\r'), '');
END;
$$;

REVOKE ALL ON FUNCTION private.quantum_event_card_section(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

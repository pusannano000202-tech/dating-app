-- Keep the private score lifecycle and matching readiness checks aligned with
-- the clarified multi-photo OpenAI prompt contract.
DO $$
DECLARE
  scoring_function RECORD;
  function_definition TEXT;
BEGIN
  FOR scoring_function IN
    SELECT procedure.oid
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = ANY (ARRAY[
        'get_my_appearance_score_status',
        'get_group_appearance_score_readiness',
        'claim_private_appearance_score',
        'complete_private_appearance_score',
        'enter_match_pool'
      ])
  LOOP
    function_definition := pg_catalog.pg_get_functiondef(scoring_function.oid);
    IF function_definition LIKE '%appearance-anchor-v2%' THEN
      function_definition := pg_catalog.replace(
        function_definition,
        'appearance-anchor-v2',
        'appearance-anchor-v3'
      );
      EXECUTE function_definition;
    END IF;
  END LOOP;
END;
$$;

BEGIN;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. For
-- SECURITY DEFINER functions that also grants access to anon, which can expose
-- privileged RPCs unless every migration explicitly revokes the default.
DO $$
DECLARE
  function_row RECORD;
BEGIN
  FOR function_row IN
    SELECT
      namespace.nspname AS schema_name,
      procedure.proname AS function_name,
      pg_get_function_identity_arguments(procedure.oid) AS identity_arguments
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.prosecdef
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon',
      function_row.schema_name,
      function_row.function_name,
      function_row.identity_arguments
    );
  END LOOP;
END;
$$;

-- These two RPCs intentionally support signed-out, read-only product flows.
GRANT EXECUTE ON FUNCTION public.get_group_invite_by_token(TEXT)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_match_pool_stats()
  TO anon, authenticated;

-- These functions previously relied on the implicit PUBLIC grant. Keep only
-- the authenticated access required by the invite flow and RLS predicates.
GRANT EXECUTE ON FUNCTION public.accept_group_invite_by_token(TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_group_member(UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_member(UUID)
  TO authenticated;

-- Add a deterministic covering index for every public foreign key whose
-- columns are not already the leading columns of a valid index.
DO $$
DECLARE
  foreign_key_row RECORD;
BEGIN
  FOR foreign_key_row IN
    SELECT
      namespace.nspname AS schema_name,
      relation.relname AS table_name,
      LEFT(constraint_row.conname, 50)
        || '_'
        || SUBSTRING(
          md5(relation.relname || ':' || constraint_row.conname),
          1,
          8
        )
        || '_idx' AS index_name,
      string_agg(
        format('%I', attribute.attname),
        ', '
        ORDER BY key_column.ordinality
      ) AS indexed_columns
    FROM pg_constraint AS constraint_row
    JOIN pg_class AS relation
      ON relation.oid = constraint_row.conrelid
    JOIN pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    CROSS JOIN LATERAL unnest(constraint_row.conkey)
      WITH ORDINALITY AS key_column(attribute_number, ordinality)
    JOIN pg_attribute AS attribute
      ON attribute.attrelid = constraint_row.conrelid
      AND attribute.attnum = key_column.attribute_number
    WHERE constraint_row.contype = 'f'
      AND namespace.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_index AS index_row
        WHERE index_row.indrelid = constraint_row.conrelid
          AND index_row.indisvalid
          AND index_row.indisready
          AND index_row.indpred IS NULL
          AND index_row.indexprs IS NULL
          AND index_row.indnkeyatts >= cardinality(constraint_row.conkey)
          AND NOT EXISTS (
            SELECT 1
            FROM generate_subscripts(
              constraint_row.conkey,
              1
            ) AS position(index_position)
            WHERE
              (index_row.indkey::smallint[])[position.index_position - 1]
              <> constraint_row.conkey[position.index_position]
          )
      )
    GROUP BY
      namespace.nspname,
      relation.relname,
      constraint_row.conname
    ORDER BY namespace.nspname, relation.relname, constraint_row.conname
  LOOP
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I.%I (%s)',
      foreign_key_row.index_name,
      foreign_key_row.schema_name,
      foreign_key_row.table_name,
      foreign_key_row.indexed_columns
    );
  END LOOP;
END;
$$;

COMMIT;

-- Evaluate auth.uid() once per statement instead of once per scanned row.
-- Policy commands, roles, and boolean conditions remain unchanged.

DO $$
DECLARE
  policy_record RECORD;
  using_expression TEXT;
  check_expression TEXT;
  alter_statement TEXT;
BEGIN
  FOR policy_record IN
    SELECT
      namespace.nspname AS schema_name,
      relation.relname AS table_name,
      policy.polname AS policy_name,
      policy.polcmd AS policy_command,
      pg_get_expr(policy.polqual, policy.polrelid) AS using_expression,
      pg_get_expr(policy.polwithcheck, policy.polrelid) AS check_expression
    FROM pg_policy AS policy
    JOIN pg_class AS relation
      ON relation.oid = policy.polrelid
    JOIN pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
  LOOP
    using_expression := policy_record.using_expression;
    check_expression := policy_record.check_expression;

    IF using_expression LIKE '%auth.uid()%'
       AND using_expression NOT LIKE '%SELECT auth.uid()%' THEN
      using_expression := replace(
        using_expression,
        'auth.uid()',
        '(SELECT auth.uid())'
      );
    END IF;

    IF using_expression LIKE '%current_setting(%'
       AND using_expression NOT LIKE '%SELECT current_setting(%' THEN
      using_expression := regexp_replace(
        using_expression,
        'current_setting\(([^)]+)\)',
        '(SELECT current_setting(\1))',
        'g'
      );
    END IF;

    IF check_expression LIKE '%auth.uid()%'
       AND check_expression NOT LIKE '%SELECT auth.uid()%' THEN
      check_expression := replace(
        check_expression,
        'auth.uid()',
        '(SELECT auth.uid())'
      );
    END IF;

    IF check_expression LIKE '%current_setting(%'
       AND check_expression NOT LIKE '%SELECT current_setting(%' THEN
      check_expression := regexp_replace(
        check_expression,
        'current_setting\(([^)]+)\)',
        '(SELECT current_setting(\1))',
        'g'
      );
    END IF;

    IF using_expression IS NOT DISTINCT FROM policy_record.using_expression
       AND check_expression IS NOT DISTINCT FROM policy_record.check_expression THEN
      CONTINUE;
    END IF;

    alter_statement := format(
      'ALTER POLICY %I ON %I.%I',
      policy_record.policy_name,
      policy_record.schema_name,
      policy_record.table_name
    );

    IF using_expression IS NOT NULL
       AND policy_record.policy_command IN ('r', 'w', 'd', '*') THEN
      alter_statement := alter_statement
        || format(' USING (%s)', using_expression);
    END IF;

    IF check_expression IS NOT NULL
       AND policy_record.policy_command IN ('a', 'w', '*') THEN
      alter_statement := alter_statement
        || format(' WITH CHECK (%s)', check_expression);
    END IF;

    EXECUTE alter_statement;
  END LOOP;
END;
$$;

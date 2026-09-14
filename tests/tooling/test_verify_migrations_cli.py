from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "verify-migrations.py"
REPOSITORY_BASELINE = SCRIPT.with_name("migration-warning-baseline.json")
UNKNOWN_TABLE_ISSUE = (
    '20260101000000_unknown_table.sql: L1: references unknown table/view '
    '"public.missing_table" in ALTER TABLE'
)


class VerifyMigrationsCliTests(unittest.TestCase):
    def test_compact_cte_declarations_keep_their_query_scope(self) -> None:
        for declaration in ('AS(', 'AS (', 'AS\n(', 'AS NOT MATERIALIZED('):
            with self.subTest(declaration=declaration):
                sql = (
                    f'WITH recent {declaration}SELECT 1 AS id),'
                    'page AS(SELECT * FROM recent),'
                    'visible AS(SELECT * FROM page) '
                    'SELECT * FROM visible JOIN page ON TRUE;'
                )
                result = self.run_verifier('--strict', sql=sql)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                outside = self.run_verifier('--strict', sql=sql + 'SELECT * FROM page;')
                self.assertEqual(outside.returncode, 1)
                self.assertIn('"public.page" in FROM', outside.stdout)

        missing = self.run_verifier(
            '--strict',
            sql='WITH page AS(SELECT * FROM missing) SELECT * FROM public.page;',
        )
        self.assertEqual(missing.returncode, 1)
        self.assertIn('"public.missing" in FROM', missing.stdout)
        self.assertIn('"public.page" in FROM', missing.stdout)

    def test_references_keyword_does_not_match_preferences_or_literals(self) -> None:
        sql = (
            'CREATE TABLE public.preferences(id integer PRIMARY KEY); '
            'CREATE TABLE public.items(id integer REFERENCES public.preferences(id)); '
            'SELECT * FROM public.preferences pref; '
            "COMMENT ON TABLE public.preferences IS 'User preferences only. REFERENCES absent(id).'; "
            '/* REFERENCES also_absent(id) */'
        )
        result = self.run_verifier('--strict', sql=sql)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        missing = self.run_verifier(
            '--strict',
            sql=sql + 'ALTER TABLE public.items ADD COLUMN parent integer REFERENCES missing(id);',
        )
        self.assertEqual(missing.returncode, 1)
        self.assertIn('"public.missing" in FK REFERENCES', missing.stdout)

    def test_escape_string_mask_keeps_later_fk_visible(self) -> None:
        for literal in (r"E'can\'t'", r"e'can\'t'", r"E'backslash\\'", r"'backslash\'"):
            with self.subTest(literal=literal):
                result = self.run_verifier(
                    '--strict',
                    sql=(
                        f'SELECT {literal};\n'
                        'CREATE TABLE public.child (parent_id integer REFERENCES public.missing(id));'
                    ),
                )
                self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
                self.assertIn('L2: references unknown table/view "public.missing" in FK REFERENCES', result.stdout)

    def test_escape_string_contents_do_not_create_false_fk_references(self) -> None:
        result = self.run_verifier(
            '--strict',
            sql=r"SELECT E'can\'t REFERENCES public.not_a_table(id)'; SELECT 1;",
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn('Issues: 0', result.stdout)

    def test_adjacent_tagged_dollar_quotes_are_not_an_unnamed_delimiter(self) -> None:
        result = self.run_verifier(
            '--strict',
            sql=(
                'DO $install$ BEGIN EXECUTE $ddl$'
                'CREATE FUNCTION public.answer() RETURNS integer LANGUAGE plpgsql '
                'AS $fn$begin return 42;end$fn$$ddl$; END $install$;'
            ),
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_dollar_quotes_in_comments_and_other_literals_are_not_delimiters(self) -> None:
        result = self.run_verifier(
            '--strict',
            sql=(
                "SELECT '$$'; -- $comment$\n"
                "/* $$ /* $nested$ */ */ SELECT '$missing$'; "
                'SELECT 1 AS "$$"; '
                "SELECT E'escaped \\' $$ stays in the string'; "
                'SELECT 1 AS identifier$tag$; '
                "SELECT $$It's a dollar-quoted literal$$; "
                "SELECT $outer$an unmatched $inner$ is literal text$outer$;"
            ),
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_missing_dollar_quote_closers_still_fail(self) -> None:
        for delimiter in ('$$', '$fn$'):
            with self.subTest(delimiter=delimiter):
                result = self.run_verifier('--strict', sql=f'DO {delimiter} BEGIN NULL; END;')
                self.assertEqual(result.returncode, 1)
                self.assertIn(f'unbalanced {delimiter} delimiters', result.stdout)

        mismatched = self.run_verifier('--strict', sql='DO $first$ BEGIN NULL; END $other$;')
        self.assertEqual(mismatched.returncode, 1)
        self.assertIn('unbalanced $first$ delimiters', mismatched.stdout)

    def test_sql_body_dollar_quote_closers_remain_checked(self) -> None:
        for sql in (
            'DO $outer$ BEGIN EXECUTE $$SELECT 1; END $outer$;',
            'CREATE FUNCTION public.broken() RETURNS void LANGUAGE plpgsql '
            'AS $outer$ BEGIN EXECUTE $$SELECT 1; END $outer$;',
            'CREATE FUNCTION public.broken() RETURNS void '
            'AS $outer$ BEGIN EXECUTE $$SELECT 1; END $outer$ LANGUAGE plpgsql;',
        ):
            with self.subTest(sql=sql):
                result = self.run_verifier('--strict', sql=sql)
                self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
                self.assertIn('unbalanced $$ delimiters', result.stdout)

    def test_sql_body_literals_may_contain_unmatched_other_dollar_tags(self) -> None:
        result = self.run_verifier(
            '--strict',
            sql='DO $outer$ BEGIN PERFORM $literal$an unmatched $inner$ is text$literal$; END $outer$;',
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_trigger_update_event_is_not_a_table_but_real_updates_remain_checked(self) -> None:
        sql = (
            'CREATE TABLE public.items(id integer); '
            'CREATE FUNCTION public.guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$; '
            'CREATE TRIGGER protect BEFORE UPDATE OR DELETE ON public.items '
            'FOR EACH ROW EXECUTE FUNCTION public.guard(); '
        )
        result = self.run_verifier('--strict', sql=sql)
        self.assertEqual(result.returncode, 0, result.stdout)
        outside = self.run_verifier('--strict', sql=sql + 'UPDATE public.missing SET id = 1;')
        self.assertEqual(outside.returncode, 1)
        self.assertIn('"public.missing" in UPDATE', outside.stdout)

    def test_dynamic_alter_table_string_is_not_a_static_relation_reference(self) -> None:
        sql = (
            "DO $$ DECLARE relation_name text := 'items'; BEGIN "
            "EXECUTE format('ALTER TABLE quantum_private.%I ENABLE ROW LEVEL SECURITY', relation_name); "
            "END $$;"
        )
        result = self.run_verifier('--strict', sql=sql)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn('Issues: 0', result.stdout)

    def test_postgres_catalog_relations_are_implicit_dependencies(self) -> None:
        sql = (
            'SELECT procedure.oid FROM pg_proc AS procedure '
            'JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace; '
            'SELECT procedure.oid FROM pg_catalog.pg_proc AS procedure '
            'JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace; '
            'SELECT role.oid FROM pg_catalog.pg_roles AS role; '
            'SELECT database.oid FROM pg_catalog.pg_database AS database; '
            'SELECT setting.setconfig FROM pg_catalog.pg_db_role_setting AS setting; '
            'SELECT dependency.objid FROM pg_catalog.pg_depend AS dependency;'
        )
        result = self.run_verifier('--strict', sql=sql)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn('Issues: 0', result.stdout)

        unknown = self.run_verifier(
            '--strict',
            sql='SELECT object.oid FROM pg_catalog.pg_not_a_real_catalog AS object;',
        )
        self.assertEqual(unknown.returncode, 1)
        self.assertIn('"pg_catalog.pg_not_a_real_catalog" in FROM', unknown.stdout)

    def test_dynamic_create_trigger_string_is_not_a_static_trigger_reference(self) -> None:
        dynamic = self.run_verifier(
            '--strict',
            sql=(
                "DO $$ BEGIN "
                "EXECUTE format('CREATE TRIGGER guard BEFORE INSERT ON quantum_private.runtime_table "
                "FOR EACH ROW EXECUTE FUNCTION quantum_private.guard()'); "
                "END $$;"
            ),
        )
        self.assertEqual(dynamic.returncode, 0, dynamic.stdout + dynamic.stderr)
        self.assertIn('Issues: 0', dynamic.stdout)

        static = self.run_verifier(
            '--strict',
            sql=(
                'CREATE FUNCTION public.guard() RETURNS trigger LANGUAGE plpgsql '
                'AS $$ BEGIN RETURN NEW; END $$; '
                'CREATE TRIGGER guard BEFORE INSERT ON public.missing_table '
                'FOR EACH ROW EXECUTE FUNCTION public.guard();'
            ),
        )
        self.assertEqual(static.returncode, 1)
        self.assertIn('"public.missing_table" in CREATE TRIGGER guard', static.stdout)

    def test_cte_names_are_scoped_to_their_statement(self) -> None:
        result = self.run_verifier('--strict', sql='WITH page AS (SELECT 1 AS id), visible AS (SELECT id FROM page) SELECT * FROM visible;')
        self.assertEqual(result.returncode, 0, result.stdout)
        outside = self.run_verifier('--strict', sql='WITH page AS (SELECT 1) SELECT * FROM page; SELECT * FROM page;')
        self.assertEqual(outside.returncode, 1)
        self.assertIn('"public.page" in FROM', outside.stdout)

    def test_nested_cte_names_do_not_escape_their_query(self) -> None:
        result = self.run_verifier('--strict', sql='SELECT * FROM (WITH page AS (SELECT 1) SELECT * FROM page) x JOIN page y ON TRUE;')
        self.assertEqual(result.returncode, 1)
        self.assertIn('"public.page" in JOIN', result.stdout)

    def test_cte_does_not_hide_qualified_table_or_missing_dependency(self) -> None:
        result = self.run_verifier('--strict', sql='WITH page AS (SELECT * FROM missing) SELECT * FROM public.page;')
        self.assertEqual(result.returncode, 1)
        self.assertIn('"public.missing" in FROM', result.stdout)
        self.assertIn('"public.page" in FROM', result.stdout)

    def test_cte_comments_and_string_literals_cannot_define_false_scope(self) -> None:
        result = self.run_verifier('--strict', sql="SELECT 'WITH page AS (SELECT 1);'; -- WITH page AS (SELECT 1)\nSELECT * FROM page;")
        self.assertEqual(result.returncode, 1)
        self.assertIn('"public.page" in FROM', result.stdout)

    def test_extract_table_functions_and_row_locks_are_not_relations(self) -> None:
        sql = 'CREATE TABLE public.items(id integer); SELECT EXTRACT(ISODOW FROM week_key) FROM public.items JOIN generate_series(1,3) s ON TRUE FOR UPDATE SKIP LOCKED;'
        result = self.run_verifier('--strict', sql=sql)
        self.assertEqual(result.returncode, 0, result.stdout)

    def test_recursive_and_materialized_cte_quoted_columns(self) -> None:
        sql = 'WITH RECURSIVE "page"(id) AS MATERIALIZED (SELECT 1), next_page AS NOT MATERIALIZED (SELECT id FROM "page") SELECT * FROM next_page;'
        result = self.run_verifier('--strict', sql=sql)
        self.assertEqual(result.returncode, 0, result.stdout)

    def test_repository_command_locks_the_current_warning_baseline(self) -> None:
        package_json = json.loads(
            (SCRIPT.parents[1] / "package.json").read_text(encoding="utf-8")
        )

        self.assertEqual(
            package_json["scripts"]["check:migrations"],
            "python scripts/verify-migrations.py "
            "--baseline scripts/migration-warning-baseline.json",
        )

        baseline = json.loads(REPOSITORY_BASELINE.read_text(encoding="utf-8"))
        self.assertEqual(baseline["version"], 1)
        self.assertEqual(len(baseline["issues"]), 232)
        self.assertEqual(baseline["issues"], sorted(baseline["issues"]))

    def run_verifier(
        self,
        *args: str,
        sql: str = "ALTER TABLE public.missing_table ADD COLUMN note text;\n",
        baseline_issues: list[str] | None = None,
    ) -> subprocess.CompletedProcess[str]:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            migration_directory = root / "supabase" / "migrations"
            migration_directory.mkdir(parents=True)
            (migration_directory / "20260101000000_unknown_table.sql").write_text(
                sql,
                encoding="utf-8",
            )
            if baseline_issues is not None:
                (root / "warning-baseline.json").write_text(
                    json.dumps(
                        {"version": 1, "issues": baseline_issues},
                        indent=2,
                    )
                    + "\n",
                    encoding="utf-8",
                )

            return subprocess.run(
                [sys.executable, str(SCRIPT), *args],
                cwd=root,
                capture_output=True,
                text=True,
                check=False,
            )

    def test_default_mode_reports_issues_without_failing(self) -> None:
        result = self.run_verifier()

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("Issues: 1", result.stdout)
        self.assertIn("REPORT - warnings found; exit status remains zero.", result.stdout)

    def test_strict_mode_fails_when_any_issue_is_found(self) -> None:
        result = self.run_verifier("--strict")

        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("FAIL - 1 issue(s) exceed the configured limit of 0.", result.stdout)

    def test_issue_baseline_passes_at_the_configured_limit(self) -> None:
        result = self.run_verifier("--max-issues", "1")

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn(
            "PASS - 1 issue(s) are within the configured limit of 1.",
            result.stdout,
        )

    def test_issue_baseline_fails_above_the_configured_limit(self) -> None:
        result = self.run_verifier("--max-issues", "0")

        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("FAIL - 1 issue(s) exceed the configured limit of 0.", result.stdout)

    def test_issue_fingerprint_baseline_passes_when_identity_matches(self) -> None:
        result = self.run_verifier(
            "--baseline",
            "warning-baseline.json",
            baseline_issues=[UNKNOWN_TABLE_ISSUE],
        )

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn(
            "PASS - 1 issue fingerprint(s) match the configured baseline.",
            result.stdout,
        )

    def test_issue_fingerprint_baseline_allows_resolved_known_warning(self) -> None:
        result = self.run_verifier(
            "--baseline",
            "warning-baseline.json",
            baseline_issues=[
                UNKNOWN_TABLE_ISSUE,
                '20260101000000_unknown_table.sql: L2: references unknown table/view '
                '"public.resolved_table" in ALTER TABLE',
            ],
        )

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn(
            "PASS - 1 issue fingerprint(s) are covered by the configured baseline.",
            result.stdout,
        )
        self.assertIn("Resolved baseline fingerprints: 1", result.stdout)

    def test_issue_fingerprint_baseline_fails_on_equal_count_identity_change(
        self,
    ) -> None:
        result = self.run_verifier(
            "--baseline",
            "warning-baseline.json",
            baseline_issues=[
                '20260101000000_unknown_table.sql: L1: references unknown table/view '
                '"public.replaced_table" in ALTER TABLE'
            ],
        )

        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("New issue fingerprints: 1", result.stdout)
        self.assertIn("Resolved baseline fingerprints: 1", result.stdout)
        self.assertIn(UNKNOWN_TABLE_ISSUE, result.stdout)

    def test_issue_fingerprint_baseline_fails_cleanly_when_file_is_missing(
        self,
    ) -> None:
        result = self.run_verifier("--baseline", "missing-baseline.json")

        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn(
            "FAIL - unable to load issue fingerprint baseline:",
            result.stdout,
        )
        self.assertNotIn("Traceback", result.stderr)

    def test_revoke_from_public_is_not_misread_as_a_table_reference(self) -> None:
        result = self.run_verifier(
            "--strict",
            sql="REVOKE USAGE ON SCHEMA public FROM PUBLIC, anon, authenticated;\n",
        )

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("Issues: 0", result.stdout)

    def test_supabase_auth_sessions_is_an_available_baseline_relation(self) -> None:
        result = self.run_verifier(
            "--strict",
            sql=(
                "CREATE OR REPLACE VIEW public.current_auth_session AS\n"
                "SELECT id FROM auth.sessions;\n"
            ),
        )

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("Issues: 0", result.stdout)

    def test_is_distinct_from_is_not_misread_as_a_table_reference(self) -> None:
        result = self.run_verifier(
            "--strict",
            sql=(
                "CREATE TABLE public.sample (id uuid PRIMARY KEY, marker text);\n"
                "INSERT INTO public.sample (id, marker) VALUES (gen_random_uuid(), 'new')\n"
                "ON CONFLICT (id) DO UPDATE SET marker = EXCLUDED.marker\n"
                "WHERE public.sample.marker IS DISTINCT FROM EXCLUDED.marker;\n"
                "DO $$ BEGIN\n"
                "  PERFORM CASE WHEN 'old' IS DISTINCT FROM p_idempotency_key THEN 1 ELSE 0 END;\n"
                "END $$;\n"
            ),
        )

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("Issues: 0", result.stdout)

    def test_set_returning_function_is_not_truncated_into_a_table_reference(self) -> None:
        result = self.run_verifier(
            "--strict",
            sql=(
                "CREATE FUNCTION public.round_ids(text) RETURNS TABLE (id uuid) "
                "LANGUAGE sql AS $$ SELECT NULL::uuid WHERE FALSE $$;\n"
                "SELECT resolved.id FROM public.round_ids('audit') AS resolved;\n"
            ),
        )

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("Issues: 0", result.stdout)


if __name__ == "__main__":
    unittest.main()

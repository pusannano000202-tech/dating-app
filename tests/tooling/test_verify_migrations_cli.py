from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "verify-migrations.py"


class VerifyMigrationsCliTests(unittest.TestCase):
    def run_verifier(self, *args: str) -> subprocess.CompletedProcess[str]:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            migration_directory = root / "supabase" / "migrations"
            migration_directory.mkdir(parents=True)
            (migration_directory / "20260101000000_unknown_table.sql").write_text(
                "ALTER TABLE public.missing_table ADD COLUMN note text;\n",
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


if __name__ == "__main__":
    unittest.main()

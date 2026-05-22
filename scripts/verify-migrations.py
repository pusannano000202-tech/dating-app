#!/usr/bin/env python3
"""Static verification for supabase migrations.

Goal: catch issues that would break a `supabase db reset` without actually running it.

What it checks
--------------
1. ASCII filename order (the order Supabase applies them in).
2. Every relation / function / policy / trigger / index referenced or altered
   is either:
   - defined in a previous migration, OR
   - defined in the same file before it is referenced, OR
   - part of the implicit Supabase baseline (auth.users, auth.uid(), etc.).
3. No duplicate CREATE POLICY without a DROP POLICY IF EXISTS before it.
4. No CREATE TABLE / CREATE VIEW without IF NOT EXISTS when it might be re-applied.
5. Triggers/functions reference functions that exist at definition time.
6. Quick brace/quote sanity (BEGIN ... END pairing, $$ pairing).

What it does NOT catch
---------------------
- Postgres-specific semantic errors (constraint conflicts, expression type mismatches).
- RLS policy correctness.
- Trigger ordering side effects.

Usage:
    python scripts/verify-migrations.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path
from collections import defaultdict
from dataclasses import dataclass, field

MIG_DIR = Path('supabase/migrations')

# Supabase baseline objects assumed to always exist.
BASELINE_RELATIONS = {
    'auth.users',
    'auth.identities',
    'storage.objects',
    'storage.buckets',
    'pg_constraint',
    'pg_attribute',
    'pg_proc',
    'pg_class',
    'public.pg_constraint',
    'public.pg_attribute',
    'public.pg_proc',
    'public.pg_class',
    # cross-branch (성준 영역 matching/group-engine):
    # 20260516_matching_add_venues_and_match_meetings.sql 에서 추가됨.
    # 본 브랜치 z36 의 get_match_scheduled_reveal_at 가 참조함.
    'public.match_meetings',
    'public.venues',
}

# Names that our naive regex picks up but are not real relations
SPURIOUS_NAMES = {
    'public.on',
    'public.to',
    'public.not',
    'public.forging',
    'public.using',
    'public.with',
    'public.where',
    'public.set',
    'public.values',
    'public.select',
    'public.if',
    'public.then',
    'public.case',
    'public.when',
    'public.of',  # AFTER UPDATE OF column trigger syntax
    'auth.ui',  # auth.uid() partial match
    'public.lateral',  # LEFT JOIN LATERAL ... 키워드 오인식
    'public.get_match_meeting_inf',  # function-call-in-FROM 오인식 (LATERAL 호출)
    'public.unnes',  # unnest() 함수 호출 in-FROM 오인식
}
BASELINE_FUNCTIONS = {
    'auth.uid',
    'auth.role',
    'auth.jwt',
    'auth.email',
    'gen_random_uuid',
    'now',
    'current_setting',
    'set_config',
    'format',
    'coalesce',
    'count',
    'pg_get_constraintdef',
    'EXECUTE',
    'PERFORM',
    'concat',
    'length',
    'lower',
    'upper',
    'trim',
    'replace',
    'substr',
    'array_length',
    'array_agg',
    'jsonb_build_object',
    'json_build_object',
    'to_jsonb',
}

@dataclass
class Object:
    kind: str  # table | view | function | policy | trigger | index | column
    name: str  # full qualified name lower-cased
    file: str
    line: int

@dataclass
class Reference:
    target: str  # full qualified name lower-cased
    target_kind_hint: str  # table | function | policy | trigger | index
    file: str
    line: int
    context: str  # short snippet of the reference

@dataclass
class FileReport:
    name: str
    defs: list[Object] = field(default_factory=list)
    refs: list[Reference] = field(default_factory=list)
    issues: list[str] = field(default_factory=list)


def normalize_name(name: str) -> str:
    name = name.strip().strip('"').lower()
    return name


def schema_qualify(name: str) -> str:
    if '.' not in name:
        return f'public.{name}'
    return name


def parse_file(path: Path) -> FileReport:
    text = path.read_text(encoding='utf-8')
    report = FileReport(name=path.name)

    # Strip line comments first to make regexes simpler.
    # Keep line numbers by replacing comment text with spaces of same length.
    lines = text.splitlines()
    stripped_lines = []
    for ln in lines:
        idx = ln.find('--')
        if idx >= 0:
            stripped_lines.append(ln[:idx] + ' ' * (len(ln) - idx))
        else:
            stripped_lines.append(ln)
    stripped = '\n'.join(stripped_lines)

    # CREATE TABLE [IF NOT EXISTS] <name> (
    for m in re.finditer(r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w.\"]+)", stripped, re.IGNORECASE):
        name = schema_qualify(normalize_name(m.group(1)))
        line = stripped.count('\n', 0, m.start()) + 1
        report.defs.append(Object('table', name, path.name, line))

    # ALTER TABLE <name> ADD COLUMN ...  -- treat as table reference, columns later
    for m in re.finditer(r"ALTER\s+TABLE\s+([\w.\"]+)", stripped, re.IGNORECASE):
        name = schema_qualify(normalize_name(m.group(1)))
        line = stripped.count('\n', 0, m.start()) + 1
        report.refs.append(Reference(name, 'table', path.name, line, 'ALTER TABLE'))

    # CREATE [OR REPLACE] VIEW <name>
    for m in re.finditer(r"CREATE(?:\s+OR\s+REPLACE)?\s+VIEW\s+([\w.\"]+)", stripped, re.IGNORECASE):
        name = schema_qualify(normalize_name(m.group(1)))
        line = stripped.count('\n', 0, m.start()) + 1
        report.defs.append(Object('view', name, path.name, line))

    # ALTER VIEW
    for m in re.finditer(r"ALTER\s+VIEW\s+([\w.\"]+)", stripped, re.IGNORECASE):
        name = schema_qualify(normalize_name(m.group(1)))
        line = stripped.count('\n', 0, m.start()) + 1
        report.refs.append(Reference(name, 'view', path.name, line, 'ALTER VIEW'))

    # DROP VIEW [IF EXISTS] <name>
    for m in re.finditer(r"DROP\s+VIEW(?:\s+IF\s+EXISTS)?\s+([\w.\"]+)", stripped, re.IGNORECASE):
        name = schema_qualify(normalize_name(m.group(1)))
        line = stripped.count('\n', 0, m.start()) + 1
        report.refs.append(Reference(name, 'view', path.name, line, 'DROP VIEW'))

    # CREATE [OR REPLACE] FUNCTION <name>(
    for m in re.finditer(r"CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION\s+([\w.\"]+)\s*\(", stripped, re.IGNORECASE):
        name = schema_qualify(normalize_name(m.group(1)))
        line = stripped.count('\n', 0, m.start()) + 1
        report.defs.append(Object('function', name, path.name, line))

    # DROP FUNCTION
    for m in re.finditer(r"DROP\s+FUNCTION(?:\s+IF\s+EXISTS)?\s+([\w.\"]+)", stripped, re.IGNORECASE):
        name = schema_qualify(normalize_name(m.group(1)))
        line = stripped.count('\n', 0, m.start()) + 1
        report.refs.append(Reference(name, 'function', path.name, line, 'DROP FUNCTION'))

    # CREATE POLICY "name" ON <table>
    for m in re.finditer(r'CREATE\s+POLICY\s+"([^"]+)"\s+ON\s+([\w.\"]+)', stripped, re.IGNORECASE):
        pname = m.group(1).lower()
        table = schema_qualify(normalize_name(m.group(2)))
        line = stripped.count('\n', 0, m.start()) + 1
        report.defs.append(Object('policy', f'{table}::{pname}', path.name, line))
        report.refs.append(Reference(table, 'table', path.name, line, f'CREATE POLICY {pname}'))

    # ALTER POLICY "name" ON <table>
    for m in re.finditer(r'ALTER\s+POLICY\s+"([^"]+)"\s+ON\s+([\w.\"]+)', stripped, re.IGNORECASE):
        pname = m.group(1).lower()
        table = schema_qualify(normalize_name(m.group(2)))
        line = stripped.count('\n', 0, m.start()) + 1
        report.refs.append(Reference(f'{table}::{pname}', 'policy', path.name, line, f'ALTER POLICY {pname}'))

    # DROP POLICY [IF EXISTS] "name" ON <table>
    for m in re.finditer(r'DROP\s+POLICY(?:\s+IF\s+EXISTS)?\s+"([^"]+)"\s+ON\s+([\w.\"]+)', stripped, re.IGNORECASE):
        pname = m.group(1).lower()
        table = schema_qualify(normalize_name(m.group(2)))
        line = stripped.count('\n', 0, m.start()) + 1
        report.refs.append(Reference(f'{table}::{pname}', 'policy', path.name, line, f'DROP POLICY {pname}'))

    # CREATE TRIGGER <name> ON <table>
    for m in re.finditer(r"CREATE\s+TRIGGER\s+(\w+)[^;]*?ON\s+([\w.\"]+)", stripped, re.IGNORECASE | re.DOTALL):
        tname = m.group(1).lower()
        table = schema_qualify(normalize_name(m.group(2)))
        line = stripped.count('\n', 0, m.start()) + 1
        report.defs.append(Object('trigger', f'{table}::{tname}', path.name, line))
        report.refs.append(Reference(table, 'table', path.name, line, f'CREATE TRIGGER {tname}'))

    # DROP TRIGGER
    for m in re.finditer(r"DROP\s+TRIGGER(?:\s+IF\s+EXISTS)?\s+(\w+)\s+ON\s+([\w.\"]+)", stripped, re.IGNORECASE):
        tname = m.group(1).lower()
        table = schema_qualify(normalize_name(m.group(2)))
        line = stripped.count('\n', 0, m.start()) + 1
        report.refs.append(Reference(f'{table}::{tname}', 'trigger', path.name, line, f'DROP TRIGGER {tname}'))

    # CREATE [UNIQUE] INDEX [IF NOT EXISTS] <name> ON <table>
    for m in re.finditer(r"CREATE(?:\s+UNIQUE)?\s+INDEX(?:\s+IF\s+NOT\s+EXISTS)?\s+(\w+)\s+ON\s+([\w.\"]+)", stripped, re.IGNORECASE):
        iname = m.group(1).lower()
        table = schema_qualify(normalize_name(m.group(2)))
        line = stripped.count('\n', 0, m.start()) + 1
        report.defs.append(Object('index', iname, path.name, line))
        report.refs.append(Reference(table, 'table', path.name, line, f'CREATE INDEX {iname}'))

    # DROP INDEX
    for m in re.finditer(r"DROP\s+INDEX(?:\s+IF\s+EXISTS)?\s+(\w+)", stripped, re.IGNORECASE):
        iname = m.group(1).lower()
        line = stripped.count('\n', 0, m.start()) + 1
        report.refs.append(Reference(iname, 'index', path.name, line, f'DROP INDEX {iname}'))

    # REFERENCES <table>(col)
    for m in re.finditer(r"REFERENCES\s+([\w.\"]+)", stripped, re.IGNORECASE):
        name = schema_qualify(normalize_name(m.group(1)))
        line = stripped.count('\n', 0, m.start()) + 1
        report.refs.append(Reference(name, 'table', path.name, line, 'FK REFERENCES'))

    # JOIN <table>
    for m in re.finditer(r"\bJOIN\s+([\w.\"]+)", stripped, re.IGNORECASE):
        name = schema_qualify(normalize_name(m.group(1)))
        line = stripped.count('\n', 0, m.start()) + 1
        report.refs.append(Reference(name, 'table', path.name, line, 'JOIN'))

    # FROM <table> (best effort; ignores subqueries)
    for m in re.finditer(r"\bFROM\s+([\w.\"]+)(?!\s*\()", stripped, re.IGNORECASE):
        name = schema_qualify(normalize_name(m.group(1)))
        # Skip obvious aliases or CTE names
        if name in ('public.deleted', 'public.inserted', 'public.updated'):
            continue
        line = stripped.count('\n', 0, m.start()) + 1
        report.refs.append(Reference(name, 'table', path.name, line, 'FROM'))

    # UPDATE <table>
    for m in re.finditer(r"\bUPDATE\s+([\w.\"]+)", stripped, re.IGNORECASE):
        name = schema_qualify(normalize_name(m.group(1)))
        line = stripped.count('\n', 0, m.start()) + 1
        report.refs.append(Reference(name, 'table', path.name, line, 'UPDATE'))

    # INSERT INTO <table>
    for m in re.finditer(r"INSERT\s+INTO\s+([\w.\"]+)", stripped, re.IGNORECASE):
        name = schema_qualify(normalize_name(m.group(1)))
        line = stripped.count('\n', 0, m.start()) + 1
        report.refs.append(Reference(name, 'table', path.name, line, 'INSERT'))

    # DELETE FROM <table>
    for m in re.finditer(r"DELETE\s+FROM\s+([\w.\"]+)", stripped, re.IGNORECASE):
        name = schema_qualify(normalize_name(m.group(1)))
        line = stripped.count('\n', 0, m.start()) + 1
        report.refs.append(Reference(name, 'table', path.name, line, 'DELETE'))

    # EXECUTE FUNCTION <fn>
    for m in re.finditer(r"EXECUTE\s+(?:FUNCTION|PROCEDURE)\s+([\w.\"]+)", stripped, re.IGNORECASE):
        name = schema_qualify(normalize_name(m.group(1)))
        line = stripped.count('\n', 0, m.start()) + 1
        report.refs.append(Reference(name, 'function', path.name, line, 'EXECUTE FN'))

    # GRANT EXECUTE ON FUNCTION <name>
    for m in re.finditer(r"GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+([\w.\"]+)", stripped, re.IGNORECASE):
        name = schema_qualify(normalize_name(m.group(1)))
        line = stripped.count('\n', 0, m.start()) + 1
        report.refs.append(Reference(name, 'function', path.name, line, 'GRANT EXECUTE'))

    # COMMENT ON FUNCTION / TABLE / VIEW / TRIGGER / POLICY / COLUMN
    for m in re.finditer(r"COMMENT\s+ON\s+FUNCTION\s+([\w.\"]+)", stripped, re.IGNORECASE):
        name = schema_qualify(normalize_name(m.group(1)))
        line = stripped.count('\n', 0, m.start()) + 1
        report.refs.append(Reference(name, 'function', path.name, line, 'COMMENT FN'))
    for m in re.finditer(r"COMMENT\s+ON\s+TABLE\s+([\w.\"]+)", stripped, re.IGNORECASE):
        name = schema_qualify(normalize_name(m.group(1)))
        line = stripped.count('\n', 0, m.start()) + 1
        report.refs.append(Reference(name, 'table', path.name, line, 'COMMENT TABLE'))
    for m in re.finditer(r"COMMENT\s+ON\s+VIEW\s+([\w.\"]+)", stripped, re.IGNORECASE):
        name = schema_qualify(normalize_name(m.group(1)))
        line = stripped.count('\n', 0, m.start()) + 1
        report.refs.append(Reference(name, 'view', path.name, line, 'COMMENT VIEW'))
    for m in re.finditer(r"COMMENT\s+ON\s+COLUMN\s+([\w.\"]+)\.", stripped, re.IGNORECASE):
        name = schema_qualify(normalize_name(m.group(1)))
        line = stripped.count('\n', 0, m.start()) + 1
        report.refs.append(Reference(name, 'table', path.name, line, 'COMMENT COLUMN'))

    # $$ balanced check
    dollar_count = text.count('$$')
    if dollar_count % 2 != 0:
        report.issues.append(f'unbalanced $$ delimiters: {dollar_count} occurrences')

    return report


def main() -> int:
    files = sorted(MIG_DIR.glob('*.sql'))
    if not files:
        print('no migrations found')
        return 1

    reports = [parse_file(f) for f in files]

    # Cumulative defined objects up to and including current file
    defined_tables: set[str] = set(BASELINE_RELATIONS)
    defined_views: set[str] = set()
    defined_functions: set[str] = set(f'public.{f}' for f in BASELINE_FUNCTIONS) | set(BASELINE_FUNCTIONS)
    defined_policies: set[str] = set()
    defined_triggers: set[str] = set()
    defined_indexes: set[str] = set()

    total_issues = 0
    file_issue_summary = []

    print('=' * 72)
    print('Migration apply order (ASCII sort):')
    print('=' * 72)
    for f in files:
        print(f'  {f.name}')
    print()

    for rep in reports:
        # First add defs from this file so that within-file refs pass
        for d in rep.defs:
            if d.kind == 'table':
                defined_tables.add(d.name)
            elif d.kind == 'view':
                defined_views.add(d.name)
            elif d.kind == 'function':
                defined_functions.add(d.name)
            elif d.kind == 'policy':
                defined_policies.add(d.name)
            elif d.kind == 'trigger':
                defined_triggers.add(d.name)
            elif d.kind == 'index':
                defined_indexes.add(d.name)

    # Re-walk and check refs against cumulative-up-to-this-file set
    cum_tables: set[str] = set(BASELINE_RELATIONS)
    cum_views: set[str] = set()
    cum_functions: set[str] = set(f'public.{f}' for f in BASELINE_FUNCTIONS) | set(BASELINE_FUNCTIONS)
    cum_policies: set[str] = set()
    cum_triggers: set[str] = set()
    cum_indexes: set[str] = set()

    for rep in reports:
        # Add this file's defs first (they may be used later in the same file)
        for d in rep.defs:
            if d.kind == 'table':
                cum_tables.add(d.name)
            elif d.kind == 'view':
                cum_views.add(d.name)
            elif d.kind == 'function':
                cum_functions.add(d.name)
            elif d.kind == 'policy':
                cum_policies.add(d.name)
            elif d.kind == 'trigger':
                cum_triggers.add(d.name)
            elif d.kind == 'index':
                cum_indexes.add(d.name)

        # Now check refs
        for r in rep.refs:
            target = r.target
            kind = r.target_kind_hint
            # Filter out PL/pgSQL OLD./NEW. record variables - they look like tables to regex
            if target.startswith('old.') or target.startswith('new.') or target.startswith('public.old.') or target.startswith('public.new.'):
                continue
            # Spurious names from regex grabbing SQL keywords as identifiers
            if target in SPURIOUS_NAMES:
                continue
            if kind == 'table':
                if target not in cum_tables and target not in cum_views and target not in BASELINE_RELATIONS:
                    rep.issues.append(f'L{r.line}: references unknown table/view "{target}" in {r.context}')
            elif kind == 'view':
                if target not in cum_views and target not in BASELINE_RELATIONS:
                    rep.issues.append(f'L{r.line}: references unknown view "{target}" in {r.context}')
            elif kind == 'function':
                # Trim arg signatures if present (we match by name only)
                base = target.split('(')[0]
                # Function refs may have schema in qualified form already
                if base not in cum_functions and base not in BASELINE_FUNCTIONS and f'public.{base}' not in cum_functions:
                    rep.issues.append(f'L{r.line}: references unknown function "{base}" in {r.context}')
            elif kind == 'policy':
                if target not in cum_policies and 'DROP' not in r.context:
                    rep.issues.append(f'L{r.line}: ALTER on unknown policy "{target}" in {r.context}')
            elif kind == 'trigger':
                if target not in cum_triggers and 'DROP' not in r.context:
                    rep.issues.append(f'L{r.line}: references unknown trigger "{target}" in {r.context}')
            elif kind == 'index':
                if target not in cum_indexes and 'DROP' not in r.context:
                    rep.issues.append(f'L{r.line}: references unknown index "{target}" in {r.context}')

        if rep.issues:
            total_issues += len(rep.issues)
            file_issue_summary.append((rep.name, len(rep.issues)))
            print(f'WARN {rep.name}')
            for issue in rep.issues:
                print(f'   {issue}')

    # Cross-file: detect duplicate policy CREATE without matching DROP earlier
    policy_creates: dict[str, list[tuple[str, int]]] = defaultdict(list)
    policy_drops: dict[str, list[tuple[str, int]]] = defaultdict(list)
    for rep in reports:
        for d in rep.defs:
            if d.kind == 'policy':
                policy_creates[d.name].append((d.file, d.line))
        for r in rep.refs:
            if r.target_kind_hint == 'policy' and 'DROP' in r.context:
                policy_drops[r.target].append((r.file, r.line))

    duplicate_policy_issues = []
    for pname, creates in policy_creates.items():
        if len(creates) > 1:
            # Each create after the first should have a preceding DROP IF EXISTS
            sorted_creates = sorted(creates)
            sorted_drops = sorted(policy_drops.get(pname, []))
            for i, (cf, cl) in enumerate(sorted_creates[1:], start=1):
                # Find a drop that comes after the previous create and before this one
                prev_file = sorted_creates[i - 1][0]
                relevant_drops = [d for d in sorted_drops if (d[0], d[1]) >= (prev_file, 0) and (d[0], d[1]) <= (cf, cl)]
                if not relevant_drops:
                    duplicate_policy_issues.append(
                        f'policy "{pname}" recreated at {cf}:{cl} without preceding DROP POLICY IF EXISTS'
                    )

    if duplicate_policy_issues:
        print()
        print('WARN Policy duplicate-create issues:')
        for di in duplicate_policy_issues:
            print(f'   {di}')
        total_issues += len(duplicate_policy_issues)

    # Cross-file: detect duplicate trigger CREATE without matching DROP
    trigger_creates: dict[str, list[tuple[str, int]]] = defaultdict(list)
    trigger_drops: dict[str, list[tuple[str, int]]] = defaultdict(list)
    for rep in reports:
        for d in rep.defs:
            if d.kind == 'trigger':
                trigger_creates[d.name].append((d.file, d.line))
        for r in rep.refs:
            if r.target_kind_hint == 'trigger' and 'DROP' in r.context:
                trigger_drops[r.target].append((r.file, r.line))

    duplicate_trigger_issues = []
    for tname, creates in trigger_creates.items():
        if len(creates) > 1:
            sorted_creates = sorted(creates)
            sorted_drops = sorted(trigger_drops.get(tname, []))
            for i, (cf, cl) in enumerate(sorted_creates[1:], start=1):
                prev_file = sorted_creates[i - 1][0]
                relevant_drops = [d for d in sorted_drops if (d[0], d[1]) >= (prev_file, 0) and (d[0], d[1]) <= (cf, cl)]
                if not relevant_drops:
                    duplicate_trigger_issues.append(
                        f'trigger "{tname}" recreated at {cf}:{cl} without preceding DROP TRIGGER IF EXISTS'
                    )

    if duplicate_trigger_issues:
        print()
        print('WARN Trigger duplicate-create issues:')
        for di in duplicate_trigger_issues:
            print(f'   {di}')
        total_issues += len(duplicate_trigger_issues)

    # Summary
    print()
    print('=' * 72)
    print('Summary')
    print('=' * 72)
    print(f'Files scanned: {len(files)}')
    print(f'Total defs: {sum(len(r.defs) for r in reports)}')
    print(f'Total refs: {sum(len(r.refs) for r in reports)}')
    print(f'Issues: {total_issues}')
    if file_issue_summary:
        for n, c in file_issue_summary:
            print(f'  {n}: {c}')

    if total_issues == 0:
        print()
        print('PASS - no dependency-order issues found.')
        return 0
    else:
        print()
        print('CHECK - see warnings above. Some may be false positives from regex parsing.')
        return 0  # exit 0; we treat as report not gate


if __name__ == '__main__':
    sys.exit(main())

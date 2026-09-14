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
    python scripts/verify-migrations.py --strict
    python scripts/verify-migrations.py --max-issues 232
    python scripts/verify-migrations.py --baseline scripts/migration-warning-baseline.json
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from collections import Counter, defaultdict
from dataclasses import dataclass, field

MIG_DIR = Path('supabase/migrations')

PG_CATALOG_RELATIONS = {
    'pg_attribute',
    'pg_class',
    'pg_constraint',
    'pg_database',
    'pg_db_role_setting',
    'pg_depend',
    'pg_namespace',
    'pg_proc',
    'pg_roles',
}

# Supabase baseline objects assumed to always exist.
BASELINE_RELATIONS = {
    'auth.users',
    'auth.identities',
    # Supabase Auth keeps each refresh-token session here. Security-definer
    # functions may bind a JWT session_id to this server-owned relation.
    'auth.sessions',
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
    *(f'pg_catalog.{name}' for name in PG_CATALOG_RELATIONS),
    # cross-branch (성준 영역 matching/group-engine):
    # 20260516_matching_add_venues_and_match_meetings.sql 에서 추가됨.
    # 본 브랜치 z36 의 get_match_scheduled_reveal_at 가 참조함.
    'public.match_meetings',
    'public.venues',
}

# Names that our naive regex picks up but are not real relations
SPURIOUS_NAMES = {
    # REVOKE ... FROM PUBLIC is a role clause, not a relation reference.
    'public.public',
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
    'public.distribute_no_show_penalt',  # 함수 호출 in-FROM (z45)
    'public.authenticated',  # REVOKE ... FROM authenticated 오인식
    'public.anon',           # REVOKE ... FROM anon 오인식
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
        if name in PG_CATALOG_RELATIONS:
            return f'pg_catalog.{name}'
        return f'public.{name}'
    return name


def query_code_mask(text: str) -> str:
    """Hide comments/string literals without shifting source positions or lines.

    Dollar-quoted function bodies remain visible because this dependency checker
    also inspects the SQL inside PL/pgSQL. This is not a PostgreSQL grammar parser.
    """
    result = list(text)
    index = 0
    while index < len(text):
        start = index
        if text.startswith('--', index):
            end = text.find('\n', index)
            index = len(text) if end < 0 else end
        elif text.startswith('/*', index):
            nesting = 1
            index += 2
            while index < len(text) and nesting:
                if text.startswith('/*', index):
                    nesting += 1
                    index += 2
                elif text.startswith('*/', index):
                    nesting -= 1
                    index += 2
                else:
                    index += 1
        elif text[index] == "'":
            escaped = index > 0 and text[index - 1] in 'eE' and (
                index < 2 or not re.match(r'[\w$]', text[index - 2])
            )
            index += 1
            while index < len(text):
                if escaped and text[index] == '\\':
                    index = min(index + 2, len(text))
                elif text.startswith("''", index):
                    index += 2
                elif text[index] == "'":
                    index += 1
                    break
                else:
                    index += 1
        else:
            index += 1
            continue
        for cursor in range(start, index):
            if result[cursor] not in '\r\n':
                result[cursor] = ' '
    return ''.join(result)


def unclosed_dollar_quote(text: str) -> str | None:
    """Check SQL literals and explicitly SQL/PLpgSQL executable bodies.

    Counting ``$$`` mistakes the boundary in ``$fn$$ddl$`` for an unnamed
    delimiter. Only the exact opening tag closes a dollar-quoted string.
    Other tags inside an ordinary literal are text, but DO/function bodies
    contain executable SQL whose own literals must also be balanced.
    """
    delimiter_pattern = re.compile(r'(?<![\w$])\$(?:[^\W\d]\w*)?\$')
    index = 0
    statement_start = 0
    while index < len(text):
        if text.startswith('--', index):
            end = text.find('\n', index)
            index = len(text) if end < 0 else end
        elif text.startswith('/*', index):
            nesting = 1
            index += 2
            while index < len(text) and nesting:
                if text.startswith('/*', index):
                    nesting += 1
                    index += 2
                elif text.startswith('*/', index):
                    nesting -= 1
                    index += 2
                else:
                    index += 1
        elif text[index] in ("'", '"'):
            quote = text[index]
            escaped = quote == "'" and index > 0 and text[index - 1] in 'eE' and (
                index < 2 or not re.match(r'[\w$]', text[index - 2])
            )
            index += 1
            while index < len(text):
                if escaped and text[index] == '\\':
                    index += 2
                elif text.startswith(quote * 2, index):
                    index += 2
                elif text[index] == quote:
                    index += 1
                    break
                else:
                    index += 1
        elif match := delimiter_pattern.match(text, index):
            delimiter = match.group()
            end = text.find(delimiter, match.end())
            if end < 0:
                return delimiter
            prefix = query_code_mask(text[statement_start:index])
            is_do_body = re.fullmatch(r'\s*DO(?:\s+LANGUAGE\s+[\w"]+)?\s*', prefix, re.IGNORECASE)
            is_function_body = re.match(
                r'\s*CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE)\b',
                prefix, re.IGNORECASE,
            ) and re.search(r'\bAS\s*$', prefix, re.IGNORECASE)
            if is_do_body or is_function_body:
                # LANGUAGE can precede or follow AS/body. This is a scoped
                # lexical check, not validation of every procedural language.
                suffix = query_code_mask(text[end + len(delimiter):]).split(';', 1)[0]
                language = re.search(r'\bLANGUAGE\s+"?(\w+)"?', prefix + suffix, re.IGNORECASE)
                is_sql_body = (
                    language.group(1).lower() in ('sql', 'plpgsql')
                    if language else bool(is_do_body)
                )
                if is_sql_body and (unclosed := unclosed_dollar_quote(text[match.end():end])):
                    return unclosed
            index = end + len(delimiter)
        else:
            if text[index] == ';':
                statement_start = index + 1
            index += 1
    return None


def query_reference_context(code: str):
    """Track WITH query scope and EXTRACT separators, not a global alias allowlist."""
    depths = [0] * (len(code) + 1)
    stack: list[int] = []
    closes: dict[int, int] = {}
    for index, char in enumerate(code):
        depths[index] = len(stack)
        if char == '(':
            stack.append(index)
        elif char == ')' and stack:
            closes[stack.pop()] = index
    depths[len(code)] = len(stack)
    cte_scopes: list[tuple[int, int, set[str]]] = []
    for match in re.finditer(r'\bWITH\s+(?:RECURSIVE\s+)?', code, re.IGNORECASE):
        cursor = match.end()
        names: set[str] = set()
        while cursor < len(code):
            alias = re.match(r'\s*("[^"]+"|\w+)\s*', code[cursor:])
            if not alias:
                break
            name = normalize_name(alias.group(1))
            cursor += alias.end()
            if cursor in closes:  # Optional CTE column names.
                cursor = closes[cursor] + 1
            declaration = re.match(r'\s*AS\b\s*(?:(?:NOT\s+)?MATERIALIZED\s*)?\(', code[cursor:], re.IGNORECASE)
            if not declaration:
                break
            opening = cursor + declaration.end() - 1
            if opening not in closes:
                break
            names.add(name)
            cursor = closes[opening] + 1
            comma = re.match(r'\s*,', code[cursor:])
            if not comma:
                break
            cursor += comma.end()
        if names:
            depth = depths[match.start()]
            end = next((position for position in range(cursor, len(code))
                        if (code[position] == ';' and depths[position] <= depth)
                        or (code[position] == ')' and depths[position] == depth)), len(code))
            cte_scopes.append((match.start(), end, names))
    extract_scopes = []
    for match in re.finditer(r'\bEXTRACT\s*\(', code, re.IGNORECASE):
        opening = match.end() - 1
        if opening in closes:
            extract_scopes.append((opening, closes[opening], depths[opening] + 1))
    return depths, cte_scopes, extract_scopes


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
    query_code = query_code_mask(text)
    query_depths, cte_scopes, extract_scopes = query_reference_context(query_code)

    def is_cte_reference(name: str, position: int) -> bool:
        return '.' not in name and any(
            start <= position < end and normalize_name(name) in names
            for start, end, names in cte_scopes
        )

    # CREATE TABLE [IF NOT EXISTS] <name> (
    for m in re.finditer(r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w.\"]+)", stripped, re.IGNORECASE):
        name = schema_qualify(normalize_name(m.group(1)))
        line = stripped.count('\n', 0, m.start()) + 1
        report.defs.append(Object('table', name, path.name, line))

    # ALTER TABLE <name> ADD COLUMN ...  -- treat as table reference, columns later
    for m in re.finditer(r"ALTER\s+TABLE\s+([\w.\"]+)", query_code, re.IGNORECASE):
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
    for m in re.finditer(r"CREATE\s+TRIGGER\s+(\w+)[^;]*?ON\s+([\w.\"]+)", query_code, re.IGNORECASE | re.DOTALL):
        tname = m.group(1).lower()
        table = schema_qualify(normalize_name(m.group(2)))
        line = stripped.count('\n', 0, m.start()) + 1
        report.defs.append(Object('trigger', f'{table}::{tname}', path.name, line))
        report.refs.append(Reference(table, 'table', path.name, line, f'CREATE TRIGGER {tname}'))

    # DROP TRIGGER
    for m in re.finditer(r"DROP\s+TRIGGER(?:\s+IF\s+EXISTS)?\s+(\w+)\s+ON\s+([\w.\"]+)", query_code, re.IGNORECASE):
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
    for m in re.finditer(r"\bREFERENCES\s+([\w.\"]+)", query_code, re.IGNORECASE):
        name = schema_qualify(normalize_name(m.group(1)))
        line = stripped.count('\n', 0, m.start()) + 1
        report.refs.append(Reference(name, 'table', path.name, line, 'FK REFERENCES'))

    # JOIN <table>
    for m in re.finditer(r"\bJOIN\s+([\w.\"]+)", query_code, re.IGNORECASE):
        if re.match(r"\s*\(", query_code[m.end():]) or is_cte_reference(m.group(1), m.start()):
            continue
        name = schema_qualify(normalize_name(m.group(1)))
        line = stripped.count('\n', 0, m.start()) + 1
        report.refs.append(Reference(name, 'table', path.name, line, 'JOIN'))

    # FROM <table> (best effort; ignores subqueries)
    for m in re.finditer(r"\bFROM\s+([\w.\"]+)", query_code, re.IGNORECASE):
        if is_cte_reference(m.group(1), m.start()):
            continue
        if any(start < m.start() < end and query_depths[m.start()] == depth for start, end, depth in extract_scopes):
            continue
        # `IS [NOT] DISTINCT FROM value` is a comparison operator, not a
        # relation reference. Keep this check generic so EXCLUDED fields and
        # PL/pgSQL variables are both handled without adding name allowlists.
        if re.search(r"\bDISTINCT\s+$", query_code[:m.start()], re.IGNORECASE):
            continue
        # A set-returning function is a function reference, not a relation.
        # Checking after the complete capture avoids the negative-lookahead
        # backtracking bug that truncated `round_ids(` to `round_id`.
        if re.match(r"\s*\(", query_code[m.end():]):
            continue
        name = schema_qualify(normalize_name(m.group(1)))
        # Skip obvious aliases or CTE names
        if name in ('public.deleted', 'public.inserted', 'public.updated'):
            continue
        line = stripped.count('\n', 0, m.start()) + 1
        report.refs.append(Reference(name, 'table', path.name, line, 'FROM'))

    # Trigger event lists are not DML. Keep the following function body outside
    # this range so its real UPDATE dependencies are still checked.
    trigger_headers = [(m.start(), m.end()) for m in re.finditer(
        r'\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:CONSTRAINT\s+)?TRIGGER\s+[\w."]+\s+(?:BEFORE|AFTER|INSTEAD\s+OF)\b[^;]*?\bON\s+',
        query_code, re.IGNORECASE,
    )]
    # UPDATE <table>
    for m in re.finditer(r"\bUPDATE\s+([\w.\"]+)", query_code, re.IGNORECASE):
        if any(start <= m.start() < end for start, end in trigger_headers):
            continue
        if re.search(r"\bFOR\s+(?:NO\s+KEY\s+)?$", query_code[:m.start()], re.IGNORECASE):
            continue
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
    for m in re.finditer(r"EXECUTE\s+(?:FUNCTION|PROCEDURE)\s+([\w.\"]+)", query_code, re.IGNORECASE):
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

    # Match SQL dollar strings lexically, including named tags and comments.
    if delimiter := unclosed_dollar_quote(text):
        report.issues.append(f'unbalanced {delimiter} delimiters: missing closing delimiter')

    return report


def non_negative_integer(value: str) -> int:
    parsed = int(value)
    if parsed < 0:
        raise argparse.ArgumentTypeError('must be zero or greater')
    return parsed


def load_issue_fingerprint_baseline(path: Path) -> list[str]:
    try:
        payload = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ValueError(str(error)) from error

    if not isinstance(payload, dict) or payload.get('version') != 1:
        raise ValueError('expected an object with version 1')

    issues = payload.get('issues')
    if not isinstance(issues, list) or not all(isinstance(issue, str) for issue in issues):
        raise ValueError('expected "issues" to be a list of strings')

    return issues


def compare_issue_fingerprints(current: list[str], baseline: list[str]) -> int:
    current_counts = Counter(current)
    baseline_counts = Counter(baseline)
    # This is a warning ratchet: resolved approved warnings may disappear, but
    # every current identity (including duplicate multiplicity) must be known.
    new_issues = current_counts - baseline_counts
    resolved_issues = baseline_counts - current_counts

    if not new_issues:
        print()
        if resolved_issues:
            print(
                f'PASS - {len(current)} issue fingerprint(s) are covered by the '
                'configured baseline.'
            )
            print(f'Resolved baseline fingerprints: {sum(resolved_issues.values())}')
        else:
            print(
                f'PASS - {len(current)} issue fingerprint(s) match the configured '
                'baseline.'
            )
        return 0

    print()
    print('FAIL - issue fingerprint baseline mismatch.')
    print(f'New issue fingerprints: {sum(new_issues.values())}')
    for issue in sorted(new_issues.elements()):
        print(f'  + {issue}')
    print(f'Resolved baseline fingerprints: {sum(resolved_issues.values())}')
    for issue in sorted(resolved_issues.elements()):
        print(f'  - {issue}')
    return 1


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description='Statically verify Supabase migration ordering and references.',
    )
    issue_limit = parser.add_mutually_exclusive_group()
    issue_limit.add_argument(
        '--strict',
        action='store_true',
        help='Return a failure exit status when any issue is found.',
    )
    issue_limit.add_argument(
        '--max-issues',
        type=non_negative_integer,
        help='Return a failure exit status only when issues exceed this limit.',
    )
    issue_limit.add_argument(
        '--baseline',
        type=Path,
        help='Fail when a current issue identity is absent from a versioned JSON baseline.',
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
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
    issue_fingerprints: list[str] = []

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
                issue_fingerprints.append(f'{rep.name}: {issue}')
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
            issue_fingerprints.append(f'policy-duplicate: {di}')
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
            issue_fingerprints.append(f'trigger-duplicate: {di}')
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

    if args.baseline is not None:
        try:
            baseline_issues = load_issue_fingerprint_baseline(args.baseline)
        except ValueError as error:
            print()
            print(
                'FAIL - unable to load issue fingerprint baseline: '
                f'{args.baseline}: {error}'
            )
            return 1
        return compare_issue_fingerprints(issue_fingerprints, baseline_issues)

    if total_issues == 0:
        print()
        print('PASS - no dependency-order issues found.')
        return 0

    configured_limit = 0 if args.strict else args.max_issues
    if configured_limit is None:
        print()
        print('REPORT - warnings found; exit status remains zero.')
        print('Some warnings may be false positives from regex parsing.')
        return 0

    if total_issues > configured_limit:
        print()
        print(
            f'FAIL - {total_issues} issue(s) exceed the configured limit of '
            f'{configured_limit}.'
        )
        return 1

    print()
    print(
        f'PASS - {total_issues} issue(s) are within the configured limit of '
        f'{configured_limit}.'
    )
    return 0


if __name__ == '__main__':
    sys.exit(main())

"""Parse integrated migrations with PostgreSQL 17 grammar; not a DB/RLS runtime test.

Run with PYTHONPATH=.tmp/pg-parser after isolated pglast==7.18 installation.
"""
import json
from pathlib import Path
from pglast import ast, parse_sql
from pglast.parser import parse_plpgsql_json, split

result = []
for path in sorted(Path('supabase/migrations').glob('20260905[1-9]*.sql')):
    source = path.read_text(encoding='utf-8-sig')
    entry = {'file': path.name, 'sql': 'pending', 'plpgsql': []}
    try:
        statements = parse_sql(source)
        entry['sql'] = 'pass'
        segments = split(source)
        for statement, segment in zip(statements, segments):
            node = statement.stmt
            if not isinstance(node, ast.CreateFunctionStmt):
                continue
            if not any(option.defname == 'language' and option.arg.sval == 'plpgsql' for option in node.options):
                continue
            name = '.'.join(part.sval for part in node.funcname)
            try:
                parse_plpgsql_json(segment)
                entry['plpgsql'].append({'function': name, 'result': 'pass'})
            except Exception as error:
                entry['plpgsql'].append({'function': name, 'result': 'blocked', 'error': str(error)})
    except Exception as error:
        entry['sql'] = 'fail'
        entry['error'] = str(error)
    result.append(entry)
print(json.dumps({'runtime': 'NOT_EXECUTED', 'results': result}, ensure_ascii=False, indent=2))
raise SystemExit(1 if any(row['sql'] != 'pass' or any(item['result'] != 'pass' for item in row['plpgsql']) for row in result) else 0)

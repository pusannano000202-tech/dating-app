# Public RPC server boundary verification

## Scope

- Supabase project: `jyfwcanjqwboyvicoafm` (`quantum-production`)
- Functions: `get_group_invite_by_token(TEXT)`, `get_match_pool_stats()`
- Goal: keep signed-out product flows available through Next.js APIs without allowing browser roles to execute privileged database functions directly.

## Applied change

- Migration: `20260814025000_harden_public_read_rpc_server_boundary.sql`
- Both functions now use an empty `search_path` and fully qualified table names.
- `PUBLIC`, `anon`, and `authenticated` execute privileges were revoked.
- Only `service_role` can execute these functions.
- The two Next.js API routes now create a server-only Supabase admin client.
- Group invite lookup rejects any token that is not exactly 32 hexadecimal characters before querying Supabase.

## Verification matrix

| Check | Result | Evidence |
|---|---|---|
| Static regression test | PASS | `tests/config/public-rpc-server-boundary.test.ts` 2/2 |
| Remote function `search_path` | PASS | both functions report `search_path=""` |
| Anonymous direct execute | PASS | both functions report `anon_execute=false` |
| Authenticated direct execute | PASS | both functions report `authenticated_execute=false` |
| Server role execute | PASS | both functions report `service_execute=true` |
| Invalid invite token | PASS | local API returned HTTP 404 |
| Valid-format unknown invite token | PASS | local API returned HTTP 404 through server RPC path |
| Match-pool aggregate API | PASS | local API returned HTTP 200 and aggregate-only JSON |
| Supabase anonymous definer advisor | PASS | reduced from 2 findings to 0 |

## Remaining project-wide advisor findings

- 41 tables have RLS enabled and no policy. This can be intentional for server-only tables, but each table still needs an ownership/use-case audit.
- 123 `SECURITY DEFINER` functions remain executable by `authenticated`. A remote inventory found that 120 contain a direct `auth.uid()` check and the other 3 delegate to checked functions. Twenty-five use `search_path=public`; `anon`, `authenticated`, and `PUBLIC` do not have `CREATE` privilege on the public schema, reducing search-path injection risk. Function-by-function least-privilege review is still required before production release.
- Leaked-password protection remains unavailable/disabled. Current OTP/OAuth login reduces immediate exposure, but this must be revisited before password login is added.

This document proves the local API and remote database boundary above. It does not prove the current Vercel deployment or Android build contains these changes.

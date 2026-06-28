# PR Draft: profile/post-worldcup-decisions-2026-05-21

## PR target

- Base: `main`
- Head: `profile/post-worldcup-decisions-2026-05-21`
- Repository: `pusannano000202-tech/dating-app`
- PR URL to open: `https://github.com/pusannano000202-tech/dating-app/pull/new/profile/post-worldcup-decisions-2026-05-21`

## Suggested title

`feat: align matching flow, payment readiness, and group member controls`

## Important reviewer note

이 브랜치는 `main`과 오래 갈라져 있어서 PR 전체 diff가 매우 큽니다.
이번에 새로 push한 핵심 커밋은 아래 3개입니다.

- `07631e7 fix: harden payment env validation`
- `26fa549 fix: support in-pool group member removal`
- `cc031d0 docs: update payment and group removal handoff`

리뷰할 때는 브랜치 전체 변경과 이번 3커밋 변경을 분리해서 봐야 합니다.

## Summary

이번 PR은 부산대 과팅 앱의 매칭 준비, 그룹 관리, 보증금 결제 준비, 프론트 동선 정리를 통합한 브랜치입니다.

이번 추가 push에서 보강한 내용은 두 가지입니다.

1. 결제 env 안전성 보강
   - Toss key와 Supabase service role key가 잘못 붙여넣어진 경우를 배포 전에 차단합니다.
   - key 뒤에 공백, 한글 설명, 메모 문장이 붙으면 `INVALID`로 분류합니다.
   - 실제 secret 값은 코드, 테스트, 문서에 저장하지 않았습니다.

2. 그룹 멤버 제거/탈퇴 보강
   - 리더가 멤버 카드에서 `친구 내보내기`를 바로 실행할 수 있습니다.
   - 일반 멤버는 `forming`, `ready`, `in_pool` 상태에서 그룹 나가기를 할 수 있습니다.
   - 그룹이 큐에 들어간 상태에서 멤버가 빠지면 active `match_pool` row를 `cancelled` 처리하고 그룹을 다시 `forming`으로 되돌립니다.
   - 남남 그룹이었다가 남녀 혼성으로 바뀌는 상황처럼 멤버 구성이 바뀐 뒤 stale 성별/큐 상태가 남는 위험을 줄입니다.

## Files to review closely

- `lib/payments/deposit.ts`
- `scripts/check-payment-env.mjs`
- `tests/config/deposit-payment-routes.test.ts`
- `tests/config/deposit-policy.test.ts`
- `app/group/create/page.tsx`
- `components/matching/group-create/GroupMemberStatusPanel.tsx`
- `components/matching/group-create/status.ts`
- `tests/matching/group-create-status.test.ts`
- `tests/matching/group-member-removal.test.ts`
- `supabase/migrations/20260623162000_group_member_exit_in_pool_support.sql`

## Supabase review checklist

- [ ] 새 migration `20260623162000_group_member_exit_in_pool_support.sql` 검토
- [ ] `leave_group(UUID)`가 non-leader 멤버 탈퇴만 허용하는지 확인
- [ ] `remove_group_member(UUID, UUID)`가 leader만 non-leader active member를 제거할 수 있는지 확인
- [ ] `ready`/`in_pool` 상태에서 멤버가 빠질 때 active `match_pool`이 `cancelled` 되는지 확인
- [ ] 그룹 상태가 다시 `forming`으로 돌아가는 정책이 성준 매칭 엔진 기준과 맞는지 확인
- [ ] production Supabase 적용 전 로컬 또는 staging에서 `supabase db reset` 검증

## Payment/Vercel setup checklist

아래 값은 Vercel Environment Variables에 넣어야 합니다.
실제 값은 이 문서에 적지 않습니다.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` 또는 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_PAYMENT_PROVIDER=toss`
- `PAYMENT_PROVIDER=toss`
- `NEXT_PUBLIC_TOSS_CLIENT_KEY`
- `TOSS_SECRET_KEY`
- `PAYMENT_INTERNAL_SECRET`
- `NEXT_PUBLIC_APP_ORIGIN`

주의:

- `SUPABASE_SERVICE_ROLE_KEY`, `TOSS_SECRET_KEY`, `PAYMENT_INTERNAL_SECRET`는 서버 전용입니다.
- 위 서버 전용 값에 `NEXT_PUBLIC_`을 붙이면 안 됩니다.
- Toss key 뒤에 한글 설명, 공백, 카톡 문장, 메모가 붙으면 안 됩니다.
- `NEXT_PUBLIC_APP_ORIGIN`은 최종 Vercel production URL이어야 합니다.

## Verification already run

- [x] `npm run test:matching`
- [x] `npm run test:config`
- [x] `npm run test:profile`
- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run build`
- [x] `python scripts/verify-migrations.py`
- [x] `npm run check:payment-env` with mock provider
- [x] `node scripts/check-secret-leaks.mjs`

## Known blockers before production deployment

- [ ] Vercel CLI is not installed locally.
- [ ] `.vercel/project.json` is missing, so this folder is not locally linked to a Vercel project.
- [ ] Local Toss env is not configured, so `npm run check:payment-env -- --provider=toss` still fails.
- [ ] `NEXT_PUBLIC_APP_ORIGIN` is not set to a production Vercel URL.
- [ ] Supabase CLI and `psql` are not available on PATH, so local `supabase db reset` has not been run for the new migration.
- [ ] Production Supabase was not touched.
- [ ] Production Toss payment was not executed.

## Suggested PR body

```md
## Summary

이 PR은 매칭 준비/그룹 관리/보증금 결제 준비/프론트 동선 정리를 통합한 브랜치입니다.

이번 추가 push의 핵심은:

- Toss/Supabase 결제 env 값 검증 강화
- 큐 진입 후에도 친구 내보내기/그룹 나가기 가능하도록 보강
- 멤버 이탈 시 match_pool 취소 및 그룹 forming 복귀 처리
- 관련 테스트와 handoff 문서 보강

## Reviewer note

이 브랜치는 main과 오래 갈라져 있어서 전체 diff가 큽니다.
이번 push에서 새로 추가된 커밋은 다음 3개입니다.

- `07631e7 fix: harden payment env validation`
- `26fa549 fix: support in-pool group member removal`
- `cc031d0 docs: update payment and group removal handoff`

## Supabase review required

- 새 migration: `supabase/migrations/20260623162000_group_member_exit_in_pool_support.sql`
- production Supabase에는 아직 적용하지 않았습니다.
- 성준 리뷰 후 local/staging에서 db reset 검증이 필요합니다.

## Verification

- `npm run test:matching`
- `npm run test:config`
- `npm run test:profile`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `python scripts/verify-migrations.py`
- `npm run check:payment-env`
- `node scripts/check-secret-leaks.mjs`

## Production blockers

- Vercel project local link 없음
- Toss env 미설정
- production `NEXT_PUBLIC_APP_ORIGIN` 미설정
- 새 Supabase migration production 미적용
- Toss production/sandbox checkout 미실행
```

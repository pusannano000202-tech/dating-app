# 배포 운영자 체크리스트 - 2026-06-23

이 문서는 성준에게 받은 Supabase/Toss 키를 실제 배포 환경에 넣을 때 보는 실행표다.
실제 키 값은 이 문서, 코드, 테스트, PR, 커밋 메시지에 절대 쓰지 않는다.

## 현재 코드 기준

- 결제사는 Toss Payments 단일 기준이다.
- 로컬 UI 검토는 `mock` provider로 동작한다.
- 실제 Toss sandbox 결제는 `NEXT_PUBLIC_PAYMENT_PROVIDER=toss`, `PAYMENT_PROVIDER=toss`일 때만 열린다.
- 보증금은 `10,000원` 기준이다.
- Toss 결제 시작, 성공 confirm, 취소/cancel, webhook reconciliation route는 코드에 있다.
- production Supabase, production Vercel, 실제 Toss 실결제는 이 작업에서 건드리지 않았다.

## 절대 금지

- `SUPABASE_SERVICE_ROLE_KEY`를 `NEXT_PUBLIC_` 이름으로 만들지 않는다.
- `TOSS_SECRET_KEY`를 `NEXT_PUBLIC_` 이름으로 만들지 않는다.
- 실제 secret 값을 `.env.example`, 문서, 테스트, PR 설명, 커밋 메시지에 쓰지 않는다.
- 카카오톡 문장이나 메모가 붙은 값을 그대로 붙여넣지 않는다.
  - 예: `...abcd 이거니까`, `...abcd 그저` 같은 값은 검증기에서 `INVALID`가 떠야 정상이다.

## Vercel에 넣을 환경변수 이름

Vercel Dashboard > Project Settings > Environment Variables에 넣는다.
값은 성준에게 받은 실제 값을 사용하되, 아래에는 값 이름만 적는다.

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_APP_ORIGIN=
NEXT_PUBLIC_PAYMENT_PROVIDER=toss
PAYMENT_PROVIDER=toss
NEXT_PUBLIC_TOSS_CLIENT_KEY=
TOSS_SECRET_KEY=
PAYMENT_INTERNAL_SECRET=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_DEV_AUTH_BYPASS=false
```

### 값 넣는 기준

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: 브라우저 공개 가능한 Supabase anon key.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: 새 Supabase publishable key를 쓰는 경우만 넣는다. 없으면 비워도 된다.
- `NEXT_PUBLIC_APP_ORIGIN`: 실제 Vercel 배포 주소. `localhost`면 production 준비 실패로 봐야 한다.
- `NEXT_PUBLIC_PAYMENT_PROVIDER`: `toss`.
- `PAYMENT_PROVIDER`: `toss`.
- `NEXT_PUBLIC_TOSS_CLIENT_KEY`: Toss test client key. 브라우저 공개 가능.
- `TOSS_SECRET_KEY`: Toss test secret key. 서버 전용.
- `PAYMENT_INTERNAL_SECRET`: 내부 환불/cancel 호출 보호용 긴 랜덤 문자열.
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key. 서버 전용.
- `NEXT_PUBLIC_DEV_AUTH_BYPASS`: production에서는 `false`.

## Supabase Dashboard에서 할 일

- Auth redirect URL allow list에 배포 주소를 추가한다.
  - `https://<vercel-production-domain>/auth/callback`
  - `https://<vercel-preview-domain>/auth/callback`
- Google 로그인까지 쓸 경우 Google OAuth provider가 켜져 있어야 한다.
- 새 migration은 성준 리뷰 후 staging 또는 production에 적용한다.
- 이 세션에서는 성준 새 Supabase 프로젝트에 직접 migration 적용 검증을 하지 못했다.

## Toss Dashboard에서 할 일

- 테스트 상점의 `결제위젯` client key와 secret key를 한 세트로 복사한다.
- success/fail/webhook URL 등록이 필요한 경우 Vercel preview 또는 production URL 기준으로 맞춘다.
- production 실결제 전에는 반드시 Toss test key로 Preview 배포에서 먼저 확인한다.

## 로컬 검증 명령

`.env.local`에 값을 넣은 뒤 실행한다. 값은 출력되지 않고 상태만 나온다.

```bash
npm run check:payment-env -- --provider=toss
npm run check:deploy-readiness
npm run test:config
npm run test:matching
npm run test:profile
npm run typecheck
npm run lint
npm run build
```

## 현재 알려진 차단점

- Vercel CLI 실행 파일은 잡힌다.
- 다만 `vercel whoami`가 통과하지 않아 현재 로컬 CLI 인증은 아직 안 된 상태다.
- `.vercel/project.json`이 없어 Vercel 프로젝트 link가 잡혀 있지 않다.
- 로컬 `.env.local` 기준 Toss/Supabase 결제 env 검증은 통과한다.
- Vercel Dashboard에는 같은 env 값이 별도로 들어가야 한다. 로컬 `.env.local` 값이 자동으로 Vercel에 올라가는 것은 아니다.
- `NEXT_PUBLIC_APP_ORIGIN`이 production/preview Vercel URL로 설정되어야 한다. 현재 로컬 검토값은 `localhost`라 production 준비로 보지 않는다.
- Supabase MCP 조회는 현재 연결 계정 권한 부족으로 실패했다. production DB에는 아무 변경도 하지 않았다.
- Supabase CLI/psql이 없어 새 Supabase 프로젝트에 migration을 직접 적용/조회 검증하지 못했다.

## 통과 기준

- `npm run check:payment-env -- --provider=toss`가 통과한다.
- `npm run check:deploy-readiness`에서 모든 항목이 `SET`이 된다.
- Preview 배포에서 `/group/create` 보증금 결제 버튼이 Toss 결제창을 연다.
- Toss 성공 후 원래 화면으로 돌아와 `payment=paid` 안내가 보인다.
- 실패/취소 시 원래 화면으로 돌아와 실패 안내가 보인다.
- 환불/cancel API는 내부 secret 없이 호출하면 막힌다.
- 실제 secret 값이 `git diff`, 문서, 테스트 출력에 노출되지 않는다.

## 성준에게 확인할 것

- migration 적용 대상 Supabase 프로젝트가 맞는지.
- Vercel 프로젝트가 어느 GitHub 저장소/브랜치를 바라보는지.
- Toss 테스트 상점 client/secret key가 같은 세트인지.
- webhook을 Preview URL로 먼저 검증할지, production URL에서 검증할지.

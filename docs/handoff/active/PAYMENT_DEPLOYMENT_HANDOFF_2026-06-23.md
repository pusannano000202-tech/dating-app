# 보증금 결제 배포 인수인계서 — 2026-06-23

## 목적

부팅 앱의 보증금 결제를 Vercel 배포 기준으로 연결하기 위한 현재 상태와 남은 설정을 정리한다.
실제 키 값은 이 문서에 쓰지 않는다. 키는 Vercel Dashboard 또는 `.env.local` 같은 gitignore 파일에만 넣는다.

## 현재 코드 기준

- 결제사는 Toss Payments 단일 기준이다.
- 보증금은 `10,000원` 기준이다.
- 로컬 검토용 `mock` provider는 유지한다.
- 실제 Toss 결제는 `NEXT_PUBLIC_PAYMENT_PROVIDER=toss`, `PAYMENT_PROVIDER=toss`일 때만 열린다.
- 결제 시작 API는 `/api/deposits`와 `/api/payments/deposit` 양쪽에서 지원된다.
- 결제 시작 API는 Toss 결제창 URL을 서버에서 만들지 않고, 브라우저 Toss SDK에 넘길 결제 요청 payload를 반환한다.
- 브라우저는 `https://js.tosspayments.com/v2/standard` SDK를 로드한 뒤 `requestPayment`로 결제창을 연다.
- Toss `customerKey`는 SDK 제한을 넘지 않도록 50자 이하로 만든다.
- Toss 성공 콜백은 `/api/payments/deposit/confirm`에서 처리한다.
- 성공 후 사용자는 원래 출발한 화면으로 돌아온다.
  - 그룹 생성 화면 출발: `/group/create?...&payment=paid`
  - 매칭 상세 화면 출발: `/match/[id]?payment=paid`
- 실패/취소 시에도 `return_path` 기준으로 원래 화면으로 돌아오며 `payment=failed` 또는 `payment=cancelled` 상태를 붙인다.
- 환불/취소 API는 `PAYMENT_INTERNAL_SECRET`과 `SUPABASE_SERVICE_ROLE_KEY`가 있어야 동작한다.
- `scripts/check-payment-env.mjs`는 이제 키 존재 여부만 보지 않고 형식도 검사한다.
  - Toss 배포 모드에서는 `NEXT_PUBLIC_PAYMENT_PROVIDER=toss`, `PAYMENT_PROVIDER=toss`까지 함께 검사한다.
  - 키가 있어도 provider가 `mock`이면 실제 배포 전 검사에서 실패하게 한다.
  - Supabase URL은 `https://...supabase.co` 형식이어야 한다.
  - Supabase public key는 publishable key 또는 `anon` JWT여야 한다.
  - Supabase service role key는 `service_role` JWT여야 한다.
  - Toss client/secret key는 `test_` 또는 `live_` 계열의 client/secret 접두사가 맞아야 한다.
  - 키 뒤에 공백, 한글 메모, 잘못 붙은 문자가 있으면 `INVALID`로 실패한다.

## Vercel에 넣어야 하는 환경변수

Vercel Project Settings > Environment Variables에 아래 값을 넣는다.
Production/Preview/Development 모두 같은 테스트 환경을 쓸지, Preview만 테스트 환경을 쓸지는 배포 정책에 맞춰 정한다.

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

## 절대 규칙

- `SUPABASE_SERVICE_ROLE_KEY`는 서버 전용이다. 절대 `NEXT_PUBLIC_`를 붙이지 않는다.
- `TOSS_SECRET_KEY`도 서버 전용이다. 절대 `NEXT_PUBLIC_`를 붙이지 않는다.
- `.env`, `.env.production`, 문서, 테스트 파일, 코드에 실제 secret 값을 쓰지 않는다.
- 공개 가능한 값은 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_TOSS_CLIENT_KEY`뿐이다.
- localStorage나 브라우저 번들에서 secret을 읽으면 안 된다.

## 로컬 확인 명령

현재 로컬 `.env.local`은 gitignore 대상이다.
Toss sandbox를 로컬에서 확인하려면 `.env.local`에 위 환경변수를 넣고 아래를 실행한다.

```bash
npm run check:payment-env -- --provider=toss
npm run check:deploy-readiness
npm run test:config
npm run typecheck
npm run lint
npm run build
```

`npm run check:payment-env -- --provider=toss`가 `MISSING`을 띄우면 키가 빠진 것이다.
`INVALID`를 띄우면 키 값에 잘못 붙은 문자, 잘못된 접두사, 잘못된 JWT role 같은 문제가 있는 것이다.
`npm run check:deploy-readiness`는 git 동기화, Vercel CLI, Vercel link, Toss env, `NEXT_PUBLIC_APP_ORIGIN`까지 한 번에 확인한다.

## 현재 로컬/배포 연결 상태

- `.env.local`에는 Supabase 공개 설정만 있고 Toss 관련 변수는 아직 없다.
- `vercel` CLI는 현재 작업 환경에서 잡히지 않는다.
- `.vercel/project.json`도 없어서 이 폴더는 아직 Vercel 프로젝트와 로컬 link가 되어 있지 않다.
- `npm run check:deploy-readiness` 기준으로 현재 차단점은 Vercel CLI/link, Toss env, 배포 URL origin 설정이다.
- Supabase 플러그인 계정에서는 성준이 넘긴 새 프로젝트가 보이지 않아, 이 세션에서 새 Supabase DB에 migration 적용/조회 검증은 못 했다.
- 따라서 이 상태에서 가능한 검증은 mock 결제, 타입/린트/빌드, 라우트 응답 확인까지다.
- Toss sandbox 결제창 진입 검증은 Vercel env 또는 로컬 `.env.local`에 실제 테스트 키를 넣은 뒤 진행해야 한다.

## 현재 검증 결과

2026-06-23 기준으로 코드 검증은 통과했다.

```text
npm run test:config      pass
npm run test:matching    pass
npm run test:auth        pass
npm run test:profile     pass
npm run typecheck        pass
npm run lint             pass
npm run build            pass
```

로컬 route 확인:

```text
http://localhost:3004/group/create?size=2                         200
http://localhost:3004/group/create?payment=paid&group_id=dev-group 200
http://localhost:3004/match/dev-match-pending                      200
```

## 아직 사용자가 해야 하는 대시보드 작업

1. Vercel 프로젝트를 현재 GitHub 저장소와 연결한다.
2. Vercel Environment Variables에 위 키들을 넣는다.
3. `NEXT_PUBLIC_APP_ORIGIN`은 실제 Vercel 배포 도메인으로 넣는다.
4. Supabase Auth Redirect URL에 아래를 추가한다.
   - `https://<vercel-domain>/auth/callback`
   - `https://<preview-domain>/auth/callback`
5. Toss 개발자센터에서 success/fail URL 허용 정책이 있으면 Vercel 도메인 콜백을 맞춘다.
6. Production 실결제 전에는 Toss test key로 Preview 배포에서 먼저 결제창 진입, 성공 콜백, 환불 API를 확인한다.

## 배포 전 체크리스트

- [ ] `vercel` CLI 설치 또는 GitHub-Vercel 연동 확인
- [ ] `.vercel/project.json` 또는 Vercel Dashboard 프로젝트 연결 확인
- [ ] `npm run check:payment-env -- --provider=toss` 통과
- [ ] Preview URL에서 `/group/create` 보증금 버튼이 Toss 결제창으로 이동
- [ ] Toss 성공 후 원래 화면으로 돌아와 `payment=paid` 안내가 보임
- [ ] 결제 실패/취소 후 원래 화면으로 돌아와 실패 안내가 보임
- [ ] 환불 API는 내부 secret 없이는 403/503으로 막힘
- [ ] 실제 secret 문자열이 git diff, 문서, 테스트 출력에 노출되지 않음

## 다음 작업 후보

- Vercel CLI 설치/로그인 후 프로젝트 link 및 env push
- Preview 배포 생성 후 실제 Toss sandbox 결제창 수동 검증
- 결제 성공 후 `deposits.status=paid`가 Supabase에 반영되는지 확인
- 정상 만남 후 환불 플로우에서 앱 기여금 선택값과 Toss cancel 금액이 일치하는지 E2E 확인

## 2026-06-23 추가 점검

- 이상형 월드컵에서 저장된 기본정보 성별이 없으면 더 이상 `female`로 가정하지 않는다.
- 저장 성별이 없을 때 남자 후보가 뜨던 로컬 검토 오류를 막기 위해, 성별이 없으면 기본정보 저장 안내를 먼저 보여준다.
- 실제 이미지 풀은 `female 64장`, `male 64장` 모두 존재한다.
- 남자로 저장된 경우 월드컵에는 여자 후보 풀이 열려야 하고, 여자로 저장된 경우 남자 후보 풀이 열려야 한다.

## 2026-06-23 추가 배포 점검

- `feat: support group size matching and mixed queue stats` 커밋은 GitHub 원격 브랜치에 push 완료했다.
- `npm run check:payment-env -- --provider=toss`는 이제 provider mode까지 검사한다.
  - 현재 로컬은 Toss 관련 env와 provider mode가 없어서 정상적으로 실패한다.
  - 실패 항목은 키 값이 아니라 키 이름과 상태만 출력한다.
- `npm run check:deploy-readiness`의 Git 동기화 차단점은 push 후 사라졌다.
  - 이후 새 preflight 수정분 때문에 다시 dirty 상태가 되면 Git 항목은 다시 `ACTION_REQUIRED`가 된다.
- 오래 떠 있던 Next dev 서버가 `.next` 청크를 잃어 `/api/notifications/unread-count` 500을 낸 문제가 있었다.
  - 워크스페이스 내부 `.next`만 경로 확인 후 삭제했고, 3004 dev 서버를 새로 띄웠다.
  - 재확인 결과 `/dev/preview`, `/group/create?size=2`, `/match/dev-match-pending`, `/match/dev-match-1` 모두 200이다.

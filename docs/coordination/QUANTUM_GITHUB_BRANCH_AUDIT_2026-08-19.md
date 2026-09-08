# Quantum GitHub 브랜치 통합 감사

> 상태: `DRAFT_PR_GREEN`
> 기준일: 2026-08-19
> 통합 브랜치: `codex/main-integration-20260819`
> 원격 통합 브랜치: `origin/codex/main-integration-20260819`
> 원격 `main` 직접 push 및 원격 브랜치 삭제: 수행하지 않음

## 1. 고정한 기준점

| 구분 | 브랜치 / 경로 | SHA / 상태 | 역할 |
| --- | --- | --- | --- |
| 원격 배포 기준 | `origin/main` | `e25aec55` | 통합 이력의 부모 |
| 최신 제품 기준 | `codex/quantum-active-clean` | `9ed6e76d` | 리베이스에 사용한 제품 코드와 검증 자료 |
| 공통 조상 | 양 브랜치 merge-base | `da31dfda` | 분기 전 기준 |
| 과거 혼합 접수함 | `C:\데이팅앱만들기` | 추적 변경 49, 미추적 249 | 코드 통합에 사용하지 않고 그대로 보존 |
| 삭제 없는 보관소 | `C:\QuantumArchive\2026-08-19-workspace-reconciliation` | 8,289개 / 369,627,772 bytes | Git 비대상 자료 보존 |
| 격리 통합 공간 | `C:\Users\82108\.config\superpowers\worktrees\데이팅앱만들기\quantum-main-integration-20260819` | 코드 HEAD `c3206160` | 이번 통합 전용 |

## 2. 커밋 중복과 고유 변경

- `origin/main` 고유 커밋: 32개
- 최신 제품 브랜치 고유 커밋: 80개
- 패치 내용이 동일한 양쪽 커밋: 15쌍
- 패치 중복을 제외한 `main` 고유 변경: 15개
- 패치 중복을 제외한 최신 제품 고유 변경: 65개

단순 merge는 인증, API, 화면, 마이그레이션, 의존성 파일 등 90개 이상의 충돌을 만든다. 따라서 동일 패치 15개를 자동으로 건너뛰고 최신 제품 고유 변경만 `origin/main` 위에 재배치한다.

재배치와 후속 수정이 끝난 코드 HEAD `c3206160`는 `origin/main`보다 71개 커밋 앞서고, 비교 범위 `origin/main...HEAD`에는 780개 파일이 포함된다. `origin/main`이 통합 결과의 조상임을 직접 확인했다.

## 3. 원격 브랜치 분류

### INTEGRATE

| 소스 | 처리 |
| --- | --- |
| `origin/main` | 이력 기준으로 전부 보존 |
| `codex/quantum-active-clean` | 패치 중복 15개를 제외한 고유 변경 65개 재배치 |
| `origin/codex/google-auth-provider-guard` | 현재 OAuth 구현과 비교 후 누락된 fail-closed 동작만 별도 통합 |

Google 전용 브랜치를 그대로 합치지 않고 Google·Kakao 모두를 사전 확인하는 일반화된 구현으로 통합했다. 통합 커밋은 `aa90cc6e`이며, 제공자 비활성 시 OAuth 이동을 시작하지 않고 이메일 로그인을 안내한다.

### DELETE_CANDIDATE_AFTER_MERGE

아래 브랜치는 패치가 `main` 또는 최신 제품 코드에 이미 흡수됐거나 현재 통합 결과의 조상이 된다. 통합 브랜치 push와 PR 검토 전에는 삭제하지 않는다.

- `origin/codex/campus-eats-url-hotfix`
- `origin/codex/frontend-flow-polish`
- `origin/codex/full-nav-public-meetup-actions`
- `origin/codex/preserve-auth-query-redirect`
- `origin/codex/production-security-final-audit`
- `origin/codex/quantum-layout-metadata`
- `origin/codex/quantum-release-preview`
- `origin/dev`
- `origin/profile/appearance-ai`
- `origin/profile/post-worldcup-decisions-2026-05-21`
- `origin/profile/worldcup-ui`

### PRESERVE_REMOTE

아래 브랜치는 현재 제품에 기능이 더 새 형태로 존재하거나 역사·연구 가치가 있지만, 자동 통합하면 구형 UI, 테스트 페이지, 프로토타입 또는 중복 마이그레이션이 다시 들어올 수 있다.

- `origin/codex/daily-card-notification-api`: 현재 제품에 후속 알림 동기화와 멱등성 마이그레이션이 존재함
- `origin/codex/quantum-handphone`: 결제·모바일 앨범·AI Vercel·학과 데이터 패치가 현재 통합본에 후속 형태로 존재하지만 패치 해시가 달라 PR 검토 전까지 원격 보존
- `origin/codex/quantum-frontend-clean`: Peach Air 디자인으로 대체된 이전 테마
- `origin/codex/remove-school-email-gate`: `main`의 PR 버전과 테스트 차이를 별도 확인할 때까지 보존
- `origin/codex/조사방`, `origin/codex/통계정리`: 조사·통계·마스코트 실험 이력
- `origin/docs/design-handoff-chunghyun`: 과거 결제 시험 페이지와 디자인 인수인계 이력
- `origin/feature/claude/clip-classifier`
- `origin/feature/claude/gpt-scorer`
- `origin/feature/claude/v1.5-protocol`
- `origin/feature/codex/images-128`
- `origin/matching/group-engine`: 현재 통합 마이그레이션이 해당 스키마를 이미 명시적으로 흡수함

## 4. 충돌 처리 원칙

1. 파일 전체를 `ours` 또는 `theirs`로 일괄 선택하지 않는다.
2. `main`의 인증 리다이렉트, URL 쿼리 보존, 학교 이메일 게이트 폐기, Next 보안 업그레이드를 유지한다.
3. 최신 제품의 서버 전용 Supabase 경계, 비공개 외모점수, 참가자 신원 비공개, 모바일 및 이벤트 수명주기를 유지한다.
4. 마이그레이션은 내용과 적용 순서를 비교하며, 이미 공개된 타임스탬프를 임의로 바꾸거나 삭제하지 않는다.
5. `package-lock.json`은 최종 `package.json`에서 다시 생성한다.
6. 통합 후 원격 `main`이 통합 브랜치의 조상인지 확인한다.

## 5. 검증 대장

| 항목 | 상태 | 근거 |
| --- | --- | --- |
| 브랜치·SHA·merge-base 확인 | PASS | 로컬 Git 및 원격 refs 직접 조회 |
| 패치 동등성 확인 | PASS | `git cherry` 양방향 비교 |
| 통합 브랜치 clean 생성 | PASS | 생성 직후 변경 0, 미추적 0 |
| `origin/main` 기반 이력 재배치 | PASS | 제품 고유 변경 재배치 완료, `origin/main` 조상 확인 |
| 충돌 해결 및 conflict marker 검사 | PASS | 표식 0건, `git diff --check` 통과 |
| Node 전체 테스트 | PASS | auth 18 + config 283 + matching 413 + profile 131 = 845/845 |
| TypeScript / lint / build | PASS | 타입 오류 0, ESLint 경고·오류 0, Next 생산 빌드 성공 |
| 모바일 테스트 / Expo Doctor | PASS_WITH_RISK | 153/153, 타입 검사 통과, Expo Doctor 21/21; 의존성 감사 22건 별도 기록 |
| Python 테스트 | PASS_WITH_SKIP | 66 통과, 17 legacy PyTorch 제외, Ruff 통과 |
| 비밀정보 / DB 권한 경계 검사 | PASS_LOCAL | 추적 비밀정보 0건, Node 운영 의존성 취약점 0건, 관련 소스 계약 테스트 통과 |
| GitHub 통합 브랜치 push | PASS | `origin/codex/main-integration-20260819` 게시 및 upstream 연결 완료 |
| GitHub 초안 PR | PASS | PR #14, base `main`, head `codex/main-integration-20260819`, mergeable 확인 |
| GitHub Actions | PASS | 최신 PR 워크플로: Next.js 타입·845개 테스트·lint, Python Ruff·pytest 모두 성공 |
| Vercel 미리보기 | PASS_PREVIEW | PR #14 미리보기 배포 `Ready`; 운영 배포 증거는 아님 |
| `main` push | BLOCKED | 사용자 별도 승인 필요 |
| 원격 브랜치 삭제 | BLOCKED | PR 및 최종 통합 이후 승인 필요 |

## 6. 검증 중 발견하고 수정한 통합 문제

1. `app/api/deposits/route.ts`가 모바일 Bearer 토큰을 받는 request-scoped 클라이언트를 import하고도 cookie 전용 클라이언트를 호출하던 충돌 잔재를 수정했다.
2. 현재 모임 화면이 `MeetupHub`로 이동했는데 검사가 삭제된 과거 페이지 구조를 보던 문제를 수정했다. 로그인과 모임 만들기 이동은 쿼리 보존을 위해 document navigation을 유지한다.
3. Python 소스 검사가 폐기된 `성향 설문` 가입 단계를 기대하던 문제를 현재 계약인 `기본정보 -> 이상형 월드컵 -> 사진`으로 맞췄다.
4. Google 제공자만 확인하던 원격 수정은 Google·Kakao 공통 fail-closed 검사로 일반화했다.
5. 빌드가 자동 변경한 `next-env.d.ts`와 `tsconfig.json`은 검증 결과물에 포함하지 않고 원래 Git 상태로 복원했다.
6. 첫 GitHub Actions 실행의 결제 환경 테스트 1건이 CI의 placeholder publishable key를 상속해 의도와 다른 사유로 실패했다. 결제 테스트가 Supabase 공개 키 환경을 명시적으로 격리하도록 수정했고, 같은 CI 환경을 로컬에서 재현한 뒤 최신 PR 워크플로 전체 성공을 확인했다.

## 7. 남은 배포·운영 위험

- `npm run check:deploy-readiness`는 Vercel CLI 로그인, 프로젝트 링크, Toss/Supabase 운영 환경값, `AI_SERVER_URL`, `AI_SERVER_SECRET`, `NEXT_PUBLIC_APP_ORIGIN`이 없어 차단된다.
- 모바일 `npm audit`은 Expo/React Native 전이 의존성에서 moderate 8건, high 14건을 보고한다. 자동 수정안이 Expo 53·React Native 0.72로 큰 폭 하향하므로 강제 적용하지 않았다.
- Python 테스트는 OpenAI 운영 경로 66건을 통과했지만 legacy PyTorch 모델 17건은 런타임 이미지에서 제외된다. FastAPI TestClient의 `httpx` 전환 경고 1건이 남는다.
- Supabase 마이그레이션의 원격 적용, 실제 RLS, 실제 계정 다중 E2E, Toss 승인·환불·이월, 실제 OpenAI 사진 분석, APK/AAB 실기기 설치는 이 로컬 통합 검증의 증거가 아니다.
- 원격 브랜치는 이번 단계에서 삭제하지 않는다. 통합 PR 검토 후 흡수 확인표를 기준으로 별도 승인받아 정리한다.

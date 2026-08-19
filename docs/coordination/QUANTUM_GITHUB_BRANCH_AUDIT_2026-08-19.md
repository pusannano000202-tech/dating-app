# Quantum GitHub 브랜치 통합 감사

> 상태: `IN_PROGRESS`
> 기준일: 2026-08-19
> 통합 브랜치: `codex/main-integration-20260819`
> 원격 `main` 직접 push 및 원격 브랜치 삭제: 수행하지 않음

## 1. 고정한 기준점

| 구분 | 브랜치 / 경로 | SHA / 상태 | 역할 |
| --- | --- | --- | --- |
| 원격 배포 기준 | `origin/main` | `e25aec55` | 통합 이력의 부모 |
| 최신 제품 기준 | `codex/quantum-active-clean` | `9ed6e76d` | 현재 제품 코드와 검증 자료 |
| 공통 조상 | 양 브랜치 merge-base | `da31dfda` | 분기 전 기준 |
| 과거 혼합 접수함 | `C:\데이팅앱만들기` | 추적 변경 49, 미추적 249 | 코드 통합에 사용하지 않음 |
| 삭제 없는 보관소 | `C:\QuantumArchive\2026-08-19-workspace-reconciliation` | 8,287개 / 349.46 MiB | Git 비대상 자료 보존 |
| 격리 통합 공간 | `C:\Users\82108\.config\superpowers\worktrees\데이팅앱만들기\quantum-main-integration-20260819` | 생성 시 clean | 이번 통합 전용 |

## 2. 커밋 중복과 고유 변경

- `origin/main` 고유 커밋: 32개
- 최신 제품 브랜치 고유 커밋: 80개
- 패치 내용이 동일한 양쪽 커밋: 15쌍
- 패치 중복을 제외한 `main` 고유 변경: 15개
- 패치 중복을 제외한 최신 제품 고유 변경: 65개

단순 merge는 인증, API, 화면, 마이그레이션, 의존성 파일 등 90개 이상의 충돌을 만든다. 따라서 동일 패치 15개를 자동으로 건너뛰고 최신 제품 고유 변경만 `origin/main` 위에 재배치한다.

## 3. 원격 브랜치 분류

### INTEGRATE

| 소스 | 처리 |
| --- | --- |
| `origin/main` | 이력 기준으로 전부 보존 |
| `codex/quantum-active-clean` | 패치 중복 15개를 제외한 고유 변경 65개 재배치 |
| `origin/codex/google-auth-provider-guard` | 현재 OAuth 구현과 비교 후 누락된 fail-closed 동작만 별도 통합 |

### DELETE_CANDIDATE_AFTER_MERGE

아래 브랜치는 패치가 `main` 또는 최신 제품 코드에 이미 흡수됐거나 현재 통합 결과의 조상이 된다. 통합 브랜치 push와 PR 검토 전에는 삭제하지 않는다.

- `origin/codex/campus-eats-url-hotfix`
- `origin/codex/frontend-flow-polish`
- `origin/codex/full-nav-public-meetup-actions`
- `origin/codex/preserve-auth-query-redirect`
- `origin/codex/production-security-final-audit`
- `origin/codex/quantum-handphone`
- `origin/codex/quantum-layout-metadata`
- `origin/codex/quantum-release-preview`
- `origin/dev`
- `origin/profile/appearance-ai`
- `origin/profile/post-worldcup-decisions-2026-05-21`
- `origin/profile/worldcup-ui`

### PRESERVE_REMOTE

아래 브랜치는 현재 제품에 기능이 더 새 형태로 존재하거나 역사·연구 가치가 있지만, 자동 통합하면 구형 UI, 테스트 페이지, 프로토타입 또는 중복 마이그레이션이 다시 들어올 수 있다.

- `origin/codex/daily-card-notification-api`: 현재 제품에 후속 알림 동기화와 멱등성 마이그레이션이 존재함
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
| `origin/main` 기반 이력 재배치 | PENDING | 리베이스 전 |
| 충돌 해결 및 conflict marker 검사 | PENDING | 리베이스 전 |
| Node 전체 테스트 | PENDING | 통합 후 실행 |
| TypeScript / lint / build | PENDING | 통합 후 실행 |
| 모바일 테스트 / Expo Doctor | PENDING | 통합 후 실행 |
| Python 테스트 | PENDING | 통합 후 실행 |
| 비밀정보 / DB 권한 경계 검사 | PENDING | 통합 후 실행 |
| GitHub 통합 브랜치 push | PENDING | 로컬 검증 후 수행 |
| `main` push | BLOCKED | 사용자 별도 승인 필요 |
| 원격 브랜치 삭제 | BLOCKED | PR 및 최종 통합 이후 승인 필요 |


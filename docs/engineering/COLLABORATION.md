# Quantum 작업·협업 가이드

## 1. 현재 적용 규칙

기본값은 **solo-owner + 격리 작업공간**이다. 한 작업의 새 변경은 사용자가 지정한 격리 worktree/checkout에서만 다루며, 현재 루트의 더티 변경은 사용자 소유 자료로 보존한다. 과거의 2인·6인 운영 규칙은 보관 문서에만 남기며 현재 작업에는 적용하지 않는다.

### 승인 경계

사용자의 명시적 승인이 있기 전에는 다음을 하지 않는다.

- `git add`, commit, push, branch 전환·rebase·merge·reset·stash·clean
- Supabase migration 원격 적용 또는 원격 DB/Auth/Storage/RLS/RPC 변경
- 실제 결제 승인·취소·환불·이월 처리
- Vercel, EAS, Play Console 등 배포·제출·운영 설정 변경

코드·문서 수정 승인은 위 행위의 승인이 아니다. Git 기록, 원격 DB, 결제, 배포는 각각 명시된 별도 승인 범위를 요구한다.

### 시작과 종료

작업 시작 시 실제 작업공간 경로, `git status --short --branch`, HEAD, 최근 커밋, staged/unstaged/untracked 변경, 대상 파일의 기존 diff를 확인한다. 원격·배포·결제 작업이면 대상 계정/프로젝트·권한·현재 상태를 다시 확인한다. 이전 보고의 SHA, migration 수, 배포 상태는 현재 근거가 아니다.

현재 루트가 더티면 새 기능을 기본적으로 그 위에 섞지 않는다. `artifacts/qa/`, `reference-inputs/`, `references/`, `vite-map*.log`와 범위 밖 변경은 보호하며, 명시적 허용 목록 없이 stage·이동·삭제·포맷하지 않는다. stage가 승인된 경우에도 대상 파일과 diff를 먼저 확인하고 `git add .` 같은 범위 넓은 명령은 쓰지 않는다.

종료 시에는 변경 범위, 실제 검증 명령/결과, 미검증 경계, 다음에 필요한 승인만 보고한다. 로컬 테스트·HTTP 200·정적 캡처·문서 작성은 원격 적용·운영·실계정·실기기 완료의 증거가 아니다.

### 위험 표면과 migration

`supabase/migrations/`, DB/API route, RLS/RPC, 인증, 결제, 배포 설정, `lib/types.ts`, `lib/supabase.ts`, `lib/constants.ts`, `app/layout.tsx`, `app/page.tsx`, `package.json`, lockfile은 별도 영향 분석과 명시적 승인이 필요한 위험 표면이다.

`docs/engineering/INTERFACE_CONTRACT.md`의 타입·컬럼명·함수 시그니처는 임의 변경하지 않는다. 새 migration 파일명은 14자리 UTC 타임스탬프 `YYYYMMDDHHMMSS_영역_설명.sql`을 사용한다. 로컬 파일 생성, 원격 적용, 실계정 검증, main 반영은 서로 별개 상태·승인 단계다.

---

## 2. 레거시 기록

과거의 2인·6인 운영, `dev` 중심 브랜치, 매일 pull/rebase/push, 상대방 리뷰 강제는 현재 실행 규칙이 아니다. 실행 가능한 과거 명령은 활성 문서에서 제거했다.

역사적 배경은 `docs/archive/COLLABORATION_LEGACY_2PERSON.md`에서 확인한다. 현재 작업에는 위 **현재 적용 규칙**만 사용한다.

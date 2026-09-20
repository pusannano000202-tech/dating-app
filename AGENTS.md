# Quantum 작업 기준

## 현재 운영 기준 (우선 적용)

이 작업공간의 기본 운영은 **solo-owner + 격리 작업공간**이다. 최신 사용자의 명시적 결정과 승인 범위가 과거 문서·핸드오프·스냅샷보다 우선한다.

### 협업 브랜치 기준 (2026-09-20)

- 현재 인수인계는 `docs/handoff/active/COLLABORATION_BRANCH_2026-09-20.md`를 따른다. 이 브랜치는 GitHub 코드 공유용이며 출시 완료본이 아니다.
- `quantum-model-router`와 `quauntum-work-union-progress`, 이에 종속된 모델 고정 배정·연합 절차는 폐기됐다. 과거 파일에 남아 있어도 호출하거나 복원하지 않는다.
- 독립 검토는 필요할 때 Codex의 별도 맥락에서 수행한다. 다른 AI 서비스로 소스를 보내거나 모델 설정을 임의 변경하지 않는다.
- 다른 작성자의 미커밋 작업·QA 자료를 섞거나 삭제하지 않는다. 공유 브랜치 업로드와 main 병합·원격 DB 변경·실결제·배포는 별개 승인 범위다.

- 새 구현은 사용자가 지시하지 않으면 현재 더티 루트가 아닌 격리 작업공간에서 시작한다. 기존 더티 변경은 사용자 소유 자료로 보존하며 이동·삭제·되돌리거나 새 변경에 섞지 않는다.
- 실행에 따라 달라지는 사실(작업공간 경로, branch/HEAD/upstream, worktree, staged·unstaged·untracked 상태, 원격 DB·배포·결제 상태)은 실행 직전에 다시 확인한다. 이전 보고의 SHA나 상태를 현재 근거로 재사용하지 않는다.
- 변경 구현 승인은 `git add`, commit, push, migration 원격 적용, 실제 결제 승인·취소·환불, 배포 승인이 아니다. 각각은 사용자 명시적 승인이 있어야 한다.
- 읽기·조사 요청은 읽기 전용이다. 수정, stage, commit, push, migration 적용, 실제 결제, 배포를 하지 않는다.

### 작업 유형별 최소 필독 문서

| 작업 유형 | 반드시 읽을 문서/상태 |
| --- | --- |
| 모든 작업 | 이 파일, 사용자가 지정한 정확한 작업공간, 현재 Git 상태 |
| 일반 로컬 UI·콘텐츠·코드 | 대상 route/component와 최신 사용자 결정·활성 결정 장부. Git·worktree 작업이 없으면 협업 문서 전체를 다시 읽지 않는다. |
| Git·worktree·충돌 조정 | 모든 작업 항목 + `docs/engineering/COLLABORATION.md` |
| 타입·DB·API·인증·결제 | 모든 작업 항목 + `docs/engineering/INTERFACE_CONTRACT.md`, 관련 migration/RLS/RPC 코드와 적용 상태. Git 조작이 있을 때만 협업 문서를 추가한다. |
| 배포·릴리스·원격 점검 | 모든 작업 항목 + `docs/engineering/COLLABORATION.md`, `docs/coordination/QUANTUM_SOURCE_OF_TRUTH.md`; GitHub/Supabase/Vercel/EAS의 라이브 상태를 별도 확인 |
| 작업 분업·별도 작업방의 부모 | 모든 작업 항목 + 대상 작업의 범위·소유 파일·검증 기준. 별도 사용자 작업방·승인 보고가 필요할 때만 보고 스킬을 추가한다. |
| 범위가 정해진 내부 자식 | 부모가 전달한 계약과 대상 파일만 확인한다. 요청·범위·위험이 같다면 공통 문서를 반복해서 읽지 않는다. |

### 위험 표면과 보호 대상

- `supabase/migrations/`, `lib/types.ts`, `lib/supabase.ts`, DB/API route, 인증·RLS·결제·배포 설정, `app/layout.tsx`, `app/page.tsx`, `package.json`/lockfile은 위험 표면이다. 영향과 검증 계획을 확인하고 승인된 범위에서만 바꾼다.
- 인터페이스 계약의 타입·컬럼명·함수 시그니처는 임의 변경하지 않는다. 새 migration은 14자리 UTC 타임스탬프 `YYYYMMDDHHMMSS_영역_설명.sql`을 사용하며, 파일 생성·원격 적용·main 반영은 별개 승인 단계다.
- 더티 트리의 사용자 파일, `artifacts/qa/`, `reference-inputs/`, `references/`, `vite-map*.log`는 보호 대상이다. 허용 목록 없이 stage하거나 범위 밖 파일을 수정하지 않는다.

### 완료 보고

- 변경한 내용, 검증한 내용, 발견한 문제와 수정 내용, 남은 위험 또는 미검증 사항을 구분한다.
- 로컬·원격·브라우저·실계정·실기기 증거를 섞지 않는다. 테스트·HTTP 200·문서만으로 배포 또는 운영 완료라고 말하지 않는다.

## 레거시 기록

과거의 2인 담당자 배정, `dev` 중심 브랜치, 매일 push, 상대방 리뷰 강제는 현재 실행 규칙이 아니다. 역사적 내용은 Git 이력과 `docs/engineering/COLLABORATION.md`의 레거시 부록에서만 확인하며, 현재 작업 지시로 재사용하지 않는다.

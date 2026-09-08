# Quantum 과거 2인 협업 규칙 기록

> 상태: `ARCHIVED` (2026-08-30)
>
> 이 문서는 과거의 충현/성준 2인 운영과 `main → dev → feature`, 상대방 리뷰, 매일 push 관행이 존재했다는 사실만 보존한다. 현재 작업 지침이 아니며, 아래 항목을 실행 명령으로 사용하지 않는다.

## 당시 운영의 핵심 특징

- 프로필·외모 영역과 그룹·매칭 영역을 사람 이름으로 나누었다.
- `dev` 통합 브랜치와 feature 브랜치, PR·상대방 리뷰를 기본값으로 사용했다.
- 매일 pull/rebase/push와 주차별 동기화를 전제로 했다.
- 공용 타입, migration, Supabase 클라이언트, 루트 레이아웃, lockfile을 주요 충돌 지점으로 보았다.
- 2026-07-07 이후 solo-owner 예외를 덧붙였지만, 현재의 격리 작업공간·별도 승인 체계와는 맞지 않는다.

## 현재 대체 규칙

현재 실행 기준은 `AGENTS.md`와 `docs/engineering/COLLABORATION.md`를 따른다. 특히 다음이 우선한다.

- solo-owner + 격리 작업공간
- 더티 변경과 사용자 QA·참조 자료 보호
- 코드 수정과 stage/commit/push, 원격 DB, 결제, 배포 승인의 분리
- 실행 직전 실제 branch/HEAD/dirty/원격 상태 재확인
- 공용 타입·DB/RLS·인증·결제·개인정보의 독립 검토

실행 가능한 과거 명령을 확인해야 하는 역사 조사에만 이 파일이 추가된 Git 커밋의 직전 `docs/engineering/COLLABORATION.md` 이력을 읽는다. 그 내용을 현재 작업에 재사용하려면 사용자의 새 명시 결정이 필요하다.

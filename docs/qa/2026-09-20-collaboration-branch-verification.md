# 협업 브랜치 공유 검증 — 2026-09-20

## 범위와 판정

**개발 소스 공유 범위 내 확인. 출시·main 통합 완료 판정이 아니다.**

- 대상: `codex/collab-app-20260920`, 기존 기준 `32563ad3e7c5f7d0c7b66958548b98c01c266835` + 아래 공유 변경.
- 원격 main 확인값: `e25aec55e127a640ed8b718f2a21590979232237`.
- 원본 격리 작업본의 변경 파일 167개를 SHA256 대조 후 별도 협업 작업본에 복사했다. 원본 167개는 재확인 시 모두 변경 없이 유지됐다.
- 로컬 자동생성 `next-env.d.ts`, 로컬 출력 경로만 추가한 `tsconfig.json`, 기존 `design-qa.md` 변경은 이번 커밋에서 제외했다. 기존 추적 버전은 보존한다.
- 실제 환경변수, 로그인/DB 자료, QA 캡처, `.tmp`, `artifacts`, `node_modules`는 올리지 않는다.
- 새 UI를 재설계하거나 매칭 엔진·원격 DB·실결제를 변경한 작업이 아니다.

## 공유에 포함한 내용

- 기존 홈·모임·커뮤니티·채팅을 포함한 작업본의 이력을 보존한다.
- 학과 리그 마스코트·내 팀·모집/대기판, 이벤트/커플 캘린더, 오늘밤 참가 준비·기존 신청·초대·다음 행동 연결.
- 해당 API·forward migration 6개·이미지 자산·회귀 테스트·기존 구현 계획. Migration은 파일 공유이며 DB 적용이 아니다.
- 친구용 인수인계, 최신 폐기 규칙을 반영한 AGENTS 보충, 정확한 협업 브랜치만 자동 배포를 막는 Vercel Git 설정.

## 실제 로컬 검사

환경: Windows, Node 24.14.1, 잠금파일에 대응하는 기존 의존성. 격리 PGlite·합성 계정·가짜 결제 공급자를 사용했다. 빌드는 실제 Supabase 대신 placeholder 설정과 결제/자동화 비활성 환경에서 수행했다.

| 검사 | 결과 |
| --- | --- |
| `npm run typecheck` | PASS, exit 0 |
| `npm run build` | PASS, exit 0. 새 경로를 포함한 production build 생성 |
| `npm run lint` | exit 0, 경고 21개 잔존. 경고 0개 판정이 아님 |
| `npm audit --audit-level=high` | exit 0, 검사 당시 알려진 취약점 0 |
| tracked + intended untracked secret scan | PASS, exit 0 |
| 아직 원격 main에 없는 기존 커밋 7개 비밀 패턴 검사 | 텍스트 diff 구간 2,317개, 탐지 0 |
| `python scripts/verify-migrations.py --baseline scripts/migration-warning-baseline.json` | PASS, 280개 파일. 기존 baseline 경고 10개 잔존; DB 실행 검증 아님 |
| 새 리그·캘린더·오늘밤 관련 `.test.mjs` 묶음 | 383/383 PASS, exit 0 |
| `tests/matching-focused/tsconfig.json` 컴파일 및 순수 로직 검사 | 33/33 PASS, exit 0 |
| 배포 경계 테스트 | 1/1 PASS. 정확한 branch=false, main 미지정 |
| `git diff --check` | PASS |

### 전체 앱 테스트 구성 묶음

첫 `npm test` 실행에서 오래된 화면 구조 검사들이 실패했다. 아래 수정 후 실패한 묶음을 재실행했고, 앞에서 성공한 동일 코드의 묶음은 재사용했다. 한 번의 `npm test`가 끝까지 성공한 실행 기록과 혼동하지 않는다.

| 묶음 | 최종 근거 |
| --- | --- |
| auth | 172/172 PASS |
| config | 701 PASS, PostgreSQL 실제 두 세션 동시성 검사 1개 SKIP |
| matching | 878/878 PASS (수정 후 재실행) |
| profile | 143/143 PASS |
| friends | 15/15 PASS |
| account | 20/20 PASS |
| voice | 50/50 PASS |
| social ledgers | 118/118 PASS (줄바꿈 수정 후 재실행) |
| content journey | 118/118 PASS |

서로 중복되는 회귀/독립 검사를 합산해 고유 검증 수처럼 표현하지 않는다.

## 발견한 문제와 수정

1. 예전 화면의 inline weekly 전환, 고정 일정 문구, 날짜 없는 커플 신청 RPC를 요구하던 검사 5개가 승인된 캘린더 흐름과 맞지 않았다. 새 진입 링크·사진·날짜/보증금 경계·파트너 직접 동의·상대 개인정보 비노출을 확인하도록 테스트만 수정했다. 제품 코드를 예전 방식으로 되돌리지 않았다.
2. Windows Git의 CRLF 체크아웃 때문에 보이스 소스의 줄바꿈을 문자 그대로 찾는 검사 3개가 실패했다. 테스트 입력만 LF로 정규화했다. 권한/세션/마이크 검사 조건은 제거하거나 완화하지 않았다. 해당 테스트 12개 재실행 통과.
3. 커플 API 파일 끝의 추가 빈 줄을 제거했다. 독립 확인 결과 줄바꿈·마지막 공백 외 논리 변경 없음.
4. 예전 AGENTS가 폐기된 모델 라우터를 요구했다. 최신 사용자 지시를 우선하는 협업 보충과 분업 표로 고쳤다. 과거 이력의 파일을 현재 절차로 실행하지 않는다.
5. Vercel 관리 API 인증을 확인할 수 없어, 이 협업 브랜치에 한정한 Git 자동 배포 차단을 코드에 추가했다. 기존 cron 15개는 HEAD와 구조적으로 동일하고 main의 설정은 건드리지 않는다.

배포 규칙은 [Vercel 공식 문서](https://vercel.com/docs/project-configuration/git-configuration#git.deploymentenabled)의 `git.deploymentEnabled`를 사용한다. 지정하지 않은 다른 브랜치의 배포를 차단하는 설정이 아니므로 새 작업 브랜치는 따로 확인한다.

## 독립 검토

- 처음 복사한 167개 파일의 시작·종료 해시 일치, 관련 로컬 import 364개 누락 없음.
- 캘린더 결제/환불·계정 소유권·운영자 권한·다중 팀 SQL fixture 39/39 PASS.
- 추가 패키징 검토에서 config/배포 경계 6/6 PASS, cron 15개 보존 확인.
- 고정된 해당 범위에서 소스 공유를 막을 필수 수정 사항을 찾지 못했다. 이후 매칭 테스트 3개 파일·보이스 줄바꿈 테스트 수정은 주 담당자가 diff와 재실행 결과로 확인했다.

## 남은 위험과 미검증

- lint 경고 21개, migration baseline 경고 10개, 실제 PostgreSQL 두 세션 동시성 검사 1개 미실행.
- 패턴 비밀 검사는 완전한 정보유출 부재 증명이 아니다. 전체 과거 Git 이력·바이너리 이미지 개인정보 감사는 수행하지 않았다.
- 오늘밤 일반 안내 카드가 원래 달무티/비공개 다음 게임 투표 전체 런타임을 대신하지 않는다. 기존 회차 진입·투표 연결은 후속 작업으로 남는다.
- 신규 migration의 원격 적용, 실계정 신청/다중 팀 전체, 실제 결제·반환·휴대폰 알림, Vercel 운영 환경·배포는 미검증이며 실행하지 않았다.
- 기존 3013 로컬 런타임을 이 작업에서 3010으로 전환하거나 다시 실행하지 않았다. 친구의 로컬 로그인/DB 설정도 별도 준비가 필요하다.
- 이번 턴은 소스 공유와 패키징 검사로, 새로운 모바일/데스크톱 UI 클릭 검증이나 캡처를 수행한 것으로 보고하지 않는다.

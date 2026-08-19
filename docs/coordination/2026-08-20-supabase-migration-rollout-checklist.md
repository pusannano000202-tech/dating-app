# Quantum Supabase 마이그레이션 적용 체크리스트

> 작성일: 2026-08-20 (Asia/Seoul)
> 통합 브랜치: `codex/main-integration-20260819`
> 기준 HEAD(감사 시작): `d780e63901b00c257b6ee730d2e4e44fd2da53b6`
> 원격 기준: `origin/main@e25aec55e127a640ed8b718f2a21590979232237`
> 대상 프로젝트: `jyfwcanjqwboyvicoafm` (`quantum-production`)
> 원칙: 운영 DB에 바로 적용하지 않는다. Supabase 개발 브랜치는 Free 플랜에서
> 생성할 수 없어, 로컬 Supabase 격리 DB에서 전체 재현을 먼저 검증한다.

## 1. 현재 판정

| 단계 | 상태 | 근거 |
| --- | --- | --- |
| Git 기준점 고정 | 완료 | 깨끗한 통합 worktree와 브랜치·HEAD·origin/main 확인 |
| 원격 프로젝트 식별 | 완료 | 연결 가능한 프로젝트가 `quantum-production` 한 곳이며 기존 app ref와 일치 |
| 마이그레이션 이력 감사 | 완료 | 원격 160건과 로컬 이력을 비교하고 누락 이력 3건의 원본 보존·재생용 marker 분리 완료 |
| 새 마이그레이션 정적 보안 감사 | 완료 | private 저장소, RLS, 고정 search_path, 최소 권한, auth.uid() 경계 확인 |
| 격리 테스트 브랜치 생성 | 차단 | 비용 승인 후 생성 요청했으나 Free 플랜은 Branching 미지원. 브랜치·과금 모두 생성되지 않음 |
| 로컬 격리 DB 적용 | 완료 | Docker PostgreSQL 17에서 161/161 migration을 빈 DB부터 반복 재생 |
| 이벤트룸 다계정 E2E | 완료 | 로컬 8계정으로 초대·알림·정원·다음 방·익명 카드·역할·취소·정리 확인 |
| 완료 후 역할 맞히기·프로필 공개 E2E | 미검증 | 완료 상태를 만드는 운영자 전환과 실제 화면 흐름은 별도 검증 필요 |
| 운영 적용 | 금지 상태 | 테스트 결과와 별도 승인 전까지 수행하지 않음 |
| PR 병합 | 금지 상태 | 원격 DB·E2E 결과와 사용자 승인 전까지 초안 유지 |

## 2. 마이그레이션 계보 감사

### 확인된 상태

- 원격 적용 이력: 160건
- 감사 시작 시 통합 브랜치 SQL: 158개
- 원격에는 있고 통합 브랜치에서 빠졌던 SQL 3개를 기존 Git 이력에서 복원했다.
  - `20260811133408_quantum_event_match_finalization_uuid_fix.sql`
  - `20260811133602_quantum_event_match_finalization_service_acl.sql`
  - `20260811133750_quantum_event_match_finalization_qa_cleanup.sql`
- 최초 빈 DB 재생에서 세 파일의 timestamp가 선행 테이블 생성보다 빨라
  `quantum_event_occurrences` 부재로 실패하는 이력 결함을 확인했다.
- 정확한 복원 원본은 `supabase/remote-migration-archive/`에 보존하고, migration
  디렉터리의 같은 버전 파일은 이력 marker로 바꿨다. 최종 SQL 본문은 이후의
  `20260811222316_quantum_event_match_finalization.sql`과 동일하게 재생된다.
- 아직 원격에 적용되지 않은 신규 SQL은
  `20260814030000_matching_profile_preference_secret_roles.sql`이다.

### 자동 db push 차단 사유

원격 이력과 현재 파일이 다음 세 형태로 섞여 있다.

1. CLI 방식으로 버전과 이름이 정확히 대응하는 항목 112개
2. 원본 파일명 전체가 원격 `name`에 기록된 수동 적용 항목 6개
3. 논리 이름은 같지만 원격 적용 버전과 로컬 파일 timestamp가 다른 항목 42개

3번은 스키마가 없다는 뜻은 아니지만, Supabase CLI가 로컬 버전을 새 migration으로
판단할 수 있다. 따라서 운영 프로젝트에 `db push`를 실행하지 않는다. 테스트
브랜치에서 실제 dry-run 또는 migration-history repair 시뮬레이션으로 재실행 여부를
확인한 뒤 계보 정리 방식을 결정한다.

## 3. 원격 보안·성능 기준선

### Security Advisor

| 경고 | 수량 | 처리 원칙 |
| --- | ---: | --- |
| RLS 활성화, 정책 없음 | 41 | 서버 전용/RPC 전용 테이블인지 분류 후 직접 정책 추가 또는 의도 문서화 |
| authenticated 실행 가능 SECURITY DEFINER | 123 | 일괄 revoke 금지. 소유권 검사·search_path·반환 데이터·호출 주체를 함수별 감사 |
| 유출 비밀번호 보호 비활성 | 1 | 현재 OTP/OAuth 운영과 구분해 기록하고 비밀번호 로그인 도입 전 재검토 |

### Performance Advisor

| 경고 | 수량 | 처리 원칙 |
| --- | ---: | --- |
| FK 인덱스 없음 | 3 | 삭제·조인 경로와 쓰기 비용을 확인한 뒤 전진 migration으로 추가 |
| 미사용 인덱스 | 35 | 짧은 관측 기간만으로 삭제하지 않음 |

## 4. 신규 migration 위험 감사

### 통과한 항목

- [x] `BEGIN/COMMIT` 트랜잭션 경계가 있다.
- [x] private 테이블 4개에 RLS가 켜져 있다.
- [x] private 테이블 직접 권한은 브라우저 역할에서 제거된다.
- [x] 공개 RPC는 `SECURITY DEFINER`와 빈 `search_path`를 사용한다.
- [x] 공개 RPC는 `auth.uid()`와 발생 회차·참여자 소유권을 확인한다.
- [x] 상대 참가자 응답에 얼굴·실명·프로필 식별자·비밀 역할이 포함되지 않는다.
- [x] 연락처·SNS·학번·학과처럼 신원을 노출할 수 있는 자유 입력을 차단한다.
- [x] 역할과 취향을 매칭 점수·보증금·신고 판정에 연결하지 않는다.
- [x] 기존 테이블 삭제·truncate·cascade 삭제가 없다.
- [x] 정적 계약 테스트 `npm run test:matching` 413/413 통과.

### 로컬 격리 DB 확인 결과

- [x] migration 161/161건이 PostgreSQL 17에서 한 번에 적용된다.
- [x] 빈 DB 재구성을 반복해도 중복 객체나 함수 시그니처 충돌이 발생하지 않는다.
- [x] 새 private 테이블 4개는 RLS가 켜져 있고 anon/authenticated가 직접 CRUD할 수 없다.
- [x] 사용자 RPC 10개는 고정 `search_path=''`, anon/PUBLIC 실행 불가, authenticated만 실행 가능하다.
- [x] 본인은 자신의 평소 취향·오늘 카드·비밀 역할만 읽고 변경할 수 있다.
- [x] 다른 참가자의 공개 카드는 허용된 익명 필드만 반환한다.
- [x] 첫 방은 5명에서 닫히고 6번째 참여자는 거부되지 않고 두 번째 방에 1명으로 편성된다.
- [x] 친구 초대는 정확히 15분 예약 시각을 만들며, 만료 시각을 지난 조건에서 `expired`로 해제된다.
- [x] 참여 취소 시 수락된 친구 초대를 포함해 해당 회차의 초대·스냅샷·오늘 카드·역할만 정리된다.
- [x] 한 참가자의 취소가 자신의 영구 프로필 취향이나 남은 친구의 참여를 삭제하지 않는다.
- [x] 로컬 DB lint는 오류 0건이다. 미사용 PL/pgSQL 변수 경고 3건은 아래에 기록한다.
- [ ] 운영 적용 뒤 원격 Security/Performance Advisor의 신규 경고 증분을 비교한다.

### 로컬 DB lint 잔여 경고

- `public.accept_quantum_couple_party`: 미사용 변수 `v_match`
- `public.confirm_my_quantum_event_secret_role`: 미사용 변수 `v_match_id`
- `private.ensure_quantum_event_secret_role_assignments`: 미사용 변수 `v_occurrence`

세 항목 모두 이번 E2E를 막는 오류는 아니지만, 운영 migration 적용 전 함수별 권한
감사와 함께 제거 여부를 다시 검토한다.

## 5. 다계정 E2E

| 시나리오 | 계정 | 상태 |
| --- | ---: | --- |
| 평소 취향 작성·API 재조회 유지 | 1 | 통과 |
| 오늘 카드 작성 후 참여 | 1 | 통과 |
| 친구 초대·알림·수락·15분 예약 | 2 | 통과 |
| 상대 익명 사전 카드 열람·프로필 비공개 | 2 | 통과 |
| 5인 방 정원과 6번째의 두 번째 방 편성 | 6 | 통과 |
| 참여 취소 후 영구 취향 보존·남은 친구 분리 | 2 | 통과 |
| 참여 취소 후 홈 복귀·다른 약속 선택 화면 | 1 | 미검증 |
| 완료 후 역할 맞히기·친구 공개 전환 | 5 | 미검증 |
| 비참가자·다른 방 참가자 접근 거부 | 2 | 통과 |

실행 증거:

- 로컬 E2E run id: `qa-release-mt0j7kg5-bd1171f8486a7cd8`
- 8개 격리 계정을 만들고 실행 후 `run_id_cleanup` 완료
- 실행 후 같은 run id를 가진 `auth.users` 잔여 수: 0
- 검증 코드 커밋: `d669bdce5a458d0a5228465be423c6dc84dbabba`
- 원격 초안 PR: `#14`, head `codex/main-integration-20260819`, base `main`
- 초대 만료는 15분을 실제 대기한 시험이 아니라 `expires_at`을 과거로 옮겨 서버의
  만료 처리 조건을 재현한 시험이다.

각 시나리오는 API 응답, DB 잔여 데이터, 브라우저 화면을 함께 확인한다. 단순
HTTP 200이나 화면 렌더만으로 완료 처리하지 않는다.

## 6. 적용 순서

1. [x] 원격 대상과 비용 조회
2. [x] advisor 기준선 저장
3. [x] 원격 누락 원본 3개를 통합 브랜치에 복원
4. [x] 사용자 비용 확인 후 Supabase 개발 브랜치 생성 시도
   - Free 플랜 제한으로 생성되지 않았고 과금도 시작되지 않았다.
5. [x] 로컬 PostgreSQL 17 격리 DB에 전체 migration 적용
6. [x] SQL 권한·정원·취소·초대 만료 검증
7. [x] 로컬 lint 실행
8. [x] 핵심 이벤트룸 8계정 E2E
9. [ ] 운영 적용 후 원격 advisor 증분 비교
10. [x] 코드·문서 테스트 및 최적화 빌드 재실행
11. [x] 의도별 커밋과 초안 PR #14 갱신
12. [ ] 사용자에게 운영 적용 및 main 병합 승인 요청

## 7. 운영 적용 금지 조건

다음 중 하나라도 남으면 운영 migration, PR 병합, main push를 수행하지 않는다.

- 로컬 격리 DB 전체 재생 실패
- migration 이력 재실행 위험 미해결
- anon/authenticated 직접 private table 접근 가능
- 다른 사용자의 비밀 역할 또는 프로필 식별자 노출
- 첫 방의 6번째 참가자 수용 또는 두 번째 방 편성 실패·좌석 예약 누수
- 취소가 다른 사용자의 데이터에 영향을 줌
- 다계정 E2E 미완료

## 8. 현재 배포 준비 차단 항목

- Vercel CLI 미인증 및 이 worktree의 `.vercel/project.json` 미연결
- Toss/Supabase 운영 서버 환경변수 검증 미완료
- `AI_SERVER_URL`, `AI_SERVER_SECRET`, `NEXT_PUBLIC_APP_ORIGIN` 미설정
- 운영 Supabase migration 미적용 및 원격 advisor 증분 미확인
- 완료 후 역할 맞히기·프로필 공개, Toss 환불·이월, 실제 OpenAI 사진 분석,
  APK/AAB 실기기 설치와 Google·Kakao 앱 복귀 미검증

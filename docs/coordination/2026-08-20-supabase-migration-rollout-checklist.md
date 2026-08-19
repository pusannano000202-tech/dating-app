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

## 9. 2026-08-20 통합 코드·보안 재검토

### 검토 범위와 발견 사항

- PR #14의 최신 통합 브랜치를 기준으로 인증, 결제·환불, 프로필 사진,
  만남 인증사진, 커뮤니티 댓글·반응, 이벤트룸·비밀 역할, Supabase 권한
  경계를 위험도 순서로 다시 검토했다.
- 만남 인증사진은 MIME과 파일 시그니처만 확인한 뒤 원본을 그대로 저장해
  EXIF 위치·촬영 기기·촬영 시각 메타데이터가 참가자 앨범에 남을 수 있었다.
- 업로드 전에 실제 이미지 해독, 2,048px 이내 회전·축소, JPEG 재인코딩을
  수행하도록 변경했다. 해독할 수 없는 위장 이미지는 `422`로 거부하고,
  중복 해시·DB 크기·content type은 재인코딩된 결과를 기준으로 기록한다.
- 새 회귀 테스트는 EXIF가 제거되는지와 JPEG 시그니처만 흉내 낸 손상 파일이
  거부되는지를 확인한다.
- GitHub의 Python CI가 OpenAI 운영판에서 사용하지 않는 구형 PyTorch 의존성을
  설치하고 ImageNet 가중치 다운로드가 포함된 legacy 테스트를 실행하면서 장시간
  멈춘 사실을 확인했다. 개발 의존성을 `requirements-runtime.txt` 기준으로 바꾸고
  Python 3.12 및 15분 job timeout을 적용했다. 구형 PyTorch 테스트 17개는 운영판과
  같은 환경에서 의도적으로 제외되며, OpenAI 서버 테스트는 그대로 실행된다.
- 추가 Critical/High 확정 결함은 발견하지 못했다. 다만 이는 789개 전체 차이를
  한 줄씩 증명한 것이 아니라, 개인정보·권한·결제·업로드·공개 API 중심의
  위험 기반 리뷰 결과다.

### 이번 재검증 결과

| 검증 | 결과 | 비고 |
| --- | --- | --- |
| 웹 자동 테스트 | 통과 | 848/848 (`auth` 18, `config` 284, `matching` 415, `profile` 131) |
| TypeScript 타입 검사 | 통과 | Next route type 생성 포함 |
| ESLint | 통과 | 경고·오류 0, 단 `next lint`는 Next 16 전에 CLI 전환 필요 |
| 프로덕션 빌드 | 통과 | 격리 출력 폴더에서 107/107 페이지 생성 |
| npm 취약점 검사 | 통과 | 개발 의존성 포함 0건 |
| 추적·미추적 비밀정보 검사 | 통과 | 실제 키 문자열 발견 0건 |
| 모바일 테스트 | 통과 | 153/153 |
| 모바일 타입 검사 | 통과 | 오류 0 |
| Expo Doctor | 통과 | 21/21 |
| Python 테스트 | 통과 | 68 통과, 운영에서 제거된 legacy PyTorch 테스트 17개 의도적 제외 |
| Python Ruff | 통과 | 오류 0 |
| migration 정적 검사 | 부분 게이트 | 161파일·기존 경고 612건을 기준선으로 고정해 신규 경고 증가를 CI에서 차단 |
| 로컬 PostgreSQL 전체 재생 | 이전 증거 유지 | migration 변경이 없어 `d669bdce`의 161/161 결과 사용 |
| 배포 준비 검사 | 실패 | Vercel 인증·연결, Toss/AI 운영 환경값, 공개 origin 미설정 |
| GitHub PR 상태 조회 | 통과 | PR #14 초안, main 대상, 병합 충돌 없음. `52a60b38`에서 Python 48초·Next.js·Vercel Preview Comments 성공 |

### 재검토 후 남은 출시 증거

- 실제 OpenAI 호출로 사용자 사진 1장을 분석하고 비공개 점수 저장·재사용·사진
  변경 후 무효화를 확인해야 한다. PyTorch 테스트 17개는 현재 운영 경로가 아니므로
  출시 증거가 아니며, 다시 활성화하려면 별도 legacy 모델 복원 결정과 검증이 필요하다.
- 운영 Supabase에는 신규 migration을 적용하지 않았고, 적용 후 Security/Performance
  Advisor 증분과 실제 RLS를 다시 확인해야 한다.
- 실제 2계정·5계정 브라우저 흐름 중 완료 후 역할 맞히기·프로필 공개 전환은 남아 있다.
- Toss 승인 결제의 전액 환불·다음 매칭 이월, 최신 APK/AAB 실기기 설치,
  Google·Kakao 앱 복귀는 실제 외부 환경에서 확인해야 한다.
- Vercel CLI 로그인과 프로젝트 연결, `AI_SERVER_URL`, `AI_SERVER_SECRET`,
  `NEXT_PUBLIC_APP_ORIGIN`, Toss 운영 환경값이 준비되기 전에는 배포하지 않는다.

## 10. 마이그레이션 정적 검사 회귀 방지

- 기존 도구는 경고가 있어도 항상 종료 코드 `0`을 반환해 CI 게이트로 사용할 수
  없었다. 기본 보고 모드는 호환성을 위해 유지하되 `--strict`와 `--max-issues`를
  추가했다.
- 현재 161개 파일의 정규식 경고 612건을 수량 기준선으로 고정했다. CI의
  `Supabase migrations - warning baseline` 작업은 613건 이상이 되면 실패한다.
- `npm run test:tooling`은 보고 모드, strict 모드, 기준선 이하 통과와 초과 실패를
  작은 격리 migration으로 검증한다.
- `npm run check:migrations`는 현재 저장소 기준선을 재현한다. 이 통과는 신규 정적
  경고가 증가하지 않았다는 뜻이며, 실제 PostgreSQL 전체 재생·RLS·원격 advisor
  검증을 대신하지 않는다.

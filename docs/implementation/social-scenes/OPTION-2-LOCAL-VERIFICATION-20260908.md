# 2번 구현 실제 로컬 DB 검수

사용자 `ㅇㅇㅇ 검증해봐`는 직전 보고의 **격리 로컬 DB에 누락 7개 변경 적용 및 실제 참가·초대 흐름 검수**를 승인했다.

현재 판정: **격리 로컬 DB·브라우저 핵심 흐름 통과. 운영 출시는 보류.** 기존 DB에서도 재현되는 SQL 오류3건과 실제 통화 제공자 연결·운영 환경 검증이 남아 있다. 아래는 이번 실행의 새 증거이며, 이전 `OPTION-2-RESULT-20260908.md`의 "로컬 DB 미적용" 상태는 이 별도 검수 환경에 한해서 해소됐다.

## 범위와 합격 기준

- 기존 `quantum-integrated-campus-20260905` DB와 사용자 데이터를 보존한다. 현재 적용223개, 최신20260906133228을 실행 직전 재확인했다.
- 별도 `quantum-option2-verify-20260908` 검수 프로젝트와 `.tmp/option2-verify-20260908`, API56521 / DB56522 / 앱3015를 사용한다.
- 현재 소스230개 migration을 새 DB에서 검증하며 누락7개가 실제 함수·권한으로 적용돼야 한다.
- 모임 참가·탈퇴 후 재모집·기존 채팅 열람·홈 본인 목록, 학과 팀 생성·초대·수락·새로고침 후 보존을 실제 로컬 테스트 계정으로 확인한다.
- 일반 사용자, 업장, 관리자 AAL1/AAL2 권한을 구분한다. 브라우저 캡처와 DB/API 증거를 각각 남긴다.
- 원격 DB, 기존 DB 변경, Git stage/commit/push, 실제 결제, 배포, 유료 보이스 제공자 연결은 범위 밖이다.
- 실기기 통화와 실제 운영 계정·배포는 이 검수로 완료했다고 말하지 않는다.

## 시작 상태

작업공간 `social-scene-implementation-20260907`, branch `codex/social-scene-implementation-20260907`, HEAD `be9078565d8e59f73cbc017f3c7b1484996da1c3`, dirty666항목, staged없음. 기존 더티는 보존한다.

## 실행 결과

### DB 실적용

- Supabase CLI2.116.0 `start`가 신규 전용 프로젝트에 230개 migration을 처음부터 적용하고 정상 종료했다. 새DB에 실제 함수 `get_my_home_meetups`, `verify_admin_aal2_session` 존재와 migration230건을 다시 SQL조회했다.
- 기존223DB의 데이터는 복사·리셋·변경하지 않았다. 따라서 **빈 새DB 전체 재생 성공**이며, 기존 운영 데이터가 있는 DB의 업그레이드/백필 성공을 대신하지 않는다.
- 독립 migration 의존성 검토 PASS. integrated → friend/activity → history/voice → MFA/home 순서의 선행 객체를 확인했다. 기존 데이터의 신원 누락 또는 pre-request hook 충돌은 별도 업그레이드 검수에서 fail-closed 확인 대상이다.
- 새DB `db advisors --type security --fail-on error`: No issues found / exit0. 침해 사고 부재 보증이 아니라 해당 DB 진단 결과다.

### 추가로 발견한 출시 전 오류

실제DB `db lint --schema public,quantum_private --level error --fail-on error`에서 아래3개를 발견했다. **기존223DB에 읽기 전용으로 같은 검사를 실행해 동일3개를 재현**했으므로 이번7개가 새로 만든 오류가 아니다.

| 함수 | 오류 | 영향 |
|---|---|---|
| `service_claim_tonight_deposit_dispositions` | SQL42702, ON CONFLICT의 deposit_id가 반환 변수와 모호함 | 보증금 후속 처리 작업 등록 실패 가능 |
| `service_claim_tonight_settlements` | SQL42702, ON CONFLICT의 team_id가 반환 변수와 모호함 | 정산 작업 등록 실패 가능 |
| `request_my_tonight_arrival_help` | SQL42702, ON CONFLICT의 team_id가 반환 변수와 모호함 | 도착 도움 요청 저장 실패 가능 |

정산/보증금 등 기존 기능 수정은 이번 검수 승인 범위와 구분해 보고한다. 기존 migration을 고치거나 원격 적용하지 않았다. 새 forward-only 수정과 해당 상태 전이 검수가 출시 전에 필요하다.

### 검수 환경 보완

별도 QA 런처에 친구 링크 생성용 `FRIEND_INVITE_TOKEN_SECRET`을 로컬에서 생성·주입했다. 비밀은 `.tmp`에만 보관하고 출력하지 않는다. 기존 앱/DB 런처의 설정은 바꾸지 않았다. 실제 SMS 제공자 연결 없이 기존 이메일OTP 화면으로 로그인한다. 전화번호 확인 상태·최소 프로필은 가상의 QA fixture이며 실제 통신사 인증을 증명하지 않는다.

## 실제 계정·데이터 검수 결과

### 활동방과 홈 — Auth → PostgREST RPC → 실제 SQL 저장 확인

8개의 가상 계정을 실제 로컬 Auth에 생성하고 최소 가입을 완료했다. 인증 우회나 화면용 가짜 인원으로 대체하지 않았다.

| 단계 | 1번 방 | 2번 방 | 확인 |
|---|---|---|---|
| 첫 방 정원 도달 | 5/5, 정원 마감 | 0/5, 자동 생성 | 새 모집방 생성 |
| 다음 방에 2명 참가 | 5/5 | 2/5, 모집 중 | 별도 방 참가 |
| 첫 방에서 1명 탈퇴 | 4/5, 모집 중 | 2/5, 모집 중 | 두 방 동시에 재모집 |
| 새 참가자가 첫 방 선택 | 5/5 | 2/5, 모집 중 | 이전 채팅 열람 성공 |

- 재참가·메시지 재전송의 같은 요청 재시도는 중복 행을 만들지 않았다.
- 비참가자의 채팅 조회·전송은 거부됐다. 공개 응답의 이메일·전화번호·내부 사용자 ID 노출 여부도 검사했다.
- 홈 본인 목록은 본인이 참가한 일정/자동방만 포함하고, 예정 일정 우선 정렬과 조회 전후 방 개수 불변을 확인했다.
- 최초 검수는 `5+1 → 4+0 → 5+0`까지만 확인해 사용자 요청 증거로 부족했다. DB 초기화 없이 별도 후속 검수로 위 `5+2 → 4+2 → 5+2`를 추가 검증했다.
- 결과: `artifacts/option2-live-20260908/social-live-results.json`의 `activityRooms.parallelRecruitment`.
- 한 자리로 동시에 몰리는 실제 동시 요청/대규모 부하 시험은 이번 검수와 별개다.

### 학과 팀 — 실제 RPC 저장 확인

- 일반 친구 초대·수락 후, 팀 생성 → 같은 학과 친구에게 팀 초대 → 상대 수락 → 실제 명단2명/정원5명 확인.
- 생성·초대·수락 재시도 중복 방지 통과.
- 다른 학과 친구 초대 거부, 비참여자에게 명단은 숨기고 집계2명만 노출하는 계약 통과.
- 친구 관계와 팀 참가를 따로 저장하며 학과 전체 자동 친구 추가를 만들지 않았다.
- 이 항목은 PostgREST RPC 검증이다. Next HTTP 전송 검증은 아래 별도 항목에 기록한다.

### 운영자·최고관리자·업장 — 실제 Auth/TOTP 검수 24/24 통과

`verify-admin-mfa-privacy-local.mjs`를 부모 작업에서 직접 재실행해 정상 종료와 원시 결과를 확인했다. 테스트를 위한 JWT를 임의 조작하지 않고 로컬 GoTrue가 발급한 토큰과 실제 TOTP 등록/확인을 사용했다.

- 운영자·최고관리자: AAL1에서는 민감 RPC 차단, AAL2에서 허용.
- 관리자 역할 철회, 세션 삭제, 세션 만료, 사용자 정지·삭제 상태에서 재차 차단.
- 사용자 편집 metadata에 super_admin을 적어도 권한 상승 거부.
- 일반 사용자 역할 유지. 업장 계정은 자기 업장 허용·다른 업장 거부.
- 검수 계정에만 관리자 역할 제거와 세션 한 행 삭제/만료·정지 등을 실행했다. 해당 검수 세션은 다시 로그인해야 하며, 기존 사용자 계정/DB는 대상이 아니다. auth.users 전체 삭제나 DB reset은 하지 않았다.
- 결과: `artifacts/option2-live-20260908/security-live-results-1788849382621-15066606.json` (2026-09-08T06:36:33Z).
- 관리자 화면 전체 조작·운영 환경 MFA/실기기 인증은 이 RPC 검수로 대체하지 않는다.

## 브라우저에서 직접 확인한 동선

**검수 주소: http://127.0.0.1:3015/**. 기존 http://localhost:3013/과 다른 DB다. 기존3013에는 누락7개를 적용하지 않았다.

1. 기존 이메일 OTP 화면으로 실제 로그인 → 홈 진입.
2. 홈 → 학과 대항 → `브라우저 검수 게임팀` 생성 → 서버201/실제1/5명 저장 → 다시 열어도 유지.
3. 모임 → 온천천 저녁 러닝 방 선택 → 참가 즉시 채팅 진입 → 메시지 전송 → 새로고침 후 동일 메시지 유지.
4. 홈으로 돌아와 본인 참가 모임1/6 표시 → `내 방 채팅으로` 클릭 → 저장된 대화로 복귀.
5. 모바일390×844 및 데스크톱1440×1000에서 홈/학과 대항 확인. 문서 폭375/1425로 화면 밖 가로 넘침 없음. 입력창·버튼 겹침 없음. 게임/축구 버튼, 정원5→11 변경, 초대 패널 열기/닫기 확인.
6. 보이스 테마 전환 → 연애 → 역할 선택 → 대화 준비 → 참여 요청. **통화 서버 미설정 안내로 차단됨**. 실제 음성 연결/음성 송수신을 성공으로 처리하지 않았다.

### 검수 중 환경 문제와 처리

- 모바일에서 Next 개발용 N 표시가 홈 버튼 위에 겹쳤다. 검수 브라우저의 개발 도구 설정에서 세션 동안 숨긴 뒤 홈 클릭을 다시 확인했다. 제품 소스/운영 설정을 변경한 것은 아니다.
- 처음 localhost3015로 로그인한 뒤 localhost3013과 쿠키 호스트를 공유할 수 있음을 확인해 127.0.0.1:3015로 분리, 다시 정상 로그인했다. 기존localhost의 로그인 세션은 재로그인이 필요할 수 있다. 기존 계정·프로필 데이터의 변경을 뜻하지 않는다.
- QA Auth의 callback/site_url 설정은 localhost3015 기준이고 검수 UI는127.0.0.1이다. 직접 이메일 OTP 흐름은 확인했지만 OAuth·이메일 링크 callback은 이번 검수 대상이 아니다.
- Next가 tsconfig.json에 `.next-option2-verify/types/**/*.ts` include 한 줄을 자동 추가했다. 기존 더티 설정은 보존했다.

### 화면 증거

![실제 참가 모임이 표시된 모바일 홈](C:/Users/82108/.config/superpowers/worktrees/데이팅앱만들기/social-scene-implementation-20260907/artifacts/option2-live-20260908/home-mobile-real-meetup.png)

![모바일 학과 팀 만들기](C:/Users/82108/.config/superpowers/worktrees/데이팅앱만들기/social-scene-implementation-20260907/artifacts/option2-live-20260908/department-mobile-builder.png)

추가 캡처: `home-desktop-real-meetup.png`, `department-desktop.png`, `department-mobile-saved-team.png`, `department-mobile-11-slots.png`, `chat-mobile-persisted.png`, `voice-provider-unavailable.png` (동일 artifact 폴더).

## 코드·보존 검사

- `tsc --noEmit --incremental false`: 이번 실행 통과.
- 추가 QA 스크립트 `node --check`: 통과.
- `check-secret-leaks --include-untracked`: 통과. 검수 계정/OTP/비밀값 파일은 `.tmp` 내부이며 Git ignore 적용 확인. 공개 결과/캡처에는 인증 비밀값을 넣지 않았다. 정적 스캔 통과는 과거 유출 부재 보증이 아니다.
- 기존 DB 최종 확인223개/최신20260906133228, 새 QA DB230개/최신20260907201908. stage없음, HEAD변경없음.
- 이번에는 제품 기능 소스를 고치지 않았다. QA 준비·실행 스크립트와 증거·보고서, 개발 서버 자동 생성 설정만 추가됐다. 이전 턴의 정식 빌드·단위 테스트 결과를 이번 턴의 새 실행으로 다시 세지 않는다.

## 출시 전에 남은 것

1. 위 SQL42702 오류3건을 forward-only migration으로 수정하고 보증금/정산/도착 도움 상태 전이를 다시 검증.
2. 실제 기존 데이터가 들어 있는 DB의 업그레이드/백필, 복구 리허설. 이번 빈 DB 전체 재생과 다름.
3. LiveKit 서버의 `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` 및 webhook/worker 인증·허용 origin 연결. 실제 두 기기 음성 송수신, 백그라운드·재접속·퇴장·신고/차단 검증. 제공자 계정·비용 승인 필요.
4. 운영 SMS/알림/결제·환불, 실제 운영/업장 계정, 원격 DB 적용, 배포 환경과 비밀 저장소·키 회전·접근 감사 검증. 관리자와 업장은 같은 앱/DB 내 권한 분리이며 독립 서버 격리를 검증한 것은 아니다.
5. 별도 승인 전 원격 DB 적용·배포·실제 결제·stage/commit/push는 하지 않는다.

## Next HTTP 전송 검증

별도 전용 계정2개로 **실제 Next API 전송 검수 통과**. `@supabase/ssr`가 생성한 정상 로그인 쿠키를 전송했으며 auth bypass를 사용하지 않았다. service_role은 가상 계정·최소 가입 fixture 준비에만 사용하고 아래 제품 동작은 사용자 세션으로 실행했다.

| 실제 HTTP 동작 | 결과 |
|---|---|
| 미로그인 친구 목록 조회 | 401, unauthenticated |
| 친구 초대 링크 생성 | 201 |
| 받는 사람이 초대 미리보기 | 200, 초대한 친구 이름·pending 확인 |
| 친구 초대 수락 | 200, accepted |
| 학과 게임 팀 생성 | 201, 정원5/현재1 |
| 같은 학과 친구에게 팀 초대 | 201, pending/revision1 |
| 상대가 팀 초대 수락 | 200, accepted/revision2 |
| 주장·수락자 각각 목록 재조회 | 양쪽 모두2/5 |
| 해당 ID로 실제 SQL 행 재조회 | 친구관계1, 대항1, 참가명단2, 수락초대1 |

결과: `artifacts/option2-live-20260908/social-http-results-mtsb6wlh-29f8a44e.json` (2026-09-08T06:49:20Z). 증거에는 이메일·전화번호·토큰·사용자 ID를 저장하지 않았다. 브라우저에서 두 사람이 번갈아 초대 버튼을 누른 증거와 동일시하지 않는다. 브라우저 생성·진입 검수와 실제 HTTP 다계정 검수를 조합한 결과다.

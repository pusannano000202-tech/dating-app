# R1–R9 출시 잔여 Gate 점검 — 2026-09-06

## 판정

**R1–R7의 주요 로컬 구현과 합성 검증 증거는 존재하지만, 전체 기능 완료나 운영 출시 완료로 판정할 수 없다.** 현재 열린 항목은 아래 세 종류다.

1. **코드 누락:** 실제 주간 배정을 시작할 운영 호출 주체와 앨범 90일 만료 후 물리 삭제 작업은 아직 저장소에서 확인되지 않았다. 후속 친구 요청 fee guard는 전용 로컬 DB에 적용·검증됐지만 원격 DB에는 적용하지 않았다. R6 보호 레코드 백업·원문 조회 동선은 로컬 구현·브라우저 확인을 얻었다.
2. **데이터/운영 준비:** 운영 feature flag, 주간 모집 창·회차·정원, 검수된 배달 후보 8개 이상, 사진 사용권, Storage·Cron·운영 계정 준비가 필요하다.
3. **실검증:** 원격 Supabase, 실제 사용자 계정, 실제 결제·환불, 동일 SHA 배포, 실기기·운영 Cron은 이번 점검에서 확인하지 않았다.

R8 Day 1 비공개 게임 투표·Day 3 볼링 동점 처리 forward migration은 로컬 DB에 적용됐고, 브라우저에서 Day 1 투표와 Day 3 동점 연속·완료를 통과했다. 이 로컬 증거를 R1–R7 최종 회귀·원격 적용·실기기 통과로 계산하지 않는다.

## 이번 점검의 범위와 증거 등급

- 대상: `integrated-campus-20260905`, branch `codex/integrated-campus-20260905`, HEAD `be9078565d8e59f73cbc017f3c7b1484996da1c3`.
- 읽기 시점의 작업공간은 staged 0, unstaged 103, untracked 640이었다. 공유 작업공간이므로 이 수치는 이후 바뀔 수 있으며, 기존 더티 파일을 이번 작업량으로 계산하지 않는다.
- 이번 점검은 로컬 문서·소스·기존 QA 산출물만 읽었다. 원격 연결, DB 실행·조회, 브라우저 실행, 실계정, 결제, 배포는 수행하지 않았다.
- `docs/operations/release-preservation-20260906.md`의 로컬 PostgreSQL·브라우저 결과는 기존 실행 기록으로 인용한다. 이번 점검에서 재실행한 증거가 아니다.
- 환경 파일은 예시 파일의 변수명과 기본값만 확인했다. 실제 키·토큰·비밀값과 실제 배포 환경변수 값은 읽거나 기록하지 않았다.

## R1–R7 상태와 열린 Gate

| 범위 | 로컬 코드·기존 증거 | 코드 누락 | 데이터/운영 준비 | 실검증 |
| --- | --- | --- | --- | --- |
| R1 모임 발견 | 남성/여성/혼합 추천, 카페·소품샵·산책 카드와 5개 이미지가 복원됐다. 기존 보고에는 집중 테스트 6개와 모바일/데스크톱 클릭 증거가 있다. 추천 모드는 가입 자격인 `gender_mode`와 분리돼 있다. | 잠긴 R1 범위에서 추가 필수 코드 누락은 발견하지 못했다. | 모임은 운영에서 `NEXT_PUBLIC_COMMUNITY_ENABLED=true`가 필요하다. 이미지 5개와 커뮤니티 연출 이미지의 공개 사용권 승인 또는 승인 자산 교체가 필요하다. | 실제 운영 데이터의 생성·가입·취소, 실계정 성별 경계, 원격 RLS, 배포 화면은 미검증이다. |
| R2 이번 주 친구 동반 | 2–3명 수락 친구의 전원 동의, 공통 날짜, 전원 동일 회차 원자 배정, 재시도·정원 부족 무부분 배정의 기존 PostgreSQL 22개 증거가 있다. | `POST /api/internal/match/weekly/assign`과 RPC는 있으나 저장소에서 이 endpoint를 호출하는 배치·운영 UI·스케줄 작업은 발견하지 못했다. 외부 운영자가 호출하는 설계라면 호출 주체·선정 기준·재시도 runbook을 명시해야 하고, 아니라면 실제 배정 오케스트레이션 코드가 필요하다. | 최근 인증한 최고관리자가 모집 창을 생성·수정·공개할 UI/RPC는 있다. 실제 주간 활동·월요일 `week_key`·마감·장소·정원과 정확히 일치하는 scheduled occurrence를 운영자가 준비해야 한다. 마감 sweep은 continuation notification Cron에 결합돼 있으므로 Cron 설정·비밀·모니터링도 필요하다. | 실제 여러 계정의 초대/동의/철회/배정, 마지막 자리 동시 경쟁, 재시작 보존, 배정 후 취소·환불 운영은 미검증이다. |
| R3 Day 2/4 진행 | Day 2 세 라운드·5/6인 조와 Day 4 공용폰·10카드 런타임이 있으며, 기존 보고에는 PostgreSQL 시나리오와 집중 테스트가 있다. R8의 Day 1 투표·Day 3 동점 처리는 로컬 DB 적용과 브라우저 완주 증거를 얻었다. | 잠긴 R3/R8 콘텐츠 범위에서 추가 필수 코드 누락은 발견하지 못했다. 다만 이는 합성 로컬 회차 검증이며 실제 5/6인 운영 완주가 아니다. | 실제 원천 회차, 5/6인 출석 명단, 연속 일정, 장소·진행자, 질문·카드 운영 시각이 필요하다. | 실제 5/6명, 복수 기기, 30분 경계, lease 경쟁, 보드/비보드 원천의 순차 5/6회 완주, 원격 동일 migration 적용은 미검증이다. |
| R4 친구 1:1 채팅·후속 친구 요청 | 수락된 친구만 읽기·쓰기, 철회/차단, 멱등성, 길이·빈도·history 제한이 구현됐다. 기존 보고에는 PostgreSQL 18개와 합성 친구의 전송·새로고침 증거가 있다. 일반 친구 요청은 성별이 아니라 명시 요청·수락을 기준으로 한다. 합성 test02·c660 Day 4 화면에서 기존 친구 4명의 checkout이 모두 제외되고 새 요청 가능 대상이 없다는 안내가 390/1440px에서 넘침 없이 보였다. | 새 forward migration은 active/blocked friendship, 양방향 유효 pending request, 미해결 entitlement/order를 pair lock 아래 prepare·begin·confirm·worker에서 재검사한다. projection은 결제 불가 대상을 숨기고 현재 회차의 재개 가능한 prepared 주문은 유지한다. 로컬 simulator의 상태 경합은 no-charge/cancelled로 닫는다. 소스 구조 8개·SQL rollback 30개 assertion이 통과했고, 전용 로컬 DB 적용 후 2-session friendship/request 경합이 모두 40001로 fail-closed되며 영구 write 0인 것을 확인했다. | 원격 migration/RPC 권한, 실제 accepted/blocked friendship 데이터, 결제 recovery worker 운영 검증이 필요하다. 로컬 PostgREST에서 service role 인식·invalid input 400과 anon 401은 통과했다. | 실제 두 사용자 기기의 동시 송수신, 상대가 관계를 끊는 순간의 화면, 장기 history, 원격 권한 거부, 실제 Toss sandbox/결제·취소·환불은 미검증이다. |
| R5 선택형 앨범 | 참가 회차별 선택 업로드, 서버 재인코딩, 5분 signed URL, late joiner 제한, 업로드·삭제 재시도가 구현됐다. 기존 보고에는 PostgreSQL 44개, 로컬 API, 합성 JPEG 업로드·새로고침 증거가 있다. | `retention_until`이 지난 사진은 조회에서 제외되지만, 만료 행을 claim하고 Storage object를 삭제한 뒤 상태를 마감하는 worker/RPC/route가 없다. `vercel.json`에도 앨범 만료 작업이 없다. 따라서 현재 90일은 **표시 제한**이지 물리 삭제 보장이 아니다. | 원격 private `meeting-evidence` bucket, service-role 권한, signed URL, 용량·MIME 설정, 삭제 실패 모니터링과 90일 처리 Cron 운영 준비가 필요하다. | 실제 참가자/늦은 합류자/외부인의 원격 접근, 실제 UI 삭제, Storage 장애, 5분 URL 만료 후 재접속, 실제 90일 삭제는 미검증이다. |
| R6 데이터 보존·출시 wiring | 알 수 없는/손상된 브라우저 레코드와 다른 탭 변경은 원문을 덮어쓰지 않으며, 커뮤니티의 Campus Eats 링크와 목적지는 같은 두 flag 정책을 사용한다. 선택한 학교·음식의 보호 레코드를 JSON으로 백업하고 다운로드가 막히면 read-only 원문을 열람하는 fallback이 추가됐다. 로컬 브라우저에서 2개 key의 원문, 백업 누적 1회, 범위 전환 시 clear를 확인했다. | 잠긴 R6 범위의 백업·원문 조회 필수 코드 누락은 발견하지 못했다. 로컬 DB 간 aggregate audit는 여전히 행 이식이나 안전한 mapping 증명이 아니다. | 예시 환경의 `NEXT_PUBLIC_COMMUNITY_ENABLED`, `NEXT_PUBLIC_CAMPUS_EATS_ENABLED`, `NEXT_PUBLIC_TONIGHT_ENABLED`, applications/payment/automation 관련 flag는 기본적으로 닫혀 있다. 실제 운영 값은 미확인이다. 방문/배달/지도 자산·권리와 provider 설정도 별도 준비가 필요하다. | 브라우저가 실제 JSON 파일 저장을 완료했는지, 구형 실제 payload 전체 호환, 계정·다른 기기 동기화, 운영 flag 조합, 원격 데이터 보존은 미검증이다. |
| R7 통합 검증 | 최종 `2026-09-06T14-10-03-220Z`에서 1,763/1,763 자동 테스트, 2/2 tooling, TypeScript, ESLint 경고/오류 0, 정식 빌드, migration ratchet, tracked/untracked secret 검사 모두 통과했다. | 현재 잠긴 코드 범위의 최종 로컬 회귀는 닫혔다. 위의 운영 호출 주체·물리 삭제 작업 누락은 별개다. | migration ratchet은 기존 baseline 24개 지문을 허용하므로 과거 SQL 부채 0을 증명하지 않는다. 후보 commit과 배포 설정 동결은 별도 승인이 필요하다. | 원격 migration/RLS, 실계정 E2E, 실제 결제, 배포 smoke, 실기기는 R7 로컬 runner로 대체할 수 없다. |

## 운영 준비 상세 점검

### Feature flag와 공개 경로

- production에서 커뮤니티/모임은 `NEXT_PUBLIC_COMMUNITY_ENABLED=true`가 필요하다.
- Campus Eats는 production에서 `NEXT_PUBLIC_COMMUNITY_ENABLED=true`와 `NEXT_PUBLIC_CAMPUS_EATS_ENABLED=true`가 모두 필요하다. 현재 커뮤니티 링크도 같은 정책을 사용하므로 Campus Eats가 닫힌 조합에서 404 CTA를 광고하던 이전 문제는 소스상 닫혔다.
- Tonight의 예시 기본값은 화면, 신청, 카드결제, 자동화가 모두 닫힌 상태다. 실제 운영 값을 확인하지 않았고 이번 문서가 flag 활성화를 승인하지 않는다.
- 이번 주 만나기는 독립적인 public flag 없이 `/match`의 discovery 안에 있다. 운영에서 주간 기능만 단계적으로 닫아야 한다면 별도 노출 정책이 필요하다. 현재로서는 실제 모집 창을 만들지 않는 것이 데이터 차원의 fail-closed 수단이지만, 원격 schema가 없을 때의 API 실패와 같은 상태는 아니다.
- 친구 채팅과 계속 만나기 앨범도 별도 public flag가 아니라 실제 friendship/series 권한에 의해 노출된다. 원격 migration 미적용 상태를 feature flag로 대체할 수 없다.

### 후속 친구 요청 결제

- `get_my_continuation_after` wrapper는 active/blocked friendship, 양방향 유효 pending request, 동일 transition entitlement, 재개할 수 없는 미해결 fee order의 대상을 `friend_targets`에서 제외한다. 성별·학교·거절 주체는 추가로 노출하지 않는다.
- `prepare_my_continuation_fee` wrapper는 기존 idempotency replay와 현재 provider의 active prepared order 재개를 먼저 보존한다. 새 주문은 unordered pair lock 아래서 현재 관계·요청·entitlement·미해결 order를 재검사한 뒤 fail-closed 차단한다.
- provider 호출 전 begin은 상태가 바뀐 prepared 주문을 `cancelled/no_charge`로 닫는다. 외부 승인 후 Toss confirm의 경합은 금전 증거를 보존하고 `recovery_required` 취소 job으로 연결한다. 실제 청구가 없는 로컬 simulator는 `cancelled/no_charge`로 종료하며, exact replay는 현 pair 상태와 무관하게 같은 종료 결과를 반환한다.
- stale pending은 pair lock 안에서 `expired`로 닫고 worker는 현재 유효 pending을 유료 결과로 재사용하지 않는다. 과거 delivered 요청이 거절·만료된 뒤에는 다른 transition에서 새 명시 요청을 허용하되, 동일 transition의 entitlement 유일성은 유지한다.
- 이 보완의 소스 구조 테스트 8개와 로컬 SQL transaction rollback 30개 assertion은 통과했고 독립 리뷰에서 제기된 Important 항목을 반영했다. 전용 로컬 DB 적용 후 2-session lock 경합·service/anon 거부도 통과했다. 원격·실계정·실결제는 여전히 미검증이다.
- pair lock 경합은 friend request 생성·수락·거절·취소와 관계 숨김·복구 API에서 HTTP 409 `friend_pair_retryable`로 반환하고, 화면은 상태 변경 중임을 알리며 잠시 후 다시 누르도록 안내한다.
- 합성 test02·c660 Day 4 브라우저 검수에서 active 친구 4명은 전부 결제 대상에서 제외됐고, “지금 새로 요청할 수 있는 상대가 없어요” 안내와 390/1440px 무가로 넘침을 통과했다. 이는 로컬 합성 프로필·fixture 증거이며 실계정·원격 증거가 아니다.
- 일반 친구 요청에는 동성 제한이 없다. 같은 성별 제한은 주간 친구 파티와 같은 방 좌석 초대의 편성 규칙이며, 완료 회차의 명시적 1:1 친구 요청에는 적용되지 않는다. 따라서 여성 사용자에게 남녀가 섞인 출석 대상이 보이는 것 자체는 현재 친구 정책 위반이 아니다.

### 주간 모집 창과 배정 운영

- 모집 창 생성·수정·공개는 recent-auth super-admin과 idempotency/revision CAS로 보호된다.
- 입력은 월요일 `week_key`, 미래 마감·시작·종료, 같은 주, 정원 5–60명, 활동·장소 snapshot을 만족해야 한다.
- 사용자 신청 전에 실제 활동별 여러 후보 창을 만들고 공개해야 한다. 배정에는 선택한 창과 시간·장소·활동이 정확히 같은 scheduled occurrence가 별도로 필요하다.
- 마감/시작 sweep은 `/api/internal/match/continuation-notifications`의 서비스 작업에 포함되고 `vercel.json`에는 매분 경로가 선언돼 있다. 실제 Vercel plan, Cron 설치, 인증 secret, 성공률·backlog 알람은 미확인이다.
- 배정 endpoint는 개별 application/window/occurrence를 받는다. 어떤 신청을 어떤 회차로 선택할지 결정하고 반복 호출하는 운영 주체는 저장소에서 확인되지 않았다.

### 배달 후보

- 현재 공개 조건은 부산대 정문 공용 권역, 가게별 대표 1인 메뉴, `verified` 상태, 실제 사진 파일과 사용권, 허용된 주문/출처 상세 URL, 한 메뉴로 최소주문 충족, 기본 정보 7일 이내, 혜택 24시간 이내다.
- 8개 이상이 동시에 유효해야 월드컵을 시작한다. 서버는 실제 로컬 사진 파일 존재까지 확인하고, 공개 RPC는 service role 전용이다.
- 기존 운영 문서는 작성 당시 실제 검수 후보를 0개로 기록한다. 이번 점검은 DB를 읽지 않았으므로 **현재도 0개라고 재확인한 것이 아니다.** 운영자는 현재 후보 수, 각 확인 시각, 사진 권리, 주문 조건과 배포 산출물의 사진 포함 여부를 다시 증명해야 한다.
- 방문 맛집 fixture 93개나 커뮤니티 연출 이미지는 배달 후보 증거가 아니며 자동 전환하지 않는다.

### 앨범 보관·삭제

- bucket은 기존 migration에서 private, 12 MiB, JPEG/PNG/WebP로 선언돼 있고 앱 업로드는 재인코딩한 JPEG와 server-only Storage client를 사용한다.
- 앨범 조회는 `status='active' AND retention_until > statement_timestamp()`만 서명하므로 만료 사진은 사용자에게 다시 보이지 않는다.
- 그러나 만료된 metadata 상태와 실제 Storage object는 자동으로 삭제되지 않는다. 사용자 요청 삭제만 reserve→Storage delete→finalize 경로를 탄다.
- 출시 전에 service-only batch claim, idempotent Storage delete, retry/dead-letter, metadata finalize, bounded Cron, 장애 관찰 및 rollback 테스트가 필요하다. 법적 보존 예외가 필요하다면 별도 정책 승인이 선행돼야 하며 지금 코드가 그 정책을 대신하지 않는다.

## 출시 전 닫아야 할 순서

1. 완료: R8/R9를 동결하고 R9 독립 검토, 로컬 DB 30개·별도 세션 경합·실제 API·브라우저 필터링을 확인했다. 신규 migration은 전용 로컬 DB의 223번째 이력으로 적용됐다.
2. 후속 친구 요청 fee guard는 전용 로컬 DB 적용·rollback 30개·2-session pair-lock·service/anon 거부를 통과했다. 새 409 재시도 안내의 실제 API/UI 클릭과 원격 적용은 여전히 별도 Gate다. 그 뒤 주간 배정 호출 주체와 앨범 90일 물리 삭제를 코드 또는 명시된 외부 운영 계약으로 닫는다. R6은 실제 파일 다운로드 완료 여부를 추가 확인한다.
3. 운영 feature flag 조합, 주간 창·scheduled occurrence·정원, 배달 후보 8개+, 사진 권리, Storage/Cron/운영자 계정을 준비한다.
4. 완료: R8/R9와 R6 백업을 포함한 최종 R7 전체 회귀를 순차 실행해 모두 통과했다. 중간 806/808 실패나 이전 빌드는 최신 결과가 아니다. 최종 로그는 `artifacts/qa/release-preservation-20260906/2026-09-06T14-10-03-220Z/`다.
5. 별도 승인을 받은 뒤에만 원격 migration 적용과 RLS/RPC/Storage/Cron 보안 검증을 한다.
6. 실제 여러 사용자 계정으로 모임, 주간 파티, Day 진행, 친구 채팅, 앨범의 허용·거부·재접속을 완주한다.
7. Toss sandbox/실결제·환불, SMS, Push 실기기, 같은 승인 SHA의 Vercel/EAS 배포와 smoke test를 각각 독립 Gate로 닫는다.

## 근거 파일

- `docs/operations/release-preservation-20260906.md`
- `docs/operations/auth-recovery-and-remaining-work-20260906.md`
- `docs/operations/capability-preservation-20260906.md`
- `docs/operations/integrated-local-run.md`
- `docs/superpowers/plans/2026-09-06-release-preservation-implementation.md`
- `.env.example`, `lib/community-feature.ts`, `lib/matching/tonight-ranked/runtime.ts`
- `components/matching/WeeklyActivityWindowOperator.tsx`
- `app/api/admin/super-admin/match/weekly-windows/route.ts`
- `app/api/internal/match/weekly/assign/route.ts`
- `app/api/internal/match/continuation-notifications/route.ts`, `vercel.json`
- `lib/campus-eats/delivery.ts`, `lib/campus-eats/delivery-verification.ts`, `app/api/campus-eats/delivery/route.ts`
- `lib/campus-eats/preserved-storage.ts`, `components/campus-eats/CampusEatsPilot.tsx`
- `components/matching/FiveMeetingPostFlow.tsx`
- `app/api/payments/continuation/prepare/route.ts`
- `supabase/migrations/20260905120000_integrated_continuation_and_weekly.sql`
- `supabase/migrations/20260905180000_continuation_fee_recovery.sql`
- `supabase/migrations/20260906133228_continuation_friend_fee_pair_guard.sql`
- `tests/matching/continuation-friend-fee-guard.test.ts`
- `supabase/tests/continuation-friend-fee-guard.sql`
- `supabase/migrations/20260906120204_continuation_series_album.sql`
- `app/api/match/series/[seriesId]/album/route.ts`
- `app/api/match/series/[seriesId]/album/[photoId]/route.ts`

이번 문서 작성은 운영 설정 변경이나 출시 승인이 아니다. 원격·DB·브라우저·결제·배포를 변경하지 않았고, 민감한 키 값은 조회하거나 기록하지 않았다.

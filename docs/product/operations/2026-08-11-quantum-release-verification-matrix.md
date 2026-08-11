# Quantum 출시 검증 매트릭스

## 상태 규칙

- `PASS`: 현재 코드와 실행 결과를 둘 다 확인했다.
- `PARTIAL`: 코드 또는 로컬 중 하나만 확인했다.
- `BLOCKED`: 필요한 외부 설정·사용자 확인이 없다.
- `NOT RUN`: 아직 실행하지 않았다.

## 현재 매트릭스

| ID | 영역 | 검증 시나리오 | 상태 | 증거 | 다음 행동 |
| --- | --- | --- | --- | --- | --- |
| EVT-01 | 이벤트 | 5명 대기, 성비 정원, 초과 신청 거절 | PASS | 2026-08-11 원격 5명 참가 + 1명 거절 E2E, occurrence 행 잠금 | 계약 변경 시만 재검증 |
| EVT-02 | 상태 UX | 모집·확정·채팅·진행·취소·완료 구분 | PASS | 390x844·1440x900 실화면, 여섯 상태 클릭, 겹침·가로 넘침 없음 | UI 변경 시 회귀 검증 |
| EVT-03 | 채팅 | 약속 20분 전 서버 개방 | PASS | 2026-08-11 원격 확정 match 가계정 5명: 20분 경계 개방, 참가자 송수신, 비참가자 거절, 직접 테이블 우회 차단, 정리 후 잔여 계정·행 0 | 채팅 계약 변경 시에만 재검증 |
| EVT-04 | 홈 | 신청 전 CTA가 신청 후 진행 현황으로 교체 | PASS | 2026-08-11 실제 신청 계정 390x844에서 `함께할 사람을 모으고 있어요` 확인, `artifacts/qa/quantum-event-lifecycle/13-home-participation-state-mobile.png` | command center 변경 시 재검증 |
| EVT-05 | 매칭 | 오늘 바로 회전 버튼 이동 | PASS | 390x844 다음/이전 문구 변경 | 회귀 테스트 유지 |
| EVT-06 | 가계정 | 5명 신청·1명 정원 거절·중복·취소·정리 | PASS | 2026-08-11 실제 occurrence의 성비 정원(2남 3여)을 읽어 5명 신청, 초과 남성 거절, 중복 1행, 취소 감사행, 정리 6/6 확인 | 이벤트별 정원 변경 시 재검증 |
| EVT-07 | 신청 완료 | 홈 복귀·신청 취소 동선 | PARTIAL | 실제 신청 계정에서 두 버튼 노출·활성, 홈 복귀 클릭 성공, `artifacts/qa/quantum-event-lifecycle/11-application-home-cancel-mobile.png`; 취소 API는 EVT-06에서 검증 | 사용자의 실제 신청은 보존했으므로 가계정 UI에서 취소 확인창부터 취소 완료 화면까지 1회 검증 |
| EVT-08 | 참여 안내 | 여섯 장 말풍선 중앙 정렬·가독성 | PASS | 원본 3:4 비율로 복원. 360·390·430px 모바일과 1440px 데스크톱에서 6장 전체 글자 가로·세로 이탈 0건. `artifacts/qa/quantum-event-lifecycle/16-guide-ratio-step-1.png`~`step-6.png` | 만화 이미지·문구 변경 시 재검증 |
| EVT-09 | 이벤트 확정 | 5명 편성 뒤 match·일정·참가자 연결 | PASS | 2026-08-11 원격 5명 신청으로 match 1개·meeting 1개·비공개 참가자 연결 5개 생성, 재실행 중복 0 | 편성 계약 변경 시 재검증 |
| EVD-01 | 만남 인증 | 참가자 5명 앨범 공유·비참가자 차단 | PASS | 2026-08-11 원격 참가자 5명+외부인 1명: 업로드, 재전송 중복 방지, 5/5 앨범, 외부인 403, 증거·계정 6/6 정리 | Storage·앨범 계약 변경 시 재검증 |
| MTP-01 | 모임 | 원기둥 카드 화살표 이동·카테고리 목록 연결 | PASS | 390x844·1440x900에서 화살표 클릭 후 러닝→배드민턴 전환, `배드민턴 모임을 모아봤어요`와 실제 모임 목록 확인, `artifacts/qa/quantum-event-lifecycle/10-meetup-carousel-actions-mobile.png` | 모임 카드·제스처 변경 시 재검증 |
| AI-01 | 외모분석 | 실제 사진 1장 분석과 비공개 저장 | PASS | 2026-08-11 실제 허용 사진, 분석 1회·재사용·사진 변경 무효화·정리 PASS | 모델·프롬프트 변경 시 재검증 |
| PAY-00 | 결제 환경 | 토스·Supabase·내부 보호키 형식·환경 일치 | PASS | 2026-08-12 로컬 원본의 공개/비밀키 형식과 test 환경 일치 확인, 혼합 환경 차단과 환불 worker·노쇼 권한 테스트 포함 `test:config` 220/220. Vercel Production은 민감값을 다시 등록했으며 pull 시 값이 마스킹되는 보안 동작 확인 | 배포 뒤 운영 readiness 검사 재실행 |
| PAY-01 | 결제 | 토스 샌드박스 결제 | BLOCKED | 2026-08-12 결제창 진입 뒤 원격 match 기록 확인: `pending`, 10,000원, 주문번호 있음, 승인키·`paid_at` 없음. 은행 점검 단계에서 멈췄고 결제 완료로 잘못 저장되지는 않음 | 점검 종료 후 같은 QA 결제 1회 승인 |
| PAY-02 | 환불 | 전액 환불·중복 방지 | BLOCKED | API·웹훅·정산 증거 단위 계약 통과. 실제 결제 원본이 없어 실환불 미실행 | PAY-01 결제 직후 전액 환불·중복 클릭 검증 |
| PAY-03 | 이월 | 10,000원 이월·재사용 | PASS | 원격 `deposit_carryover`·`deposit_carryover_hardening` 적용. 롤백 QA에서 이월 선택→전액 환불 전환→재선택→다음 match 이동, Toss 주문번호 보존, 14일 만료 환불 큐 생성 모두 true, 잔여 fixture 0 | 실제 Toss 승인 원본으로 사용자 화면 E2E는 PAY-01 뒤 1회 확인 |
| PAY-04 | 자동 환불 | 종료 선택 후 대기 요청 자동 처리 | PARTIAL | worker가 만료 대상을 먼저 큐에 넣고 최대 3묶음·30건을 lease 처리하도록 보강. Vercel Production `CRON_SECRET`·`PAYMENT_INTERNAL_SECRET` 등록, 매일 04:00 KST 설정 | 최신 코드 배포 뒤 Vercel Cron 첫 실행 기록과 실제 pending 결제 건 검증 |
| PAY-05 | 노쇼 정산 | 참가자 한 명의 직접 몰수 차단 | PASS | 사용자 API는 `no_show_review_required` 409로 금전 처리 없음. 원격 `finalize_no_show(UUID)`는 anon/authenticated 실행 불가, service_role만 실행 가능 | 신고·증거 검토 계약이 동결될 때 서버 정산 경로를 별도 구현 |
| PAY-06 | 보증금 UX | 전액 환불·다음 매칭 이월 화면과 완료 전 차단 | PASS | 로그인 세션으로 실제 match의 환불 화면을 열어 두 선택 버튼을 클릭했다. 미완료 match는 `만남이 완료된 뒤 선택할 수 있어요`로 안전하게 거절. 390x844 가로 넘침 0, `artifacts/qa/2026-08-12-deposit-carryover/refund-mobile-390x844.jpg`·`refund-browser-viewport.jpg` | 완료된 실제 Toss 결제 match는 PAY-01 뒤 1회 확인 |
| WEB-01 | 웹 빌드 | Next 운영 빌드 | PASS | 2026-08-12 환불 화면 문구 보완 뒤 격리 운영 빌드 성공, 정적 생성 94/94·타입 검사·내부 환불 경로 포함 확인. 웹·모바일 자동 테스트 합계 768개 통과 | 배포 직전 같은 커밋으로 재실행 |
| AND-00 | 모바일 환경 | Expo 프로젝트 건강 검사 | PASS | 2026-08-12 Expo Doctor 20/20, 모바일 테스트 150/150·타입 검사 통과 | 네이티브 의존성 변경 시 재검증 |
| AND-01 | 안드로이드 | 최신 AAB·APK 생성과 실기기 설치 | PARTIAL | 기존 AAB `311ad034-f861-48bf-9679-1583d46f730a`·APK `15b759e6-1670-4576-ab5c-9f310bf4d6c7`는 앱 `package.json` 누락으로 `ERRORED`. EAS 업로드 경계를 고쳐 새 preview APK `96b30fcf-ef7c-49f5-9691-ab9de7f73914`(versionCode 3), production AAB `0734affa-7c5e-4641-bedd-6c5f8aa3bd47`(versionCode 4)을 접수했고 현재 `IN_QUEUE` | 빌드 완료 후 APK 실기기 설치, AAB 보관, Google·Kakao 로그인 확인 |
| AND-02 | 모바일 인증 | Google·Kakao 공급자와 앱 로그인 | PARTIAL | Supabase `/auth/v1/settings` 공개 설정 응답 200, Google·Kakao 모두 enabled 확인 | 완성된 preview APK에서 리디렉션·복귀·세션 유지 실기기 검증 |
| PROD-01 | Vercel | 현재 HEAD와 배포 commit 일치 | BLOCKED | Vercel 프로젝트·로그인 확인, 토스·환불·Cron·`AI_SERVER_SECRET` 운영 환경 등록. 외모분석 Docker 이미지는 로컬 실제 구동과 `/health`까지 통과했지만 운영 AI HTTPS 주소는 없고 작업 폴더에 추적 변경 165개가 섞여 있어 무검토 배포 금지 | 배포 범위를 별도 commit으로 고정하고 AI Docker 서버 주소를 확보한 뒤 `AI_SERVER_URL`을 등록해 같은 commit으로 build·deploy |
| DB-01 | 원격 DB | 이벤트·채팅·앨범·환불 worker·노쇼 권한 migration | PASS | 대상 `jyfwcanjqwboyvicoafm`에 적용, 원격 6계정 E2E·잔여 fixture 0, 환불 lease 컬럼·RPC와 노쇼 service-only 권한 재조회 | 새 migration 추가 시 재검증 |
| DB-02 | DB 성능 | 채팅 RLS initplan·신규 외래키 인덱스 | PASS | 원격 적용 후 performance advisor WARN 0, unindexed FK 0 | 데이터 증가 후 쿼리 통계 재검토 |
| DB-03 | migration 이력 | 로컬 파일과 MCP 적용 버전 일치 | PARTIAL | 원격 보정 migration이 여러 단계로 적용돼 로컬 단일 최종 파일과 버전 이력이 다름 | 배포 전 기준 migration 이력 정합화 |
| SEC-01 | 인증 보안 | 유출 비밀번호 차단 | BLOCKED | Supabase advisor에서 비활성화 경고 1건. 현재 프로젝트는 Free 플랜이며 앱 로그인은 비밀번호가 아닌 이메일 OTP·Google·Kakao OAuth 사용 | 비밀번호 로그인을 도입하거나 Pro 전환할 때 활성화 후 재검사 |
| SEC-02 | DB 보안 | SECURITY DEFINER 실행 권한 감사 | PARTIAL | 2026-08-12 재검사: authenticated WARN 99개. 위험한 참가자 직접 `finalize_no_show` 권한은 제거했고, 관리자 함수는 내부 관리자 검사 확인. 사용자용 RPC가 섞여 있어 일괄 revoke 금지 | 남은 사용자 RPC를 기능별로 호출자·소속·입력 검증 감사 |

## 중복 검증 방지 기록 규칙

1. 각 실행 후 `증거`에 날짜, 실행 환경, 결과 파일을 추가한다.
2. `PASS`는 관련 코드가 바뀌거나 운영 환경이 바뀌 경우에만 다시 실행한다.
3. `PARTIAL`은 안 한 부분만 다음 회차에 실행한다.
4. 가계정·비밀키·실사진은 문서에 남기지 않는다.

## 2026-08-11 만남 화면 회귀 검증 기록

- 모바일 기준: 390x844에서 신청 완료, 홈 상태 전환, 여섯 장 안내, 모임 회전 카드와 실제 목록 이동을 직접 클릭했다.
- 데스크톱 기준: 1440x900에서 안내와 모임 회전 카드의 가로 넘침이 없고 화살표 클릭이 동작했다.
- 신청 취소는 사용자의 실제 신청을 지우지 않기 위해 버튼 노출·활성까지만 확인했다. 서버 취소 경계는 기존 가계정 E2E가 통과했으며, UI 전체 취소 흐름은 별도 가계정으로 남겨둔다.
- 말풍선은 원본 만화 셀 비율과 다르게 렌더링되던 7:8 화면 비율을 3:4로 복원하고, 장면별 실제 흰 말풍선 좌표에 맞춰 다시 배치했다. 6장 모두 DOM 실측상 글자 이탈이 없다.
- 이벤트 가계정 검증 도구는 이벤트마다 다른 3남2여/2남3여 정원을 occurrence에서 읽도록 고쳐 하드코딩 오판을 제거했다.
- 관련 회귀 테스트: `npm run test:matching`, `npm run test:config`, `npm run typecheck`.

## 2026-08-11 현재 출시 차단 계약

- 이벤트 5명 확정, 참가자 채팅, 만남 인증사진, 공동 사진첩은 원격 가계정 E2E까지 완료했다.
- 현재 운영 Vercel은 이 코드보다 오래되어 자동 환불 worker 경로가 404다. AAB·APK 빌드는 접수했지만, 최신 API 배포 전에는 운영판으로 출시하지 않는다.
- 토스 테스트 결제는 키 준비까지만 끝났으며 실제 승인·환불은 사용자 결제창 조작이 필요하다.
- 종료 선택이 만드는 자동 환불 요청을 처리할 서버 worker·원격 lease·Vercel Cron 설정은 준비됐다. 최신 배포가 없어 운영 경로는 아직 404이며 실제 결제 건으로 결제사 취소를 검증하지 않았다.
- 10,000원 보증금 이월은 서버·DB·화면·원격 롤백 QA까지 구현했다. 실제 Toss 승인 원본을 다음 match에 적용하는 사용자 E2E만 남았다.

## 2026-08-11 보안 보완 기록

- 원격 migration `quantum_event_lifecycle_hardening` 적용 완료.
- 이벤트 마지막 자리와 성별별 정원은 occurrence 행 잠금 뒤 계산한다.
- 확정·완료 신청은 사용자가 모집 상태로 되돌리거나 취소할 수 없다.
- 취소는 행 삭제가 아니라 `cancelled` 상태와 사유로 남긴다.
- 채팅 테이블의 인증 사용자 직접 `SELECT/INSERT/UPDATE/DELETE` 권한을 제거했다.
- 채팅 일정은 `scheduled` meeting 한 건만 사용하고 20분 전 gate를 RPC와 RLS에 함께 적용한다.

## 2026-08-11 Supabase 보안 검사 잔여 항목

- 이번 이벤트·채팅 RPC는 `anon`과 `PUBLIC` 실행이 없고 `authenticated`만 실행할 수 있으며, 고정 `search_path`와 `auth.uid()` 기반 소속 검사를 확인했다.
- `rls_enabled_no_policy` 34건은 표별 권한을 재조회했다. 모두 anon/authenticated 직접 DML 권한이 없고 service_role만 읽을 수 있는 서버 전용 테이블이라 현재 공개 데이터 누출은 없다. 사용자 직접 접근이 필요해질 때만 정책을 추가한다.
- security advisor 최신 수치는 WARN 103건, INFO 34건이다. WARN은 `authenticated_security_definer_function_executable` 100건, `anon_security_definer_function_executable` 2건, 유출 비밀번호 차단 1건이다. 참가자가 직접 실행할 수 있던 노쇼 정산 함수는 service-only로 변경했고, 나머지는 의도된 사용자용 RPC와 과도한 권한 함수를 출시 전 별도 감사한다.
- Supabase Auth의 유출 비밀번호 차단 기능은 아직 비활성화 상태다. 비밀번호 로그인을 운영에 열기 전 대시보드에서 활성화하고 재검증한다.
- 채팅 정책의 per-row `auth.uid()` 성능 경고 2건과 신규 이벤트 외래키 인덱스 누락 5건은 원격 보완했고, performance advisor `WARN`은 0건이다.

## 2026-08-12 환불·노쇼 안전성 보완 기록

- 자동 환불 worker는 같은 요청을 두 서버가 동시에 처리하지 않도록 lease를 선점하고, 실패 요청은 최대 5회까지만 다시 시도한다.
- 결제사 취소 결과와 결제 키·주문 번호·환불액이 일치할 때만 기존 최종 확정 함수를 호출한다.
- 현재 원격 환불 대기열은 0건이라 실제 돈은 움직이지 않았다. 보호키 없음 401, 보호키 있음 빈 대기열 200을 확인했다.
- 참가자용 노쇼 API는 더 이상 출석 확정이나 보증금 정산 함수를 호출하지 않는다. 원격 함수 실행 권한도 서버 전용으로 제한했다.
- performance advisor는 WARN 0, INFO 38건이며 모두 `unused_index` 안내다. 신규 인덱스는 생성 직후라 아직 사용 통계가 없으므로 즉시 제거하지 않는다. 보안 advisor는 총 137건(WARN 103·INFO 34)이며 위 SEC-01·02 항목에 분리 기록했다.

## 2026-08-12 보증금 이월·운영 준비 기록

- 보증금 10,000원은 관계 계속 여부와 별개로 `전액 환불` 또는 `다음 매칭 이월`을 고른다. 후원금은 이 경로에서 차감할 수 없도록 환불 API가 정확히 10,000원만 허용한다.
- 이월에서 환불로 바꾸는 작업은 하나의 DB 거래에서 처리한다. 중간 RPC 실패로 이월만 취소되는 상태를 없앴다.
- 14일 자동 환불과 이월 선택은 같은 보증금 행 잠금을 사용한다. 두 선택이 동시에 확정되지 않도록 원격 롤백 QA로 확인했다.
- Vercel Cron은 만료 요청 생성과 결제사 환불 처리를 한 번에 수행한다. 운영 비밀키는 등록했지만 최신 코드 배포와 첫 Cron 실행 기록은 아직 없다.
- Toss 결제창은 열렸지만 은행 점검으로 실제 승인·환불은 완료되지 않았다. 이 항목은 계속 `BLOCKED`로 유지한다.

## 2026-08-12 Android·외모분석 배포 준비 기록

- 기존 Android 빌드 2건은 Expo 대기 상태가 아니라 `apps/mobile/package.json`이 업로드되지 않아 실패한 빌드였다.
- 루트와 모바일 앱의 EAS 제외 규칙을 고쳐 monorepo 경로 `apps/mobile`을 유지했다. 최종 업로드 묶음은 6.1MB이고 `package.json`·`package-lock.json`·앱 아이콘을 포함하며 `.env.local`과 Git 저장소는 포함하지 않는다.
- 새 preview APK와 production AAB는 정상 접수됐고 현재 Expo 무료 대기열에 있다. 빌드 산출물이 생기기 전에는 실기기 설치 완료로 표시하지 않는다.
- 외모분석 서버는 운영 전용 경량 의존성으로 분리하고 승인 기준사진 manifest를 Docker 이미지에 포함했다. 시작 계약 테스트 7/7, 이미지 빌드, 실제 컨테이너 `/health`의 `analyzer_ready=true`, manifest 존재를 확인했다.
- Vercel에는 외모분석 서버와 동일한 비밀값을 등록했지만 `AI_SERVER_URL`은 아직 없다. Render·Railway·Fly.io 같은 Docker HTTPS 호스트 하나를 연결하기 전까지 실제 OpenAI 운영 분석과 최신 Vercel 배포는 차단한다.

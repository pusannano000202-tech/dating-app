# 보증금 보안 검토 및 로컬 커밋 인계 — 2026-09-14

## 판정

**LOCAL CHECKPOINT / MAIN HOLD.** 사용자가 승인한 화면과 그 기반 코드를 보존하고, 이번에 확인한 범위가 작은 보안 결함을 수정한 로컬 저장본이다. 아래의 미해결 금융 항목 때문에 실제 보증금 운영 또는 메인 반영 준비 완료로 판정하지 않는다.

사용자 승인 범위는 로컬 커밋 및 보안·코드 검토다. 메인 병합, push, 배포, 공유/원격 DB 마이그레이션 적용, 실계정 삭제, 결제·취소·환불은 수행하지 않았다.

## 무엇을 어디에 보존했는가

- 원본: `main-web-scope-20260908`, 브랜치 `codex/main-web-scope-20260908`, 기준 `ee9483fdc1bbb8ee8e668b731e4996dc2a6863d5`.
- 검증 후보: `web-security-main-20260914`, 브랜치 `codex/web-security-main-20260914`, 같은 기준에서 분리.
- 원본의 승인된 변경 파일 355개를 허용 목록과 SHA-256으로 확인하여 복사했다. 현재 홈·매칭·모임·커뮤니티·채팅 구현 및 기존 기반은 삭제하지 않았다.
- 원본의 별도 보고서·캡처·원자료·생성 파일 등 43개는 원본에 그대로 남겼다. 후보 커밋에 일괄 포함하지 않았다.
- root `C:/데이팅앱만들기`의 더티 변경과 Git 인덱스는 건드리지 않았다.
- 3004와 3010은 별도 저장소가 아니라 원본 작업공간을 실행하는 두 주소다. 이번 보안 패치는 분리된 검증 후보에만 적용했으며, 두 실행 서버와 원본 의존성을 교체하지 않았다.
- 검토 시 원격 main은 읽기 전용 `git ls-remote`로 `e25aec55e127a640ed8b718f2a21590979232237`임을 확인했다. 로컬 main `da31dfdaf2a4be73c1d61612619de43fe5bd1940`와 달라, 로컬 main 이름만 보고 최신이라고 판단하지 않았다. 최종 커밋 SHA와 합성 트리 검사는 커밋 후 별도 인계에 기록한다.

## 수정한 문제

| 항목 | 확인한 문제 | 수정 및 증거 |
| --- | --- | --- |
| SEC-01 요청 위조 방어 | 기존 보증금·반환·이월 POST 4곳에서 브라우저 요청 출처를 검사하지 않았다. 인증된 쿠키 상황의 foreign Origin/text/plain을 fixture에서 수용했다. | 공통 trusted-origin 검사를 인증·금융 처리 전에 적용. JSON 경계, 정확한 10,000원 정수 검사, null/array 본문 거부, bearer/cookie 인증 모드 일치. 본문 없는 기존 이월 호출은 유지. 실제 핸들러 기반 회귀 5개 및 별도 맥락 독립 재검토 PASS. |
| SEC-02 취소 후 환급 책임 누락 | 방장이 일반 모임을 취소하면 이미 수락된 신청자의 보증금이 `held`에 남고 `refund_due`가 기록되지 않았다. | 새 forward migration에서 취소 시 pending/accepted를 모두 처리. 중복 취소에도 보증금별 책임은 한 번만 기록. 정상 종료의 accepted 보증금은 사용자 결정 전까지 유지. 실제 최신 RPC를 불러온 인메모리 SQL 테스트 통과. 실제 환불 실행을 뜻하지 않는다. |
| DEP-01 공개된 패키지 취약점 | 기존 Next.js 15.5.23, sharp 0.35.3, js-yaml 4.3.1에 공개 보안 공지가 존재했다. | Next.js/eslint-config-next 15.5.24, sharp 0.35.4, js-yaml 4.3.2 및 lockfile 갱신. 후보에 독립 설치하고 새 버전 production build 통과. 패치 후 npm audit 0건. |
| TEST-01 회귀 검사 누락·오래된 검증 | 일부 테스트가 변경 전 컴포넌트 위치·문자열·카탈로그를 기대하거나 새 `.mjs` 보증금 검사를 기본 검사에서 제외했다. | 현재 승인된 호출·리다이렉트·권한·회복 동작에 맞게 테스트 보강. 보증금/공유·채팅 회귀, 공개 취약점, secret scan, 비실서비스 build를 CI에 연결. CI 자체의 원격 실행 성공을 뜻하지 않는다. |
| SQL-ENV | Windows CRLF로 저장된 과거 함수 본문과 후속 SQL의 정확한 LF 비교가 달라 fixture 준비가 실패했다. | SQL 파일을 LF로 정규화하고 `.gitattributes`에 고정. 과거 tracked SQL의 의미 변경 없음. 후보 SQL 테스트는 통과했으나, 이미 DB에 저장된 CRLF 함수 본문은 이 조치로 자동 복구되지 않는다. 실제 적용 검사는 별도다. |

Next.js Windows 원격 코드 실행 공지는 [공식 보안 권고](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36), 이미지 처리 공지는 [Next.js](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4)와 [sharp](https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c), YAML 처리 공지는 [js-yaml](https://github.com/nodeca/js-yaml/security/advisories/GHSA-2883-xcg3-v3hh)에 근거한다. 0건이라는 수치는 검사 시점의 공개 의존성 공지 결과이며, 앱 자체 보안의 완전성을 뜻하지 않는다.

## 메인 반영 전에 해결해야 할 금융 항목

### BLOCK-01 — 일반 모임·스터디·멘토링의 환급 장부와 실제 PG 환불 연결

새 모임 장부는 돌려줘야 하는 금액을 `activity_meetup_admission_refund_outbox`에 남긴다. 하지만 검토한 소스에는 이 장부를 소비해 결제사 환불을 완료하고 결과를 최종 장부로 반영하는 worker가 없다. **“반환할 돈이 기록됨”과 “사용자에게 실제 반환됨”은 다르다.**

완료 기준:

- 사용자의 반환 요청과 해당 보증금·원결제·모임 소속을 서버에서 결합한다.
- PG 원결제 취소로만 반환하며 사용자가 수취인·임의 계좌·반환액을 바꿀 수 없게 한다.
- 요청 중복, worker 재시도, PG 성공 후 DB 응답 유실에서도 한 번의 반환 결과로 수렴한다.
- 사용자 화면과 관리자 화면이 같은 `요청/처리 중/실패/반환 완료` 장부를 읽는다. PG 증빙 전에는 완료 표시를 하지 않는다.
- 독립적인 테스트 PG에서 성공·실패·타임아웃·중복 알림까지 확인한다. 실결제 권한과는 별도다.

### BLOCK-02 — 결제 진행 중 계정 탈퇴와 복구 기록

탈퇴 요청을 만들 때의 금융 보존 분류에 새 admission·checkout 장부가 빠져 있다. 이 분류는 기존 매칭/오늘밤 금융 기록을 확인하지만 새 모임 결제만 있는 계정은 금융 검토 대상으로 분류하지 못할 수 있다. 실제 worker의 최종 삭제 가능 검사는 저장된 legal/storage 플래그를 확인할 뿐, 기존·신규 금융 장부 모두를 새로 재검사하지 않는다.

`20260906181225_community_social_integrated.sql`의 `account_has_legal_retention_candidates`, `confirm_account_auth_delete_ready_for_service`와 `lib/account/retention-worker.ts`, `app/api/internal/retention/process/route.ts`의 실제 삭제 연결을 확인했다. 미확정 checkout의 사용자 연결은 삭제 시 null이 되고 신청 의도는 cascade 삭제되어, 뒤늦은 결제 승인 결과를 기존 RPC로 복구하지 못하는 fixture를 재현했다.

이미 기록된 영수증과 환급 책임이 보존되는 경우와, 아직 기록되지 않은 결제 진행 중 상황을 구분한다. 실제 운영 계정 삭제·금전 손실이 발생했다는 증거는 없다.

완료 기준: 새 금융 장부를 보존 판단에 포함하고 최종 삭제 직전에 미정산 여부를 재검사한다. 이미 진행 중인 결제 승인과 삭제가 경합해도 복구 가능한 불변 결제 문맥을 남기거나 삭제를 보류한다. 사용자 접근 차단을 푸는 우회로 해결하지 않는다.

### BLOCK-03 — PG 전액 취소와 기존 반환 요청 장부의 불일치

`app/api/payments/deposit/webhook/route.ts`의 전액 취소 경로는 deposit을 직접 갱신하지만, 일부 취소 경로는 refund request finalizer를 사용한다. 이 때문에 돈은 취소된 상태인데 반환 요청은 pending으로 남거나, 부분 반환 금액과 전액 취소 장부가 달라질 수 있다.

이 차이는 코드·SQL의 장부 불일치이며, 이중 지급이나 탈취가 입증된 것은 아니다. PG 재조회와 idempotency 방어는 별도로 존재한다.

완료 기준: 전액/부분 취소 모두 증빙과 원결제·버전을 검사하는 일관된 원자적 정산 경로로 수렴한다. worker와 webhook을 역순·동시에 반복해도 사용자/관리자 화면, deposit, refund request가 같은 최종 상태를 가리켜야 한다.

## 이미 확인한 방어선과 검토 한계

- 기존 matching 반환 신청은 인증 사용자·보증금 소유자·매칭 식별자를 결합하며, 자유로운 지급 계좌 입력 필드는 없었다. 신규 모임의 취소→환급 의무 기록은 존재하지만 실제 PG 반환 처리와는 구분한다(BLOCK-01).
- 신규 결제에서는 브라우저의 `paid` 표시를 믿지 않고 서버에서 PG order/key/amount/status/balance를 확인한다.
- 주요 SQL에는 소유권, 10,000원 정책, unique receipt, 행 잠금, idempotency, service 전용 RPC, private 금융 테이블 직접 접근 제한이 있다.
- 관리자 반환/수동 검토 경로는 역할, MFA, 최근 인증을 검사한다. 실제 운영 DB의 AAL2/권한 적용 여부는 별도 미검증이다.
- [OWASP 거래 승인 지침](https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html) 및 [Toss API 계약](https://docs.tosspayments.com/reference)에 맞춰 신원·거래 내용·재시도·실제 완료 증빙을 서로 분리해 검토했다.
- 이번 독립 검토는 API/인증/PG 경계와 SQL/장부 경계로 나눴다. 별도 맥락의 검토가 범위가 작은 수정과 위의 main HOLD 판정에 직접 영향을 주었다.
- 전체 시스템 침투 테스트, 운영 설정 감사, 실제 계정·기기·PG 및 다중 DB 연결 경합을 수행한 것은 아니다.

## 검증 결과

모두 격리된 로컬 후보에서 실행했다. SQL은 인메모리 PGlite fixture이며, 실서비스 자격증명을 쓰지 않았다.

| 검사 | 결과 |
| --- | --- |
| 인증 `test:auth` | 172/172 통과 |
| config + 실제 refund handler fixture `test:config` | 675/675 통과 |
| matching `test:matching` | 878/878 통과 |
| profile `test:profile` | 143/143 통과 |
| friends/account/voice/social-ledgers | 각각 15/19/50/115 통과 |
| content-journey | 118/118 통과 |
| deposit-security | 117/117 통과 |
| ui-cohesion | 111/111 통과 |
| tooling JavaScript | 195/195 통과; 과목 확장과 멘토링 개편 전 검사를 실제 복구·계정 경계 테스트로 보강 |
| TypeScript `--noEmit --incremental false` | 통과 |
| Next.js 15.5.24 production build | 통과; placeholder 환경, 실서비스 접속 증거 아님 |
| ESLint | 오류 없이 통과; 기존 경고 있음 |
| npm audit | 공개 의존성 취약점 0건 |
| tracked + nonignored untracked secret scan | 일치 항목 없음; 패턴 기반 검사이지 비밀값 부재의 완전한 증명이 아님 |
| 정적 migration verifier | **실패 상태 유지**. 기준 HEAD와 후보 모두 같은 66개 경고. 신규 10개 migration의 추가 경고는 0개. baseline을 무작정 갱신하지 않았다. |

개별 suite를 실행한 결과다. 일부 suite는 같은 파일을 포함하므로 숫자를 합쳐 고유 테스트 수라고 해석하지 않는다. 처음 발견한 실패를 숨기지 않고 현 동작과 비교했으며, 변경 전 문자열을 기대하던 회귀 검사는 실제 경계·행동 검사로 보강했다.

## 미검증 및 다음 반영 조건

1. BLOCK-01~03 수정과 독립 재검토 후 금융 동선의 완료 판정을 다시 받는다.
2. 정적 migration 검사의 기존 실패를 별도 원인별로 해결하고, 깨끗한 로컬 DB에서 전체 적용 및 운영과 같은 RLS/RPC 권한을 확인한다. 현재 fixture 통과로 대체하지 않는다.
3. PG 테스트 모드에서 실제 요청·승인·반환·재시도·관리자 확인을 실행한다. 실제 금전 이동은 별도 사용자 승인 대상이다.
4. 커밋 후보로 새 브라우저/모바일 동선을 확인한다. 이번 보안 작업에서는 원본 3004/3010 화면을 새 보안 후보의 검증 증거로 재사용하지 않았다.
5. 그 시점의 최신 원격 main과 합성한 동일 트리에서 CI와 회귀 검사를 통과시킨 후에만 병합 승인 요청을 한다.

세부 로컬 로그·독립 리뷰·초기 원본 manifest는 후보 `.tmp/security-review/`에 남겼다. 해당 폴더에는 시험용 재현 자료가 있으므로 커밋에는 포함하지 않는다. 이 문서는 문제와 검증 한계를 보존하는 로컬 체크포인트이며 출시 승인서가 아니다.

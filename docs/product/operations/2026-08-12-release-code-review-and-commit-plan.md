# Quantum 출시 코드리뷰와 커밋 계획

## 결론

- 결제 서버, 모바일 앱, 외모분석 테스트, 출시 증거를 서로 다른 커밋으로 나눈다.
- 현재 작업 폴더 전체를 한 번에 stage 하지 않는다.
- 최신 웹 운영 배포는 AI HTTPS 주소와 배포 commit이 정해질 때까지 보류한다.

## 코드리뷰에서 수정한 항목

| 심각도 | 문제 | 수정 | 검증 |
| --- | --- | --- | --- |
| P1 | Toss 요청이 응답 없이 오래 걸리면 환불 worker가 Vercel 제한 시간을 넘길 수 있음 | Toss 요청 8초 기본 timeout, worker 한 번당 최대 5건 | config 223개, 로컬 worker 200 |
| P1 | 결제 시작 실패 때 데이터베이스 원문 오류가 사용자 응답으로 나갈 수 있음 | 결제 시작 두 경로 모두 고정 오류 코드와 500 응답 사용 | 유출 방지 계약 테스트 |
| P1 | 환불 Cron이 비밀값 없이 503인데 배포 점검은 이를 통과시킴 | `CRON_SECRET`을 Toss 배포 필수값으로 추가 | 누락 실패 테스트, 로컬 readiness PASS |
| P1 | 모바일은 서버에 있는 이월·환불 기능을 `준비 중`으로 막음 | Bearer 인증으로 실제 이월·전액 환불 연결, 확인창 추가 | 모바일 151개, 타입 검사 PASS |
| P2 | 웹훅 응답에 주문·결제 식별자가 포함될 수 있음 | 공개 응답을 provider·received·status로 축소 | 공개 응답 계약 테스트 |

## 커밋 묶음

### 1. 결제 서버와 DB

제안 제목: `feat(payments): harden refund settlement and deposit carryover`

- 결제 시작·웹훅·환불·이월 API
- Toss timeout·정산 검증 코드
- 자동 환불 worker와 `vercel.json` Cron
- 환불 lease·노쇼 권한·보증금 이월 migration 4개
- 결제 환경 점검과 결제 계약 테스트

주의: 로컬 migration 파일의 날짜형 버전과 MCP가 원격에 기록한 적용 버전은 다르다. 원격에는 네 기능이 이미 적용됐으므로 같은 SQL을 다시 적용하지 않는다.

### 2. Expo 모바일 앱

제안 제목: `feat(mobile): build the native Quantum release candidate`

- 모바일 로그인·프로필·친구·알림·모임·앨범·매칭
- 보증금 상태·이월·전액 환불
- 회의 안내와 Android 빌드 설정
- 모바일 테스트와 앱 자산

모바일 파일은 라우터와 공용 API가 서로 연결돼 있어 일부만 커밋하지 않는다.

### 3. 외모분석 회귀 테스트

제안 제목: `test(ai): align appearance checks with the OpenAI runtime`

- 현재 OpenAI 기반 분석 흐름과 가입 순서에 맞춘 Python 테스트
- 사용하지 않는 구형 PyTorch 모델 의존 테스트는 의존성이 있을 때만 실행

### 4. 출시 증거 문서

제안 제목: `docs(release): record payment and Android verification gates`

- 출시 검증 매트릭스
- 본 코드리뷰와 커밋 계획

## 현재 검증 결과

| 영역 | 결과 |
| --- | --- |
| 루트 자동 테스트 | 623개 PASS |
| 모바일 자동 테스트 | 151개 PASS |
| Python 외모분석 테스트 | 81개 PASS, 구형 PyTorch 전용 17개 SKIP |
| TypeScript | 웹·모바일 PASS |
| Next 운영 빌드 | PASS, 94개 route 생성 |
| Expo Doctor | 20/20 PASS |
| 자동 환불 worker | 인증된 로컬 실행 200, 원격 대기 0건 |
| Android | AAB·APK 모두 IN_QUEUE, 산출물 없음 |
| Toss | 원격 deposit pending 1건, 승인 키·paid_at 없음 |
| Vercel 최신 배포 | BLOCKED, AI_SERVER_URL 없음 |

## 사람이 해야 하는 작업

1. Render, Railway, Fly.io 중 하나의 계정과 Docker 서비스 생성 권한을 준비한다.
2. APK가 생성되면 Android 휴대폰에 설치해 Google·Kakao 로그인 복귀와 세션 유지를 확인한다.
3. Toss 테스트 결제를 승인 완료한 뒤 전액 환불과 다음 매칭 이월을 각각 한 번 검증한다.
4. AI HTTPS 주소가 생기면 Vercel에 `AI_SERVER_URL`을 등록하고 검증된 commit으로 배포한다.

## 커밋 제외

- `.env.local`과 모든 실제 키
- `.next*`, `.tmp`, 로그, 화면 캡처 원본 중 제품 자산이 아닌 파일
- 새벽벌 게임 작업과 Quantum 앱에 무관한 문서
- 검증하지 않은 대량 변경을 섞는 `git add .`

## 2026-08-12 실행 결과

| 영역 | 최종 확인 |
| --- | --- |
| GitHub | `codex/quantum-handphone` 브랜치 push 완료. `main` 미병합 |
| 웹 | 깨끗한 작업공간에서 typecheck·production build 통과 |
| 모바일 | typecheck·Expo Doctor 20/20·자동 테스트 153/153 통과 |
| Android | Preview APK v4·Production AAB v5 빌드 완료 및 로컬 산출물 해시 고정 |
| EAS 환경 | 빌드 로그에서 운영 API 주소·Supabase 프로젝트 주소 주입 확인 |
| Toss | 만료 주문 회전·환불 worker·이월 경계 수정 완료, 실제 승인 원본 E2E는 미검증 |
| Supabase | 앱 프로젝트 migration·관리 RPC 권한 보강 확인. Free 플랜 비밀번호 유출 차단 경고는 OTP·OAuth 구조에서 출시 즉시 차단은 아님 |
| Vercel | 로그인과 CLI 토큰이 없어 AI HTTPS 배포·최신 웹 배포는 BLOCKED |
| 실기기 | 현재 PC에 `adb`가 없어 APK 설치·Google/Kakao 복귀는 미검증 |

남은 사람 작업은 Vercel 로그인, APK 실휴대폰 설치, Toss 테스트 승인 1건이다. 이 세 가지가 끝나기 전에는 production 전체 완료로 판정하지 않는다.

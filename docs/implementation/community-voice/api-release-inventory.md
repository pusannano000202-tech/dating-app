# Community Voice 출시 API·운영 연결 목록

검사일: 2026-09-07  
근거: 활성 코드, `.env.example`, `vercel.json`의 변수명과 호출 경로만 확인

## 결론

코드상 외부 연결 지점은 마련돼 있지만, 이 문서는 **실제 원격 설정 완료를 증명하지 않는다**. 출시 전 최소 공통 기반은 Supabase 프로젝트·Auth·서버 비밀키와 정확한 공개 앱 origin이다. 보이스, 외모 점수 기반 매칭, 실제 결제, 브라우저 Push를 출시 범위에 넣으면 각각 LiveKit, AI 서버, Toss, VAPID/Cron 연결도 필수다. Naver 지도와 Kakao 공유는 대체 화면·공유 경로가 있어 조건부다.

실제 값은 확인하지 않았으며, 아래에는 변수명만 적었다. `NEXT_PUBLIC_` 변수는 브라우저에 공개되므로 서버 비밀을 넣으면 안 된다.

## 출시 연결표

| 연결 | 출시 중요도 | 변수·설정 이름 | 활성 코드와 용도 | 현재 판단 |
| --- | --- | --- | --- | --- |
| Supabase Database/Auth | 공통 필수 | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 또는 `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY` 또는 레거시 `SUPABASE_SERVICE_ROLE_KEY` | `lib/utils.ts:6`, `lib/supabase-admin.ts:14`; 로그인, RPC, 운영 worker | 코드 경로 있음. 프로젝트 URL·키·RLS·RPC·원격 migration 실제 상태 미확인 |
| 전화 OTP | 전화 인증 출시 시 필수 | Supabase Auth의 SMS 공급자 설정, `SUPABASE_PHONE_OTP_TTL_SECONDS`, `PHONE_VERIFICATION_DIGEST_SECRET` | `app/api/auth/phone/start/route.ts:62`, `app/api/auth/phone/verify/route.ts:56`, `lib/auth/phone-verification.ts:65`; 발송·검증·해시 rate limit | 코드 경로 있음. 실제 SMS 공급자, 발신 정책, TTL 일치, Vercel ingress 경계 미확인 |
| Supabase Realtime | 친구 채팅 실시간 갱신에 필수 | 공통 Supabase 공개 설정 + Realtime publication/RLS | `components/friends/FriendChatRoom.tsx:112`, `components/friends/ConversationList.tsx:48`; `postgres_changes` 무효화 | 클라이언트 구독 코드 있음. 원격 publication·권한·연결 미확인 |
| Supabase Storage | 사진·앨범·증거 업로드에 필수 | 공통 Supabase 설정 + Storage bucket/RLS; 서버 삭제는 관리자 키 | `app/api/profile/photos/route.ts:88`, `app/api/match/series/[seriesId]/album/route.ts:145`, `app/api/internal/retention/process/route.ts:69` | 업로드·서명 URL·삭제 코드 있음. 원격 bucket·RLS·보존 worker 실제 실행 미확인 |
| 공개 앱 origin | 공통 필수 | `NEXT_PUBLIC_APP_ORIGIN` | `lib/utils.ts:25`, `lib/auth/trusted-origin.ts:39`; callback·mutation origin·초대 URL 기준 | 예시만 있음. 실제 HTTPS 도메인과 Auth redirect allowlist 미확인 |
| LiveKit 보이스 | 보이스 기능 출시 시 필수 | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, 선택 `LIVEKIT_CONNECT_ORIGINS`, worker용 `VOICE_WORKER_SECRET` 또는 `CRON_SECRET` | `lib/voice/policy.ts:149`, `lib/voice/server.ts:106`, `app/api/voice/webhook/route.ts:16`, `app/api/internal/voice/reconcile/route.ts:12`; 토큰·방·webhook·정리 | 코드 경로 있음. 빈 값이면 실제 음성 연결 없음. 프로젝트·webhook URL·방화벽·실기기 품질·요금제 미확인 |
| 외모 AI 서버 | 외모 점수가 필요한 매칭 출시 시 필수 | `AI_SERVER_URL`, `AI_SERVER_TIMEOUT_MS`, `AI_SERVER_SECRET` | `app/api/score/route.ts:17`, `lib/profile/appearance-score.ts:164`; 비공개 사진 분석과 점수 저장 | 서버 연동 코드 있음. 배포 주소·모델·처리용량·사진 처리 계약·비용 미확인. 일반 가입/커뮤니티만 열 때는 조건부 |
| Naver Maps JS | 앱 안 지도 렌더링 시 필수, 링크 대체 가능 | `NEXT_PUBLIC_NAVER_MAPS_NCP_KEY_ID` | `components/campus-eats/NaverCampusMap.tsx:154`, `components/places/PlaceMap.tsx:47`; 브라우저 지도 | 키가 없으면 fallback UI. 도메인 등록·quota·과금 조건 미확인 |
| Naver 검색 | 선택 | 별도 Naver Search API 비밀변수 없음 | `lib/campus-eats/fixtures/pnu-categories.ts:96`, `components/campus-eats/CampusEatsPilot.tsx:843`; 정적 Naver 지도 검색 URL로 이동 | 현재는 서버 검색 API가 아니라 외부 딥링크. 실시간 장소·리뷰 수집이 필요하면 별도 API/권리 검토 필요 |
| Kakao 초대 공유 | 선택 | `NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY`, 선택 `NEXT_PUBLIC_KAKAO_SHARE_ORIGIN`; 토큰 생성은 서버 전용 `FRIEND_INVITE_TOKEN_SECRET` | `lib/kakao-share.ts:41`, `app/group/create/page.tsx:492`, `app/api/friend-invites/route.ts:26`; Kakao 공유와 복구 가능한 친구 초대 링크 | Kakao 키가 없으면 Kakao 공유 불가. 앱 도메인·플랫폼 등록·quota 미확인. 초대 토큰 비밀은 친구 초대 사용 시 필수 |
| Toss Payments | 실제 유료 결제 출시 시 필수 | `NEXT_PUBLIC_PAYMENT_PROVIDER=toss`, `PAYMENT_PROVIDER=toss`, `NEXT_PUBLIC_TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY`, `PAYMENT_INTERNAL_SECRET`; 선택 `TOSS_API_TIMEOUT_MS` | `lib/payments/deposit.ts:33`, `lib/payments/toss.ts:181`, `app/api/payments/continuation/confirm/route.ts:104`; 승인·취소·환불·복구 | 코드 경로 있음. 예시는 `mock`; 운영에서는 mock/local simulator 금지. 가맹점 계약·live key·webhook/복구·실결제 E2E·수수료 미확인 |
| Web Push | 브라우저 Push를 켤 때 필수 | `TONIGHT_NOTIFICATIONS_ENABLED` 또는 `CAMPUS_SEVEN_NOTIFICATIONS_ENABLED`, `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_VAPID_SUBJECT`, Campus Seven은 `CAMPUS_SEVEN_PUSH_CRON_SECRET` | `lib/notifications/tonight-contract.ts:37`, `lib/campus-seven/web-push.ts:25`; 구독자 Push 전송 | 기본 비활성 예시. 브라우저 권한 동의, endpoint 전달률, VAPID 키, 실제 기기 검증 미확인 |
| Cron/내부 worker | 자동 배정·정산·보존·음성 정리에 필수 | `CRON_SECRET`; 일부 계속 만남은 `CONTINUATION_INTERNAL_SECRET`, 음성은 `VOICE_WORKER_SECRET`; 파괴적 계정 삭제는 `ACCOUNT_DELETION_WORKER_ENABLED`; `TONIGHT_CRON_SCHEDULER`는 출시 scheduler 확인 표식 | `vercel.json:3`, `app/api/internal/voice/reconcile/route.ts:12`, `app/api/internal/retention/process/route.ts:32`; 다수 내부 queue/worker 호출 | schedule 선언은 있음. 계정 삭제 예시는 기본 `false`. `CONTINUATION_INTERNAL_SECRET`는 활성 코드에 있으나 `.env.example`에는 없고 현재 route들은 `CRON_SECRET` fallback을 사용한다. Vercel 요금제·최소 주기·Authorization 전달·실행 지연·재시도/모니터링 미확인 |
| Vercel 배포 | Vercel을 운영 호스트로 쓸 때 필수 | 위 env 전체, `NEXT_PUBLIC_APP_ORIGIN`, `vercel.json`; 전화 OTP는 `x-vercel-forwarded-for` 신뢰 경계 사용 | `lib/auth/phone-client-address.ts:4`, `vercel.json:3`; Next.js 호스팅과 Cron ingress | 로컬 코드만 확인. 프로젝트 연결·도메인·환경별 env·빌드·요금제·배포 상태 미확인 |
| 법적 운영자 표시 | 공개 출시 전 필수 운영 데이터 | `SERVICE_OPERATOR_NAME`, `SERVICE_OPERATOR_ADDRESS`, `SERVICE_OPERATOR_CONTACT`, `PRIVACY_CONTACT` | `lib/account/legal-disclosure.ts:11`, `app/terms/page.tsx:4`, `app/privacy/page.tsx:4`; 약관·개인정보 페이지 표시 | 네 값이 모두 유효해야 `publishable=true`. 실제 사업자 정보·대표자/등록번호 등 추가 법정 표시 필요 여부와 법률 검토는 미확인 |

## 출시 순서

1. Supabase 프로젝트, 공개/서버 키, 원격 migration·RLS·Storage bucket, Auth redirect와 전화 SMS 공급자를 확인한다.
2. 실제 HTTPS 도메인과 `NEXT_PUBLIC_APP_ORIGIN`을 확정하고 Vercel 환경별 변수·Cron 인증을 연결한다.
3. 출시 기능에 맞춰 LiveKit, AI 서버, Toss, Push를 하나씩 켜고 각각 실계정·실기기·실결제 또는 sandbox E2E를 별도 기록한다.
4. Naver 지도·Kakao 공유는 도메인 등록 후 확인하되, 실패 시 fallback 동작도 검증한다.
5. 운영자·개인정보 문의 정보를 확정하고 약관/개인정보 페이지 및 추가 법정 표시 의무를 운영·법률 검토한다.

## 비용·운영 경계

- Supabase, LiveKit, Naver Cloud, Toss, Vercel의 quota·요금·계약 조건은 계정과 시점에 따라 달라질 수 있어 이 코드 감사로 확정하지 않았다.
- Web Push 프로토콜 사용 자체와 별개로 호스팅, Cron, 모니터링 운영비가 든다.
- AI 서버는 자체 호스팅 또는 모델 공급자 비용과 사진 개인정보 처리 책임이 별도로 필요하다.
- 비밀값은 서버 전용 환경변수와 공급자 비밀 저장소에 두고, `NEXT_PUBLIC_`에는 문서에 명시된 브라우저 공개 키만 둔다.

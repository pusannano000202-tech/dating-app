# Quantum 보이스·보안·홈·학과 대항 점검서

기준일: 2026-09-08. 대상은 `social-scene-implementation-20260907` 작업공간의 현재 미커밋 코드까지 포함한다.

## 판정

**출시 보류.** 보이스는 실제 LiveKit 연결 코드가 있지만 제공자 연결·DB 적용·실기기 송수신은 완료 증거가 없다. 운영자와 업장은 서버에서도 분리되어 있으나, 관리자 계정 보호와 개인정보 응답 최소화 등 출시 전 보완할 사항이 있다. 이번 검사는 코드 위험 점검이지 유출 사고 포렌식이 아니다. **유출이 없다고 보증하거나, 발견한 코드 위험을 실제 유출 사고라고 단정하지 않는다.**

홈·학과 대항은 기존 화면의 문제를 확인하고 새 디자인 세 가지를 이미지로 제안했다. 아직 선택 전이며 구현 화면이 아니다. 보이스 재접속 결함만 승인된 실제 연결 기능 범위에서 로컬 수정·회귀 검증했다. 실제 통화 검증은 아니다.

## 1. 검사 범위·증거 수준

- Git: `codex/social-scene-implementation-20260907`, HEAD `be9078565d8e59f73cbc017f3c7b1484996da1c3`. 시작 staged 0 / 기본 `git status --short` 출력 645 entries. untracked 디렉터리가 접힌 항목 수이며 파일 수가 아니다. 이전 구현을 포함한 수치다.
- 공통 코드: 운영자/업장/보이스 담당 영역 외 app/components/lib 소스 687개, API route 194개를 대상으로 위험 패턴 선별 검사. 클라이언트 파일 168개에서 서버 전용 환경변수 참조 검사.
- 운영자·업장: UI gate → 서버 guard → RPC → RLS/grant 및 service-role 호출 순서 추적.
- 검사한 admin/partner API 57개는 공통 요청 가드 또는 해당 가드를 호출하는 wrapper를 거쳤다. 누락을 발견하지 못한 것과 모든 경우의 우회를 실계정으로 시험한 것은 다르다.
- 보이스: 대기·수락·토큰·미디어·퇴장·신고·webhook·정리 작업 추적.
- 브라우저: 현재 로그인된 로컬 `localhost:3013`의 홈/학과 대항. 390×844, 1440×900. 학과 게임 선택, 작성폼 열기, 제목 입력, 닫기, 홈 복귀. 모집 저장은 하지 않음.
- 제외/미검증: 전체 경로 침투 시험, 원격 DB 적용 상태·실데이터 RLS, 배포 bundle/환경변수, 클라우드 계정 MFA 설정·접근 로그, 실제 결제·환불, 실기기 음성, 외부 보안 사고 이력. 스캔이나 테스트 통과로 이 항목을 통과 처리하지 않는다.
- 실행 경로 재확인: 3013 PID 31032 → 부모 Next PID 39352 → 이 작업의 `serve-social-scenes-local.mjs` PID 22260. `node_modules`는 community-voice 작업공간을 가리키는 Junction이다. 실행 파일의 의존성 경로만으로 앱 작업공간이 다르다고 했던 중간 판정은 폐기했다. target `.next-social-scenes-local`의 department client-reference-manifest에는 target 컴포넌트의 절대 경로가 기록되어 있다.

## 2. 운영자·업장·최고관리자 구분

소스 구조는 각 역할마다 독립 서버가 있는 구조라기보다 공통 Next.js 앱/API 안에서 경로·현재 역할·DB 권한으로 분리하는 구조다. 따라서 운영자 화면을 따로 만들었다는 사실만으로 서버 침해 영향이 격리되는 것은 아니다. 실제 배포 인프라의 네트워크/계정 격리는 이번 범위에서 확인하지 않았다.

| 구분 | 소스상 역할 | 권한 제한 확인 | 남은 보완 |
|---|---|---|---|
| 일반 사용자 | 본인의 신청·참가·친구·보이스 이용 | 로그인·멤버십·학교·차단 여부를 각 API/RPC에서 확인 | 운영 DB/실계정 회귀 검증 |
| 업장 `partner` | 자기 업장의 배정·수용·도착 현황 처리 | 현재 역할과 업장 소속을 서버에서 다시 확인, 타 업장 ID 차단 | 실제 서로 다른 두 업장 계정으로 API 직접 호출 검증 |
| 운영자 `admin` | 서비스 모집·배정·예외/신고 대응 | DB의 현재 관리자 역할과 기능별 권한 검사 | 민감 응답 축소, MFA 강제, 보이스 신고 처리 범위 보완 |
| 최고관리자 `super_admin` | 권한·상위 운영 관리 | 일반 운영자와 별도 검사, 일부 민감 기능은 최근 로그인 확인 | 최근 로그인은 MFA가 아님. 계정 탈취 방어·권한 회수 검증 |

근거: `app/admin/layout.tsx:15`, `app/partner/layout.tsx:12`, `lib/auth/server-guards.ts:143`, `supabase/migrations/20260906181225_community_social_integrated.sql:4598`. 역할은 사용자가 바꿀 수 있는 JWT user_metadata가 아니라 DB 관리자·업장 멤버십에서 산출한다. 업장 소유권은 `20260903102500_tonight_roster_profiles.sql:433` 등에서 추가 확인한다.

서비스 서버의 service-role 키는 DB 보안을 우회할 수 있는 고권한 수단이다. 확인한 호출은 서버 guard 뒤에 있지만, 그 키가 탈취되거나 서버가 침해되면 화면상의 역할 분리만으로 막을 수 없다. 키는 서버 비밀 저장소에만 두고, 운영/검수 환경 분리·키 교체·권한 최소화·접근 감사를 같이 운영해야 한다. [Supabase RLS 공식 설명](https://supabase.com/docs/guides/database/postgres/row-level-security)

## 3. 확인된 보안 보완 사항

| 항목 | 확인한 근거·조건 | 영향 | 필요한 조치 |
|---|---|---|---|
| 관리자 MFA 강제 부재 | `20260902201243_venue_partner_rbac.sql:10`의 최근 로그인 검사는 세션 생성 15분 기준. 검사한 저장소에 MFA/aal2 강제 로직 없음 | 관리자 로그인 수단이 탈취되면 민감 권한으로 이어질 위험 | 등록·2차 인증 화면, API/DB의 aal2 검사, 복구·권한 회수 시험. 실제 계정의 MFA 설정은 별도 미검증 |
| 운영자 개인정보 응답 과다 | `20260903043000_tonight_sensitive_read_atomic_enforcement.sql:172`에서 대상자·신고자 이름과 원문 전화 반환. UI는 일부만 사용 | 허가된 운영자에게도 불필요한 개인정보가 전달됨 | 기본 마스킹, 업무상 필요한 필드만 응답, 필요한 경우 별도 사유·권한·감사 기록을 거치는 상세 열람 |
| 이동 주소 검증 불일치 | `lib/client-redirect.ts:3`은 `/` 시작·`//`만 차단, 역슬래시 정규화 경계 미검사. 가입 프로필 흐름에서 사용 | 외부 주소 이동을 유도할 수 있는 URL 해석 우회 | 기존 `lib/auth/redirect.ts`의 다중 디코딩·역슬래시·제어문자·동일 origin 검증으로 통일. 실제 브라우저 공격 전체 흐름은 미검증 |
| 개발 전용 화면 production 차단 누락 | `app/dev/preview/page.tsx:64`, `mascot-screen-report/page.tsx:156`, `meeting-evidence-preview/page.tsx:3`, `tonight-release-rehearsal/page.tsx:1` | 내부 화면 구조·검수 자료가 배포 라우트에 남을 위험. 실제 개인정보 노출이 확인된 것은 아님 | 공통 서버 측 production 404 gate, 정식 build에서 직접 URL 요청 검사 |
| 업로드 입력 전체를 읽은 후 크기 검사 | `app/api/profile/photos/route.ts:269`, `app/api/matches/[id]/evidence-photo/route.ts:45` | 인증 사용자 요청도 큰 multipart 입력으로 메모리 부담을 줄 수 있음. 호스팅 제한은 미검증 | 스트림/body 상한을 파싱 전에 적용. 거짓/없는 Content-Length와 병렬 요청 테스트 |

최근 로그인 시간과 2단계 인증은 다른 보호 장치다. Supabase는 2차 인증 완료를 `aal2`로 구분하며 화면만이 아니라 API/DB에서도 적용하도록 안내한다. [Supabase MFA](https://supabase.com/docs/guides/auth/auth-mfa)

확인한 보호 장치: 변경 요청의 정확한 Origin 검사, 현재 DB 역할 재조회, 업장 소속 재확인, 민감 조회 감사·호출 제한, 핵심 테이블 직접 접근 revoke/RLS, 서버 전용 키 사용. 표본 결제 코드는 production mock 사용을 차단하고 webhook에서 공급자 결제정보·금액·주문을 다시 검증한다. 이 결과는 서버 전체 침해 가능성이 없다는 뜻이 아니다.

추가 정책·운영 경계:

- 일반 operator는 Tonight 전체 라운드 요약·예외를 조회할 수 있다 (`app/api/admin/tonight/summary/route.ts:7`). 내부 소수 운영자라는 정책이면 의도일 수 있으나, 여러 학교/외주/파트타임 담당자를 둘 때는 담당 학교·지역·라운드별 범위를 추가해야 한다. 업장 권한과 달리 전역 운영 범위라는 점을 분명히 한다.
- partner setup RPC는 알고 있는 다른 round UUID의 날짜·상태·마감 시각 같은 공통 메타데이터를 반환할 수 있다 (`20260905044012_tonight_partner_setup_schedule.sql:22`). 타 업장의 개인정보를 반환한다는 발견은 아니다. 일정 자체를 비공개로 둘 정책이면 추가 제한이 필요하다.
- 일부 오류 화면의 raw 오류 객체 콘솔 기록 및 운영 CSP의 `unsafe-inline`도 방어 강화 후보다. 직접 개인정보가 콘솔에 기록되거나 XSS가 재현된 것으로 판정하지 않았다. 오류 코드/digest 중심 기록과 nonce 기반 CSP 적용 가능성을 별도로 검토한다.

## 4. 보이스는 어떻게 붙이는가

사람끼리 통화하는 기능이므로 **OpenAI 음성 API가 필수인 구조가 아니다.** 기존 코드에 맞는 연결 대상은 LiveKit(실제 음성 송수신) + Supabase(계정·방·대기·참가 권한)다.

| 단계 | 현재 상태 | 실제 사용 가능 판정에 필요한 증거 |
|---|---|---|
| 화면·대기·역할 선택 | 구현됨 | 남/여·총 대기자 수는 해당 대기열 기준이며 통화 중 인원과 구분 |
| 상호 수락·권한 확인 | RPC 코드·테스트 있음 | 승인된 DB에 적용 후 다른 학교/차단/미수락 토큰 거절 확인 |
| LiveKit 접속·마이크 | SDK와 연결 코드 있음 | 제공자 프로젝트 설정 후 실제 기기 간 음성 송수신 |
| 퇴장·강퇴·신고·정리 | webhook·outbox·정리 코드 있음 | 네트워크 종료/앱 강제종료/중복 webhook/누락 webhook 복구 시험 |
| 운영 통화 | 미검증 | 1:1, 5인, 정원 충돌, iOS/Android 권한·백그라운드·재접속 시험 |

서버 환경 설정 이름: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `VOICE_WORKER_SECRET` 또는 cron 계약에 필요한 `CRON_SECRET`, 허용 연결 origin/CSP 설정. 정확한 필요한 조합은 배포 환경에 맞춰 검증해야 한다. 비밀키는 채팅에 붙여 넣거나 `NEXT_PUBLIC_*`로 만들지 않는다. 프로젝트 생성·키 발급·비용·배포 환경 저장·DB 적용은 별도 승인 작업이다.

현재 셸과 example 파일에는 공급자 설정이 없었다. **이 사실만으로 실행 중인 Next 서버 전체 환경을 판단하지 않는다.** 추가로 `scripts/qa/community-voice-local-runtime.mjs:14`의 환경 허용 목록과 `:67`의 child 생성은 LiveKit/worker 변수를 전달하지 않고, `.env` 로딩도 금지한다. 런처는 Supabase 설정만 별도로 주입하는 안전한 검수 환경이며 `mediaProviderConfigured:false`를 선언한다. 따라서 지금 검수 런처에 키만 임의 추가해서 운영 환경처럼 바꾸지 않는다. 실제 공급자 연결을 성공시킨 증거는 없다.

토큰 구현은 만료 60초, 대상 방/참가자, 마이크 발행만 허용하고 카메라·데이터 발행을 주지 않는 방향이다 (`lib/voice/server.ts:184`). 단, 토큰 만료만으로 이미 연결된 참가자가 즉시 퇴장하는 것은 아니므로 강퇴/권한 회수 처리가 필요하다. [LiveKit 토큰·권한](https://docs.livekit.io/frontends/reference/tokens-grants/)

### 보이스의 남은 운영·개인정보 위험

- webhook 누락 + 앱 강제종료 시 DB에는 `connected=true` 참가자가 남을 수 있다. 현재 sweep의 미접속 유예만으로는 제공자 실제 참가자와 차이를 모두 복구하지 못한다. LiveKit 참가자 목록과 주기적으로 대조하는 복구·경보가 필요하다. webhook은 반드시 도착한다고 가정할 수 없다. [LiveKit webhook 문서](https://docs.livekit.io/intro/basics/rooms-participants-tracks/webhooks-events/)
- 현재 앱 코드에 녹음/Egress 호출은 발견하지 못했지만, 종단간 암호화(E2EE) 설정도 없다. 전송 구간 암호화와 ‘제공자도 내용을 볼 수 없음’은 다르다. 지역·보관·녹음 정책과 E2EE 필요 여부를 확정해야 한다. [LiveKit 암호화](https://docs.livekit.io/transport/encryption/)
- 방·세션·참가·신고·완료 outbox의 보관/파기 기간이 아직 충분히 정의되지 않았다. 특히 신고 자유 입력에는 개인정보가 포함될 수 있다. 법률상 적정성을 이 코드 점검으로 확정하지 않는다.
- 일반 운영자의 신고 처리 범위와 `voice_restrictions` 제한 조치 UI/API가 부족하다. 최고관리자 의존, 신고 접수 후 실제 이용 제한까지 이어지는 운영 절차를 보완해야 한다.
- 소수여도 남/여 숫자를 공개한다는 최신 사용자 결정은 변경하지 않았다. 다만 소규모 학교·주제에서 개인을 추측할 수 있는 잔여 위험은 출시 정책 검토에 명시해야 한다.

## 5. 홈·학과 대항 디자인 평가와 구현 계약

### 현재 확인한 문제

1. 홈은 `QuantumHomeParticipation.tsx:88`에서 매칭 신청·이어 만남을 읽지만 본인이 참가한 일반 모임 목록을 함께 읽지 않는다. `QuantumHomePulse.tsx:44`는 공개 모집 목록이지 ‘내 모임’이 아니다.
2. 현재 로컬 홈에는 모집 조회 실패와 빈 핫글 영역이 큰 면적을 차지한다. 콘텐츠 추천은 `QuantumHomeRecommendations.tsx:7`의 두 항목에 고정되어 있어 보이스·MBTI·배달·장소·학과 대항 발견이 약하다.
3. 학과 대항은 설명·진행 단계·작성폼이 위에 집중되고 실제 종목의 즐거움과 팀 구성은 약하다. 데스크톱에서 ‘팀 정원’ 라벨이 세로로 쪼개지는 현상도 확인했다.
4. 양 화면에서 가로 페이지 넘침은 관찰되지 않았다(390 viewport/page375, 1440 viewport/page1425). 이것은 손가락 조작·전체 접근성·모든 콘텐츠 길이 통과를 의미하지 않는다.
5. 학과 목록은 현재 로컬에서 조회 실패 상태여서 실제 초대·수락·일정 저장은 검증하지 않았다.

### 구현할 동선

- 홈 상단: 내 모임/매칭/이어 만남 → 서버 상태에 맞는 다음 행동 한 개. 모임은 채팅 바로 진입, 매칭은 기존 채팅 공개 시점 유지. 이어 만남은 내 동의·내 결제 경계를 보존한다.
- 홈 하단: 사진으로 넘기는 콘텐츠 캠페인 → 관련 기능 바로 열기. 보이스/게시글/취향 콘텐츠 어느 한 종류를 영구 고정하지 않는다. 조회 실패는 작고 명확한 재시도, 실제 미참가 때만 추천 표시.
- 학과 대항: 게임·축구 사진 선택 → 정원·팀 이름 → 생성 성공 → 실제 초대 가능한 친구 → 상대 수락 → 상대 학과·일정 확인. 생성 전 인원은 계획임을 표시하며 실제 참가자로 계산하지 않는다.
- 현 서버 정원 범위 2~20, 제목 4~80자 등 계약을 보존한다. 이미지에 예시로 나온 5명/짧은 입력 길이가 새로운 서버 제한은 아니다.
- 공개 실명/얼굴 확대·자동 친구·검증된 학교 배지는 추가하지 않는다. 시안의 사람 사진은 분위기 자료이며 실제 사용자 프로필이 아니다. MBTI 문구는 ‘연애 경험 통계’로 정리하며 과학적 궁합 판정으로 바꾸지 않는다.

### 시안과 실제 화면 증거

디자인 시안 3개는 대화에 나온 순서가 선택 번호다. 모두 홈(왼쪽)·학과 대항(오른쪽) 한 흐름이다. 사진·인원은 예시이며 아직 앱에 적용하지 않았다.

- 시안 1: `C:/Users/82108/.codex/generated_images/01a06d89-ddb3-7360-b709-96d9847fece8/exec-ef8d71b0-f657-478d-8d55-0a8c96559043.png`
- 시안 2: `C:/Users/82108/.codex/generated_images/01a06d89-ddb3-7360-b709-96d9847fece8/exec-b67cd4f8-7e1a-47f6-b2d5-6b47c2a9dfde.png`
- 시안 3: `C:/Users/82108/.codex/generated_images/01a06d89-ddb3-7360-b709-96d9847fece8/exec-98449869-2ed7-4237-a19e-3312a840ad22.png`

현재 앱 캡처:

![기존 홈 모바일](C:/Users/82108/.config/superpowers/worktrees/데이팅앱만들기/social-scene-implementation-20260907/artifacts/product-security-review-20260908/home-mobile-before.png)

![기존 학과 대항 데스크톱](C:/Users/82108/.config/superpowers/worktrees/데이팅앱만들기/social-scene-implementation-20260907/artifacts/product-security-review-20260908/department-desktop-before.png)

## 6. 검증 결과

| 검사 | 이번 결과 | 의미/한계 |
|---|---|---|
| 의존성 `npm audit` | 456 dependencies, 알려진 취약점 0건 | 조회 시점 advisory 기준, 코드 자체 보안 보증 아님 |
| tracked+untracked 비밀값 패턴 검사 | 통과 | 과거 Git 이력·원격 배포값·모든 종류의 비밀값 보증 아님 |
| auth 테스트 | 156/156 통과 | 로컬 테스트 |
| config 테스트 | 660/660 통과 | 로컬 테스트 |
| profile 테스트 | 141/141 통과 | 로컬 테스트 |
| matching 테스트 | 871/872 통과 | `tests/matching/friend-date-proposals.test.ts` 문구 `/확정된 약속/` 기대와 불일치 1건. 전체 통과라고 보고하지 않음 |
| voice 수정 전 기준 | 31/31 + mjs40/40 통과 | 소스·fixture/PGlite, 실통화 아님 |
| migration 파일 검사 | 228개 통과, 기존 baseline 경고 16개 | 파일 검사이지 DB 적용 증거 아님 |
| 실제 홈·학과 화면 | 모바일/데스크톱, 선택·폼·입력·닫기·홈 복귀 확인 | DB 저장/초대/수락 안 함, 오류 상태 유지 |

### 보이스 수정 결과

- 수정: `components/voice/VoiceSessionView.tsx:22`, `:50`, `:191`; 새 `lib/voice/media-lifecycle.ts`. 예기치 않은 종료 시 현재 연결 참조를 해제해 재접속을 허용한다. 이전 연결의 늦은 종료 이벤트는 새 연결 상태·오디오를 비우지 않는다. 명시적 퇴장·언마운트도 provider 종료 호출 전에 참조를 해제한다.
- 재현 테스트: 기존 handler에서 identity guard가 없어 `voice-reconnect-lifecycle.test.mjs` 실패(RED), 수정 후 통과(GREEN). 회귀 파일 `tests/voice/media-lifecycle.test.ts`, `tests/voice/voice-reconnect-lifecycle.test.mjs`.
- 수정 후 `npm run test:voice` 34/34, 전체 voice mjs42/42 통과. 부모도 voice34/34 + reconnect2/2를 새로 실행해 확인했다. 두 mjs focused 테스트는 전체42개에 포함되므로 중복 합산하지 않는다.
- 부모 `node node_modules/typescript/bin/tsc --noEmit --incremental false` exit0. 정식 production build는 이번에 실행하지 않았다.
- 브라우저에서 실제 통화 연결을 만든 뒤 네트워크를 끊는 검증은 제공자 미설정으로 **미검증**이다. 단위·소스 계약 테스트를 실제 LiveKit 송수신 증거로 바꾸어 말하지 않는다.
- 앱 소스 변경은 위 component/helper만이며, 홈·학과 신규 디자인과 보안 보완 표의 다른 항목은 아직 변경하지 않았다. stage/commit/push·DB 적용·실결제·배포는 하지 않았다.
- 독립 검토: 재접속 수정·보고서 범위는 통과, dirty 수치의 계량 방식을 명시하라는 보정 반영. 기존 `Reconnecting`/`Reconnected`/`ActiveSpeakersChanged`에는 같은 current-room identity 보호가 없으므로 늦은 이벤트 전체의 상태 오염 가능성은 별도 미검증이다. 이번 수정이 모든 네트워크 수명주기 문제를 해결했다는 뜻은 아니다.

## 7. 출시까지 필요한 작업

- 보안 보완 일괄 구현: 민감 응답 최소화, 관리자 MFA와 복구·권한 회수, redirect 통일, dev route production 차단, 업로드 사전 상한. 원격 데이터나 역할은 승인 없이 변경하지 않는다.
- 보이스: 제공자 계정/지역/키/사용 한도 결정 → 승인된 DB 적용 → 서버 비밀 설정 및 webhook·정리 worker 구성 → 참가자 실제 상태 대조 → 다기기 통화/강퇴/신고/정리 검증.
- 홈/학과: 시안 선택 → 실제 기존 컴포넌트에 적용 → 내 모임 데이터 연결 → 모바일·데스크톱·에러/빈 상태·버튼 이동 검증. 별도 mock 앱으로 대체하지 않는다.
- 종합 검수: 테스트 1건 불일치 조정, 정식 build, migration/RLS 적용 비교, 역할 4종 실계정, 외부 네트워크·HTTPS/CSP, 개인정보 보관/파기·운영 대응, 결제/환불/알림 검증.
- 마지막 원격 반영·결제·배포는 각각 명시 승인 후 실행한다. 이번에 승인된 것처럼 묶어 처리하지 않는다.

변경 범위는 계약서의 허용 목록으로 제한한다. 이번 감사에서 제안한 보안 수정들은 아직 구현 완료가 아니다.

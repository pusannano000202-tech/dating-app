# 통합 캠퍼스 기능 로컬 실행

## 현재 판정

이 작업은 로그인 우회 미리보기를 출시물로 만드는 작업이 아니다. 실제 앱 route, 서버 API, 권한/RPC, 신규 migration을 격리 작업공간에 구현했다. 2026-09-06 Docker 임시 소켓 오류를 복구했고 전용 로컬 DB에 최초 214개와 전화번호 저장 형식 보정 1개, 총 215개 migration을 적용했다. 실제 테스트 전화번호 OTP 로그인→최소 가입 저장→새로고침 후 저장 유지→커뮤니티 접근까지 확인했다. 운영 검증과는 [복구·잔여 작업 보고서](./auth-recovery-and-remaining-work-20260906.md)에서 구분한다. `--offline-ui`는 공개 화면 검사 전용이며 가입·결제·저장 성공을 가짜로 만들지 않는다.

작업공간: `C:/Users/82108/.config/superpowers/worktrees/데이팅앱만들기/integrated-campus-20260905`

원본 루트·G1·FIVE DB나 checkout에 이 절차를 실행하지 않는다. 원격 URL/실결제 키를 가져오지 않는다. 구현 승인은 commit, push, 원격 migration, 배포 승인이 아니다.

## 공개 화면만 확인

해당 작업공간 터미널에서 다음을 실행한다. 3010 서버가 이미 있으면 같은 명령을 중복 실행하지 않는다.

```powershell
node scripts/qa/start-integrated-ui.mjs --offline-ui
```

- 앱 주소: `http://localhost:3010` (`NEXT_PUBLIC_APP_ORIGIN`이 정확한 변수 이름).
- 공개 화면: `/community`, `/community/mbti`, `/community/campus-eats/delivery`, `/meetups`, `/login`.
- 인증 우회, 실제 결제 키, 운영 DB 연결은 비활성이다. 보호된 역할 화면은 DB가 없으면 거부하는 것이 정상이다.
- `/`는 보호 화면이다. 검수 모드에서 홈을 열면 명시적인 검수 모드 안내가 나온다. 이 모드에서는 재시도해도 로그인할 수 없으므로 반복 재시도 버튼을 제공하지 않는다.
- 공개 검수 빌드 `.next-integrated-qa`와 실제 로컬 빌드 `.next-integrated-live`를 분리한다.
- 기능 플래그는 화면 열람용 로컬 설정이다. Vercel 등에 설치되지 않았다.

## 실제 격리 DB 준비

```powershell
node scripts/qa/prepare-integrated-local.mjs
```

이 명령은 새 로컬 구성과 migration 해시 snapshot만 준비한다. DB를 시작하거나 reset하지 않는다. 이미 준비한 파일의 내용이 바뀌면 덮어쓰지 않고 중단한다. 기존 프로젝트 DB를 초기화해서 해결하지 않는다.

- 프로젝트 ID: `quantum-integrated-campus-20260905`
- 전용 실행 폴더: `.tmp/integrated-live-local`
- API 56421 / DB 56422 / shadow 56420 / Studio 56423 / 로컬 메일 56424
- 실제 SMS 자격증명은 사용하지 않고 로컬 고정 테스트 코드만 사용한다. CLI 2.116.0이 provider 비활성 시 전화 로그인을 끄므로, 로컬 전용 Twilio 설정에는 사용 불가능한 더미값을 넣는다. 앱은 정확히 개발/live-local/56421 환경의 지정 번호 4개만 provider 호출 전에 허용하며 GoTrue의 test OTP 경로는 SMS 전송을 생략한다. 테스트 번호 01000000001–01000000004는 실제 번호 수집 자료가 아니다.
- 테스트 코드는 역할을 부여하지 않는다. 최고관리자·운영자·업장 계정의 권한은 별도 승인된 bootstrap/원장 절차를 따라야 한다.

Docker가 실행 중일 때 이 전용 폴더에서만 Supabase CLI 2.116.0의 `start`를 실행한다. 2026-09-06 실제 시작 및 빈 로컬 DB migration 적용을 확인했다. 선택 사항인 analytics/logging 컨테이너는 다른 로컬 스택의 54327 포트와 충돌하므로 제외한다. 기존 스택을 대신 중지하지 않는다. `db reset`, factory reset, 기존 볼륨 삭제를 실행하지 않는다.

```powershell
npx --yes supabase@2.116.0 start --workdir .tmp/integrated-live-local --exclude logflare,vector
npx --yes supabase@2.116.0 migration up --local --workdir .tmp/integrated-live-local
```

로컬 서비스가 뜨면 아래 명령이 그 프로젝트의 상태와 키를 메모리에서 읽어 앱을 실행한다. 키 값을 보고서·채팅·스크린샷에 노출하지 않는다. URL은 정확히 `http://127.0.0.1:56421`만 허용한다. 안정적으로 재사용할 난수 비밀값은 Git에서 제외된 `.tmp/integrated-live-local/runtime-secrets.json`에 최초 한 번 생성한다. 기존 값이 손상되면 자동 덮어쓰기 대신 중단한다. 다른 프로젝트 키를 복사하지 않는다. 이 실행 명령은 DB를 시작하거나 초기화하지 않는다.

```powershell
node scripts/qa/serve-integrated-local.mjs
```

- 시작 주소: `http://localhost:3010/login`. 3010에서 검수 서버가 돌고 있다면 그 터미널에서 먼저 종료한다. 런처는 다른 프로세스를 자동 종료하지 않는다.
- Auth `/auth/v1/settings`에서 전화 로그인 활성·가입 허용·자동 인증 비활성을 읽기 점검하고 실패 시 Next 실행 전에 중단한다. 컨테이너의 테스트 번호/코드와 더미 자격증명도 정확히 대조한다. 이것은 사전 검사이지 모든 가입 흐름의 성공 증거는 아니다.
- CLI 2.116.0의 `config.toml`에는 SMS 만료 시간 설정 항목이 없다. 실제 Auth `GOTRUE_SMS_OTP_EXP=6000`을 관찰했으며, 로컬 앱 challenge는 `min(실제 공급자 만료, 3600)`으로 더 일찍 만료시킨다. 로그에서 `providerSmsOtpTtlSeconds=6000`과 `applicationChallengeTtlSeconds=3600`을 구분한다. 이메일 `otp_expiry=300`은 SMS 만료 시간이 아니다. 운영 환경의 60~3600초 검증 규칙은 바꾸지 않았다.
- 로컬 테스트 전화번호 `01000000001` / 인증코드 `100001` (뒤 번호 02~04도 코드 100002~100004). 실제 SMS 발송·개인 번호 수집·관리자 권한 부여가 아니다.
- 이번 브라우저 저장 검증 계정은 `01000000002` / `100002`이다. 별칭 `여유로운봄날`, 생년월일·성별·학과는 가상 테스트 입력이며 사용자 본인의 정보가 아니다.
- 이 실행 도구는 실제 Toss 키를 비우고 mock provider·자동화 중지·결제 시뮬레이터 중지를 명시한다. 시뮬레이터 사용도 별도 의도적 로컬 검증으로 구분한다. Toss 샌드박스, 실결제, 실제 환불 통과의 근거가 아니다.

## 반드시 남겨야 할 실제 DB 증거

1. 빈 전용 DB migration 실행 및 기존 비식별 상태 업그레이드 두 경로.
2. 실제 Auth 로그인 → 최소 가입 → 커뮤니티 접근, 매칭 추가 자격 불충족 차단.
3. MBTI 동의·다중 경험 저장·재접속·수정·삭제·철회·epoch 갱신 경쟁·90일 경계.
4. 사용자 → 업장 → 운영자 → 최고관리자의 동일 팀/명단/장소/revision 비교 및 타인 접근 거부.
5. 오늘/이번 주 × 보드/비보드 원천, 명시 동의, 신규 합류, Day/실제 만남 번호, 출석 정정 후 무효화.
6. 가짜 금액 준비/중복/만료/복구와 알림 중복·마감 처리. 실제 결제는 별도 승인 없이 실행하지 않는다.
7. 새로고침·서버/DB 재시작 뒤 저장 유지. HTTP 200이나 정적 SQL parser만으로 완료 처리하지 않는다.

## 배달 자료와 운영 조건

배달 후보의 실제 공개 기준은 부산대 정문 공용 지역에서 확인된 가게+대표 1인 메뉴 최소 8개다. 사진 파일과 권리 근거, 메뉴 하나의 최소 주문 조건, 출처, 확인 시각이 필요하다. 기본 정보 7일/혜택 24시간이 지나면 재검수하며 주소·시간·회원에 따른 최종 주문 조건은 배달 서비스에서 확인한다. 이 문서 작성 시 확보된 실제 검수 후보는 0개다. 기존 방문 맛집 93곳을 배달 후보로 바꿔 넣지 않았다.

운영 SMS의 IP 제한은 검토된 Vercel ingress 전용이다. 다른 호스팅은 신뢰 가능한 역방향 프록시 경계를 별도 검토하기 전 발송을 막는다. 이는 현재 배포 환경을 점검했다는 뜻이 아니다. 근거: [Vercel 요청 헤더 문서](https://vercel.com/docs/headers/request-headers).

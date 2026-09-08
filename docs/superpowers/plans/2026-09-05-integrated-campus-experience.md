# Quantum 통합 참여 경험 — 실행 계획·디자인 계약

작성: 2026-09-05 · 상태: 통합 계획 독립 검토 PASS, 사용자 계획·시안 승인 전, 이번 요청의 앱 구현 미착수

**Goal:** 간편 가입 → 취향·관계 경험 → 커뮤니티 탐색 → 오늘/이번 주 첫 만남 → 같은 그룹의 후속 만남을 하나의 실제 서비스 흐름으로 완성한다. 모임·방문 맛집·배달 맛집도 같은 구현 범위 안에 포함한다.

**Architecture:** 기존 Next.js 앱과 실제 로컬 Auth/API/DB를 확장한다. 가입 자격은 서버 단일 판정, MBTI는 소유자와 여러 관계 경험 분리, 후속 만남은 원천 만남·실제 만남 번호·프로그램 Day 분리, 맛집은 방문/배달 데이터와 기록 분리. 기존 더티 작업공간들은 참조 원본으로 보존하고 새 격리 통합 작업공간에서 허용 목록에 따라 이식한다.

**Tech Stack:** 현재 소스의 Next.js 15.5.23 / React 19.2.4 / TypeScript / Tailwind / Supabase Auth·Postgres·Storage, 기존 결제 어댑터, node:test. 새 프레임워크·앱 복제·Sites 배포는 필요 없다.

실행자는 `superpowers:subagent-driven-development` 또는 `superpowers:executing-plans`를 적용하되, 이 문서의 단일 통합 범위와 사용자 승인 경계를 우선한다. 구현 중 자동 stage/commit/push는 하지 않는다.

## 1. 결론과 승인 범위

이 문서는 P0/P1 부분 출시 계획이 아니다. 아래 A–H는 **목적 추적용 번호**이며 전부 하나의 구현 범위다. 의존 관계상 작업 순서는 있지만, 기능 하나가 끝날 때마다 다음 기능을 할지 다시 묻지 않는다. 전체 기능 검증이 끝나야 통합 구현 완료를 보고한다.

이번에는 계획서와 디자인 시안만 만든다. 사용자가 이 계획과 시안을 정하고 **“시작해”**라고 하면 전체 로컬 구현을 시작할 수 있도록 변경 위치, 규칙, 예외, 테스트와 외부 의존을 정리했다. 계획 채택은 운영 결제·SMS 발송 비용·원격 DB 적용·배포·Git 기록 승인이 아니다.

### 최신 결정으로 바로잡은 내용

| 항목 | 최종 사용자 의도 | 폐기하거나 대체할 이전 해석 |
| --- | --- | --- |
| 가입 | 이름 직접 입력 없이 전화 외에는 선택 버튼 중심 | 실명·닉네임 타이핑 필수 |
| MBTI | 전/현 연인 여러 명, 동일 유형 반복 경험 지원 | 한 계정당 관계 경험 한 건 |
| 이번 주 만남 | 활동을 둘러보고 가능한 날짜를 골라 첫 만남에 참가 | 주간 첫 활동을 무조건 보드게임으로 고정 |
| 후속 프로그램 | 이번 첫 만남이 보드게임이면 Day 2, 다른 활동이면 Day 1 보드게임부터 | 개인의 과거 보드게임 경험으로 회차 결정, 동의 없이 프로그램 자동 시작 |
| 구현 범위 | 아래 전부를 연결한 통합 구현 | G1만 끝내고 나머지를 추후 과제로 넘김 |
| 공개 주장 | 설문·개인 기록·실제 매칭을 구분 | 설문 경험을 실제 커플 수, fixture를 실시간 배달 정보로 표현 |

기존 9월 5일 목적 계획의 G1–G5는 이 문서의 C/E/B/F/G로 흡수한다. 기존 `MBTI-SURVEY-DRAFT.md`의 단일 경험 제한과 옛 계획의 기능별 승인·부분 공개 순서는 이 범위에서 사용하지 않는다. 기존 파일은 삭제·덮어쓰지 않는다.

## 2. 전체 목적과 완료 기준

| ID | 목적 | 구현 결과 | 필수 완료 기준 |
| --- | --- | --- | --- |
| A | 가입 부담을 줄이되 실제 만남 자격은 지킨다 | 전화 인증, 선택형 기본정보, 자동 별칭, 이상형 월드컵, 필요 시 사진 보완 | 기본 가입과 매칭 준비가 분리되고 새로고침·재로그인·기존 계정에서 동일 판정 |
| B | 여러 연애 경험으로 즐길 만한 커뮤니티를 만든다 | 유형별 횟수, 개별 평가, 개인 응답 관리, 공개 통계 | INFP 2회+INTP 1회가 응답자 1명·경험 3건으로 저장·집계·수정·철회 |
| C | 참가 전에 오늘/이번 주 활동에 관심이 생기게 한다 | 오늘 3활동 탐색 유지, 주간 활동 탐색·복수 날짜 선택·실제 배정 | 탐색만으로 신청되지 않고, 선택·마감·배정·취소가 실제 DB와 일치 |
| D | 첫 만남의 같은 사람들이 자연스럽게 계속 만난다 | 원천에 따른 Day 진입, Day 1–5, 동의·결제 상태·일정·채팅·출석·종료 | 오늘/주간과 보드게임/비보드게임 네 조합 모두 실제 저장 상태로 완주 |
| E | 지금 모집 중인 모임을 먼저 발견한다 | 실제 목록 우선, 아이디어 하단, 만들기·찾기·참여·취소 | 0/1/다수 목록과 상세 복귀, 실제 잔여 인원·상태 정확 |
| F | 음식 사진과 선택 재미로 방문 맛집 월드컵을 개선한다 | 사진 중심 시작·대결·결과·내 순위·지도 이동 | 최소 두 곳 시작 규칙 일치, 이전 개인 결과 보존, 잘못된 전체 순위 표현 제거 |
| G | 부산대 주변 한 끼 배달 메뉴를 비교한다 | 플랫폼 중립 후보, 대표 1인 메뉴, 조건 검수·만료·외부 이동 | 검증 후보 기준과 권리 충족, 미확인 금액/혜택을 0원·무료로 처리하지 않음 |
| H | 화면 시연을 넘어 같은 데이터로 운영 가능한 구조를 만든다 | 실로그인·API·로컬 DB, 네 역할 연결, 오류 복구와 통합 검수 | 사용자→업장→운영자→최고관리자 간 팀·인원·장소·revision 일치, 재시작 후 유지 |

## 3. 근거와 현재 상태

| 원본 | 이번 확인 상태 | 사용 범위 |
| --- | --- | --- |
| 루트 `C:/데이팅앱만들기` | `codex/quantum-handphone`, `f14539cdca82a5f694e889c72bc9574f80f59c93`, 더티 | 최신 운영 지침·인수인계·결정 장부. 구현 대상 아님 |
| G1 `C:/Users/82108/.config/superpowers/worktrees/데이팅앱만들기/engagement-g1-20260905` | `codex/engagement-g1-20260905`, `be9078565d8e59f73cbc017f3c7b1484996da1c3`, 계획 추가 전 status 248항목·staged 0 | 승인된 오늘 활동 탐색, 현행 가입·주간·모임·커뮤니티 기반 |
| FIVE `C:/Users/82108/.config/superpowers/worktrees/데이팅앱만들기/quantum-five-meeting-g4-shell` | `codex/five-meeting-g4-shell`, `9ed6e76dd456ed4d840425f16305e49075d41b64`, 더티 | 후속 만남 셸·Day 1–5·후속 선택 UI 참조, 계약 충돌을 고쳐 선택 이식 |
| 출시 후보 원본 `C:/Users/82108/.config/superpowers/worktrees/데이팅앱만들기/tonight-maps-roles-release` | 별도 더티 원본 | 기존 목적 계획·검수 자료. 통째 합치지 않음 |

실행 직전에 경로·HEAD·dirty·upstream과 필요한 파일 해시를 다시 확인한다. 과거 상태는 실행 승인 근거가 아니다.

현재 코드 확인 결과:

- 일반 사용자 온보딩은 `/profile/basic → /profile/worldcup → /profile/photos → /profile/complete`다. `/onboarding/partner/**`를 일반 가입으로 바꾸지 않는다.
- 기본정보는 별칭·성별·나이·학교가 필수이고 전화는 빈 값을 전송한다. 기존 로그인은 이메일 OTP/OAuth다. 전화 필수를 구현하려면 실제 인증 경로가 필요하다.
- `onboarding-status.ts`, 홈, 사진 API, Tonight 신청 RPC의 완료 판정이 서로 다르다. 사진 저장 하나로 실제 매칭 준비가 완료되는 우회를 막아야 한다.
- G1에는 FIVE 프로그램 통합이 없다. FIVE에는 Day 1–5 콘텐츠가 있으므로 “Day 4/5가 전혀 없다”는 오래된 설명은 사용하지 않는다. 다만 미리보기 상태와 실 DB 연결은 별개다.
- FIVE는 `sequence_no`를 콘텐츠 Day·전원 동의·결제·최대 만남 수에 함께 사용한다. 오늘 팀과 주간 occurrence도 원천 테이블이 다르다.
- 주간 일정이 시간이 지났다는 이유로 완료돼도 실제 출석 확인으로 인정할 수 없다.
- 방문 맛집은 기존 후보 자료와 개인 기기 기록이다. 이번 확인에서 근거를 갖춘 별도 배달 후보는 **0개**다.

참조: 원본 `docs/plans/2026-09-05-engagement-purpose-acceptance-plan.md`, 루트 `docs/handoff/active/QUANTUM_RELEASE_CANDIDATE_STATUS_TEAM_HANDOFF_2026-08-25.md`, `docs/product/matching/2026-08-22-quantum-five-meeting-decision-ledger.md`, 기존 G1 결과 보고서 `C:/Users/82108/.codex/visualizations/2026/09/04/01a06d89-ddb3-7360-b709-96d9847fece8/engagement-design-20260905/G1-IMPLEMENTATION-RESULTS.md`. 이번 계획 작성 중 새 앱 테스트·브라우저 실행·원격 상태 확인은 하지 않았다.

## 4. 사용자의 전체 동선과 화면 디자인

### 공통 시각 계약

기존 Quantum의 따뜻한 아이보리·벽돌 코랄·짙은 잉크색과 Pretendard를 유지한다. 기준은 `app/globals.css`의 `--boot-*` 토큰이다. 모바일 390×844에서 한 화면의 핵심 행동을 하나로 두고, 320px에서도 컨트롤이 겹치지 않게 한다. 터치 대상 최소 44px, 본문 14–16px, 오류는 색뿐 아니라 문장으로 전달한다. 큰 사진은 실제 활동·음식 탐색에 사용하고 설문에는 장식 사진을 넣지 않는다. 데스크톱은 무작정 늘린 모바일이 아니라 본문과 보조 설명을 나란히 배치한다.

| 화면 | 정보·동작 순서 | 누르기 전/후 상태와 예외 |
| --- | --- | --- |
| 간편 가입 | 전화 입력·인증 → 성별·연령 선택 → 부산대 범위·학과 버튼 → 자동 별칭 → 확인 | 입력 완료마다 저장 확정을 구분. 전화·인증 코드 외 필수 타이핑 없음. 인증 실패·만료·재전송·기존 번호 안내 |
| 가입 뒤 | 이상형 월드컵 권유 → 내 MBTI·연애 경험 선택 참여 → 커뮤니티 | 건너뛰기를 숨기지 않음. 사진 등 실제 만남 요건은 참가 시 보완 |
| MBTI 빠른 입력 | 내 유형 → 상대 유형별 횟수 → 각 묶음의 상대 성별·과거/현재 → 선택적 경험 상세 → 검토·동의 | INFP 2회와 INTP 1회 표시. 감소·삭제·모름·경험 없음 제공. 점수는 상세 경험에만 부여 |
| MBTI 경험 상세 | INFP 경험 1 / INFP 경험 2를 각각 열기 → 점수 버튼·잘 맞은 항목 | 하나만 평가하거나 서로 다른 점수 가능. 평가를 건너뛰어도 횟수는 유지 |
| MBTI 통계 | 짧은 질문형 제목 → 유형 분포 / 많이 보고된 조합 / 잘 맞았다는 조합 → 내 응답 관리 | 응답자 수·경험 수·집계 기준일·설문 한계. 소표본은 준비 중. 임의 숫자로 채우지 않음 |
| 오늘/이번 주 | 두 진입을 같은 위계로 노출 → 활동 사진·시간·장소 범위 둘러보기 → 순위 또는 날짜 선택 → 신청 확인 | 오늘 3활동의 다음 카드 일부·화살표·위치 표시 유지. 이번 주가 하단에 숨거나 사라지지 않음 |
| 후속 만남 홈 | 다음 행동 하나 → 다음 일정·우리 그룹 → 프로그램 여정 | `두 번째 만남 · 프로그램 Day 1`처럼 물리 만남과 콘텐츠 Day를 함께 설명 |
| 후속 종료 뒤 | 비공개 경로 선택 → 선택 경로 안내 → 필요한 결제 → 일정 확인 | 종료 선택 시 결제 없음. 자동 친구·호감 결과 공개 없음. 서비스 미제공 시 복구 상태 표시 |
| 모임 | 제목·검색·필터 → 실제 모집 목록 → 만들기 아이디어·예정표 | 빈 목록도 진짜 빈 상태를 먼저 표시. 아이디어 선택은 목록 필터로 연결 |
| 방문 맛집 | 대표 음식 사진·간단한 질문 → 먹어본 곳 선택 → 1:1 사진 대결 → 우승·내 순위·지도 | 최소 두 곳 안내. 시작 CTA 하나. 개인 순위를 전체 대학 투표로 표현하지 않음 |
| 배달 맛집 | 방문/배달 전환 → 대표 한 끼 사진·검수 상태 → 비교 → 외부 앱에서 조건 확인 | 미확인/만료 혜택 배지 없음. 집 주소 수집 안 함. 직접 주문·자동 결제 없음 |

### MBTI 시안 세 장

현재 대화에 **표시된 순서대로 1·2·3번**이다. 서로 다른 입력 배치 대안이며 세 화면을 모두 구현하라는 뜻이 아니다. 공통 기능 계약은 위 표와 동일하다. 사용자가 선택한 한 장을 시각 기준으로 삼되, 그 한 장에 없는 검토·동의·오류·모름 상태도 반드시 구현한다. 사진처럼 보이는 시안은 클릭 검증이나 개인정보 검증 증거가 아니다.

- 표시 1: `C:/Users/82108/.codex/generated_images/01a06d89-ddb3-7360-b709-96d9847fece8/exec-4aa66208-b9e5-42e1-a878-e4de131bc829.png`
- 표시 2: `C:/Users/82108/.codex/generated_images/01a06d89-ddb3-7360-b709-96d9847fece8/exec-596bfab2-9598-44fb-8840-3005adf0df63.png`
- 표시 3: `C:/Users/82108/.codex/generated_images/01a06d89-ddb3-7360-b709-96d9847fece8/exec-88449c40-1218-4bc8-ab3e-10880ecce258.png`

설문 예시의 ENFP·INFP·INTP와 점수는 디자인용 입력 예시다. 실제 학생이나 실제 집계 결과가 아니다. 이미지 안 문구는 구현 시 실제 텍스트로 재작성하고 가짜 진행률은 사용하지 않는다. 사용자가 고르기 전 앱 화면을 만들지 않는다.

## 5. A — 최소 가입과 참가 자격 계약

서버가 다음 상태와 부족 사유를 반환한다. 상태는 서로의 동의어가 아니다.

| 상태 | 요건 | 열리는 기능 |
| --- | --- | --- |
| account_authenticated | 실제 Auth 세션 | 본인 가입 진행·복구 |
| minimum_signup_complete | 검증 전화, 학교 범위, 학과, 성별, 연령 자격, 서버 발급 별칭 | 커뮤니티 참여, 자발적 설문, 취향 저장 |
| profile_onboarding_complete | 최소 가입 + 이상형 월드컵 + 기존 사진 요건 | 완성 프로필 상태 |
| matching_ready | 완성 프로필 + 상품별 필수 검수·제약 충족 | 해당 만남 신청. 비공개 외모 처리값을 UI에 반환하지 않음 |

공개 통계 읽기는 설문 미제출자에게도 가능하게 한다. 최소 가입만으로 매칭 준비를 true로 만들지 않는다. 전 사용자에게 사진을 먼저 강요하지 않고 실제 참가 시 필요한 요건을 보여준다. 기존 프로필의 유효한 정보·기존 별칭·완료 이력은 보존하고 부족 항목만 보완한다.

이름 제거는 `display_name` 컬럼 삭제가 아니다. 서버에서 비식별 별칭 후보를 발급하고 버튼으로 선택한다. 전화번호·학과·성별에서 별칭을 만들지 않는다. 별칭 claim과 프로필 저장을 트랜잭션으로 묶는다.

전화 기본안: 새 가입은 Supabase 전화 OTP, 기존 이메일/OAuth 계정은 로그인한 같은 계정에 전화 변경 인증을 붙인다. 번호 중복 시 자동 계정 병합·기존 데이터 이전을 하지 않는다. 소유권 확인 안내로 종료한다. SMS 사업자 설정은 외부 의존이며 화면이나 로컬 고정 인증 코드가 실 SMS 성공 증거는 아니다. 공식 근거: [전화 인증 문서](https://supabase.com/docs/guides/auth/phone-login), [계정 정보 갱신 문서](https://supabase.com/docs/reference/javascript/auth-updateuser).

전화 보안 계약: 서버 E.164 정규화와 허용 국가/번호 검증, 번호·IP·인증 계정 단위 제한, 재전송 cooldown, challenge별 시도 제한, 1회성 소비, 만료, 현재 세션·대상 번호·인증 목적 바인딩을 모두 적용한다. 공개 응답은 계정 존재 여부에 따라 달라지지 않게 한다. OTP·전화 원문을 로그에 넣지 않는다. 구현 시 보안 설정의 로컬 기본값은 재전송 60초, challenge당 실패 5회, 번호당 시간당 10회, IP당 시간당 100회로 두고 provider의 더 엄격한 제한이 있으면 그것을 적용한다. 만료 시각은 실제 provider 설정보다 길게 보장하지 않고 서버가 반환한다. 제한값은 서버 설정이며 클라이언트가 완화할 수 없다. 실 SMS 성공과 별개로 재사용·다른 세션·다른 번호·목적 바꿔치기·열거 공격을 반드시 테스트한다.

추가 성별 표현을 선택한 최소 가입자를 기존 `profiles.gender` M/F 값으로 억지 변환하지 않는다. 최소 가입의 비공개 `community_member_profiles` companion row에 선택값과 자격 상태를 보관하고, 기존 matching profile은 기존 호환 계약대로 유지한다. 해당 매칭 상품이 지원하지 않는 성별 조합은 사유와 함께 matching_ready=false로 처리한다. 기존 계정은 소유자와 유효 데이터가 확인된 항목만 companion 상태로 연결한다.

연령·학교 표시·신규 계정 성별 범위의 추천안은 아래 정책표에 모았다. 만 나이 기준을 서로 다르게 남겨두지 않는다. 전화 인증은 번호 소유 증거이지 성인·학생 자격 인증 증거가 아니다.

## 6. B — 여러 관계 경험 MBTI 계약

### 수집 구조

참가자: `owner_user_id` 1행, 현재 본인 MBTI, 통계용 본인 성별, 동의 버전·시각, revision. 기존 프로필 값을 동의 없이 복사하지 않는다.

경험: `experience_id`, `owner_user_id`, `self_mbti_snapshot`, `partner_mbti`, `partner_gender`, `relationship_status`, `entry_mode`, `reported_count`, 선택적 `score`, 선택적 `matched_aspects`, `client_mutation_id`, revision. 이름·상대 전화·상대 계정·사진·정확한 연애 날짜·자유서술은 수집하지 않는다.

```ts
type RelationshipEntry =
  | { mode: 'count_only'; count: number; score: null; aspects: null }
  | { mode: 'detailed'; count: 1; score: 1 | 2 | 3 | 4 | 5 | null;
      aspects: readonly ('conversation' | 'contact' | 'conflict' | 'lifestyle' | 'values')[] | null }
```

이 코드 조각은 계획 계약이며 현재 저장소 구현이 아니다. 실제 공통 타입에는 허용된 MBTI·성별·관계 상태 enum과 소유권·revision 필드를 포함한다.

- 빠른 INFP 2회는 점수 없는 count-only 묶음이다. 상세 평가를 원하면 하나의 트랜잭션으로 묶음을 제외하고 두 개의 점수 없는 경험으로 펼친다. 하나의 점수를 두 사람분으로 복제하지 않는다.
- 저장 묶음 키는 `(self_mbti_snapshot, partner_mbti, partner_gender, relationship_status)`다. MBTI가 같아도 상대 성별 또는 과거/현재가 다르면 별도 묶음이다. 빠른 화면의 `INFP 2회`는 검토 전 임시 합계일 수 있으며, 저장 전에 `지난 연애 1회 + 현재 연애 1회`처럼 나눌 수 있다. 성별·상태가 다른 두 경험을 하나의 값으로 덮어쓰지 않는다. 상세 전환은 묶음의 속성을 각 경험에 그대로 보존한다.
- 같은 INFP라도 경험 ID가 다르면 5점과 2점을 각각 보존한다. 상세 경험을 다시 묶을 때 점수 소실이 있으면 확인 없이 합치지 않는다.
- `client_mutation_id` 재전송은 같은 결과를 반환한다. 같은 내용의 실제 다른 관계는 명시적인 추가로 별도 ID를 만든다. 내용이 같다고 임의 삭제하지 않는다.
- 관계 수 평생 상한은 두지 않는다. API 요청은 작은 묶음·페이지 단위로 처리하고 남용 제한은 기술 설정으로 분리한다.
- 연애 경험 없음과 모름도 정상 입력이다. 제출하지 않고 통계만 볼 수 있다.
- 본인 MBTI 변경은 본인 유형 분포에 반영하지만 과거 경험의 `self_mbti_snapshot`은 조용히 덮어쓰지 않는다. 과거 경험도 수정할지 본인이 선택한다.
- 개별 경험 삭제와 전체 참여 철회를 각각 제공한다. 서버에서 즉시 집계 제외, 공개 snapshot은 정책표 기한 내 갱신한다.

### 집계 공식과 이름

| 결과 | 계산 | 표현·오해 방지 |
| --- | --- | --- |
| 본인 MBTI 분포 | 유효 MBTI별 고유 참여 계정 / 유효 MBTI 전체 고유 참여 계정 | 관계가 여러 개여도 한 명 한 번. 미응답은 분모에서 제외하고 안내 |
| 많이 보고된 조합 | 조합별 고유 응답자 수 우선, 경험 건수 보조 | `응답자 n명 · 경험 m건`; 두 사람이 같은 관계를 보고했는지 판별 못하므로 실제 커플 수 아님 |
| 잘 맞았다는 조합 | 각 응답자 내부의 긍정 상세경험/유효점수 상세경험 → 응답자별 같은 가중치 평균 | 평가하지 않은 횟수 입력은 점수 분모에서 제외 |
| 잘 맞았던 항목 | 응답자별 항목 선택 비율 평균 | 복수선택, 합계 100%를 넘을 수 있음 |
| 내 유형 비교 | 위 공개 가능 조합 중 내 선택 유형 기준 표시 | 과학적 궁합·미래 관계 성공률·매칭 강제 규칙으로 사용하지 않음 |
| 앱 실제 만남 현황 | 양쪽이 별도 통계 동의한 실제 출석 조합을 occurrence별 중복 제거해 집계 | `같은 회차에서 만난 조합`으로 별도 출처 표시. 그룹 배정·동석은 교제 확인이 아니므로 ‘커플’이라고 부르지 않음 |

예: 한 사람이 INFP 2회·INTP 1회를 제출하면 전체 응답자는 1명, 경험은 3건이다. 두 INFP 경험의 점수 중 하나가 비어 있으면 유효 점수는 한 건이다. 이 예시는 개인정보 공개 최소 인원을 충족하지 못하므로 공개 순위에는 나오지 않는다.

### 공개·접근·보존

원시 응답은 본인 관리용 서버 API만 접근한다. 브라우저 직접 raw 조회, 업장·일반 운영자 접근, 원시 CSV 다운로드를 허용하지 않는다. 서버 service role 사용 경로는 인증된 owner와 요청 target 일치를 매번 검증한다. 공개 API는 검수된 snapshot만 반환한다.

성별 조합은 본인 통계 성별과 상대 통계 성별로 구분한다. 남/여 외 응답도 저장은 가능하되 표본 부족 셀은 숨긴다. 공개 범주는 사전 정의하며 학과·학년·성별·현재/과거를 자유롭게 교차 필터링하지 않는다. 각 셀·보완 셀·총계 역산·직전 snapshot 차이를 함께 검사하고 안전한 집계를 만들 수 없으면 `표본 부족`으로 둔다. 단순 10명 기준만으로 재식별 방지 완료라고 하지 않는다.

이 설문은 계정 연결 비공개 응답이지 완전 익명 설문이 아니다. 동의 철회 시 원시 경험을 삭제하고 payload 없는 처리 기록만 정책표 기한 동안 보존한다. 앱 로그·오류 추적에 전화·MBTI 경험 payload를 넣지 않는다. 백업 복원 시 삭제 기록을 먼저 적용해 철회한 응답이 재등장하지 않게 한다. 운영 백업의 실제 보존 설정은 별도 확인 전 미검증으로 남긴다.

참가자 행도 M-RAW를 적용한다. 본인 유형/통계 동의를 마지막으로 확인·수정한 뒤 90일이 지나면 활성 분포의 분모·분자에서 즉시 제외하고 설문 참여자·경험을 삭제한다. 페이지 조회나 다른 경험 추가가 참가자 동의 기한을 자동 연장하지 않는다. 갱신은 별도 확인 버튼으로 받는다. 전체 철회는 참여자 행과 모든 경험 행을 함께 제외·삭제한다. 응답 없는 상태에서 통계 방문만 한 사람은 참여자 분모에 포함하지 않는다.

실제 만남 통계는 설문 동의와 별도인 `meeting_stats` 목적 버전·동의/철회 시각을 각 참가자에게 받는다. 한 사람만 동의하면 해당 두 사람의 조합은 집계하지 않는다. 확정 배정이 아니라 권위 있는 출석이 확인된 동일 occurrence의 두 참가자가 모두 동의해야 하며, 통계용 MBTI/성별 snapshot 사용도 표시한다. 자기보고 연애 경험과 서로 합산하지 않는다. 여러 동의 쌍이 같은 조합에 해당해도 공개 회차 빈도는 `occurrence_id + 유형·성별 조합`당 한 번이다. 공개에는 M-PUBLIC의 고유 동의자 수와 같은 수 이상의 서로 다른 occurrence를 모두 요구하고 보완 셀·차분 검사를 함께 적용한다. 결과명은 ‘같은 회차에서 만난 조합’이며 1:1 매칭·확인된 커플로 부르지 않는다.

실제 만남 통계 동의와 파생 통계용 snapshot도 M-RAW 만료 및 M-WITHDRAW 철회 기한을 따른다. 어느 쪽이든 철회하면 관련 쌍을 권위 집계에서 즉시 제거하고 공개 snapshot을 재검수한다. 통계 동의 철회는 운영상 필요한 원래 출석·결제 원장을 삭제하는 기능이 아니다. 원장 보존 정책은 별도이며 통계 목적 재사용만 중지한다. 별도 동의·양쪽 자격·보존·공개 보호 테스트가 모두 통과하기 전 이 통계의 공개 스위치는 off다. 구현 자체와 켤 수 있는 데이터가 있는지를 구분해 보고한다.

## 7. C·D — 첫 만남과 프로그램 Day 분리

### 오늘과 이번 주

오늘은 승인된 큰 사진의 3활동 탐색과 순위 선택을 유지한다. 보는 카드와 신청 순위는 별도 상태이고, 세 활동 동의·하나의 모집 풀은 그대로다.

이번 주는 주간 콘텐츠를 좌우로 발견한 뒤 가능한 날짜를 여러 개 고른다. 일괄 신청을 여러 예약으로 저장하지 않고 한 주 신청의 후보 날짜로 저장한다. 서버가 그중 하나의 실제 회차로 배정한다. 후보 카드가 많아도 동일 조건·대표 콘텐츠의 모집 풀을 날짜마다 불필요하게 나누지 않는다. 서로 다른 활동을 자동 확정할 권한을 얻지 않은 경우 사용자가 본 선택 활동 밖으로 배정하지 않는다. 이미 확정된 만남과 충돌하는 배정은 트랜잭션으로 거부한다.

주간 활동을 보드게임으로 고정하지 않는다. 실제 운영자가 등록한 활동·날짜·시간·장소 범위·정원을 쓴다. 준비 중 후보를 모집 중으로 보이지 않게 한다. 주간 첫 만남과 후속 Day 1은 다른 개념이다.

### 공통 원천과 번호

`quantum_continuation_sources`가 오늘 팀 또는 주간 occurrence 중 하나를 가리킨다. `sourceKind=tonight_team | scheduled_event_occurrence`, 둘 중 정확히 한 FK만 허용한다. 원천의 실제 활동 스냅샷과 참석 명단 revision을 불변 근거로 저장한다. 개인이 예전에 보드게임을 한 적이 있는지는 분기 근거가 아니다.

| 이번 첫 만남 | 최초 원천 | 다음 만남 | 프로그램 끝까지 실제 만남 수 |
| --- | --- | --- | --- |
| 보드게임 | 실제 1번째·프로그램 Day 1 이력으로 연결 | 실제 2번째·프로그램 Day 2 | 5회 |
| 산책·식사 등 다른 활동 | 실제 1번째·프로그램 Day 없음 | 실제 2번째·프로그램 Day 1 보드게임 | 6회 |

```ts
const startDay = source.activityKind === 'board_game' ? 2 : 1;
const physicalMeetingNo = programDay - startDay + 2;
const continuationTransitionIndex = targetProgramDay - startDay;
```

`programDay`는 1–5로 유지하고 실제 만남 번호는 별도다. 기존 `sequence_no`는 호환 기간의 프로그램 Day 별칭으로만 쓴다. 비보드게임 첫 만남 뒤 5개 콘텐츠를 모두 하므로 실제 최대 6회가 되는 설계는 최신 의도를 실현하기 위한 **명시적 제안**이다. 5회에 맞추려고 Day 5를 삭제하거나 원천 만남 이력을 없애지 않는다.

첫 계속하기는 언제나 `continuationTransitionIndex=0`이다. 목표가 Day 1인지 Day 2인지로 전원 동의·결제 규칙을 바꾸지 않는다. `board_game_direct`로 동의 없이 새 프로그램에 들어가는 옛 분기를 이식하지 않는다. 기존 보드게임 원천을 새로 결제·출석 처리하지 않고 source alias로 연결한다.

### Day 1–5 콘텐츠 전체

| Day | 승계 콘텐츠 | 구현과 검수 범위 |
| --- | --- | --- |
| 1 | 달무티 등 보드게임 | 실제 일정의 안내·게임 선택·진행·종료. 다른 활동 원천에서 시작하는 새 Day 1과 보드게임 원천 이력 구분 |
| 2 | 온천천 30분 대화 3라운드, 필요할 때 여는 대화 룰렛 | 5/6인 배치 모두 참여, 홀수 인원 방치 없음, 실내 대체·서버 시각 복구. 폐기된 숨은 미션·역할극 부활 금지 |
| 3 | 저녁 식사 후 볼링 | 연습 점수·팀 구성·본게임·동점·결과를 서버 저장. 기존 미리보기 계산을 실 API로 연결. 비공개 호감 공개를 상품으로 주지 않음 |
| 4 | 식사·자율 음료와 같은 답 카드 | 무알코올도 동등 참여, 음주 강요 없음. 카드 진행·휴식·종료 실제 저장. 옛 Day 3 음주 제약 제거 |
| 5 | 광안리 밤바다 피날레 | 운영자가 확인한 공개 집결지·동선·휴식·종료·귀가 안내·날씨 대체. 종료 뒤 Day 6 콘텐츠 생성 금지 |

Day 5의 실제 장소·시간·날씨 대체는 회차 운영 데이터다. 일정 편집기와 필수 검증을 구현하되 실제 장소 협의가 없는 회차는 공개하지 않는다. 새 지역 사실·영업·요금은 운영 주간에 공식 자료로 다시 확인한다.

### 동의·결제·재모집·출석

기존 인수인계의 기본은 첫 원년 5명 전원, 그 뒤 남녀 혼성 3명 이상이다. 최신 원천 분기에 적용할 세부안은 정책표에서 분명히 제안한다. 콘텐츠가 5인 이상을 요구하는 Day 1/2에는 인원 조건도 충족해야 한다. `3명 이상`만 보고 미지원 Day 2를 시작하지 않는다.

상태: 원천 완료·출석 증거 확인 → 비공개 선택 → 유료 경로 안내 → 결제 대기 → 인원·권한·일정 재검증 → 확정/미성립 → 수행/종료. 시간 경과만으로 출석으로 만들지 않는다. 실제 사용자 출석 확인과 분쟁 신고·검토 기록을 서버에 남기되 GPS·상시 현장 운영자를 새 필수 조건으로 만들지 않는다.

첫 전환은 원천의 확정 명단에 고정한다. 한 명이 빠졌다고 조용히 전원 기준을 축소하지 않는다. 출석 이의·원천 명단 변경은 수정 revision과 재동의를 요구한다. Day 2/3의 기존 신규 합류 시도는 선택사항으로 남기고, 명단 변경 고지와 동의를 거친다. 새 참가자는 예전 사적 대화·선택·사진을 자동 열람하지 못한다. 합류 실패 때문에 이미 유효한 기존 만남을 자동 취소하지 않는다.

보증금·회차 이용료·일반 모임 보증금은 다른 원장이다. 기존 인수인계의 10,000원 시즌 보증금과 1,000원 회차/친구 요청 경로 이용료를 합치지 않는다. 첫 활동에서 낸 보증금을 후속 진입 때 중복 부과하지 않는다. 신규 합류자는 첫 실제 참여 전 보증금, 합류 첫 이용료 면제의 기존 계약을 검증한다. 일반 모임의 새 보증금 제안은 이번 목록 재배치 승인으로 적용하지 않는다.

이용료는 서버가 선택한 경로·대상 transition·고지 버전·금액·provider를 검증한다. 결제 리다이렉트 성공만으로 paid 처리하지 않는다. 중복 callback·승인 실패·미성립 취소·취소 실패 복구 큐를 포함한다. 운영 결제나 자동 위약금 집행은 별도 승인 전 꺼둔다. 1,000원 친구 요청 경로도 다음 회차 생성과 독립된 entitlement로 관리하고, 실제 출석자에게 본인이 요청한 경우에만 작동한다.

결제 진위는 provider가 제공하는 검증 가능한 서명 또는 인증된 서버 조회로 확인한다. 서명만 없는 provider에 가짜 서명 검증을 만들지 않는다. 서버 주문의 소유자·transition·금액·통화·purpose와 provider 응답을 일치시키며, 검증 실패·다른 사용자 주문·변조 금액·통화·재전송 event는 paid로 전환하지 않는다. event ID와 provider transaction ID에 재생 방지·멱등성을 적용하고 기존 결제 검증을 약화하지 않는다.

단체채팅은 서버 시각에 따른 `locked/send/read_only/hidden`을 유지한다. 후속 선택, 거절·무응답·호감·연락처를 전체 명단에 공개하지 않는다. 종료 인증사진은 자율이며 미제출이 다음 흐름을 막지 않는다. 앨범·친구·채팅 열람은 실제 회차 자격과 명시적 허용을 기준으로 한다.

## 8. E·F·G — 모임과 두 맛집 월드컵

모임은 `MeetupHub.tsx`의 실제 목록을 먼저 옮기고 검색·필터·상세·만들기·참여·취소 계약을 유지한다. 상세 뒤로가기는 검색어·카테고리·스크롤 복구를 포함한다. 새 알림함이나 자동 Push는 추가하지 않는다.

방문 월드컵은 `CommunitySpotlight.tsx`와 `CampusEatsPilot.tsx`의 제목·시작 안내·사진 배치를 함께 정리한다. `한 곳만 고르면 시작`은 실제 최소 두 곳 규칙과 맞춘다. `1분` 같은 시간 약속은 실측 없으면 제거한다. 매장·카드·카테고리 수는 repository 결과에서 산출한다. 방문 여부·중간 대진·우승·재시작·개인 점수·지도·목록·새로고침을 회귀 검수한다.

배달은 기존 방문 후보를 복제하지 않는다. 후보 ID와 개인 기록 키에 `delivery` 영역을 사용하고 기존 방문 기록은 그대로 둔다. 플랫폼 중립형 `가게 + 대표 1인 메뉴`를 단위로 하며 쿠팡 공식 기능·무료배달·최소주문 없음 등을 확인 없이 주장하지 않는다.

후보 데이터: 가게/메뉴 ID, 대표 사진과 이용 권리, 공개 확인 출처·확인 시각, 부산대 인근 공용 기준 지역, 메뉴 가격, 최소 주문액, 필수 옵션, 배달비, 회원·시간·지역 조건, 외부 이동 URL, 검수자, 만료 시각. 모르는 값은 `unknown`으로 두고 0원으로 표시하지 않는다. 집 주소·플랫폼 로그인·자동 주문은 수집/실행하지 않는다.

운영자가 후보를 등록·검수·비공개·수정할 수 있는 제한된 관리 경로와 자동 만료 검사를 구현한다. 만료 후보/혜택은 추천·대진에서 제외하거나 재확인 필요로 낮춘다. 외부 링크는 허용된 https 대상과 가게·메뉴 일치를 검증한다.

**실제 후보 확보도 G의 완료 조건이다.** 엔진이 동작하고 빈 화면이 정직하다는 것만으로 전체 G 완료라고 하지 않는다. 정책표의 유효 후보 수와 사진 권리를 충족하지 못하면 전체 결과표에 자료 부족을 그대로 남긴다. 비용 발생·비공개 계정 접근·가게 연락이 필요하면 해당 권한만 요청하고 데이터를 발명하지 않는다.

## 9. 한 번에 검토할 정책 제안표

다음은 **계획 채택 시 적용할 제안**이며 현재 사용자 승인값이 아니다. 숫자는 이 표를 단일 기준으로 사용한다. 사용자는 전체 계획 승인 시 함께 채택하거나 필요한 항목만 바꿀 수 있다. 개별 작업 완료 때마다 정책을 다시 묻지 않는다. 법적 안전 보장이나 실제 검증 결과가 아니다.

| 키 | 제안 | 적용·변경 조건 |
| --- | --- | --- |
| S-AGE | 신규 대상 만 19–35세, 선택형 생년월일, 비공개 | 기존 18/19 기준 불일치 해소 제안. 자기 입력과 실명 본인인증을 구분, 기존 계정은 삭제하지 않고 자격 재확인 |
| S-SCHOOL | 부산대 선택 범위부터 시작 | 재학 인증을 새로 발명하지 않음. 공개 제목은 ‘부산대 선택 참여자’이며 검증 학생 수라고 하지 않음 |
| S-GENDER | 기존 매칭 M/F 계약 유지, 커뮤니티 설문 성별은 남/여/기타·응답 안 함/모름 | 가입의 추가 성별 표현은 매칭 enum 강제 변환 대신 별도 필드. 미지원 매칭 자격을 설명하고 커뮤니티 이용은 막지 않음 |
| S-PHONE | 새 계정 전화 OTP, 기존 계정 전화 변경 OTP | 기존 로그인 보존, 중복 자동 병합 금지. 실제 SMS 비용/사업자 설정 별도 승인 |
| M-PUBLIC | 공개 셀 최소 고유 응답자 10명 | 경험 건수가 아님. 보완 셀·총계·차분 보호도 통과해야 함 |
| M-RANK | 긍정 순위 최소 유효점수 고유 응답자 30명 | 원시 경험 비율 대신 응답자 균형 비율 |
| M-SCORE | 1–5점, 4–5점 긍정 | 범위를 바꾸면 긍정 기준도 함께 변경 |
| M-RAW | 경험은 마지막 수정, 참가자/실제 만남 통계 동의는 마지막 명시 확인 후 90일 | 경험별 만료와 참가자 동의 만료 중 빠른 경계 적용. 다른 경험 추가·단순 조회로 동의 수명 연장 금지 |
| M-WITHDRAW | 권위 집계 즉시 제외, 공개 반영 24시간 이내 | 개별 삭제·전체 철회·보존 만료 동일. 지연 시 해당 snapshot 공개 중지 |
| M-AUDIT | 응답 내용 없는 삭제 처리 기록 30일 | 법정 보존 결론 아님. 운영 백업 보존/복원 삭제 재적용 확인 전 운영 완료 금지 |
| M-INPUT | 기본은 횟수 빠른 입력+선택적 경험별 평가 | 시안은 하나 선택. 0회·모름·건너뛰기 허용, 평생 횟수 상한 없음 |
| C-ENTRY | 원천 보드게임이면 Day 2, 비보드게임이면 Day 1 | 콘텐츠 5일차 보존으로 실제 만남 총 5/6회. 과거 개인 경험 무관 |
| C-CONSENT | 첫 전환은 원천 확정 명단 전원, 이후 혼성 3명+콘텐츠 최소 인원 | 출석·명단 이의가 있으면 임의 축소하지 않고 검토·revision 재확인 |
| C-FEE | 원천 뒤 첫 계속하기부터 기존 전환 이용료 계약 적용 | 비보드게임의 Day 1 진입도 첫 전환으로 보는 제안. 실제 청구 승인 아님. 출처 회차·paid 이력으로 중복 부과 금지 |
| C-CUTOFF | 원천 종료 다음 날 17시까지 최초 선택·결제 | 서버 한국 시간, 조기 확정/미성립 시 예약 알림 취소. 실제 알림 발송은 별도 환경 검증 |
| D-COUNT | 별도 검증 배달 후보 최소 8개 | 실제 자료·사진 권리·동일 공용 기준 지역을 충족해야 함 |
| D-FRESH | 혜택 24시간, 가게/메뉴 기본 정보 7일 | 더 이른 명시 만료가 있으면 그 시각 우선. 만료 경계 테스트 |
| UX-CHECK | 대상 5명 중 4명 이상 도움 없이 핵심 동선 완료, 첫 행동 10초 내 이해 | 실제 사용자 관찰 전 미검증. 신청 의향 개선은 별도 질문으로 측정, 코드 통과와 구분 |

운영의 SMS 계약·결제 계약·사진 권리·장소 확인·개인정보 문서·원격 DB·실기기 알림은 구현 코드와 별도 증거를 필요로 한다. 사용자 대신 비용을 지불하거나 실계정 정책을 변경하지 않는다.

## 10. 실행 단위와 파일 소유권

아래 경로는 새 통합 작업공간 기준 상대경로다. 원본 루트는 3절에 정의했다. `(신규)` 파일은 아직 없으며 이번 계획의 생성 대상이다. 각 작업은 실패 테스트 → 최소 구현 → 통과 확인 → 관련 회귀 순서로 수행한다. 전체 목표를 축소하는 단계 분할이 아니다.

### T00. 안전한 통합 기반 — 총괄 소유

- [ ] 루트/G1/FIVE의 live Git 상태·변경 파일·내용 해시를 읽고 `docs/handoff/integrated-source-manifest.json`(신규)에 source/target/hash/이식 이유/제외 이유를 기록한다.
- [ ] `docs/engineering/COLLABORATION.md`, 최신 `AGENTS.md`, `INTERFACE_CONTRACT.md`를 적용하고 새 `codex/` 격리 작업공간을 만든다. 기존 checkout은 전환하지 않는다.
- [ ] G1 기반 변경은 명시 허용 목록으로 복사하고 FIVE는 아래 관련 파일을 읽어 계약을 고친 버전만 이식한다. 전체 diff/디렉터리 무차별 덮어쓰기는 금지한다.
- [ ] `lib/types.ts`, `lib/supabase.ts`, `app/page.tsx`, `app/layout.tsx`, package/lock, test configs, migration 파일은 총괄 한 명이 통합한다.
- [ ] 기존 로컬 실행과 테스트 기준선을 기록한다. 초기부터 실패한 항목은 새 결함과 구분한다.

### T01. 서버 자격·간편 가입 — 가입 담당

대상: `app/(auth)/login/page.tsx`, `app/auth/callback/route.ts`, `app/auth/continue/route.ts`, `app/profile/basic/page.tsx`, `components/profile/BasicInfoForm.tsx`, `components/profile/StepProgress.tsx`, `lib/profile/basic-profile-input.ts`, `lib/profile/onboarding-status.ts`, `app/api/profile/basic/route.ts`, `app/api/profile/photos/route.ts`, `app/api/profiles/phone/route.ts`.

신규: `lib/profile/eligibility.ts`, `lib/auth/phone-verification.ts`, `app/api/auth/phone/start/route.ts`, `app/api/auth/phone/verify/route.ts`, `app/api/profile/alias-options/route.ts`, `tests/profile/minimum-signup.test.ts`, `tests/auth/phone-verification.test.ts`.

- [ ] RED: 사진만으로 matching_ready가 true가 되는 경우, 미검증 전화, 중복 별칭 부분 저장, 만 나이 경계, 기존 로그인 복구를 실패 테스트로 만든다. OTP 정규화·재전송/시도 제한·1회성·세션/번호/목적 바인딩·만료·계정 존재 비노출·로그 비노출도 포함한다.
- [ ] 서버 resolver와 DB 읽기 계약을 만들고 모든 gate 소비자를 같은 판정에 연결한다. 클라이언트 boolean·user_metadata를 권한 근거로 사용하지 않는다.
- [ ] OTP·자동 별칭·학과 카탈로그·선택형 연령 UI를 구현한다. 학과 목록 없음은 지원 안내로 처리한다.
- [ ] 이상형 월드컵과 기존 개인 선호 결과를 보존하고, 사진 보완과 자발적 MBTI 동선을 분리한다.
- [ ] GREEN: profile/auth 테스트 및 기존 Tonight 신청 자격 회귀, 새로고침·만료·재로그인·타 계정 검증.

### T02. MBTI 원시 모델·집계·권한 — 데이터 담당

신규: `lib/community/mbti/types.ts`, `input.ts`, `aggregation.ts`, `privacy.ts`, `repository.ts`; `app/api/community/mbti/me/route.ts`, `app/api/community/mbti/experiences/route.ts`, `app/api/community/mbti/experiences/[experienceId]/route.ts`, `app/api/community/mbti/withdraw/route.ts`, `app/api/community/mbti/stats/route.ts`; `tests/config/mbti-input.test.ts`, `tests/config/mbti-aggregation.test.ts`, `tests/auth/mbti-ownership.test.ts`, `tests/config/mbti-privacy.test.ts`.

- [ ] RED: 한 사람의 경험 세 건, 과거 INFP 1회+현재 INFP 1회, 같은 유형의 다른 성별·다른 평가, 재전송, 횟수→상세 전환의 속성 보존과 이중 계산, 타인 접근, 참가자/경험 만료·철회 경쟁, 공개 인원 경계와 집계 차분 공격을 고정 데이터로 검증한다.
- [ ] 참가자·경험 테이블과 소유권 API, 낙관적 revision, 동의 버전, idempotency를 구현한다.
- [ ] 승인 전 비동의 payload 저장 금지. 등록·수정·삭제 후 raw/집계/snapshot의 책임을 분리한다.
- [ ] 정기 snapshot·만료·철회 반영·공개 차단 작업을 재실행 안전하게 구현한다. 공개 보호가 증명되지 않으면 해당 집계를 숨긴다.
- [ ] GREEN: 단위 테스트와 로컬 DB 역할별 직접 쿼리·API 허용/거부. 동의 없는 실제 계정 자료를 샘플로 사용하지 않는다.

### T03. MBTI 화면과 커뮤니티 연결 — 커뮤니티 담당

대상: `app/community/page.tsx`, `components/community/CommunitySpotlight.tsx`, 가입 뒤 진입 링크. 신규: `app/community/mbti/page.tsx`, `components/community/mbti/MbtiHub.tsx`, `MbtiExperienceEditor.tsx`, `MbtiExperienceReview.tsx`, `MbtiStats.tsx`, `MbtiResponseManager.tsx`.

- [ ] 선택 시안과 4절 화면 계약을 UI 상태표로 고정하고 중복 레이아웃을 만들지 않는다.
- [ ] 횟수 입력·상대 성별/상태 검토·상세 평가·동의·건너뛰기·통계·응답 관리의 실제 API 연결을 구현한다.
- [ ] 실제 만남 통계의 별도 목적 opt-in·양쪽 동의·출석 근거·occurrence 중복 제거·참가자 만료·어느 한쪽 철회·공개 기준을 구현한다. `lib/community/mbti/meeting-stats.ts`, `app/api/community/mbti/meeting-stats-consent/route.ts`, `tests/auth/meeting-stats-consent.test.ts`를 신규 추가한다. 경험 설문과 별도 표기하며 집계가 없으면 준비 중이다. 가짜 커플 순위를 넣지 않는다.
- [ ] 입력 초안은 탭 메모리에만 두고 저장 전에는 서버/localStorage에 사적 관계 정보를 남기지 않는다. 이탈 시 유실 안내를 한다. 제출 후에는 재로그인으로 복구한다.
- [ ] 모바일/데스크톱에서 count+/-·삭제·동일 유형별 다른 점수·뒤로가기·타 계정 전환을 직접 클릭한다.

### T04. 이번 주 탐색·신청·배정 — 첫 만남 담당

대상: `components/matching/QuantumMatchDiscovery.tsx`, `components/matching/QuantumEventApplicationStatus.tsx`, `lib/matching/quantum-event-lifecycle.ts`, `app/api/match/event-participation/route.ts`, 기존 주간 일정/배정 RPC. 신규: `lib/matching/weekly-availability.ts`, `components/matching/WeeklyActivityExplorer.tsx`, `tests/matching/weekly-availability.test.ts`.

- [ ] RED: 이번 주 진입 누락, 복수 날짜가 중복 예약이 되는 경우, 기간 경계·마감·주간 rollover·정원 경쟁·확정 일정 충돌을 재현한다.
- [ ] 활동 발견→가능 날짜 복수 선택→한 신청→한 회차 배정 DTO와 서버 command를 구현한다.
- [ ] 오늘 G1 화면·순위·동의 상태를 그대로 유지하고 주간 진입을 같은 위계에 둔다.
- [ ] 주간 실제 출석 확인 ledger/revision을 도입해 시간 만료와 구분한다. 신고·정정은 권한과 감사 기록을 갖춘다.
- [ ] 실제 로컬 두 계정/운영 역할로 배정·취소·재조회·중복 방지를 검증한다.

### T05. 후속 원천·번호·전환 통합 — 후속 백엔드 담당

FIVE 참조: `lib/matching/five-meeting-state.ts`, `five-meeting-content.ts`, `five-meeting-overview.ts`, `five-meeting-post.ts`, `five-meeting-attendance-flow.ts`; `app/api/match/series/current/route.ts`, `app/api/match/series/[seriesId]/next-action/route.ts`, `formation/route.ts`, 기존 occurrence content/after/chat/cancel API.

G1 연결: `components/tonight/types.ts`, `components/tonight/live-adapters.ts`, `app/api/tonight/route.ts`, `app/api/match/event-participation/route.ts`. 신규: `lib/matching/continuation-source.ts`, `continuation-entry.ts`, `tests/matching/continuation-entry.test.ts`, `tests/matching/continuation-transition.test.ts`.

- [ ] RED: 오늘/주간 × 보드/비보드의 원천·Day·실제 번호·첫 전환과 최종 종료를 표 기반 테스트로 고정한다.
- [ ] canonical source bridge와 공개 DTO를 만들고 `source_event_occurrence_id` 단일 FK 가정을 제거한다.
- [ ] `board_game_direct` 무동의 시작, `sequence_no=2` 전원 결제 조건, Day 3 음주 제약을 새 계약에 맞춘다.
- [ ] 첫 원천의 참석·명단·동의·결제 이력을 보존하고 ambiguous 기존 데이터는 추측 backfill하지 않고 검토 큐로 보낸다.
- [ ] 두 첫 만남 진입 모두 같은 `open_continuation_transition(sourceOccurrenceId)` 서버 명령으로 연결한다.
- [ ] GREEN: 역할·명단 revision·출석 이의·이미 열린 전환 재호출·시즌 중복·일정 충돌·Day 5 종료를 검증한다.

### T06. 후속 Day 1–5 실제 화면·행동 — 후속 프론트 담당

FIVE 참조: `components/matching/TonightFiveMeetingContinuation.tsx`, `FiveMeetingHomeNextActionCard.tsx`, `FiveMeetingCalendar.tsx`, `OccurrenceContentExperience.tsx`, `FiveMeetingPostFlow.tsx`, `FiveMeetingSeriesAlbum.tsx`. G1 연결: `components/tonight/UserTonightExperience.tsx`, `QuantumEventApplicationStatus.tsx`.

- [ ] Today 전용 원천 가정을 제거해 주간도 같은 진행 DTO를 사용하게 한다. 홈/캘린더/진행/종료/채팅 링크의 회차를 일치시킨다.
- [ ] Day 1–5의 선택·점수·팀·대화 순서·카드·중단·최종 종료를 서버 행동으로 저장한다. 미리보기 컨트롤러를 실제 실행으로 착각하지 않는다.
- [ ] 서버 시각·진행 revision으로 재접속 복원하고 stale 명령은 재확인한다.
- [ ] 보드 원천→Day 2와 비보드 원천→Day 1을 명확히 설명한다. 실제 6번째 만남이 프로그램 Day 5인 경우 잘못 잠기지 않는다.
- [ ] 신규 합류자는 이전 비공개 자료를 볼 수 없고, 종료/미동의/사진 미제출도 정상 경로로 처리한다.

### T07. 결제·친구·채팅·알림 복구 — 신뢰성 담당

대상: `lib/payments/toss.ts`, `lib/payments/deposit-server.ts`, `lib/payments/refund-settlement.ts`, `app/api/payments/deposit/confirm/route.ts`, `app/api/payments/deposit/webhook/route.ts`, `app/api/payments/deposit/cancel/route.ts`, `app/api/internal/payments/refunds/process/route.ts`, `app/api/friend-requests/route.ts`, `app/api/friend-requests/[id]/accept/route.ts`, `app/api/internal/match/friend-request-delivery/route.ts`, `app/api/match/occurrences/[occurrenceId]/chat/route.ts`, `lib/matching/occurrence-chat-view.ts`. 기존 보증금 파일은 회귀·경계 검토 대상이며 불필요하게 새 이용료 처리를 넣지 않는다. 신규: `lib/matching/continuation-entitlement.ts`, `lib/payments/continuation-fee.ts`, `lib/notifications/continuation-outbox.ts`, `app/api/payments/continuation/prepare/route.ts`, `app/api/payments/continuation/confirm/route.ts`, `app/api/internal/match/continuation-notifications/route.ts`, `tests/matching/continuation-payment-recovery.test.ts`, `tests/auth/continuation-privacy.test.ts`.

- [ ] RED: callback 중복·순서 역전·timeout·서비스 미제공·부분 원상복구·타인 결제 재사용·이용료/보증금 혼용을 재현한다. provider 서명/서버 조회 실패, 소유권·금액·통화·purpose 변조, event 재생도 실패 테스트로 고정한다.
- [ ] transition별 금전 상태와 친구 요청 entitlement를 분리한다. 기존 Toss 보증금 경로를 다른 provider 이용료와 섞지 않는다.
- [ ] 개인 선택·미선택·연락처·비공개 점수가 projection/로그/푸시에 새지 않는지 점검한다.
- [ ] 알림 outbox의 중복 방지·예약 취소·실패 재시도·deep link와 서버 시간 경계를 구현한다. 이번 변경에 무관한 새로운 마케팅 Push는 넣지 않는다.
- [ ] 로컬 provider simulator, 허용된 sandbox, 실제 서비스 검증을 구분한다. 실제 승인·환불은 요청하지 않고 실행하지 않는다.

### T08. 실제 모임 우선 — 모임 담당

대상: `components/meetups/MeetupHub.tsx`, `app/api/meetups/route.ts`, `app/api/meetups/[id]/join/route.ts`의 기존 계약. 신규: `tests/config/meetup-hub-order.test.ts`.

- [ ] 0/1/다수 목록 테스트와 아이디어의 기존 선행 배치를 RED로 기록한다.
- [ ] 실제 목록·빈 상태를 앞에 배치하고 아이디어·예정표를 아래로 옮긴다.
- [ ] 만들기·상세·참가·취소·검색/필터 복귀를 실 API로 확인한다. 새 보증금 규칙은 붙이지 않는다.

### T09. 방문 맛집과 배달 후보 — 맛집 담당

대상: `components/community/CommunitySpotlight.tsx`, `components/campus-eats/CampusEatsPilot.tsx`, `lib/campus-eats/types.ts`, `repository.ts`, `eligibility.ts`, `personal-rating.ts`, `url-state.ts`. 신규: `lib/campus-eats/delivery.ts`, `delivery-verification.ts`, `components/campus-eats/DeliveryCandidateEditor.tsx`, `app/api/admin/campus-eats/delivery/route.ts`, `tests/matching/delivery-eligibility.test.ts`, `tests/config/campus-eats-record-isolation.test.ts`.

- [ ] RED: 최소 한 곳 안내 불일치, 하드코딩 통계, 방문 기록 오염, unknown=무료, 만료 혜택, 잘못된 외부 URL을 테스트한다.
- [ ] 음식 사진·시작 CTA·대진·우승·개인 순위 UI를 같은 체계로 정리한다.
- [ ] 배달 전용 모델·후보 검수 UI·만료 검사·대진·외부 이동을 구현한다. 방문 ID와 key를 바꾸지 않는다.
- [ ] 실제 후보를 출처·확인일·권리와 함께 확보한다. 정책표 후보 수 미달이면 자료 완료 체크를 하지 않는다.
- [ ] 모바일/데스크톱, 뒤로가기, 새로고침, 개인 기록 이전, 만료 시간 전후를 검증한다.

### T10. 로컬 DB 통합·전체 검수 — 총괄·독립 검수 담당

- [ ] migration 파일은 실행 때의 UTC 14자리 시각으로 새로 생성한다. 현재 G1 최신 migration 이후 순서를 보장하고 옛 FIVE migration을 그대로 복사하지 않는다.
- [ ] schema/source bridge → data backfill → RPC/RLS 순서와 트랜잭션 경계를 검토한다. 기존 애매한 행은 audit queue로 두고 이력 삭제나 강제 재번호화를 하지 않는다.
- [ ] 새 빈 전용 로컬 DB와 기존 상태의 비식별 로컬 복제 DB 업그레이드 두 경로를 검사한다. 사용자 원본 DB 초기화 금지.
- [ ] A–G의 단위/권한/상태 테스트 뒤 아래 통합 클릭 여정을 모두 실행한다.
- [ ] 독립 검수자는 계획·실제 diff·클릭 결과·저장 증거·캡처를 함께 보고 반증 가능한 PASS/REVISE/미검증을 기록한다.

병렬 실행: T01/T02/T04/T08/T09 자료 준비는 T00 뒤 독립 진행 가능. T03은 T02 계약, T05는 원천/출석 계약, T06/T07은 T05 DTO에 의존한다. 공유 커뮤니티 상단 파일은 총괄이 T03/T09 결과를 합친다. API·migration·types의 중복 편집자는 두지 않는다. 검수 실패가 생기면 해당 결함을 고치되 나머지 범위를 폐기하지 않는다.

## 11. 검증 명령과 통합 증거

아래는 **구현 후 실행할 명령**이며 이번에 통과했다고 주장하지 않는다. 테스트 신규 파일이 각 tsconfig에 포함되는지도 확인한다. 새 파일만 실행하고 기존 회귀를 빼지 않는다.

```powershell
npx tsc -p tsconfig.profile-tests.json
node --test .tmp/profile-tests/tests/profile/*.test.js
npx tsc -p tsconfig.auth-tests.json
node --test .tmp/auth-tests/tests/auth/*.test.js
npx tsc -p tsconfig.config-tests.json
node --test .tmp/config-tests/tests/config/*.test.js
npx tsc -p tsconfig.matching-tests.json
node --test .tmp/matching-tests/tests/matching/*.test.js
npm run typecheck
npm run lint
npm run build
npm run check:migrations
npm run check:secrets:all
```

기존 스크립트/도구가 환경에서 실패하면 원인을 기록하고 동등한 검증을 제시한다. 오류를 무시하거나 성공으로 바꾸지 않는다. 테스트 출력 폴더는 해당 작업 전용으로 관리하며 넓은 재귀 삭제 명령을 쓰지 않는다.

| 통합 시나리오 | 필요한 직접 증거 |
| --- | --- |
| 새 계정 최소 가입→월드컵→MBTI 건너뛰기→커뮤니티→실제 참가 시 보완 | UI·Auth·서버 자격 결과, 부족 프로필로 신청 차단 |
| 기존 이메일/OAuth 계정의 전화 인증·기존 개인 데이터 유지 | 동일 user id, 기존 별칭/사진/월드컵 기록 보존, 타 계정 자동 병합 없음 |
| INFP 2+INTP 1→상세화→각각 다른 점수→수정→개별 삭제→전체 철회 | raw/count/distinct owner/공개 억제 결과, 재전송·동시 수정 409 |
| 실제 오늘 3활동 탐색→순위→동의→신청 | 탐색만 했을 때 DB 신청 0, 최종 신청 1건·순위 일치 |
| 이번 주 활동 탐색→복수 날짜→단일 배정→취소 | 한 신청·한 배정, 충돌/정원 race 거부, 올바른 주간 날짜 |
| 오늘/주간 × 보드게임/비보드게임 원천 | 각 첫 전환 동의·출석·결제·Day·실제 만남 번호 일치 |
| Day 1–5, 5/6인 및 콘텐츠 허용 잔류 인원, 신규 합류·이탈 | 현행 서버 DTO, 팀/점수/채팅/사진 접근·재접속·최종 종료 |
| 결제·복구·알림 | 시뮬레이터/샌드박스/실제 구분, 중복 1회 반영, 복구 실패 큐, 예약 취소 |
| 네 역할 운영 | 같은 팀 번호·인원·장소·일정 revision·권한 거부 결과 |
| 모임과 맛집 | 검색/필터 복귀, 실제 참가/취소, 개인 기록 보존, 배달 출처·만료·외부 링크 |
| 디자인 | 320/390/768/1440 너비 캡처, 터치/키보드, 겹침·가로 넘침·오류·로딩·빈 상태 |
| 관심·참여 욕구 | 실제 대상 사용자 관찰 결과. 이해도와 신청 의향을 따로 기록 |

브라우저는 사용자가 사용하는 앱 브라우저에서 실로그인해 직접 클릭한다. 테스트 fixture·미리보기 우회 로그인으로만 찍은 캡처는 별도 분류한다. 결과 화면 캡처에는 새로 바뀐 위치와 상태를 표시하되 개인정보를 노출하지 않는다.

## 12. 완료 보고와 남는 외부 의존

전체 범위 완료 판정은 각 A–H의 구현·로컬 검증·자료 검증을 나란히 기록한다. 화면만 있는 부분, 빈 자료, 실패 복구 미검증을 숨기고 ‘전부 구현 완료’라고 하지 않는다.

- **변경한 내용:** 파일 허용 목록과 A–H 목적별 결과. 이번 문서 변경과 미래 앱 변경 분리.
- **검증한 내용:** 자동 테스트, 실제 로컬 Auth/API/DB, 브라우저, 실계정·실기기를 각각 표시.
- **발견한 문제와 수정 내용:** 가입 gate 불일치, 단일 관계 제한, Day/실제 번호 혼동, 후보 오인 등 해결 근거.
- **남은 위험 또는 미검증 사항:** 실제 SMS·결제 provider·원격 RLS·운영 DB 반영·배포·실기기 알림·사용자 관찰·자료 권리 등 정확히 남김.

구현을 시작하는 데 필요한 제품 선택은 **MBTI 시안 한 장과 이 통합 계획의 제안표 채택 여부**다. 실제 비용·외부 계정 설정 등이 필요하면 그 권한만 별도로 요청한다. 그 사유로 무관한 기능을 빼거나, 외부 미검증 부분을 mock 완료로 바꾸지 않는다.

## 13. 이 문서의 자체 검수

- [x] 최신 요청과 기존 G1–G5·후속 만남 인수인계 연결
- [x] 다중 연애·동일 유형 반복·고유 응답자와 경험 건수 분리
- [x] 간편 가입/매칭 자격, 원천/프로그램 Day/실제 만남 번호 분리
- [x] 앱 구현과 디자인 예시, 로컬/운영 증거 구분
- [x] 단일 정책표·의존 관계·파일 소유권·검증 매트릭스 작성
- [x] 독립 검토 후 지적 사항 반영 및 최종 문서 판정 기록

### 독립 검토 기록

| 검토 | 판정 | 보완·확인 |
| --- | --- | --- |
| 최초 | REVISE | 같은 유형의 현재/과거 묶음 분리, 전화 OTP 보안, 결제 진위 확인, 참가자·실제 만남 통계의 보존/철회 계약 보완 필요 |
| 보완 후 | PASS | 위 네 계약과 테스트를 추가하고, 추가 성별 최소 가입과 기존 M/F 매칭 계약도 분리. 전체 범위·미승인 제안표·5/6회 번호·외부 승인 경계의 실행 차단 모순을 찾지 못함 |

작성자 점검: 목적 8개, 실행 단위 11개, 정책 제안 18개, 코드 블록 열림/닫힘 일치, placeholder 및 줄 끝 공백 없음, 생성 시안 3개 파일 존재. 계획 파일은 untracked 추가이며 stage 0이다. 기존 더티 변경은 보존했다. 세 시안은 직접 열람해 내용과 반복 횟수 예시를 확인했지만, 정적 이미지이므로 클릭·반응형·접근성 통과로 판정하지 않는다.

현재 문서 판정: **독립 검토 PASS**. 현재 앱 판정: **이번 통합 범위 구현 미착수**. 시안 선택·계획 승인·실제 운영 공개는 각각 다른 사실이다.

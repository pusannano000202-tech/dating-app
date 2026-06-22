# 성준 작업 인수인계서 - 부팅 부산대 과팅

작성일: 2026-06-22

대상: 성준 + 성준 Codex

목적: 성준이 충현 브랜치를 받아 로컬에서 바로 화면을 보면서 발표 준비, UI 보완, 결제/매칭 점검을 이어갈 수 있게 한다.

---

## 1. 제일 중요한 결론

현재 앱은 "로컬 미리보기로 전체 흐름을 눌러보는 수준"까지 많이 정리됐다. 하지만 아직 운영 배포 완료 상태는 아니다.

성준이 받아야 하는 핵심은 세 가지다.

1. 현재 브랜치의 프론트 흐름을 로컬에서 직접 켜서 확인한다.
2. Toss sandbox, Supabase production, Vercel production은 아직 실제 운영 연결이 완료되지 않았으므로 함부로 건드리지 않는다.
3. `preference_weights`, 데일리카드 정책, 보증금 결제 시점, 연락처/채팅 공개 시점은 팀 합의가 필요한 항목이다.

---

## 2. Git 저장소와 브랜치

현재 작업 폴더:

```powershell
C:\Users\82108\OneDrive\바탕 화면\데이팅앱만들기
```

현재 origin:

```text
https://github.com/pusannano000202-tech/dating-app.git
```

현재 로컬 브랜치:

```text
profile/post-worldcup-decisions-2026-05-21
```

현재 푸시 완료 HEAD:

```text
e6ab3b8 feat: sync booting frontend flow for sungjun handoff
```

원격 브랜치 상태:

```text
origin/profile/post-worldcup-decisions-2026-05-21 = e6ab3b8...
현재 로컬 브랜치와 origin 브랜치가 같은 커밋을 가리킴
```

중요:

- 2026-06-22 기준 코드/문서 변경은 GitHub에 push 완료됐다.
- 성준은 GitHub에서 이 브랜치를 받으면 현재 프론트 흐름을 바로 이어서 볼 수 있다.
- 로컬에 남은 `.codex-remote-attachments/`, `output/`은 카톡 첨부와 PDF/스크린샷 산출물이라 코드 기준선에는 포함하지 않았다.

이번 push에 포함된 주요 변경 범위:

- `app/match/[id]/page.tsx`
- `app/match/page.tsx`
- `app/page.tsx`
- `app/notifications/page.tsx`
- `app/group/create/page.tsx`
- `app/profile/worldcup/page.tsx`
- `app/profile/edit/page.tsx`
- `app/globals.css`
- `tailwind.config.ts`
- `components/matching/*`
- `components/navigation/AppBottomNav.tsx`
- `tests/config/booting-branding.test.ts`
- `tests/profile/gender-normalization.test.ts`
- `lib/gender.ts`
- `docs/handoff/active/SUNGJUN_APP_HANDOFF_2026-06-22.md`
- `docs/handoff/active/SUNGJUN_CODEX_PROMPT_2026-06-22.md`

---

## 3. 성준이 로컬에서 받는 방법

### 방법 A - 같은 저장소 접근 가능할 때

충현이 현재 브랜치를 push한 뒤 성준 로컬에서:

```powershell
git clone https://github.com/pusannano000202-tech/dating-app.git
cd dating-app
git fetch origin
git switch profile/post-worldcup-decisions-2026-05-21
npm install
copy .env.local.example .env.local
npm run dev -- -p 3004
```

브라우저:

```text
http://localhost:3004/dev/preview
http://localhost:3004/
http://localhost:3004/match
http://localhost:3004/group/create
http://localhost:3004/match/dev-match-pending
http://localhost:3004/match/dev-match-1
```

### 방법 B - 성준이 기존 `sj4505/dating-app` 로컬 클론을 쓰는 경우

성준의 기존 폴더에서:

```powershell
git remote add chunghyun https://github.com/pusannano000202-tech/dating-app.git
git fetch chunghyun
git switch -c review/chunghyun-flow chunghyun/profile/post-worldcup-decisions-2026-05-21
npm install
copy .env.local.example .env.local
npm run dev -- -p 3004
```

이미 `chunghyun` remote가 있으면 `git remote add`는 생략한다.

---

## 4. 로컬 env

`.env.local.example` 기준:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3003
NEXT_PUBLIC_DEV_AUTH_BYPASS=false
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your-key
NEXT_PUBLIC_SUPABASE_ANON_KEY=
AI_SERVER_URL=http://localhost:8001

NEXT_PUBLIC_PAYMENT_PROVIDER=mock
PAYMENT_PROVIDER=mock

NEXT_PUBLIC_TOSS_CLIENT_KEY=
TOSS_SECRET_KEY=
PAYMENT_INTERNAL_SECRET=
SUPABASE_SERVICE_ROLE_KEY=
```

로컬 화면 확인은 `mock` provider로 충분하다.

Toss sandbox를 실제로 확인할 때만 아래가 필요하다.

- `NEXT_PUBLIC_TOSS_CLIENT_KEY`
- `TOSS_SECRET_KEY`
- `PAYMENT_INTERNAL_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`

절대 금지:

- `TOSS_SECRET_KEY`, `PAYMENT_INTERNAL_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`를 브라우저 코드나 문서에 실제 값으로 적지 말 것.
- production Toss, production Supabase, production Vercel을 바로 만지지 말 것.

---

## 5. 앱 전체 사용자 흐름

### 5.1 로그인

위치:

- `app/(auth)/login/page.tsx`

현재 방향:

- 이메일 OTP 로그인 유지.
- Google OAuth 버튼 추가됨.
- `/login?redirect=...`, `/login?next=...` 처리.

미완:

- Google provider, redirect URL allow list, Vercel env는 dashboard 설정이 필요하다.

### 5.2 온보딩

주요 화면:

- `/profile/basic`
- `/profile/worldcup`
- `/profile/survey`
- `/profile/personality-preference`
- `/profile/preferences`
- `/profile/schedule`
- `/profile/match-card`
- `/profile/photos`

현재 구현:

- 기본정보는 `profiles`, `users.phone`에 저장하는 흐름.
- 부산대 단과대/학과 검색은 `lib/pnu-departments.ts`.
- 닉네임 중복 확인 API가 있음.
- 이상형 월드컵은 사용자의 성별 반대 후보가 뜨도록 `lib/gender.ts`와 `app/profile/worldcup/page.tsx`를 수정.
- 성향, 가능 시간, 매칭 비중, 사전 카드 흐름이 분리됨.

주의:

- `profiles.is_profile_complete`의 최종 기준은 DB/API와 화면이 계속 일치해야 한다.
- `preference_weights`는 현재 4개 키 기준이다.

### 5.3 친구/그룹

주요 화면/API:

- `/friends`
- `/group/create`
- `/group/invite/[token]`
- `app/api/friend-requests/route.ts`
- `app/api/group-invites/route.ts`
- `app/api/group-invites/accept/route.ts`

현재 방향:

- 전화번호 기반 친구 요청은 신규 UX에서 제거하는 방향.
- 닉네임 기반 친구 요청.
- 초대 링크는 "로그인/회원가입 후 수락" 흐름으로 설명.
- 미가입 친구가 바로 그룹에 들어온 것처럼 보이지 않게 해야 한다.

주의:

- dev preview 상태와 실제 DB 상태가 섞여 보일 위험이 있다.
- 홈/매칭/그룹의 "현재 함께하는 친구" source를 계속 통일해야 한다.

### 5.4 매칭 준비 gate

주요 파일:

- `app/api/match-pool/enter/route.ts`
- `lib/matching/match-setup-status.ts`
- `app/group/create/page.tsx`
- `app/match/start/page.tsx`

현재 조건:

- 친구/그룹이 없으면 매칭 찾기 불가.
- 그룹 정원이 안 차면 매칭 찾기 불가.
- 성향, 가능 시간, 매칭 비중, 사전 카드가 부족하면 매칭 찾기 불가.
- 부족한 항목을 화면에서 안내하는 방향.

위험:

- 프론트 버튼 비활성 조건과 서버 gate 조건이 계속 같아야 한다.
- 4개 가중치와 7개 가중치 계약이 충돌할 수 있다.

### 5.5 매칭/가매칭/확정

주요 화면:

- `/match`
- `/match/dev-match-pending`
- `/match/dev-match-1`
- `/match/[id]`

최근 변경:

- `/match/[id]` pending 화면을 긴 스크롤 한 페이지에서 4단계 페이지 넘김 흐름으로 변경.
- 단계: `가매칭 -> 사전 카드 -> 보증금 -> 확정`
- 매칭 찾기 전 상대 카드/상세가 결과처럼 보이지 않게 하는 방향.
- `MatchFoundSummary`, `ChemiRing`, `DepositPaymentPanel` 등 새 컴포넌트 사용.

주의:

- 사전 카드 단계 안에는 입력 항목이 많아 내부 스크롤이 생길 수 있다.
- 전체 매칭 흐름 자체는 더 이상 한 페이지에 전부 노출하지 않는다.

### 5.6 보증금/결제/환불

주요 파일:

- `lib/constants.ts`
- `lib/payments/deposit.ts`
- `lib/payments/toss.ts`
- `app/api/payments/deposit/route.ts`
- `app/api/payments/deposit/confirm/route.ts`
- `app/api/payments/deposit/cancel/route.ts`
- `app/api/payments/deposit/webhook/route.ts`
- `app/match/[id]/refund/page.tsx`
- `lib/refund/fee-flow.ts`

현재 정책:

- 보증금은 10,000원.
- provider는 `mock`, `toss`만 유지.
- KakaoPay/PortOne은 현재 제외.
- 로컬 UI 검토는 mock.
- Toss sandbox는 env가 없어서 실제 E2E 미검증.

환불 UX:

- 앱 기여금 0-10,000원 범위.
- 0원 선택 시 3,000원, 2,000원, 1,000원 순서로 제안하는 흐름 유지.
- 끝까지 0원을 원하면 막지 않음.

미완:

- Toss sandbox checkout/confirm/cancel/webhook 실제 검증.
- production env와 dashboard 연결.
- 내부 환불 트리거 운영 연결.

### 5.7 데일리카드/채팅/연락처

주요 파일:

- `components/matching/DailyCardHintWizard.tsx`
- `lib/matching/daily-card-authoring.ts`
- `app/api/matches/[id]/daily-cards/route.ts`
- `app/api/matches/[id]/connections/route.ts`
- `app/match/[id]/chat/page.tsx`

현재 방향:

- 현재 우리 브랜치는 16:00-20:00 직접 뽑기 정책.
- 내가 써야 상대 것을 볼 수 있는 흐름을 지향.
- 매칭 확정 전 상대 카드 노출 금지.

합의 필요:

- 성준 `gwating-app` 쪽은 자동분배 UX 성격이 강하다.
- 최종 MVP는 직접 뽑기인지 자동분배인지 결정해야 한다.
- 연락처/채팅 공개 시점이 확정 직후인지, 약속 당일인지, 체크인 후인지 결정해야 한다.

### 5.8 관리자/노쇼

주요 화면/API:

- `/admin/matches/review`
- `/admin/matches/[id]`
- `app/api/matches/[id]/checkin/route.ts`
- `app/api/matches/[id]/finalize-no-show/route.ts`

현재 상태:

- 관리자 검토와 노쇼 관련 route는 존재한다.
- 하지만 운영 정책은 아직 확정되지 않았다.

합의 필요:

- 노쇼 판정을 GPS만으로 할지.
- 사진 인증까지 넣을지.
- 관리자가 직접 사진/시간/장소를 보고 판정할지.

---

## 6. 현재 디자인 방향

현재 톤:

- Warm Paper x Electric
- 크림 종이 배경
- 코랄-오렌지 CTA
- 딥 브라운 매칭 진행 카드
- 큰 원형 Chemi 점수
- 하단 탭: 홈, 매칭, 채팅, 마이

성준 디자인에서 가져올 것:

- 여백
- 정돈감
- 버튼 무게감
- 카드 계층

성준 디자인에서 그대로 베끼지 않을 것:

- 우리 앱 흐름과 안 맞는 화면 구조
- mock localStorage 중심 흐름
- 현재 DB/API와 연결되지 않은 컴포넌트 묶음

---

## 7. 현재 검증 결과

2026-06-22 현재 실행 결과:

```powershell
npm run test:config      # 통과, 38개
npm run test:profile     # 통과, 18개
npm run test:matching    # 통과, 38개
npm run typecheck        # 통과
npm run lint             # 통과
npm run check:payment-env # 통과, mock provider 기준
```

Toss sandbox 강제 검증:

```powershell
npm run check:payment-env -- --provider=toss
```

결과:

- 실패가 정상.
- 누락: `NEXT_PUBLIC_TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY`, `PAYMENT_INTERNAL_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`.

최근 route 확인:

```text
http://localhost:3004/match/dev-match-pending = 200
```

---

## 8. 위험 항목

### 위험 1 - 코드 기준선과 산출물 기준선이 다름

코드/문서 기준선은 `e6ab3b8`로 GitHub에 push 완료됐다.
다만 PDF, 스크린샷, 카톡 첨부 같은 산출물은 `output/`, `.codex-remote-attachments/`에 남아 있고 Git에는 올리지 않았다.

해결:

- 성준이 코드 작업을 이어갈 때는 GitHub 브랜치만 받으면 된다.
- 발표 공유용 PDF는 카톡 파일로 따로 전달한다.

### 위험 2 - 공용 파일 수정

공용 파일:

- `lib/types.ts`
- `lib/supabase.ts`
- `lib/constants.ts`
- `supabase/migrations/`
- `app/layout.tsx`
- `app/page.tsx`

현재 작업에는 `app/layout.tsx`, `app/page.tsx`, `lib/constants.ts` 관련 흐름이 포함된다.
공용 파일은 반드시 서로 확인하고 머지해야 한다.

### 위험 3 - preference_weights 계약 충돌

현재 계약 문서와 구현은 4개 키:

- `appearance`
- `personality`
- `height`
- `body_type`

성준 회신에는 7개 키 언급이 있었다:

- `appearance`
- `personality`
- `height`
- `body_type`
- `school`
- `hobby`
- `time_fit`

현재 사용자 요구는 4개 유지에 가깝다.
성준 매칭 엔진이 7개를 요구하면 먼저 계약 문서부터 합의해야 한다.

### 위험 4 - 데일리카드 정책 충돌

우리 브랜치:

- 16:00-20:00 사용자가 직접 카드 뽑기.

성준 gwating 프로토타입:

- 만남일까지 자동분배형 Q&A에 가깝다.

결정 전에는 DB 스키마를 더 밀지 않는 것이 안전하다.

### 위험 5 - 결제는 코드와 운영 연결이 다르다

현재 결제 코드는 mock과 Toss route를 갖고 있다.
하지만 Toss sandbox key와 webhook dashboard 설정이 없어서 실제 외부 결제 성공은 아직 아니다.

### 위험 6 - dev preview와 실제 DB가 섞일 수 있다

`/dev/preview`, `dev-match-*`는 화면 검토용이다.
실제 유저 DB 흐름을 검증할 때는 로그인 계정, Supabase row, RLS, migration 적용 상태를 따로 확인해야 한다.

---

## 9. 성준이 우선 봐야 할 파일

협업 계약:

- `docs/engineering/INTERFACE_CONTRACT.md`
- `docs/engineering/COLLABORATION.md`

현재 상태 문서:

- `docs/handoff/active/OVERNIGHT_PROGRESS_HANDOFF.md`
- `docs/plans/2026-06-22-overnight-completion-audit.md`
- `docs/plans/2026-06-22-overnight-external-completion-gates.md`
- `docs/plans/2026-06-22-booting-visual-redesign-execution-plan.md`

핵심 프론트:

- `app/page.tsx`
- `app/match/page.tsx`
- `app/match/[id]/page.tsx`
- `app/group/create/page.tsx`
- `app/notifications/page.tsx`
- `app/profile/basic/page.tsx`
- `app/profile/worldcup/page.tsx`
- `app/profile/preferences/page.tsx`
- `app/profile/schedule/page.tsx`
- `app/profile/match-card/page.tsx`

핵심 컴포넌트:

- `components/matching/HomeTodayTaskCard.tsx`
- `components/matching/DarkTeamProgressCard.tsx`
- `components/matching/LockedOpponentCard.tsx`
- `components/matching/MatchFoundSummary.tsx`
- `components/matching/DepositPaymentPanel.tsx`
- `components/matching/DailyCardHintWizard.tsx`
- `components/navigation/AppBottomNav.tsx`
- `components/profile/BasicInfoForm.tsx`
- `components/profile/PreferenceWeightInputs.tsx`
- `components/profile/SchedulePicker.tsx`

핵심 로직:

- `lib/gender.ts`
- `lib/pnu-departments.ts`
- `lib/matching/match-setup-status.ts`
- `lib/matching/daily-card-authoring.ts`
- `lib/payments/deposit.ts`
- `lib/payments/toss.ts`
- `lib/refund/fee-flow.ts`

---

## 10. 성준에게 부탁할 우선 작업

1. 현재 브랜치를 로컬에서 열어 화면을 직접 본다.
2. `preference_weights` 4개/7개 중 최종 계약을 정한다.
3. 데일리카드는 직접 뽑기와 자동분배 중 하나를 정한다.
4. 보증금 결제 시점을 정한다.
   - 큐 진입 전인지
   - 가매칭 후인지
   - 확정 직전인지
5. Toss sandbox key/env를 준비해서 실제 결제 E2E를 검증한다.
6. 새 Supabase migration을 staging/local에서 다시 확인하고 production 적용 여부를 결정한다.
7. 발표용 화면은 `/dev/preview`, `/`, `/match`, `/match/dev-match-pending`, `/match/dev-match-1`, `/group/create`, `/notifications` 중심으로 본다.

---

## 11. 성준 Codex에게 줄 프롬프트

아래 프롬프트는 그대로 새 Codex 대화에 넣으면 된다.

```text
성준 Codex, 충현 브랜치 인수인계 작업을 시작해.

저장소:
- https://github.com/pusannano000202-tech/dating-app.git

브랜치:
- profile/post-worldcup-decisions-2026-05-21

먼저 읽을 문서:
- docs/handoff/active/SUNGJUN_APP_HANDOFF_2026-06-22.md
- docs/engineering/INTERFACE_CONTRACT.md
- docs/engineering/COLLABORATION.md
- docs/handoff/active/OVERNIGHT_PROGRESS_HANDOFF.md
- docs/plans/2026-06-22-overnight-completion-audit.md
- docs/plans/2026-06-22-overnight-external-completion-gates.md
- docs/plans/2026-06-22-booting-visual-redesign-execution-plan.md

작업 원칙:
1. production Supabase, production Vercel, 실제 Toss 결제는 건드리지 마.
2. `lib/types.ts`, `lib/supabase.ts`, `lib/constants.ts`, `supabase/migrations/`는 공용 영역이므로 수정 전 영향 범위를 보고해.
3. 현재 브랜치와 dirty state를 먼저 확인하고, 사용자 변경을 되돌리지 마.
4. mock provider 기준으로 로컬 UI를 먼저 검증해.
5. Toss sandbox는 env가 있을 때만 진행하고, secret은 문서/코드에 쓰지 마.
6. `preference_weights` 4개/7개, 데일리카드 직접 뽑기/자동분배, 보증금 결제 시점은 임의 확정하지 말고 합의 필요로 보고해.

로컬 실행:
```powershell
npm install
copy .env.local.example .env.local
npm run dev -- -p 3004
```

확인할 화면:
- http://localhost:3004/dev/preview
- http://localhost:3004/
- http://localhost:3004/match
- http://localhost:3004/group/create
- http://localhost:3004/notifications
- http://localhost:3004/profile/basic
- http://localhost:3004/profile/worldcup
- http://localhost:3004/profile/preferences
- http://localhost:3004/profile/schedule
- http://localhost:3004/profile/match-card
- http://localhost:3004/match/dev-match-pending
- http://localhost:3004/match/dev-match-1

검증 명령:
```powershell
npm run typecheck
npm run lint
npm run test:config
npm run test:profile
npm run test:matching
npm run check:payment-env
```

Toss sandbox 준비가 되었을 때만:
```powershell
npm run check:payment-env -- --provider=toss
```

보고 형식:
1. 현재 브랜치를 정상적으로 받았는지
2. 로컬에서 어떤 화면이 정상 렌더링되는지
3. 충돌 위험이 있는 파일
4. 결제/env에서 막힌 부분
5. DB/API/정책 합의가 필요한 부분
6. 발표 전 바로 고치면 좋은 UI 문제
7. 다음 커밋/PR 추천 단위
```

---

## 12. 한 줄 요약

성준은 이 브랜치를 "완성된 운영앱"으로 보면 안 되고, "로컬에서 거의 전체 흐름을 눌러보며 발표 준비와 최종 합의 항목을 좁히는 기준선"으로 보면 된다.

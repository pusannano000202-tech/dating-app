# 2026-06-12 대화 컨텍스트 종합 감사

작성일: 2026-06-12  
기준: 현재 로컬 repo, 사용자 확정 결정, 로컬 검증 결과

## 결론

지금 프로젝트는 화면과 핵심 로직이 많이 구현되어 있지만, "서비스 완성" 상태는 아니다. 앞으로는 새 기능을 바로 붙이기보다 현재 결정을 기준으로 흐름을 고정하고, 충돌 문서와 legacy 결제/환불 구조를 정리해야 한다.

가장 중요한 최신 결정은 아래 4개다.

1. `/dev/preview`에서는 로그인에 막히지 않고 앱 화면을 바로 볼 수 있어야 한다.
2. 매칭 가중치는 4개만 유지한다: 외모, 성격, 키, 체형.
3. 데일리카드는 16:00-20:00 사이에 사용자가 직접 카드를 뽑는 방식으로 간다.
4. 초기 배포는 전면 무료 베타다. 보증금, 환불, 매칭비 정산 UX는 사용자 확보 이후로 미룬다.

## 이번 반영 사항

### 1. Preview 로그인 막힘 해소

- `middleware.ts`가 `/dev/preview` 진입 시 `booting_dev_auth=1` 쿠키를 발급한다.
- `app/profile/basic/page.tsx`, `app/profile/worldcup/page.tsx`, `app/profile/survey/page.tsx`는 dev preview 세션이면 Supabase user가 없어도 다음 단계로 진행한다.
- `lib/dev-match-setup.ts`는 localStorage뿐 아니라 `booting_dev_auth=1` 쿠키도 dev preview 세션으로 인정한다.
- `tests/config/booting-branding.test.ts`에 preview auth 회귀 테스트를 추가했다.

검증:

- 브라우저에서 `http://localhost:3003/dev/preview` 진입
- "이상형 월드컵" 클릭
- 결과: `http://localhost:3003/profile/worldcup`
- 로그인 텍스트 없음
- 월드컵 화면 렌더링: `64강`, `어떤 사람이 더 끌려?`, 이미지 2개 확인

주의:

- `npm run build`를 dev server가 켜진 상태에서 실행하면 `.next`가 production build로 덮여 기존 dev server의 chunk가 깨질 수 있다.
- build 후 로컬 화면 검증을 계속하려면 dev server를 재시작해야 한다.

### 2. 매칭 가중치 4개로 정리

현재 기준:

- `appearance`
- `personality`
- `height`
- `body_type`

반영된 영역:

- `lib/types.ts`
- `lib/matching/types.ts`
- `lib/matching/group-summary.ts`
- `app/profile/preferences/page.tsx`
- `components/profile/PreferenceWeightInputs.tsx`
- `components/profile/PreferenceSliders.tsx`
- `components/profile/PreferenceRecipePreview.tsx`
- `tests/matching/core.test.ts`
- `docs/engineering/INTERFACE_CONTRACT.md`

남은 확인:

- live DB에서 batch runner가 `preference_weights`를 읽어 `MatchingPreferenceWeights`로 변환하는 경로는 별도 확인이 필요하다.
- API readiness는 현재 `preference_weights != null` 중심이라, 4개 key 유효성 검증은 아직 약하다.

### 3. 데일리카드 정책

현재 결정:

- 09:00 자동 공개가 아니다.
- 매일 16:00-20:00 사이 사용자가 직접 카드를 뽑는다.
- 놓친 카드는 forfeited 처리하는 방향이다.

관련 파일:

- `app/api/matches/[id]/daily-cards/route.ts`
- `app/match/[id]/page.tsx`
- `supabase/migrations/20260602_z54_daily_card_draw_policy.sql`
- `docs/product/matching/DAILY_CARD_SPEC_2026-05-28.md`
- `docs/product/matching/SUNGJUN_DAILY_CARD_HANDOFF_2026-06-01.md`
- `docs/SUNGJUN_MEETING_AGENDA_2026-06-01.md`

남은 확인:

- `z54` migration이 실제 Supabase 프로젝트에 적용됐는지 확인해야 한다.
- 실제 로그인 계정으로 카드 뽑기, 중복 방지, 시간 외 차단, missed 처리 E2E 검증이 필요하다.

### 4. 무료 베타 정책

현재 결정:

- 초기 배포는 무료다.
- 사용자에게 보증금/환불/매칭비 정산을 요구하지 않는다.
- 기존 deposit/refund DB와 RPC는 legacy compatibility로 남겨두되, 화면 문구는 무료 베타 기준으로 바꾼다.

반영된 영역:

- `lib/constants.ts`: `FREE_BETA_ENABLED = true`
- `app/page.tsx`
- `app/dev/preview/page.tsx`
- `app/group/create/page.tsx`
- `app/match/[id]/page.tsx`
- `app/match/[id]/continuation/page.tsx`
- `app/match/[id]/refund/page.tsx`
- `app/notifications/page.tsx`

남은 작업:

- DB/RPC 이름과 구조는 아직 deposit/refund 중심이다.
- 진짜 무료 베타로 정리하려면 별도 migration에서 deposit gate를 participation confirmation 구조로 바꾸는 게 맞다.

## 현재 검증 결과

2026-06-12 로컬에서 직접 확인한 결과:

| 명령 | 결과 |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run test:config` | PASS, 22/22 |
| `npm run test:matching` | PASS, 22/22 |
| `npm run build` | PASS, 48 pages generated |

브라우저 검증:

- `http://localhost:3003/dev/preview` 정상 진입
- `이상형 월드컵` 클릭 후 `/profile/worldcup` 유지
- 로그인으로 튕기지 않음
- 월드컵 이미지 2개 렌더링 확인

## 현재 충돌 목록

### A. 인증 방식

- AGENTS/초기 정의: 휴대폰 OTP
- 현재 코드/테스트: Supabase email OTP, phone provider disabled
- 현재 작업 결정: 디자인 검토는 `/dev/preview`로 우회

정리:

- 지금은 "휴대폰 OTP 완료"라고 말하면 안 된다.
- 디자인 검토는 dev preview로 진행하고, 실제 인증 방식 결정은 별도 phase로 빼야 한다.

### B. 가중치 계약

- 과거 문서: 학교, 취미, 시간대 포함 가능
- 최신 결정: 외모, 성격, 키, 체형 4개만 유지

정리:

- UI와 타입은 4개 기준으로 맞췄다.
- batch loader와 DB 유효성 검증은 다음 작업에서 확인해야 한다.

### C. 데일리카드 시간

- 과거 문서: 09:00 자동 공개
- 최신 결정: 16:00-20:00 사용자 직접 뽑기

정리:

- 09:00 문구는 stale로 봐야 한다.
- 사용자 주도 draw window가 최신 정책이다.

### D. 결제/환불

- 과거 구현: 보증금, 환불, 매칭비 정산
- 최신 결정: 전면 무료 베타

정리:

- 화면은 무료 베타 기준으로 바꿨다.
- DB/RPC legacy 구조는 남아 있으므로 cleanup migration이 필요하다.

## Git 상태 주의

현재 working tree는 매우 dirty하다. 여러 대화에서 만든 변경과 미추적 파일이 섞여 있다.

중요 미추적/신규 파일 예:

- `app/dev/`
- `app/match/start/`
- `components/matching/`
- `components/profile/PreferenceRecipePreview.tsx`
- `components/profile/PreferenceWeightInputs.tsx`
- `lib/dev-auth.ts`
- `lib/dev-match-setup.ts`
- `tests/config/booting-branding.test.ts`
- `supabase/migrations/20260602_z54_daily_card_draw_policy.sql`

따라서 다음 단계는 기능 추가가 아니라 변경 묶음 정리다.

## 다음 작업 순서 제안

1. 현재 변경을 기능 묶음별로 나눈다.
   - preview/dev auth
   - preference 4-key
   - free beta
   - daily card draw policy
   - group/queue UI
   - docs cleanup

2. 각 묶음마다 최소 검증 명령을 정한다.
   - 공통: `npm run typecheck`, `npm run lint`
   - 매칭: `npm run test:matching`
   - 환경/preview: `npm run test:config`
   - 화면: browser로 실제 URL 확인

3. Supabase 적용 여부를 별도 체크한다.
   - migration 파일 존재와 실제 프로젝트 적용은 다르다.
   - `z54`와 무료 베타 cleanup은 특히 별도 확인이 필요하다.

4. 성준과 나눌 작업을 파일 경계로 정한다.
   - 충현/Codex: profile, preference, worldcup, preview, docs
   - 성준: group, match engine, match pool, Supabase migrations
   - 공용 리뷰 필수: `lib/types.ts`, `docs/engineering/INTERFACE_CONTRACT.md`, `supabase/migrations/`

## 최종 판단

지금 상태는 "로컬에서 주요 흐름을 볼 수 있는 개발 중 앱"이다.  
다만 실제 서비스라고 말하려면 Supabase migration 적용, 실제 인증, live DB batch runner, 무료 베타 DB 정리, 친구 초대 E2E 검증이 아직 남아 있다.

당장 다음 작업은 디자인을 계속 만질 수 있게 preview 흐름을 유지하면서, dirty working tree를 기능 단위로 정리하는 것이다.

# 2026-06-22 Booting 프론트 전체 리디자인 실행 계획

> 목적: 사용자가 제공한 레퍼런스 이미지의 색감과 앱 감성을 Booting 앱 전체에 반영한다. 이번 작업은 단순 문구 수정이 아니라 `처음 들어온 사용자가 눌러보고 싶게 보이는 모바일 앱 화면`으로 바꾸는 작업이다.

## 1. 한 줄 결론

현재 프론트는 기능과 gate 정리는 많이 됐지만, 사용자가 준 레퍼런스처럼 보이지 않는다.
따라서 다음 실행은 `디자인 리빌드 Phase`로 진행한다.

핵심 방향:

- 크림/종이톤 배경.
- 딥 브라운/블랙 메인 카드.
- 코랄-오렌지 포인트.
- 큰 여백과 둥근 모바일 카드.
- 하단 탭 중심의 앱 느낌.
- 매칭 결과 화면에는 `Chemi` 원형 점수, 단계별 공개 카드, 상대팀 비공개 상태를 명확히 표현.
- 기능을 숨기는 예쁜 화면이 아니라, 사용자가 지금 무엇을 해야 하는지 한눈에 보이는 화면.

## 2. 반드시 먼저 고칠 P0 버그

### 2.1 이상형 월드컵 성별 반전 버그

문제:

- 사용자가 기본정보에서 `남자`로 저장했는데 이상형 월드컵에서 남자 후보가 뜬다.
- 남자 사용자는 여자 후보가 떠야 한다.
- 여자 사용자는 남자 후보가 떠야 한다.

가장 유력한 원인:

- DB 또는 dev fallback에서 성별 값이 `male/female`이 아니라 `남자/여자` 또는 다른 값으로 들어오는 경우를 월드컵 페이지가 정규화하지 못한다.
- 현재 `app/profile/worldcup/page.tsx`는 `gender === 'male' ? 'female' : 'male'` 방식이라, `남자`가 들어오면 `male`이 아니므로 남자 후보가 뜰 수 있다.

수정 기준:

- `lib/gender.ts` 같은 작은 helper를 만든다.
- `male`, `남자`, `man`, `m`은 `male`로 정규화한다.
- `female`, `여자`, `woman`, `f`는 `female`로 정규화한다.
- 정규화 실패 시 월드컵으로 보내지 말고 기본정보 보완 안내를 띄운다.
- 테스트로 고정한다.

수정 예상 파일:

- `lib/gender.ts` 신규.
- `app/profile/worldcup/page.tsx` 수정.
- `components/profile/BasicInfoForm.tsx` 저장값 확인.
- `tests/profile/gender-normalization.test.ts` 신규.
- `tsconfig.profile-tests.json` 필요 시 include 확인.

완료 기준:

- `남자`, `male` 모두 여자 후보 pool을 연다.
- `여자`, `female` 모두 남자 후보 pool을 연다.
- `npm run test:profile`에서 성별 반전 테스트가 통과한다.

## 3. 결제 env/key 현재 상태

성준이 넘긴 것은 `필요한 env 이름과 결제 구조`다.
실제 비밀 key 값은 현재 이 로컬 `.env.local`에 없다.

현재 필요한 값:

```env
NEXT_PUBLIC_TOSS_CLIENT_KEY=
TOSS_SECRET_KEY=
PAYMENT_INTERNAL_SECRET=
SUPABASE_SERVICE_ROLE_KEY=
```

주의:

- `NEXT_PUBLIC_TOSS_CLIENT_KEY`만 프론트에 노출 가능.
- `TOSS_SECRET_KEY`, `PAYMENT_INTERNAL_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`는 서버 전용.
- 실제 값은 문서, 테스트, GitHub에 넣지 않는다.
- 이번 리디자인 작업에서 production Toss/Supabase/Vercel은 건드리지 않는다.
- 결제 화면은 `mock/local review`와 `Toss 설정 필요` 상태를 사용자가 이해하게만 만든다.

## 4. 레퍼런스 이미지에서 가져올 디자인 언어

사용자가 준 이미지 기준:

- 배경: 밝은 크림/아이보리, 약한 핑크 기운.
- 화면 가장자리: 모바일 앱 프레임처럼 둥글고 여백이 넓다.
- 메인 카드: 딥 브라운/블랙, 그림자 강함, 카드 높이 큼.
- 액센트: 코랄에서 오렌지로 흐르는 라인.
- 글자: 굵고 큰 검정 제목, 회색 보조 설명.
- 매칭 점수: 원형 링 그래프, 중앙 숫자, `CHEMI` 라벨.
- 상대팀: 이름/학과/인원은 단계적으로 공개, 처음에는 물음표/잠금.
- 하단 탭: 홈, 매칭, 채팅, 마이. 활성 탭은 코랄.

색상 기준:

| 용도 | 색 |
| --- | --- |
| 앱 배경 | `#F8F3EC` |
| 카드 흰색 | `#FFFDF8` |
| 딥 카드 | `#211B17` |
| 딥 카드 보조 | `#2B211C` |
| 메인 코랄 | `#FF4F5F` |
| 오렌지 | `#FF7548` |
| 흐린 베이지 | `#EFE8DF` |
| 텍스트 검정 | `#171412` |
| 보조 텍스트 | `#8A8178` |
| 선 | `#E8DED4` |

하지 말 것:

- 성준 UI를 그대로 복붙하지 않는다.
- 보라/회색/기본 Tailwind 느낌으로 돌아가지 않는다.
- 큰 설명 카드만 나열하지 않는다.
- 매칭 찾기 전 상대 정보를 결과처럼 보여주지 않는다.
- DB/API를 디자인 작업 핑계로 임의 변경하지 않는다.

## 5. 화면별 목표

### 5.1 홈 `/`

목표:

- 첫 화면은 `오늘의 매칭` 앱처럼 보여야 한다.
- 사용자가 “여기가 메인 앱이구나”라고 느껴야 한다.

구성:

- 상단: 인사말 + `오늘의 매칭` 제목 + 원형 아바타.
- 메인 딥 카드: 내 그룹 상태.
  - 그룹명.
  - 멤버 아바타 점.
  - `매칭 탐색 중` 또는 `준비 필요`.
  - 진행 바: `팀 성향 분석 3/4 완료`.
- 추천 상대팀 카드:
  - 매칭 찾기 전에는 `추천 상대팀`을 결과처럼 보여주지 않는다.
  - 큐 진입/가매칭 이후에는 잠금 상태로 `프로필은 매칭 확정 후 공개돼요`.
- 하단 탭 고정.

수정 예상 파일:

- `app/page.tsx`
- `components/matching/HomeTodayTaskCard.tsx`
- `components/matching/CurrentGroupPreview.tsx`
- 신규 가능: `components/matching/BootingHomeHero.tsx`

### 5.2 매칭 `/match`

목표:

- 매칭 화면은 홈과 중복되지 않고 `매칭 진행 상황`에 집중한다.

상태별 화면:

- 준비 전: 무엇이 부족한지 카드로 보여줌.
- 큐 진입 전: 친구/성향/시간/비중/사전카드 완료율 표시.
- 가매칭: 상대팀 상세는 잠금, `보증금 결제 후 확정` 안내.
- 확정: Chemi 점수, 학과/나이대/성별 구성 단계 공개.

수정 예상 파일:

- `app/match/page.tsx`
- `components/matching/CurrentGroupPreview.tsx`
- 신규 가능: `components/matching/ChemiRing.tsx`
- 신규 가능: `components/matching/LockedOpponentCard.tsx`

### 5.3 매칭 상세 `/match/dev-match-pending`, `/match/dev-match-1`, `/match/[id]`

목표:

- 사용자가 준 첫 번째 이미지처럼 `매칭됐어요!` 화면을 만든다.
- `Chemi 70` 같은 원형 점수와 정보 pill을 중심으로 구성한다.

구성:

- 상단: `MATCH FOUND`.
- Chemi 원형 링.
- 큰 제목: `매칭됐어요!`
- 정보 pill:
  - 학과.
  - 나이대.
  - 성별 구성.
- 잠금 카드:
  - `상대팀 이름은 아직 비공개예요`.
  - `날짜를 정하고, 만남 전까지 하루씩 Q&A로 알아가요`.
- CTA:
  - pending: `보증금 결제하고 확정하기`.
  - confirmed: `오늘의 카드 확인하기`, `채팅 열기`.

수정 예상 파일:

- `app/match/[id]/page.tsx`
- `components/matching/DailyCardHintWizard.tsx`
- 신규 가능: `components/matching/MatchFoundSummary.tsx`
- 신규 가능: `components/matching/ChemiRing.tsx`

### 5.4 그룹 `/group/create`

목표:

- “친구가 들어오고 준비 완료되면 매칭 가능”이 직관적으로 보여야 한다.
- 임시로 친구가 로그인 안 해도 그룹에 들어간 것처럼 보이면 안 된다.

구성:

- 내 팀 카드: 딥 카드 또는 흰 카드 중 하나로 정리.
- 멤버별 상태:
  - 나: 완료/필요.
  - 친구: 수락 대기/준비 필요/준비 완료.
- 친구 자리.
- 매칭 팀 찾기 버튼은 모든 조건 완료 전에는 잠금.

수정 예상 파일:

- `app/group/create/page.tsx`
- `components/matching/group-create/GroupHeader.tsx`
- `components/matching/group-create/GroupMemberStatusPanel.tsx`
- `components/matching/group-create/FriendListPanel.tsx`
- `components/matching/group-create/InviteFriendPanel.tsx`
- `components/matching/group-create/FreeBetaQueuePanel.tsx`

### 5.5 알림 `/notifications`

목표:

- 알림은 “상태 설명 목록”이 아니라 다음 행동으로 이어지는 카드여야 한다.

구성:

- `매칭이 도착했어요`.
- `보증금 결제를 완료하면 상대 정보가 단계적으로 열려요`.
- `오늘의 카드가 열렸어요`.
- `약속이 다가오고 있어요`.

수정 예상 파일:

- `app/notifications/page.tsx`

### 5.6 내정보/기본정보 `/profile/basic`, `/profile/edit`

목표:

- 입력 화면도 레퍼런스 톤과 맞춘다.
- 디자인보다 먼저 성별 저장/월드컵 분기 버그를 고친다.

구성:

- 큰 제목.
- 흰색 rounded input cards.
- 학과 검색은 단과대명이 아래에 보이는 후보 리스트 유지.
- 성별 버튼은 선택 상태가 명확해야 한다.

수정 예상 파일:

- `components/profile/BasicInfoForm.tsx`
- `app/profile/basic/page.tsx`
- `app/profile/edit/page.tsx`

## 6. 공통 컴포넌트 정리

새로 만들 후보:

| 파일 | 역할 |
| --- | --- |
| `components/ui/BottomTabBar.tsx` | 홈/매칭/채팅/마이 하단 탭 |
| `components/ui/BootingMobileShell.tsx` | 크림 배경, 최대 폭, 하단 탭 여백 통일 |
| `components/matching/ChemiRing.tsx` | 원형 Chemi 점수 |
| `components/matching/DarkTeamProgressCard.tsx` | 레퍼런스의 검은 내 팀 카드 |
| `components/matching/LockedOpponentCard.tsx` | 상대팀 잠금 카드 |
| `components/matching/MatchFoundSummary.tsx` | 매칭됐어요 상세 헤더 |

기존 공통 UI 보강:

- `components/ui/PageShell.tsx`
- `components/ui/Button.tsx`
- `components/ui/Card.tsx`
- `components/ui/Chip.tsx`

## 7. 작업 순서

### Task 1. P0 성별 정규화와 월드컵 반전 테스트

- `lib/gender.ts` 추가.
- `app/profile/worldcup/page.tsx`에서 `normalizeGender()` 사용.
- `tests/profile/gender-normalization.test.ts` 추가.
- 실행:

```powershell
npm run test:profile
```

기대:

- 남자 입력은 여자 후보.
- 여자 입력은 남자 후보.

### Task 2. 공통 디자인 토큰과 shell 구축

- `tailwind.config.ts`의 boot 색상을 레퍼런스 기준으로 조정.
- `app/globals.css`에 아래 utility를 추가.
  - `booting-paper`
  - `booting-deep-card`
  - `booting-bottom-nav`
  - `booting-chemi-gradient`
- `BootingMobileShell`, `BottomTabBar` 추가.

검증:

```powershell
npm run typecheck
npm run lint
```

### Task 3. 홈 리디자인

- `/`를 레퍼런스 두 번째 이미지 톤으로 재구성.
- 딥 카드와 추천 상대팀 잠금 카드를 사용.
- 홈에서 결과처럼 보이는 상대 상세 노출 금지.

검증:

```powershell
npm run check:routes -- --base=http://localhost:3004
```

### Task 4. 매칭 리스트/상세 리디자인

- `/match`는 매칭 진행 상태 중심.
- `/match/[id]`는 Chemi 링과 `매칭됐어요!` 구조.
- pending/confirmed 상태별 CTA 분리.

검증:

```powershell
npm run test:matching
npm run check:routes -- --base=http://localhost:3004
```

### Task 5. 그룹/알림/프로필 화면 톤 맞춤

- `/group/create` 멤버 상태 카드 정리.
- `/notifications` 알림 카드 정리.
- `/profile/basic`, `/profile/edit` 입력 카드 톤 정리.

검증:

```powershell
npm run test:config
npm run test:profile
npm run check:routes -- --base=http://localhost:3004
```

### Task 6. 전체 검증과 눈검수

실행:

```powershell
npm run typecheck
npm run lint
npm run test:config
npm run test:profile
npm run test:matching
npm run build
```

로컬 확인:

```powershell
npm run dev -- -p 3004
npm run check:routes -- --base=http://localhost:3004
```

눈검수 route:

- `http://localhost:3004/dev/preview`
- `http://localhost:3004/`
- `http://localhost:3004/match`
- `http://localhost:3004/group/create`
- `http://localhost:3004/notifications`
- `http://localhost:3004/profile/basic`
- `http://localhost:3004/match/dev-match-pending`
- `http://localhost:3004/match/dev-match-1`

## 8. 완료 기준

완료라고 부르려면 아래가 모두 맞아야 한다.

- 남자 프로필이면 이상형 월드컵에서 여자 후보가 뜬다.
- 여자 프로필이면 이상형 월드컵에서 남자 후보가 뜬다.
- 홈 첫 화면이 레퍼런스 이미지처럼 크림톤 + 딥 카드 + 코랄 포인트 중심으로 보인다.
- `/match/dev-match-1` 또는 확정 매칭 상세에 Chemi 원형 점수와 `매칭됐어요!` 흐름이 보인다.
- 하단 탭이 홈/매칭/채팅/마이 구조로 일관된다.
- 매칭 찾기 전 상대 상세가 결과처럼 보이지 않는다.
- pending 단계에서는 상대팀 이름/상세가 잠겨 있다.
- confirmed 단계에서만 상대 정보가 단계적으로 보인다.
- 결제 key가 없을 때 화면이 깨지지 않고 `Toss 설정 필요` 또는 mock 상태로 자연스럽게 보인다.
- 모바일 폭에서 글자/버튼/하단 탭이 겹치지 않는다.
- `typecheck`, `lint`, `test:config`, `test:profile`, `test:matching`, `build`, `check:routes`가 통과한다.

## 9. 실행 시 금지사항

- production Supabase 수정 금지.
- production Vercel 수정 금지.
- 실제 Toss 결제 호출 금지.
- `TOSS_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` 같은 비밀값을 문서/코드/Git에 쓰기 금지.
- `supabase/migrations`, `lib/types.ts`, `lib/supabase.ts`는 디자인 작업 중 임의 수정 금지.
- 성준 디자인을 코드째 복붙 금지.
- DB 스키마 합의가 필요한 항목을 디자인 작업에 끼워 넣기 금지.

## 10. 한 번에 실행시키는 명령 프롬프트

아래를 그대로 새 명령으로 보내면 된다.

```text
팀장방, docs/plans/2026-06-22-booting-visual-redesign-execution-plan.md 기준으로 Booting 프론트 전체 리디자인 Phase를 시작해.

이번 작업의 1순위는 P0 버그 수정이야:
- 남자 프로필이면 이상형 월드컵에 여자 후보가 떠야 함
- 여자 프로필이면 이상형 월드컵에 남자 후보가 떠야 함
- 한글 성별값 남자/여자와 영문 male/female을 모두 정규화해서 처리해
- 테스트를 추가해서 회귀 방지해

그 다음 레퍼런스 이미지 색감대로 전체 프론트 디자인을 바꿔:
- 크림/종이톤 배경
- 딥 브라운/블랙 메인 카드
- 코랄-오렌지 포인트
- 큰 여백과 둥근 모바일 카드
- Chemi 원형 점수
- 홈/매칭/채팅/마이 하단 탭
- 매칭 전 상대 상세 잠금
- 확정 후 단계 공개

대상 화면:
- /
- /match
- /group/create
- /notifications
- /profile/basic
- /profile/edit
- /match/dev-match-pending
- /match/dev-match-1
- /match/[id]

production Supabase, production Vercel, 실제 Toss 실결제는 건드리지 마.
Toss env 실제 key가 없으면 화면에는 mock/local review 또는 Toss 설정 필요 상태로 자연스럽게 보여줘.
supabase/migrations, lib/types.ts, lib/supabase.ts는 건드리지 마.

수정 후 반드시 검증해:
- npm run typecheck
- npm run lint
- npm run test:config
- npm run test:profile
- npm run test:matching
- npm run build
- npm run check:routes -- --base=http://localhost:3004

로컬 서버가 필요하면 3004로 띄워줘.
마지막에는 어떤 화면이 어떻게 바뀌었는지, 아직 성준/사용자 합의가 필요한 항목, 커밋에 넣을 파일과 보류할 파일을 보고해.
커밋은 staged diff 요약 보고 후 진행해.
```

## 11. 추천 커밋 단위

1. `fix: normalize profile gender for worldcup`
2. `feat: add booting mobile visual system`
3. `feat: redesign home and matching surfaces`
4. `feat: polish group notifications and profile surfaces`

한 번에 너무 많이 커밋하지 말고, 최소한 `성별 버그 수정`과 `디자인 리빌드`는 분리한다.

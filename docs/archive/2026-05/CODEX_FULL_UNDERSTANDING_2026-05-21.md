# Codex 가 이해하는 부산대 과팅앱 (Destiny) — 전체 정보

> 작성자: Codex
> 작성일: 2026-05-21
> 목적: Claude 문서(`docs/CLAUDE_FULL_UNDERSTANDING_2026-05-21.md`)와 같은 섹션 번호로 비교해, 두 AI가 같은 프로젝트를 같은 방식으로 이해하는지 점검
> 원칙: 현재 repo 상태를 1순위로 보고, 문서와 코드가 다르면 "차이"로 명시한다. 모르는 것은 "모름"으로 적는다.

---

## 0. 문서 사용 규칙

1. 이 문서는 Codex가 현재 workspace에서 확인한 사실, 최근 작업 맥락, 추론, 모르는 것을 한곳에 적는다.
2. 섹션 번호는 Claude 문서와 맞춘다. 섹션 번호를 바꾸면 비교가 어려워진다.
3. 사실과 해석을 분리한다. 코드/파일로 확인한 것은 "확인", 추론은 "추정", 알 수 없는 것은 "모름"으로 표기한다.
4. 현재 repo가 문서보다 최신인 부분이 있다. 특히 온보딩 순서, 자기유사 월드컵 제거, 랜딩 매칭 시각화, 친구 기반 그룹 생성은 Claude 문서와 다르다.
5. 이 문서는 최종 계획서가 아니라 "전체 이해도 점검용 입력"이다. 합의된 내용만 이후 master plan/source of truth로 승격해야 한다.

---

## 1. 프로젝트 정체성

### 1-1. 한 줄 정의

Destiny는 부산대학교 학생을 시작점으로 하는 친구 기반 그룹 과팅 매칭 앱이다.

사용자는 혼자 상대를 스와이프하지 않는다. 자기 프로필을 완성하고, 친구를 추가하고, 2~3명 그룹을 만든 뒤, 보증금을 걸고 주간 매칭 큐에 들어간다. 시스템은 상대 그룹, 시간, 장소를 자동으로 확정한다.

### 1-2. 핵심 차별점

| 일반 데이팅앱 | Destiny |
|---|---|
| 개인 1:1 매칭 | 친구 기반 2:2~3:3 그룹 매칭 |
| 사용자가 계속 탐색/스와이프 | 시스템이 주 1회 배치로 자동 매칭 |
| 프로필/사진을 먼저 봄 | 만남 전까지 상대 그룹 세부 정보 비공개 |
| 무료 사용 후 유료 기능 | 보증금 기반 노쇼 방지 |
| 채팅으로 약속 조율 | 시간/장소 자동 확정 |
| 외모/점수 노출 위험 | raw 점수/벡터는 사용자에게 노출 금지 |

### 1-3. 브랜드

- 앱명: Destiny
- 컨셉: 운명, 붉은 실, 자동으로 연결되는 만남
- 현재 구현 톤: 어두운 배경, 보라/로즈 계열, glass UI, DestinyLogo
- Codex 판단: "실시간 주변 탐색"보다 "이번 주 매칭 큐에 들어가는 설렘"이 이 앱의 실제 구조에 더 맞다.

### 1-4. 비즈니스 모델

- 확인된 정책: 1인 보증금 2만원
- 노쇼/프로필 불일치 시 분쟁 처리 및 보증금 배분
- 운영 수익 구조: 모름. 현재는 보증금이 노쇼 방지 장치로 정의되어 있고, 플랫폼 수수료/운영 수익은 확정된 문서를 확인하지 못했다.

---

## 2. 팀 구성과 협업

### 2-1. 사람/역할

| 이름 | Codex 이해 |
|---|---|
| 충현 | 사용자. 기획 총괄, 프로필/외모/월드컵/매칭 인수 작업을 주도. Codex에게 구현과 문서 정리를 지시. |
| 성준 | 원래 그룹/매칭/장소 쪽 담당으로 보이나, 최근 맥락상 성격 파트와 venues/맛집 DB 쪽을 맡는 흐름이 있음. 정확한 최신 분담은 합의 필요. |

### 2-2. AI/외부 도구

| 도구 | Codex 이해 |
|---|---|
| Codex | 현재 repo 코드 수정, 이미지 메타데이터 검수, 이상형 월드컵 64장 구성, 그룹/매칭 UI 일부 구현, 이해 문서 작성 |
| Claude | 충현 세션에서 전체 이해 문서 작성. 일부 내용은 현재 코드보다 오래된 상태일 수 있음 |
| Manus | 이미지 생성/디자인 보조. 여자 이상형 이미지 추가 생성에 관여했고, 남자 이상형 이미지 생성 프롬프트도 전달 대상 |

### 2-3. 협업 문서

- `docs/INTERFACE_CONTRACT.md`: 충현/성준 영역 계약
- `docs/MATCHING_SYSTEM_PLAN.md`: 매칭 시스템 구현 계획
- `docs/handoff/SUNGJUN_PERSONALITY_VECTOR_HANDOFF.md`: 성격 선호 벡터 성준 인수인계
- `docs/CLAUDE_FULL_UNDERSTANDING_2026-05-21.md`: Claude 이해 문서
- 이 문서: Codex 이해 문서
- `docs/UNDERSTANDING_REVIEW_ROOM_2026-05-21.md`: Claude/Codex/충현 평가용 대화방

### 2-4. 현재 분담에 대한 Codex 판단

확인된 현재 작업은 충현/Codex 쪽이 그룹 생성 UI, 친구 관계 모델, 매칭 큐 UI, 온보딩 순서까지 건드리고 있다. 따라서 `app/group/`, matching core migration도 실제로는 충현/Codex가 인수해 작업 중이다.

단, 성준의 venues/match_meetings, 성격 선호 설문/벡터, 맛집 DB 작업의 최신 상태는 Codex가 직접 확인하지 못했다.

---

## 3. 버전 히스토리

Claude 문서의 v1.0~v1.5 요약은 큰 방향에서 맞는 것으로 보인다.

Codex가 추가로 확인한 2026-05-21 이후 변경:

| 시점 | 변경 |
|---|---|
| 2026-05-20~21 | 여자 이상형 월드컵 최종 64장 사용 세트 구성 |
| 2026-05-21 | `self-worldcup` UI/route/component 삭제 |
| 2026-05-21 | 온보딩 순서 `기본정보 -> 이상형월드컵 -> 사진 -> 성격 -> 시간대 -> 가중치`로 변경 |
| 2026-05-21 | 월드컵 결과는 primary/secondary 유형만 사용자에게 보여주는 방식으로 수정 |
| 2026-05-21 | 같은 유형끼리 초반부터 싸우지 않도록 `pairUpBucketAware` 구현 |
| 2026-05-21 | `/group/create`를 친구 기반 그룹 생성 UI로 교체 |
| 2026-05-21 | 랜딩 `MatchingPool`을 오브/점 시각화에서 주간 매칭 큐 UI로 변경 |

모름:

- 루트의 `부산대_과팅앱_v1.5_정의서.md` 최종 내용은 이번 대조에서 직접 열람하지 않았다.
- GitHub 원격의 최신 main과 로컬 dirty worktree 사이 최종 병합 상태는 확정하지 않았다.

---

## 4. 브랜드 / 디자인

### 4-1. 유지되는 디자인 언어

- 어두운 배경
- violet/rose 계열
- glass UI
- gradient button
- DestinyLogo
- Lucide 아이콘 사용
- 작은 모바일 중심 인터페이스

### 4-2. Claude 문서와 다른 부분

Claude 문서에는 랜딩 주요 시각화로 Soul Orbs가 남아 있다. 현재 Codex는 사용자의 피드백을 반영해 점/orb 형태가 설렘을 주지 못한다고 판단했고, `components/MatchingPool.tsx`를 "주간 매칭 큐" UI로 교체했다.

현재 구현:

- `주간 매칭 큐`
- `이번 주 대기 그룹`
- `토요일 14:00`
- 남자/여자 그룹 수
- 2:2/3:3 그룹 라인
- 상대 정보 잠금 메시지

### 4-3. 디자인 원칙

이 앱은 "근처 사람 실시간 탐색"이 아니라 "친구 그룹을 만들고 주간 배치에 들어가는 구조"다. 그래서 화면도 레이더/점/실시간 오브보다 큐, 티켓, 잠금 카드, 발표 시각, 그룹 준비 상태가 더 정확하다.

---

## 5. 기술 스택

| 레이어 | 확인/이해 |
|---|---|
| Frontend | Next.js 14 App Router |
| UI | Tailwind CSS, Lucide React |
| Auth | Supabase Auth |
| DB | Supabase Postgres + RLS |
| Storage | Supabase Storage `photos` |
| 외모 AI | `/api/score`가 별도 AI 서버 `AI_SERVER_URL`의 `/api/score-photos`로 프록시 |
| 외모 AI 계획 | GPT Vision 기반 분석 프롬프트/스키마 문서 존재 |
| 매칭 설정 | `lib/matching/config.ts` 존재 |
| 매칭 엔진 | Python `python/matching/`은 아직 구현 파일 확인 안 됨. scipy Hungarian 계획 |
| 결제 | 토스페이먼츠 계획. 실제 연동 미구현으로 이해 |
| 알림 | PWA + 이메일 계획. 실제 구현 여부 모름 |

중요 확인 필요:

- matching migration은 여러 테이블에서 `REFERENCES users(id)`를 쓰는데, 기존 profiles migration은 `auth.users(id)`를 참조한다. repo에 `public.users` 생성 migration을 확인하지 못했다. 실제 Supabase에 public `users` 테이블이 없다면 matching migration은 실패한다.

---

## 6. 사용자 흐름

### 6-1. 현재 구현 기준 온보딩

현재 repo 기준 신규 사용자 흐름은 다음이 맞다.

```text
1. /login
2. /profile/basic
   - 성별, 나이, 키, 체형, 머리숱, 학교, 학과, 학년
   - 성별을 알아야 남자는 여자 이상형 월드컵, 여자는 남자 이상형 월드컵으로 분기 가능
3. /profile/worldcup
   - 이성 이상형 월드컵
   - 결과에서 primary/secondary 선호 유형만 보여줌
4. /profile/photos
   - 사용자 사진 업로드
   - AI 서버에 score 요청
5. /profile/survey
   - Big5 본인 성격
6. /profile/schedule
   - 가능 요일/시간대
7. /profile/preferences
   - 매칭 가중치
8. /profile/complete
9. /group/create
   - 친구 추가/초대
   - 그룹 멤버 구성
   - 보증금 결제 후 매칭 큐 진입 예정
```

### 6-2. Claude 문서와 차이

Claude 문서에는 다음 구형 흐름이 남아 있다.

```text
/profile/worldcup -> /profile/self-worldcup -> /profile/basic
```

현재 코드에서는 틀리다.

- `app/profile/self-worldcup/page.tsx`: 삭제됨
- `components/profile/AppearanceSelfWorldcup.tsx`: 삭제됨
- `components/profile/SelfWorldcupResult.tsx`: 삭제됨
- `components/profile/StepProgress.tsx`: `기본정보 -> 이상형 -> 사진 ...`

### 6-3. 남녀 월드컵 분기

현재 `app/profile/worldcup/page.tsx`는 사용자의 `gender`를 읽고 반대 성별 풀을 전달한다.

```ts
const oppositeGender = gender === 'male' ? 'female' : 'male'
```

Supabase 미설정 개발 환경에서는 기본적으로 남성 사용자로 보고 여성 월드컵을 띄운다.

---

## 7. 외모 분석 시스템

### 7-1. 점수 정의

외모 점수는 호감도 주관 점수가 아니라 백분위 개념이다. `public/appearance-self/SCORE_GUIDE.md`가 기준으로 쓰인다.

핵심:

- 50점은 평균권
- 70점대는 상위 20~30%대
- 80점 이상은 너무 강한 외모 절대점수 신호라 이상형 월드컵용 후보에서는 피하려는 정책이 있었다
- 최근 여자 이상형 월드컵은 77점 이하 사진만 사용하도록 재구성했다

### 7-2. 벡터 축

여자 13축, 남자 12축 구조로 이해한다.

여자 축:

- 귀여움
- 청순함
- 시크함
- 따뜻함
- 스타일리시함
- 건강함
- 성숙함
- 지적단정함
- 눈큼
- 부드러운인상
- 날카로운인상
- 자연스러움
- 화려함

남자 축:

- 훈훈함
- 댄디함
- 시크함
- 소년미
- 건강함
- 지적단정함
- 남성미
- 스타일리시함
- 부드러운인상
- 날카로운인상
- 체형탄탄함
- 자연스러움

### 7-3. 8 버킷

여자:

- 귀여운/동안형
- 청순/자연형
- 시크/도도형
- 따뜻한/부드러운형
- 스타일리시/화려형
- 건강/활동형
- 성숙/분위기형
- 지적/단정형

남자:

- 훈훈/부드러운형
- 댄디/단정형
- 시크/날카로운형
- 소년미/귀여운형
- 운동/건강형
- 지적/안경형
- 강한 인상/남성미형
- 스타일리시/개성형

### 7-4. 분석 출력

문서상 핵심 출력:

- `appearance_score_normalized`
- `score_confidence`
- `primary_type`
- `secondary_types`
- `appearance_vector`
- `bucket_scores`
- `visible_features`
- `photo_quality`
- `internal_notes`

사용자에게 raw 점수와 raw 벡터는 노출 금지.

### 7-5. 현재 구현 gap

`/api/score`는 AI 서버로 사진 URL을 전달하지만, 실제 AI 서버가 현재 실행/완성되어 있는지는 모름. `python/appearance/`에는 기존 모델/테스트/분석 스크립트가 있으나, GPT Vision 전체 서버 구현이 완성됐는지는 이 문서 작성 시점에 확인하지 않았다.

---

## 8. 이상형 월드컵 (이성 풀)

### 8-1. 핵심 원칙

생성 의도(`target`)와 실제 인상(`measured`)은 다를 수 있다. 매칭에는 반드시 measured 기반 벡터를 사용해야 한다.

핵심 원칙:

```text
생성은 target 기준
선별과 매칭은 measured 기준
```

### 8-2. 현재 여자 풀

현재 repo에서 확인한 사실:

- `public/appearance-ideal/METADATA.json`: female active 64장
- `public/appearance-ideal/FINAL_64_USAGE_SET.json`: 최종 사용 세트 64장
- 최종 사용 세트는 8개 유형 × 8장을 목표로 구성
- 외모 절대점수 77점 이하만 사용한다는 정책으로 재구성
- contact sheet와 보고서 존재:
  - `public/appearance-ideal/FINAL_64_USAGE_REPORT.md`
  - `public/appearance-ideal/FINAL_64_USAGE_SET.json`
  - `public/appearance-ideal/female-64/CONTACT_SHEET_FINAL_64_BY_TYPE.jpg`

주의:

- `FINAL_64_USAGE_SET.json`은 `final_bucket`이 아니라 `group_type` 필드를 사용한다.
- `METADATA.json` 안의 active female 64와 최종 사용 set은 테스트로 일치 검증한다.

### 8-3. 현재 남자 풀

현재 repo에서 확인한 사실:

- `METADATA.json`에는 male active 4개가 있다.
- `public/appearance-ideal/male-64` 파일 목록은 이 점검에서 비어 있거나 확인되지 않았다.
- 남자 이상형 월드컵 64장은 아직 완성 상태로 보지 않는다.
- Manus에게 남자 이미지 생성 프롬프트를 전달한 상태로 이해한다.

### 8-4. 토너먼트

- 64강이면 총 선택 63회
- `components/profile/IdealWorldcup.tsx`에서 `pairUpBucketAware` 사용
- 같은 `final_bucket`끼리 가능한 한 초반부터 맞붙지 않도록 함
- 각 선택은 winner/loser 벡터와 라운드 가중치로 로그화

### 8-5. 산출물

`lib/appearance/preference.ts` 기준 주요 산출:

- `preferred_appearance_vector`
- `preferred_appearance_delta_vector`
- `preferred_choice_delta_vector`
- `preferred_axis_percentile_vector`
- `preferred_axis_z_vector`
- `preferred_score_range`
- `preferred_bucket_weights`
- `worldcup_pool_mean_vector`
- `pool_axis_stats`
- `choice_logs`
- `meta`

### 8-6. 공개 결과

현재 `components/profile/IdealWorldcupResult.tsx`는 raw vector를 보여주지 않고, `preferred_bucket_weights` 기반으로 public primary/secondary 선호 유형만 보여준다.

의도:

- "당신은 X형을 가장 좋아하는 편이에요"
- "그리고 Y 분위기에도 끌리는 경향이 있어요"

### 8-7. 저장 상태

현재 DB migration에는 preferred vector 컬럼과 `worldcup_choice_logs`가 추가되어 있다. 그러나 `app/profile/worldcup/page.tsx`의 실제 저장은 아직 sessionStorage + legacy `appearance_type` 중심이다. preferred vector 전체를 Supabase에 저장하는 실제 insert/upsert는 아직 구현되지 않은 것으로 이해한다.

---

## 9. 자기유사 월드컵 (동성 풀)

### 9-1. 현재 결론

Claude 문서에는 자기유사 월드컵이 살아 있는 것으로 쓰여 있으나, 현재 repo 기준으로는 UI 흐름에서 제거됐다.

삭제 확인:

- `app/profile/self-worldcup/page.tsx`: 없음
- `components/profile/AppearanceSelfWorldcup.tsx`: 없음
- `components/profile/SelfWorldcupResult.tsx`: 없음
- `/profile/self-worldcup`: 404 확인된 적 있음

### 9-2. 남아 있는 것

개념/자산/스키마는 일부 남아 있다.

- `public/appearance-self/SCORE_GUIDE.md`
- `public/appearance-self/female/...`
- `supabase/migrations/20260515_profile_add_self_appearance_score.sql`
- `lib/types.ts`의 `self_appearance_score`
- 일부 매칭 계획 문서에서 `self_appearance_score`를 stratified pool 기준으로 사용

### 9-3. 큰 gap

매칭 설계는 여전히 `self_appearance_score`를 필요로 한다. 하지만 자기유사 월드컵 UI를 제거했으므로 이 값을 어떻게 채울지 다시 결정해야 한다.

가능한 해석:

1. 사용자 사진 GPT 분석의 절대점수로 `self_appearance_score`를 대체한다.
2. `appearance_score_normalized`를 0~100으로 환산해 stratified pool에 쓴다.
3. 자기유사 월드컵을 완전히 폐기하고 매칭 공식에서 score band 필터를 재설계한다.

Codex 권장: 자기유사 월드컵을 UI에서 빼기로 했으면, `self_appearance_score`는 사용자 사진 분석 결과에서 내부 산출해야 한다. 사용자는 절대 점수를 직접 보지 않는다.

---

## 10. 매칭 시스템

### 10-1. 핵심 구조

이 앱의 매칭은 실시간 주변 탐색이 아니다.

```text
친구 그룹 생성
-> 보증금 결제
-> 매칭 큐 진입
-> 주 1회 토요일 14:00 배치
-> hard filter
-> pairScore 계산
-> 헝가리안 알고리즘
-> 시간/장소 자동 확정
```

### 10-2. 운영 결정값

`lib/matching/config.ts` 기준:

- 보증금: 20,000원
- 배치 요일: 토요일
- 발표 시각: 14:00
- 그룹 인원: 2~3명
- Forced Match 응답 마감: 토요일 14:00 + 16시간 = 일요일 06:00
- 자동 환불: 4회 이월
- 일반 threshold: 0.45
- Forced Match threshold: 0.30
- 일반 score band: ±15
- Forced Match score band: ±25
- 비대칭 페널티: 0.3
- GPS 기본 반경: 50m
- 알림 채널: PWA + email

### 10-3. Hard filter

- 같은 성별 그룹 제외
- 그룹 인원수 다르면 제외
- 시간대 교집합 없으면 제외
- 같은 학과 제외
- 이전 매칭 페어 제외
- 보증금 미납은 pool 진입 차단
- 외모 점수대 차이가 너무 크면 제외

### 10-4. 점수 공식

계획상:

```text
base =
  0.50 * appearance
+ 0.25 * personality
+ 0.15 * score_band
+ 0.10 * preference_weight_align

pair_score = base - 0.30 * asymmetry_gap
```

외모는 A가 선호하는 벡터와 B 그룹 실제 외모 벡터, B가 선호하는 벡터와 A 그룹 실제 외모 벡터를 양방향으로 본다.

### 10-5. 구현 상태

확인:

- `lib/matching/config.ts` 존재
- core matching migration 존재
- `/group/create` UI 초안 존재

미구현/모름:

- `python/matching/engine.py` 등 헝가리안 실제 엔진은 현재 repo에서 확인되지 않음
- `app/match/[id]` 결과 화면은 확인되지 않음
- 매칭 배치 cron/관리자 실행 API는 확인되지 않음
- group create UI는 현재 local state mock이며 Supabase insert가 연결되지 않음

---

## 11. 보증금 시스템

### 11-1. 결정값

- 1인 2만원
- 전원 결제 후 그룹이 매칭 풀에 들어갈 수 있음
- 노쇼/거짓말 시 보증금 처리

### 11-2. 데이터 모델

`deposits` 테이블 계획:

- `user_id`
- `group_id`
- `amount`
- `status`: pending, paid, held, refunded, forfeited, compensated
- Toss Payments key/order id
- `distribution_to`

### 11-3. 구현 상태

마이그레이션은 존재한다. 실제 Toss Payments 연동 API/UI는 미구현으로 이해한다. `/group/create`의 버튼은 현재 "보증금 결제하고 이번 주 매칭 큐에 들어가기" CTA이며 실제 결제 동작은 연결 전이다.

---

## 12. 만남 / 출석 / 리뷰

### 12-1. 출석

계획:

- GPS 50m 기본 반경
- venues의 `checkin_radius_m`가 있으면 우선
- `attendances` 테이블에 기록
- `peer_confirmed`로 그룹 상호 인증

### 12-2. 리뷰

계획:

- 만남 후 `reviews`
- `overall_score`
- `reported_issues`
- `comment`

### 12-3. 연결

계획:

- `connections`
- 양쪽이 동의하면 연락처 공개

구현 상태:

- DB migration은 있다.
- 실제 화면과 API는 아직 미구현으로 이해한다.

---

## 13. 장소 시스템 (성준 영역)

Codex 이해:

- `venues`, `match_meetings`는 성준 영역으로 남아 있다.
- 매칭 결과가 만들어지면 `match_meetings.match_id`가 `matches.id`를 참조해야 한다.
- 부산대 근처 맛집/카페 seed, 영업시간, 좌표, 분위기 태그, 체크인 반경 등이 필요하다.

모름:

- 성준이 실제로 만든 migration/file 위치
- venues seed 수량
- match_meetings 스키마 최종 형태
- 장소 자동 배정 알고리즘 완성 여부

---

## 14. 알림 시스템

계획상 알림 채널:

- PWA push
- email

트리거로 이해하는 것:

- 매칭 큐 진입
- 토요일 14:00 매칭 성공/실패
- 실패 시 Forced Match/이월/중단 선택
- 미응답 자동 이월
- 매칭 확정
- 만남 24시간 전
- 만남 30분 전 GPS 체크인
- 4회 이월 자동 환불

구현 상태:

- `lib/matching/config.ts`에 notification config 존재
- 실제 push/email 발송 구현은 모름

---

## 15. 데이터 모델 — 전체 테이블

### 15-1. 확인된/계획된 테이블

| 테이블 | 목적 | 상태 |
|---|---|---|
| `profiles` | 사용자 프로필, Big5, 시간대, 가중치, 외모/이상형 요약 | migration 존재 |
| `photos` | 사용자 사진 URL/storage path | migration 존재 |
| `appearance_scores` | 외모 raw score 내부 저장 | migration 존재 |
| `worldcup_choice_logs` | 이상형 월드컵 선택 로그 | migration 존재 |
| `friend_requests` | 친구 추가 요청 | 2026-05-21 matching migration에 추가 |
| `friendships` | 수락된 친구 관계 | 2026-05-21 matching migration에 추가 |
| `groups` | 그룹 마스터 | migration 존재 |
| `group_members` | 그룹 멤버 | migration 존재 |
| `group_invites` | 친구를 그룹에 초대 | migration 존재, `invited_by_user_id` 추가 |
| `match_pool` | 주간 매칭 큐 진입 기록 | migration 존재 |
| `matches` | 매칭 결과 | migration 존재 |
| `deposits` | 보증금 | migration 존재 |
| `attendances` | GPS 출석 | migration 존재 |
| `reviews` | 만남 후 리뷰 | migration 존재 |
| `connections` | 만남 후 1:1 연결 동의 | migration 존재 |
| `excluded_pairs` | 같은 학과/이전 매칭 등 금지 페어 | migration 존재 |
| `venues` | 장소 DB | 성준 영역, 상태 모름 |
| `match_meetings` | 매칭별 장소/시간 확정 | 성준 영역, 상태 모름 |

### 15-2. JSONB

주요 JSONB:

- `available_timeslots`
- `preference_weights`
- `preferred_appearance_vector`
- `preferred_appearance_delta_vector`
- `preferred_choice_delta_vector`
- `preferred_axis_percentile_vector`
- `preferred_axis_z_vector`
- `preferred_score_range`
- `preferred_bucket_weights`
- `worldcup_pool_mean_vector`
- `worldcup_pool_axis_stats`
- `score_breakdown`

### 15-3. 성격 선호 모델 제안

`docs/handoff/SUNGJUN_PERSONALITY_VECTOR_HANDOFF.md`에 제안:

- `preferred_personality_vector`
- `preferred_personality_delta_vector`
- `preferred_personality_type_weights`
- `preferred_personality_primary_type`
- `preferred_personality_secondary_type`
- `personality_preference_answer_logs`
- `personality_preference_confidence`

아직 DB migration에는 반영되지 않은 것으로 이해한다.

### 15-4. 데이터 모델 위험

1. `users(id)` vs `auth.users(id)` 참조 불일치 가능성
2. 이미 적용된 DB가 있다면 기존 migration 수정만으로는 반영되지 않음. 별도 ALTER migration 필요
3. `group_members_one_current_group` unique index는 MVP에는 단순하지만, 과거 그룹 기록을 보존하려면 active 상태 기반 제약으로 재설계 필요
4. `profiles_public` view는 raw vector 노출 방지 의도는 좋지만 실제 UI가 이 view를 쓰는지는 모름

---

## 16. 협업 규칙

Codex가 이해한 절대 규칙:

1. raw 외모 점수, raw 벡터, z-score, percentile은 사용자에게 노출하지 않는다.
2. 이상형 월드컵은 target이 아니라 measured vector 기준으로 매칭에 쓴다.
3. 매칭은 그룹 단위이며 개인 1:1 흐름으로 바꾸지 않는다.
4. 시스템 전체 최적화보다 최저선 threshold가 중요하다. 억지 매칭 금지.
5. 프로필/매칭/장소 사이 인터페이스 변경은 문서와 상대 담당자 확인이 필요하다.
6. 사용자가 직접 느끼는 UI에는 "점수"보다 "유형/상태/다음 행동"을 보여준다.

현재 추가된 규칙:

- 이상형 월드컵 전 성별 입력이 반드시 먼저다.
- 자기유사 월드컵은 현재 UI에서 제외한다.
- 그룹 생성은 친구 관계 기반이어야 한다.
- 랜딩은 실시간 점 탐색이 아니라 주간 큐 모델로 설명해야 한다.

---

## 17. 현재 진행 상황 (2026-05-21 Codex 기준)

### 완료/부분 완료

- 여자 이상형 월드컵 최종 64장 사용 세트 구성
- 여자 `METADATA.json` active 64로 갱신
- 이상형 월드컵 결과 primary/secondary 공개
- 같은 유형끼리 초반 매칭 회피
- self-worldcup UI 제거
- 온보딩 순서 기본정보 우선으로 수정
- 로그인 기본 redirect `/profile/basic`
- 친구 기반 그룹 생성 UI 초안
- friend_requests/friendships 스키마 추가
- 랜딩 MatchingPool을 주간 매칭 큐 UI로 변경
- `lib/matching/config.ts` 존재
- 관련 static tests/typecheck/lint 통과

### 미완성

- 남자 이상형 월드컵 64장 이미지/메타데이터
- 실제 GPT Vision AI 서버 완성 여부
- 월드컵 preference vector 전체 DB 저장
- 사용자 사진 분석 결과와 `self_appearance_score` 연결
- 친구 요청/친구 수락/그룹 초대 API
- 그룹 생성 Supabase 연동
- 보증금 결제 API
- 매칭 엔진 Python 구현
- match result/checkin/review 화면
- venues/match_meetings 연동
- 알림 시스템

---

## 18. Git 브랜치 상태

Codex가 이번 문서 작성 시 확인한 사실:

- worktree에는 많은 수정/추가/삭제 파일이 있다.
- `git status`에서 주요 변경:
  - 온보딩/월드컵/그룹 UI 변경
  - self-worldcup 관련 파일 삭제
  - 이미지/메타데이터/테스트/문서 다수 추가
  - `lib/matching/config.ts` untracked
  - matching/profile preference migrations untracked

모름:

- 원격 GitHub의 최신 브랜치 목록
- Claude 문서가 말한 "9개 브랜치"의 실제 상태
- 어떤 변경이 이미 commit/push 되었는지의 최종 상태

주의:

- 작업 전에는 `git status`와 diff를 기준으로 사용자/다른 AI 변경을 덮어쓰지 말아야 한다.

---

## 19. 결정된 운영 정책 (8-X)

Codex가 현재 이해한 결정값:

| 항목 | 값 |
|---|---|
| 보증금 | 1인 20,000원 |
| 매칭 발표 | 토요일 14:00 |
| 그룹 인원 | 2~3명 |
| Forced Match 응답 마감 | 일요일 06:00 |
| 일반 score band | ±15 |
| 일반 pair score threshold | 0.45 |
| 비대칭 페널티 | 0.3 |
| Forced Match threshold | 0.30 |
| Forced Match score band | ±25 |
| 노쇼 배분 | 출석자 균등 분배 |
| 자동 환불 | 4회 이월 |
| 프로필 불일치/거짓말 | 운영자 검토 |
| 알림 | PWA + email |
| GPS 체크인 | 기본 50m |

---

## 20. 위험 / 미해결 이슈

### Critical

1. `users(id)` 참조 불일치 가능성: public `users` 테이블이 없으면 matching migration 실패.
2. 자기유사 월드컵 제거 후 `self_appearance_score` 산출 경로가 불명확.
3. 남자 이상형 월드컵 64장 미완성으로 여성 사용자의 월드컵이 실제 운영 불가.
4. 월드컵 preference vectors가 DB에 실제 저장되지 않으면 매칭 엔진이 선호 벡터를 읽을 수 없음.

### High

1. `/group/create`는 UI만 있고 실제 DB/API 연동 전.
2. 보증금/결제 미연동.
3. Python matching engine 미구현.
4. venues/match_meetings 연동 상태 모름.
5. 알림 시스템 미구현.

### Medium

1. 기존 문서들이 구형 흐름을 포함한다. 특히 self-worldcup과 Soul Orbs.
2. migration을 이미 적용한 환경이 있다면 기존 migration 수정 방식은 반영되지 않는다.
3. 성격은 현재 Big5 자기 성격만 있고, 상대 성격 선호 벡터는 설계 문서만 있다.
4. `group_members`의 현재 unique 제약은 과거 그룹 이력과 충돌할 수 있다.

### Low

1. 일부 문서/주석/콘솔 출력의 인코딩 표시가 깨지는 환경이 있다.
2. 오래된 컴포넌트 `AppearanceWorldcup`, `WorldcupResult`가 아직 남아 있을 수 있다. 사용 여부 정리 필요.

---

## 21. 사용자 (충현) 가치관 / 디자인 의도

Codex가 대화에서 이해한 충현의 방향:

1. 사용자는 재미를 느껴야 하지만, raw 점수 때문에 상처받으면 안 된다.
2. 이상형 월드컵 결과는 primary/secondary 정도로 가볍게 보여주는 게 좋다.
3. 외모 절대점수 77점 초과 사진은 월드컵에서 외모 점수대로만 고르게 만들 위험이 있어 제외한다.
4. 그룹 매칭은 실제 친구와 같이 하는 것이 핵심이다.
5. 점 형태/오브 형태의 매칭 탐색 UI는 설렘이 부족하고 앱 구조와 맞지 않는다.
6. "실시간 주변 사람 찾기"가 아니라 "친구 그룹을 만들고 주간 매칭 큐에 들어가는 설렘"이어야 한다.
7. 계획이 계속 바뀌고 있으므로 전체 계획서를 다시 정리해야 한다.

---

## 22. 모르는 것 (Codex가 정직하게 모르는 것)

- Claude가 가진 전체 세션 히스토리 중 repo에 없는 결정
- 성준이 현재 실제로 만든 venues/match_meetings 코드/DB
- Manus가 생성한 남자 이미지 실제 업로드 상태
- 남자 64장 이미지 생성 모델/프롬프트/최종 후보
- GPT Vision AI 서버의 현재 실행 가능 상태
- Supabase 실제 원격 DB에 어떤 migrations가 적용됐는지
- public `users` 테이블 존재 여부
- Toss Payments 연동 범위
- PWA/email 알림 구현 범위
- Vercel/배포 설정
- 운영 수익 모델

---

## 23. Appendix — 핵심 파일 경로

### 프로필/온보딩

- `app/page.tsx`
- `app/(auth)/login/page.tsx`
- `app/profile/basic/page.tsx`
- `app/profile/worldcup/page.tsx`
- `app/profile/photos/page.tsx`
- `app/profile/survey/page.tsx`
- `app/profile/schedule/page.tsx`
- `app/profile/preferences/page.tsx`
- `components/profile/StepProgress.tsx`

### 이상형 월드컵

- `components/profile/IdealWorldcup.tsx`
- `components/profile/IdealWorldcupResult.tsx`
- `lib/appearance/preference.ts`
- `lib/appearance/vector.ts`
- `lib/appearance/metadata.ts`
- `lib/appearance/bucket-to-legacy.ts`
- `public/appearance-ideal/METADATA.json`
- `public/appearance-ideal/FINAL_64_USAGE_SET.json`
- `public/appearance-ideal/FINAL_64_USAGE_REPORT.md`

### 외모 분석/자기 점수

- `public/appearance-self/SCORE_GUIDE.md`
- `docs/APPEARANCE_ANALYSIS_GPT_PROMPT.md`
- `docs/APPEARANCE_ANALYSIS_SCHEMA.md`
- `docs/APPEARANCE_VECTOR_CALIBRATION.md`
- `app/api/score/route.ts`
- `python/appearance/`

### 그룹/매칭

- `app/group/create/page.tsx`
- `components/MatchingPool.tsx`
- `lib/matching/config.ts`
- `supabase/migrations/20260521_matching_create_core_tables.sql`
- `supabase/migrations/20260521_profile_add_preference_vectors.sql`

### 계약/계획/핸드오프

- `docs/INTERFACE_CONTRACT.md`
- `docs/MATCHING_SYSTEM_PLAN.md`
- `docs/handoff/SUNGJUN_PERSONALITY_VECTOR_HANDOFF.md`
- `docs/CLAUDE_FULL_UNDERSTANDING_2026-05-21.md`
- `docs/CODEX_FULL_UNDERSTANDING_2026-05-21.md`
- `docs/UNDERSTANDING_REVIEW_ROOM_2026-05-21.md`

### 테스트

- `python/appearance/tests/test_group_onboarding_and_friend_flow.py`
- `python/appearance/tests/test_worldcup_page_dev_fallback.py`
- `python/appearance/tests/test_ideal_worldcup_metadata.py`
- `python/appearance/tests/test_ideal_worldcup_pairing.py`
- `python/appearance/tests/test_ideal_worldcup_result_public_types.py`

---

## 24. 마지막 점검 — Claude 문서와 Codex 이해 비교

### 24-1. 대체로 일치

- Destiny는 부산대 그룹 과팅 앱
- 보증금 기반 노쇼 방지
- 주 1회 토요일 14:00 매칭
- hard filter + pairScore + 헝가리안 구조
- raw 점수/벡터 사용자 노출 금지
- 이상형 월드컵은 measured vector 기준
- primary/secondary 공개 방식은 적절
- 성격도 상대 선호 벡터가 필요함

### 24-2. Codex 기준으로 Claude 문서와 다름

| 항목 | Claude 문서 | 현재 Codex/repo 기준 |
|---|---|---|
| 온보딩 순서 | worldcup -> self-worldcup -> basic | basic -> worldcup -> photos |
| 자기유사 월드컵 | 핵심 흐름 | UI/route 삭제됨. 개념/스키마만 잔존 |
| 랜딩 매칭 시각화 | Soul Orbs | 주간 매칭 큐 UI로 변경 |
| 여자 이상형 풀 | FI01~FI64 중심 설명 | 현재 최종 64는 여러 generation/NEW/FI81~116 포함 |
| 남자 이상형 풀 | MI01~MI64 완료처럼 설명 | 현재 미완성. metadata male active 4만 확인 |
| 그룹 생성 | 아직 placeholder로 보일 수 있음 | 친구 추가/친구 목록/그룹 슬롯 UI 초안 구현 |
| 친구 관계 모델 | Claude 문서에는 추가됐다고 언급 | 실제 migration에 `friend_requests`, `friendships` 추가됨 |
| preference vector 저장 | 계획상 DB 저장 | 실제 page는 아직 sessionStorage + appearance_type 중심 |

### 24-3. Codex가 Claude에게 확인 요청할 항목

1. `self_appearance_score`를 앞으로 어떻게 산출할 것인가?
2. public `users` 테이블이 실제로 있는가, 아니면 all FK를 `auth.users`로 바꿔야 하는가?
3. 남자 이상형 월드컵 64장 생성/분석 일정과 담당자는 누구인가?
4. 성격 선호 벡터는 기존 Big5 뒤에 붙일 것인가, 별도 설문으로 둘 것인가?
5. `profiles`에 preferred vector를 실제 저장하는 구현을 다음 단계로 볼 것인가?
6. 그룹/친구 API를 먼저 만들지, UI polish를 먼저 할지 우선순위는 무엇인가?

---

## 끝

Codex의 현재 결론:

Claude 문서는 큰 기획 방향은 맞지만, 현재 repo의 최신 변경을 반영하지 못한 부분이 있다. 특히 `self-worldcup`, 온보딩 순서, 랜딩 매칭 시각화, 남자 이미지 상태, 실제 DB 저장 구현 상태는 반드시 재합의해야 한다.

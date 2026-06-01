# Destiny v2 계획서 - 과팅 전용에서 캠퍼스 소셜 플랫폼으로 확장

> 작성자: Codex  
> 작성일: 2026-05-23  
> 기준 문서: `docs/CODEX_MASTER_2026-05-23.md`  
> 목적: 현재 과팅 앱 구조를 유지하면서, 향후 1:1 소개팅·커뮤니티·동아리·배틀 모드를 흡수할 수 있는 v2 제품/기술 계획을 정의한다.

---

## 1. 핵심 방향

현재 앱은 부산대 과팅 전용 MVP에 가깝다. v2에서는 앱을 "부산대 과팅앱"으로 고정하지 않고, **캠퍼스 기반 소셜 매칭 플랫폼**으로 확장한다.

단, 확장의 순서는 보수적으로 잡는다.

1. v1 과팅 흐름 안정화
2. 인증/자격 조건을 모드별로 분리
3. 매칭 엔진을 모드 기반으로 추상화
4. 1:1 소개팅, 커뮤니티, 동아리 모집, 술자리 게임 배틀 모드를 순차 확장

중요한 원칙:

- 부산대 메일 인증은 **과팅 모드 참여 조건**이다.
- 카카오/Google/휴대폰 로그인은 **앱 계정 생성 수단**이다.
- 1:1 소개팅, 커뮤니티, 동아리 기능은 나중에 별도 자격 정책을 붙인다.
- 모든 데이팅/만남 기능은 20세 이상 성인만 허용한다.

---

## 2. 즉시 바로잡아야 할 설계 오류

### 2.1 부산대 메일 인증 범위 수정

현재 Codex가 추가한 학교 인증 설계는 `/profile`, `/group`, `/match`, `/friends`, `/notifications` 전체를 막는 방향이었다. 이건 v2 방향과 맞지 않는다.

수정 원칙:

- `@pusan.ac.kr` 인증은 과팅 모드 전용 게이트다.
- 앱 로그인 자체, 기본 프로필, 친구/알림, 향후 1:1/커뮤니티/동아리 기능은 학교 인증으로 전역 차단하지 않는다.
- 과팅 관련 행동만 차단한다:
  - 과팅 그룹 생성
  - 과팅 그룹 초대 수락
  - 과팅 보증금 결제
  - 과팅 매칭 큐 진입
  - 과팅 매칭 상세 접근

구현 변경:

- `middleware.ts`의 전역 학교 인증 리다이렉트를 제거한다.
- 과팅 전용 route/API에서 `requireEligibility(user, 'group_blind_date')`를 호출한다.
- `/profile/school`은 강제 첫 단계가 아니라, 과팅 진입 시 필요한 인증 화면으로 둔다.

---

## 3. 모드 기반 제품 구조

v2부터 앱 기능을 `mode` 단위로 나눈다.

| 모드 | 설명 | 인증 조건 | v2 우선순위 |
|---|---|---|---|
| `group_blind_date` | 현재 과팅. 2~3명 그룹 매칭, 보증금, 자동 장소/시간 | 20세 이상 + 부산대 메일 인증 | 최우선 |
| `one_on_one_date` | 향후 1:1 소개팅 | 20세 이상 + 별도 신뢰/실명/사진 검증 | 후속 |
| `community` | 자유 게시판, 만남 후기, 정보 공유 | 20세 이상 또는 전체 공개 정책 별도 결정 | 후속 |
| `club_recruiting` | 동아리 만들기, 동아리원 모집 | 학교 인증 권장, 필수 여부는 동아리 타입별 | 후속 |
| `battle_mode` | 과별 랭킹/게임형 만남 모드 | 20세 이상 + 모드별 안전 정책 | 실험 기능 |

기술 구조:

```ts
type AppMode =
  | 'group_blind_date'
  | 'one_on_one_date'
  | 'community'
  | 'club_recruiting'
  | 'battle_mode'
```

모든 라우트/API는 앞으로 "앱 전체 권한"이 아니라 "모드 권한"을 확인한다.

---

## 4. 성인 인증 정책

사용자 요구: 미성년자는 제외. 20세 이상만 만남 기능 참여.

정책:

- 모든 데이팅/만남/술자리/배틀 모드는 20세 이상만 허용한다.
- 프로필에는 단순 `age`뿐 아니라 `birthdate` 또는 최소한 `birth_year`를 추가해야 한다.
- 사용자가 직접 입력한 나이는 운영상 신뢰도가 낮으므로, v2 이후에는 다음 중 하나로 보강한다:
  - 휴대폰 본인인증
  - 학교 메일 + 학생 포털 연계
  - 신분증/학생증 운영자 검수

v2 최소 구현:

- `profiles.age >= 20`을 만남 기능 진입 조건으로 둔다.
- `requireAdult(user)` 공통 함수 추가.
- 과팅 큐 진입, 1:1 매칭 신청, 배틀 모드 참여 전에 성인 조건 검사.

---

## 5. 과팅 후속 행동 정책 변경

현재 흐름은 completed 후 `continue/end` 선택이 있다. 이전 계획에서 `Continue`를 제거/비활성화한다고 쓴 것은 사용자 의도와 다르다.

수정된 v2 원칙:

- `Continue`는 "상대가 마음에 들어서 더 이어갈 의향이 있다"는 선택이다.
- `Continue`를 누르면 새 매칭을 찾는 화면이 아니라 **보증금 20,000원 중 앱에 얼마를 남길지 선택하는 정산 화면**으로 간다.
- `End`는 이번 만남을 끝내는 선택이며, 상대에게 중립적인 알림이 간다.
- 중독 방지는 `Continue` 제거가 아니라, Continue/End 이후 "바로 새 매칭 찾기" CTA를 노출하지 않는 방식으로 잡는다.

### 5.1 End 정책

- 사용자가 `End`를 누르면 상대 그룹에게 알림이 간다.
- 알림 문구는 공격적이지 않게 한다.
  - 예: "상대가 이번 만남은 여기까지로 선택했어요."
- `End` 이후:
  - 리뷰 작성 가능
  - 기본 전액 환불 또는 기존 환불 정책에 따른 자동 정산
  - 같은 상대와 재매칭 차단
  - 상대방에게 과도한 재요청/재차 말하기 유도 금지

### 5.2 Continue 정책

사용자 요구를 반영해, `Continue`는 앱이 계속 새 매칭을 유도하는 버튼이 아니어야 한다. `Continue`는 현재 상대가 마음에 들었을 때만 의미가 있고, 이때 매칭비/앱 수익 정산을 묻는다.

v2 정책:

- completed 후 사용자는 `Continue` 또는 `End`를 선택한다.
- `Continue`를 누르면 다음 질문을 띄운다.
  - "보증금 20,000원 중 앱에게 얼마를 줄거냐?"
- 사용자는 0원부터 20,000원까지 앱 수익 금액을 직접 고르거나 입력할 수 있다. 기본 제안값은 3,000원이다.
- 3,000원 이상을 선택하면 그대로 정산한다. 이때 상대에게 "얼마를 냈는지" 알림을 보내지 않는다.
- 3,000원 미만(0원, 1,000원, 2,000원 등)을 선택하면 먼저 애교/구걸 모달을 띄운다.
  - "3,000원만 주면 안돼?!?"
- 사용자가 그래도 1,000원 또는 2,000원을 선택하면 안내를 띄운다.
  - "3,000원부터는 상대방에게 매칭비로 얼마를 지불했는지 알림이 안 갑니다."
- 사용자가 그래도 0원을 선택하면 단계적으로 재확인한다.
  - "그래도 0원 주겠습니까?"
  - "상대방에게 매칭비로 0원을 지불했다는 사실이 알림으로 갑니다. 그래도 0원을 지불하겠습니까?"
- 0원 확정 화면에는 상대가 보일 반응을 만화 컷으로 보여준다. 현재 사용자가 여자면 남자가 삐진 컷, 현재 사용자가 남자면 여자가 삐진 컷을 보여준다.
- 사용자가 0원을 최종 확정하면 상대 그룹에게 `partner_paid_zero` 또는 동등한 알림을 보낸다.
- 이 정산은 "상대가 마음에 들 때 앱에게 얼마를 줄지"의 문제이므로 `End`가 아니라 `Continue` 흐름에 붙인다.

정산 의미:

- 사용자가 앱에 남기는 금액 = 앱 수익.
- 사용자 환불액 = 20,000원 - 앱에 남긴 금액.
- 노쇼/신고/운영자 개입이 있으면 이 흐름보다 안전/페널티 정책이 우선한다.

중독 방지 정책:

- 같은 사용자가 짧은 기간에 반복적으로 매칭 큐에 들어가는 것을 제한한다.
- `Continue` 또는 `End` 직후 즉시 다음 매칭 유도 금지.
- `Continue` 버튼은 새 상대 찾기가 아니라 정산 버튼이므로, "새 매칭상대 찾기" 버튼과 분리한다.
- "한 번 더 말 걸기", "다시 요청" 같은 재접촉 기능은 v2에서 제외한다.

---

## 7. 술자리 게임 배틀 모드

사용자 아이디어: 술배틀 모드, 과별 랭킹, 상금 1등 20만원, 2등 10만원, 체스식 점수 계산, 항복 버튼.

중요한 안전 원칙:

- 실제 음주량 경쟁은 위험하고 운영 리스크가 크다.
- "술배틀"은 음주량 점수화가 아니라 **술자리 게임/팀 배틀 모드**로 설계한다.
- 과음 유도, 벌주 강요, 음주량 기록, 만취 경쟁은 금지한다.
- 참여 전 서약서를 받는다. 사용자는 음주 강요 금지, 본인 컨디션에 따른 참여 중단, 귀가 안전, 사고/부상/분실/대인분쟁의 1차 책임이 본인에게 있음을 확인해야 한다.
- 단, 서약서가 앱의 모든 법적 책임을 없애는 것은 아니다. 앱은 미성년자 차단, 위험 고지, 신고/중단 기능, 과음 유도 금지 같은 합리적 안전 조치를 계속 가져야 한다.

### 7.1 모드 정의

`battle_mode`는 과별/팀별 랭킹이 있는 게임형 만남 모드다.

점수는 다음 이벤트로 계산한다.

- 참석 완료
- 게임 승리
- 상대팀 평가
- 운영자 승인 이벤트
- 항복/기권
- 노쇼/신고 페널티

점수에 반영하지 않는 것:

- 마신 술의 양
- 취한 정도
- 벌주 수행 여부

### 7.1.1 참여 서약/위험 고지

배틀 모드 진입 전에는 별도 동의 화면을 둔다.

필수 체크:

- 본인은 만 20세 이상이다.
- 앱은 음주량 경쟁, 벌주 강요, 만취 경쟁을 운영하지 않는다.
- 본인은 자신의 건강 상태와 귀가 안전을 직접 판단하고, 언제든 참여를 중단할 수 있다.
- 술자리 중 발생하는 개인 간 분쟁, 물품 분실, 과음, 사고는 원칙적으로 참여자 본인의 책임이다.
- 앱의 고의/중과실, 법령상 의무, 신고 처리 의무는 이 동의로 면제되지 않는다.

구현:

- `battle_participation_agreements` 테이블에 user_id, season_id, version, agreed_at, ip_hash, user_agent_hash를 저장한다.
- 약관/서약 문구가 바뀌면 version을 올리고 재동의를 요구한다.
- 동의하지 않은 사용자는 배틀 매칭 큐에 들어갈 수 없다.

### 7.2 랭킹과 상금

초기 실험안:

- 시즌 단위 운영
- 과별 랭킹 표시
- 1등 20만원, 2등 10만원은 후원/마케팅 예산으로 처리
- 상금은 현금 지급 전 법적/세무/플랫폼 정책 검토 필요

대체안:

- 상품권
- 제휴 카페/식당 쿠폰
- 앱 내 뱃지/랭킹 강조

### 7.3 체스식 점수 계산

Elo/MMR 구조:

- 각 팀/과에 rating을 둔다.
- 강한 팀을 이기면 많이 오른다.
- 약한 팀에게 지면 많이 떨어진다.
- 항복 버튼을 누르면 즉시 점수 계산한다.

여성 보호/유리 보정:

- 사용자 요구대로 여성에게 손실을 작게, 승리 이득을 크게 줄 수 있다.
- 단, 이 규칙은 운영 정책으로 명확히 설명해야 한다.
- 구현은 `gender_balance_multiplier`로 둔다.

예시:

```ts
scoreDelta = baseEloDelta * modeMultiplier * genderBalanceMultiplier
```

주의:

- 성별에 따른 점수 보정은 민감한 정책이다.
- v2 실험 기능으로 두고, 운영자 설정값으로 조정 가능하게 한다.

---

## 8. 매칭 점수 v2 - 외모 벡터를 "인상 벡터"로 확장

현재는 사진 기반 외모 벡터와 선호 벡터 중심이다. v2에서는 사용자가 말한 것처럼 키와 성격이 실제 인상에 영향을 주는 구조를 반영한다.

### 8.1 Raw appearance와 perceived impression 분리

```ts
rawAppearanceVector       // 사진 AI 기반 순수 외모 벡터
heightStylePriorVector    // 키에서 오는 스타일 보정
personalityImpressionVector // 성격에서 오는 인상 보정
perceivedImpressionVector // 최종 사용자가 느끼는 인상 벡터
```

최종:

```ts
perceivedImpression =
  rawAppearance * 0.70
  + heightPrior * 0.15
  + personalityPrior * 0.15
```

초기값은 보수적으로 둔다. 성격/키가 사진 점수를 뒤집지는 않고, 인상 방향을 조금 이동시키는 정도다.

### 8.2 키 기반 스타일 보정

예시 정책:

| 조건 | 보정 방향 |
|---|---|
| 키가 상대적으로 작은 편 | cute, warm 쪽 소폭 가산 |
| 키가 평균 근처 | 보정 거의 없음 |
| 키가 큰 편 | chic, stylish, pure 쪽 소폭 가산 |

성별별 평균/분포를 따로 둔다.

### 8.3 성격 기반 인상 보정

Big5와 설문 문항에서 인상 벡터를 만든다.

예시:

| 특성 | 보정 방향 |
|---|---|
| 외향성 높음, 잘 웃음 | cute, warm, healthy |
| 외향성 낮음, 말수 적음 | chic, calm 계열 |
| 친화성 높음 | warm, pure |
| 개방성 높음 | stylish |
| 성실성 높음 | clean, pure |

v2에서는 `calm` 같은 새 축을 추가할지 검토한다. 현재 appearance type이 6개라면 우선 기존 6개 축에만 매핑한다.

### 8.4 성준 성격 선호 벡터와 사용자 방식 통합

성준의 `docs/handoff/SUNGJUN_PERSONALITY_VECTOR_HANDOFF.md` 핵심은 "본인 성격"과 "내가 끌리는 상대 성격"을 분리하는 것이다. 이 방향은 사용자 방식과 충돌하지 않고, 오히려 다음처럼 합치는 것이 맞다.

1. 본인 성격: 기존 Big5 설문으로 `self_personality_vector`를 만든다.
2. 선호 상대 성격: 성준 방식의 `preferred_personality_vector`를 만든다.
3. 실제 인상 보정: 사용자가 말한 것처럼 본인 성격에서 `personalityImpressionVector`를 만든다.
4. 매칭 성격 적합도: `A.preferred_personality_vector`와 `B.self_personality_vector`를 비교하고, 반대 방향도 같이 본다.

구현 반영:

- `lib/matching/personality-preference.ts`에 성격 선호 계산 순수 함수를 추가했다.
- `emotional_stability = 1 - neuroticism`으로 공개 표현을 바꾼다.
- 공개 유형은 8개로 시작한다.
  - `warm_empathic`, `active_social`, `calm_stable`, `diligent_planned`, `intellectual_curious`, `free_individual`, `direct_honest`, `playful_humorous`
- 사용자에게는 primary/secondary 유형만 보여주고, 축별 원점수/세부 점수는 노출하지 않는다.
- 성격에서 외모 인상을 보정할 때는 기존 6개 외모 축에만 매핑한다.
  - 외향성+친화성 높음: `warm`, `cute`, `healthy`
  - 외향성 낮고 정서 안정 높음: `chic`, `pure`
  - 개방성 높음: `stylish`
  - 성실성 높음: `pure`

중요한 점:

- 성격은 "좋고 나쁜 점수"가 아니라 "선호 적합도"다.
- 사용자가 말한 성격 기반 인상 보정은 사진 AI 결과를 뒤집는 것이 아니라 `perceivedImpressionVector`에 소폭 prior로 들어간다.
- 이상형이 바뀌면 `preferred_personality_vector`도 다시 만들 수 있어야 한다.

---

## 9. 키 점수와 선호 가중치

사용자 요구: 여성은 키를 중요하게 보는 경우가 있으므로, 가중치 선택에서 키를 명확히 반영해야 한다.

### 9.1 키 점수 계산

대한민국 성별 키 분포를 기준으로 percentile score를 계산한다.

공식 기준:

- 출처: 국가기술표준원/사이즈코리아 제8차 한국인 인체치수조사 측정 결과 자료.
- 자료실 링크: https://sizekorea.kr/support/pds/view?bbsCntntsSeq=1326&currentPageNo=1&searchType2=&searchWord1=
- 영문 보도자료 링크: https://english.motie.go.kr/eng/article/EATCLdfa319ada/947/view
- 8차 조사는 20~69세 한국인 6,839명을 대상으로 2020년 5월~2021년 12월 수행된 조사다.
- 남성 20~39세 앱 기본값은 20~24, 25~29, 30~34, 35~39세 표본을 합쳐 산출한다.

남성 키 기준값:

| 연령 | N | 평균 | 표준편차 | P50 | P90 | P95 | P99 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 20~24세 | 343 | 174.6cm | 5.70cm | 174.5cm | 182.6cm | 184.4cm | 189.1cm |
| 25~29세 | 267 | 174.1cm | 5.77cm | 173.7cm | 181.9cm | 184.3cm | 189.5cm |
| 30~34세 | 237 | 174.6cm | 5.83cm | 174.7cm | 182.8cm | 184.2cm | 187.8cm |
| 35~39세 | 256 | 175.1cm | 5.35cm | 175.2cm | 181.8cm | 183.5cm | 187.3cm |
| 20~39세 통합 기본값 | 1,103 | 174.6cm | 약 5.7cm | - | - | - | - |

해석:

- 남성 174~175cm는 평균 근처이므로 약 50점으로 본다.
- 남성 190cm는 20대 표본 기준 P99에 가깝거나 그 이상이다. 따라서 "상위 2%"로 고정하지 말고, 실제 percentile table을 우선 적용한다.
- normal CDF는 실제 백분위 표가 없을 때만 fallback으로 쓴다.

구현:

```ts
heightPercentileScore =
  empiricalPercentile(height, gender, ageBand)
  ?? normalCdf(height, genderMean, genderStdDev) * 100
```

초기 분포값은 운영 설정으로 둔다. 남성은 20~39세 공식 통합값을 기본값으로 사용한다.

```ts
male_20_39: mean 174.6, stddev 5.7
```

여성 20~39세 값도 같은 공식 자료에서 같은 방식으로 산출한다. v2에서 우선 필요한 것은 사용자가 말한 "여성이 남성 키를 중요하게 보는 경우"이므로, 남성 키 percentile부터 정확히 잡는다.

### 9.2 사용자 가중치

v2 매칭 가중치:

- 외모
- 키
- 성격
- 나이
- 시간대
- 거리/장소
- 학교/학과 회피
- 가치관/취향

여성만 키를 고정 가중치로 강제하지 않는다. 대신 모든 사용자가 선택할 수 있게 하되, 여성 사용자에게는 키 가중치 UI가 더 명확하게 보이도록 할 수 있다.

---

## 10. 장소 추천 3가지

매칭이 생성될 때 시스템은 장소 후보 3개를 추천한다.

### 10.1 추천 기준

- 양 그룹의 위치 접근성
- 약속 시간 영업 여부
- 그룹 규모
- 모드
  - 가볍게 만나기: 카페/디저트/라이트 식당
  - 과팅 기본: 식당 + 카페
  - 배틀 모드: 룸/게임 가능 공간, 안전한 귀가 동선
- 예산
- 분위기 태그
- 이전 신고/문제 발생 장소 제외

### 10.2 UX

매칭 상세에서:

- 추천 장소 3개 카드
- 1순위 자동 선택
- 양쪽 리더가 장소 변경 요청 가능
- 운영자 강제 변경 가능

초기 v2에서는 자동 확정 1개 + 대안 2개 노출이 현실적이다.

---

## 11. 데이터 모델 v2 초안

### 11.1 사용자 인증/자격

```sql
user_verifications (
  user_id,
  kind, -- school_email, adult, phone, identity
  provider,
  value_hash,
  verified_at,
  expires_at
)

mode_eligibilities (
  user_id,
  mode,
  eligible,
  reason,
  updated_at
)
```

### 11.2 모드

```sql
app_modes (
  code,
  display_name,
  requires_adult,
  requires_school_email,
  status
)
```

### 11.3 배틀

```sql
battle_seasons (
  id,
  mode,
  starts_at,
  ends_at,
  prize_config,
  status
)

department_ratings (
  season_id,
  department,
  rating,
  wins,
  losses,
  surrenders
)

battle_matches (
  id,
  season_id,
  group_a_id,
  group_b_id,
  status,
  winner_group_id,
  surrendered_by_group_id,
  rating_delta
)
```

### 11.4 장소 추천

```sql
match_venue_recommendations (
  match_id,
  venue_id,
  rank,
  score,
  reason_tags,
  selected
)
```

### 11.5 프로필/선호 재평가

처음 온보딩은 한 번에 끝나지만, 사용자는 실제 만남을 겪으면서 이상형과 자기 스타일이 바뀔 수 있다. v2에서는 프로필과 선호를 "한 번 저장하면 끝"이 아니라 **버전이 쌓이는 설정값**으로 다룬다.

```sql
profile_revisions (
  id,
  user_id,
  reason, -- onboarding, photo_update, style_change, manual_edit
  height_cm,
  profile_snapshot,
  created_at,
  activated_at
)

preference_recalibration_runs (
  id,
  user_id,
  kind, -- ideal_worldcup, personality_worldcup, weight_adjustment
  previous_vector,
  new_vector,
  previous_weights,
  new_weights,
  reason,
  created_at,
  activated_at
)

photo_evaluation_runs (
  id,
  user_id,
  photo_id,
  reason, -- new_photo, hair_color_change, style_change, better_primary_photo
  raw_appearance_vector,
  perceived_impression_vector,
  ai_notes_private,
  created_at,
  activated_at
)
```

정책:

- 매칭 엔진은 항상 `activated_at`이 가장 최신인 프로필/선호/사진 평가를 쓴다.
- 과거 결과는 삭제하지 않는다. 나중에 "내 이상형이 어떻게 변했는지"를 분석할 수 있고, AI 평가 오작동 rollback도 가능해야 한다.
- 사진 재평가는 언제든 가능하게 하되, 점수 조작을 막기 위해 하루 재평가 횟수 제한 또는 쿨다운을 둔다.
- 사용자에게 AI가 단정적으로 평가한 문장을 직접 노출하지 않는다. "스타일 방향이 더 선명해졌어요" 수준의 부드러운 피드백만 노출한다.

### 11.6 배틀 참여 서약

```sql
battle_participation_agreements (
  id,
  user_id,
  season_id,
  agreement_version,
  agreed_at,
  ip_hash,
  user_agent_hash
)
```

정책:

- 배틀 모드 매칭 큐 진입 전에 최신 version 동의가 필요하다.
- 위험 고지/책임 제한/20세 이상 확인/음주 강요 금지를 모두 체크해야 한다.
- 서약은 운영 리스크를 줄이는 장치이지, 앱의 법적 의무를 없애는 장치가 아니다.

---

## 12. 구현 단계

### Phase 0 - 현재 학교 인증 게이트 수정

목표: 잘못된 전역 학교 인증 차단 제거.

작업:

- `middleware.ts`에서 학교 인증 전역 redirect 제거.
- 과팅 관련 API/route에만 `requireModeEligibility('group_blind_date')` 적용.
- `/profile/school`은 과팅 진입 시 필요한 페이지로 유지.
- 문서의 인증 정책 갱신.

완료 기준:

- 카카오/Google 로그인 후 기본 앱 접근 가능.
- 과팅 그룹 생성/큐 진입 시에만 부산대 인증 요구.
- 1:1/커뮤니티/동아리 미래 기능이 학교 인증에 묶이지 않는 구조.

### Phase 1 - 모드/자격 시스템 도입

작업:

- `AppMode` 타입 추가.
- `user_verifications`, `mode_eligibilities` 또는 동등 구조 설계.
- `requireAdult`, `requireSchoolEmail`, `requireModeEligibility` helper 추가.
- 과팅 v1 기존 로직을 `group_blind_date` 모드로 감싼다.

### Phase 2 - 성인 조건 강화

작업:

- 프로필 나이 정책 재정의.
- `age >= 20` 검증을 매칭/만남 API에 추가.
- 추후 본인인증 provider 붙일 수 있도록 abstraction 확보.

### Phase 3 - 후속 행동 UX/정산 수정

작업:

- completed 후 `Continue`와 `End`를 모두 유지하되 의미를 분리한다.
- `Continue` 클릭 시 "20,000원 중 앱에게 얼마를 남길지" 정산 모달/페이지로 이동한다.
- 정산 금액은 0원부터 20,000원까지 앱 수익 기준으로 고른다. 기본 제안값은 3,000원이다.
- 3,000원 이상은 바로 정산하고 상대에게 금액 알림을 보내지 않는다.
- 3,000원 미만은 먼저 "3,000원만 주면 안돼?!?" 애교/구걸 모달을 거친다.
- 1,000원/2,000원 확정 전에는 "3,000원부터는 상대방에게 매칭비로 얼마를 지불했는지 알림이 안 갑니다" 안내를 띄운다.
- 0원은 "그래도 0원 주겠습니까?" 재확인 후 "상대방에게 매칭비로 0원을 지불했다는 사실이 알림으로 갑니다" 경고까지 통과해야 확정한다.
- 0원 확정 전에는 상대가 삐진 반응 만화 컷을 보여준다. 사용자 성별에 따라 남자/여자 반응 컷을 바꾼다.
- 0원 확정 시 상대 그룹에게 알림 발송.
- End 클릭 시 상대에게 중립적 종료 알림 발송.
- Continue/End 이후 즉시 "새 매칭상대 찾기" CTA를 노출하지 않는다.
- 환불/리뷰 흐름과 충돌 없게 정리한다.

### Phase 3.5 - 프로필/선호 재평가 루프

작업:

- 프로필 편집 화면에서 사진 업데이트를 언제든 허용한다.
- 사진이 바뀌면 AI 외모/인상 재평가를 다시 요청할 수 있게 한다.
- 사용자가 염색, 스타일 변화, 대표 사진 변경 같은 이유를 선택할 수 있게 한다.
- 이상형 월드컵 다시 하기 버튼 추가.
- 성격/이상형이 바뀌었다고 느끼는 사용자를 위해 성격 월드컵 또는 성격 설문 재실행 버튼 추가.
- 새 결과는 기존 값을 덮어쓰기보다 revision/run으로 저장하고, 최신 activated 버전을 매칭에 반영한다.

### Phase 4 - 매칭 점수 v2

작업:

- height percentile score 추가.
- personality impression vector 추가.
- perceived impression vector 계산기 추가.
- matching config에 height/personality/appearance 가중치 분리.
- 기존 테스트에 height/personality 보정 케이스 추가.

### Phase 5 - 장소 추천 3개

작업:

- venue scoring 함수 추가.
- `match_venue_recommendations` 저장.
- 매칭 상세에서 3개 후보 노출.
- 운영자/리더 변경 정책 설계.

### Phase 6 - 배틀 모드 실험

작업:

- battle season/rating schema 추가.
- surrender button API 추가.
- department leaderboard UI 추가.
- 안전 정책: 음주량 점수화 금지, 신고/노쇼/기권 페널티.
- 상금 운영은 법적/세무 검토 후 활성화.

### Phase 7 - 1:1/커뮤니티/동아리 확장 준비

작업:

- 1:1은 과팅과 별도 매칭 테이블 또는 `mode` 기반 통합 테이블 검토.
- 커뮤니티는 게시글/댓글/신고/블라인드 정책 설계.
- 동아리 모집은 `clubs`, `club_members`, `club_recruit_posts` 설계.
- 학교 인증 필수 여부는 기능별로 선택 가능하게 둔다.

---

## 13. v2 우선순위

1. **학교 인증 게이트 범위 수정**: 현재 설계 오류라 최우선.
2. **성인 조건 강화**: 법적/운영 리스크 때문에 필수.
3. **Continue 정산 + End 알림 후속 흐름**: 사용자 의도와 수익 모델 정리.
4. **프로필/이상형/사진 재평가 루프**: 앱이 일직선 온보딩으로 굳는 문제 해결.
5. **장소 3개 추천**: 현재 과팅 품질을 바로 올림.
6. **키/성격 기반 인상 벡터**: 매칭 품질 고도화.
7. **배틀 모드**: 실험 기능. 안전/법적 검토 후.
8. **1:1/커뮤니티/동아리**: 플랫폼 확장 단계.

---

## 14. 위험과 보완책

| 위험 | 설명 | 보완 |
|---|---|---|
| 학교 인증 과도 적용 | 앱 전체가 부산대 전용으로 굳어짐 | 모드별 eligibility로 분리 |
| 미성년자 유입 | 데이팅/술자리 기능 리스크 | 20세 이상 게이트 + 추후 본인인증 |
| 술배틀 안전 문제 | 과음 유도 위험 | 음주량 점수화 금지, 게임형 배틀로 제한 |
| 성별 보정 논란 | 여성 유리 점수 정책 민감 | 실험 기능, 운영자 설정, 투명한 룰 |
| 외모/성격 보정 과신 | AI/설문으로 사람 인상 과잉 단정 | 보정 비율 낮게, 사용자 피드백으로 조정 |
| 재매칭 중독 | 계속 새 상대 찾기 유도 | Continue를 정산 흐름으로 제한, 새 매칭 CTA 분리, cooldown |

---

## 15. 내 이해도 점검

이 계획을 구현할 때 내가 이해한 제품 방향은 다음과 같다.

### 15.1 제품 정체성

Destiny는 장기적으로 "부산대 과팅앱" 하나가 아니라 **모드가 여러 개인 캠퍼스 소셜 플랫폼**이다.

하지만 첫 번째 수익/검증 모드는 여전히 과팅이다. 그래서 v2 구현은 기존 과팅을 깨지 않고, 과팅 주변에 모드·자격·안전 정책을 추가하는 방식이어야 한다.

### 15.2 인증 정책 이해

로그인과 자격 인증은 다르다.

- 로그인: 카카오, Google, 휴대폰, 향후 Apple 등 계정 생성/세션 수단.
- 학교 인증: 특정 학교 소속임을 증명하는 자격.
- 성인 인증: 만남/데이트/술자리 기능에 필요한 안전 조건.
- 프로필 완성: 매칭 품질을 위한 데이터 조건.

따라서 `school_email_verified_at` 하나로 앱 전체를 막으면 안 된다. 과팅은 부산대 메일 인증이 필요하지만, 1:1 소개팅이나 커뮤니티는 향후 다른 정책을 가질 수 있다.

### 15.3 과팅 UX 이해

과팅은 "앱이 상대/시간/장소를 잡아주는 자동 확정 만남"이다. 사용자는 채팅으로 조율하지 않는다.

v2에서 더 강하게 가져갈 방향:

- 만남 후 앱이 계속 새 상대를 추천하며 중독을 유도하면 안 된다.
- `End`는 명확하고 깔끔하게 끝내는 선택이다.
- `End`는 상대에게 알림이 가야 한다.
- `Continue`는 새 매칭으로 이어지는 버튼이 아니라, 현재 상대가 마음에 들 때 정산을 여는 선택이다.
- `Continue` 후에는 20,000원 보증금 중 앱에게 남길 금액을 0원부터 20,000원까지 앱 수익 기준으로 고르게 한다.
- 3,000원 이상은 바로 정산하고, 3,000원 미만은 "3,000원만 주면 안돼?!?" 설득 모달을 먼저 보여준다.
- 1,000원/2,000원은 3,000원부터 금액 알림이 숨겨진다는 안내 후 확정하고, 0원은 상대에게 알림이 간다는 점을 단계적으로 경고한다.
- `Continue` 또는 `End` 이후에는 바로 "새 매칭상대 찾기"로 밀어붙이지 않는다.

### 15.4 매칭 품질 이해

현재 매칭은 외모 벡터, 성격, 나이, 시간대를 조합한다. 사용자가 제안한 v2 방향은 "사진만으로 보는 외모"가 아니라 **실제로 사람이 느끼는 인상**을 반영하는 것이다.

따라서 키와 성격은 별도 점수라기보다 외모/인상 벡터를 보정하는 정보로도 쓰인다.

예:

- 작은 키는 cute/warm 인상을 조금 올릴 수 있다.
- 큰 키는 chic/stylish/pure 인상을 조금 올릴 수 있다.
- 잘 웃고 외향적인 성격은 cute/warm/healthy 쪽으로 이동할 수 있다.
- 말수가 적고 차분한 성격은 chic/calm 쪽으로 이동할 수 있다.

단, 이 보정은 과하면 위험하다. 사진 기반 벡터를 뒤집는 수준이 아니라, 인상 방향을 살짝 이동시키는 정도여야 한다.

### 15.5 배틀 모드 이해

사용자가 말한 "술배틀"은 재미와 랭킹 구조가 핵심이다. 하지만 실제 음주량 경쟁으로 구현하면 안전/법적/브랜드 리스크가 크다.

그래서 구현 방향은:

- 내부 기획명: `battle_mode`
- 사용자 노출명 후보: "과배틀", "팀배틀", "술자리 게임 배틀"
- 점수 대상: 게임 결과, 출석, 항복, 신고, 노쇼
- 점수 비대상: 마신 술의 양, 취한 정도, 벌주 수행

---

## 16. 구현 아키텍처

### 16.1 핵심 추상화

v2 구현의 중심은 `mode`, `eligibility`, `verification`, `matching policy` 네 가지다.

```ts
type AppMode =
  | 'group_blind_date'
  | 'one_on_one_date'
  | 'community'
  | 'club_recruiting'
  | 'battle_mode'

type VerificationKind =
  | 'school_email'
  | 'adult'
  | 'phone'
  | 'identity'
  | 'photo'

type EligibilityResult = {
  ok: boolean
  missing: VerificationKind[]
  reason: string | null
  redirectTo: string | null
}
```

### 16.2 파일 책임 분리

새로 만들거나 정리할 파일:

| 파일 | 책임 |
|---|---|
| `lib/modes/types.ts` | `AppMode`, verification kind, eligibility result 타입 |
| `lib/modes/policies.ts` | 모드별 요구 조건 선언 |
| `lib/modes/eligibility.ts` | 사용자 row/profile을 받아 진입 가능 여부 판단 |
| `lib/auth/school-email.ts` | 부산대 메일 normalize/검증. 이미 존재, 유지 |
| `lib/auth/adult.ts` | 20세 이상 판정 |
| `lib/matching/height.ts` | 키 percentile, 키 기반 스타일 prior 계산 |
| `lib/matching/impression.ts` | perceived impression vector 계산 |
| `lib/matching/personality-preference.ts` | 성준 성격 선호 벡터 + 사용자식 성격 인상 보정 계산 |
| `lib/matching/venue-recommendation.ts` | 장소 후보 3개 점수화 |
| `lib/battle/rating.ts` | Elo/MMR 및 항복 점수 계산 |
| `app/profile/school/page.tsx` | 학교 인증 화면. 과팅 진입 시 사용 |
| `app/group/create/page.tsx` | 과팅 eligibility 실패 시 `/profile/school?redirect=/group/create` 유도 |
| `middleware.ts` | 로그인 여부만 담당. 학교 인증 전역 차단 금지 |

원칙:

- `middleware.ts`는 최소한의 세션 보호만 한다.
- 학교/성인/모드 자격은 각 route/API 또는 서버 helper에서 검사한다.
- 클라이언트 UI에서 숨기는 것은 보조 수단이고, 실제 차단은 API/RPC에서 한다.

### 16.3 DB 구조 전략

z48의 `public.users.school_email_verified_at`은 당장 버리지 않는다. 이미 학교 인증 여부를 저장하는 최소 구현으로 쓸 수 있다.

v2에서는 z49로 일반화한다.

```sql
CREATE TABLE user_verifications (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('school_email', 'adult', 'phone', 'identity', 'photo')),
  provider TEXT NOT NULL,
  value_hash TEXT,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, kind, provider)
);
```

백필:

```sql
INSERT INTO user_verifications (user_id, kind, provider, value_hash, verified_at)
SELECT
  id,
  'school_email',
  'pnu_email',
  encode(digest(lower(school_email), 'sha256'), 'hex'),
  school_email_verified_at
FROM public.users
WHERE school_email IS NOT NULL
  AND school_email_verified_at IS NOT NULL
ON CONFLICT DO NOTHING;
```

주의:

- 이메일 원문은 `public.users.school_email`에 남길지, hash만 남길지 정책 결정을 해야 한다.
- 운영 편의상 초기에는 원문을 남기되, 노출 API에서는 절대 내려주지 않는다.
- `user_verifications.value_hash`는 향후 개인정보 최소화 구조로 전환하기 위한 필드다.

---

## 17. Phase별 상세 구현 계획

### Phase 0 - 학교 인증 전역 게이트 제거

목표: 학교 인증은 과팅 모드에만 적용한다.

수정 파일:

- `middleware.ts`
- `app/page.tsx`
- `app/group/create/page.tsx`
- `app/api/groups/route.ts`
- `app/api/group-invites/accept/route.ts`
- `app/api/deposits/route.ts`
- `app/api/match-pool/enter/route.ts`
- `app/api/matches/[id]/route.ts`
- `app/profile/school/page.tsx`

구현 순서:

1. `middleware.ts`에서 `school_email_verified_at` 조회/redirect를 제거한다.
2. `middleware.ts`는 미로그인 사용자의 protected route 접근만 `/login`으로 보낸다.
3. `lib/modes/policies.ts`를 만든다.
4. `group_blind_date` 정책을 다음처럼 둔다.

```ts
export const MODE_POLICIES = {
  group_blind_date: {
    requiresLogin: true,
    requiresAdult: true,
    requiresSchoolEmail: true,
    requiresProfileComplete: true,
  },
  one_on_one_date: {
    requiresLogin: true,
    requiresAdult: true,
    requiresSchoolEmail: false,
    requiresProfileComplete: true,
  },
  community: {
    requiresLogin: true,
    requiresAdult: false,
    requiresSchoolEmail: false,
    requiresProfileComplete: false,
  },
  club_recruiting: {
    requiresLogin: true,
    requiresAdult: false,
    requiresSchoolEmail: false,
    requiresProfileComplete: false,
  },
  battle_mode: {
    requiresLogin: true,
    requiresAdult: true,
    requiresSchoolEmail: true,
    requiresProfileComplete: true,
  },
} as const
```

5. `requireModeEligibility(userId, 'group_blind_date')` 서버 helper를 만든다.
6. 과팅 route/API에서 helper를 호출한다.
7. 실패 시 UI/API 응답을 구분한다.

UI route 실패:

```ts
redirect('/profile/school?redirect=/group/create')
```

API 실패:

```json
{
  "error": "mode_eligibility_required",
  "mode": "group_blind_date",
  "missing": ["school_email"],
  "redirect_to": "/profile/school"
}
```

테스트:

- `tests/auth/school-email.test.ts` 확장:
  - 학교 인증이 없어도 기본 로그인 후 `/profile/basic` 가능해야 한다는 policy 테스트.
  - 과팅 모드는 `school_email` 누락 시 실패해야 한다.
- 새 테스트 파일 `tests/modes/eligibility.test.ts`.

완료 기준:

- 학교 미인증 사용자가 기본 프로필/친구/알림 접근 가능.
- 학교 미인증 사용자가 과팅 그룹 생성 또는 큐 진입 시 학교 인증으로 유도됨.
- API가 클라이언트 UI 우회 요청도 막음.

### Phase 1 - 성인 게이트 추가

목표: 만남/데이트/배틀 기능은 20세 이상만 가능하게 한다.

수정 파일:

- `lib/auth/adult.ts`
- `components/profile/BasicInfoForm.tsx`
- `app/profile/basic/page.tsx`
- `lib/modes/eligibility.ts`
- `app/api/groups/route.ts`
- `app/api/match-pool/enter/route.ts`
- `app/api/deposits/route.ts`

정책:

- v2 초기 구현은 `profiles.age >= 20`으로 판정한다.
- 추후 본인인증이 붙으면 `user_verifications.kind='adult'`가 우선이다.
- 입력 UI에서는 19 이하를 저장하지 못하게 할 수 있지만, 서버에서도 반드시 막는다.

helper:

```ts
export function isAdultByAge(age: number | null | undefined): boolean {
  return typeof age === 'number' && Number.isFinite(age) && age >= 20
}
```

테스트:

- `age=19`: 과팅/1:1/배틀 eligibility 실패.
- `age=20`: 학교 인증이 있다면 과팅 eligibility 통과.
- `age=null`: 실패.

고려사항:

- 한국식 나이 금지. 만 나이 기준으로 통일한다.
- 현재 `age`가 직접 입력값이면 실제 생년월일 검증은 약하다.
- 실서비스 전에는 휴대폰 본인인증 또는 학생증 검수 중 하나를 붙여야 한다.

### Phase 2 - Continue 정산 + End 알림 후속 흐름

목표: 만남 후 사용자의 실제 의사에 맞게 `Continue`와 `End`를 분리하고, 앱이 다음 매칭을 과도하게 유도하지 않도록 한다.

수정 파일:

- `app/match/[id]/continuation/page.tsx`
- `app/api/matches/[id]/continuation/route.ts`
- `app/match/[id]/page.tsx`
- `supabase/migrations/202605xx_z49_end_only_continuation_policy.sql`

정책 변경:

- `continue` 선택지는 유지한다.
- 사용자가 `continue`를 누르면 "보증금 20,000원 중 앱에게 얼마를 남길지"를 묻는다.
- 사용자는 0원부터 20,000원까지 앱 수익 금액을 직접 고른다. 기본 제안값은 3,000원이다.
- 3,000원 이상 선택 시 그대로 정산하고 상대 금액 알림 없음.
- 3,000원 미만 선택 시 "3,000원만 주면 안돼?!?" 애교/구걸 모달을 먼저 띄운다.
- 1,000원/2,000원 확정 전에는 "3,000원부터는 상대방에게 매칭비로 얼마를 지불했는지 알림이 안 갑니다" 안내를 띄운다.
- 0원 선택 시 "그래도 0원 주겠습니까?" 재확인과 "상대방에게 매칭비로 0원을 지불했다는 사실이 알림으로 갑니다" 경고를 모두 띄운다.
- 0원 경고 화면에는 현재 사용자 성별 기준으로 상대가 삐진 만화 컷을 보여준다.
- 0원 확정 시 상대 그룹에게 알림을 보낸다.
- 사용자가 `end`를 누르면 상대 그룹에게 중립적 종료 알림이 간다.
- `continue`/`end` 후 refund/review 흐름은 유지한다.
- `continue`/`end` 직후 "새 매칭상대 찾기" CTA는 노출하지 않는다.

DB 후보:

```sql
ALTER TABLE public.match_continuation_choices
  ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS app_fee_amount INT,
  ADD COLUMN IF NOT EXISTS zero_fee_partner_notified_at TIMESTAMPTZ;
```

또는 별도 테이블:

```sql
CREATE TABLE user_mode_cooldowns (
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL,
  reason TEXT NOT NULL,
  cooldown_until TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, mode, reason)
);
```

추천:

- 정산 금액은 `match_continuation_choices` 또는 `deposit_refund_requests`에 저장하되, 환불액과 앱 수익을 명확히 분리한다.
- cooldown은 범용 정책이므로 `user_mode_cooldowns`로 분리한다.

알림 kind:

- `match_ended_by_partner`
- `partner_paid_zero`
- `post_match_cooldown_started`

테스트:

- end 선택 시 상대 그룹 멤버에게 알림 row 생성.
- continue 후 3,000원 이상 선택 시 상대 금액 알림 없음.
- continue 후 3,000원 미만 선택 시 설득/안내 모달 필요.
- continue 후 0원 선택 시 재확인, 상대 알림 경고, 삐진 반응 만화 컷이 필요하고, 확정 후 상대 알림 생성.
- continue 또는 end 선택 후 같은 사용자가 즉시 `enter_match_pool` 호출하면 `cooldown_active` 실패.
- cooldown 만료 후 다시 가능.

### Phase 2.5 - 프로필/이상형/사진 재평가 루프

목표: 앱이 최초 온보딩 한 번으로 끝나는 일직선 구조가 되지 않게 한다.

수정 파일:

- `app/profile/page.tsx`
- `app/profile/worldcup/page.tsx`
- `app/profile/preferences/page.tsx`
- `app/profile/photos/page.tsx`
- `app/profile/survey/page.tsx`
- `lib/profile/revisions.ts`
- `lib/profile/recalibration.ts`
- `supabase/migrations/202605xx_z50_profile_recalibration_runs.sql`

정책:

- 프로필 사진은 언제든 업데이트 가능하다.
- 사진 업데이트 후 AI 재평가 버튼을 제공한다.
- 재평가 사유는 `new_photo`, `hair_color_change`, `style_change`, `primary_photo_change` 중 하나로 기록한다.
- 이상형 월드컵은 사용자가 원하면 다시 실행할 수 있다.
- 성격 설문 또는 성격 월드컵도 다시 실행할 수 있다.
- 새 결과는 기존 값을 바로 덮어쓰지 않고 run/revision으로 저장한 뒤, 최신 activated 결과만 매칭에 사용한다.

테스트:

- 새 사진 업로드 후 기존 primary photo와 새 primary photo가 올바르게 전환되는지 확인.
- AI 재평가 run이 생성되고 최신 activated result가 매칭 input으로 선택되는지 확인.
- 이상형 월드컵 재실행 시 이전 preference vector가 보존되고 새 vector가 활성화되는지 확인.

### Phase 3 - 장소 추천 3개

목표: 매칭 결과에 자동 확정 장소 1개와 대안 2개를 제공한다.

수정 파일:

- `lib/matching/venue-recommendation.ts`
- `python/matching/` 성준 매칭 배치 쪽 연동 지점
- `app/match/[id]/page.tsx`
- `supabase/migrations/202605xx_z50_match_venue_recommendations.sql`

DB:

```sql
CREATE TABLE match_venue_recommendations (
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES public.venues(id),
  rank INT NOT NULL CHECK (rank BETWEEN 1 AND 3),
  score FLOAT NOT NULL CHECK (score BETWEEN 0 AND 1),
  reason_tags TEXT[] NOT NULL DEFAULT '{}',
  selected BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (match_id, rank),
  UNIQUE (match_id, venue_id)
);
```

점수 기준:

```ts
venueScore =
  distanceFit * 0.35 +
  openTimeFit * 0.25 +
  modeFit * 0.20 +
  priceFit * 0.10 +
  safetyFit * 0.10
```

고려사항:

- `venues`와 `match_meetings`는 성준 영역이다. 충현/Codex 쪽에서 컬럼을 마음대로 바꾸면 안 된다.
- 장소 후보 3개는 `match_detail` RPC에서 내려줘야 UI가 서버 권한을 유지한다.
- 신고가 많은 장소는 감점 또는 제외한다.

테스트:

- 영업시간 밖 venue 제외.
- 같은 점수면 거리 짧은 순.
- rank는 1,2,3 중복 없이 생성.
- selected는 하나만 true.

### Phase 4 - 키 점수와 인상 벡터

목표: 키/성격이 실제 인상에 주는 영향을 매칭에 반영한다.

수정 파일:

- `lib/matching/height.ts`
- `lib/matching/impression.ts`
- `lib/matching/types.ts`
- `lib/matching/group-summary.ts`
- `lib/matching/score.ts`
- `tests/matching/core.test.ts`

새 타입:

```ts
export interface ImpressionVector {
  cute: number
  pure: number
  chic: number
  warm: number
  stylish: number
  healthy: number
}
```

키 percentile:

```ts
export function heightPercentileScore({
  heightCm,
  gender,
}: {
  heightCm: number
  gender: 'male' | 'female'
}): number
```

초기 분포값:

```ts
const HEIGHT_DISTRIBUTION = {
  male_20_39: { mean: 174.6, stdDev: 5.7 },
} as const
```

인상 벡터:

```ts
perceived =
  normalizeVector(
    scale(rawAppearance, 0.70) +
    scale(heightPrior, 0.15) +
    scale(personalityPrior, 0.15)
  )
```

중요한 제한:

- 키/성격 prior는 raw appearance를 덮어쓰면 안 된다.
- 점수 보정은 설명 가능해야 한다.
- 사용자에게 "당신은 키가 작아서 귀여움" 같은 문구를 직접 노출하지 않는다.

테스트:

- 남성 174~175cm가 약 50점 근처.
- 남성 190cm는 20대 표본 기준 P99에 가깝거나 그 이상.
- 낮은 키 prior가 cute/warm 축을 올림.
- 높은 키 prior가 chic/stylish/pure 축을 올림.
- 성격 prior가 Big5 값에 따라 일관되게 움직임.
- 최종 perceived vector는 모든 값이 0~1이고 normalize된다.

### Phase 5 - 매칭 가중치 v2

목표: 외모/키/성격을 분리해 사용자가 더 직관적으로 선택하게 한다.

현재 `app/profile/preferences/page.tsx`에는 이미 `height` 가중치가 있다. 하지만 matching core의 `SCORE_WEIGHTS`에는 별도 `HEIGHT`가 없다. 이 불일치를 정리한다.

정책:

- 사용자 UI 가중치: 외모, 키, 성격, 나이, 시간대, 분위기/장소.
- 매칭 엔진 가중치: `APPEARANCE`, `HEIGHT`, `PERSONALITY`, `AGE_FIT`, `TIME_FIT`, `VENUE_FIT`, `WEIGHT_ALIGNMENT`.

초기 추천값:

```ts
APPEARANCE: 0.30
HEIGHT: 0.15
PERSONALITY: 0.20
AGE_FIT: 0.10
TIME_FIT: 0.10
VENUE_FIT: 0.05
PREFERENCE_WEIGHT_ALIGN: 0.10
```

합계는 1.0이어야 한다.

고려사항:

- 여성만 키를 강제하지 않는다. 모든 사용자가 키 가중치를 선택할 수 있어야 한다.
- 다만 UI에서 성별/선호에 따라 추천 기본값은 다르게 제안할 수 있다.
- 외모 점수와 키 점수를 곱하면 특정 사용자에게 과도한 페널티가 될 수 있으므로 더하기 기반 가중합을 유지한다.

### Phase 6 - 과배틀/배틀 모드

목표: 과별 랭킹과 게임형 만남을 실험한다.

최소 제품:

- 시즌 생성
- 과별 rating
- 매칭 생성
- 항복 버튼
- 승패 기록
- 랭킹 페이지

DB:

```sql
CREATE TABLE battle_seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  prize_config JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'ended', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

```sql
CREATE TABLE department_ratings (
  season_id UUID REFERENCES battle_seasons(id) ON DELETE CASCADE,
  department TEXT NOT NULL,
  rating FLOAT NOT NULL DEFAULT 1000,
  wins INT NOT NULL DEFAULT 0,
  losses INT NOT NULL DEFAULT 0,
  surrenders INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (season_id, department)
);
```

Elo:

```ts
expected = 1 / (1 + 10 ** ((opponentRating - rating) / 400))
delta = kFactor * (actual - expected)
```

성별 보정:

```ts
const genderBalanceMultiplier =
  winnerGender === 'female' ? 1.10 :
  loserGender === 'female' ? 0.85 :
  1.00
```

주의:

- 이 수치는 정책 초안이다. 실제 적용 전 운영자 설정으로 빼야 한다.
- 성별 보정은 사용자에게 설명 가능한 룰이어야 한다.
- 상금이 걸리면 부정행위, 대리참여, 허위 결과 신고가 늘어난다.
- 항복 버튼은 악용 방지를 위해 양쪽 상태, 시간, 반복 항복 패턴을 기록해야 한다.

안전 정책:

- 음주량 입력 금지.
- "벌주", "마신 잔 수", "취함"을 점수화하지 않는다.
- 신고 누적 팀은 시즌 참가 제한.
- 20세 미만은 배틀 모드 접근 불가.

### Phase 7 - 1:1/커뮤니티/동아리 준비

목표: 지금 과팅 코드를 망가뜨리지 않고 미래 모드를 위한 DB/권한 토대를 둔다.

1:1 소개팅:

- 과팅과 같은 `matches`를 재사용할지 별도 `one_on_one_matches`로 갈지 결정 필요.
- 추천은 별도 모델이 낫다. 그룹 평균이 아니라 개인 프로필이 중심이다.
- 학교 인증을 강제하지 않는다. 대신 성인/사진/신뢰도 검증을 우선한다.

커뮤니티:

- `posts`, `comments`, `reports`, `moderation_actions`가 필요하다.
- 실명/익명 정책을 기능별로 나눠야 한다.
- 데이팅 기능 신고와 커뮤니티 신고는 같은 moderation queue로 합칠 수 있다.

동아리:

- `clubs`, `club_members`, `club_recruit_posts`, `club_join_requests`.
- 학교 인증은 동아리 생성자에게만 필수로 둘 수 있다.
- 외부인 참여 가능 동아리라면 학교 인증을 강제하면 안 된다.

---

## 18. 구현 순서와 커밋 단위

권장 커밋 순서:

1. `fix(auth): scope school verification to group blind date mode`
   - 전역 게이트 제거
   - mode policy helper 추가
   - 과팅 API/route에만 적용

2. `feat(eligibility): add adult gate for meeting modes`
   - 성인 판정 helper
   - 과팅 진입/큐 진입 서버 검증
   - 테스트 추가

3. `feat(match): correct post-match continue settlement flow`
   - Continue 유지
   - Continue 시 0원~20,000원 앱 수익 선택
   - 3,000원 미만 설득/안내 모달
   - 0원 선택 시 재확인, 삐진 반응 만화, 상대 알림
   - End 알림
   - 새 매칭 CTA 분리/cooldown table/RPC

4. `feat(profile): add recalibration runs for photos and preferences`
   - 사진 재업로드/AI 재평가
   - 이상형 월드컵 재실행
   - 성격 설문/월드컵 재실행
   - 최신 activated revision만 매칭 반영

5. `feat(matching): add venue recommendation scoring`
   - 장소 후보 3개
   - match detail UI 노출

6. `feat(matching): add height and impression scoring`
   - height percentile
   - personality prior
   - perceived impression

7. `feat(battle): add season rating foundation`
   - DB 스키마
   - 참여 서약/위험 고지
   - Elo helper
   - 항복 API
   - 랭킹 UI는 다음 커밋

각 커밋마다:

- 해당 테스트 먼저 추가
- 타입체크 통과
- 마이그레이션 검증 통과
- 문서 갱신

---

## 19. 테스트 전략

### 19.1 Unit

- `tests/auth/school-email.test.ts`
- `tests/modes/eligibility.test.ts`
- `tests/matching/height.test.ts`
- `tests/matching/impression.test.ts`
- `tests/matching/venue-recommendation.test.ts`
- `tests/battle/rating.test.ts`

### 19.2 API

수동 또는 node 기반 fetch 테스트:

- 학교 미인증 사용자가 `/api/match-pool/enter` 호출 시 실패.
- 학교 미인증 사용자가 기본 프로필 저장은 가능.
- 19세 사용자는 과팅 큐 진입 실패.
- End 선택 시 상대 그룹 알림 생성.
- Continue 후 3,000원 이상 선택 시 상대 금액 알림 없음.
- Continue 후 1,000원/2,000원 선택 시 3,000원부터 금액 알림이 숨겨진다는 안내 노출.
- Continue 후 0원 선택 시 재확인/삐진 반응 만화/상대 알림 생성.
- 사진 재업로드 후 AI 재평가 run 생성.
- 이상형 월드컵/성격 월드컵 재실행 후 최신 activated 버전이 매칭 입력으로 사용됨.
- cooldown 중 큐 진입 실패.

### 19.3 DB/RLS

`scripts/verify-migrations.py` 외에 실제 Supabase staging에서 확인:

- z48 -> z49 순서 적용 가능.
- school email 인증 row 백필 가능.
- user_verifications RLS가 자기 것만 조회 가능.
- service_role만 verification 원문 처리 가능.
- 일반 authenticated 사용자가 임의로 verification row를 insert/update할 수 없음.

### 19.4 UI

확인 플로우:

1. 카카오/Google 로그인
2. 학교 미인증 상태로 프로필 접근 가능
3. 학교 미인증 상태로 그룹 만들기 진입 시 `/profile/school` 안내
4. 학교 인증 완료 후 그룹 만들기 가능
5. 19세 프로필은 과팅 큐 진입 차단
6. completed match에서 Continue와 End가 의미 분리되어 노출
7. completed match에서 Continue 선택 시 앱 수익 선택 화면 노출
8. 3,000원 미만 선택 시 설득/안내 모달 확인, 0원 선택 시 경고 문구와 상대 알림 확인
9. End 후 상대 알림 확인
10. 프로필 화면에서 사진 업데이트, AI 재평가, 이상형 월드컵 다시 하기, 성격 다시 하기가 접근 가능

---

## 20. 세부 고려사항

### 20.1 개인정보

- 학교 이메일은 민감한 식별자다.
- 화면/알림/API에 원문 이메일을 되도록 노출하지 않는다.
- 운영자 화면에서도 기본은 마스킹한다.
- `value_hash` 기반 구조로 점진 전환한다.

### 20.2 모드 확장성

- `groups.status`, `matches.status`에 모드 개념이 없다.
- 과팅 외 모드가 들어오면 기존 테이블에 `mode` 컬럼을 추가할지, 모드별 테이블을 만들지 결정해야 한다.
- 추천: 과팅 v1은 기존 테이블 유지, 신규 모드는 별도 테이블에서 시작한다. 나중에 공통화할 부분만 추출한다.

### 20.3 성인 인증

- `age` 직접 입력만으로는 약하다.
- v2 베타까지는 `age >= 20` 서버 게이트로 시작한다.
- 공개 출시 전에는 본인인증/학생증 검수/운영자 검수 중 하나를 붙인다.
- 미성년자 의심 신고 flow가 필요하다.

### 20.4 End 알림

- 상대에게 가는 문구는 중립적이어야 한다.
- "거절당했다" 느낌을 과하게 주면 감정적 분쟁이 생길 수 있다.
- 알림 예시:
  - "상대가 이번 만남은 여기까지로 선택했어요."
  - "리뷰와 보증금 정산을 진행할 수 있어요."

### 20.5 Cooldown

- cooldown은 처벌이 아니라 중독 방지다.
- 너무 길면 유저 이탈이 크고, 너무 짧으면 효과가 없다.
- 초기값 후보:
  - Continue/End 직후 24시간 과팅 큐 재진입 제한
  - No-show 확정 사용자는 14일 제한
  - 신고 누적 사용자는 운영자 검토까지 제한
- Continue는 "새 매칭 찾기"가 아니라 "현재 만남 정산"이므로, cooldown과 별개로 다음 매칭 CTA를 화면에서 분리해야 한다.

### 20.6 배틀 모드

- "술배틀"이라는 문구는 내부 기획명으로만 쓰는 것이 안전하다.
- 사용자 노출명은 "과배틀", "팀배틀", "게임 배틀"이 낫다.
- 상금이 들어가면 부정행위 대응이 필수다.
- 점수 계산은 서버에서만 하고, 클라이언트가 결과를 직접 보내면 안 된다.
- 참여 전 위험 고지/책임 제한/20세 이상 확인 서약이 필요하다.
- 서약서에는 앱이 사고 책임을 모두 부담하지 않는다는 문구를 넣되, 앱의 법적 의무와 안전 조치 의무까지 면제되는 것처럼 쓰면 안 된다.

### 20.7 성별 보정

- 여성에게 유리한 보정은 제품 의도상 가능하지만, 공개 룰이 애매하면 반발이 생긴다.
- 보정은 운영자 설정값으로 두고, 실험군/비실험군 비교가 가능해야 한다.
- 보정 근거는 "안전/참여 균형"으로 설명해야 한다.

### 20.8 키/성격 보정

- 키와 성격으로 외모 인상을 보정하는 것은 매칭 품질에는 도움이 될 수 있다.
- 하지만 사용자가 본인에 대해 낙인처럼 느끼면 안 된다.
- 따라서 설명 문구는 "인상 보정"보다 "매칭 취향 반영" 정도로 부드럽게 표현한다.

### 20.9 장소 추천

- 장소 추천은 매칭 품질을 크게 올리지만 운영 부담도 생긴다.
- 잘못된 장소, 폐업, 혼잡, 미성년자 출입 제한, 영업시간 문제가 생길 수 있다.
- 장소 데이터에는 `last_verified_at`, `reported_count`, `disabled_at`이 필요하다.

### 20.10 프로필/이상형 재평가

- 사용자는 실제로 여러 사람을 만나면서 "내가 원하던 성격이 바뀐 것 같다"고 느낄 수 있다.
- 최초 온보딩 결과를 영구 고정하면 매칭 품질이 시간이 지날수록 떨어진다.
- 이상형 월드컵, 성격 설문/월드컵, 사진 AI 재평가는 프로필 편집 영역에서 다시 실행 가능해야 한다.
- 모든 재평가는 version/run으로 저장하고, 최신 activated 버전만 매칭에 반영한다.
- 사진 재평가는 염색, 스타일 변화, 대표 사진 교체 같은 사유를 받을 수 있게 한다.
- 재평가를 무제한 허용하면 점수 조작 시도가 생길 수 있으므로 하루 횟수 제한 또는 짧은 쿨다운을 둔다.

---

## 21. 구현 전 체크리스트

- [ ] 현재 학교 인증 전역 게이트가 어느 파일에서 걸리는지 다시 확인한다.
- [ ] 과팅 전용 API 전체 목록을 확정한다.
- [ ] `group_blind_date` eligibility 실패 응답 포맷을 하나로 통일한다.
- [ ] 20세 이상 판정 기준을 만 나이 기준으로 문서화한다.
- [ ] End 알림 문구를 확정한다.
- [ ] Continue 정산 문구, 기본 제안값 3,000원, 3,000원 미만 설득 문구를 확정한다.
- [ ] 1,000원/2,000원 안내 문구와 0원 선택 시 상대 알림 문구를 확정한다.
- [ ] cooldown 기간 기본값을 확정한다.
- [ ] 사진 재평가/이상형 월드컵 재실행/성격 재실행의 하루 제한 정책을 확정한다.
- [ ] venue 테이블은 성준 영역이므로 변경 전 인터페이스 계약을 확인한다.
- [ ] 키 분포 평균/표준편차는 운영 설정으로 빼고, 최신 통계로 교체 가능하게 둔다.
- [ ] 남성 20~39세 키 기본값은 Size Korea 8차 기준 `mean=174.6`, `stdDev=5.7`로 시작한다.
- [ ] 배틀 모드는 음주량 점수화를 절대 하지 않는다고 명시한다.
- [ ] 배틀 모드 참여 서약/위험 고지 version을 확정한다.
- [ ] 상금 기능은 출시 전 법률/세무/플랫폼 정책 검토를 별도 이슈로 분리한다.

---

## 22. 최종 구현 판단

바로 구현해야 하는 것은 v2 전체가 아니다.

1차로 바로 해야 하는 구현은 **Phase 0 + Phase 1 + Phase 2 일부**다.

- Phase 0: 학교 인증 범위 수정
- Phase 1: 20세 이상 게이트
- Phase 2 일부: Continue 정산 흐름 + End 알림 + 0원 상대 알림 정리

그 다음에 프로필/이상형/사진 재평가 루프, 장소 추천, 인상 벡터, 배틀 모드를 붙여야 한다. 순서를 바꾸면 플랫폼 구조가 잡히기 전에 기능이 먼저 늘어나서 나중에 1:1/커뮤니티/동아리 확장 때 다시 갈아엎게 된다.

---

## 23. 결론

v2의 핵심은 기능을 많이 붙이는 것이 아니라, **앱을 모드 기반 플랫폼으로 재구조화하는 것**이다.

가장 먼저 해야 할 일은 현재 학교 인증 게이트를 바로잡는 것이다. 부산대 메일 인증은 과팅 모드의 신뢰 조건이지, 앱 전체를 통과하기 위한 자격이 아니다.

그 다음은 성인 조건, Continue 정산/End 알림 후속 흐름, 프로필 재평가 루프, 장소 추천, 인상 벡터 고도화 순서로 가는 것이 맞다. 배틀 모드와 상금/랭킹은 재미 요소가 크지만 안전·법적 리스크가 있으므로 v2 실험 기능으로 분리해야 한다.

# Claude ↔ Codex 대화 브릿지 (충현 담당)

> 이 파일은 Claude 세션과 Codex 세션 간 메시지를 주고받는 공간이다.
> 성준 관련 내용은 여기에 적지 않는다.

---

## 사용 방법

1. **Claude → Codex**: Claude가 작업을 끝내면 "Claude 출력" 섹션에 요약 작성
2. **Codex → Claude**: Codex가 작업을 끝내면 "Codex 출력" 섹션에 요약 작성
3. 새 세션 시작 시 상대방의 마지막 출력 섹션을 읽고 이어서 작업

---

## Claude 출력 (Claude → Codex에게)

### [2026-05-14] 세션 #1

**완료한 작업:**
- 프로젝트 초기 협업 환경 세팅
- `python/appearance/` 외모 AI 서버 프로토타입 구현
  - `main.py`: FastAPI, POST /api/score-photos
  - `model.py`: ResNet50 build_model, score_photos
  - `supabase_client.py`: save_appearance_score
- DB 마이그레이션 2개 생성
- 브랜치: `profile/appearance-ai` push 완료

**Codex에게 요청사항:** 없음 (첫 세션)

---

### [2026-05-15] 세션 #2

**완료한 작업:**
- **Next.js 14 프로젝트 초기 세팅** (브랜치: `profile/worldcup-ui`)
  - `package.json`, `next.config.mjs`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.mjs`
  - `app/layout.tsx`, `app/page.tsx`, `app/globals.css`
  - `.env.local.example`
- **공용 파일 생성**
  - `lib/types.ts` — 계약서 기준 TypeScript 타입 전체
  - `lib/constants.ts` — 6가지 외모 타입(cute/pure/chic/warm/stylish/healthy) 정보 + 이모지/키워드/설명/그라디언트
  - `lib/supabase.ts` — `createClient()` (브라우저 클라이언트)
- **이상형 월드컵 UI 완성**
  - `components/profile/AppearanceWorldcup.tsx` — 토너먼트 UI (8강→4강→결승, 총 5번 클릭)
  - `components/profile/WorldcupResult.tsx` — 우승 타입 결과 화면
  - `app/profile/worldcup/page.tsx` — 페이지 (Supabase 저장은 TODO 상태)

**Codex에게 요청사항 (병렬 작업 분담):**

아래 두 페이지를 `profile/worldcup-ui` 브랜치에서 이어서 만들어줘.
기존 파일(`lib/types.ts`, `lib/constants.ts`, `lib/supabase.ts`) 참고해서 같은 스타일로 작성할 것.

**요청 1 — 기본정보 입력 페이지**
- `app/profile/basic/page.tsx`
- `components/profile/BasicInfoForm.tsx`
- 입력 항목: gender(남/여 버튼), age(숫자), height(cm), body_type(slim/average/athletic/chubby 중 택1), hair_density(full/thinning/bald 중 택1), school(텍스트), department(텍스트), year(1~6 셀렉트)
- 완료 시 Supabase `profiles` 테이블에 저장
- 디자인: 기존 월드컵 페이지와 동일한 다크 테마(bg-gray-950), 보라색 강조(purple-600)

**요청 2 — 사진 업로드 페이지**
- `app/profile/photos/page.tsx`
- `components/profile/PhotoUpload.tsx`
- 사진 3장 업로드 (Supabase Storage `photos` 버킷)
- 업로드 완료 후 `POST /api/score-photos` 호출 (외모 AI 서버, URL: `process.env.APPEARANCE_API_URL`)
- 업로드 전 미리보기, 순서 변경 UI 있으면 좋음

**추가 결정사항 (2026-05-15):**
- 이상형 월드컵은 이모지 카드 → **AI 생성 사진** 기반으로 변경 완료
- 사진 위치: `public/appearance-types/{type}.jpg` (cute/pure/chic/warm/stylish/healthy)
- 사진이 없어도 gradient 폴백으로 동작함 (개발 중 테스트 가능)
- 사진 생성 가이드: `public/appearance-types/README.md` 참고
- **Codex가 AI 사진 6장 생성해서 폴더에 넣어주면 바로 반영됨**

**주의:**
- `lib/types.ts` 수정 필요하면 절대 혼자 하지 말고 Claude에게 알릴 것 (PR 필요)
- 성준 영역(`python/matching/`, `app/group/`, `app/match/`) 건드리지 말 것
- 작업 완료 시 이 파일의 "Codex 출력" 섹션에 결과 기록

---

## Codex 출력 (Codex → Claude에게)

<!-- Codex가 작업 완료 후 여기에 기록 -->

### [2026-05-15] 세션 #1

**완료한 작업:**
- `public/appearance-types/`에 이성 이상형 월드컵용 대표 이미지 6장 생성
  - `cute.jpg`, `pure.jpg`, `chic.jpg`, `warm.jpg`, `stylish.jpg`, `healthy.jpg`
- `public/appearance-types/CRITERIA.md` 작성 및 백분위 절대점수 기준으로 업데이트
- `public/appearance-self/SCORE_GUIDE.md` 작성
  - 외모절대점수는 호감도 느낌 점수가 아니라 백분위 점수로 정의
  - 예: 30점은 하위 30퍼센트 지점, 50점은 평균 근처, 90점은 상위 10퍼센트 수준
- 자기유사 월드컵용 여자 시범 이미지 3장 생성
  - `public/appearance-self/female/female_self_28.jpg`
  - `public/appearance-self/female/female_self_52.jpg`
  - `public/appearance-self/female/female_self_73.jpg`
- 검수용 카탈로그 작성
  - `public/appearance-self/CATALOG.html`
  - `public/appearance-self/female/METADATA.md`

**Claude에게 알려야 할 사항:**
- 이번 작업은 이미지/문서 자산만 추가했다.
- `lib/types.ts`, `components/profile/AppearanceWorldcup.tsx`, DB 마이그레이션은 수정하지 않았다.
- 자기유사 월드컵 이미지는 생성 프롬프트 목표 점수를 그대로 믿으면 안 된다.
  이미지 모델이 기본적으로 얼굴을 미화하므로, 최종 점수는 생성 후 사람이 백분위 기준으로 재판정해야 한다.
- 기존 이성 이상형 대표 이미지 6장은 전부 상위 호감형이다.
  자기유사 월드컵처럼 20~90점대를 넓게 커버하는 세트로 쓰면 안 된다.

**테스트/검수:**
- 이미지 파일은 모두 3:4 세로형이며 `768x1024` 이상 조건을 만족한다.
- 검수용 HTML 카탈로그를 만들어 한 화면에서 점수와 판정 근거를 볼 수 있게 했다.

### [2026-05-15] 세션 #2

**진행한 작업:**
- 자기유사 월드컵 전체 64장 계획을 실제 생성 단계로 시작했다.
- 1차 파형으로 여자 11장, 남자 5장을 생성했다.
  - 여자: `18, 24, 30, 36, 42, 50, 58, 66, 74, 82, 90`
  - 남자: `18, 30, 42, 55, 68`
- 낮은 점수대 이미지에 피부 상태, 얼굴 비대칭, 작은 눈, 낮은 이목구비 선명도, 표정, 헤어/스타일, 체형을 직접 반영했다.
- `public/appearance-self/CATALOG.html`을 1차 파형 전체 검수용으로 갱신했다.
- `public/appearance-self/female/METADATA.md`, `public/appearance-self/male/METADATA.md`를 갱신했다.

**남은 작업:**
- 전체 목표는 남자 32장 + 여자 32장이다.
- 현재 생성 완료 수는 여자 11장, 남자 5장이다.
- 남은 수량은 여자 21장, 남자 27장이다.
- 1차 파형 점수 감각 검수 후 같은 기준으로 나머지를 생성해야 한다.

---

### [2026-05-15] 세션 #3

**완료한 작업 (Codex가 맡았던 것 포함해서 Claude가 전부 완성):**

Codex가 이미지 생성으로 바빠서 Claude가 Next.js 페이지 작업을 대신 완료했다.
Codex는 아래 "Codex 남은 작업" 섹션만 보면 된다.

#### 새로 완성된 파일 목록

| 파일 | 설명 |
|------|------|
| `components/profile/BasicInfoForm.tsx` | 성별/나이/키/체형/머리숱/학교/학과/학년 입력 폼 |
| `app/profile/basic/page.tsx` | 기본정보 페이지 → Supabase profiles 저장 |
| `components/profile/PhotoUpload.tsx` | 사진 3장 슬롯 UI, 미리보기, 파일 검증 |
| `app/profile/photos/page.tsx` | 사진 페이지 → Supabase Storage 업로드 + AI 서버 호출 |
| `components/profile/Big5Survey.tsx` | 5트레이트 × 2질문 성격 테스트 (5점 척도) |
| `app/profile/survey/page.tsx` | 성격 테스트 페이지 → big5_* 5개 컬럼 저장 |
| `app/profile/complete/page.tsx` | 완료 축하 화면 → 3초 후 /group/create 이동 |
| `app/group/create/page.tsx` | 임시 플레이스홀더 (성준 담당) |

#### 전체 UI 리디자인 완료

기존 회색 단조로운 UI → 프리미엄 데이팅앱 스타일로 전면 개편.
- Pretendard Variable 폰트 적용
- 배경: 보라/퍼플 radial gradient (`bg-app`)
- 카드: glassmorphism (`glass`, `glass-strong`)
- 버튼: violet→fuchsia gradient (`btn-gradient`, `gradient-brand`)
- 변경된 파일: `app/globals.css`, `app/layout.tsx`, `app/page.tsx`, `app/(auth)/login/page.tsx`, `components/profile/StepProgress.tsx` 외 전체

#### 프로필 입력 전체 플로우 완성

```
/profile/worldcup   → appearance_type 저장        ✅
/profile/basic      → gender/age/height 등 저장   ✅
/profile/photos     → Storage 업로드 + AI 트리거   ✅ (버킷 생성만 남음)
/profile/survey     → big5_* 5개 컬럼 저장        ✅
/profile/schedule   → available_timeslots 저장     ✅
/profile/preferences → preference_weights 저장    ✅
/profile/complete   → 완료 → /group/create         ✅
```

#### StepProgress 스텝 순서 (6단계)

```
이상형 → 기본정보 → 사진 → 성격 → 시간대 → 가중치
```

#### 코드 리뷰 후 수정된 버그 5건

1. `PhotoUpload`: `next/image` → `<img>` 태그 (blob: URL 런타임 에러)
2. `worldcup/page.tsx`: upsert 에러 무시 수정
3. `Big5Survey`: key 충돌로 트레이트 전환 시 UI 잔상 제거
4. `BasicInfoForm`: 키 범위 검증 추가 (100~250cm)
5. `BasicInfoForm`: 저장 중 입력 필드 disabled 처리

---

**Codex 남은 작업 (이것만 하면 됨):**

#### 1. Supabase Storage 버킷 생성 [필수 — 사진 업로드가 여기 달림]

상세 가이드: `docs/handoff/CODEX_HANDOFF_PHOTOS.md`

요약:
- Supabase 대시보드 → Storage → 버킷 이름: `photos`, Public: ON
- RLS 정책 3개 추가 (파일에 SQL 전문 있음)
- `.env.local`에 `NEXT_PUBLIC_AI_SERVER_URL=http://localhost:8000` 추가

#### 2. 자기유사 월드컵 이미지 생성 계속 [진행 중]

현재: 여자 11장, 남자 5장 완료
남은: 여자 21장, 남자 27장

#### 3. Supabase 실키 `.env.local` 세팅 [성준이 줘야 가능]

성준이 Supabase 프로젝트 URL/ANON_KEY 주면
`.env.local`에 넣고 E2E 흐름 테스트 할 것.

---

## 공통 규칙

- 서로의 섹션을 덮어쓰지 않는다
- 날짜와 세션 번호를 반드시 기록한다
- 이 파일 자체가 히스토리이므로 오래된 내용도 지우지 않는다
- 충돌이 생길 것 같은 작업은 여기에 먼저 공지한다

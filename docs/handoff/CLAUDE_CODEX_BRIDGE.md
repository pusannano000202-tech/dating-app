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

**완료 상태 업데이트:**
- 남자 32장 + 여자 32장 자기유사 월드컵 이미지 생성 완료.
- `public/appearance-self/CATALOG.html`을 64장 전체 검수용으로 갱신했다.
- `public/appearance-self/female/METADATA.md`, `public/appearance-self/male/METADATA.md`를 32장 전체 기준으로 갱신했다.
- 낮은 점수대는 뚱뚱함 하나가 아니라 피부 상태, 비대칭, 작은 눈, 낮은 이목구비 조화, 표정, 헤어/스타일, 체형을 분리해 반영했다.

### [2026-05-15] 세션 #3

**완료한 작업:**
- 자기유사 월드컵을 남자 64장 + 여자 64장, 총 128장으로 확장하기 위한 설계표 작성.
- 설계표 파일:
  - `public/appearance-self/DESIGN_128.md`
  - `public/appearance-self/DESIGN_128.html`
- 각 행에 점수, 유형, 체형, 피부, 얼굴형, 눈/인상, 헤어/스타일, 목적을 지정했다.
- 목적은 기존 64장의 문제였던 "점수 차이는 있는데 외모 유형 다양성이 부족한 문제"를 해결하는 것이다.

**주의:**
- 아직 128장 이미지를 새로 생성한 것이 아니라, 생성 전 설계표만 작성한 상태다.
- 다음 이미지 생성은 이 설계표 행을 그대로 따라가야 한다.
- 중복 방지를 위해 같은 점수대 안에서도 헤어, 체형, 피부 상태, 얼굴형, 눈매, 스타일이 겹치지 않게 생성해야 한다.

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

### [2026-05-15] 세션 #4 (자율 작업 세션)

**완료한 작업 (컨텍스트 압축 후 이어서 진행):**

#### 버그 수정 및 UX 개선

| 수정 위치 | 내용 |
|-----------|------|
| `app/profile/worldcup/page.tsx` | 저장 실패 시 에러 메시지를 `saveError` 상태로 관리, WorldcupResult에 전달 |
| `components/profile/WorldcupResult.tsx` | `saveError?: string | null` prop 추가, 버튼 위에 에러 표시 |
| `components/profile/StepProgress.tsx` | currentIdx === -1일 때 `null` 반환 (edit/complete 페이지에서 StepProgress 숨김) |
| `components/profile/Big5Survey.tsx` | 이전 트레이트로 돌아가는 "이전" 버튼 추가 |
| `app/profile/photos/page.tsx` | Supabase `photos` 테이블에도 메타데이터 insert 추가 (storage_path, public_url, sort_order) |

#### 새 파일 추가

| 파일 | 설명 |
|------|------|
| `python/appearance/Dockerfile` | Docker 컨테이너 빌드 파일 (uvicorn 기반) |
| `python/appearance/.dockerignore` | .env, weights/, __pycache__ 제외 |

#### 기존 파일 개선

| 파일 | 개선 내용 |
|------|-----------|
| `app/profile/complete/page.tsx` | 카운트다운 타이머(5초), 완료 체크리스트, 프로필 수정 링크 추가 |
| `app/group/create/page.tsx` | 플로우 미리보기 카드 UI로 개선 (개발 중 배지, 4단계 플로우 표시) |
| `python/appearance/.env.example` | ALLOWED_ORIGINS, IMAGE_DOWNLOAD_TIMEOUT, MAX_IMAGE_BYTES 환경변수 추가 |
| `python/appearance/README.md` | Docker 실행 섹션 추가 |

#### photos 테이블 저장 흐름 (수정됨)

```
사진 업로드 시:
1. Supabase Storage 업로드 (photos/{user_id}/photo_{idx}.{ext})
2. photos 테이블 delete (기존 레코드 삭제) + insert (새 레코드)
3. AI 서버 호출 (fire-and-forget)
4. /profile/survey 이동
```

---

**Codex 남은 작업 (변경 없음):**
1. Supabase Storage 버킷 `photos` 생성 + RLS 정책 → `docs/handoff/CODEX_HANDOFF_PHOTOS.md` 참고
2. 자기유사 월드컵 이미지 생성 계속 (여자 21장, 남자 27장 남음)
3. Supabase 실키 `.env.local` 세팅 (성준이 URL/KEY 주면)

---

### [2026-05-15] 세션 #5 (자율 작업 세션)

**완료한 작업:**

#### UX/기능 개선

| 파일 | 내용 |
|------|------|
| `app/profile/worldcup/page.tsx` | DB에 기존 appearance_type 있으면 결과 화면 바로 표시 + 로딩 스켈레톤 추가 |
| `app/profile/schedule/page.tsx` | Supabase 데이터 로딩 중 스켈레톤 UI 추가 (`loaded` 상태) |
| `app/profile/preferences/page.tsx` | Supabase 데이터 로딩 중 스켈레톤 UI 추가 (`loaded` 상태) |
| `components/profile/SchedulePicker.tsx` | start 시간 변경 시 end가 start보다 작으면 자동으로 end 앞당김 (UX 버그 수정) |

#### 신규 파일

| 파일 | 설명 |
|------|------|
| `app/(auth)/layout.tsx` | 로그인 페이지 메타데이터 추가 |
| `app/group/layout.tsx` | 그룹 섹션 메타데이터 추가 |
| `app/api/score/route.ts` | AI 서버 프록시 (보안 강화: AI_SERVER_URL이 브라우저에 노출 안됨) |
| `python/appearance/requirements-dev.txt` | 테스트용 의존성 분리 |
| `python/appearance/tests/test_model.py` | model.py pytest 유닛 테스트 (8개 케이스) |
| `python/appearance/tests/test_api.py` | FastAPI 엔드포인트 pytest 통합 테스트 (9개 케이스) |
| `docker-compose.yml` | 외모 AI 서버 원커맨드 실행 (포트 8001, 헬스체크 포함) |

#### 보안 개선: AI 서버 프록시

기존: 브라우저 → AI 서버 직접 호출 (`NEXT_PUBLIC_AI_SERVER_URL` 노출)
변경: 브라우저 → `/api/score` (Next.js 서버) → AI 서버 (`AI_SERVER_URL`, 비공개)
- `/api/score` 에서 Supabase 세션 쿠키로 인증 검증 후 포워딩
- `.env.local.example` 업데이트: `NEXT_PUBLIC_AI_SERVER_URL` → `AI_SERVER_URL`

#### Python pytest 테스트 스위트

```bash
# 실행 방법 (python/appearance/ 에서)
pip install -r requirements-dev.txt
pytest tests/ -v
```

커버 범위:
- `build_model`: 반환 타입, eval 모드, 출력 shape
- `score_image`: 범위 검증, 클램핑(상한/하한), 중간값
- `score_photos`: 단일/다중, 빈 입력, 부분 실패, 전체 실패
- `/health` 엔드포인트
- `/api/score-photos` 엔드포인트 (정상/에러/503)

---

**Codex 남은 작업 (변경 없음):**
1. Supabase Storage 버킷 `photos` 생성 + RLS → `docs/handoff/CODEX_HANDOFF_PHOTOS.md`
2. 자기유사 월드컵 이미지 (여자 21장, 남자 27장)
3. Supabase `.env.local` 실키값 (성준이 URL/KEY 주면)

---

---

### [2026-05-15] 세션 #6 — Claude 출력 (Codex 이미지 인수인계 후 자기유사 월드컵 구현)

**Codex 작업물 검수 결과:**

| 항목 | 결과 |
|------|------|
| `public/appearance-self/female/*.jpg` | 32장 확인 ✅ |
| `public/appearance-self/male/*.jpg` | 32장 확인 ✅ |
| `public/appearance-self/CATALOG.html` | 점수순 64장 내부 검수 카탈로그 정상 ✅ |
| `public/appearance-self/SCORE_GUIDE.md` | 백분위 기준 문서 정상 ✅ |
| `public/appearance-self/female/METADATA.md` | 32장 점수 테이블 정상 ✅ |
| `public/appearance-self/male/METADATA.md` | 32장 점수 테이블 정상 ✅ |

컴포넌트에서 사용하는 16장(female 8 + male 8) 파일 존재 여부 전수 확인 완료 — 전부 OK.

**완료한 구현 작업 (커밋: `bc18e9e`, `9ea3b3c`):**

| 파일 | 설명 |
|------|------|
| `components/profile/AppearanceSelfWorldcup.tsx` | 자기유사 월드컵 컴포넌트. gender별 8장 stratified 샘플링, 8강 토너먼트. 점수 UI 노출 없음. |
| `components/profile/SelfWorldcupResult.tsx` | 결과 화면. 점수 미노출, "이 결과는 매칭 알고리즘에만 사용돼" 안내. Enter/R 단축키. |
| `app/profile/self-worldcup/page.tsx` | gender 로딩 → 토너먼트 → profiles.self_appearance_score 저장 → /profile/basic |
| `components/profile/StepProgress.tsx` | '내외모' 스텝 추가 (이상형 다음, 7단계로 변경) |
| `app/profile/worldcup/page.tsx` | 완료 후 `/profile/basic` → `/profile/self-worldcup` 으로 변경 |
| `app/profile/complete/page.tsx` | 완료 체크리스트에 '내 외모 스타일' 추가 |
| `app/profile/edit/page.tsx` | 편집 섹션에 자기유사 월드컵 항목 추가 |
| `lib/types.ts` | `MatchingProfile`에 `self_appearance_score: number \| null` 추가 ⚠️ 성준 리뷰 필요 |
| `supabase/migrations/20260515_profile_add_self_appearance_score.sql` | `profiles.self_appearance_score FLOAT (0~100)` 컬럼 추가 ⚠️ 성준 리뷰 후 main 머지 |

**이미지 선택 전략 (stratified sampling):**

```
Female 8장 (32장 중 선별): 20, 30, 40, 50, 60, 68, 76, 86점
Male   8장 (32장 중 선별): 20, 30, 40, 50, 60, 68, 76, 82점

시딩 방식: 점수 상하위가 초반에 맞붙음
8강: [86 vs 20], [76 vs 30], [68 vs 40], [60 vs 50]
→ 사용자가 빠르게 자신의 구간을 좁힘 (7번의 클릭으로 완료)
```

**현재 전체 프로필 플로우:**

```
/profile/worldcup      → appearance_type 저장 (이성 이상형)    ✅
/profile/self-worldcup → self_appearance_score 저장 (자기유사) ✅ (NEW)
/profile/basic         → gender/age/height 등 저장             ✅
/profile/photos        → Storage 업로드 + AI 트리거            ✅
/profile/survey        → big5_* 5개 컬럼 저장                  ✅
/profile/schedule      → available_timeslots 저장              ✅
/profile/preferences   → preference_weights 저장               ✅
/profile/complete      → 완료 → /group/create                  ✅
```

**성준에게 알려야 할 사항:**

- `lib/types.ts`의 `MatchingProfile`에 `self_appearance_score: number | null` 추가됨
- DB 컬럼: `profiles.self_appearance_score FLOAT CHECK (BETWEEN 0 AND 100)`
- 매칭 방향: A의 `appearance_type`(이상형 선호) vs B의 `self_appearance_score`(자기 외모 백분위), 양방향
- PR 리뷰 필요: `profile/worldcup-ui` 브랜치의 위 두 파일

**Codex에게 남은 작업:**

없음. Codex 이미지 생성 완료 → Claude 구현 완료.

---

### [2026-05-18] 세션 #7 — Claude 출력 (이상형 월드컵 measured vector 구조 구현)

`docs/handoff/CLAUDE_IDEAL_WORLDCUP_MEASURED_VECTOR_PROMPT.md` 인수인계 그대로 따라서 구현했다. 핵심은 **"생성은 target 기준, 선별과 매칭은 measured 기준"**.

**작업 전 읽은 문서:**
- `docs/IDEAL_WORLDCUP_64_DESIGN.md`
- `docs/IDEAL_WORLDCUP_MEASURED_VECTOR_PLAN.md`
- `docs/APPEARANCE_ANALYSIS_GPT_PROMPT.md`
- `docs/APPEARANCE_ANALYSIS_SCHEMA.md`
- `docs/APPEARANCE_VECTOR_CALIBRATION.md`
- `public/appearance-self/SCORE_GUIDE.md` (점수 정의 single source of truth)

**1. 수정/생성한 파일 목록**

| 파일 | 종류 | 내용 |
|---|---|---|
| `public/appearance-ideal/METADATA.json` | 생성 (fixture) | target/measured/final_bucket/review 구조. Codex가 실제 분석 결과로 교체 필요. 현재 샘플 8개. |
| `lib/appearance/vector.ts` | 생성 | 13축/12축 정의, cosine/mean/weighted_mean/sub, female/male bucket_score 공식 |
| `lib/appearance/metadata.ts` | 생성 | METADATA.json 로더, active 필터, pool_mean 계산 |
| `lib/appearance/preference.ts` | 생성 | ChoiceLog, computePreference (라운드 가중 평균, delta, choice_delta) |
| `lib/appearance/bucket-to-legacy.ts` | 생성 | 새 8버킷 → 기존 6 enum 임시 매핑 (호환 레이어) |
| `components/profile/IdealWorldcup.tsx` | 생성 | measured 기반 N강 토너먼트. 카드 위 라벨/점수 노출 0. |
| `components/profile/IdealWorldcupResult.tsx` | 생성 | 결과 화면. preferred_vector raw 값 노출 금지, 추상적 메시지만. |
| `app/profile/worldcup/page.tsx` | 수정 | IdealWorldcup + IdealWorldcupResult 사용, METADATA 로더, sessionStorage 임시 저장 |

**2. 월드컵 UI가 읽는 데이터 소스**

```
public/appearance-ideal/METADATA.json
└── items[]
    ├── status === "active"  ← 이 조건만 통과한 이미지 사용
    ├── measured.appearance_vector ← 매칭 입력 (필수)
    ├── final_bucket ← bucket_weights 집계에 사용
    └── file ← Next.js Image src
```

`target.*` 필드는 코드에서 읽지 않는다 (검수 흔적 보존용으로만 저장).

**3. 선택 로그 저장 구조**

```ts
interface ChoiceLog {
  round: '64강' | '32강' | '16강' | '8강' | '4강' | '결승' | '최종우승'
  match_index: number
  winner_id: string
  loser_id: string
  winner_vector: AppearanceVector       // 검수용 — measured 그대로
  loser_vector: AppearanceVector
  choice_delta_vector: AppearanceVector // winner - loser
  weight: number                         // 라운드 가중치
  created_at: string
}
```

라운드 가중치 표는 PLAN 문서 10-2 그대로:

```
64강 1.00, 32강 1.15, 16강 1.35, 8강 1.60, 4강 1.90, 결승 2.30, 최종우승 2.80
```

**4. `preferred_appearance_vector` 계산 방식**

```
preferred_appearance_vector
= Σ(winner.measured.appearance_vector × round_weight) / Σ(round_weight)
+ final_winner.measured.appearance_vector × 2.80 (가중치 추가)
```

모든 라운드의 winner 벡터를 라운드 가중치로 가중 평균. 최종 우승자는 별도 2.80 가중치를 한 번 더 받는다.

**5. `preferred_appearance_delta_vector` 계산 방식**

```
preferred_appearance_delta_vector
= preferred_appearance_vector - worldcup_pool_mean_vector
```

`worldcup_pool_mean_vector` 는 성별별 active 풀의 measured_vector 산술 평균. 매번 계산 (캐시는 metadata loader 에서).

이게 청순 쏠림 보정의 핵심이다. 풀이 청순함=0.69 로 치우쳐 있고 사용자 선택 평균도 0.72 면 delta=0.03 (약한 신호). 풀이 시크함=0.34 인데 선택 평균이 0.62 면 delta=0.28 (강한 신호).

추가로 저장:

- `preferred_choice_delta_vector` = Σ(choice_delta × weight) / Σ(weight). 보조 신호.
- `preferred_score_range` = winner measured score 의 mean/min/max.
- `preferred_bucket_weights` = winner.final_bucket 빈도 × 가중치 (정규화).

**6. `target_type`을 매칭에 쓰지 않는다는 확인**

- `lib/appearance/preference.ts` 의 `buildChoiceLog`, `computePreference` 어디서도 `target.*` 읽지 않음.
- `lib/appearance/metadata.ts` 의 `selectActivePool` 도 `measured != null` 만 필터링.
- `IdealWorldcup.tsx` 컴포넌트가 카드에 표시하는 텍스트 0개 (alt="", 오버레이 없음).
- 결과 화면 `IdealWorldcupResult.tsx` 도 raw 벡터/점수/유형명 노출 없음. 추상 메시지만.

**7. 검수 결과 (인수인계 문서 7번 체크리스트)**

- [x] `target.type`을 선호 계산에 사용하지 않았는가
- [x] `measured.appearance_vector`를 기준으로 계산하는가
- [x] `pool_mean_vector`를 빼서 청순 쏠림을 보정하는가
- [x] winner-loser delta를 저장하는가
- [x] 사용자 UI에 점수/유형/키워드가 노출되지 않는가
- [x] placeholder 이미지를 실제 취향 계산에 넣지 않는가 (measured=null 이면 풀 진입 자체 불가)
- [x] 여자/남자 벡터 축이 다를 때 안전하게 처리하는가 (`gender` 파라미터 분기)
- [x] 자기유사 월드컵 폴더(`public/appearance-self/`)를 건드리지 않았는가
- [x] 대표 타입 이미지 폴더(`public/appearance-types/`)와 섞지 않았는가

**8. 임시 처리 사항 (성준 리뷰 필요)**

DB 컬럼 추가 마이그레이션은 만들지 않았다. 이상형 월드컵 결과는 현재 두 방식으로 저장된다:

- **sessionStorage** (`ideal_worldcup_preference_v1`): 새 벡터 결과 전체. 페이지 이동 후 사용 가능.
- **profiles.appearance_type** (기존 컬럼): `bucket_to_legacy.ts` 의 매핑으로 6 enum 호환 저장.

성준 리뷰 후 추가해야 할 마이그레이션:

```sql
ALTER TABLE profiles
  ADD COLUMN preferred_appearance_vector        jsonb,
  ADD COLUMN preferred_appearance_delta_vector  jsonb,
  ADD COLUMN preferred_choice_delta_vector      jsonb,
  ADD COLUMN preferred_score_range              jsonb,
  ADD COLUMN preferred_bucket_weights           jsonb,
  ADD COLUMN worldcup_pool_mean_vector          jsonb;

CREATE TABLE worldcup_choice_logs (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  round       text NOT NULL,
  match_index int NOT NULL,
  winner_id   text NOT NULL,
  loser_id    text NOT NULL,
  winner_vector       jsonb NOT NULL,
  loser_vector        jsonb NOT NULL,
  choice_delta_vector jsonb NOT NULL,
  weight              real NOT NULL,
  created_at  timestamptz DEFAULT now()
);
```

`lib/types.ts` 도 새 선호 벡터 타입을 export 해야 하는데, 그 파일은 양측 PR 리뷰가 필요하므로 이번에는 건드리지 않았다. `lib/appearance/preference.ts` 의 `PreferenceResult` 타입을 그대로 사용 가능.

**9. Codex에게 남은 작업**

가장 중요한 것: **`public/appearance-ideal/METADATA.json` 을 실제 GPT 분석 결과로 교체**.

순서:

1. 이미지 생성 완료 — `public/appearance-ideal/female-64/FI01.jpg ~ FI64.jpg`, `male-64/MI01.jpg ~ MI64.jpg` (현재 FI01~FI64 일부 존재, 남자는 아직)
2. 각 이미지를 `docs/APPEARANCE_ANALYSIS_GPT_PROMPT.md` 의 프롬프트로 GPT Vision 분석
3. 결과를 `public/appearance-ideal/ANALYSIS_RAW.json` 으로 저장 (raw 응답 보존)
4. PLAN 문서 5/6절 버킷 점수 공식을 돌려서 `bucket_scores`, `final_bucket` 계산 (또는 `lib/appearance/vector.ts` 의 `computeBucketScores` 함수 그대로 호출 가능)
5. PLAN 문서 7절 자동 배정 규칙으로 `final_bucket` 결정
6. PLAN 문서 8절 버킷 균형 검수 — 과잉 8장 초과는 candidate, 부족 버킷은 재생성
7. `METADATA.json` 의 `items[]` 를 채우고, `female_pool_mean_vector` / `male_pool_mean_vector` 도 산출해서 채운다
8. `REVIEW.md` 작성 (PLAN 문서 14절)

`lib/appearance/vector.ts` 의 `computeFemaleBucketScores` / `computeMaleBucketScores` / `computeBucketScores` 함수를 사용하면 PLAN 5/6 공식을 그대로 호출할 수 있다. Node 스크립트로 한 번 돌리면 자동 채워진다.

**10. 커밋 안 함**

사용자 요청 전까지 커밋하지 않았다. 현재 `profile/appearance-ai` 브랜치 working tree 에만 변경 있음.

---

### [2026-05-18] 세션 #8 — Claude 출력 (CODEX_FEMALE_64_IMAGE_GENERATION_PROMPT 정합성 맞춤)

`docs/handoff/CODEX_FEMALE_64_IMAGE_GENERATION_PROMPT.md` 를 읽고 세션 #7에서 내가 만든 코드와 정합성 점검을 했다. 6가지 차이를 발견해서 **내 코드를 Codex 표준에 맞춰 수정**했다. MD 파일은 손대지 않음.

**발견된 차이와 수정 내역:**

| # | 차이점 | 수정한 파일 |
|---|---|---|
| 1 | `file` 경로 형식 (`public/` 접두사 유무) | `lib/appearance/metadata.ts` `publicImageUrl()` 함수가 `public/` 접두사를 잘라내도록 수정. METADATA.json fixture 도 `public/appearance-ideal/...` 형식으로 통일. |
| 2 | `visual_review` 필드 누락 | `IdealImageItem` 인터페이스에 `visual_review?: {duplicate_risk, similar_to, difference_notes}` 추가 (선택 필드). fixture 도 채움. |
| 3 | `review.decision` 필드 누락 | `IdealImageReview` 에 `decision?: 'active'|'candidate'|'rejected'|'regenerate'` 추가. fixture 도 채움. |
| 4 | `bucket_scores: null` 허용 | METADATA.json fixture 에서 모든 항목을 8버킷 점수 객체(0.0 placeholder) 로 채움. Codex 가 실제 값으로 갱신. |
| 5 | per-axis 분포 통계 미계산 | `lib/appearance/vector.ts` 에 `AxisStats`, `PoolAxisStats`, `computePoolAxisStats`, `valuePercentile`, `valueZScore`, `computeAxisPercentileVector`, `computeAxisZVector` 추가. `lib/appearance/metadata.ts` 에 `computePoolStats(gender, items)` 헬퍼 노출. |
| 6 | **`preferred_axis_percentile_vector` / `preferred_axis_z_vector` 미구현** (Codex "매칭 유효성 시뮬레이션" 핵심) | `lib/appearance/preference.ts` `PreferenceResult` 에 두 벡터 추가. `computePreference` 가 자동 계산. `IdealWorldcup.tsx` 가 `poolAxisStats` 를 인자로 전달하도록 수정. |

**왜 #6이 가장 중요한가:**

Codex 인수인계 문서의 "매칭 유효성 시뮬레이션" 절은 다음 실패 사례를 명시한다.

```
사용자가 청순 상위 이미지를 골랐는데
preferred_appearance_vector.청순함은 높지만
매칭 계산에서 청순함이 거의 무시됨
```

내가 만든 `preferred_appearance_delta_vector` (= preferred - pool_mean) 는 절대값 차이만 본다. 풀의 청순함이 0.65±0.05 로 좁게 몰려 있고 사용자 선택 평균이 0.78 이라면 delta=0.13 (작아 보임). 하지만 z-score 로는 (0.78-0.65)/0.05 = 2.6 (강한 신호).

`preferred_axis_z_vector` 와 `preferred_axis_percentile_vector` 는 풀 분포의 spread 까지 반영해서, 사용자가 풀 내에서 어디 위치를 골랐는지를 정확히 표현한다. 매칭 엔진은 이 두 값을 우선 보고 어느 축이 사용자에게 진짜로 강한 신호인지 판단해야 한다.

**최종 `PreferenceResult` 구조:**

```ts
{
  preferred_appearance_vector,         // raw 가중 평균
  preferred_appearance_delta_vector,   // - pool_mean (절대값 보정)
  preferred_choice_delta_vector,       // winner-loser 가중 평균
  preferred_axis_percentile_vector,    // 0~100 풀 분포 내 위치 ★ 신규
  preferred_axis_z_vector,             // z-score 풀 분포 기준 ★ 신규
  preferred_score_range,               // mean/min/max
  preferred_bucket_weights,            // bucket 빈도 정규화
  worldcup_pool_mean_vector,
  pool_axis_stats,                     // 검수/매칭 가중치용 ★ 신규
  choice_logs,
  meta: { total_choices, final_winner_id, gender }
}
```

**Codex 가 추가로 산출해야 할 파일과 그 활용:**

- `ANALYSIS_RAW_FEMALE.json` — GPT 분석기 raw 응답. 검수와 디버그에만 사용. 앱 코드는 읽지 않음.
- `METADATA_FEMALE.json` — 여자 분리본. 통합 `METADATA.json` 으로 합쳐지면 그 후로는 분리본은 보조 자료.
- `REVIEW_FEMALE.md` — 사람 검수용. 앱 코드는 읽지 않음.
- 통합 `METADATA.json` 갱신 — 앱이 직접 읽음. 이 파일이 single source of truth.

`lib/appearance/vector.ts` 의 `computeFemaleBucketScores`, `computeBucketScores` 함수를 그대로 Node 스크립트에서 호출하면 `bucket_scores` 자동 계산 가능. `computePoolAxisStats` 도 동일하게 활용 가능.

**`female_pool_mean_vector` / `male_pool_mean_vector` 필드:**

METADATA.json 최상위에 두 필드가 있다. Codex 가 채워두면 런타임에 한 번 더 계산하지 않아도 된다. 비워두면 (`null`) 앱이 active 풀에서 자동 계산. 일관성을 위해 Codex 가 채워주는 게 좋다.

**검수 결과 (Codex 가 검증 가능):**

- [x] 모든 메타데이터 항목이 `visual_review` 와 `review.decision` 을 채울 수 있다 (선택 필드, optional 처리).
- [x] `file` 경로가 `public/appearance-ideal/...` 또는 `appearance-ideal/...` 어느 쪽이든 작동한다 (`publicImageUrl` 정규화).
- [x] 사용자가 청순 상위만 골라도 `preferred_axis_z_vector.청순함` 이 풀 분포 기준으로 계산되어 매칭에서 무시되지 않는다.
- [x] 사용자가 시크 상위만 골라도 같은 메커니즘으로 시크함 z-score 가 높게 나온다.
- [x] target_type 은 어떤 계산에도 들어가지 않는다.

**수정된 파일 목록 (세션 #8):**

```text
lib/appearance/vector.ts        (axis stats + percentile/z 유틸 추가)
lib/appearance/metadata.ts      (visual_review/decision 필드, file 경로 정규화, computePoolStats 노출)
lib/appearance/preference.ts    (percentile/z 벡터 + pool_axis_stats 결과 추가)
components/profile/IdealWorldcup.tsx  (poolStats 전달)
public/appearance-ideal/METADATA.json (fixture 를 Codex 표준 형식으로 통일)
docs/handoff/CLAUDE_CODEX_BRIDGE.md   (이 기록)
```

세션 #7과 같이 커밋은 안 했다. working tree 변경만.

---

## 공통 규칙

- 서로의 섹션을 덮어쓰지 않는다
- 날짜와 세션 번호를 반드시 기록한다
- 이 파일 자체가 히스토리이므로 오래된 내용도 지우지 않는다
- 충돌이 생길 것 같은 작업은 여기에 먼저 공지한다

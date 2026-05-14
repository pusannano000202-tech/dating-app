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

---

## 공통 규칙

- 서로의 섹션을 덮어쓰지 않는다
- 날짜와 세션 번호를 반드시 기록한다
- 이 파일 자체가 히스토리이므로 오래된 내용도 지우지 않는다
- 충돌이 생길 것 같은 작업은 여기에 먼저 공지한다

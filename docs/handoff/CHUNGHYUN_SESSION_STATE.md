# 충현 세션 상태 파일 (인수인계 문서)

> **이 파일은 충현 담당 모듈의 현재 상태를 기록한다.**
> Claude/Codex 세션이 교체될 때마다 업데이트한다.
> 성준 관련 내용은 여기에 적지 않는다.

---

## 담당 영역 (충현 ONLY)

| 영역 | 경로 |
|------|------|
| 외모 AI 서버 | `python/appearance/` |
| 프로필 페이지 | `app/profile/` |
| 프로필 컴포넌트 | `components/profile/` |
| DB 테이블 | `users`, `profiles`, `photos`, `personality_scores`, `appearance_scores` |
| 마이그레이션 파일 | `YYYYMMDD_profile_*.sql` 형식만 생성 |

**절대 건드리면 안 되는 것 (성준 영역)**
- `python/matching/`
- `app/group/`, `app/match/`, `components/matching/`
- `YYYYMMDD_matching_*.sql` 마이그레이션 파일
- `lib/types.ts` 단독 수정 금지 (PR + 성준 리뷰 필요)

---

## 현재 활성 브랜치

```
profile/worldcup-ui   ← 현재 작업 중 (Claude 담당), 15커밋 ahead of origin
profile/appearance-ai ← AI 서버 완료, 머지 대기
```

---

## 완료된 작업

### [세션 #1 - 2026-05-14] python/appearance/ — 외모 AI 서버 프로토타입
- [x] `main.py` — FastAPI 서버, `POST /api/score-photos` 엔드포인트
- [x] `model.py` — ResNet50 기반 외모 점수 모델 (`build_model`, `score_photos`)
- [x] `supabase_client.py` — `save_appearance_score` (score_raw → appearance_scores, score_normalized → profiles)
- [x] `requirements.txt`, `.env.example`, `README.md`
- [x] `supabase/migrations/20260514_profile_create_appearance_tables.sql`
- [x] `supabase/migrations/20260514_profile_create_profiles_table.sql`
- 브랜치: `profile/appearance-ai` (GitHub push 완료)

### [세션 #2 - 2026-05-15] Next.js + 이상형 월드컵 UI
- [x] Next.js 14 + TypeScript + Tailwind 프로젝트 초기 세팅
  - `package.json`, `next.config.mjs`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.mjs`
  - `app/layout.tsx`, `app/page.tsx`, `app/globals.css`
  - `.env.local.example`
- [x] `lib/types.ts` — 공용 TypeScript 타입 (계약서 그대로)
- [x] `lib/constants.ts` — 6가지 외모 타입 정보 (label/emoji/keywords/description/gradient)
- [x] `lib/supabase.ts` — Supabase 브라우저 클라이언트
- [x] `components/profile/AppearanceWorldcup.tsx` — 토너먼트 대결 UI (5회 선택)
  - 8강(cute vs pure, chic vs warm) + 부전승(stylish, healthy) → 4강 → 결승
- [x] `components/profile/WorldcupResult.tsx` — 우승 결과 + 확정/다시하기 버튼
- [x] `app/profile/worldcup/page.tsx` — 페이지 (상태관리, Supabase 저장 TODO 표시)
- 브랜치: `profile/worldcup-ui` (GitHub push 완료)

---

## 다음 작업 목록 (TODO)

### [Claude 담당] 기본정보 입력 페이지 ✅
- [x] `components/profile/BasicInfoForm.tsx` — 성별/나이/키/체형/머리숱/학교/학과/학년 폼
- [x] `app/profile/basic/page.tsx` — Supabase profiles 저장 후 /profile/photos 이동

### [Claude 담당] 사진 업로드 페이지 ✅ (UI 완성, Storage 연동은 Codex 담당)
- [x] `components/profile/PhotoUpload.tsx` — 3장 슬롯 UI, 미리보기
- [x] `app/profile/photos/page.tsx` — Supabase Storage 업로드 로직 완성 (버킷만 만들면 됨)
- [ ] **Codex 담당**: Supabase 버킷 `photos` 생성 + RLS 정책 추가 (`docs/handoff/CODEX_HANDOFF_PHOTOS.md` 참고)

### [Claude 담당] Big5 성격 설문 ✅
- [x] `components/profile/Big5Survey.tsx` — 5개 트레이트 × 2질문, 5점 척도
- [x] `app/profile/survey/page.tsx` — big5_* 컬럼 5개 Supabase 저장 후 /profile/schedule 이동

### [Claude 담당] 이상형 가중치 슬라이더 ✅
- [x] `app/profile/preferences/page.tsx`
- [x] `components/profile/PreferenceSliders.tsx`

### [Claude 담당] 가용 시간대 입력 ✅
- [x] `app/profile/schedule/page.tsx`
- [x] `components/profile/SchedulePicker.tsx`

### [Claude 담당] 월드컵 결과 저장 ✅
- [x] `app/profile/worldcup/page.tsx`

### [세션 #3~#5 - 2026-05-15] 추가 개선 사항 (자율 작업)

- [x] **전체 프로필 플로우 버그 수정** (기존 StepProgress, 에러 핸들링, HTML nesting 등)
- [x] **DB prefill 패턴** — 모든 편집 페이지가 기존 데이터 로드 (`useEffect` + `key` remount)
  - worldcup, basic, photos, survey, schedule, preferences 전부 적용
- [x] **로딩 스켈레톤** — schedule, preferences, worldcup 페이지에 Supabase 로딩 중 skeleton
- [x] **SchedulePicker 버그 수정** — start 변경 시 end가 start보다 작으면 자동 앞당김
- [x] **photos 테이블 upsert** — 사진 업로드 시 photos 테이블에 메타데이터도 저장
- [x] **기존 사진 유지 UI** — 사진 페이지에 기존 사진 썸네일 + "유지하고 넘어가기" 버튼
- [x] **프로필 초기화 버그 수정** — edit 페이지 초기화가 실제로 DB 삭제함
- [x] **로그인 UX** — 전화번호 자동 포맷, one-time-code autoComplete, ARIA 레이블
- [x] **AI 서버 보안 개선** — `NEXT_PUBLIC_AI_SERVER_URL` 제거, `/api/score` 프록시 라우트 추가
- [x] **메타데이터** — profile/auth/group 레이아웃에 SEO 메타데이터 추가
- [x] **smart redirect** — 홈 페이지가 미완성 단계를 파악해 첫 번째 미완성 단계로 이동
- [x] **Python pytest 스위트** — `tests/test_model.py`, `tests/test_api.py` (총 17 케이스)
- [x] **GitHub Actions CI** — `.github/workflows/ci.yml` (pytest + tsc --noEmit)
- [x] **Docker Compose** — `docker-compose.yml` (원커맨드 AI 서버 실행)
- [x] **Python Makefile** — `make dev/test/lint/docker-build` 단축키

### [세션 #6 - 2026-05-15] UX 디테일 + 테스트 강화 (자율 작업, context compaction 후 계속)

- [x] **OTP 자동 포커스** — OTP 단계 진입 시 첫 번째 입력 칸 자동 포커스 (50ms 딜레이)
- [x] **OTP 자동 제출** — 6자리 모두 입력 시 자동 `verifyOtp()` 호출
- [x] **Big5Survey 자동 다음** — 두 질문 모두 답하면 600ms 후 자동 다음 트레이트 이동 (마지막 제외)
- [x] **Worldcup 키보드 단축키** — ← → 방향키로 카드 선택 가능
- [x] **survey 페이지 loaded 상태** — 기존 결과 조회 중 서베이 플래시 방지 (skeleton 추가)
- [x] **photos 페이지 photosLoaded** — 기존 사진 로딩 중 skeleton, 비로그인 시 bug 수정
- [x] **edit 페이지 skeleton** — 프로필 요약 카드 로딩 중 skeleton 표시
- [x] **API 타임아웃** — `/api/score` 프록시에 30초 AbortController 타임아웃 추가
- [x] **npm typecheck** — `package.json`에 `npm run typecheck` 스크립트 추가
- [x] **supabase_client 테스트** — `tests/test_supabase_client.py` 10개 케이스 추가
- [x] **load_image_from_url 테스트** — `test_model.py`에 TestLoadImageFromUrl 4케이스 추가
- [x] **isSupabaseConfigured 통일** — photos 페이지 인라인 중복 제거

### 남은 TODO
- [ ] `model.py` — 실제 SCUT-FBP5500 가중치 파일 로드 (weights/resnet50_scut.pth)
- [ ] Supabase Storage 버킷 `photos` 생성 + RLS (Codex 담당, CODEX_HANDOFF_PHOTOS.md 참고)
- [ ] Supabase 실키 세팅 후 E2E 흐름 테스트 (성준이 URL/KEY 주면)

---

## 프로필 입력 플로우 (전체 순서) — 모두 완성

```
/profile/worldcup   → 이상형 타입 선택 (appearance_type 저장)          ✅
/profile/basic      → 기본정보 (gender/age/height/body_type 등 저장)    ✅
/profile/photos     → 사진 3장 업로드 + AI 점수 트리거                  ✅
/profile/survey     → Big5 성격 설문 (big5_* 5개 컬럼 저장)             ✅
/profile/schedule   → 가용 시간대 (available_timeslots JSONB 저장)       ✅
/profile/preferences → 이상형 가중치 (preference_weights JSONB 저장)     ✅
/profile/complete   → 완료 화면 → /group/create 이동                    ✅
```

---

## 성준에게 넘겨야 할 것 (완료 시 알림)

| 항목 | 상태 | 비고 |
|------|------|------|
| `profiles` 테이블 마이그레이션 완료 | 진행중 | `20260514_profile_create_profiles_table.sql` |
| `appearance_score_normalized` 실제 데이터 | 미완 | 모델 완성 후 |
| `is_profile_complete = true` 조건 정의 | 미완 | 필수 필드 목록 확정 필요 |
| `available_timeslots` 예시 데이터 | 미완 | |
| `preference_weights` 예시 데이터 | 미완 | |

---

## 인터페이스 계약 핵심 요약

> 전체 내용: `docs/INTERFACE_CONTRACT.md`

- `profiles.appearance_score_normalized` — 성준의 매칭 엔진이 읽는 값. **0~1 float**
- `appearance_scores.score_raw` — **절대 외부 노출 금지**, 충현만 접근
- `available_timeslots` JSONB: `{"slots": [{"day": "friday", "start": "18:00", "end": "22:00"}]}`
- `preference_weights` JSONB: 7개 키, 합계 반드시 1.0
- 외모 AI 서버 → Supabase 직접 저장. 성준 서버와 직접 통신 없음.

---

## 현재 세션 메모

**날짜:** 2026-05-15 (세션 #6, context compaction 후 계속)
**작업 내용:**
- OTP UX: 자동 포커스 + 자동 제출
- Big5Survey 자동 다음 트레이트 이동 (600ms)
- Worldcup 키보드 방향키 지원
- 모든 프로필 페이지 로딩 skeleton 추가 완료
- Python 테스트 강화: supabase_client 10케이스, load_image_from_url 4케이스 추가
- API 프록시 타임아웃, npm typecheck 스크립트, 버그 수정

**Claude 담당 TODO 전부 완료. 남은 것:**
- Codex: Supabase Storage 버킷 생성 + 자기유사 이미지 생성
- 공통: 성준이 Supabase URL/KEY 주면 .env.local 세팅 후 E2E 테스트

**Codex 이미지/점수 작업 추가 메모:**
- `public/appearance-types/` AI 사진 6장 생성·배치 완료
- `public/appearance-types/CRITERIA.md`에 타입별 생성 기준과 백분위 절대점수 추가
- `public/appearance-self/SCORE_GUIDE.md`에 자기유사 월드컵 절대점수 기준 정의
- 여자 자기유사 시범 이미지 3장 생성:
  - `public/appearance-self/female/female_self_28.jpg`
  - `public/appearance-self/female/female_self_52.jpg`
  - `public/appearance-self/female/female_self_73.jpg`
- 검수용 HTML 카탈로그:
  - `public/appearance-self/CATALOG.html`
- 주의: 자기유사 월드컵 점수는 호감도 느낌 점수가 아니라 백분위 절대점수다.
  생성 프롬프트 목표 점수와 실제 판정 점수가 다를 수 있으므로, 사람이 보고 재판정한 점수를 우선한다.
- 2026-05-15 추가 진행:
  - 자기유사 월드컵 64장 생성 완료
  - 여자 32장 생성 완료 (`public/appearance-self/female/`)
  - 남자 32장 생성 완료 (`public/appearance-self/male/`)
  - 전체 검수 카탈로그 갱신 (`public/appearance-self/CATALOG.html`)
- 2026-05-15 설계 추가:
  - 자기유사 월드컵을 총 128장으로 확장하기 위한 설계표 작성
  - 여자 64행 + 남자 64행
  - 파일: `public/appearance-self/DESIGN_128.md`, `public/appearance-self/DESIGN_128.html`
  - 아직 128장 이미지를 새로 생성한 것은 아니며, 다음 생성 작업은 이 설계표를 따라 진행해야 함

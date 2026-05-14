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
profile/worldcup-ui   ← 현재 작업 중 (Claude 담당)
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

### [Codex 담당] 기본정보 입력 페이지
- [ ] `app/profile/basic/page.tsx` — 기본정보 폼 (성별, 나이, 키, 체형, 머리숱, 학교, 학과, 학년)
- [ ] `components/profile/BasicInfoForm.tsx` — 폼 컴포넌트
- [ ] 완성 시 Supabase `profiles` 테이블에 저장

### [Codex 담당] 사진 업로드 페이지
- [ ] `app/profile/photos/page.tsx` — 사진 3장 업로드 UI
- [ ] `components/profile/PhotoUpload.tsx` — Supabase Storage 연동
- [ ] 업로드 완료 후 `POST /api/score-photos` 호출 트리거

### [Claude 담당] 이상형 가중치 슬라이더
- [ ] `app/profile/preferences/page.tsx` — 7개 항목 슬라이더 (합계 1.0 강제)
- [ ] `preference_weights` JSONB → `profiles` 저장

### [Claude 담당] 가용 시간대 입력
- [ ] `app/profile/schedule/page.tsx` — 요일×시간대 선택 UI
- [ ] `available_timeslots` JSONB → `profiles` 저장

### [Claude 담당] 월드컵 결과 Supabase 저장 연결
- [ ] `app/profile/worldcup/page.tsx` TODO 부분에 실제 저장 로직 추가
- [ ] Supabase `profiles.appearance_type` 업데이트

### 우선순위 LOW
- [ ] `app/profile/survey/` — Big5 성격 설문 페이지
- [ ] `model.py` — 실제 SCUT-FBP5500 가중치 파일 로드 (weights/resnet50_scut.pth)
- [ ] 외모 AI 서버 Docker화

---

## 프로필 입력 플로우 (전체 순서)

```
/profile/worldcup  → (이상형 타입 선택, 완료)
/profile/basic     → (기본정보: 성별/나이/키 등, Codex 담당)
/profile/photos    → (사진 3장 업로드 → AI 점수화, Codex 담당)
/profile/schedule  → (가용 시간대, Claude 담당)
/profile/preferences → (이상형 가중치, Claude 담당)
→ is_profile_complete = true → 그룹 생성으로 이동
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

**날짜:** 2026-05-15
**작업 내용:**
- Next.js 14 프로젝트 초기 세팅 완료
- 이상형 월드컵 UI 구현 완료 (AppearanceWorldcup, WorldcupResult)
- lib/types.ts, lib/constants.ts, lib/supabase.ts 생성

**다음 세션 시작 시 할 일:**
- Claude: 가중치 슬라이더 / 시간대 UI / 월드컵 Supabase 저장 연결
- Codex: 기본정보 폼 / 사진 업로드 (병렬 작업)

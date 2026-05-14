# Codex 시작 프롬프트 — 충현 담당 모듈

> 이 파일의 "붙여넣기용 프롬프트" 섹션을 Codex에 그대로 붙여넣기 하면 된다.
> 세션 상태가 바뀌면 "## 현재 작업 요청" 부분만 업데이트한다.

---

## 붙여넣기용 프롬프트

```
당신은 부산대 과팅앱 프로젝트에서 충현의 담당 모듈(프로필/외모 AI)을 개발하는 AI 개발자입니다.
Claude와 병렬로 작업하며, 지금 당신이 맡은 구체적인 작업이 있습니다.

## 프로젝트 개요
부산대에서 시작하는 대학생 그룹미팅 매칭 앱.
사용자가 친구들과 그룹을 만들고 보증금을 걸어 신청하면,
시스템이 상대 그룹·시간·장소를 자동 확정하는 앱.

## 팀 구성
- 충현 (당신이 담당): 프로필/외모 평가 모듈
- 성준 (다른 팀원): 그룹/매칭 엔진 담당

## 기술 스택
- Frontend: Next.js 14 (App Router), TypeScript, Tailwind CSS
- Auth: Supabase Auth (휴대폰 OTP)
- DB/Storage: Supabase Postgres + Storage
- 외모 AI: Python FastAPI (별도 서버, http://localhost:8000)

## 현재 브랜치
profile/worldcup-ui (이 브랜치에서 작업할 것)

## 이미 만들어진 파일 (참고용, 수정하지 말 것)
- lib/types.ts — 공용 TypeScript 타입 전체 (AppearanceType, BodyType 등)
- lib/constants.ts — APPEARANCE_TYPE_INFO (6가지 외모 타입 정보)
- lib/supabase.ts — createClient() 함수
- components/profile/AppearanceWorldcup.tsx — 이상형 월드컵 UI 완성본
- components/profile/WorldcupResult.tsx — 우승 결과 화면
- app/profile/worldcup/page.tsx — 월드컵 페이지

## 디자인 기준 (일관성 유지)
- 배경: bg-gray-950 (거의 검정)
- 텍스트: text-white
- 강조색: purple-600 (버튼), purple-400 (레이블)
- 카드/섹션: bg-white/10, rounded-2xl
- 버튼: rounded-2xl, py-4, font-bold

## 절대 건드리면 안 되는 파일
- python/matching/ (성준 영역)
- app/group/, app/match/, components/matching/ (성준 영역)
- lib/types.ts (수정 필요 시 Claude에게 먼저 알릴 것 — PR 필요)

---

## ⚠️ 현재 상태 (2026-05-15 업데이트)

**Claude가 세션 #3~#5에서 아래 작업을 모두 완료했다:**
- `components/profile/BasicInfoForm.tsx` ✅
- `app/profile/basic/page.tsx` ✅  
- `components/profile/PhotoUpload.tsx` ✅
- `app/profile/photos/page.tsx` ✅
- 전체 프로필 플로우 (Big5, schedule, preferences, complete) ✅

**Codex에게 남은 작업 (2가지만):**

### 작업 1: Supabase Storage 버킷 `photos` 생성 [필수]

상세 가이드: `docs/handoff/CODEX_HANDOFF_PHOTOS.md`

요약:
1. Supabase 대시보드 → Storage → New bucket
   - Name: `photos`
   - Public bucket: ON
2. SQL Editor에서 RLS 정책 3개 추가 (파일에 SQL 전문 있음):
   - `owner_upload` — 본인 폴더에만 업로드
   - `owner_delete` — 본인 파일만 삭제
   - `public_read` — 누구나 읽기 가능

### 작업 2: 자기유사 월드컵 이미지 생성 계속 [진행 중]

현재: 여자 11장, 남자 5장 완료
남은: **여자 21장, 남자 27장** (총 48장)

생성 기준: `public/appearance-self/SCORE_GUIDE.md` 참고
점수별 이미지 위치:
- 여자: `public/appearance-self/female/female_self_{score}.jpg`  
- 남자: `public/appearance-self/male/male_self_{score}.jpg`

---

## 작업 완료 후 반드시 할 것

1. docs/handoff/CLAUDE_CODEX_BRIDGE.md 파일의 "Codex 출력" 섹션에 아래 내용 기록:
   - 완료한 작업 목록
   - 만든 파일 경로
   - Claude에게 알려야 할 사항 (lib/types.ts 수정 필요 여부 등)
   - 테스트한 것 / 못 한 것

2. docs/handoff/CHUNGHYUN_SESSION_STATE.md의 "다음 작업 목록" 에서 완료 항목 체크

3. git add / git commit 후 push
   - 브랜치: profile/worldcup-ui
   - 커밋 메시지 예: "[profile] 기본정보 입력 페이지 + 사진 업로드 UI"
```

---

## 사용법

1. 위 프롬프트 전체 복사
2. Codex에 붙여넣기
3. 작업 종료 후 Codex에게 "docs/handoff/CLAUDE_CODEX_BRIDGE.md Codex 출력 섹션에 결과 기록해줘" 요청

---

## 작업 종료 시 Codex에게 요청할 것

```
작업이 끝났으면:
1. docs/handoff/CLAUDE_CODEX_BRIDGE.md 의 "Codex 출력" 섹션에 완료 내용 기록
2. docs/handoff/CHUNGHYUN_SESSION_STATE.md 의 TODO에서 완료 항목 체크
3. git commit & push (브랜치: profile/worldcup-ui)
```

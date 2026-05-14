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

## 지금 해야 할 작업 (2가지)

### 작업 1: 기본정보 입력 페이지

파일 위치:
- app/profile/basic/page.tsx
- components/profile/BasicInfoForm.tsx

입력 항목과 DB 컬럼 매핑:
- 성별 (gender): 'male' | 'female' — 남자/여자 큰 버튼 2개
- 나이 (age): 숫자 입력 (18~30 범위 제한)
- 키 (height): cm 단위 숫자 입력
- 체형 (body_type): 'slim' | 'average' | 'athletic' | 'chubby' — 4개 버튼 중 택1
  - slim=슬림, average=보통, athletic=근육, chubby=통통
- 머리숱 (hair_density): 'full' | 'thinning' | 'bald' — 3개 버튼 중 택1
  - full=많음, thinning=적음, bald=없음
- 학교 (school): 텍스트 입력 (기본값: '부산대학교')
- 학과 (department): 텍스트 입력
- 학년 (year): 1~6 중 택1 (버튼 또는 셀렉트)

완료 후 동작:
1. Supabase profiles 테이블에 위 값들 upsert (user_id 기준)
2. router.push('/profile/photos') 로 이동

Supabase 저장 예시:
```ts
const supabase = createClient()
await supabase.from('profiles').upsert({
  user_id: userId, // supabase.auth.getUser() 로 가져옴
  gender,
  age,
  height,
  body_type: bodyType,
  hair_density: hairDensity,
  school,
  department,
  year,
})
```

### 작업 2: 사진 업로드 페이지

파일 위치:
- app/profile/photos/page.tsx
- components/profile/PhotoUpload.tsx

기능:
- 사진 3장 업로드 (각각 독립적으로 파일 선택 가능)
- 업로드 전 미리보기 (URL.createObjectURL)
- Supabase Storage 'photos' 버킷에 저장
  - 경로: photos/{user_id}/{index}.jpg
- 3장 모두 업로드 완료 후 외모 AI 서버 호출:
  ```ts
  await fetch(`${process.env.NEXT_PUBLIC_APPEARANCE_API_URL}/api/score-photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, photo_urls: [url1, url2, url3] })
  })
  ```
- 완료 후 router.push('/profile/schedule') 로 이동

Supabase Storage 업로드 예시:
```ts
const { data } = await supabase.storage
  .from('photos')
  .upload(`${userId}/${index}.jpg`, file, { upsert: true })
const { data: { publicUrl } } = supabase.storage
  .from('photos')
  .getPublicUrl(`${userId}/${index}.jpg`)
```

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

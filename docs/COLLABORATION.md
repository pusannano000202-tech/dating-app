# 협업 가이드 (Collaboration Guide)

> **충현 + 성준 + Claude Code x2 + Codex x2 = 총 6명이 같은 코드베이스를 건드린다.**
> 이 문서의 규칙을 지키지 않으면 코드가 꼬인다. LLM이 빠르게 코드를 생산할수록 이 규칙이 더 중요하다.

---

## 1. 브랜치 전략

```
main
 └── dev                          ← 통합 브랜치 (항상 동작하는 상태 유지)
      ├── profile/setup            ← 충현: 프로필 세팅
      ├── profile/appearance-ai    ← 충현: 외모 AI
      ├── profile/worldcup-ui      ← 충현: 월드컵 UI
      ├── profile/survey           ← 충현: 성격 설문
      ├── matching/group-create    ← 성준: 그룹 생성
      ├── matching/algorithm       ← 성준: 매칭 알고리즘
      └── matching/deposit         ← 성준: 보증금 처리
```

### 규칙
- `main` 직접 push **금지** (Claude Code, Codex 포함)
- `dev` 직접 push **금지** — 반드시 feature 브랜치에서 PR
- feature 브랜치 네이밍: `{담당자영역}/{기능명}` (예: `profile/appearance-ai`)
- PR 머지는 상대방 확인 없이도 가능하지만, **공용 파일 수정 시는 상대방 리뷰 필수**

### 브랜치 수명
- feature 브랜치는 `dev`에 머지되면 즉시 삭제한다
- 오래된 브랜치가 쌓이면 충돌 추적이 어려워진다

---

## 2. 충돌이 생기는 지점과 예방법

### 위험 지점 1: `lib/types.ts`
- 충현은 프로필 타입을, 성준은 그룹/매칭 타입을 추가한다
- **예방:** 각자 자기 담당 타입만 추가. 공용 타입(MatchingProfile 등)은 반드시 상의 후 추가
- **실행:** `lib/types.ts` 수정 커밋에는 항상 코멘트로 상대방 태그 (@성준 또는 @충현)

### 위험 지점 2: `supabase/migrations/`
- 두 사람이 같은 날 마이그레이션 파일을 만들면 번호 충돌이 생긴다
- **예방:** 마이그레이션 파일 생성 전에 Slack/카톡으로 "지금 마이그 만든다" 알림
- **네이밍 규칙:**
  - 충현: `YYYYMMDD_profile_설명.sql` (예: `20260515_profile_add_appearance_score.sql`)
  - 성준: `YYYYMMDD_matching_설명.sql` (예: `20260515_matching_add_groups_table.sql`)
  - 이름에 담당자 영역 접두사를 붙이면 같은 날 파일이 생겨도 충돌 없음

### 위험 지점 3: `lib/supabase.ts`
- Supabase 클라이언트 설정은 하나만 있어야 한다
- **예방:** 이 파일은 최초 세팅 후 건드리지 않는다. 수정이 필요하면 두 사람이 같이 결정

### 위험 지점 4: `app/layout.tsx` 및 루트 페이지
- 전역 레이아웃, 네비게이션, Provider 설정 등
- **예방:** 이 파일들은 한 사람이 담당하고 나머지는 PR로만 요청

### 위험 지점 5: `package.json` / 의존성
- 두 사람이 동시에 패키지를 추가하면 `package-lock.json` 충돌
- **예방:** 패키지 추가 전에 상대방에게 알림. 동시 추가 최대한 피하기
- 충돌 났을 경우: `npm install` 후 `package-lock.json`만 다시 커밋

---

## 3. 매일 작업 루틴

### 작업 시작 전 (필수)
```bash
git checkout dev
git pull origin dev
git checkout -b {내브랜치}
# 또는 기존 브랜치 계속 작업 시
git checkout {내브랜치}
git rebase dev   # dev의 최신 변경사항을 내 브랜치에 적용
```

### 작업 중
- 기능 단위로 작은 커밋을 자주 남긴다
- 커밋 메시지 형식: `[profile] 외모 AI 점수 정규화 로직 추가` / `[matching] 헝가리안 알고리즘 초안`
- 하루 작업이 끝나면 무조건 push (미완성이어도 괜찮음, 브랜치가 날아가는 것 방지)

### PR 올릴 때
- PR 제목: `[profile] 외모 AI 서버 프로토타입` 형식
- PR 본문에 반드시 포함:
  1. 뭘 했는지 (2~3줄)
  2. 공용 파일 수정 여부 (`lib/types.ts`, `supabase/migrations/` 등)
  3. 상대방이 업데이트해야 할 사항 (있으면)
  4. 테스트 방법

---

## 4. Claude Code / Codex 사용 시 추가 규칙

LLM이 코드를 빠르게 생산하는 만큼 **LLM에게 줄 컨텍스트가 중요하다.**

### LLM 작업 시작 전 체크리스트
- [ ] `CLAUDE.md` 읽었는가?
- [ ] `docs/INTERFACE_CONTRACT.md` 읽었는가?
- [ ] 현재 내 브랜치가 `dev` 최신 기준인가? (`git rebase dev`)
- [ ] 작업 범위가 내 담당 영역인가?

### LLM에게 반드시 전달해야 할 컨텍스트
```
이 프로젝트는 2인 팀(충현 + 성준)이 협업하는 과팅앱이다.
내 담당: {프로필/외모 또는 그룹/매칭}
상대방 담당: {반대편}
인터페이스 계약: docs/INTERFACE_CONTRACT.md 참고
공용 파일(lib/types.ts, supabase/migrations/) 수정 시 PR 필요
```

### LLM이 절대 하면 안 되는 것
- `main` 브랜치에 push
- `docs/INTERFACE_CONTRACT.md`의 타입/컬럼명 임의 변경
- 상대방 담당 파일 수정 (디렉토리 경계 참고)
- 새 마이그레이션 파일을 상의 없이 `dev`에 머지

---

## 5. 인수인계 체크리스트

### 충현 → 성준에게 필요한 것 (충현이 완성 후 공지)
- [ ] `profiles` 테이블 마이그레이션 완료
- [ ] `profiles.appearance_score_normalized` 실제 데이터 들어가는 것 확인
- [ ] `profiles.is_profile_complete = true` 조건 명확히 정의 (모든 필수 필드 채워야 true)
- [ ] `available_timeslots` JSONB 형식 실제 데이터 예시 제공
- [ ] `preference_weights` JSONB 형식 실제 데이터 예시 제공
- [ ] 프로필 완성 여부 체크 API 또는 Supabase 뷰 제공

### 성준 → 충현에게 필요한 것 (성준이 완성 후 공지)
- [ ] `groups`, `group_members` 테이블 마이그레이션 완료
- [ ] 매칭 엔진에서 `profiles` 테이블을 읽는 쿼리 공유 (충현이 스키마 변경 시 영향 파악용)
- [ ] 그룹 생성 완료 시 이벤트/상태 정의 (충현의 프로필 완성 여부 체크와 연동)

---

## 6. 충돌이 실제로 났을 때

### `lib/types.ts` 충돌
1. 두 사람의 변경사항을 모두 살려서 수동 머지
2. 타입 중복/모순이 없는지 확인
3. 머지 후 `dev`에서 TypeScript 빌드 에러 없는지 확인: `npm run build`

### `supabase/migrations/` 충돌
1. 두 파일 모두 살린다 (삭제 금지)
2. 파일명 날짜가 같으면 한 쪽에 `_b` 접미사 추가 후 순서 조정
3. 내용이 의존 관계 없는지 확인 후 순서대로 적용

### 그 외 일반 충돌
```bash
git fetch origin
git rebase origin/dev
# 충돌 파일 수동 수정
git add .
git rebase --continue
```

---

## 7. 주차별 싱크 포인트

코드가 꼬이지 않으려면 **주 1~2회 짧은 싱크**가 필요하다.

| 시점 | 할 일 |
|------|-------|
| 매주 시작 | `dev` 상태 공유, 이번 주 작업 범위 간단히 공유 |
| 인터페이스 접점 작업 전 | `INTERFACE_CONTRACT.md` 수정 사항 논의 |
| PR 머지 전 | 공용 파일 수정 여부 알림 |
| 1주차 말 | DB 스키마 초안 확정 (이후부터는 마이그레이션으로만 변경) |

---

## 8. 긴급 상황 대응

### "dev가 빌드 깨졌다"
1. 마지막으로 머지된 PR 찾기
2. `git revert {머지 커밋 해시}` 로 되돌리기
3. 원인 파악 후 수정 브랜치에서 다시 PR

### "내 브랜치가 dev랑 너무 달라졌다"
```bash
git fetch origin
git rebase origin/dev
# 충돌이 많으면: 충돌 파일 목록을 상대방에게 공유하고 같이 해결
```

### "실수로 main에 push했다"
- 즉시 상대방에게 알린다
- `git revert` 로 되돌린다 (절대 force push 금지)

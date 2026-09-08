# Quantum 작업공간 최신 기준 정리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자 작업을 하나도 잃지 않으면서 현재 작업공간의 코드·문서·이미지·검증자료를 분류하고, 기능별 최신 기준과 배포 가능한 단일 커밋 계보를 확정한다.

**Architecture:** 현재 작업공간은 그대로 보존하고 먼저 읽기 전용 인벤토리를 만든다. 이후 “커밋된 코드”, “검토할 문서”, “실제 앱 자산”, “원본 조사자료”, “재생성 가능한 산출물”을 분리하며, 날짜가 아니라 사용자 승인·코드 연결·검증 증거를 기준으로 기능별 최신본을 결정한다. 삭제·이동·스테이지·커밋·푸시·마이그레이션·배포는 각 승인 게이트 전에는 수행하지 않는다.

**Tech Stack:** Git, PowerShell, Next.js, Supabase, Vercel, Expo/EAS, Markdown/CSV 검증 대장

---

## 1. 2026-08-19 실측 기준

| 항목 | 현재 값 | 해석 |
| --- | --- | --- |
| 현재 브랜치 | `codex/quantum-handphone` | 로컬 통합 후보 |
| 현재 HEAD | `982eeaa20249c0e30ace249bebb5f9e678f0e5a2` | 로컬에서 가장 최신인 커밋 후보 |
| 원격 추적 브랜치 | `origin/codex/quantum-handphone` at `9376af9d` | 로컬이 24커밋 앞섬 |
| 원격 main | `origin/main` at `e25aec55` | 현재 로컬 통합 후보보다 오래됨 |
| 추적 수정 | 49개 | 모두 문서·지침이며 앱 소스 수정은 없음 |
| 미추적 | 8,536개 | 이미지 8,206개, 문서·메타데이터·도구 330개 |
| 미추적 용량 | 약 363MB | Git에 전부 넣을 대상이 아님 |

> 위 수치는 이 계획서 파일을 만들기 직전의 기준이다. 계획서 작성 후 미추적 수는 이 파일 1개가 추가되어 8,537개다.

### 미추적 자료의 주요 구성

| 영역 | 파일 수 | 용량 | 초기 분류 |
| --- | ---: | ---: | --- |
| `docs/research/campus-restaurants/` | 7,372 | 85.77MB | 조사 원본·후보 이미지·메타데이터 혼합 |
| `public/university-mascots/` | 819 | 146.95MB | 앱 자산 후보와 생성 산출물 혼합 |
| `맛집사진/` | 128 | 109.99MB | 사용자 원본·정리본, 삭제 금지 |
| `docs/handoff/` | 98 | 1.79MB | 활성·구형 인수인계 혼합 |
| `docs/superpowers/` | 47 | 소량 | 설계서·구현 계획 후보 |
| `docs/qa/` | 28 | 1.25MB | 검증 문서와 캡처 |
| `public/campus-eats/` | 4 | 12.90MB | 런타임 사용 여부 확인이 필요한 앱 자산 후보 |

## 2. “가장 최신 버전” 판정 규칙

프로젝트 전체를 하나의 날짜로 판정하지 않고 기능별로 최신 기준을 정한다.

1. **사용자 승인**: 대화나 확정 설계서에서 폐기·변경된 내용은 더 늦은 문서라도 기준본이 아니다.
2. **실제 코드 연결**: 화면·API·DB에 연결된 코드가 없는 문서는 구현본이 아니라 설계 후보로 표시한다.
3. **검증 증거**: 테스트·빌드·브라우저·원격 DB·배포 증거가 있는 커밋을 우선한다.
4. **배포 일치**: 로컬 HEAD, GitHub 커밋, Vercel 배포, Supabase migration, EAS 빌드가 같은 버전을 가리켜야 운영 최신본이다.
5. **날짜는 보조 정보**: 파일 수정 시각이나 문서 날짜만으로 최신본을 확정하지 않는다.
6. **상충 시 보류**: 두 문서가 충돌하면 임의로 합치지 않고 `결정 필요`로 남겨 사용자에게 선택을 요청한다.

각 기능은 아래 상태 중 하나만 갖는다.

- `CURRENT`: 승인·코드·검증이 일치하는 현재 기준
- `CANDIDATE`: 최신 방향이지만 구현 또는 검증이 부족함
- `SUPPORTING`: CURRENT를 설명하는 조사·QA 증거
- `SUPERSEDED`: 이후 결정으로 대체된 과거 문서
- `GENERATED`: 다시 만들 수 있는 생성 산출물
- `HOLD`: 출처·소유권·중복 여부가 불명확해 보존만 하는 자료

## 3. 최종 산출물

정리 작업이 끝나면 아래 네 파일이 프로젝트 기준판 역할을 한다.

1. `docs/coordination/QUANTUM_SOURCE_OF_TRUTH.md`
   - 기능별 현재 설계서, 코드 커밋, API, migration, 화면, 검증 상태
2. `docs/coordination/QUANTUM_CHANGE_LEDGER.csv`
   - 모든 수정·미추적 문서의 경로, 분류, 후속 조치, 근거
3. `docs/coordination/QUANTUM_ASSET_INVENTORY.csv`
   - 이미지·원본·런타임 자산의 해시, 용도, 출처, 사용권, 앱 참조 여부
4. `docs/coordination/QUANTUM_RELEASE_MANIFEST.md`
   - 출시할 Git SHA, migration 목록, Vercel 배포 ID, EAS 빌드 ID, 검증 결과

## 4. 실행 단계

### Task 1: 원본 보존 인벤토리 만들기

**Files:**
- Create: `docs/coordination/QUANTUM_CHANGE_LEDGER.csv`
- Create: `docs/coordination/QUANTUM_ASSET_INVENTORY.csv`
- Read: `.gitignore`
- Read: all paths returned by Git status

- [ ] **Step 1: 작업공간 신원 기록**

  현재 브랜치, HEAD, upstream, ahead/behind, worktree 목록을 대장에 기록한다. 브랜치를 바꾸지 않는다.

- [ ] **Step 2: 변경 파일 원본 목록 기록**

  추적 수정 49개와 미추적 8,536개의 경로·크기·확장자·수정 시각을 기록한다.

- [ ] **Step 3: 중요 원본 해시 기록**

  `맛집사진/`, `public/campus-eats/`, 설계서, QA 캡처에는 SHA-256을 기록한다. 이 단계에서는 복사·이동·삭제하지 않는다.

- [ ] **Step 4: 인벤토리 수량 교차검증**

  대장 행 수가 Git 실측 수와 정확히 일치해야 한다.

**완료 기준:** 미분류 파일 0개가 아니라, 우선 누락된 파일 0개. 모든 원본이 원래 위치에 그대로 남아 있어야 한다.

### Task 2: 변경사항을 다섯 묶음으로 분류하기

**Files:**
- Modify: `docs/coordination/QUANTUM_CHANGE_LEDGER.csv`
- Modify: `docs/coordination/QUANTUM_ASSET_INVENTORY.csv`

- [ ] **Step 1: 커밋된 앱 코드 기준 확정**

  `app/`, `components/`, `lib/`, `tests/`, `supabase/`, 모바일 앱의 현재 추적 상태를 검사한다. 현재 실측상 이 영역에는 미커밋 변경이 없으므로 `982eeaa2`를 로컬 코드 기준 후보로 기록한다.

- [ ] **Step 2: 문서 후보 분류**

  수정 문서 49개와 미추적 Markdown 177개를 `CURRENT`, `CANDIDATE`, `SUPPORTING`, `SUPERSEDED`, `HOLD` 중 하나로 지정한다. 내용 비교 없이 날짜만 보고 판정하지 않는다.

- [ ] **Step 3: 런타임 자산 분류**

  소스코드에서 실제 참조되는 파일만 앱 자산 후보로 표시한다. `public/`에 있다는 이유만으로 자동 커밋하지 않는다.

- [ ] **Step 4: 조사 원본과 생성물 분리**

  음식점·마스코트 자료에서 원본, 메타데이터, 후보 이미지, 최종 앱 자산, 재생성 가능한 보고서를 구분한다.

- [ ] **Step 5: 중복 해시 검사**

  같은 SHA-256 파일은 중복 그룹으로 표시하되 삭제하지 않는다.

**완료 기준:** 모든 파일에 `분류`, `근거`, `후속 조치`, `소유자 승인 필요 여부`가 기록되어야 한다.

### Task 3: 기능별 최신 기준 대장 작성하기

**Files:**
- Create: `docs/coordination/QUANTUM_SOURCE_OF_TRUTH.md`
- Read: `docs/engineering/INTERFACE_CONTRACT.md`
- Read: `docs/engineering/COLLABORATION.md`
- Read: approved specs and current implementation

- [ ] **Step 1: 기능 영역 고정**

  다음 영역을 각각 독립 행으로 관리한다: 인증, 프로필·사진·외모분석, 오늘밤·날짜 약속, 이벤트방·사전카드, 친구·초대·채팅, 모임, 커뮤니티, Campus Eats, 결제·환불·이월, 모바일, 보안·배포, 5회 연애 프로그램.

- [ ] **Step 2: 각 영역의 다섯 근거 연결**

  각 행에 `승인 설계서`, `코드 커밋`, `API/DB`, `검증 문서`, `운영 배포 상태`를 연결한다.

- [ ] **Step 3: 충돌 문서 표시**

  예를 들어 5일 연속 프로그램과 약 10일·5회 프로그램처럼 계약이 다른 문서는 하나로 섞지 않고 `결정 필요`로 표시한다.

- [ ] **Step 4: 구현과 설계를 구분**

  정적 목업, HTTP 200, 문서 작성만으로 `구현 완료`를 표시하지 않는다.

**완료 기준:** 사용자가 기능 이름 하나를 말하면 현재 설계·코드·검증·배포 상태를 한 행에서 확인할 수 있어야 한다.

### Task 4: Git 계보와 오래된 worktree 비교하기

**Files:**
- Modify: `docs/coordination/QUANTUM_SOURCE_OF_TRUTH.md`
- Modify: `docs/coordination/QUANTUM_CHANGE_LEDGER.csv`

- [ ] **Step 1: 네 기준점 비교**

  `origin/main` (`e25aec55`), `origin/codex/quantum-handphone` (`9376af9d`), 현재 HEAD (`982eeaa2`), 운영 배포 커밋을 비교한다.

- [ ] **Step 2: 로컬 전용 24커밋 검토**

  각 커밋을 기능·보안·테스트·문서로 분류하고, 의도하지 않은 파일이 섞이지 않았는지 확인한다.

- [ ] **Step 3: 다른 worktree는 읽기 전용 판정**

  각 worktree를 `재사용`, `감사 필요`, `삭제 보류`로 분류한다. 정리 단계에서는 worktree를 제거하지 않는다.

- [ ] **Step 4: 원격·로컬·운영 차이 기록**

  “가장 최신”을 `로컬 최신`, `GitHub 최신`, `운영 최신`으로 나누어 기록한다.

**완료 기준:** 어느 브랜치나 worktree도 조사 없이 삭제 후보가 되지 않아야 하며, 로컬 전용 커밋의 목적이 전부 설명되어야 한다.

### Task 5: 깨끗한 복제본에서 코드 후보 재검증하기

**Files:**
- Create outside main workspace: temporary clean verification worktree at `982eeaa2`
- Update: `docs/coordination/QUANTUM_SOURCE_OF_TRUTH.md`

- [ ] **Step 1: 현재 HEAD 깨끗한 검증 환경 생성**

  원본 작업공간의 미추적 파일을 복사하지 않은 별도 worktree에서 실행한다.

- [ ] **Step 2: 웹 회귀 검증**

  타입 검사, 인증·프로필·매칭·설정 테스트, 린트, 비밀정보 검사, 운영형 빌드를 실행한다.

- [ ] **Step 3: 모바일 회귀 검증**

  타입 검사, 전체 테스트, Expo Doctor를 실행한다.

- [ ] **Step 4: 브라우저 핵심 동선 검증**

  로그인, 프로필, 매칭, 친구, 모임, 커뮤니티, Campus Eats를 모바일과 데스크톱에서 클릭한다. 콘솔 오류와 버튼 이동을 기록한다.

- [ ] **Step 5: 외부 환경은 별도 판정**

  Supabase migration, Vercel, AI 서버, Toss, EAS는 로컬 통과와 분리해 표시한다.

**완료 기준:** 동일 SHA의 깨끗한 작업공간에서 전체 로컬 검증이 통과하고, 미검증 외부 항목이 별도 목록으로 남아야 한다.

### Task 6: 문서와 자산의 실제 보존안 사용자 승인받기

**Files:**
- Modify: `docs/coordination/QUANTUM_CHANGE_LEDGER.csv`
- Modify: `docs/coordination/QUANTUM_ASSET_INVENTORY.csv`
- Modify after approval only: `docs/README.md`
- Modify after approval only: `.gitignore`

- [ ] **Step 1: 사용자에게 다섯 목록 보고**

  `바로 커밋`, `내용 검토 후 커밋`, `원본 별도 보관`, `ignore 추가`, `삭제 보류` 목록을 파일 수와 용량까지 보고한다.

- [ ] **Step 2: 문서 승격·보관 승인**

  현재 설계서와 구형 handoff를 구분하는 사용자 승인을 받는다.

- [ ] **Step 3: 자산 보관 승인**

  저작권·출처·앱 참조 여부가 확인된 최종 자산만 Git 후보로 승격한다. 대형 원본은 외부 원본 저장소나 Git LFS 사용 여부를 별도 결정한다.

- [ ] **Step 4: ignore 규칙 승인**

  재생성 가능한 대량 산출물만 `.gitignore`에 추가한다. 원본을 숨기는 ignore 규칙은 만들지 않는다.

**완료 기준:** 사용자 승인 기록 없이 파일 이동·삭제·ignore 처리된 항목이 0개여야 한다.

### Task 7: 커밋 경계를 고정하고 순차 커밋하기

**Files:**
- Create: `docs/coordination/QUANTUM_COMMIT_PLAN.md`
- Stage only explicitly listed files

- [ ] **Step 1: 커밋 계획 작성**

  잔여 작업은 아래 순서로 분리한다.

  1. 운영 규칙: `AGENTS.md`, 협업·라우팅 문서
  2. 현재 제품 설계: 승인된 spec과 implementation plan
  3. 검증 증거: QA·보안 감사 문서와 필요한 캡처
  4. Campus Eats 런타임 자산·메타데이터
  5. 조사 도구·재현 가능한 연구 메타데이터
  6. 문서 인덱스·archive 표기·ignore 규칙

- [ ] **Step 2: 각 커밋 직전 포함 파일 확인**

  `git diff --cached --name-only` 결과가 계획 목록과 정확히 같을 때만 커밋한다. `git add .`는 사용하지 않는다.

- [ ] **Step 3: 커밋별 검증**

  코드 영향이 없는 문서 커밋은 링크·경로·중복 기준을 확인하고, 런타임 자산 커밋은 실제 화면과 빌드를 확인한다.

- [ ] **Step 4: 커밋 후 원본 작업공간 재계수**

  남은 파일이 모두 대장에서 `외부 보관`, `ignore`, `삭제 보류` 중 하나로 설명되는지 확인한다.

**완료 기준:** 하나의 커밋에 서로 무관한 기능이 섞이지 않고, 모든 커밋을 독립적으로 되돌릴 수 있어야 한다.

### Task 8: GitHub·DB·배포 승격 준비하기

**Files:**
- Create: `docs/coordination/QUANTUM_RELEASE_MANIFEST.md`

- [ ] **Step 1: push 전 최종 비교**

  현재 브랜치가 원격보다 앞선 커밋과 사용자 승인 커밋만 포함하는지 확인한다.

- [ ] **Step 2: GitHub 반영 승인**

  solo-owner 규칙에 따라 사용자가 main 직접 반영 또는 작업 브랜치 push를 명확히 선택한 뒤 실행한다.

- [ ] **Step 3: migration 별도 승인**

  Git push와 DB migration을 묶지 않는다. 로컬·원격 migration 이름과 SQL을 비교하고 별도 승인 후 적용한다.

- [ ] **Step 4: 배포 버전 연결**

  Vercel 배포 ID와 Git SHA, EAS build ID와 Git SHA를 release manifest에 기록한다.

- [ ] **Step 5: 운영 검증**

  운영 로그인·프로필·외모분석·매칭·친구·모임·커뮤니티·Campus Eats와 실기기 소셜 로그인을 다시 검증한다.

**완료 기준:** GitHub, Supabase, Vercel, EAS가 같은 승인 SHA와 계약을 가리켜야 한다.

## 5. 사용자 보고 방식

각 단계가 끝날 때 아래 형식으로만 보고한다.

| 항목 | 내용 |
| --- | --- |
| 기준 | 브랜치, HEAD, 비교 대상 |
| 이번에 확인한 것 | 실제로 읽거나 실행한 범위 |
| 분류 결과 | CURRENT/CANDIDATE/SUPPORTING/SUPERSEDED/GENERATED/HOLD 수량 |
| 변경한 것 | 파일 경로와 이유, 없으면 `변경 없음` |
| 검증 증거 | 테스트 수, 화면 캡처, DB/배포 ID |
| 사용자 승인 필요 | 이동·삭제·커밋·push·migration·배포 항목 |
| 남은 위험 | 아직 증명하지 못한 것 |

## 6. 전체 완료 기준

- [ ] 추적 수정과 미추적 파일이 모두 대장에 등록됨
- [ ] 앱 코드, 문서, 런타임 자산, 조사 원본, 생성물이 서로 분리됨
- [ ] 기능별 CURRENT 문서와 코드 커밋이 하나씩 지정됨
- [ ] 충돌 문서는 사용자 결정 없이는 통합되지 않음
- [ ] 깨끗한 `982eeaa2` 기준 전체 로컬 회귀 검증이 통과함
- [ ] 모든 커밋이 승인된 파일 목록만 포함함
- [ ] 원본 이미지와 사용자 자료가 유실되지 않음
- [ ] GitHub·Supabase·Vercel·EAS 버전 관계가 release manifest에 기록됨
- [ ] 운영 미검증 항목을 완료로 표시하지 않음

## 7. 즉시 적용할 판정

- 현재 **로컬 앱 코드 최신 후보**는 `codex/quantum-handphone`의 `982eeaa2`다.
- 현재 **GitHub의 동일 브랜치 최신본**은 `9376af9d`이며 로컬보다 24커밋 뒤다.
- 현재 49개 추적 변경은 앱 코드가 아니라 문서·운영 지침이다.
- 미추적 8,536개를 한꺼번에 커밋하거나 삭제하면 안 된다.
- 다음 실제 작업은 Task 1의 읽기 전용 인벤토리 생성이며, 그 결과를 사용자에게 보여준 뒤에만 분류·이동·커밋 단계로 넘어간다.

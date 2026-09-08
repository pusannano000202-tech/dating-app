# Meetup gender restrictions implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for independent implementation and review. No Git staging or commits are authorized.

**Goal:** 일반 활동 모임에서 성별 무관/남자끼리/여자끼리 모집을 선택하고 해당 성별만 실제 생성·참가하도록 서버에서 보장한다.

**Architecture:** 기존 activity_meetups에 기본 all인 gender_mode를 추가한다. 옛 create/list 함수는 호환성을 유지하고 새 v2 함수가 확장 입력·응답을 제공한다. 모든 실제 참가 진입은 기존 join RPC에서 검사해 구 클라이언트도 우회하지 못한다.

**Tech stack:** Next.js, TypeScript, Supabase Postgres RPC, node:test, 로컬 브라우저.

## 승인과 범위

사용자: “남자끼리·여자끼리 모집에 해당 성별만 실제 참가할 수 있도록 제한하는 방식”에 “어 그렇게 구현해 보도록 해라.”

현재 W는 integrated-campus-20260905, branch codex/integrated-campus-20260905, HEAD be9078565d8e59f73cbc017f3c7b1484996da1c3, dirty453/staged0. 이미 진행 중인 격리 통합판에서 연속 작업하며 기존 변경을 보존한다.

허용: 모임 생성·목록·참가 코드, 관련 타입/테스트, forward migration 파일, 전용 로컬 DB 검증. 금지: 타 기능 확장, Git stage/commit/push, 원격 DB·Auth·RLS 적용, 배포, 결제, 초기화·기존 사용자 데이터 삭제.

## 목표와 필수 완료 기준

1. 모집 조건: 1.1 기본 성별 무관 보존. 1.2 남자끼리/여자끼리 저장·재조회. 1.3 목록 필터·카드 배지·정확한 참가 불가 사유 표시.
2. 서버 권한: 2.1 생성자도 모집 조건 검사. 2.2 직접 POST/RPC·거짓 body gender로 우회 불가. 2.3 미확인/other/prefer_not_to_say는 전용 모집만 거부. 2.4 본인 취소는 성별 변화와 무관하게 허용.
3. 기존 보존: 3.1 기존 행은 all. 3.2 학교 격리·정원 row lock·중복 참가 멱등·재참가 유지. 3.3 기존 생성/목록 RPC 시그니처 보존. 3.4 사람들의 성별·전화번호는 목록 응답에 추가하지 않음.
4. 검증: 4.1 RED→GREEN. 4.2 로컬 DB 남녀/미설정/다른학교/마감/중복·취소 검증. 4.3 모바일390/데스크톱1440 실제 생성·필터·이동·캡처. 4.4 독립 권한/코드 검토.

성별은 비공개 커뮤니티 프로필의 community_gender만 사용하며 profiles.gender와 JWT metadata는 사용하지 않는다. 공적 신분 확인 기능은 새로 만들지 않는다. 혼합 비율/남녀 정원 강제는 범위 밖. 성별 무관은 어떤 성별이든 가능하고 특정 비율을 약속하지 않는다. 이미 참가한 뒤 성별을 변경해도 자동 강퇴하지 않으며 취소는 가능하고 join 재호출은 현재 성별 검사 후 적격 사용자만 reused를 반환한다. 기존 회원 자격 재조정/호스트 변경 처리는 별도 정책과 UX가 필요하므로 미구현으로 보고한다.

## 공통 인터페이스

```ts
type MeetupGenderMode = 'all' | 'male_only' | 'female_only'
type MeetupGenderEligibility = 'eligible' | 'gender_required' | 'gender_restricted'
// POST /api/meetups accepts gender_mode; omitted means all; unknown/null rejects.
// GET /api/meetups?gender_mode=male_only filters before database LIMIT.
// New list rows include gender_mode and gender_eligibility, never caller gender.
// Error meetup_gender_required =>409; meetup_gender_restricted=>403.
```

## 파일/작업 배정

- 부모: lib/community/meetup-gender.ts, lib/community/contracts.ts, lib/community/api-errors.ts, app/api/meetups/route.ts, 새 migration, tests/config/meetup-gender.test.ts, tests/tooling/meetup-gender-db.sql, docs/engineering/COMMUNITY_INTERFACE_CONTRACT.md, 결과 보고.
- UI worker: components/meetups/CreateMeetupForm.tsx, components/meetups/MeetupHub.tsx, tests/config/meetup-gender-ui.test.ts.
- 독립 reviewer: SQL/identity 설계 및 전체 변경 읽기 전용 검토.

## 실행

- [x] 타입/입력 검증 테스트: 생략 all·남녀 값 보존·unknown/null 거부·오류코드 매핑을 먼저 실패 확인.
- [x] 공통 타입/validator/API 계약 연결, 새 DB 함수 미적용 시 정직한 연결 준비 상태 유지.
- [x] CLI migration new로 정확한 UTC 파일 생성 후 apply_patch로 SQL 작성. 기존 migration 수정 금지.
- [x] 로컬 rollback 트랜잭션에서 male/female/unknown/other 계정과 3모드 기대값 검사. 72개 ASSERT 통과 후 새 DB 권한을 전용 로컬에만 적용.
- [x] UI 3모드 선택·URL 필터·조건 배지·불가 사유·취소 보존 연결.
- [x] `npx tsc -p tsconfig.config-tests.json` 뒤 해당 node:test 실행; 기존 Auth·Config·Matching·Profile 1,693건 통과 및 최종 정식 빌드 성공.
- [x] localhost:3010 로컬 OTP 테스트 계정의 모임 생성→목록→필터→새로고침 확인. 검수 모임 2개는 로컬 전용이며 보고서에서 명시.
- [x] 독립 spec/security review 후 코드 품질 review, 중복 요청 P2 수정·재검증. 최종 Critical/Important/P2 모두 0.

## 재작업 장부

실패한 기준·증거·원인·수정·재검증을 이 문서 또는 결과 보고서에 기록한다. 원격 검증은 이번 완료 기준이 아니며 별도로 미검증 표시한다.

최종 결과: `docs/operations/meetup-gender-implementation-20260906.md`. 실제 2세션 동시 경쟁, 비호스트 브라우저 취소, 성별 변경 후 기존 회원 자격 재조정은 제한사항으로 남겼다. 별도 기존 DB lint 오류 3개도 보고서에 기록했으며 해당 금융/도착 도움 함수는 이번에 수정하지 않았다.

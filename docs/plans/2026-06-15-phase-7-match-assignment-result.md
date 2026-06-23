# Phase 7 매칭 배정 결과

작성일: 2026-06-15  
대상: `supabase/migrations/20260615_phase_7_match_assignment.sql`

## 완료 항목

- `public.confirm_match(UUID)`는 리더 확인 후 두 그룹이 모두 확인되면
  `assign_match_meeting_for_confirmed_match`를 호출해서 `match_meetings`를 생성합니다.
- `assign_match_meeting_for_confirmed_match(p_match_id UUID)` 등록 완료.
- 배정 기준
  - `matches.status = confirmed`일 때만 배정 시도
  - 기존 `match_meetings`가 있으면 재생성하지 않음
  - `profiles.available_timeslots.slots`를 기반으로 교집합 시간 추출
  - 교집합 없으면 19:00~21:00 fallback
  - `venues`는 `active`, `suitable_for_group_meeting`, 그룹 인원 범위를 만족하는 항목에서 1건 선택
  - `assignment_reason`에 `timeslot_intersection` / `no_timeslot_intersection` / `no_available_venue` 저장

## 검증

- 로컬: `.tmp/phase5-local-supabase`
- `supabase db lint --local`: `assign_match_meeting_for_confirmed_match` 통과
- 앱 빌드 체크: `npm run typecheck`, `npm run lint`, `npm run build` 통과
- DB 시나리오 검증(임시 데이터)
  - 4명 그룹 2팀 생성, 카드 제출/입금 완료
  - 양쪽 리더 `confirm_match` 순차 호출
  - `matches.status = confirmed` 확인
  - `match_meetings` 행 생성 확인

## 다음 단계

- Phase 8: 매칭 확정 후 데일리카드/리허설(Q&A) 노출 UX 정리  
- Phase 9: 매칭 확정 후 채팅 및 접근권한 정책 정리

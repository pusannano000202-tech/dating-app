# Quantum 커뮤니티·모임 인터페이스 계약

현재 상태: 로컬 구현 진행 중 / production 비활성

## 공개 범위

- 2026-08-08 사용자 승인에 따라 활동 모임과 학교 커뮤니티의 로컬 구현을 시작했다.
- 개발 환경에서는 실제 API 계약과 실패 상태를 검수하되, 저장 성공을 가짜로 만들지 않는다.
- production에서는 `NEXT_PUBLIC_COMMUNITY_ENABLED=true`가 명시되기 전까지 커뮤니티·모임 탭을 숨긴다.
- production 직접 주소는 신청, 투표, 참여 수치가 없는 준비 중 화면만 보여준다.
- migration이 원격 DB에 적용되기 전에는 API가 `community_schema_unavailable`을 반환하고 화면은 연결 준비 상태를 표시한다.

## 현재 데이터 소유권

다음 데이터는 데이팅 매칭용 `groups`, `reviews`와 분리한다.

- `activity_meetups`, `activity_meetup_members`: 학교 활동 모임과 참여 상태. 2026-09-06 승인에 따라 기본 성별 무관과 남자끼리·여자끼리 개설/참가 조건을 지원한다.
- `community_posts`: 개발자 피드백, 만남 후기, 연애상담, 연애코치 질문
- `community_post_comments`: 최대 3단계 익명 댓글과 소프트 삭제 상태
- `community_post_likes`, `community_comment_reactions`: 사용자마다 대상별 1개의 좋아요 또는 싫어요 반응
- `community_action_rate_limits`: 글·댓글·반응 쓰기 요청의 서버 측 속도 제한
- Campus Eats: 검증된 식당 후보와 월드컵은 기존 독립 도메인을 유지한다.
- 신고 접수와 운영자 처리 테이블은 아직 출시 범위에 포함하지 않는다.

직접 테이블 접근은 차단하고 인증 사용자 전용 RPC만 공개한다. 목록 RPC는 작성자 UUID를 반환하지 않고 익명 별칭과 본인 작성 여부만 반환한다. 글·댓글 삭제와 반응 변경은 인증 사용자 본인의 권한을 서버 함수에서 다시 확인한다.

## 활동 모임 성별 조건 (2026-09-06)

- 저장값 `gender_mode`: `all`(성별 무관, 기본), `male_only`(남자끼리), `female_only`(여자끼리). 성별 무관은 남녀 비율이나 혼합 성별 구성을 보장한다는 뜻이 아니다.
- POST `/api/meetups`는 `gender_mode`를 받으며 누락만 `all`로 처리한다. null/잘못된 값은 `400 invalid_gender_mode`.
- GET `/api/meetups?gender_mode=...`에서 생략은 모든 조건, `all`은 성별 무관만 조회한다. 학교·성별 필터를 정렬/LIMIT 전에 적용한다.
- 새 목록 응답은 `gender_mode`, `gender_eligibility`(`eligible|gender_required|gender_restricted`)를 추가한다. 개인 성별·호스트 ID·전화번호·성별별 인원을 추가하지 않는다.
- 서버 권한 원본은 비공개 `quantum_private.community_member_profiles.community_gender`뿐이다. 오래된 `profiles.gender`, JWT 사용자 metadata, 요청 body의 gender를 권한으로 사용하지 않는다.
- 모집 조건에 맞는 등록 성별만 개설·신규 참가·재참가할 수 있다. other/prefer_not_to_say/unknown/미등록은 제한 모임에서 `409 meetup_gender_required`, 반대 성별은 `403 meetup_gender_restricted`. 성별 무관은 기존 학교 프로필 조건 안에서 모두 허용한다.
- 기존 6인자 `create_activity_meetup`와 목록 시그니처는 유지한다. 앱은 별도 `create_activity_meetup_v2`/`list_activity_meetups_v2`를 사용한다. 기존 `join_activity_meetup(UUID)` 자체가 검사하므로 구 클라이언트의 직접 참가도 제한된다.
- 프로필 저장과 create/join은 같은 사용자 advisory lock을 사용하고, join은 그 뒤 모임 row lock을 잡는다. 중복 참가·정원·학교 격리를 유지한다.
- 가입 이후 성별 변경은 기존 회원을 자동 탈퇴시키지 않는다. 취소는 계속 가능하며 모든 join 호출은 현재 조건으로 다시 검사한다. 변경 시 기존 회원 자격을 재조정하는 정책과 호스트 처리 UX는 별도 미구현이다.
- 등록 프로필에 대한 검사이며 공적 신분/성별 인증이 아니다. 신규 migration이 미적용된 환경은 연결 준비 상태를 반환하며 구 DTO를 `all`로 꾸며 참가를 열지 않는다.

## 출시 Gate

1. DB/API/migration 변경을 독립 커밋으로 분리한다.
2. 학교 격리, 모임 정원 동시성, 재참여, 익명 작성자 비공개를 staging에서 검증한다.
3. 글·댓글 작성자 권한, 3단계 답글 제한, 반응 1인 1표, 속도 제한을 서로 다른 계정으로 검증한다.
4. 신고·운영 숨김 기능을 구현하고 운영자 처리 동선을 검증한다.
5. 모바일/데스크톱 실제 사용자 E2E를 통과한다.
6. 위 조건을 통과한 뒤에만 production flag를 켠다.

어떤 환경에서도 mock 숫자나 저장되지 않은 참여 완료 상태를 실제 기능처럼 노출하지 않는다.

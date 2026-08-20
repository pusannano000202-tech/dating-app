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

- `activity_meetups`, `activity_meetup_members`: 성별 조건이 없는 학교 활동 모임과 참여 상태
- `community_posts`: 개발자 피드백, 만남 후기, 연애상담, 연애코치 질문
- `community_post_comments`: 최대 3단계 익명 댓글과 소프트 삭제 상태
- `community_post_likes`, `community_comment_reactions`: 사용자마다 대상별 1개의 좋아요 또는 싫어요 반응
- `community_action_rate_limits`: 글·댓글·반응 쓰기 요청의 서버 측 속도 제한
- Campus Eats: 검증된 식당 후보와 월드컵은 기존 독립 도메인을 유지한다.
- 신고 접수와 운영자 처리 테이블은 아직 출시 범위에 포함하지 않는다.

직접 테이블 접근은 차단하고 인증 사용자 전용 RPC만 공개한다. 목록 RPC는 작성자 UUID를 반환하지 않고 익명 별칭과 본인 작성 여부만 반환한다. 글·댓글 삭제와 반응 변경은 인증 사용자 본인의 권한을 서버 함수에서 다시 확인한다.

## 출시 Gate

1. DB/API/migration 변경을 독립 커밋으로 분리한다.
2. 학교 격리, 모임 정원 동시성, 재참여, 익명 작성자 비공개를 staging에서 검증한다.
3. 글·댓글 작성자 권한, 3단계 답글 제한, 반응 1인 1표, 속도 제한을 서로 다른 계정으로 검증한다.
4. 신고·운영 숨김 기능을 구현하고 운영자 처리 동선을 검증한다.
5. 모바일/데스크톱 실제 사용자 E2E를 통과한다.
6. 위 조건을 통과한 뒤에만 production flag를 켠다.

어떤 환경에서도 mock 숫자나 저장되지 않은 참여 완료 상태를 실제 기능처럼 노출하지 않는다.

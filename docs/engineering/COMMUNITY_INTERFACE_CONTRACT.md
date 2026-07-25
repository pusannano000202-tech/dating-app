# Quantum 커뮤니티·모임 인터페이스 계약

현재 상태: production 비활성

## 공개 범위

- 개발 환경에서는 화면과 학교 테마를 검수하기 위한 프론트 미리보기만 허용한다.
- production에서는 `NEXT_PUBLIC_COMMUNITY_ENABLED=true`가 명시되기 전까지 커뮤니티·모임 탭을 숨긴다.
- production 직접 주소는 신청, 투표, 참여 수치가 없는 준비 중 화면만 보여준다.
- 현재 `app/api/community`와 전용 DB migration, RLS 정책은 존재하지 않는 것으로 취급한다.

## 향후 데이터 소유권

정식 공개 전 아래 도메인의 테이블, API 소유자, 공개 범위, 삭제 정책을 별도 설계해야 한다.

- `posts`: 게시글과 댓글
- `polls`, `votes`: 투표와 학교별 집계
- `meetups`, `members`: 모임과 참여자
- `reports`: 신고와 운영 처리 상태

## 출시 Gate

1. 사용자 승인 후 별도 구현 계획을 확정한다.
2. DB/API/migration 변경을 독립 커밋으로 분리한다.
3. 작성자·학교·참여자 기준 RLS를 staging에서 검증한다.
4. 중복 투표, 탈퇴자 데이터, 신고자 익명성, 삭제·차단 예외를 테스트한다.
5. 실제 사용자 E2E와 운영자 신고 처리 동선을 통과한 뒤에만 production flag를 켠다.

이 계약이 승인되기 전에는 mock 숫자나 참여 완료 상태를 실제 기능처럼 노출하지 않는다.

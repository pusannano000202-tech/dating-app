# Supabase end-to-end 데이터 흐름 점검 계획

작성일: 2026-06-20
담당: 팀장방
기준 브랜치: `profile/post-worldcup-decisions-2026-05-21`

## 0. 이번 문서의 목적

지금 단계에서 중요한 것은 정교한 매칭 알고리즘보다 사용자가 앱을 눌렀을 때 다음 화면이 자연스럽게 열리고, 입력한 내용이 실제 Supabase에 남는지 확인하는 것이다.

이 문서는 아래를 점검하기 위한 기준 문서다.

- 앱 전체에서 Supabase에 들어가야 하는 데이터
- 프론트 버튼/입력값이 실제 API와 DB까지 이어지는지
- 보증금 결제 여부가 저장되는지
- 매칭 후 참석/노쇼/환불 판단에 필요한 데이터가 저장되는지
- 사이드 작업방 또는 성준 작업방에 줄 점검 프롬프트

## 1. 이번 결정

이번 MVP에서는 아래 기능을 과감하게 뒤로 뺀다.

- 학교 이메일 인증은 삭제한다.
- 이상형 월드컵 상세 벡터 저장은 나중에 구현한다.
- 외모 AI 정밀 매칭은 나중에 구현한다.
- 결제는 실제 Toss 결제 전까지 mock 또는 무료 베타 정책으로 점검한다.

이번 MVP에서 반드시 남겨야 하는 것은 아래다.

- 이메일 인증 또는 Supabase Auth 계정 생성
- 기본 프로필 저장
- 사진 업로드 저장
- 성격 검사 저장
- 가능 시간 저장
- 매칭 비중 저장
- 친구/그룹/초대 저장
- 매칭 큐 진입 상태 저장
- 매칭 결과 상태 저장
- 보증금 또는 무료 베타 참여 확인 저장
- 만남 시간/장소 저장
- 참석 체크인 저장
- 노쇼 확정 저장
- 환불 요청/정산 상태 저장
- 데일리카드 작성/공개 저장
- 채팅 저장
- 알림 저장

## 2. Supabase에 들어가야 하는 데이터 전체 목록

### 2.1 계정

저장 위치:

- `auth.users`

필수 데이터:

- user id
- email 또는 phone
- 인증 완료 여부
- created_at
- last_sign_in_at

MVP 판단:

- 학교 이메일 인증은 제외한다.
- 앱 로그인은 Supabase Auth 하나로 충분하다.

### 2.2 프로필

저장 위치:

- `profiles`

필수 데이터:

- `user_id`
- `display_name`
- `gender`
- `age`
- `height`
- `body_type`
- `school`
- `department`
- `year`
- `is_profile_complete`
- `updated_at`

후순위 데이터:

- `appearance_type`
- `self_appearance_score`
- `appearance_score_normalized`
- 이상형 월드컵 벡터류

MVP 판단:

- 이상형 상세 저장은 뒤로 미룬다.
- 매칭 동선에서는 프로필 완료 여부와 최소 정보가 더 중요하다.

### 2.3 온보딩 진행 상태

저장 위치 후보:

- 우선 `profiles` 컬럼
- 나중에 필요하면 `profile_onboarding_steps` 별도 테이블

필수 데이터:

- `basic_completed_at`
- `photos_completed_at`
- `personality_completed_at`
- `schedule_completed_at`
- `preference_completed_at`
- `is_profile_complete`

현재 코드에서 이미 쓰는 신호:

- `profiles.is_profile_complete`
- `profiles.big5_*`
- `profiles.available_timeslots`
- `profiles.preference_weights`
- `photos` row 존재 여부

점검 기준:

- 사용자가 홈에 들어왔을 때 빈 단계로 자동 이동하는지
- 완료한 단계는 다시 들어가도 기존 값이 불러와지는지
- 모든 단계 완료 후 `/group/create` 또는 홈 매칭 상태로 이동하는지

### 2.4 사진

저장 위치:

- Supabase Storage bucket `photos`
- DB table `photos`

필수 데이터:

- `user_id`
- `storage_path`
- `public_url`
- `sort_order`
- `created_at`

프론트/API 점검:

- `/profile/photos`에서 사진 선택
- Storage 업로드
- 기존 `photos` row 삭제 후 새 row insert
- `/api/score` 호출은 실패해도 온보딩은 진행 가능해야 함

### 2.5 성격 검사

저장 위치:

- `profiles`

필수 데이터:

- `big5_openness`
- `big5_conscientiousness`
- `big5_extraversion`
- `big5_agreeableness`
- `big5_neuroticism`
- `personality_completed_at` 또는 동등한 완료 신호

점검 기준:

- `/profile/survey` 완료 버튼 클릭
- `profiles.big5_*` upsert
- 다음 단계로 이동
- 다시 들어오면 기존 점수 결과가 보이는지

### 2.6 가능 시간

저장 위치:

- `profiles.available_timeslots`

필수 데이터 예시:

```json
{
  "slots": [
    { "day": "friday", "start": "18:00", "end": "22:00" },
    { "day": "saturday", "start": "14:00", "end": "20:00" }
  ]
}
```

점검 기준:

- `/profile/schedule`에서 1개 이상 선택해야 다음 버튼 활성
- 저장 후 `profiles.available_timeslots`에 반영
- 매칭찾기 조건에서 빈 값이면 막힘

### 2.7 매칭 비중

저장 위치:

- `profiles.preference_weights`

MVP 필수 4개:

```json
{
  "appearance": 0.35,
  "personality": 0.35,
  "height": 0.15,
  "body_type": 0.15
}
```

제외:

- `school`
- `hobby`
- `time_fit`

점검 기준:

- UI가 4개만 받는지
- 합계가 1.0 또는 100%인지
- 저장 후 매칭찾기 조건에서 통과하는지

### 2.8 친구와 그룹

저장 위치:

- `friend_requests`
- `friendships`
- `groups`
- `group_members`
- `group_invites`

필수 데이터:

- 친구 요청 보낸 사람
- 친구 요청 받은 사람
- 요청 상태
- 그룹 id
- 리더 user id
- 그룹 정원
- 그룹 멤버
- 초대 상태

점검 기준:

- 친구 추가 버튼 클릭
- 요청 생성
- 수락 시 friendship 생성 또는 상태 갱신
- 그룹 생성
- 친구 초대
- 친구 수락 후 group_members 증가

### 2.9 매칭 큐

저장 위치:

- `match_pool`
- `groups.status`

필수 데이터:

- `group_id`
- `status`
- `entered_at`
- `cancelled_at`
- 큐 통계 조회용 남자/여자 그룹 수

프론트 점검:

- 그룹 정원이 차기 전에는 매칭찾기 버튼 비활성
- 내 성격/가능시간/비중이 비면 비활성
- 그룹원 준비가 안 끝나면 비활성
- 조건 만족 후 매칭찾기 클릭
- `match_pool` 또는 RPC를 통해 큐 진입 저장

### 2.10 매칭 결과

저장 위치:

- `matches`

필수 데이터:

- `id`
- `group_a_id`
- `group_b_id`
- `status`
- `score`
- `score_breakdown`
- `matched_at`
- `confirmed_at`
- `cancelled_at`
- `approval_status`

점검 기준:

- 매칭 결과가 `/match`에 나타나는지
- `/match/[id]` 상세로 이동하는지
- 수락 버튼 클릭 시 `matches` 상태가 바뀌는지
- 양쪽 수락 후 시간/장소 생성으로 이어지는지

### 2.11 보증금/참여 확인

저장 위치:

- `deposits`

필수 데이터:

- `user_id`
- `group_id`
- `amount`
- `status`: `pending`, `paid`, `held`, `refunded`, `forfeited`
- `paid_at`
- `refunded_at`
- 결제 provider key

현재 코드 기준:

- `POST /api/deposits`
- RPC `mock_pay_deposit`
- 테이블 `deposits`

MVP 판단:

- 초기 무료 배포라면 실제 결제 대신 `무료 참여 확인` 또는 `mock paid` 상태를 저장한다.
- 그래도 환불/노쇼 구조를 점검하려면 `deposits`에는 row가 있어야 한다.

점검 기준:

- 사용자가 참여 확인/보증금 버튼 클릭
- `deposits`에 해당 user/group row 생성
- group detail에서 `my_group_deposit_paid_count`가 증가
- 매칭 확정 조건에서 보증금 또는 무료 참여 확인이 반영

### 2.12 만남 시간/장소

저장 위치:

- `venues`
- `match_meetings`

필수 데이터:

- `match_id`
- `venue_id`
- `scheduled_start`
- `scheduled_end`
- `status`
- `checkin_radius_m`
- 장소 이름
- 주소
- 지도 링크

점검 기준:

- 양쪽 수락 후 `match_meetings` row 생성
- `/match/[id]`에서 시간/장소 표시
- 지도 열기 버튼이 실제 링크로 이동

### 2.13 참석/체크인/노쇼

저장 위치:

- `attendances`
- `deposits`
- `notifications`

필수 데이터:

- `match_id`
- `user_id`
- `status`: `pending`, `checked_in`, `no_show`
- `checked_in_at`
- `checkin_lat`
- `checkin_lng`
- `no_show_finalized_at`
- 몰수 금액 또는 환불 기준 금액

현재 코드 기준:

- `POST /api/matches/[id]/checkin`
- RPC `checkin_attendance`
- `POST /api/matches/[id]/finalize-no-show`
- RPC `finalize_no_show`
- `GET /api/matches/[id]/attendance-state`
- RPC `get_match_attendance_state`

점검 기준:

- 만남 시간 전후 체크인 버튼 표시
- 위치 권한 허용 후 체크인
- `attendances` row가 checked_in으로 바뀜
- 체크인 안 한 사람은 노쇼 확정 가능
- 노쇼 확정 후 `deposits.status` 또는 환불/몰수 계산에 반영

### 2.14 환불/정산

저장 위치:

- `deposit_refund_requests`
- `deposits`
- `notifications`

필수 데이터:

- `match_id`
- `user_id`
- `deposit_id`
- `requested_refund_amount`
- `app_revenue`
- `status`
- `reason`
- `created_at`
- `processed_at`

현재 코드 기준:

- `POST /api/matches/[id]/refund`
- RPC `submit_refund_request`
- continuation 선택 테이블 `match_continuation_choices`
- refund table `deposit_refund_requests`

MVP 판단:

- 무료 정책이면 사용자에게 돈을 요구하지 않는다.
- 그래도 보증금/환불 정책 검증용 상태값은 유지한다.
- 둘 다 이어가면 나중에 기여금 또는 유료 정책으로 연결할 수 있다.
- 한쪽이라도 종료하면 앱이 돈을 요구하지 않는 정책을 유지한다.

점검 기준:

- 만남 종료 후 이어가기/종료 선택
- 환불 페이지 진입
- 환불 요청 버튼 클릭
- `deposit_refund_requests` row 생성
- 알림 생성

### 2.15 데일리카드

저장 위치:

- `match_card_submissions`
- `match_daily_card_schedule`

필수 데이터:

- `match_id`
- `group_id`
- `user_id`
- 항목별 카드 내용
- 작성 완료 여부
- 공개 가능 시간
- 공개 선택 시간
- 놓친 카드 forfeited 상태

현재 코드 기준:

- `POST /api/matches/[id]/card`
- `GET/POST /api/matches/[id]/daily-cards`
- RPC `get_match_daily_cards`
- RPC `pick_match_daily_card`

점검 기준:

- 사전 카드 작성
- 저장 후 my group submitted count 증가
- 확정 후 오늘 카드 1장 선택
- 공개 완료 상태로 바뀜
- 16:00-20:00 정책이 필요하면 DB 함수 기준으로 검증

### 2.16 채팅

저장 위치:

- `match_chat_messages`

필수 데이터:

- `match_id`
- `sender_user_id`
- `sender_alias`
- `message`
- `created_at`

현재 코드 기준:

- `GET/POST /api/matches/[id]/chat`
- RPC `get_match_chat_messages`
- RPC `send_match_chat_message`

점검 기준:

- 채팅방 진입
- 메시지 입력
- DB row 생성
- 새로고침 후 메시지 유지

### 2.17 알림

저장 위치:

- `notifications`

필수 데이터:

- `user_id`
- `kind`
- `title`
- `payload`
- `read_at`
- `created_at`

점검 기준:

- 친구 요청, 초대 수락, 매칭 결과, 카드 공개, 출석/노쇼, 환불 이벤트가 알림으로 남는지
- `/notifications`에서 읽음 처리되는지

## 3. 프론트 버튼에서 DB까지 연결되는지 점검해야 하는 흐름

아래 표는 사용자가 누르는 행동이 실제 저장으로 이어져야 하는 최소 흐름이다.

| 사용자 행동 | 프론트 화면 | API/RPC | Supabase 저장 |
| --- | --- | --- | --- |
| 로그인/인증 | `/login` | Supabase Auth | `auth.users` |
| 기본정보 저장 | `/profile/basic` | `profiles.upsert` | `profiles` |
| 사진 업로드 | `/profile/photos` | Storage + `photos.insert` | `storage.photos`, `photos` |
| 성격검사 완료 | `/profile/survey` | `profiles.upsert` | `profiles.big5_*` |
| 가능시간 저장 | `/profile/schedule` | `profiles.upsert` | `profiles.available_timeslots` |
| 매칭비중 저장 | `/profile/preferences` | `profiles.upsert` | `profiles.preference_weights` |
| 친구 요청 | `/friends` | `/api/friend-requests` | `friend_requests` |
| 그룹 생성 | `/group/create` | `/api/groups` | `groups`, `group_members` |
| 그룹 초대 | `/group/create` | `/api/group-invites` | `group_invites` |
| 초대 수락 | `/group/invite/[token]` | `/api/group-invites/accept` | `group_members`, `group_invites` |
| 무료 참여/보증금 확인 | `/group/create`, `/match/[id]` | `/api/deposits` | `deposits` |
| 매칭큐 진입 | `/group/create`, `/match/start` | `/api/match-pool/enter` | `match_pool`, `groups.status` |
| 매칭결과 조회 | `/match` | `/api/matches` | `matches` 조회 |
| 매칭 수락 | `/match/[id]` | `/api/matches/[id]/confirm` | `matches`, `match_meetings` |
| 사전카드 저장 | `/match/[id]` | `/api/matches/[id]/card` | `match_card_submissions` |
| 오늘 카드 공개 | `/match/[id]` | `/api/matches/[id]/daily-cards` | `match_daily_card_schedule` |
| 채팅 전송 | `/match/[id]/chat` | `/api/matches/[id]/chat` | `match_chat_messages` |
| 체크인 | `/match/[id]` | `/api/matches/[id]/checkin` | `attendances` |
| 노쇼 확정 | `/match/[id]` | `/api/matches/[id]/finalize-no-show` | `attendances`, `deposits`, `notifications` |
| 이어가기 선택 | `/match/[id]/continuation` | `/api/matches/[id]/continuation` | `match_continuation_choices` |
| 환불 요청 | `/match/[id]/refund` | `/api/matches/[id]/refund` | `deposit_refund_requests`, `deposits` |
| 알림 읽음 | `/notifications` | `/api/notifications/read` | `notifications.read_at` |

## 4. 점검 방식

### 4.1 코드 기준 점검

각 화면마다 아래를 확인한다.

- 버튼 클릭 함수가 있는가
- 그 함수가 API 또는 Supabase client를 호출하는가
- API route가 인증된 user를 확인하는가
- API route가 table insert/update 또는 RPC를 호출하는가
- 실패하면 사용자에게 에러가 보이는가
- 성공하면 다음 화면으로 이동하는가

### 4.2 DB 기준 점검

Supabase 플러그인 또는 로컬 Supabase에서 아래를 확인한다.

```sql
select * from profiles order by updated_at desc limit 5;
select * from photos order by created_at desc limit 5;
select * from groups order by created_at desc limit 5;
select * from group_members order by created_at desc limit 5;
select * from deposits order by created_at desc limit 5;
select * from match_pool order by entered_at desc limit 5;
select * from matches order by matched_at desc limit 5;
select * from match_meetings order by scheduled_start desc limit 5;
select * from attendances order by created_at desc limit 5;
select * from deposit_refund_requests order by created_at desc limit 5;
select * from match_card_submissions order by submitted_at desc limit 5;
select * from match_daily_card_schedule order by reveal_window_start desc limit 5;
select * from match_chat_messages order by created_at desc limit 5;
select * from notifications order by created_at desc limit 5;
```

주의:

- 실제 사용자 개인정보는 출력하지 않는다.
- 필요한 경우 `count(*)`, `created_at`, `status` 위주로 확인한다.
- Production DB에 직접 데이터를 넣는 검증은 하지 않는다.
- local 또는 staging에서 먼저 검증한다.

### 4.3 프론트 기준 점검

로컬에서 아래 순서로 누른다.

1. `/dev/preview` 또는 테스트 계정 로그인
2. `/profile/basic`
3. `/profile/photos`
4. `/profile/survey`
5. `/profile/schedule`
6. `/profile/preferences`
7. `/group/create`
8. 친구 초대 또는 dev preview 그룹 완성
9. 무료 참여/보증금 확인
10. 매칭찾기
11. `/match`
12. `/match/[id]`
13. 사전카드 저장
14. 매칭 수락
15. 오늘 카드 공개
16. 채팅 전송
17. 체크인
18. 이어가기/환불 흐름
19. `/notifications`

각 단계마다 “버튼을 눌렀을 때 DB에 row 또는 status가 바뀌는지”를 확인한다.

## 5. 지금 바로 봐야 할 위험 지점

### P0

- `/profile/preferences`가 4개 가중치만 저장하는지 확인한다.
- `/api/match-pool/enter`가 그룹 정원, 멤버 준비 완료, 보증금/무료 참여 확인을 같은 기준으로 보는지 확인한다.
- 무료 베타 정책일 때도 `deposits` 또는 참여확인 row가 남는지 확인한다.
- 체크인/노쇼 확정 후 `attendances`, `deposits`, `notifications`가 같이 바뀌는지 확인한다.
- 환불 요청이 `deposit_refund_requests`에 남는지 확인한다.

### P1

- 사전카드가 항목별로 저장되는지, 또는 단일 `content_text`로 섞이는지 확인한다.
- 오늘 카드 공개가 하루 1장 정책을 지키는지 확인한다.
- 채팅 메시지가 새로고침 후 유지되는지 확인한다.
- 알림 read 상태가 유지되는지 확인한다.

### P2

- 이상형 월드컵 상세 벡터 저장은 나중에 구현한다.
- 학교 이메일 인증은 삭제 유지한다.
- 실제 결제 provider 연동은 사용자 확보 이후로 미룬다.

## 6. 사이드 작업방 프롬프트

아래 프롬프트를 사이드 작업방에 그대로 넣는다.

```text
너는 부산대 과팅앱 Supabase 데이터 흐름 감사 작업방이다.

목표:
프론트에서 사용자가 버튼을 누르고 값을 입력했을 때 실제 Supabase DB 또는 Storage에 저장되는지 앱 전체 흐름을 점검한다.
아직 코드 수정하지 말고 먼저 감사 보고서를 작성한다.

기준 문서:
docs/plans/2026-06-20-supabase-end-to-end-data-flow-audit.md

기준 브랜치:
profile/post-worldcup-decisions-2026-05-21

중요 결정:
- 학교 이메일 인증은 MVP에서 삭제한다.
- 이상형 월드컵 상세 벡터 저장은 후순위다.
- 지금 중요한 것은 정교한 매칭 알고리즘이 아니라 프론트 버튼과 Supabase 저장 흐름이다.
- 보증금/무료 참여 확인, 참석 체크인, 노쇼, 환불 요청은 반드시 Supabase 저장 흐름에 포함한다.

먼저 아래 명령으로 현재 상태를 확인해라.

git status --short --branch
git log --oneline --decorate -8
rg -n "deposits|attendances|deposit_refund_requests|match_continuation_choices|match_daily_card_schedule|match_chat_messages|notifications|match_pool|groups|profiles|photos" supabase app lib components tests -S

감사 대상 화면:
- /login
- /profile/basic
- /profile/photos
- /profile/survey
- /profile/schedule
- /profile/preferences
- /group/create
- /friends
- /match/start
- /match
- /match/[id]
- /match/[id]/chat
- /match/[id]/continuation
- /match/[id]/refund
- /notifications

보고서에는 아래 표를 반드시 채워라.

| 사용자 행동 | 프론트 파일 | API/RPC | Supabase 테이블 | 현재 구현 상태 | 문제점 | 수정 필요 여부 |
| --- | --- | --- | --- | --- | --- | --- |

특히 아래 항목은 P0로 검사해라.

1. 무료 참여/보증금 버튼을 누르면 deposits 또는 동등한 참여확인 데이터가 남는가
2. 매칭찾기를 누르면 match_pool 또는 groups.status가 바뀌는가
3. 매칭 수락을 누르면 matches와 match_meetings가 바뀌는가
4. 참석 체크인을 누르면 attendances가 바뀌는가
5. 노쇼 확정을 누르면 attendances, deposits, notifications가 같이 바뀌는가
6. 환불 요청을 누르면 deposit_refund_requests가 남는가
7. 데일리카드 저장과 오늘 카드 공개가 DB에 남는가
8. 채팅 전송이 match_chat_messages에 남는가
9. 알림 읽음이 notifications.read_at에 남는가

검증 명령:
npm run typecheck
npm run lint
npm run test:matching

브라우저 확인은 local dev server에서 한다.
npm run dev -- -p 3004

주의:
- main에 push하지 마라.
- production Supabase에 테스트 데이터를 넣지 마라.
- 개인정보를 보고서에 그대로 쓰지 마라.
- supabase/migrations를 수정하지 마라.
- 코드 수정이 필요하면 먼저 문제 목록과 수정 계획을 보고해라.

완료 결과는 아래 파일로 작성해라.
docs/plans/2026-06-20-supabase-end-to-end-data-flow-audit-result.md
```

## 7. 구현 작업방 프롬프트

감사 보고서에서 P0 문제가 확인되면 아래 프롬프트로 구현 작업방을 연다.

```text
너는 부산대 과팅앱 Supabase 데이터 흐름 구현 작업방이다.

기준 문서:
docs/plans/2026-06-20-supabase-end-to-end-data-flow-audit.md

감사 결과 문서:
docs/plans/2026-06-20-supabase-end-to-end-data-flow-audit-result.md

목표:
P0로 분류된 문제만 수정한다.
사용자가 프론트에서 버튼을 누르면 실제 Supabase DB 또는 Storage에 저장되도록 연결한다.

수정 우선순위:
1. 보증금/무료 참여 확인 저장
2. 매칭큐 진입 저장
3. 매칭 수락 후 match_meetings 생성
4. 참석 체크인 저장
5. 노쇼 확정 저장
6. 환불 요청 저장
7. 데일리카드 저장/공개 저장
8. 채팅 저장
9. 알림 저장/읽음 저장

금지:
- 학교 이메일 인증을 되살리지 마라.
- 이상형 월드컵 상세 벡터 저장을 이번 작업에 넣지 마라.
- production Supabase에 테스트 데이터를 넣지 마라.
- main에 push하지 마라.
- force push하지 마라.

작업 방식:
1. git status 확인
2. P0 문제별 파일 위치 확인
3. 수정 전 계획 보고
4. 작게 수정
5. npm run typecheck
6. npm run lint
7. npm run test:matching
8. 로컬 브라우저에서 버튼 동선 확인
9. 변경 파일과 남은 문제 보고

보고 형식:
- 수정한 사용자 행동
- 수정 파일
- 연결된 API/RPC
- 연결된 Supabase 테이블
- 검증 결과
- 남은 위험
```

## 8. 팀장방 판단

현재 앱은 이미 보증금, 출석, 노쇼, 환불, 알림, 채팅 관련 스키마와 API가 상당 부분 있다.

하지만 목표는 “테이블이 있다”가 아니라 “사용자가 버튼을 누르면 실제 row/status가 바뀐다”이다.

따라서 다음 단계는 새 기능 추가가 아니라 end-to-end 감사다.

가장 먼저 확인할 것은 아래 5개다.

1. 무료 참여/보증금 확인 버튼이 `deposits`에 남는가
2. 매칭찾기 버튼이 `match_pool` 또는 `groups.status`에 남는가
3. 체크인 버튼이 `attendances`에 남는가
4. 노쇼 확정이 `attendances`, `deposits`, `notifications`에 동시에 반영되는가
5. 환불 요청이 `deposit_refund_requests`에 남는가

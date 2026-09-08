# 성별 모임 구현 결과 — 2026-09-06

판정: 승인된 일반 모임의 **성별 무관 / 남자끼리 / 여자끼리 개설·가입 제한을 로컬 구현하고 검증**했다. 앱 전체 출시 완료나 원격 적용 완료 판정은 아니다.

## 변경한 내용

- 모임 만들기에 세 가지 참가 성별 조건을 추가했다. 기존 기본값은 성별 무관이다.
- 목록에 전체 / 성별 무관 / 남자끼리 / 여자끼리 필터와 카드 조건 배지를 추가했다. 전체와 성별 무관은 다른 필터이며 URL·새로고침·활동 필터 변경에도 보존된다.
- 서버는 비공개 커뮤니티 프로필의 현재 `community_gender`만 확인한다. 구 매칭 프로필·JWT metadata·요청에 넣은 임의 성별로 통과할 수 없다. 호스트도 생성 전에 검사한다.
- 기존 모임은 `all`로 보존한다. 기존 6인자 create/list 계약과 참가 취소를 유지하고, 새 v2 RPC로 확장한다. 기존 join RPC 자체에도 검사하므로 구 클라이언트의 직접 참가를 막는다.
- 등록 성별 검사이며 공적 신분 인증은 아니다. 성별 무관이 혼합 비율을 보장하지 않는다.
- 여러 모임을 연속 클릭할 때 참가 처리 상태가 섞이지 않도록 동기 잠금과 요청 종료 시 해제를 추가했다.

## 검증한 내용

| 증거 | 결과 | 범위 |
| --- | --- | --- |
| 신규 단위·화면 소스 계약 | 8/8 통과, 미구현 RED 후 GREEN | 코드 계약; 실사용 증거와 구분 |
| 독립 DB 회귀 | 72/72 통과 | 합성 사용자 12명, 트랜잭션 ROLLBACK, 잔존 auth/meetup/member 모두 0 |
| 실제 로컬 OTP → API/RPC | 12/12 통과 | 허용·거절, 거짓 body gender 차단, 잘못된 값, 저장·목록·필터·응답 비공개·중복 호출 |
| 실제 브라우저 | 저장·거절·재조회 통과 | 여성 테스트 계정으로 남자끼리 개설 거절 → 여자끼리 개설 저장 → 목록/새로고침 확인 |
| 필터 상태 보존 | 통과 | 여자끼리+게임 선택 후 새로고침 유지; 성별 무관/남자끼리에서 여자끼리 카드 제외; 전체 복귀 |
| 반응형 | 390×844 / 1440×900 확인 | 가로 넘침 없음, 새 성별 버튼 높이 44px, 지도·카테고리·아이디어 하단 유지 |
| 정식 빌드 | 최종 수정 이후 성공 | Next.js build + 타입/린트 + 180페이지 생성; 운영 배포 아님 |
| 독립 스펙·품질 검토 | Critical 0 / Important 0 / P2 0 | 소스 읽기 검토; DB/브라우저는 별도 실행 증거 |
| 로컬 security advisors | No issues found | 전용 로컬 DB만 검사 |

Config 632 / Auth 152 / Profile 141 / Matching 768 — 최종 회귀 **총 1,693건 모두 통과**했다. 신규 8건은 Config 632건에 포함되어 있으며 중복 합산하지 않는다.

DB 테스트는 남녀 정확 일치, unknown/other/prefer_not_to_say/companion 없음, 과거 `profiles.gender`와의 충돌, 제한 호스트 거절, 기존 all/구 create, 다른 학교, 마감, 정원, 적격 중복 참가, 취소/재참가, 프로필 변경 후 join 재검사, private helper·테이블 권한 차단을 포함한다.

### 화면 증거

새 성별 선택:

![모임 개설 성별 선택](C:/Users/82108/.config/superpowers/worktrees/데이팅앱만들기/integrated-campus-20260905/artifacts/qa/meetup-gender-20260906/desktop-create.png)

실제로 저장한 로컬 검수 모임과 목록 필터:

![모바일 성별·활동 필터](C:/Users/82108/.config/superpowers/worktrees/데이팅앱만들기/integrated-campus-20260905/artifacts/qa/meetup-gender-20260906/mobile-filter.png)

![데스크톱 목록](C:/Users/82108/.config/superpowers/worktrees/데이팅앱만들기/integrated-campus-20260905/artifacts/qa/meetup-gender-20260906/desktop-list.png)

## 발견한 문제와 수정 내용

1. 기존 매칭 프로필 성별과 최신 커뮤니티 프로필 성별이 다를 수 있었다. 최신 비공개 companion만 사용하도록 검사 원본을 고정했다.
2. 단일 busy 상태인데 여러 참가 요청이 겹칠 수 있었다. ref 잠금·전체 참가 버튼 잠금·finally 해제로 독립 리뷰 P2를 해결했다.
3. 브라우저 자동화의 날짜 fill은 DOM 값을 바꿨지만 React 입력 상태를 확정하지 않아 `invalid_schedule`이 발생했다. 실제 키 입력으로 날짜 변경을 확정한 뒤 정상 저장을 확인했다. 일반 오류만 나오던 날짜 오류 문구도 구체화했다. 임시 진단 로그는 제거했다.
4. 새 함수 미적용 상태는 정직한 연결 준비 화면으로 확인했고, rollback 리허설 후 전용 로컬에 새 migration 1개만 적용했다.

## 남은 위험 또는 미검증 사항

- **참가 후 프로필 성별을 변경하는 경우:** 기존 참가자를 자동 강퇴하지 않는다. 취소는 가능하고 모든 join 호출은 현재 조건으로 다시 검사한다. 기존 참가자 자격 재조정·호스트 모임 취소/조건변경 UX는 별도 정책과 구현이 남아 있다.
- **동시성:** 사용자 advisory lock → meetup row lock 순서와 순차 정원 초과를 검증했다. 실제 두 DB 세션의 마지막 자리 경쟁은 미검증이다.
- **브라우저 범위:** 신규 저장·거절·목록·필터·호스트 버튼은 확인했다. 비호스트 취소 및 누락 DTO의 비활성 상태는 DB/소스 테스트 증거이며 별도 브라우저 재현은 미검증이다.
- **기존 DB lint 오류 3개:** 이번 migration이 변경하지 않은 `service_claim_tonight_deposit_dispositions`의 `deposit_id`, `service_claim_tonight_settlements`의 `team_id`, `request_my_tonight_arrival_help`의 `team_id`가 PL/pgSQL 변수/컬럼과 모호하게 충돌한다(SQLSTATE 42702). 원격에서도 같은지 미검증이며 이번 성별 모임 작업에 금융/도착 도움 수정은 섞지 않았다.
- 원격 Supabase, 실사용 계정, 실기기, 실제 결제·환불·운영 배포는 미검증이다. 기존 5일 코스·이번 주 모집 등 남은 구현을 이번 결과로 완료 처리하지 않는다.

## 실행 경계와 남긴 데이터

- 작업공간: `C:/Users/82108/.config/superpowers/worktrees/데이팅앱만들기/integrated-campus-20260905`
- branch `codex/integrated-campus-20260905`, HEAD `be9078565d8e59f73cbc017f3c7b1484996da1c3`. 기존 더티 작업 보존.
- 앱 `http://localhost:3010/meetups`, 전용 로컬 API `127.0.0.1:56421`, DB `127.0.0.1:56422`, Docker project `quantum-integrated-campus-20260905`.
- migration `20260906101018_community_meetup_gender_restrictions.sql` 한 개만 CLI로 로컬 반영했다. CLI의 db-url 연결 문구는 remote라고 나오지만 지정 대상은 위 loopback DB였으며 원격 접근은 하지 않았다.
- `[로컬 검수] 여자끼리 저녁 러닝`, `[로컬 검수] 여자끼리 보드게임` 두 모임은 실제 UI/API 저장 확인용으로 로컬에 남겼다. 실제 모집이 아님을 제목·본문에 표시했다. 기존 사용자 데이터를 삭제하지 않았다.
- stage / commit / push / 원격 migration / 배포 / 실제 결제는 하지 않았다. 브라우저 viewport 임시 설정은 해제했다.

## 재검증 명령

```powershell
npx tsc -p tsconfig.config-tests.json
node --test .tmp/config-tests/tests/config/meetup-gender*.test.js
Get-Content tests/tooling/meetup-gender-db.sql -Raw | docker exec -i supabase_db_quantum-integrated-campus-20260905 psql -U postgres -d postgres -X -v ON_ERROR_STOP=1
node tests/tooling/meetup-gender-http.mjs
```

HTTP 검사는 기존 로컬 테스트 02 계정의 OTP를 사용하고, 고정된 전용 로컬 주소만 허용하며 키·토큰을 출력하지 않는다.

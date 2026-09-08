# Quantum 커뮤니티·보이스·만남 진행 통합 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans after implementation approval. This document does not authorize Git writes, database application, provider provisioning, payments, or deployment.

**Goal:** 이름으로 친구를 알아보고, 주제별 모임·음성 대화에 참여하고, 데이팅 매칭과 실제 만남의 다음 행동까지 이어지는 하나의 제품 흐름을 완성한다.

**Architecture:** 기존 가입·친구·모임·오늘밤·주간·후속 만남을 보존한다. 방 참여, 친구 관계, 동반 신청, 스포츠 일정, 음성 세션, 안내 진행 상태를 별도 권한과 원장으로 연결한다. 사용자·업장·운영자·최고관리자 권한을 혼용하지 않는다.

**Tech Stack:** 기존 Next.js/React/TypeScript/Supabase. 음성은 관리형 LiveKit 연결을 설계 제안으로 둔다. 문자 실시간 알림은 private Realtime와 인증된 API 재조회 조합이며, 메시지 저장 원본은 DB다.

**상태:** 사용자 검토용 통합 설계·구현 계획. 제품 코드는 미변경. 목적별 묶음은 책임과 검증을 구분하기 위한 것이며 일부 기능만 출시하고 나머지를 미루는 우선순위 구분이 아니다.

## 1. 최신 결정 장부

| ID | 사용자 확정 내용 | 폐기하거나 확대하지 않을 해석 |
| --- | --- | --- |
| U01 | 오늘밤에 실제 남성·여성 신청 인원을 표시한다. | 한 팀 정원 3남 2녀를 묻는 요청이 아니다. |
| U02 | 이번 주는 날짜를 넘겨 활동·요일별 신청 현황을 보고 특정 날짜에 신청한다. | 정적인 요일 추천표를 실제 모집으로 표현하지 않는다. |
| U03 | 고민·친목·야구 응원 등 주제별 단체 보이스방과 1:1 음성 대화를 모두 제공한다. | 친구 간 전화 버튼 하나만으로 완료하지 않는다. |
| U04 | 1:1 음성은 참가 후 상대를 넘겨 다음 상대를 만나는 흐름을 지원한다. | 상대 동의 없이 마이크를 켜거나 영상통화를 추가하지 않는다. |
| U05 | 음성 참여 인원의 남녀 현황도 표시한다. | 대기 인원과 실제 통화 인원을 합치거나 예시 숫자를 넣지 않는다. |
| U06 | 친구에게 메시지를 보내는 흐름을 익숙한 메신저처럼 개선한다. | 카카오톡의 상표·시각 자산을 복제하지 않는다. |
| U07 | 가입에 이름 입력을 추가하고 친구 초대에서 서로 알아볼 수 있게 한다. | 공개 별칭에 이름을 덮어쓰거나 랜덤 상대·커뮤니티 전체에 본명을 공개하지 않는다. |
| U08 | 새로 무작위 배정되는 사람 사이에는 같은 학과를 제외한다. 직접 초대한 동반 친구는 같은 학과여도 함께 들어간다. | 한 팀에 동일 학과가 한 명이라도 있으면 무조건 해체하는 규칙이 아니다. |
| U09 | 학과 친목은 자발적으로 들어가는 모집·보이스방으로 만든다. Quantum 운영측이 주제와 공식 경기 일정에 맞춰 방을 먼저 준비한다. | **학과 전체 자동 친구 추가는 사용자가 취소했다. 구현하지 않는다.** |
| U10 | 학과대항 게임·축구 같은 친목 활동을 모집할 수 있게 한다. | 학과 전체를 자동 팀원·친구로 등록하지 않는다. |
| U11 | 주간 만남과 일반 모임도 만화로 현재 해야 할 일을 안내한다. 기존 보드게임 안내 방식을 활용한다. | 읽기용 만화 페이지만 추가하고 실제 진행 연결을 생략하지 않는다. |
| U12 | 위 내용을 전체 계획으로 보고한다. | 이번 요청을 코드 변경·실제 공개 모집·원격 적용·배포 승인으로 확대하지 않는다. |
| U13 | 투명성을 위해 소수 인원일 때도 남녀 실제 집계를 공개한다. | 인원이 5명 미만이라는 이유로 상세를 숨기지 않는다. |
| U14 | 집계 포함은 별도 선택 동의가 아닌 참여 시 필수 적용 규칙이다. | 공개 동의자만 계산하거나 참여를 유지한 채 집계만 끄는 토글을 만들지 않는다. 개인 이름·연락처 공개 또는 마이크 강제 작동을 뜻하지 않는다. |

운영방 선개설은 운영자가 사용하는 개설·게시 흐름을 계획에 포함한다는 의미다. 이번 계획 작성 중 실제 모집방이나 예약 작업을 생성하지 않는다. 같은 학과 예외 질문은 U08로 답변이 확정되어 다시 묻지 않는다.

다음은 사용자 발화를 그대로 옮긴 확정 사항이 아니라, 전체 계획 승인 대상으로 제시하는 설계 기본안이다. 사용자 요구와 구분하여 구현 담당의 숨은 추측을 없앤다.

| ID | 설계 기본안 | 이유와 적용 경계 |
| --- | --- | --- |
| R01 | 새 그룹 보이스방은 Quantum 운영측이 개설·게시한다. | 사용자는 자발적으로 입장/퇴장한다. 기존 일반 모임·학과 대항 모집 작성 권한을 빼앗지 않지만, 그것을 음성방 개설 권한으로 자동 승격하지 않는다. |
| R03 | 랜덤 음성은 현재 최소 가입 완료·전화 인증·만 19~35세·동일 학교 범위의 성별 무관 친목 대화다. | 데이팅 사진/외모 심사 완료는 요구하지 않고 학과 제외·이성 선호를 자동 적용하지 않는다. 재학/신분증 인증을 했다고 표시하지 않는다. |
| R04 | 주간 배정 제안의 확정 권한은 최고관리자가 부여한 운영 scope로 제한한다. | 서비스 서버만 실제 배정 RPC를 실행한다. 모집창 생성·게시의 기존 최고관리자 권한과 분리한다. |

이전에 제안했던 R02의 선택 동의·소수 인원 숨김은 최신 U13/U14로 폐기됐다. 참가자가 공개 범위를 모르는 상태로 들어오지 않도록 사전 안내는 유지하되 별도 선택 체크박스나 집계 제외 설정을 만들지 않는다.

## 2. 현재 코드와 차이

기준 작업공간은 `C:/Users/82108/.config/superpowers/worktrees/데이팅앱만들기/integrated-campus-20260905`, branch `codex/integrated-campus-20260905`, HEAD `be9078565d8e59f73cbc017f3c7b1484996da1c3`이다. 조사 시 추적 수정 109개·staged 0인 기존 더티 상태다. 미추적 구현까지 포함해서 읽었으므로 HEAD 단독이 기능 전체를 포함한다는 뜻이 아니다.

| 현재 확인 | 계획에서 필요한 변경 |
| --- | --- |
| 가입 이름은 서버가 발급한 공개 별칭이며 친구 인식용 이름이 없다. | 비공개 이름 필드와 제한된 친구 초대 projection을 추가한다. |
| 문자 채팅은 수락된 친구 요청에 연결된 관계만 허용하고 약 8초마다 조회한다. | 기존 접근 경계를 유지하면서 대화 목록·읽음·실패 재시도·실시간 갱신을 연결한다. |
| 남녀 신청 수는 운영자·최고관리자 모델에 있다. | 참가자 전용 최소 집계 API를 추가한다. 관리자 응답을 공개하지 않는다. |
| 오늘밤 배정 입력에는 학과가 없어 같은 학과 제외가 구현되지 않았다. 기존 일반 매칭은 동행 그룹 사이의 학과 교집합을 제외한다. | 기존 동행 그룹 내부 예외의 의미를 보존하면서 오늘밤·주간 배정의 서버 학과 검사까지 확장한다. |
| 주간은 특정 날짜 한 개 또는 복수 후보 선택이 이미 가능하다. 모집창·동반 동의·원자적 배정 API가 있지만 실제 배정 호출자가 없다. 공개 응답은 신청 수 없이 확정 인원만 제공한다. | 기존 신청을 재작성하지 않고 날짜 탐색·실제 신청 집계와 운영자 배정 제안/검토/확정 실행을 연결한다. |
| 일반 모임은 생성·목록·참여·탈퇴 중심이다. | 상세·대화·일정 변경·취소·종료·안내를 추가한다. |
| 달무티 14컷과 후속 Day별 만화 안내가 있지만 읽기와 실제 진행이 분리돼 있다. | 현재 서버 단계와 맞는 안내를 우선 보여주는 공통 가이드를 연결한다. |
| 음성 SDK·세션·대기열이 없고 보안 헤더는 마이크를 차단한다. | 통화 권한·상태·미디어·보안 정책을 함께 추가한다. |
| 구형 커플 매칭 자동친구 예약 작업과 일반 매칭 자동 연락처 공개 경로가 남았다. | 신규 통화·이름 기능을 열기 전에 정책 충돌을 제거한다. 기존 관계를 추측으로 일괄 삭제하지 않는다. |

## 3. 목표별 사용자 흐름과 완료 기준

### G1. 이름을 알아보고 친구를 초대하기

**결과:** 가입을 가볍게 유지하면서 초대 대상이 아는 친구인지 확인할 수 있다.

- 전화 인증 → 이름 입력 → 기존 학과·성별·별칭 등 가입 → 친구 화면.
- 이름은 본인이 입력한 친구 인식용 이름이다. 신분증 실명 인증으로 표시하지 않는다.
- `display_name` 공개 별칭은 유지하고, 별도 비공개 `friend_recognition_name`을 둔다. 이름을 성별·학과 권한 근거로 사용하지 않는다.
- 친구 목록은 허용된 이름을 보여주고 초대 버튼으로 이어진다. 아직 친구가 아니면 개인 초대 링크/코드를 공유하고 상대 확인·수락으로 연결한다.
- 전역 이름 자동완성·학과 전체 실명 명부는 만들지 않는다. 동명이인은 이름만으로 선택하지 않고 특정 초대 토큰 및 기존 공개 별칭으로 구분한다.
- 기존 사용자의 별칭을 이름으로 복사하지 않는다. 이름이 없으면 친구 인식/초대 기능 사용 시 입력 안내를 제공하고 기존 기록은 유지한다.

**완료 기준:** 이름 저장·재로그인 유지, 유효 초대 상대/수락 친구에게만 이름 노출, 무관한 사용자·차단자·만료 링크 접근 거부, 동명이인 오초대 방지, 공개 커뮤니티·매칭 카드에 이름 미노출. 토큰은 만료·회수·중복 수락을 서버에서 검사한다.

### G2. 친구 메시지 UX와 전달 신뢰성

**결과:** 친구 선택 → 메시지 → 답장 확인까지 메신저처럼 자연스럽게 이어진다.

- 친구/대화 목록을 구분하고 최근 메시지·시간·읽지 않은 메시지를 보여준다.
- 대화방은 말풍선, 날짜 구분, 입력창 고정, 전송 중/성공/실패, 재시도, 새 메시지로 이동을 제공한다.
- 모바일 키보드가 입력창을 덮지 않고 이전 기록을 읽는 동안 강제로 아래로 이동하지 않는다.
- 메시지는 API가 인증·권한·중복키를 검사하고 DB 저장 후 성공 처리한다. 실시간 이벤트는 변경 알림일 뿐 본문 원본을 대체하지 않는다.
- private Realtime에는 메시지 ID와 revision 등 최소 변경 알림만 보내고 본문은 매번 권한 검사 API로 읽는다. 구독 권한이 즉시 철회되지 않는 경우에도 차단 이후 새 본문을 받지 못하게 한다.
- 권한 있는 친구에게 음성 초대 버튼을 제공하되 통화는 별도 상대 수락이 필요하다.
- 두 친구가 수락한 1:1 통화는 G6과 같은 세션·토큰 수명주기를 사용하되 랜덤 대기열을 거치지 않는다. 이것은 사용자가 임의의 공개 그룹 보이스방을 개설하는 권한이 아니다.

**완료 기준:** 서로 다른 두 계정의 송수신·읽음·재접속·중복 전송·순서 역전·오프라인 복구, 차단 직후 새 본문/읽음/이름 유출 없음, 390px/1440px 레이아웃과 키보드·스크린리더 확인. 기존 채팅 1,000자 및 빈도 제한은 회귀 검증한다.

### G3. 오늘·이번 주 신청 현황과 실제 배정

**결과:** 어느 날 어떤 활동에 사람이 모였는지 보고 실제 신청과 확정까지 진행한다.

- 오늘은 기존 세 활동 탐색과 순위 신청을 보존하고, 해당 모집의 남성·여성·전체 유효 신청 인원과 갱신 시각을 표시한다.
- 이번 주는 가로 날짜 카드 → 활동·시간·장소·정원·신청 현황 → 가능한 날짜 선택 → 혼자/친구 동반 → 동의 → 신청 유지/변경/철회로 연결한다.
- 복수 날짜 선택은 후보 선택이며 여러 날짜에 중복 확정되는 기능이 아니다. 주간 한 신청·한 실제 배정 및 동반 친구 전원 동의를 보존한다.
- 집계는 신청서 수가 아닌 실제 사람 수다. 같은 사람이 같은 집계 범위에 중복 포함되지 않으며, 동반 신청은 동반 참여 수락이 완료된 유효 참가자를 센다. 취소·초안·동반 참여 미수락·운영 fixture는 제외한다. 여기서 동반 참여 수락은 공개 집계의 별도 선택 동의와 다르다.
- 집계 기본안은 오늘밤 `submitted|waitlisted|allocated`의 고유 참가자, 주간은 동반 전원 동의가 끝난 유효 신청의 고유 참가자다. 주간은 일부 친구만 수락한 묶음 전체를 수락 대기로 구분하여 공개 신청 수에서 제외한다. 현재 관리자 집계는 모든 상태를 포함할 수 있으므로 계산식도 그대로 복사하지 않는다.
- 주간 카드에는 ‘신청 N명 · 확정 M명’을 분리한다. 기존 ‘다른 사람의 신청 수는 공개하지 않아요’ 안내는 새 집계 공개 범위와 일치하도록 바꾼다. 특정 날짜 한 장 신청은 기존 단일 원소 후보 배열 계약을 유지한다.
- 날짜별 수치의 합은 주간 고유 신청자 수와 다를 수 있음을 표시한다. 동일 날짜의 여러 시간창은 날짜 총계에서 사용자 단위로 중복 제거한다.
- 집계 오류를 0명으로 바꾸지 않는다. 마지막 확인 시각과 갱신 실패를 표시하고, 학과별·개인별 신청 명부나 관리자 원장/결제 정보를 공개하지 않는다.
- 남녀 표시는 U13/U14에 따라 모든 유효 신청자를 자동 집계하고 1명이어도 실제 수치를 표시한다. 학교별 열람 권한은 유지한다. 별도 공개 선택 동의를 받지 않으며, 기존 5가지 성별 입력 중 남녀 이외의 값은 ‘기타·미확인’으로 표시해 전체 합계에서 빠지지 않게 한다.
- 주간 배정은 시스템이 제안을 만들고 권한 있는 Quantum 운영자가 검토·확정하는 흐름을 제안한다. 모집창 게시의 기존 최고관리자 권한은 임의로 운영자에게 넘기지 않는다.
- 확정 서버는 동일 회차·장소·정원·학과 제외·동반 묶음·중복 배정을 다시 검사한다. 실행 실패는 재시도하되 일부 친구만 배정하지 않는다.

**완료 기준:** 두 날짜 중복 선택의 고유 인원 집계, 취소 즉시/다음 갱신 반영, 친구 전원 동의 전후 수치, 마지막 자리 경쟁, 중복 확정 방지, 제안 후 프로필 변경 시 재검사, 날짜 변경 알림, 해당 확정 회차 진입. 실제 모집이 없는 카드는 준비 상태로 표시한다.

### G4. 같은 학과 무작위 배정 제외와 직접 초대 예외

**결과:** 새로운 사람과의 데이팅은 다른 학과로 연결하되 아는 친구의 동반 참여는 유지한다.

- 동일 학교의 정규 학과 식별자로 비교한다. 문자열 공백/별칭 표기 차이를 다른 학과로 취급하지 않는다.
- 현행 학과 입력은 사용자 직접 입력도 허용한다. 이름 문자열을 무조건 학과 코드로 간주하지 않고, 서버 정규화·학교별 검수된 별칭 매핑으로 비공개 `department_key`를 만든다. 확인되지 않은 서로 다른 학과를 임의로 합치거나 동일 학과의 다른 표기를 우회 수단으로 남기지 않는다.
- 오늘밤 일반 신청과 **해당 오늘밤 신청의 동반 초대 수락** 양쪽에서 같은 학과 key를 비공개 신청 feature에 저장하고, 배정 입력 계약·엄격 파서·공통 feasibility 검사를 함께 확장한다. 원문 학과명이나 신청자 식별자를 사용자 집계 응답에 싣지 않는다.
- 서버가 모든 사람의 수락을 확인한 **동일한 직접 초대 묶음 내부**에만 같은 학과 예외를 적용한다.
- 일반 `friend_requests`, friendship, G1의 친구 추가용 초대 링크는 동반 예외의 근거가 아니다. 오늘밤은 해당 모집 회차의 수락 완료 `bundle_id`, 주간은 해당 주간 신청 ID에 속한 전원 동의 참가자 원장을 각각 검증한 뒤 신청·회차에 한정된 `acceptedCompanionApplicationId`로 변환한다. 다른 회차·과거 신청의 동행 관계를 재사용하지 않는다.
- 배정 제안 시 전원 수락 snapshot을 저장하고 최종 배정 커밋에서도 같은 원장·멤버십 revision을 다시 검사한다. 한 사람이라도 철회했거나 묶음이 바뀌었으면 예외를 그대로 쓰지 않고 제안을 무효화한다.
- 서로 다른 묶음 또는 혼자 신청한 사람끼리는 성별과 무관하게 같은 학과를 한 팀에 새로 배정하지 않는다.
- 클라이언트가 보낸 임의 신청/동반 묶음 ID는 예외 근거가 아니다. 서버가 만들어 잠근 묶음만 사용한다.
- 학과가 없거나 정규화되지 않으면 다른 학과로 간주하지 않고 프로필 보완 대기로 둔다. 인원이 부족해도 학과 제외·차단 규칙을 몰래 완화하지 않는다.
- 오늘밤 생성기·모든 대체 편성 경로·최종 publish·주간 배정·무작위 대체 참가자에 같은 검사를 적용한다. 명시 초대 여부와 무관한 구형 API 우회도 막는다.
- 이 규칙은 데이팅의 신규 무작위 배정용이다. 같은 학과 친목방, 학과 대항전 팀, 이미 동의한 후속 그룹을 무조건 해체하지 않는다. 랜덤 음성 대화에 자동 확대하지 않는다.

**완료 기준:** 같은 학과 혼자+혼자 거부, 다른 학과 허용, 수락된 같은 학과 친구 묶음 허용, 다른 묶음의 같은 학과 충돌 거부, 조작된 bundle 거부, 미정 학과 대기, 부족한 풀의 무완화, 최종 저장 직전 학과 변경 재검사, 동반 인원 분할 0건.

### G5. 운영측 선개설 주제별 단체 보이스방

**결과:** 빈 커뮤니티에서 사용자가 주제를 만들기만 기다리지 않고, 운영측이 준비한 실제 참여 가능한 음성방을 발견한다.

- 커뮤니티 안에 ‘지금 대화’ 탐색 화면을 두고 고민 나눔·가벼운 친목·야구 응원·학과 모임·학과 대항 모집으로 구분한다.
- Quantum 운영자는 공식 방 초안 작성 → 대상 학교/선택 학과·주제·일정·정원·규칙 검토 → 게시/예약 → 개방 → 종료를 관리한다. 이번 새 그룹 보이스방 개설·게시 권한은 운영측으로 제한한다. 일반 사용자는 준비된 방에 입장하고 주제 개설을 제안할 수 있다. 기존 일반 모임과 학과 대항 모집 작성 권한은 별도로 보존한다.
- ‘롯데 팬 야구 같이 보기’, ‘기계공학과 야구 수다’ 등은 제목 예시다. 실제 경기명·시간은 공식 일정과 확인 시각이 있는 경기 레코드를 선택해야 게시할 수 있다.
- 카드에 시작 예정/지금 대화 중/종료, 현재 참가자 수, 남녀 인원, 주제·학교·학과 범위를 표시한다. 빈 공식방에는 0명으로 표시하고 운영 계정이나 샘플 인원을 채워 인기처럼 꾸미지 않는다.
- 입장 전 규칙 확인 → 듣기 입장 또는 마이크 참여 선택 → 발언·음소거·신고·퇴장. 마이크는 사용자 동작과 브라우저 허용 이후에만 켠다.
- 그룹 보이스도 R03의 최소 가입·전화·연령·학교·계정 제한 검사와 방별 학교/학과 scope를 함께 적용한다. 듣기 전용 입장도 인증·참가 자격을 우회하지 않는다. 친구 간 1:1 음성에는 추가로 수락된 친구 관계와 상대 통화 수락을 검사한다.
- 남녀 현황은 U13/U14에 따라 참가자를 필수 집계하고 소수 인원도 표시한다. 음성·이름·사진으로 성별을 추정하지 않는다. `other|prefer_not_to_say|unknown`인 참가자는 ‘기타·미확인’ 집계에 포함하며 전체 인원에서 제외하지 않는다. 입장 전에 집계 공개 범위를 안내하되 별도 집계 선택 동의를 받지 않는다.
- 참가자는 정원 제한이 있는 소규모 대화방으로 시작하는 설계를 제안한다. 큰 응원방은 발언자/청취자 권한을 구분한다. 정원·발언자 수는 방 설정이고 강제 마이크 켜기는 제공하지 않는다.
- 운영자가 지정한 진행자 권한은 해당 방의 제한된 발언/안전 관리 권한일 뿐 전역 운영자 권한이 아니다. 일반 참가자 퇴장과 방 종료를 구분하며, 진행자 이탈로 임의 사용자가 진행자/운영자가 되지 않는다. 퇴장·강퇴·종료 시 입장 권한과 미디어 연결을 함께 끊고 새 토큰 발급도 막는다.
- 개인 차단은 상대를 전역 강퇴하는 권한이 아니다. 현재 방에서 차단하면 차단한 사용자의 세션을 즉시 종료하고 안전한 방 목록으로 이동한다. 어느 쪽이든 차단 쌍이 함께 있는 방의 재입장을 거부한다. 타인 강퇴는 지정 진행자/운영자의 해당 방 권한으로만 가능하다.

**완료 기준:** 운영 공식방 선개설·사용자 입장과 일반 사용자 그룹 음성방 개설 거부 검증, 3대 이상 실기기 동시 음성, 정원 경합, 두 탭의 중복 인원 제외, 비정상 종료 후 유령 인원 정리, 마이크 거부·기기 전환·네트워크 복구, 지정 진행자 이탈·차단·강퇴자 재입장 거부, 운영자와 업장 계정 간 권한 분리.

### G6. 상대를 넘기는 1:1 음성 대화

**결과:** 기존 친구가 없어도 대화에 동의한 상대와 연결하고, 원하면 안전하게 다음 상대를 찾는다.

- 참가 → 주제 선택·마이크 사전 확인 → 대기 → 상대 확인/수락 → 1:1 음성 → ‘다음 상대’ 또는 종료.
- R03 참가 조건은 서버의 `minimumSignupComplete`, 인증된 전화번호, 현재 만 19~35세, 현재 학교 scope, 활성 계정, 보이스 이용 동의 충족이다. 탈퇴/삭제 처리 중·기간 내 정지·음성 이용 제한 상태는 거부한다. 신고 접수만으로 자동 유죄 처리하지 않으며 운영자가 발효한 제한을 적용한다. 마이크 수락은 이 자격 검사와 별개다.
- 매칭 key는 `학교 scope + 선택한 대화 주제 + 음성 모드`다. 서버가 관리하는 같은 key 안에서 성별 무관하게 매칭한다. 사진·외모 심사·이상형 월드컵 등 `matchingReady` 요구는 음성 참가 조건으로 확대하지 않는다. 학과, 데이팅 성별 선호, 연령 차이 선호는 랜덤 친목 음성의 필터가 아니다. 기존 최소 가입 학교 scope는 자기선택 정보이지 검증된 재학 상태가 아니다.
- 대기 진입·상대 제안·양측 수락·토큰 재발급에서 동일 자격을 재검사한다. 학교 변경·계정 제한이 생기면 대기/제안을 만료시키고 활성 통화도 종료한다. 오래된 대기 snapshot만으로 입장시키지 않는다.
- 카메라 없이 음성 전용으로 설계한다. 실명과 전화번호는 랜덤 상대에게 공개하지 않는다.
- 다음 상대를 선택하면 현재 연결을 서버에서 종료한 후 재대기한다. 이전 음성이 다음 방에서 들리거나 한 사용자가 두 통화에 동시에 배정되는 상태를 허용하지 않는다.
- 차단 쌍은 영구 제외하고 방금 넘긴 상대는 같은 탐색 세션에서 다시 연결하지 않는 기본안을 둔다. 풀 부족은 솔직하게 대기로 표시한다.
- 대기 중과 실제 통화 중 인원은 별도 집계한다. 유효 대기열·활성 세션을 기준으로 세며 화면 접속자 수를 통화 참여자로 표시하지 않는다.
- 통화 종료 후 친구 요청은 선택 사항이고 상대 수락이 필요하다. 이번 보이스 추가로 기존 후속 만남 이용료를 변경하거나 자동 결제하지 않는다.

**완료 기준:** 최소 가입/전화/학교/연령/정지 predicate의 허용·거부, 학교 간 혼합 배정 0건, 전체 성별의 참여와 데이팅 조건 비강제, 두 사용자 수락 전 송수신 차단, 동시 매칭 하나만 성립, 다음 상대 연타·양쪽 동시 넘기기·대기 취소 경쟁, 이전 방 토큰 재사용 차단, 차단자 재매칭 0건, 오래된 webhook이 새 세션을 종료하지 않음, 실기기 간 오디오 유출 0건.

### G7. 학과 친목 모집과 학과 대항 활동

**결과:** 같은 학과 사람을 친구로 강제 등록하지 않고 함께할 이유와 모집 공간을 제공한다.

- 일반 모임·학과 대항 모집에서는 사용자가 학과 전용/학교 전체 주제를 선택해 ‘오늘 야구 보기’, ‘게임 같이 할 사람’, ‘기계공학과 축구팀 모집’을 개설한다. 새 그룹 보이스방은 별도로 운영측이 개설하며, 일반 모집을 만들었다는 이유로 음성방을 자동 생성하지 않는다.
- 가입 학과는 추천·분류에 활용하되 자기선택 정보라는 사실을 숨기지 않는다. 학과를 공적으로 인증했다는 배지는 검증 근거 없이 붙이지 않는다.
- 자발적 방 참가와 나가기는 friendship을 생성·삭제하지 않는다. 방 참가자 명단은 그 방 권한 안에서 최소 별칭만 제공한다.
- 학과 대항전은 활동·팀 모집·참가 수락·인원·시간/장소 합의·규칙·결과 확인·취소를 제공한다. 게임 서버나 경기 영상 중계 자체를 만드는 기능은 아니다.
- 팀 소속은 별도 roster로 관리하고, 방에 들어왔다는 이유만으로 팀원으로 확정하지 않는다. 상대 팀 주장들의 일정·결과 확인을 기록하며 한쪽 주장만으로 공개 승패를 확정하지 않는다.

**완료 기준:** 큰 학과에 가입해도 친구 관계 대량 생성 0건, 학교 범위 격리, 학과 변경 후 접근 재검사, 팀 정원/중복 참가 방지, 대항 신청·수락·일정 변경·취소·양쪽 결과 확인 완주. 자유 친목과 데이팅 학과 제외가 서로 침범하지 않는다.

### G8. 실제 만남에 맞춘 만화 진행 가이드

**결과:** 참가자가 모인 뒤 ‘지금 뭘 하지?’에서 멈추지 않고 앱의 한 화면에서 다음 행동을 안다.

- 기본 화면: 현재 활동/단계 → 상황에 맞는 만화 한 컷 → 짧은 설명 → 주 행동 버튼 하나 → 보조 ‘늦었어요/도움/잠깐 쉬기’.
- 공통 단계는 준비·집결·인사·활동 시작·활동별 진행·마무리·다음 행동이다. 실제 장소·시간은 해당 모집/회차의 서버 데이터에서 가져온다.
- 현재 단계 안내와 전체 안내 미리보기를 구분한다. 만화를 넘겨 본 것만으로 출석·결제·공유 게임 상태·회차 완료를 바꾸지 않는다.
- 개인 확인은 개인 진행으로 저장하고 공통 타이머는 서버 시각을 쓴다. 기존 Day별 공유 게임·진행 명령의 권한과 revision 검사를 재사용한다. 별도 현장 진행자가 필수인 구조로 바꾸지 않는다.
- 일반 모임에는 상세·참가자 대화·장소/시간 변경 알림·취소·종료를 먼저 연결해 안내의 실제 목적지를 확보한다. 주최자 종료와 개인 퇴장을 구분한다.
- 기존 보드게임 14컷은 보존한다. 후속 Day 1~5, 오늘밤 활동 6개, 일반 모임의 현재 공개 추천 15개와 주간 공개 활동마다 `guide_template_id` 연결표를 만든다. 자체 생성 custom 모임은 안전한 공통 모임 안내를 명시하고 전문 경기 규칙을 제공한다고 꾸미지 않는다.
- 기존 주간 후보와 폐기된 후속 콘텐츠는 구분한다. 프로그램 Day와 실제 만남 순번, 보드게임 원천 Day 2 진입/비보드 원천 Day 1 진입을 보존한다.
- 이동·악천후·늦은 참가·준비물 부족·중단 상황을 포함한다. 답변 공개·사진·음주·신체 접촉을 강요하지 않고, 사진 미제출이나 안내 버튼 미클릭으로 노쇼/금전 불이익을 자동 부과하지 않는다.

**완료 기준:** 모든 공개 활동에 실행 가능한 안내 연결, 시작/진행/종료 상태별 올바른 한 행동, 새로고침·늦은 합류 후 복원, 권한 없는 진행 변경 차단, 기존 Day 규칙 회귀 없음, 모바일·데스크톱 캡처 및 실제 참가자 시나리오. 준비물·도움 버튼이 빈 링크가 아니어야 한다.

### G9. 기존 기능 보존과 출시 안전 기반

**결과:** 새 커뮤니티 기능 때문에 기존 가입·모임·월드컵·후속 만남·결제와 데이터가 사라지지 않는다.

- MBTI 다중 경험·철회, 방문 맛집 분류/기록/백업, 배달 검수 조건, 여성 쇼핑·남성 친목·성별 무관 모임을 보존한다.
- 구형 자동 친구 예약 작업과 자동 전화번호 공개 경로는 새 이름·보이스 기능을 열기 전에 보완한다. 기존 동의 관계를 추측으로 지우거나 초기화하지 않는다.
- 회원탈퇴/계정 삭제, 공개 약관/개인정보 안내, 일반 커뮤니티/모임/채팅/보이스 신고와 운영자 검토·종결, 앨범 만료 물리 삭제·실패 재시도, 프로필 초기화 안내 불일치 수정을 포함한다.
- 친구/후속 결제 경합, 전화 인증, 역할별 권한, 최종 후보 기록, 원격 RLS/Storage/Cron, 실제 결제·환불·알림은 별도 검증 증거가 필요하다.

**완료 기준:** 기존 보호 기록의 byte/행 보존 대조, 구형 무동의 자동 연결·연락처 공개 차단, 삭제/보관 정책과 실제 파일 처리 일치, 신고 처리 상태 완결, 사용자·업장·운영자·최고관리자 허용/거부 행렬, 실계정·실기기·운영 환경 검증. 과거 테스트 기록을 이번 완료로 재사용하지 않는다.

## 4. 정보 구조와 역할 경계

| 화면 | 주된 내용 | 피해야 할 혼동 |
| --- | --- | --- |
| 매칭 | 오늘/이번 주 활동·신청 인원·내 신청/배정·진행 중 만남 | 보이스 대기열을 데이팅 신청 풀과 섞지 않는다. |
| 커뮤니티 | 기존 피드·MBTI·맛집 + 지금 대화/학과 모집 | 기존 콘텐츠를 없애고 보이스로 대체하지 않는다. |
| 모임 상세 | 참가자 대화·일정·안내·모집/종료 상태 | 참가 완료와 현장 출석을 동일시하지 않는다. |
| 친구/대화 | 이름으로 알아보는 친구·대화 목록·문자·선택 음성 초대 | 실명 전역 목록, 학과 전체 자동 친구를 만들지 않는다. |
| 운영 콘솔 | 공식 방·경기 일정·주간 배정·신고 처리 | 업장 콘솔이나 최고관리자 전용 설정을 혼용하지 않는다. |

| 역할 | 허용 범위 | 금지 범위 |
| --- | --- | --- |
| 일반 사용자/모임 주최자 | 본인 신청·일반 모임/학과 대항 모집·준비된 보이스방 참여·자기 일반 모임 관리 | 그룹 음성방 개설·다른 방 관리·전역 이름 명부·운영자 권한 |
| 업장(파트너) | 자기 업장의 예약 시간·수용 인원·배정된 오프라인 서비스 | 학과 명부·커뮤니티 보이스 관리·개인 통화·전역 매칭 배정 |
| Quantum 운영자 | 새 권한 범위에서 공식 방 게시·경기 일정·배정 검토·신고 처리 | 최고관리자 권한 부여·결제 비밀·비공개 통화 몰래 청취 |
| 최고관리자 | 권한·운영 설정·기존 주간 모집창 게시·한도 정책 | 사용자 동의 없는 통화 청취·이름 전체 공개 |

운영자용 신규 기능 권한은 scope를 추가한 서버 guard로 제한한다. 현재 주간 창 게시가 최고관리자 전용인 사실은 유지하고, 편의상 관리자 guard를 삭제하지 않는다.

## 5. 기술 선택과 데이터 계약 제안

### 대안 비교

| 방안 | 장점 | 비용/제약 | 판단 |
| --- | --- | --- | --- |
| 기존 DB/API + 관리형 음성 + 승인된 공식 방 운영 | 기존 코드 보존, 1:1/단체 같은 미디어 기반 | 외부 서비스 설정·실기기·이용량 검증 필요 | 권장 설계안 |
| 음성 서버까지 자체 운영 | 인프라 제어 | TURN/SFU·모니터링·장애·보안 운영 범위 증가 | 현재 기본안으로 선택하지 않음 |
| 외부 통화앱 링크만 제공 | 앱 코드가 적음 | 앱 내 참가 수·권한·상대 넘기기·신고 동선이 끊김 | 사용자 요청 완료 기준 불충족 |

관리형 서비스 계약·비용 승인 전에는 공급자를 실제 생성하거나 생산 트래픽을 보내지 않는다. 서비스 미설정 환경은 준비 중으로 닫고 가짜 연결 성공을 표시하지 않는다.

### 새 모듈과 저장 원본

아래 명칭은 신규 설계명이지 이미 존재하는 구현이 아니다. 기존 테이블 이름/함수를 임의로 바꾸지 않고 필요한 forward migration으로 확장한다.

| 모듈 | 저장 원본/계약 | 핵심 불변 조건 |
| --- | --- | --- |
| 친구 인식 이름 | private profile name + invite token | 공개 별칭과 분리, 특정 상대에게만 projection |
| 문자 대화 목록 | 기존 friend message + read cursor | 수락 관계·차단 검사, 단조 증가 읽음 위치 |
| 참가 집계 | authoritative applications/memberships의 snapshot | scope+집계 기준+asOf, 사람 기준 중복 제거, 오류≠0 |
| 공개 집계 정책 | context별 적용 정책 version·효력 시각·집계 정의 | 모든 유효 참가자 자동 포함, 소수 숨김 없음, 운영 원본과 공개 projection 분리 |
| 주간 배정 제안 | proposal, items, consent/profile revisions, execution receipt, audit | 운영 scope·전원 동의 재검사·전체 배정 원자성·멱등 확정 |
| 보이스 방 | rooms, memberships, moderation events | 방 scope·정원·역할·명시 입장, closed 방 발급 금지 |
| 랜덤 보이스 | queue entries, sessions, participants, session events | 한 사람당 활성 대기/세션 최대 하나, session generation 검사 |
| 경기/공식 방 | sports events, published room link, source revision | 공식 출처·확인 시각, 같은 event/scope 중복 공식방 방지 |
| 학과 대항전 | challenges, teams, accepted roster, result confirmations | 자발적 팀 수락, 같은 사용자의 중복 자리 없음 |
| 진행 안내 | versioned template, source binding, personal progress | 미리보기와 실제 명령 분리, 서버 단계·개인 진행 보존 |

### API 책임과 상태

- `GET /api/tonight/participation-summary`, `GET /api/match/weekly-availability/summary`: 참가자 권한 안의 집계만 반환하는 신규 계약. 관리자 DTO를 재사용하지 않는다.
- `GET /api/community/voice/rooms`, 방별 `join/leave/token`: 참가 원장과 미디어 입장 권한을 분리한다. 사용자용 방 생성 POST는 제공하지 않으며 개설은 운영 API만 허용한다. 방별 `moderation`은 지정 진행자/운영자 권한을 추가 검사한다.
- `POST /api/community/voice/queue/join|cancel`, 세션별 `accept|next|end`: 서버가 대기·제안·통화·종료를 전이한다. 사용자 ID·성별·학과·권한은 body를 신뢰하지 않는다.
- `POST /api/internal/community/voice/webhook`: 서명·event ID·session generation을 검증하고 중복/역순 이벤트를 처리한다. audio payload는 저장하지 않는다.
- `GET /api/friends/conversations`, 대화별 `read-cursor`: 읽음도 상대의 차단/권한을 검사한다.
- `POST /api/profile/friend-name`, `POST /api/friend-invites/...`: 이름 수집/인식 전용 API. 전화번호 주소록 업로드는 범위 밖이다.
- `GET/POST /api/meetups/[id]/guide`, `GET/POST /api/meetups/[id]/chat`, 모임별 `schedule|cancel|complete`: membership·주최자·일정 revision으로 제한한다.
- `GET/POST /api/admin/community/voice/rooms`, `/api/admin/community/sports-events`, `/api/admin/match/weekly-allocations`: 운영 scope 및 감사 기록을 적용한다. 주간 제안별 `review|reject|execute`는 아래 상태 계약을 따른다.

개발용 상태 계약 예시:

```ts
type VoiceRoomState = 'draft' | 'scheduled' | 'open' | 'ended' | 'cancelled';
type VoiceSessionState = 'proposed' | 'connecting' | 'active' | 'ended' | 'expired';
type VoiceQueueState = 'waiting' | 'reserved' | 'matched' | 'cancelled' | 'expired';
type GuideActionKind = 'acknowledge' | 'open_chat' | 'open_map' | 'open_activity' | 'request_help';
type ParticipationSummary = {
  scopeId: string;
  asOf: string;
  totalPeople: number;
  genderBreakdown: {
    malePeople: number;
    femalePeople: number;
    otherOrUnspecifiedPeople: number;
  };
  disclosureBasis: 'all_valid_participants';
  policyVersion: string;
  basis: 'valid_applicants' | 'waiting_for_voice' | 'connected_to_voice';
};
```

### 공개 집계의 정확한 범위 — U13/U14 최신 확정 반영

- 열람자는 전화 인증 및 최소 가입이 완료된 동일 학교 이용자로 제한한다. 학과 대상 음성방의 상세 집계는 해당 방에 입장 자격이 있는 이용자에게만 제공한다. 비로그인·다른 학교에는 세부 집계 API를 공개하지 않는다.
- 집계 포함은 매칭 신청/보이스 참가의 필수 적용 규칙이다. 별도 선택 체크박스, 공개 동의 필드, 집계만 제외하는 토글은 만들지 않는다. 신청/입장 화면에서 공개 대상·집계 목적·소수 인원에서도 실제 수치가 표시된다는 점을 미리 안내한다. 참여 자체는 사용자가 선택하며 신청 철회·방 퇴장 후에는 현재 참여 집계에서 빠진다.
- 유효 참가자의 등록 값 `male`/`female`을 각각 집계하고, 기존 `other`·`prefer_not_to_say`·`unknown`은 `otherOrUnspecifiedPeople`로 합친다. 이 값들을 임의로 남성/여성으로 바꾸거나 기존 프로필 선택지를 삭제하지 않는다. 누구도 전체 수에서 누락하지 않는다.
- `male + female + otherOrUnspecified = total`이어야 한다. 문구는 ‘총 N명 · 남성 M명 · 여성 F명 · 기타·미확인 U명’으로 하고, 보조 설명에 ‘등록 프로필 기준’을 표시한다. 빈 정상 모집은 실제 0명이며 한 명만 있어도 숨김 없이 1명을 표시한다.
- 소수 인원 임계값·최소 공개 표본 수·상세 null 마스킹을 두지 않는다. 모든 집계 규모에서 같은 계산식을 사용한다. 무권한 요청은 숫자가 담긴 응답 자체를 거부하고, 장애는 오류/마지막 갱신 실패로 구분해 0명으로 바꾸지 않는다.
- 소수 방은 주변 정보를 아는 이용자가 성별을 추론할 수 있으므로 ‘완전 익명’이라고 표시하지 않는다. 개인 이름·전화번호·참가자별 성별 명부, 학과×성별 검색과 입퇴장 성별 이력은 이 결정의 공개 범위가 아니다.
- 새 정책은 효력 시각과 version을 기록한다. 새 모집/방은 처음부터 사전 안내를 적용하며, 이미 진행 중인 모집/방에는 새 공개 기준을 알리고 철회/퇴장할 기회를 제공한 뒤 정책 전환을 적용한다. 이 절차는 공개를 선택적으로 끄는 토글이 아니다. 종료된 과거 방/개인 이력을 소급 공개하지 않는다.
- 운영자도 같은 집계 정의를 쓰며, 원장과 공개 수치 차이를 검증할 권한은 목적별 scope로 제한한다. 이 제품 결정만으로 개인정보 처리·공개 문구의 출시 적합성까지 검증됐다고 보지 않으며 실제 운영 전 검토 조건으로 남긴다.
- 완료 검증에는 기존 계정 정책 전환, 5가지 성별 값, 0명/1명/2~4명/5명 이상 정확한 수치, 신청 철회·방 퇴장·성별 변경 반영, 다른 학교·학과 접근 거부, 정상 0과 오류 구별을 포함한다. 집계 opt-in/out API나 화면이 남아 있지 않은지도 검사한다.

### 주간 배정 제안의 권한과 상태 — R04 승인 대상 기본안

- 최고관리자가 Quantum 운영자 계정에 학교별 `weekly_allocation:review`와 `weekly_allocation:execute` scope를 명시적으로 부여·회수한다. 업장·일반 사용자·scope 없는 운영자는 조회/실행 모두 거부한다. 기존 최고관리자 전용 모집창 생성·게시 권한은 별개다.
- 제안은 학교/주차, 후보 신청·창·대상 회차, 전원 동의 멤버와 revision, 학과/자격 snapshot revision, 제안 revision, 생성/검토 actor, 확정 idempotency key, 실행 receipt를 가진다. 운영자에게도 배정 검토에 불필요한 이름·전화번호·외모 원본을 공개하지 않는다.
- 상태는 `proposed → in_review → executing → completed`를 기본으로 하며 검토 거절은 `rejected`, snapshot 변경은 `stale`, 실행 실패는 `failed`다. 검토자는 거절 이유를 남기고, 오래된 제안을 수동으로 강제 통과시키지 않는다. 실패/만료 제안은 현재 상태로 새 revision을 만든 뒤 재검토한다.
- 제안별 검토/거절/실행 API는 운영 인증, 학교 scope, `expected_revision`과 idempotency key를 검사한다. 서비스 키·내부 secret을 브라우저나 운영자에게 반환하지 않는다. 승인된 서버만 기존 service RPC 또는 이를 감싼 신규 서비스 전용 원자적 batch RPC를 실행한다.
- 커밋 시 창 게시/마감/정원·학교·차단·학과·동반 전원 동의·신청 중복·대상 회차를 잠금 상태에서 재검사한다. 필요한 회차 생성과 여러 신청의 팀 배정은 동일 트랜잭션으로 처리해 일부 사람만 확정되는 결과를 남기지 않는다.
- 성공한 동일 idempotency key 재호출은 같은 receipt를 반환하고 추가 회차/배정을 만들지 않는다. 응답 유실은 key와 실제 원장을 먼저 조회해 커밋 여부를 판정한다. 검증 실패는 변경을 rollback하고 실패 이벤트만 별도 운영 감사 기록에 남긴다.
- 감사 기록은 누가 어떤 scope로 어느 제안 revision을 검토/거절/실행했고 무엇이 확정됐는지 추적한다. 실명·전화번호·음성 내용은 감사 로그에 복사하지 않는다.
- 완료 검증은 scope 부여/회수, 무권한 운영자와 업장 거부, 검토 중 철회·학과/정원 변경, 두 운영자 동시 확정, 전체 팀 원자성, 재시도·응답 유실 복구, 모집창 최고관리자 권한 보존이다.

### 보안·운영 세부

- RLS뿐 아니라 공개 함수 EXECUTE 권한·private schema·서버 소유권을 함께 검사한다. 외부 클라이언트에는 서비스 키를 주지 않는다.
- 미디어 토큰은 방·참가자·마이크 권한만 담는다. opaque ID를 쓰고 이름·전화번호를 token identity/room name에 넣지 않는다.
- 짧은 토큰 만료만으로 현재 통화를 종료했다고 간주하지 않는다. 강퇴/차단/넘기기는 서버의 미디어 참가자 제거와 새 토큰 거부를 함께 수행한다.
- 기본 녹음·음성 전사·운영자 몰래 청취·중계 영상/음원 재송출은 포함하지 않는다. 각자 시청 채널로 경기를 보면서 앱 음성으로 대화하는 기능이다.
- 새 Supabase 테이블을 `realtime` 관리 스키마에 만들지 않는다. 자체 schema와 지원되는 private channel 정책만 사용한다. 본문 전달은 권한 검사 API를 통과한다.
- 마이크 허용은 필요한 자기 origin에 제한하고 CSP에는 선택한 공급자의 필요한 연결 주소만 넣는다. 전역 와일드카드로 보안 정책을 해제하지 않는다.
- 제안 초기 갱신 목표는 신청 현황 15초, 정상 보이스 참가/퇴장 이벤트 5초 이내, 단절 감지 정리 60초 이내다. 이 값은 구현 검증 목표이며 실측 보장이 아니다. 운영 환경 부하검사에서 실패하면 공개 전 보완한다.
- 소규모 학과 보이스방은 권한 없는 사용자에게 참가자별 성별·이름을 노출하지 않는다. 민감한 세부 교차 필터와 초단위 참가 이력은 제공하지 않는다.

## 6. 스포츠 일정과 선개설 운영

- KBO 공식 경기 일정/잔여 일정 공지와 구단 공식 일정을 출처로 검수한다. 이번 조사에서 잔여 일정과 우천 재편성 규칙을 확인했지만 개별 미래 경기의 당일 개최 여부까지 확정한 것은 아니다.
- 현재 자동 수집 API의 이용 계약은 확인되지 않았다. 첫 완성 범위에는 운영자 수동 검수 입력·수정·취소·공식 출처 링크를 포함한다. 검증되지 않은 비공개 API나 임의 크롤링을 전제로 하지 않는다.
- 경기 레코드는 종목·리그·홈/원정·경기 일시·상태·출처·검수 시각·revision을 가진다. 더블헤더는 별도 경기로 구분한다.
- 일정 확정 → 공식 방 초안 → 검토/게시 → 시작 전 재확인 → 입장 알림 → 개방 → 종료가 한 흐름이다.
- 우천/지연/취소/재편성이면 원래 방의 경기 상태와 알림을 갱신한다. 기존 참가자를 새 시각으로 무단 이동시키지 않고 변경 안내와 재참여 선택을 제공한다.
- 같은 경기·학교·주제 범위의 중복 방을 막는다. 학과별 방은 실제 수요에 따라 운영자가 선택해서 열며 모든 학과에 일괄 방을 생성하지 않는다.
- 시즌이 끝나면 종료된 방은 새 모집처럼 노출하지 않는다. 경기 없는 날은 일반 팬 수다방으로 명확히 구분한다.

## 7. 구현 파일 책임 지도

모든 상대경로의 루트는 위 기준 작업공간이다. 실제 구현은 기존 더티 결과를 보존한 승인 기준으로 격리하며, 이 계획 작성은 새 worktree 생성이나 Git 조작 승인이 아니다. 신규 경로는 아래 표의 ‘신규’ 표시대로만 생성한다.

| 작업 | 기존 수정/재사용 대상 | 신규 모듈/테스트 경계 |
| --- | --- | --- |
| G1 | `components/profile/BasicInfoForm.tsx`, `lib/profile/basic-profile-input.ts`, `app/api/profile/basic/route.ts`, `app/friends/page.tsx`, `components/tonight/FriendInviteSharePanel.tsx` | `lib/friends/recognition-name.ts`, `app/api/profile/friend-name/route.ts`, `app/api/friend-invites/`, `tests/profile/friend-recognition-name.test.ts`, `tests/auth/friend-invite-name-privacy.test.ts` |
| G2 | `components/friends/FriendChatRoom.tsx`, `app/friends/[id]/chat/page.tsx`, `app/api/friends/[id]/chat/route.ts`, `lib/matching/friend-direct-chat.ts` | `components/friends/ConversationList.tsx`, `lib/friends/conversation-state.ts`, `app/api/friends/conversations/route.ts`, `tests/matching/friend-messenger-state.test.ts` |
| G3 | `components/tonight/UserTonightExperience.tsx`, `components/matching/WeeklyActivityExplorer.tsx`, `components/matching/WeeklyActivityWindowOperator.tsx`, `lib/matching/weekly-availability.ts`, `app/api/internal/match/weekly/assign/route.ts` | `lib/matching/participation-summary.ts`, `lib/matching/weekly-allocation.ts`, 5절 집계 API, `app/api/admin/match/weekly-allocations/route.ts`, `tests/matching/participation-summary.test.ts`, `tests/matching/weekly-allocation-workflow.test.ts` |
| G4 | `lib/matching/tonight-ranked/contracts.ts`, `lib/matching/tonight-ranked/team-allocation-core.ts`, `lib/matching/tonight-ranked/team-objective.ts`, `lib/matching/tonight-ranked/automation.ts`, 기존 오늘밤 publish/주간 assign SQL | `lib/matching/department-exclusion.ts`, `tests/matching/department-exclusion.test.ts`, `supabase/tests/department-exclusion.sql` |
| G5/G6 | `app/community/page.tsx`, `components/community/CommunityExperienceExplorer.tsx`, `next.config.mjs`, `package.json`/lockfile | `lib/community/voice/`, `components/community/voice/`, `app/community/voice/`, 5절 voice API/worker, `tests/matching/voice-room-state.test.ts`, `tests/matching/voice-queue-state.test.ts`, `tests/auth/voice-authorization.test.ts` |
| G7 | `components/meetups/CreateMeetupForm.tsx`, `components/meetups/MeetupHub.tsx`, `lib/community/catalog.ts`, `lib/profile/department-catalog.ts`, 기존 meetup APIs | `lib/community/department-rooms.ts`, `lib/community/challenges.ts`, `components/meetups/DepartmentChallenge.tsx`, `app/api/community/challenges/`, `tests/matching/department-challenge.test.ts` |
| G8 | `components/matching/DalmutiRulesGuide.tsx`, `components/matching/ContinuationContentGuide.tsx`, `components/matching/OccurrenceContentExperience.tsx`, `lib/matching/continuation-content-guide.ts`, `lib/campus-seven/live-guide.ts` | `lib/meetups/guide-contract.ts`, `lib/meetups/guide-catalog.ts`, `components/meetups/LiveActivityGuide.tsx`, `app/meetups/[id]/page.tsx`, 5절 guide/chat/lifecycle API, `tests/matching/meetup-live-guide.test.ts` |
| G9 | `app/profile/edit/page.tsx`, `app/api/profile/photos/route.ts`, `components/tonight/AdminTonightConsole.tsx`, 기존 incident/album/legacy RPC 경계 | 계정 삭제/법적 안내 페이지/공통 신고 처리/보관 만료 worker, `tests/auth/account-deletion.test.ts`, `tests/matching/community-moderation-lifecycle.test.ts`, `tests/matching/legacy-contact-policy.test.ts` |

전체 기능의 `supabase/migrations/`, 공통 타입, 인증, 결제, Realtime/Storage 설정은 통합 담당이 단독 소유한다. 병렬 담당이 같은 SQL이나 공용 파일을 동시에 수정하지 않는다. 적용된 migration은 수정하지 않고, 구현 시점의 14자리 UTC 타임스탬프로 새 파일을 생성한다. 파일 작성과 로컬·원격 DB 적용은 서로 다른 승인 범위다.

## 8. 구현 작업과 검증 패킷

실행 순서는 기능을 일부만 제공하기 위한 출시 단계가 아니라 기술 의존성이다. 공용 계약·권한 → 병렬 기능 구현 → 통합 동선 → 전체 검수로 진행한다. 사용자에게 기능별로 같은 승인을 반복 요청하지 않는다.

- [ ] **T1 정책·회귀 고정:** U01–U14, 승인된 R01/R03/R04 기본안과 보호 기능을 테스트 목록으로 만든다. 취소된 학과 자동친구, 집계 선택 동의·소수 숨김 제안이 실행 스키마/API/문구에 남지 않았는지 검사한다. 기존 오류/미검증도 따로 유지한다.
- [ ] **T2 이름·친구 동선:** G1/G2별 실패 테스트를 먼저 추가하고 기존 타입스크립트 테스트 runner에서 해당 파일이 실제 포함되는지 확인한다. 개인정보 projection → API → 이름 입력/초대/메신저 순서로 구현한다.
- [ ] **T3 신청·학과·배정:** G3/G4별 실패 테스트와 rollback SQL 시나리오를 추가한다. 집계와 동일학과 정책을 DB 최종 확정에 먼저 강제한 뒤 날짜 카드와 운영 배정 UI를 연결한다.
- [ ] **T4 보이스 공용 기반:** G5/G6 상태 전이·동시성·토큰·webhook 실패 테스트를 만든다. 공급자 adapter는 가짜와 실제를 명확히 분리하고 실제 통화 전에는 ‘미디어 미연결’로 표시한다. 외부 제공자 접근은 승인된 환경에서만 검증한다.
- [ ] **T5 공식 방·학과 모집:** G5/G7 운영자 방 초안/게시·스포츠 일정 변경·자발적 참가·팀 수락을 구현한다. 운영자/업장/최고관리자/일반 사용자의 거부 테스트를 같은 패킷으로 둔다.
- [ ] **T6 현장 안내:** G8 활동별 guide 연결표를 작성하고 실제 상태와 미리보기 분리 테스트를 통과시킨다. 활동/도움/채팅으로 이동하는 실제 버튼을 연결한 다음 만화 자산을 적용한다. 새 그림은 승인된 제작·사용권 경계 안에서 생성/선정한다.
- [ ] **T7 운영 수명주기:** G9 신고 처리·계정 삭제·앨범 삭제·구형 자동 연결/연락처 경계를 보완한다. 삭제는 합성 fixture/별도 로컬 DB에서 검증하고 기존 실제 기록은 초기화하지 않는다.
- [ ] **T8 독립 통합 검수:** G1–G9 기준을 각기 PASS/REVISE로 판정한다. 정상/빈 상태/실패/권한 없음/재접속을 실제 브라우저에서 확인한다. 신규 UI의 390px/1440px 캡처를 제공한다. 로컬 결과와 실계정/실기기/원격 결과를 분리한다.

중요 학과 예외의 순수 함수 계약과 테스트 예시(신규 파일 설계):

```ts
export type DepartmentParticipant = {
  userId: string;
  departmentKey: string | null;
  acceptedCompanionApplicationId: string | null;
};
export function canShareDatingTeam(a: DepartmentParticipant, b: DepartmentParticipant): boolean {
  if (a.userId === b.userId) return false;
  if (!a.departmentKey || !b.departmentKey) return false;
  if (a.acceptedCompanionApplicationId !== null && a.acceptedCompanionApplicationId === b.acceptedCompanionApplicationId) return true;
  return a.departmentKey !== b.departmentKey;
}
```

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canShareDatingTeam, type DepartmentParticipant } from '../../lib/matching/department-exclusion';
const person = (userId: string, departmentKey: string | null, acceptedCompanionApplicationId: string | null): DepartmentParticipant => ({ userId, departmentKey, acceptedCompanionApplicationId });
test('same department strangers are excluded', () => assert.equal(canShareDatingTeam(person('a','pnu:mech',null),person('b','pnu:mech',null)),false));
test('same department accepted invite bundle is kept', () => assert.equal(canShareDatingTeam(person('a','pnu:mech','server-bundle'),person('b','pnu:mech','server-bundle')),true));
test('different bundles do not bypass department exclusion', () => assert.equal(canShareDatingTeam(person('a','pnu:mech','x'),person('b','pnu:mech','y')),false));
test('missing department does not pass', () => assert.equal(canShareDatingTeam(person('a',null,null),person('b','pnu:mech',null)),false));
```

이 함수는 학과 비교만 담당한다. 실제 호출 전에 학교·성별 구성·차단·연령·참가 자격·신청과 회차별 서버 검증 동반 원장 검사를 통과해야 하며 DB 최종 publish도 독립적으로 같은 정책을 검사해야 한다. 브라우저가 준 문자열이나 일반 친구 관계를 `acceptedCompanionApplicationId`로 바로 전달하지 않는다. 오늘밤과 주간은 서로 다른 namespace의 ID를 쓰며, 동일 회차 안에서 전원 동의 snapshot이 검증된 멤버만 동일 값을 가질 수 있다.

검증 명령은 기존 workspace에서 실행 가능한 다음 runner를 사용한다. 실제 구현 전에는 실행 결과를 주장하지 않는다.

```powershell
npm run test:auth
npm run test:config
npm run test:matching
npm run test:profile
npm run typecheck
npm run lint
npm run build
npm run check:migrations
npm run check:secrets:all
```

각 명령 기대 결과는 exit 0이며 테스트 수는 변경 후 실제 출력으로 기록한다. `.tmp` 테스트 산출물 정리 경로와 빌드 경로는 실행 전 workspace 내부인지 확인한다. SQL 검증은 승인된 전용 로컬 DB에 한정하고 transaction rollback으로 끝낸다. 운영 Cron·SMS·결제·음성 제공자는 단위 테스트로 검증 완료 처리하지 않는다.

### 필수 통합 시나리오

| 검증 | 실제 증거 |
| --- | --- |
| 이름 가입 → 링크 초대 → 수락 → 친구 메시지 → 통화 초대 | 두 계정·두 기기, 권한 없는 세 번째 계정 거부, 새로고침 유지 |
| 같은 학과 직접 친구 동반 + 다른 학과 신규 참가 | 전원 동의·학과 제외·3남2녀/허용6명 구성·최종 저장 대조 |
| 이번 주 복수 날짜 → 신청 현황 → 운영 배정 → 안내 | 날짜 고유인원·단일 확정·모든 친구 동일 회차·일정변경 알림 |
| 공식 야구방 → 학과 사용자 참여 → 우천 취소 | 실제 source snapshot과 수정 이력, 알림, 자동친구 생성 0건 |
| 단체 보이스 입장/강퇴/퇴장 | 3대 이상 기기, 음성 실제 송수신, 인원 정리, 재입장 차단 |
| 1명 모집/방 → 참가 증가 → 신청 철회/퇴장 | 소수 숨김 없는 실제 남녀/기타 합계, 집계 선택 토글 없음, 다른 학교 열람 거부 |
| 1:1 다음 상대 반복 → 대기 취소 | 동시 세션 0중복, 이전 상대 오디오/토큰 격리 |
| 학과 대항 모집 → 팀 수락 → 일정/결과 확인 | 한쪽 임의 확정 거부, 중복 참가와 권한 경계 |
| 모임 현재 단계 → 만화 → 실제 행동 → 재접속 | 미리보기 무상태 변경, 실제 상태 복원, 모바일·데스크톱 캡처 |
| 탈퇴/차단/신고 종결/앨범 만료 | 세션·토큰·이름·신규 메시지 철회와 파일 실제 삭제, 실패 복구 |

## 9. 출시 판단과 보존

- 코드 기능 구현, 로컬 SQL, 브라우저, 실계정, 실제 통화/결제, 원격 운영을 각각 별도 증거로 적는다.
- 운영 SMS·Toss·환불·Push·Cron·음성 서비스·동일 후보 배포가 확인되지 않으면 ‘전체 출시 완료’라고 말하지 않는다.
- 계정/방/프로필/친구/MBTI/월드컵 기록·이미지는 각 신규 변경 전후 보존 기준으로 대조한다. 오래된 기록을 새 가상 데이터로 덮어쓰지 않는다.
- 커밋·푸시·원격 migration·실제 결제·배포는 각각 별도 사용자 승인이 필요하다. 이 계획서에 체크박스가 있다고 승인된 것은 아니다.
- U08의 직접 동반 친구 예외, U09의 자동친구 취소, U13/U14의 소수 인원도 공개·집계 필수 적용은 사용자 확정 사항이다. 음성 참여 범위와 주간 배정 권한 등 R01/R03/R04는 명시한 설계 제안이지 이미 사용자 승인을 받은 정책이 아니다. 전체 계획을 검토·승인받은 뒤 해당 계약으로 구현하며, 미기재 기준을 담당자가 임의로 확정하지 않는다. 공급자 비용·운영 계정·공개 일정은 별도 외부 준비 조건이다.

## 10. 근거와 이번 작성 검증

### 로컬 근거

- `components/tonight/AdminTonightConsole.tsx:237`, `components/tonight/SuperAdminTonightConsole.tsx:410`, `components/tonight/live-adapters.ts:613`: 운영측 남녀 신청 수. 사용자에게 그대로 공개할 계약은 아니다.
- `lib/matching/tonight-ranked/contracts.ts:11`, `lib/matching/tonight-ranked/automation.ts:279`, `lib/matching/tonight-ranked/team-objective.ts:26`: 오늘밤 학과 입력과 제외 제약이 없는 현재 경계.
- `lib/matching/filter.ts:8`, `lib/matching/tonight-ranked/team-allocation-core.ts:325`: 일반 그룹 사이 학과 제외와 오늘밤 동반 묶음 보존.
- `components/matching/DalmutiRulesGuide.tsx`, `components/matching/ContinuationContentGuide.tsx`, `components/matching/OccurrenceContentExperience.tsx`: 만화 안내와 실제 진행 경계.
- `app/api/internal/match/weekly/assign/route.ts`, `components/matching/WeeklyActivityExplorer.tsx`: 주간 신청/배정의 현재 연결.
- `components/profile/BasicInfoForm.tsx`, `lib/profile/basic-profile-input.ts`, `app/api/profile/basic/route.ts`: 공개 별칭 저장 경계.
- `app/api/friend-requests/route.ts`, `components/friends/FriendChatRoom.tsx`: 명시 요청/수락과 문자 채팅.
- `docs/operations/release-preservation-open-gates-20260906.md`: 이전 보존 작업에서 남은 출시 조건.

### 공식 기술·일정 근거

- [LiveKit 토큰·권한](https://docs.livekit.io/frontends/reference/tokens-grants/): 방별 권한과 opaque identity, 초기 연결 토큰 만료와 재연결/철회의 구분을 확인했다.
- [LiveKit 방·참가자 관리](https://docs.livekit.io/reference/other/roomservice-api/): 방과 참가자 관리 서버 API를 확인했다. 아직 앱에 통합하거나 공급자를 만들지 않았다.
- [Supabase Realtime 권한](https://supabase.com/docs/guides/realtime/authorization): private channel과 정책 경계를 확인했다. 메시지 본문 권한을 클라이언트 구독에만 맡기지 않는다.
- [Supabase Realtime 스키마 변경 제한](https://supabase.com/changelog/realtime-schema-locked-down-against-modification): 관리 스키마에 사용자 테이블/함수를 추가하는 방식을 사용하지 않는다.
- [KBO 잔여 일정 공식 공지](https://web1.koreabaseball.com/MediaNews/Notice/View.aspx?bdSe=12120): 우천 취소·재편성과 시작 시각 변경이 존재함을 확인했다. 월별 일정 페이지는 이번 도구에서 정상 내용을 얻지 못했으므로 특정 미래 경기의 개최를 임의로 확정하지 않았다.

이번 변경은 이 신규 계획서 한 파일이다. 제품 코드·DB·방 개설·제공자 설정·Git 기록·배포는 변경하지 않았다.

- 작성 검증: 최신 사용자 결정 14개, 설계 제안 3개, 목표별 범위 9개와 수용 기준을 대조했다. 기존 수정/재사용 대상으로 적은 파일 경로 34개가 현재 작업공간에 존재하는지 확인했다. 새 모듈로 표시한 파일은 현재 존재하는 파일을 새 파일로 잘못 분류하지 않았다.
- 독립 검토: 첫 검토의 보완 5건(친구와 동반 신청 구분, 그룹 음성방 개설 권한, 집계 계약, 음성 참가 조건, 주간 배정 확정 계약)을 수정한 뒤 계획 검토 PASS를 받았다. 이어 사용자가 U13/U14를 확정하여 집계 기준을 변경했고, 이 변경의 결정표·API 타입·정책·테스트 일관성도 별도 재검토 PASS를 받았다.
- 폐기 확인: 학과 전체 자동 친구, 집계 선택 동의·소수 인원 숨김은 실행 요구사항에서 제외했다. 배경 영상 발화는 앱 요구사항에 포함하지 않았다.
- 미검증: 이 판정은 계획의 일관성과 범위에 대한 것이다. 새 제품 코드, 브라우저 동작/디자인 캡처, DB 적용, 실제 계정/기기 음성, 개인정보 처리의 출시 적합성, 원격 결제·배포는 검증하지 않았다. 과거 테스트나 로컬 운영 기록을 이번 구현 완료로 재사용하지 않았다.

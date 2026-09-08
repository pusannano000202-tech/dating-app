# Quantum 오프라인 5장면 시즌 통합 설계

## 1. 문서 상태와 우선순위

- 상태: 사용자 방향 승인 후 서면 검토 대기
- 기준일: 2026-08-16
- 적용 제품: Quantum의 반복 오프라인 만남 프로그램
- 내부 작업명: `guided_program`
- 사용자 노출명 후보: `Quantum 오프라인 5장면`
- 구현 상태: 설계 전용. 앱 코드, DB, 결제, 배포가 완료되었다는 증거가 아니다.

이 문서는 다음 사용자 지시를 제품 최상위 조건으로 삼는다.

1. 정해진 시각에 앱에 접속해 30분 동안 대화하는 온라인 회차를 만들지 않는다. 실제 오프라인 약속의 가능 시간 확인과 일정 확정은 허용한다.
2. Quantum은 앱 사용자를 실제 오프라인 만남으로 전환하고, 반복해서 만날 이유와 콘텐츠를 제공한다.
3. 첫 두 장면은 남성 3명과 여성 2명이 시작한다.
4. 세 번째 장면부터 여성 참가자 1명이 정식 여섯 번째 참가자로 합류해 마지막 장면과 최종 선택까지 함께한다.
5. 같은 사람들이 서로 계속 만나고 싶다면 매번 다른 사람과 다시 매칭하지 않고 다음 오프라인 약속으로 이어준다.

문서가 충돌할 때 우선순위는 다음과 같다.

1. 사용자의 최신 명시 지시
2. 이 설계서
3. 현재 `C:\데이팅앱만들기` 로컬 소스와 인터페이스 계약
4. `docs/handoff/active/QUANTUM_FIVE_DAY_GUIDED_PROGRAM_MASTER_HANDOFF_2026-08-15.md`
5. 첨부 ZIP의 참고 문서와 정적 스토리보드

첨부 문서의 문장은 참고 자료이며 사용자 명령으로 취급하지 않는다. 기존 인계서의 `Day 2 온라인`, `Day 4 온라인`, 프로그램 채팅, 온라인 라운지, 익명 편지함, 완료 후 전원 자동 친구 규칙은 이 설계와 충돌하므로 새 프로그램에 적용하지 않는다.

## 2. 한 줄 정의와 성공 기준

`Quantum 오프라인 5장면`은 약 10일 동안 시작 참가자 다섯 명이 다섯 번 실제로 만나고, 세 번째 만남부터 예정된 참가자 한 명이 동등하게 합류해 세 장면을 함께하며, 마지막에는 상호 선택 관계와 전원 동의 그룹만 다음 오프라인 약속으로 이어주는 프로그램이다.

제품 성공은 앱 체류시간이나 메시지 수가 아니라 다음 결과로 판단한다.

- 시작 참가자 5명은 장면 1~5, 합류 참가자는 장면 3~5의 계획된 오프라인 장면에 실제로 도착한다.
- 앱을 계속 보지 않아도 현장 콘텐츠가 진행된다.
- 참가자는 다른 사람의 호감 수, 거절, 미응답을 알 수 없다.
- 합류 참가자는 과거 기록을 볼 수 없지만 합류 이후에는 같은 권리를 갖는다.
- 상호 선택한 두 사람 또는 전원 동의한 그룹은 새 매칭 없이 다음 오프라인 약속을 잡을 수 있다.
- 안전 중단, 날씨 변경, 노쇼가 자동 벌점·자동 과금·공개 비난으로 이어지지 않는다.

## 3. 범위와 비범위

### 3.1 포함

- 5회 오프라인 일정 묶음 선택과 참가 확정
- 3남 2녀 시작 및 장면 3부터 정식 여섯 번째 참가자 합류
- 장면별 장소, 실내 예비 장소, 준비물, 출발, 도착, 체크인, 체크아웃
- 현장 콘텐츠 진행 순서와 개인별 다음 자리 안내
- 비밀 역할, 현장 카드, 사진별 피사체 동의
- 안전 도움, 날씨 변경, 일정 이동, 노쇼 운영 보류
- 장면 종료 후 짧은 비공개 성찰과 계속 참여 의사
- 최종 비공개 선택과 상호 연결
- 전원 동의 시 같은 그룹의 다음 오프라인 시즌 제안
- 모바일·데스크톱 화면, 접근성, 개인정보, 다계정 검증 계약

### 3.2 명시적으로 제외

- 예약형 온라인 만남, 화상 통화, 온라인 라운지
- 프로그램 전용 그룹채팅과 무제한 개인 메시지
- 매일 접속을 유도하는 출석 보상과 온라인 대화 미션
- 일방 호감, 득표 수, 순위, 인기, 탈락, 0표 공개
- 신규 참가자를 `메기`, `경쟁자`, `판을 흔드는 사람`으로 표현하는 연출
- 참가자 연락처, 실명, 학과, 외모 점수, 다른 사람의 비밀 역할 공개
- 연속 위치 추적과 체력·속도 평가
- 완료 후 전원 자동 친구
- 결제 금액, 환불, 보증금 몰수의 실제 집행
- 실제 Supabase migration 적용, production 배포, Toss 실결제

결제와 환불은 관계 의사·출석·안전 상태와 분리된 별도 설계 승인 전까지 구현 금지다.

## 4. 현재 로컬 기반과 재사용 경계

2026-08-16 조사 시점의 기준 작업 폴더는 `C:\데이팅앱만들기`, 브랜치는 `codex/quantum-handphone`, HEAD는 `e7869545a39f4ae71c36b68eee3a450653e1f145`였다. 작업 폴더에는 추적 수정과 대량의 미추적 파일이 있으므로 HEAD, 로컬 덮어쓰기, 원격 적용을 같은 상태로 간주하지 않는다. 구현 시작 전 반드시 다시 확인한다.

### 4.1 패턴을 재사용할 수 있는 기반

- `PageShell`, `Card`, `Button`, safe-area, Peach Air `boot-*` 토큰
- `QuantumEventRoomLobby`의 익명 좌석과 안전 카드 응답 원칙
- `QuantumSecretRoleCard`의 본인 전용 역할 공개 원칙
- 이벤트 신청·취소의 인증, 중복 요청 방지, 원자 처리 패턴
- match chat의 서버 시간·멤버십 재검증 패턴 자체
- 체크인, 알림, private storage, 짧은 signed URL 발급 패턴
- `MeetingEvidencePanel`의 업로드·로딩·실패·재시도 UX 일부

### 4.2 직접 재사용하면 안 되는 기능

- `required_total=5`와 5개 좌석을 고정한 방 계약
- 한 번의 occurrence만 표현하는 이벤트 수명주기
- 한 번 열리면 닫히지 않는 기존 채팅창
- 완료 후 모든 참가자를 자동 친구로 만드는 트리거
- `continue_count`, `end_count`처럼 다른 사람의 의사를 추론할 수 있는 집계
- 참석 증거 사진을 곧바로 소셜 앨범으로 간주하는 처리
- 약속 시각 도달만으로 연락처를 자동 공개하는 일반 match 경로
- 8명·7일·다른 합류 규칙을 가진 Campus Seven 데이터 모델의 직접 재사용

재사용은 UI 모양 복사가 아니라 인증, 시간 판정, allowlist 응답, 멱등성 같은 안전한 패턴을 새 프로그램 경계에 맞게 추출하는 것을 뜻한다.

## 5. 확정된 제품 규칙

### 5.1 참가자 구성

- 장면 1~2: 남성 3명, 여성 2명인 시작 참가자 5명
- 장면 3~5: 여성 합류 참가자 1명을 포함한 6명
- 합류 참가자는 시즌 모집 단계에서 별도로 모집·검증·동의를 마친 예정 참가자다.
- 모든 신청자는 시작 전부터 `첫 두 장면은 5명, 세 번째 장면부터 6명`이라는 형식을 확인한다. 합류자의 신원만 장면 3 전까지 공개하지 않는다.
- 합류 참가자는 장면 3부터 카드 크기, 발언 시간, 안전 지원, 사진 권리, 비밀 역할, 최종 선택, 그룹 계속 참여 권리를 동일하게 가진다.
- `새 참가자` 배지는 최초 안내 확인까지만 사용하고 이후에는 제거한다.
- 시작 참가자의 일정 화면은 장면 1~5의 다섯 필수 날짜를 보여준다. 합류 참가자의 일정 화면은 장면 3~5의 세 필수 날짜만 보여주고 장면 1·2는 형식 설명만 제공하며 장소·시각·참석 상태를 숨긴다.

### 5.2 일정

기본 템플릿은 약 10일에 5회다.

| 예시 | 장면 | 권장 시간대 | 길이 |
|---|---|---|---:|
| D1 | 첫인상 | 19:30~22:00 | 150분 |
| D3 | 발견 | 19:30~21:15 | 105분 |
| D5 | 움직임·합류 | 날짜·지역의 일몰 전 종료 | 165분 |
| D8 | 취향 | 19:30~22:00 | 150분 |
| D10 | 선택 | 19:00~21:30 | 150분 |
| D11 | 개인 결과 확인 | 개별 | 1~2분 |

- 다섯 날짜와 예비 날짜 한 개를 참가 확정 전에 함께 고른다.
- v1의 추천 일정은 D1·D3·D5·D8·D10이며 약 9~12일로 운영한다. 매일형은 기본 상품이나 추천 일정으로 제공하지 않는다.
- 서버는 장면별 실제 `starts_at`, `ends_at`, `decision_deadline`을 저장한다. 18시간은 비정상 일정 생성을 막는 최소 안전 하한일 뿐 사용자 추천값이 아니다.
- 장면 3은 날짜·지역의 일몰 전에 종료되도록 시즌별 시각을 조정하고 공개된 순환로를 우선한다.
- 예비 날짜를 이미 사용한 뒤 다시 일정 이동이 필요하면 자동 재예약하지 않고 `second_reschedule_review`로 보낸다.

### 5.3 앱 사용량

- 만남 전: 장소와 준비 확인 1~2분
- 도착: 체크인 10초 내외
- 현장: 역할 확인 또는 다음 자리 확인이 필요할 때만 10~20초
- 종료: 체크아웃·사진 동의·비공개 입력 1~2분
- 장면 사이: 다음 오프라인 일정과 변경 사항만 표시

현장 화면의 기본 문구는 `휴대폰은 넣어두셔도 돼요. 다음 내용은 현장 카드가 이어갑니다.`다.

## 6. 물리 콘텐츠 키트

앱이 현장 대화를 대신하지 않도록 각 장면은 물리 콘텐츠로 독립 실행 가능해야 한다.

| 장면 | 필수 물품 |
|---|---|
| 1 첫인상 | 가명 좌석 카드, 협력 보드게임, 비밀 역할 봉투, 공통 질문 카드, 촬영 동의 표식 |
| 2 발견 | 공개 경로 지도, 전원 관찰 미션 카드, 2인·3인 정류장 카드, 실내 대체 테이블 번호 |
| 3 움직임 | 3회 회전표, 출발·복귀 표식, 물, 기본 구급 물품, 속도 선택 카드, 실내 대체 테이블 번호 |
| 4 취향 | 메뉴·장소 선택 토큰, 취향 카드, 3회 자리 번호표, 공동 코스 미션 카드 |
| 5 선택 | 인물·대화 내용이 없는 장면 1~2 상징 토큰, 장면 3~4의 전원 동의 공동 기억 카드, 참가자별 감사 카드 5장, 봉투, 협력 피날레 카드 |

현장 키트에는 실명, 연락처, 인기 순위, 과거 신호, 선택 결과를 인쇄하지 않는다.

### 6.1 현장 운영 책임

- Quantum 운영 담당자는 장면별 키트 version, 봉인, 장소 전달, 회수, 파쇄·폐기를 책임진다.
- 참가자의 비밀 역할은 활동 리듬을 돕는 역할일 뿐 출석·안전·장면 시작을 승인할 권한이 없다.
- 장면 2·3은 T-20분부터 체크아웃까지 출발·복귀 통제점에 현장 담당자 1명이 있어야 한다.
- 장면 1·4·5는 관리되는 영업 장소와 즉시 연락 가능한 운영 담당자를 확보한다.
- 철회 가능한 사진은 물리 인쇄물을 기본값으로 사용하지 않는다. 장면 1·2 사진은 시작 참가자의 권한이 있는 개인 앨범에서만 유지한다.

## 7. 장면별 분 단위 운영 계약

### 7.1 장면 1 — 첫인상: 협력 보드게임, 5인, 150분

| 시간 | 현장 행동 | 앱 행동·서버 조건 |
|---|---|---|
| T-24시간 | 참석·장소 재확인 | `내일 참석 확인`; 참가자 본인 응답만 저장 |
| T-3시간 | 교통·준비물 확인 | `장소 보기`; 타인의 출발 상태 비공개 |
| T-20분 | 도착 창 개방 | `도착했어요`; 장면·시간·멤버십 재검증 |
| 0~10분 | 체크인·가명 좌석 | 계획 인원 5명 확인, 미충족 시 자동 시작 금지 |
| 10~25분 | 가명 소개·비밀 역할 확인 | 본인 역할만 1회 표시 |
| 25~65분 | 협력 게임 1부 | 앱 개입 없음 |
| 65~75분 | 휴식·질문 카드 | 안전 도움만 접근 가능 |
| 75~115분 | 협력 게임 2부 | 앱 개입 없음 |
| 115~130분 | 함께 웃었던 장면 회고 | 물리 카드 진행 |
| 130~140분 | 그룹 사진 | 피사체 목록만 만들고 즉시 공개 금지 |
| 140~150분 | 정리·체크아웃 | `오늘 장면 마치기` |
| 종료 후 60분 | 개인 성찰·계속 참여 | 0~1명 또는 보류, `계속/보류/중단`; 타인에게 미전달 |

비밀 역할은 기존 5종을 장면 단위로 중복 없이 사용한다. 역할 결과는 점수·보증금·최종 배정에 사용하지 않는다.

### 7.2 장면 2 — 발견: 공동 관찰 산책·카페, 5인, 105분

| 시간 | 현장 행동 | 앱 행동·서버 조건 |
|---|---|---|
| T-24시간 | 경로·신발·우천 대체 확인 | 참석 확인 |
| 0~10분 | 체크인·복귀 지점 확인 | 계획 인원 5명 확인 |
| 10~20분 | 전원 관찰 미션 설명 | 오늘 안내 한 장만 표시 |
| 20~35분 | 다섯 명 공동 발견 산책 | 앱 사용 없음 |
| 35~50분 | 2인·3인 이야기 정류장 1 | 앱 사용 없음 |
| 50~65분 | 팀을 바꾼 이야기 정류장 2 | 앱 사용 없음 |
| 65~75분 | 휴식·음료 | 안전 도움만 유지 |
| 75~95분 | 5인 카페 대화 | 물리 공통 카드 진행 |
| 95~100분 | 장면 사진 | 사후 동의 대기 |
| 100~105분 | 체크아웃 | `안전하게 마쳤어요` |
| 종료 후 60분 | 개인 메모·계속 참여 | 답장·편지함 없이 본인 기록만 저장 |

장면 2는 모든 이성 조합을 도는 장면이 아니다. 다섯 명이 한 무리로 움직이고 정류장에서 2인·3인 팀을 두 번 바꿔 모든 사람에게 발언 기회를 준다. 누구도 혼자 경로 큐나 대기 역할로 남기지 않는다. 전 이성 조합 대화는 여섯 명이 된 장면 3에서만 진행한다.

### 7.3 장면 3 — 움직임: 합류·걷기·가벼운 조깅, 6인, 165분

| 시간 | 현장 행동 | 앱 행동·서버 조건 |
|---|---|---|
| T-24시간 | 6인 확정·복장·기상·실내 대체 | 합류 참가자에게 장면 3 이후 자료만 개방 |
| T-3시간 | 컨디션과 걷기 선택 | `편하게 걷기`를 정상 선택으로 저장 |
| T-20분 | 도착 창 개방 | 타인의 이동·지각 사유 비공개 |
| 0~15분 | 6인 체크인 | 계획 인원 6명 확인 |
| 15~30분 | 동등한 소개·준비운동·안전선 | 특별 등장·경쟁 문구 금지 |
| 30~60분 | 라운드 1: 대화 이동 25분+공통 복귀 5분 | 시작 직전에 본인 상대·경로만 표시 |
| 60~70분 | 물·상태 확인 | `잠시 쉬기` 허용 |
| 70~100분 | 라운드 2: 대화 이동 25분+공통 복귀 5분 | 앱 사용 없음 |
| 100~110분 | 물·상태 확인 | 상태 이상 시 운영 보류 가능 |
| 110~140분 | 라운드 3: 대화 이동 25분+공통 복귀 5분 | 앱 사용 없음 |
| 140~150분 | 정리운동 | 속도·거리 결과 저장 금지 |
| 150~160분 | 6인 공동 회고·사진 | 피사체별 동의 대기 |
| 160~165분 | 체크아웃·귀가 안내 | `오늘 장면 마치기` |
| 종료 후 60분 | 개인 성찰·계속 참여 | 타인에게 미전달 |

3남 3녀 순환은 다음과 같다.

| 라운드 | 조합 |
|---|---|
| 1 | M1-F1, M2-F2, M3-F3 |
| 2 | M1-F2, M2-F3, M3-F1 |
| 3 | M1-F3, M2-F1, M3-F2 |

각 참가자는 모든 이성과 한 번씩 대화한다. 참가자 화면에는 전체 회전표를 보내지 않고 현재·다음 자기 배정만 보낸다. 속도는 각 조의 느린 사람을 기준으로 하며 걷기, 걷기·가벼운 달리기, 휴식은 모두 정상 선택이다.

### 7.4 장면 4 — 취향: 음식·디저트·공동 코스, 6인, 150분

| 시간 | 현장 행동 | 앱 행동·서버 조건 |
|---|---|---|
| T-24시간 | 실내 장소·메뉴·교통 확인 | 참석 확인 |
| 0~10분 | 체크인 | 계획 인원 6명 확인 |
| 10~25분 | 공동 메뉴·짧은 코스 선택 | 현장 토큰 사용, 앱 투표 없음 |
| 25~50분 | 공동 주문·식사·디저트 | 앱 사용 없음 |
| 50~65분 | 순환 대화 1 | 앱 사용 없음 |
| 65~70분 | 자리 교대 | 물리 번호표 사용 |
| 70~85분 | 순환 대화 2 | 앱 사용 없음 |
| 85~95분 | 휴식 | 도움 요청만 유지 |
| 95~110분 | 순환 대화 3 | 앱 사용 없음 |
| 110~130분 | 6인 공동 코스 미션 | 물리 카드 진행 |
| 130~140분 | 알게 된 취향 한 가지 회고 | 공개 호감 표현 금지 |
| 140~145분 | 사진 | 사후 동의 대기 |
| 145~150분 | 체크아웃 | `오늘 장면 마치기` |
| 종료 후 60분 | 마지막 장면 참여 확인 | `참여/운영 문의/중단`; 타인 집계 비공개 |

대화 순서는 호감 신호로 배정하지 않는다. 앞선 개인 기록은 본인에게 질문 준비용으로만 보이고 운영자·다른 참가자에게 배정 근거로 제공하지 않는다.

### 7.5 장면 5 — 선택: 회고·감사·공동 피날레, 6인, 150분

| 시간 | 현장 행동 | 앱 행동·서버 조건 |
|---|---|---|
| T-24시간 | 마지막 장소·귀가 안내 | 참석 확인 |
| 0~10분 | 체크인 | 계획 인원 6명 확인 |
| 10~25분 | 다섯 장면 상징 토큰과 장면 3~4 공동 기억 회고 | 합류 참가자에게 장면 1~2 사진·대화·참여 기록을 노출하지 않음 |
| 25~55분 | 6인 협력 피날레 | 앱 사용 없음 |
| 55~65분 | 휴식 | 안전 도움 유지 |
| 65~85분 | 다른 다섯 명에게 감사 카드 작성 | 모든 사람에게 한 장씩, 연애 선택과 분리 |
| 85~105분 | 받은 카드 조용히 읽기 | 공개 낭독 강요 금지 |
| 105~130분 | 식사·디저트 | 주류를 기본 콘텐츠로 사용하지 않음 |
| 130~140분 | 그룹 마무리 | 공개 고백·탈락·순위 없음 |
| 140~145분 | 마지막 사진 | 피사체별 동의 대기 |
| 145~150분 | 체크아웃·귀가 안내 | `시즌 마치기` |
| 종료 후 12시간 | 최종 선택·그룹 계속 참여 | 마감 전 본인만 수정 가능 |
| 다음 날 | 결과 | 상호 연결 또는 전원 동의 결과만 개인 공개 |

감사 카드는 오프라인에서 모든 참가자가 다른 다섯 명에게 작성한다. 로맨틱 선택은 현장에서 공개하지 않는다.

## 8. 비밀 역할 5인·6인 계약

역할은 장면별로 새로 배정하며 본인만 볼 수 있다.

| 역할 | 현장 미션 |
|---|---|
| 탐구자 | 사생활을 캐묻지 않는 열린 질문을 두 번 건넨다. |
| 리액터 | 상대의 말에 구체적이고 과장되지 않은 호응을 보낸다. |
| 세심한 관찰자 | 외모가 아닌 행동·배려·취향을 한 번 칭찬한다. |
| 대화의 다리 | 조용한 참가자가 선택적으로 참여할 수 있게 질문을 연결한다. |
| 페이스 메이커 | 쉬는 시점이나 다음 활동을 명령이 아닌 제안으로 알린다. |
| 장면 수집가 | 함께 웃거나 기억에 남은 순간 하나를 마지막 그룹 회고에서 꺼낸다. |

- 5인 장면은 앞의 5개 역할을 중복 없이 사용한다.
- 6인 장면은 6개 역할을 중복 없이 사용한다.
- 같은 사용자가 연속 장면에서 같은 역할을 받지 않도록 한다.
- 시작 전 부담이 있으면 한 번 교환할 수 있으나 다른 사람의 역할은 볼 수 없다.
- 역할 수행 여부는 평가·호감·보증금·출석 판정에 사용하지 않는다.

## 9. 계속 만남 계약

시즌 종료 후 두 종류의 계속 만남을 서로 분리한다.

### 9.0 장면 1~4의 계속 참여

- 본인 메모와 다음 장면 참여 의사는 다른 저장소와 API를 사용한다. 메모 원문은 본인만 읽고 운영 전이에 사용하지 않는다.
- 참여 의사는 `continue | hold | stop`으로 비공개 제출하며 고정 cutoff 전에는 본인의 제출 여부만 보인다.
- 한 명의 stop·hold·미응답 뒤 전체 종료, 잔여 인원 계속, 재편성 중 어느 정책을 적용할지는 이 문서가 임의로 자동화하지 않는다.
- cutoff 후 server-only seal 작업이 대상 참가자 snapshot과 응답 revision을 잠근다. 전원 continue가 아니면 자동으로 다음 장면을 열거나 취소하거나 대체 참가자를 모집하지 않고 `continuation_policy_hold`로 보낸다.
- 참가자 화면에는 정해진 batch 시각에 수와 당사자 없이 `다음 장면 일정을 확인하고 있어요`만 표시한다. 응답 직후 상태를 바꿔 마지막 응답자를 추론하게 하지 않는다.

### 9.1 두 사람의 다음 만남

1. 각 사용자는 0명 또는 1명을 비공개로 선택한다.
2. A가 B를 선택하고 B도 A를 선택한 경우에만 연결을 생성한다.
3. 일방 선택, 선택받은 수, 미선택, 보류는 누구에게도 공개하지 않는다.
4. 연결된 두 사람에게는 채팅을 먼저 열지 않고 `다음 오프라인 만남 잡기`를 보여준다.
5. 각자 가능한 시간 세 개와 활동 하나를 고른다.
6. 공통 시간이 생기면 한 번의 확인으로 약속을 확정한다.
7. 연락처·SNS 공개는 별도 상호 동의가 있을 때만 가능하다.

### 9.2 같은 그룹의 다음 시즌

1. 여섯 명은 로맨틱 선택과 별도로 `이 구성으로 한 번 더 만나기`에 비공개로 응답한다.
2. 장면 5 wrap 시점의 active participant 6명을 required snapshot으로 봉인한다.
3. 여섯 명 모두 deadline 안에 동의한 경우에만 deadline 후 같은 멤버의 다음 오프라인 콘텐츠 후보를 연다.
4. 다섯 명 이하가 동의했거나 미응답·철회가 있으면 수와 중단자를 공개하지 않고 동일한 일반 완료 결과를 반환한다. 실패를 조기 확정하거나 즉시 알리지 않는다.
5. 전원 동의가 성립해도 자동 결제하거나 날짜를 확정하지 않는다. 새 일정 묶음을 모두가 다시 확인한다.
6. 두 사람의 상호 선택과 그룹 재회는 서로 독립적이며 한쪽 결과로 다른 쪽 참여 여부를 추론할 수 없어야 한다.

### 9.3 다음 오프라인 약속 상태

다음 약속은 채팅이나 온라인 회차를 열지 않고 일정 제출·공통 후보·확정만 처리한다.

```text
collecting_availability
→ overlap_found
→ pending_confirmation
→ confirmed
→ completed

expired | withdrawn
```

- 상호 연결된 두 사람에게만 capability를 발급한다.
- 각자는 가능한 시간 최대 3개와 오프라인 활동 후보 1개를 비공개 제출한다.
- 서버는 상대의 원본 가능 시간을 보내지 않고 양쪽에 공통인 후보만 반환한다.
- 양쪽이 같은 후보를 확인하면 실제 장소·시각이 있는 오프라인 약속을 확정한다.
- 미응답·철회·공통 시간 없음·만료 사유는 상대에게 세분화하지 않는다.
- 그룹 전원 동의가 성립한 경우에는 6인 전용 일정 묶음을 만들고 여섯 명이 같은 revision을 다시 확인한다.
- 후속 약속도 프로그램 채팅, 온라인 세션, 자동 연락처 공개를 생성하지 않는다.

## 10. 앱 정보 구조와 라우트

기존 `/match`는 발견과 신청 진입점으로 유지할 수 있지만, 확정된 다회 프로그램은 단일 이벤트와 분리한다.

```text
/programs/quantum-five                 소개·모집
/programs/quantum-five/schedule        다섯 날짜 묶음 선택
/programs/[programId]                  현재 상태와 다음 행동
/programs/[programId]/arrive           출발·지각·도착·체크인
/programs/[programId]/actions/[key]    역할 확인·현장 다음 자리
/programs/[programId]/photos           사진별 동의·블러·삭제 요청
/programs/[programId]/safety           도움·신고·안전 이탈
/programs/[programId]/final            최종 선택·그룹 계속 참여
/program-connections/[connectionId]/availability  두 사람의 가능 시간·활동 제출
/program-connections/[connectionId]/confirm       공통 오프라인 후보 확정
/program-groups/[continuationId]/schedule          6인 다음 시즌 일정 묶음 확인
```

만들지 않는 프로그램 라우트:

```text
/programs/[programId]/chat
/programs/[programId]/lounge
/programs/[programId]/letters
/programs/[programId]/video
```

`programId`, `connectionId`, `continuationId`는 추측하기 어려운 opaque UUID이며 권한 검사를 대신하지 않는다.

- 프로그램 소개·일정·홈에서는 전역 하단 내비게이션을 유지한다.
- `/programs/[programId]/arrive`, `/actions/*`, `/photos`, `/safety`, `/final`과 후속 약속 제출·확정 화면에서는 하단 내비게이션을 숨긴다.
- 구현 시 `AppBottomNav.shouldHide`에 위 경로 allowlist를 정확히 추가하고 프로그램 홈은 숨기지 않는다.
- 홈은 기존 bottom-nav 공간을 사용하고 집중 화면은 safe-area 위 sticky CTA와 `뒤로`, `닫기`, `안전 도움`만 제공한다.

## 11. 화면 계약

| ID | 화면 | 사용자가 보는 것 | 주 CTA |
|---|---|---|---|
| QO-00 | 프로그램 소개 | 약 10일, 다섯 번 오프라인, 5명 시작·장면 3부터 6명 | `전체 일정 보기` |
| QO-01 | 일정 묶음 | 다섯 날짜·예비 날짜·장소 권역 | `이 일정으로 참여하기` |
| QO-02 | 신청 확인 | 오프라인 전용·합류 구조·안전·취소 규칙 | `내용 확인하고 신청` |
| QO-03 | 편성 중 | 익명 5좌석·확정 예상·신청 상태 | `내 신청 현황 보기` |
| QO-04 | 프로그램 홈 | 다음 오프라인 약속 하나와 진행 장면 | 서버 `next_action` |
| QO-05 | 장면 준비 | 시간·장소·준비물·실내 대체 | `참석 확인` |
| QO-06 | 출발 | 길찾기·집결점·지각 처리 | `길찾기 열기` |
| QO-07 | 도착 | 본인 도착·체크인 | `도착했어요` |
| QO-08 | 역할 | 본인 역할과 한 줄 미션 | `역할 확인` |
| QO-09 | 다음 자리 | 현재 상대·경로·복귀점 | `확인하고 휴대폰 넣기` |
| QO-10 | 안전 | 쉬기·도움·신고·안전 이탈 | 선택한 보호 행동 |
| QO-11 | 사진 동의 | 사진 미리보기·보관·블러·삭제 | `내 선택 저장` |
| QO-12 | 체크아웃 | 공식 종료·귀가 안내 | `오늘 장면 마치기` |
| QO-13 | 장면 사이 | 다음 오프라인 날짜·변경 유무만 | `다음 일정 확인` |
| QO-14 | 합류자 온보딩 | 과거 비공개·장면 3부터 동등한 권리 | `참여 범위 확인` |
| QO-15 | 개인 성찰 | 본인만 보는 짧은 기록·계속 참여 | `내 응답 저장` |
| QO-16 | 최종 선택 | `connect`, `finish`, `hold`; connect일 때만 0~1명 | `선택 봉인` |
| QO-17 | 결과 | 상호 연결·그룹 재회·일반 완료 중 허용된 결과만 | 상태별 주 CTA 하나 |
| QO-18 | 시즌 기록 | 권한 있는 동의 사진·안전한 가명·장면 요약 | `기록 보기` |
| QO-19 | 두 사람 가능 시간 | 시간 최대 3개·활동 1개 | `가능 시간 보내기` |
| QO-20 | 공통 후보 확정 | 원본 시간 대신 공통 후보 하나 | `이 일정으로 만나기` |
| QO-21 | 그룹 다음 일정 | 전원 동의 그룹의 새 일정 묶음 | `이 일정으로 참여하기` |

모든 화면은 로딩, 빈 상태, 아직 개방 전, 제출 중, 제출 완료, 네트워크 실패, 권한 없음, 일정 변경, 운영 보류, 안전 보류를 구별한다. 실패 시 이전 장면의 오래된 CTA를 보여주지 않는다.

QO-17의 주 CTA는 결과별로 하나만 정한다.

- 상호 연결: `다음 오프라인 만남 잡기`
- 상호 연결은 없고 그룹 재회만 성립: `다음 그룹 일정 보기`
- 둘 다 성립: 먼저 `다음 오프라인 만남 잡기`, 그룹 일정은 QO-18의 보조 정보로 제공
- 둘 다 없음: `시즌 기록 보기`

### 11.1 화면·라우트·서버 상태 매핑

| 화면 | route | 서버 상태·행동 |
|---|---|---|
| QO-03 편성 중 | `/programs/[programId]` | `program.status=forming` |
| QO-04 홈 | `/programs/[programId]` | safe `next_action` selector |
| QO-05 준비 | `/programs/[programId]` | `scene=scheduled` 또는 `ready`, `attendance_commitment` |
| QO-06·07 출발·도착 | `/programs/[programId]/arrive` | `next_action`은 `depart`, `arrive`, `check_in` 중 하나 |
| QO-08·09 역할·자리 | `/programs/[programId]/actions/[key]` | `[key]`는 서버 allowlist `role`, `rotation`만 허용 |
| QO-10 안전 | `/programs/[programId]/safety` | 모든 장면에서 별도 보호 capability |
| QO-11 사진 | `/programs/[programId]/photos` | 호출자 본인의 consent action |
| QO-12 체크아웃 | `/programs/[programId]/arrive` | `next_action`은 `check_out` 또는 `return_check` |
| QO-13 장면 사이 | `/programs/[programId]` | 다음 scene schedule만 표시 |
| QO-14 합류 온보딩 | `/programs/[programId]` | joiner 본인·Scene3 disclosure 전용 변형 |
| QO-15 성찰 | `/programs/[programId]` | reflection과 continuation을 분리 제출 |
| QO-16 최종 | `/programs/[programId]/final` | final window·seal 전 본인 revision |
| QO-17·18 결과·기록 | `/programs/[programId]` | sealed result capability에 따른 변형 |
| QO-19·20 두 사람 후속 | `/program-connections/[connectionId]/*` | mutual capability만 허용 |
| QO-21 그룹 후속 | `/program-groups/[continuationId]/schedule` | sealed unanimous capability만 허용 |

`actions/[key]`가 오래됐거나 시간·version이 맞지 않으면 존재 정보를 세분화하지 않고 최신 safe `next_action`으로 복귀시킨다. starter에게는 Scene3 disclosure 전 합류자의 alias·seat·card를 보내지 않고 형식상 정원 구조만 안내한다. 합류자는 QO-14 확인 전 Scene3 좌석·action에 접근할 수 없다.

## 12. 시각 디자인 계약

### 12.1 공통

- 현재 `boot-*` Peach Air 토큰을 기본으로 사용한다.
- 캔버스 `#FFF9F6`, 기본 표면 흰색, 주요 행동 `#B94B3F`, 잉크 `#292321`, 경계 `#EAD9D2`를 유지한다.
- 장면별 보조색은 아이콘·얇은 띠·진행점에만 사용하고 전체 화면을 다른 색으로 덮지 않는다.
- 한 화면에는 강조 CTA 하나만 둔다. 안전 도움은 경쟁 CTA가 아니라 항상 접근 가능한 보호 행동이다.
- 날짜보다 `첫 번째 장면 1/5`처럼 장면 진행을 우선 표시한다.
- 6번째 참가자를 실루엣, 스포트라이트, 여성 전용 색, 외모 이미지로 강조하지 않는다.
- 사람 중심 이미지는 대학생들이 실제로 함께 활동하는 장면을 사용하고 캠퍼스 건물 사진만 단독으로 사용하지 않는다.

### 12.2 좌석과 반응형

- 360×800: 6좌석은 3×2, 각 좌석 터치 영역 최소 44×44px, 가로 스크롤 0건
- 390×844: 헤더→현재 상태→주 CTA 순서, sticky CTA가 키보드·safe area와 겹치지 않음
- 430px: 긴 장소명·귀가 안내·사진 미리보기 비율 유지
- 1440×900: 임무·도착·선택 화면은 최대 640px 중앙, 일정·사진만 2열 허용
- 현장 모달은 ESC, 바깥 클릭, 포커스 복귀를 지원한다.
- 잠금·도착·사진 동의·오류는 색상만으로 표현하지 않는다.
- reduced motion과 스크린리더 상태 알림을 지원한다.
- `next_action.disabledReason`과 일정·안전 보류는 `aria-live` 상태 문구로 읽어준다.

기존 5열 좌석을 CSS만 `grid-cols-6`으로 바꾸는 것은 금지한다. 새 화면은 서버의 `starter|scene3_joiner`, `active_from_scene`, 안전한 가명 모델만 렌더링한다.

좌석 변화는 다음처럼 고정한다.

- 장면 1~2: 5좌석을 모바일에서 3+2 중앙 정렬로 표시하고 빈 여섯 번째 좌석·성별·실루엣을 렌더링하지 않는다.
- 장면 3 disclosure 전 starter: `다음 장면부터 한 분이 합류해요`라는 구조 문구만 표시하고 alias·card·seat는 보내지 않는다.
- 장면 3 합류자: QO-14 참여 범위 확인과 accepted gate 전 좌석·역할·장소 세부정보 접근을 차단한다.
- 장면 3 disclosure 후: 6좌석을 3×2로 같은 크기·같은 위계로 표시한다. 합류 확인이 끝난 뒤 전용 배지를 제거한다.
- 데스크톱 6좌석 한 행에서도 성별·가입 시점·인기처럼 보이는 고정 순서를 만들지 않는다.

## 13. 사용자 문구 계약

### 소개

`앱에서 대화하는 프로그램이 아니에요. 약 10일 동안 다섯 번 실제로 만나요.`

### 합류 구조 사전고지

`첫 두 장면은 3남 2녀로 시작해요. 세 번째 장면부터 참가자 한 분이 합류하고, 이후에는 여섯 명이 같은 규칙과 권리로 마지막까지 함께해요.`

### 합류 참가자 안내

`이미 두 장면을 함께한 다섯 명에게 합류합니다. 이전 신호·사진·참여 기록은 보이지 않으며, 세 번째 장면부터 다른 참가자와 같은 권리로 참여해요.`

### 현장

`휴대폰은 넣어두셔도 돼요. 다음 내용은 현장 카드가 이어갑니다.`

### 장소 변경

`오늘 장면은 같은 시간, 안내된 실내 장소로 바뀌었어요.`

### 운영 보류

`다음 장면 일정을 확인하고 있어요. 개인 사유는 공유하지 않아요.`

### 상호 연결 없음

`이번 시즌을 안전하게 마쳤어요. 함께한 장면은 내 기록에서 확인할 수 있어요.`

금지 표현: `메기`, `경쟁자`, `판을 흔들 사람`, `깜짝 투입`, `탈락`, `0표`, `선택받지 못함`, `인기 순위`.

## 14. 서버 상태 모델

한 개의 거대한 상태 enum으로 모든 상황을 표현하지 않는다. 다음 축을 독립적으로 저장한다.

### 14.1 프로그램 상태

```text
forming | confirmed | active | completed | cancelled
```

### 14.2 장면 진행 상태

`scene_phase`는 오래 유지되는 milestone만 저장한다.

```text
scheduled → ready → live → wrapped → closed
```

출발, 도착, 체크인, 체크아웃, 귀가 확인, 사후 입력은 phase가 아니라 장면별 절대 `opens_at`, `closes_at`을 가진 독립 action window다. 귀가 확인과 사후 비공개 입력은 병렬 창이며 어느 한쪽 제출이 다른 쪽의 전제조건이 아니다. scheduler가 알림을 놓쳐도 서버 시간이 window 안이면 API는 정상 동작한다.

### 14.3 운영 차단과 일정 변경 이력

현재 행동을 막는 상태와 과거에 장소·일정이 바뀐 사실을 한 enum에 섞지 않는다.

```text
blocking_status:
none | weather_hold | attendance_hold | safety_hold
| continuation_policy_hold | reschedule_review

scene_outcome:
pending | completed | aborted | cancelled
```

`weather_watch`, `relocated`, `rescheduled`는 immutable schedule revision event의 `change_kind`다. 변경을 확인한 뒤 `blocking_status=none`으로 돌아가도 revision과 ack 이력은 남는다. `aborted|cancelled` 이후 phase, 회전, 사진 공개, 비공개 입력 전이는 영구 거절한다. action allow 함수는 phase, blocking status, outcome, 현재 schedule revision, 서버 시간을 모두 검사한다.

### 14.4 개인 출석 상태

```text
expected | departed | delayed | arrived | checked_in | left_venue
| home_safe | needs_help | excused | absent_under_review
```

checkin 마감 전 지각은 개인 `delayed`로만 저장한다. 마감 시 계획 인원이 충족되지 않으면 장면을 `ready`로 전환하지 않고 `attendance_hold`에서 예비 일정 검토로 보낸다. 이미 전원이 체크인해 `live`가 된 뒤 한 명이 안전 이탈하면 phase를 되돌리지 않고 운영 검토로 전환한다. 귀가 확인 미응답은 전체 장면 완료를 되돌리지 않는다. `home_safe`는 선택형이며 이를 눌러야 최종 선택을 하게 묶지 않는다.

### 14.5 회전 상태

```text
planned | live | completed | skipped | degraded_review
```

결원 시 감정 기록이나 호감도를 이용해 자동 재배정하지 않고 운영 검토로 전환한다.

## 15. 데이터 모델 후보

구현 계획에서 현재 migration ledger와 이름 충돌을 다시 확인한 뒤 실제 이름을 확정한다.

| 개념 | 책임 |
|---|---|
| `guided_program_runs` | 프로그램 상태, 현재 장면, timezone, version |
| `guided_program_participants` | 시작/합류 구분, `active_from_scene`, 동의·철회 |
| `guided_program_scenes` | 절대 시각, current schedule revision, 기본·실내 장소, phase·block·outcome |
| `guided_program_schedule_revisions` | 장소·시각 변경의 immutable revision과 change kind |
| `guided_program_action_windows` | 출발·도착·체크인·귀가·사후 입력의 독립 시간창 |
| `guided_program_attendance_commitments` | 장면·참가자·revision별 참석 확인 |
| `guided_program_scene_presence` | 사용자별 현재 출석 상태 |
| `guided_program_presence_events` | 출발·도착·귀가의 append-only 감사 기록 |
| `guided_program_scene_transitions` | 운영자 상태 전이 감사 기록 |
| `guided_program_rotation_rounds` | 장면별 회전 시각과 상태 |
| `guided_program_rotation_assignments` | 개인별 상대·장소, 서버 전용 전체표 |
| `guided_program_role_assignments` | 장면별 본인 역할, one-time swap version |
| `guided_program_private_reflections` | 장면 1~4 본인 전용 메모만 저장 |
| `guided_program_scene_continuation_choices` | 장면별 `continue`, `hold`, `stop`, cutoff 후 seal |
| `guided_program_final_choices` | `connect`, `finish`, `hold`, target·revision·seal snapshot |
| `guided_program_group_continuations` | 같은 그룹 다음 시즌 비공개 의사 |
| `guided_program_mutual_connections` | 상호 선택이 성립한 연결만 저장 |
| `guided_program_followup_runs` | 두 사람·그룹의 다음 오프라인 약속 상태와 만료 |
| `guided_program_followup_availability` | 제출자별 가능 시간 최대 3개, 상대 원본 비공개 |
| `guided_program_followup_activity_choices` | 제출자별 오프라인 활동 후보 |
| `guided_program_followup_confirmations` | 공통 후보의 최종 양측·전원 확인 |
| `guided_program_scene_photos` | 장면과 사진 상태, raw path 비공개 |
| `guided_program_photo_subjects` | 사진 속 참가자 목록 |
| `guided_program_photo_consents` | 보관·블러·거절·철회 revision |
| `guided_program_safety_reports` | 비공개 안전 신고·안전 이탈 |
| `guided_program_no_show_reviews` | 장면별 운영 검토, 금전 처리와 분리 |
| `guided_program_notification_outbox` | 중복 방지·lease·retry·일정 revision |
| `guided_program_operator_grants` | run·역할·유효기간이 있는 server-only 운영 권한 |
| `guided_program_idempotency_records` | request hash와 canonical response 재생 |

프로그램 행동을 하나의 범용 `actions` 테이블이나 switch API에 모두 넣지 않는다. 출석, 안전, 사진, 비공개 선택은 권한과 실패 처리 방식이 달라 별도 경계를 가진다.

필수 DB 제약:

- `scene_number BETWEEN 1 AND 5`, `(run_id, scene_number)` unique
- 시작 참가자 5명은 `entry_kind=starter`, `active_from_scene=1`; 합류자 1명은 `entry_kind=scene3_joiner`, `active_from_scene=3`
- 사용자당 active guided program 최대 1개
- `(scene_id, participant_id)` presence·attendance commitment unique
- `(scene_id, participant_id)`와 `(scene_id, role_key)` active role assignment unique
- `(scene_id, round_number, participant_id)` rotation assignment unique
- final choice는 `(run_id, chooser_id)` unique, self-choice 금지, `decision_type=connect`일 때만 target 필수
- mutual connection은 canonical ordered pair unique
- follow-up availability는 actor별 최대 3개, confirmation은 candidate·actor unique
- idempotency는 `(actor_id, action_kind, resource_id, idempotency_key)` unique

## 16. API 계약 후보

### 16.1 참가자 API

```text
GET  /api/guided-programs/current
POST /api/guided-programs/[id]/schedule-ack
POST /api/guided-programs/[id]/scenes/[sceneId]/attendance-commitment
POST /api/guided-programs/[id]/scenes/[sceneId]/presence
POST /api/guided-programs/[id]/scenes/[sceneId]/check-in
GET  /api/guided-programs/[id]/scenes/[sceneId]/rotation/current
POST /api/guided-programs/[id]/scenes/[sceneId]/safety-reports
POST /api/guided-programs/[id]/scenes/[sceneId]/private-reflection
POST /api/guided-programs/[id]/scenes/[sceneId]/continuation-choice
POST /api/guided-programs/[id]/photos/upload-ticket
POST /api/guided-programs/[id]/photos/[photoId]/consent
POST /api/guided-programs/[id]/final-choice
POST /api/guided-programs/[id]/group-continuation
GET  /api/program-connections/[connectionId]/follow-up
POST /api/program-connections/[connectionId]/availability
POST /api/program-connections/[connectionId]/confirm
GET  /api/program-groups/[continuationId]/schedule
POST /api/program-groups/[continuationId]/schedule-ack
```

### 16.2 운영자·내부 API

```text
POST /api/internal/guided-programs/[id]/scenes/[sceneId]/transition
POST /api/internal/guided-programs/[id]/scenes/[sceneId]/weather
POST /api/internal/guided-programs/[id]/scenes/[sceneId]/safety
POST /api/internal/guided-programs/[id]/scenes/[sceneId]/rotation
POST /api/internal/guided-programs/[id]/no-show-reviews/[reviewId]/resolve
POST /api/internal/guided-programs/[id]/seal-continuations
POST /api/internal/guided-programs/[id]/seal-final-choices
POST /api/internal/guided-programs/notifications/dispatch
```

운영 API는 server-only `guided_program_operator_grants(user_id, run_id, role, active_from, active_until)`를 매 요청 확인한다. 사용자가 수정할 수 있는 metadata를 권한 근거로 사용하지 않는다. 쿠키 인증 mutation은 Origin·CSRF 검증과 최근 재인증을 요구한다. client가 임의 target state를 보내지 않고 서버가 `(current_phase, action, blocking_status)` allowlist로 다음 상태를 계산한다. schedule, safety, no-show, rotation, raw safety report 열람 권한을 분리하고 break-glass 열람은 별도 감사 대상이다. notification dispatch는 일반 운영자 세션이 아니라 server-only worker credential만 호출한다. 서비스 키를 브라우저나 일반 참가자 API에 노출하지 않는다.

### 16.3 대표 조회 응답

`GET current`는 다음 안전한 범위만 반환한다.

```text
program: id, displayName, status, displayProgress, version
currentScene: number, title, startsAt, endsAt, areaLabel, exactVenueIfAllowed, currentScheduleRevision, operationNotice
myParticipation: alias, entryKind, dataAccessStartsAtScene, presenceStatus, myAttendanceCommitment
safeSeats: alias, seatLabel, activeFromScene, safeCardSummary
nextAction: key, label, href, opensAt, closesAt, disabledReason
photoSummary: myPhotoConsentsPending, publishableToMeCount
resultSummary: finalSealed, myFinalSubmitted, sealedCapabilitiesOnly
```

금지 응답:

- 다른 사용자의 내부 ID, 실명, 연락처, 학과, 사진 원본 경로
- 다른 사람의 출발·귀가 시각과 지각·불참 사유
- 타인의 비밀 역할
- 신호·계속 참여·최종 선택의 대상, 수, 미응답자
- 전체 회전 배정표
- 신고자와 신고 사유
- 합류 참가자가 접근할 수 없는 장면 1~2 resource의 row 존재, ID, 시각, 참가·출석 집계, 사진·성찰·동의 상태, signed URL

합류 참가자는 프로그램 형식상 장면 1·2가 있었다는 설명과 `3/5` 같은 제품 진행 표시는 볼 수 있다. 실제 장면 1·2 resource는 응답하지 않는다. `GET current`, rotation, photo, result, follow-up 응답은 `Cache-Control: private, no-store`를 사용하고 인증 방식에 맞게 `Vary`를 설정한다. exact venue는 active participant, 현재 revision, disclosure time을 모두 만족할 때만 반환하고 그 전에는 권역만 보인다.

## 17. 권한·개인정보 불변조건

- 모든 write는 `auth.uid`, program membership, scene scope, deadline, `idempotency_key`, `expected_version`, 서버 시간을 다시 검증한다.
- 일반 클라이언트의 직접 테이블 DML은 허용하지 않고 서버 API 또는 제한된 RPC만 사용한다.
- SECURITY DEFINER 함수는 생성 즉시 PUBLIC·anon·authenticated의 기본 EXECUTE를 revoke하고 필요한 server signature만 grant하며 `search_path=''`와 고정 schema qualification을 사용한다.
- 합류 참가자는 `resource.scene_number >= active_from_scene`인 자료만 읽고 쓸 수 있다.
- 시작 참가자는 장면 1~2 입력에서 아직 합류하지 않은 참가자를 대상으로 지정할 수 없다.
- 다른 run, 탈퇴자, outsider의 list·read·write·signed URL 접근을 차단한다.
- private reflection은 소유자만 다시 볼 수 있고 운영 도구에서도 원문 열람을 기본 제공하지 않는다.
- final choice는 마감 전 본인만 수정하고 seal 후 상호 edge만 물질화한다.
- 전화번호·SNS·학과·사진은 연결 성립 이후에도 별도 상호 공개 동의 없이는 열지 않는다.
- 로그에는 private target, 사진 raw path, signed URL, 신고 원문을 남기지 않는다.

### 17.1 자원 범위

- 모든 자원은 `scope_kind = program_global | scene_scoped | participant_private`를 가진다. scene-scoped 자원은 `scene_number`가 필수다.
- 합류 참가자는 자기 participant row와 장면 3 이후의 허용된 future schedule만 global allowlist로 읽는다. scene resource는 `scene_number >= active_from_scene`과 당시 참가 상태를 모두 만족해야 한다.
- list와 sign endpoint는 같은 authorization helper를 사용하며 Storage 직접 SELECT는 허용하지 않는다.
- 파생 집계는 호출자에게 허용된 row만 입력으로 사용한다. 장면 1·2 실제 row의 존재에 따라 joiner 응답 shape, count, ETag, timing class가 달라지지 않는다.
- Scene3 disclosure 전 starter 응답에는 joiner alias·card·seat를 넣지 않고 정원 구조만 일반 문구로 알린다. joiner accept와 disclosure gate 이후 여섯 번째 safe seat를 같은 transaction에서 materialize한다.
- 일반 프로그램 자원은 철회 즉시 차단하되, 사건 당시 참여자는 정해진 안전 신고 보존기간 동안 safety report 생성과 자기 신고 상태 확인만 할 수 있다.

### 17.2 CAS와 멱등성

- 상태 변경 RPC는 `run → scene → current schedule revision` 순으로 row lock을 획득하고 `UPDATE ... WHERE id=? AND version=?` CAS를 수행한다.
- phase, blocking status, outcome, transition audit, superseded outbox 취소, 새 outbox 생성을 한 transaction에서 확정한다.
- presence, 사진 동의, reflection, continuation, final, follow-up은 global run version이 아니라 해당 resource version을 사용한다.
- 멱등 키는 `(actor_id, action_kind, resource_id, idempotency_key)` unique이며 request hash와 canonical safe response를 저장한다.
- 같은 key와 같은 body는 저장된 응답을 반환한다. 같은 key와 다른 body는 409 `idempotency_conflict`, version CAS 0-row는 409 `stale_state`와 최신 safe DTO를 반환한다.
- safety hold와 start, wrap과 private window, final seal과 수정, 일정 revision과 check-in이 동시에 실행돼도 한쪽만 유효해야 한다.

### 17.3 역할·회전 원자성

- 역할 생성은 장면 composition snapshot을 lock한 transaction에서 수행한다.
- `(scene_id, participant_id)`와 `(scene_id, role_key)` active unique를 DB가 보장한다.
- 역할 교환은 본인 assignment version과 `swap_used=false` CAS로 한 번만 허용하며 다른 역할의 가용 수를 응답하지 않는다.
- rotation advance는 scene version, current round, blocking status를 검사하고 transition·개인 next assignment·outbox를 같은 transaction에 기록한다.
- rotation 조회는 본인의 current·next alias와 seat token만 반환하고 상대 internal ID, 전체 round map, 미배정 사유를 반환하지 않는다.

### 17.4 continuation과 final 봉인

- 장면 continuation cutoff 전에는 `mySubmitted`만 반환하고 count, allResponded, pendingCount, lastResponder, choice timestamp를 반환하지 않는다.
- cutoff 후 server-only seal이 eligible participant snapshot과 choice revision을 고정한다. hold·stop·미응답은 같은 batch 시각에 일반 `continuation_policy_hold`로만 나타난다.
- final row는 `decision_type = connect | finish | hold`이며 connect일 때만 target이 필수다. hold는 final deadline까지만 유지하고 seal 시 일반 비연결 완료로 처리한다.
- `seal_final_choices(run_id)`는 deadline 후 run과 choice row를 lock하고 `sealed_at`과 choice revision snapshot을 한 transaction에 고정한 뒤 reciprocal pair만 materialize한다.
- seal 이후 수정은 409 `final_sealed`; seal 전 result는 `sealed=false`와 본인 제출 여부만 반환한다.
- mutual edge는 canonical ordered pair unique다. seal 후에도 일방 선택과 비연결은 모두 같은 일반 완료 응답이다.
- 그룹 continuation도 Scene5 wrap의 required 6명 snapshot을 사용해 deadline 후 seal한다. 전원 yes일 때만 capability를 발급하고 그 외 결과는 같은 일반 완료 응답이다.

### 17.5 오류·열거 방지와 감사 로그

- scene-scoped private API의 unauthorized resource와 nonexistent resource는 동일 status, body shape, timing budget을 사용한다. signed URL endpoint도 같다.
- 409는 인증된 소유자의 stale version, sealed state, idempotency conflict에만 사용한다.
- transition audit는 actor, action, old/new safe state, schedule revision, timestamp, correlation ID만 기록한다.
- audit에 private target, free text, raw path, signed URL, QR nonce를 넣지 않는다.
- push 잠금화면 본문은 `새 안내가 도착했어요`처럼 일반 문구만 사용하고 final, mutual, safety, 귀가 상태, alias, 상세 주소는 인증된 deep link에서 조회한다.

### 17.6 보존·삭제

- presence event, operator audit, safety report는 운영·안전 보존기간을 별도 정책 문서에서 승인하기 전 production 저장을 열지 않는다.
- private reflection과 non-mutual choice는 시즌 종료 후 사용자 삭제 요청 또는 승인된 짧은 보존기간에 따라 제거한다.
- mutual connection에 필요한 최소 edge는 연결이 유지되는 동안 보존하고 어느 한쪽이 연결을 종료하면 후속 일정 capability를 폐기한다.
- 사진 source, derived rendition, consent, revoke는 같은 보존정책과 legal/safety hold 상태를 명시적으로 갖는다.
- 보존기간이 확정되지 않은 상태는 구현 코드 작성은 가능해도 production 출시 RED로 둔다.

## 18. 사진 동의 계약

출석 증거와 추억 앨범을 분리한다.

1. 사진 업로드 시 장면, 촬영자, source hash, rendition version, subject set version을 기록한다.
2. 그룹 사진의 required subject set은 uploader 입력이 아니라 해당 장면의 checked-in participant snapshot으로 서버가 만든다.
3. 일부 인물만 나온 사진은 uploader가 후보를 제시하되 각 후보가 본인 포함 여부를 확인하고 운영자가 누락을 검토하기 전 publish할 수 없다.
4. 각 피사체는 `pending | granted | blur_requested | declined | revoked` 중 하나를 가진다.
5. consent는 `(photo_id, subject_id, source_hash, rendition_version, subject_set_version)`에 묶는다. source·subject set·rendition이 바뀌면 기존 consent를 무효화한다.
6. blur 요청 시 새 derived rendition을 만들고 영향을 받는 피사체가 그 exact rendition을 다시 확인한 경우에만 공개 가능하다.
7. 한 명이라도 거절·철회하면 photo를 blocked로 전환하고 새 signed URL을 발급하지 않는다. derived object key는 폐기하거나 새 key로 교체한다.
8. signed URL은 60~300초로 제한하고 raw storage path를 응답하지 않는다. 이미 발급된 URL은 TTL 동안 잔존할 수 있으므로 철회 효력은 최대 TTL 이내라고 명시한다. 더 빠른 철회가 필요하면 매 요청 consent를 재검증하는 인증 media proxy를 사용한다.
9. 합류 참가자는 장면 1~2 사진 목록과 URL을 받을 수 없다. 장면 1~2 사진을 6인 공동 현장 키트로 인쇄하지 않는다.
10. `GET current`는 타인의 대기 수를 추론할 수 있는 전체 count 대신 `myPhotoConsentsPending`만 반환한다.
11. 삭제·블러 요청은 인기·출석·보증금에 영향을 주지 않는다.
12. 운영 증거가 필요한 사진은 소셜 앨범과 다른 제한 저장소와 보존정책을 사용한다.

## 19. 날씨·노쇼·안전 계약

### 19.1 날씨

- 장면 2·3은 기본 장소와 실내 예비 장소를 함께 확보한다.
- D-1 저녁 1차 판단, T-3시간 최종 장소 확정을 기본으로 한다.
- `weather_hold` 동안 출발 clock, 시작, 회전, 노쇼 판정, 사후 입력을 정지한다.
- 장소 변경·일정 이동은 새 immutable schedule revision을 만들고 이전 알림 예약을 무효화한다.
- revision 생성 transaction에서 이전 revision을 `superseded_at` 처리하고 관련 outbox를 `cancelled`로 바꾼 뒤 새 outbox를 만든다.
- `schedule-ack`는 `(participant_id, scene_id, revision)` unique이며 이전 revision 확인을 최신 확인으로 인정하지 않는다. 미확인은 노쇼가 아니다.
- 우천 시 같은 회전표를 실내 테이블 순환으로 옮기며 다른 장면과 합치지 않는다.
- 예비 날짜를 사용한 뒤 두 번째 변경이 필요하면 `reschedule_review`에서 새 일정 묶음을 다시 확인하고 자동 취소·자동 과금하지 않는다.

### 19.2 노쇼

- T-24시간 참석 확인은 `scene_attendance_commitments`에 본인 전용으로 저장하고 미확인은 운영자 개인 확인 대상으로 보낸다.
- T-3시간에도 미확인이면 예비 일정 준비 상태로 둔다.
- 시작 후 15분까지 계획 인원이 체크인하지 않으면 공식 장면을 자동 개방하지 않는다.
- 당일 대체 참가자를 투입하지 않는다.
- 체크인 누락만으로 퇴출·보증금 몰수·자동 교체하지 않고 `absent_under_review`만 만든다. joiner를 포함한 계획 인원 미충족은 자동 축소 운영이 아니라 `attendance_hold`와 예비 일정 검토로 통일한다.
- 날씨·안전·운영 취소 장면에서는 노쇼 검토를 생성하지 않는다.
- 반복 노쇼나 완전 중단은 `attendance_hold`에서 운영자가 판단하며 그룹에는 개인 사유와 불이익을 공개하지 않는다.
- no-show review는 `(scene_id, participant_id)` unique이며 정상 scene outcome, blocking 없음, grace 종료, 당시 attendance commitment·presence·safety evidence snapshot을 남긴다. no-show row는 payment·refund·friendship을 trigger로 변경하지 않는다.

### 19.3 안전

- 공개 영업 장소 또는 관리되는 공공 공간만 기본 장소로 사용한다.
- 개인 집, 숙박 공간, 참가자 차량, 외진 산책로는 제외한다.
- 장면 2·3에는 비공개로 연락 가능한 운영 담당자 한 명을 둔다.
- 안전 신고는 모든 장면 상태에서 가능하고 신고자와 사유를 그룹에 공개하지 않는다.
- `safety_hold`에서는 시작·회전·사후 선택을 차단하고 운영자가 재개·이동·중단을 결정한다.
- 안전 이탈은 노쇼나 관계 거절로 처리하지 않고 자동 금전 불이익을 주지 않는다.
- 연속 위치를 수집하지 않는다. 체크인 nonce는 128-bit 이상 무작위 값으로 scene, schedule revision, 인증 사용자 또는 현장 operator challenge, 짧은 expiry에 묶고 single-use hash만 저장한다. client captured time이나 GPS를 증거 원본으로 신뢰하지 않는다.

## 20. 알림 계약

알림은 사용자를 앱에 재방문시키기 위한 콘텐츠가 아니라 오프라인 약속을 놓치지 않게 하는 운영 도구다.

| 시점 | 알림 | 주 행동 |
|---|---|---|
| 전체 일정 확정 | 다섯 날짜와 예비 날짜 | `전체 일정 확인` |
| T-24시간 | 참석·준비물·날씨 | `참석 확인` |
| T-3시간 | 최종 장소·교통 | `장소 보기` |
| T-20분 | 체크인 가능 | `도착 알리기` |
| 장소 revision 발생 | 같은 시간 새 장소 또는 새 일정 | `변경 확인` |
| 장면 종료 | 사진 동의·개인 기록 개방 | `오늘 장면 마치기` |
| 귀가 확인 미응답 60분 | 선택형 안전 확인 1회 | `귀가했어요` 또는 `도움 필요` |
| 최종 결과 | 개인 결과 | `결과 확인` |

- `run_id + scene_id + event_key + recipient_id + schedule_revision`을 중복 방지 키로 사용한다.
- 푸시 실패가 프로그램 상태 전이를 되돌리지 않는다.
- 장면 사이에는 온라인 대화·일일 미션 알림을 보내지 않는다.
- 오래된 일정 revision의 알림을 발송하지 않는다.
- dispatcher의 select와 claim은 `outbox.schedule_revision = scene.current_schedule_revision`, `not_before <= now`, `cancelled_at is null`, blocking·outcome 정책을 재검증한다. claim 후 실제 발송 직전에도 current revision을 한 번 더 확인한다.
- worker lease가 만료되면 재수집할 수 있고 반복 실패는 dead-letter로 보내되 프로그램 상태를 되돌리지 않는다.
- 잠금화면 push는 `새 안내가 도착했어요` 같은 일반 문구만 사용한다. final, mutual, safety, 귀가 상태, 상대 alias, 상세 장소는 payload에 넣지 않고 인증된 deep link에서 조회한다.

## 21. 오류 처리

| 상황 | 사용자 화면 | 서버 처리 |
|---|---|---|
| 네트워크 실패 | 현재 안전 정보 유지, 저장 여부 확인 후 재시도 | 동일 idempotency key로 중복 방지 |
| 오래된 일정 | `일정이 바뀌었어요` | stale revision 거절 후 최신 DTO 반환 |
| 아직 시간 전 | 정확한 개방 시각 표시 | 클라이언트 clock 무시 |
| 지각 | 다른 사람에게 사유 비공개 | 본인 presence만 `delayed` |
| 계획 인원 미충족 | `시작을 확인하고 있어요` | attendance hold, 자동 시작 금지 |
| 합류자 불참 | 당일 대체 없음·예비 일정 확인 중 | attendance hold, 자동 5인 진행 금지 |
| 날씨 변경 | 같은 시간 새 장소 한 번 확인 | 새 schedule revision·outbox 교체 |
| 안전 신고 | 일반 안전 보류 안내 | reporter 비공개, operator action 필요 |
| 사진 철회 | 이후 앨범 접근 중단 | 새 signed URL 발급 금지 |
| 일방 최종 선택 | 안전한 시즌 종료 | mutual edge 0, target 누출 0 |
| 그룹 계속 참여 미성립 | 안전한 시즌 종료 | 동의 수·중단자 누출 0 |
| 후속 공통 시간 없음 | 다른 시간 묶음 확인 또는 안전한 만료 | 상대 원본 시간·미응답 사유 비공개 |
| 후속 일정 한쪽 철회 | 일반 일정 종료 | 철회자·사유를 세분화하지 않고 capability 폐기 |

## 22. 검증 계약

### 22.1 계정 구성

최소 8계정으로 검증한다.

- 시작 참가자 5명: M1, M2, M3, F1, F2
- 장면 3 합류 참가자: F3
- 같은 프로그램이 아닌 outsider 1명
- 다른 프로그램의 정상 참가자 1명

### 22.2 필수 자동 검증

- 절대 시각·일정 revision·서버 `next_action` 전이
- 중복 클릭, 동일 key·다른 body, stale version, 동시 start/wrap, safety hold/start race
- 장면 1~2의 3남 2녀와 장면 3~5의 3남 3녀 구성
- 합류 참가자의 과거 list/read/write/signed URL/aggregate 0건
- 장면 2의 2인·3인 팀에서 전원 발언 기회와 단독 방치 0건
- 장면 3의 3남 3녀 9조합 중복·누락 0건
- 본인 회전 배정만 조회, 전체표·타인 배정 차단
- safety/weather hold 중 start·rotation·private input 차단
- 사진 미동의·철회 시 signed URL 0건
- 일방 선택 결과 0건, 상호 선택 edge 1건, 제3자 접근 0건
- 그룹 6명 전원 동의에서만 다음 시즌 제안 개방
- deadline 전 continuation·final·group count, pending, last responder, target 노출 0건
- final `connect|finish|hold` seal과 deadline 직전 수정 race에서 결과 1개만 확정
- mutual capability에만 후속 일정 개방, 상대 원본 가능 시간·미응답 사유 노출 0건
- 공통 후보 양측 확인에서만 실제 오프라인 약속 1개 확정, 프로그램 채팅 생성 0건
- guided program이 기존 match chat·continuation·evidence route를 생성하거나 링크하지 않음
- 자동 friendship·자동 연락처 공개·자동 금전 변경 0건

### 22.3 실제 브라우저 검증

- 360×800, 390×844, 430px 모바일, 1440×900 데스크톱
- QO-01 일정 묶음, QO-04 프로그램 홈, QO-07 체크인, QO-09 6인 회전, QO-10 안전, QO-11 사진 동의, QO-12 체크아웃, QO-14 합류자 온보딩, QO-16 최종 선택, QO-18 시즌 기록, QO-19~21 후속 일정
- 글자·카드·이미지·sticky CTA·키보드·safe area 겹침 0건
- 버튼 중복 클릭, 뒤로가기, 새로고침, 네트워크 실패·복구
- dialog ESC·포커스 이동·스크린리더 상태 알림
- 장소 변경 전후 오래된 CTA가 남지 않는지 확인

### 22.4 관측과 복구

- stuck scene, stale outbox, repeated CAS conflict, 미동의 photo sign 시도, cross-scope denial을 metric으로 기록한다.
- metric tag에는 private target, free text, signed URL, exact venue, 신고 원문을 넣지 않는다.
- outbox worker는 lease 만료 후 복구할 수 있어야 하고 dead-letter 항목은 운영자 재시도·폐기 결정을 감사 로그로 남긴다.
- scene phase와 blocking status가 오래 불일치하면 자동 전이하지 않고 운영 경고만 만든다.

### 22.5 완료로 말할 수 없는 상태

- 문서·정적 목업만 존재하는 상태
- HTTP 200만 확인하고 실제 CTA·저장·페이지 이동을 확인하지 않은 상태
- 5인 기존 화면을 6인처럼 보이게만 바꾼 상태
- 합류 참가자에게 과거 데이터가 응답되지만 클라이언트 CSS로 숨긴 상태
- 로컬 테스트만 통과하고 원격 RLS·migration·다계정 흐름을 확인하지 않은 상태
- 사진 업로드만 되고 피사체별 철회가 없는 상태
- 상호 선택 UI만 있고 일방 선택 데이터 누출·자동 친구 트리거가 남은 상태
- 상호 연결 뒤 채팅만 열리고 실제 오프라인 일정 제안·확정이 없는 상태
- 운영·안전·사진·private data의 보존기간이 승인되지 않았는데 production 저장을 연 상태
- Vercel·Android commit과 검증한 로컬 commit이 다른 상태

## 23. 구현 전 작업 경계

이 문서 승인 후 별도 구현 계획에서 다음 순서를 작업카드로 분해한다.

1. 현재 HEAD·dirty overlay·원격 migration ledger 재확인
2. 온라인 상태·라우트·DTO가 새 프로그램 계약에 0건인지 RED 테스트 작성
3. 프로그램·장면 milestone, action window, 참가자, 출석, 안전, 일정 revision, CAS·멱등 기반 구현
4. 서버 `current`, capability scope, `next_action` 구현
5. 프로그램 홈·출발·체크인·현장 집중 셸 구현
6. 합류자 scope와 5→6 좌석·회전 구현
7. versioned 사진 동의·비공개 성찰·sealed continuation·최종 선택 구현
8. mutual·그룹 capability와 다음 오프라인 일정 제출·확정 구현
9. 알림 outbox와 scoped 운영자 상태 전이 구현
10. 자동·다계정·브라우저 검증
11. 원격 Supabase, Vercel, Android, 결제는 각각 별도 승인 Gate에서 검증

`lib/types.ts`, `lib/supabase.ts`, `app/layout.tsx`, `app/page.tsx`, DB/API, `supabase/migrations/`는 공용·위험 경계로 분리한다. 기존 migration을 수정하지 않고 forward-only migration을 사용한다. 실제 migration 파일 이름과 순서는 원격 ledger 확인 후 확정한다.

## 24. 총괄 조율관 인수 조건

총괄 조율관은 이 문서를 받은 뒤 다음을 임의로 바꾸면 안 된다.

- 온라인 회차를 다시 넣는 것
- 5회 오프라인을 3회 묶음으로 축소하는 것
- 합류 참가자를 장면 3 당일용 인물로 낮추는 것
- 기존 5인 room/match lifecycle에 새 상태를 억지로 추가하는 것
- 감정 데이터 전체를 클라이언트에 보내고 화면에서 숨기는 것
- 전원 자동 친구·연락처 자동 공개를 다시 연결하는 것
- 사진 업로드를 피사체 동의로 간주하는 것
- 출석·안전·관계 의사를 결제와 직접 연결하는 것

변경이 필요하면 제품 규칙, 프론트, 백엔드, 개인정보, QA 영향과 사용자 승인을 한 묶음으로 다시 검토한다.

## 25. 설계 검토 체크리스트

- [x] 다섯 콘텐츠가 모두 오프라인 만남인가
- [x] 프로그램 온라인 채팅·라운지·화상 회차가 없는가
- [x] 3남 2녀에서 장면 3부터 3남 3녀로 바뀌는가
- [x] 합류 참가자가 과거 기록을 볼 수 없는가
- [x] 현장에서 앱 사용을 최소화했는가
- [x] 5인·6인 회전의 모든 조합이 명시되었는가
- [x] 한 명의 지각·귀가가 전체 상태를 오염시키지 않는가
- [x] 날씨·노쇼·안전·사진 철회가 정의되었는가
- [x] 일방 선택과 그룹 중단자를 노출하지 않는가
- [x] 같은 그룹이 원할 때 새 매칭 없이 다음 오프라인 약속으로 이어지는가
- [x] 결제·원격 DB·production을 완료로 오인하지 않게 분리했는가

## 26. 사용자 검토가 필요한 다음 단계

이 설계서가 제품 방향과 맞는지 사용자가 서면 검토한 뒤에만 구현 계획을 작성한다. 구현 계획은 파일 소유권, 작업 순서, 모델·검증자 배정, 테스트, 커밋 경계를 포함해야 한다. 사용자 검토 전에는 앱 코드, API, migration, 결제, 배포를 시작하지 않는다.

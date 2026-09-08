# 보이스 2번 디자인 + 대기 현황 구현 보고

## 판정

선택한 사진 카드형 디자인을 실제 VoiceRandom 화면에 구현했고, 상단에 전체·남자·여자 대기 인원 및 말하기·듣기 인원을 연결했습니다. 0명/1명도 표시합니다. 현재 4177 화면 숫자는 명시된 검수용 예시이며, 실제 통화 서비스 검증은 아닙니다.

## 변경

- 기존 장식용 헤드폰 구체 대신 두 사진으로 말하기/듣기 선택.
- 연애·취업/진로·가벼운 수다·고민 전반 사진 레일과 클릭/키보드/가로 스크롤.
- 역할/주제 선택 → 준비 → 대화 약속 확인 → 상대 찾기. 하단 메뉴 위 고정 참여 버튼.
- 서버 대기 집계만 표시. 고민은 같은 학교·선택 주제, 수다는 학교 전체 일대일 큐.
- 실패 숫자 삭제, 재시도, 성공 후 오류 제거, 이전 응답 무시, 주제/큐 scope 검증.
- POST의 확정 참여/세션 상태를 먼저 반영하고 집계 재조회는 비차단으로 처리. 자격 상실 후 나가기의 최소 성공 응답도 처리.

## 검증

- npm run test:voice: 31/31.
- voice-entry-ui / voice-scene-ui / voice-entry-fixture: 11/11.
- npx tsc --noEmit --pretty false: 통과.
- 390×844 및 1440×900 브라우저: 가로 넘침 없음, 이미지 로딩, 버튼과 역할/주제 변화 확인.
- 검수 데이터로 0/1, 오류/복구, 대화 약속, 참여, 새로고침 상태 유지, 나가기 확인.
- 디자인 근거와 비교/수정 내역: 프로젝트 루트 design-qa.md.

## 실행

격리 작업공간에서 기존 안전한 UI 런처와 보이스 전용 fixture를 실행:

`node scripts/qa/serve-social-scenes-local.mjs`

`node scripts/qa/serve-voice-entry-fixture.mjs`

검수 주소: http://127.0.0.1:4177/community/voice/random?topic=worries&adviceTopic=romance

기존 4176은 모임방 fixture이므로 voice API를 제공하지 않습니다. 실제 UI 3013을 환경 설정 없이 직접 실행할 때의 주소 설정 503은 기존 안전 런처 사용으로 확인했습니다. 인증 우회는 추가하지 않았습니다.

## 미검증 / 경계

운영 집계·실계정·실통화·실기기·배포 미검증. 대기 인원에 통화 중인 사람은 포함되지 않습니다. 실제 로컬 DB snapshot에도 최신 voice queue migration이 없으며 적용하지 않았습니다. commit, stage, push, DB 적용, provider 설정, 배포 없음.

## 변경 파일

- components/voice/VoiceRandom.tsx, VoiceEntryScenes.tsx, VoiceParticipation.tsx, voice-entry.module.css
- lib/voice/entry-status.ts, 관련 테스트
- public/social-scenes/voice-{talker,listener,career,social}-v2.webp
- 보이스 검수 전용 fixture와 테스트, 계획/보고/캡처

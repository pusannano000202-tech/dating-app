# 통합 구현 실행 장부

## 승인 및 경계

- 사용자 승인: `3번으로 하고 전체 구현 시작해라` (2026-09-05).
- 기준 계획: `2026-09-05-integrated-campus-experience.md` 전체 A–H, T00–T10 및 정책 표. 원본의 승인 대기 표시는 이 실행 승인으로 대체한다.
- MBTI 디자인: 표시 순서 3번, `exec-88449c40-1218-4bc8-ab3e-10880ecce258.png`.
- 새 작업공간: `C:/Users/82108/.config/superpowers/worktrees/데이팅앱만들기/integrated-campus-20260905`.
- branch: `codex/integrated-campus-20260905`; 시작 HEAD: `be9078565d8e59f73cbc017f3c7b1484996da1c3`.
- 원본 G1/FIVE/루트 작업은 보존한다. 커밋·stage·push·원격 migration·실결제·배포는 승인되지 않았다.
- G1 대상은 361개 파일 및 최신 루트 AGENTS/협업/인터페이스/라우팅 문서로 제한했다. 최종 감사에서 초기 manifest 자체의 도구출력 잘림을 발견하여 원본을 `.corrupt.txt`로 보존하고 schemaVersion 2의 현재 원본/대상 해시 장부로 재생성했다. 298개는 손상 전 기록의 원본 해시도 일치하고, 361개 모두 현재 대상 경로가 있다(344개 원본 동일, 17개 통합 변경). 이는 현재 파일 범위와 보존 검증이며 잘린 기록으로 과거 복사 실행을 증명하는 것은 아니다. 기존 rehearsal은 실제 DB 검증 근거와 구분한다.
- 새 DB migration은 G1 마지막 `20260905044012` 이후의 forward-only 파일로만 추가한다.

## 소유권 및 진행

| 작업 | 담당 | 상태 |
|---|---|---|
| T00 격리/기준 파일/검증 | 부모 | 격리·현시점 source/target 해시 대조 완료, 초기 손상 기록 보존 |
| T01 간편 가입/권한 분리 | 가입 담당 | 코드·회귀 구현, 전화번호 연결 불가 안내 클릭 확인, 실제 Auth 저장 미검증 |
| T02–03 다중 경험 MBTI/3번 디자인 | MBTI 담당 | 코드·독립 개인정보 검토·공개 입력 화면 클릭 확인, 실제 저장/동시성 미검증 |
| T04–07 이번 주/후속 프로그램/권리 | 후속 만남 담당 | 상태/마감/명단/합류/결제 만료 callback 지적 #1–#7 독립 소스 재검토 PASS, 실제 DB/Toss 미검증 |
| T08 모임 목록 우선 | 부모 | 목록 우선 배치·필터·URL 복원·사진 넘기기 확인, DB 참가/취소 미검증 |
| T09 방문/배달 월드컵 | 부모 | UI/후보 검수/만료/격리 대진 구현, 방문 대진·개인 결과 유지 확인; 실제 배달 자료 0/8 |
| T10 통합 검증 | 부모/독립 검토자 | 전체 자동 회귀·빌드·린트·정적 SQL 통과, 실제 DB/4역할/실기기/실사용자 관찰은 미검증 |

## 검증 현황

- 현재 턴 사전 확인: Docker Engine 연결 불가; 3004/3005 앱 및 56320–56324 DB harness 포트 미기동. 이전 턴의 통과 수치를 새 구현 통과로 간주하지 않는다.
- 로컬 정상 실행 시도만 허용. Docker factory reset, 기존 DB reset, WSL 강제 종료 금지.
- 배달 공개 후보 검증, 실제 SMS·결제·기기·원격 운영 검증은 로컬 개발 검증과 별도다.
- 전체 완료는 아직 선언하지 않는다. 테스트·브라우저·실제 DB·독립 검토 결과를 이 장부에 누적한다.

## 최종 근거 위치

- 자동 실행 결과: `artifacts/integrated-20260905/checks/test-results.json`, `final-results.json`과 각 log.
- 최종 회귀: 2026-09-06 01:51:32 KST 완료, 1,643/1,643 통과(auth 144/config 608/matching 752/profile 139). 별도 도구 23개 통과. 정식 빌드·린트·시크릿·migration baseline 통과. SQL 9개/PLpgSQL 파서는 통과했으나 실제 DB migration/RPC 실행은 미실행이다.
- 디자인/브라우저: 루트 `design-qa.md`, `artifacts/integrated-20260905/*-final.png`.
- 실행과 차단 사유: `docs/operations/integrated-local-run.md`.
- 별도 DB 구성/migration snapshot: `.tmp/integrated-live-local` (최종 SQL 반영 후 214 migration, DB 시작/적용 false). 이전 준비본은 `.tmp/integrated-live-local-preflight-20260905`, `.tmp/integrated-live-local-preflight-20260906T0149`에 보존한다. 기존 DB 데이터가 아닌 이 작업에서 만든 미기동 구성 파일의 백업이다.
- 실제 배달 후보·사진 사용 권리, Docker 임시 소켓 복구 승인은 아직 받지 못했다. 데이터 초기화·DB reset으로 우회하지 않는다.

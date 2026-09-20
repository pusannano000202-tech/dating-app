# Quantum 협업 작업본 — 2026-09-20

## 이 브랜치의 역할

- 저장소: `pusannano000202-tech/dating-app` (공개 저장소)
- 작업 브랜치: `codex/collab-app-20260920`
- 공유 기준: `codex/web-security-main-20260914`의 `32563ad3`와 검토한 미커밋 작업.
- 업로드 준비 시 확인한 원격 main: `e25aec55e127a640ed8b718f2a21590979232237`.
- **협업용 작업본이지 출시 완료본이 아니다.** main 병합, 원격 DB 변경, 실제 결제, 정식 배포는 이 작업의 범위가 아니다.

기존 홈·모임·커뮤니티·채팅 코드는 보존하고, 학과 마스코트/여러 팀 UI, 대기판, 이벤트·커플 캘린더, 오늘밤 기존 신청·초대·준비 화면 연결 작업을 함께 공유한다. 원래 개발 폴더의 미커밋 자료는 이동하거나 삭제하지 않았다.

## 친구가 받는 방법

기존 작업 폴더에 덮어쓰지 말고 처음에는 새 폴더에 받는다.

```sh
git clone --branch codex/collab-app-20260920 --single-branch https://github.com/pusannano000202-tech/dating-app.git quantum-collab
cd quantum-collab
npm ci
```

Node는 현재 검증 환경인 `24.14.1`을 기준으로 한다. 로그인·DB 기능을 사용하려면 별도로 승인된 **테스트용** 환경변수를 `.env.local`에 준비해야 한다. `.env.local`, 실제 키, 로그인 쿠키와 실제 계정 자료를 Git에 올리지 않는다. 환경변수 없이 코드를 받았다는 이유만으로 모든 화면의 로그인이 가능한 것은 아니다.

테스트 환경을 준비한 뒤 일반 앱의 로컬 포트를 3010으로 명시하려면:

```sh
npx next dev --hostname localhost --port 3010
```

테스트 Auth의 Site URL/허용 callback도 그 주소와 맞아야 한다. 이 명령은 DB 초기화·migration 적용·실제 결제를 수행하지 않는다. 기존 `scripts/qa/serve-social-scenes-local.mjs`는 원래 PC의 전용 Docker QA 환경과 3013을 참조하므로 친구 PC의 범용 실행 명령이 아니다. 이번 Git 공유가 기존 3013 런타임을 자동으로 3010으로 전환하지 않는다.

## Git 공유와 화면 공유는 별개

- 이 브랜치의 코드를 받아 수정할 수 있지만 로그인 세션·로컬 DB·현재 보고 있는 화면은 공유되지 않는다.
- `localhost:3010`은 각자 자기 컴퓨터를 뜻한다. 친구에게 이 주소만 보내면 내 서버가 열리는 것이 아니다.
- 같은 화면을 같이 보려면 화면 공유 또는 접근을 제한한 개발 서버 공유가 별도로 필요하다.
- 같은 파일을 동시에 고치기 전에 담당 범위를 나눈다. 변경 후 해당 기능을 검증하고 커밋한다. 다른 사람의 작업을 reset/clean/force-push로 지우지 않는다.

## 배포 안전장치

`vercel.json`의 `git.deploymentEnabled`에서 **`codex/collab-app-20260920`만 false**로 지정한다. 현재 main과 기존 cron 설정은 바꾸지 않는다. 따라서 이번 브랜치의 Git 공유는 미리보기 사이트 완성을 뜻하지 않는다.

새 이름의 다른 브랜치에는 이 규칙이 자동 적용되지 않는다. 다른 브랜치를 올리거나 배포를 켜기 전 테스트 DB·결제·로그인 callback과 Vercel 대상 프로젝트를 먼저 확인한다. 수동 CLI 배포를 허가하는 설정도 아니다.

공식 설정 근거: https://vercel.com/docs/project-configuration/git-configuration#git.deploymentenabled

## 다음 담당자가 놓치면 안 되는 미완료 사항

1. **오늘밤 진행/투표:** 기존 활동 1·2·3순위 신청과 후속 만남 엔진을 유지했다. 현재 오늘밤의 일반 안내 카드가 달무티·다음 게임 비공개 투표 전체를 실행하는 화면은 아니다. `Day1PrivateGameRuntime`이 연결된 회차 화면과 오늘밤 진입의 기존 정책을 대조해 후속 연결해야 한다. 새 엔진으로 대체하거나 모두 완료됐다고 표현하지 않는다.
2. **리그 여러 팀:** 프론트엔드와 forward migration을 공유하지만, 실제 사용하는 DB에 해당 migration이 적용됐는지는 환경별로 확인해야 한다. 파일 존재와 실제 적용은 별개다.
3. **대기판 보증금:** 기존 준비·권한·원장 경계를 유지한다. UI가 표시된다고 실결제/참가 전체가 완료된 것은 아니다.
4. **캘린더·커플:** 새 migration은 소스 공유만 한다. 운영 행사 편성, 운영 DB 적용, 실제 공급자 결제·취소, 실제 다중 계정 흐름은 별도 검증 대상이다. `calendarPaymentConfig`는 미확인 운영 사용을 차단하는 기존 경계를 유지한다.
5. **원격 서비스:** Vercel 관리 API 인증이 없어 운영 branch/env의 라이브 설정은 미확인이다. GitHub 공유를 원격 DB/실기기 푸시/운영 배포 검증으로 해석하지 않는다.

## 작업 규칙

최신 사용자 지시와 이 브랜치의 AGENTS가 오래된 문서보다 우선한다. `quantum-model-router`, `quauntum-work-union-progress`, 모델 고정 배정은 폐기된 규칙이다. 과거 파일/이력에 남아 있어도 호출하거나 복원하지 않는다. 루트의 다른 작업과 QA·참조 자료는 이번 변경에 섞지 않는다.

## 검증 기록

이번 공유의 실제 명령·통과/실패·검증 한계는 `docs/qa/2026-09-20-collaboration-branch-verification.md`에 정리한다. 로컬 테스트 및 코드 검토는 운영 준비 완료의 증거가 아니다.

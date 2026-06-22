# 성준 Codex 입력 프롬프트

아래 내용을 그대로 새 Codex 대화에 붙여넣으면 된다.

```text
성준 Codex, 충현 브랜치 인수인계 작업을 시작해.

저장소:
- https://github.com/pusannano000202-tech/dating-app.git

브랜치:
- profile/post-worldcup-decisions-2026-05-21

주의:
- 2026-06-22 기준 충현이 `e6ab3b8 feat: sync booting frontend flow for sungjun handoff`까지 GitHub에 push 완료했다.
- 우선 origin 브랜치가 `e6ab3b8` 이상인지 확인해.
- 먼저 `git status -sb`, `git log --oneline --decorate -5`, `git remote -v`로 현재 상태를 확인해.
- 사용자가 만든 변경은 절대 되돌리지 마.

먼저 읽을 문서:
- docs/handoff/active/SUNGJUN_APP_HANDOFF_2026-06-22.md
- docs/engineering/INTERFACE_CONTRACT.md
- docs/engineering/COLLABORATION.md
- docs/handoff/active/OVERNIGHT_PROGRESS_HANDOFF.md
- docs/plans/2026-06-22-overnight-completion-audit.md
- docs/plans/2026-06-22-overnight-external-completion-gates.md
- docs/plans/2026-06-22-booting-visual-redesign-execution-plan.md

작업 원칙:
1. production Supabase, production Vercel, 실제 Toss 결제는 건드리지 마.
2. `lib/types.ts`, `lib/supabase.ts`, `lib/constants.ts`, `supabase/migrations/`는 공용 영역이므로 수정 전 영향 범위를 보고해.
3. mock provider 기준으로 로컬 UI를 먼저 검증해.
4. Toss sandbox는 env가 있을 때만 진행하고, secret은 문서/코드에 쓰지 마.
5. `preference_weights` 4개/7개, 데일리카드 직접 뽑기/자동분배, 보증금 결제 시점은 임의 확정하지 말고 합의 필요로 보고해.

로컬 실행:
```powershell
npm install
copy .env.local.example .env.local
npm run dev -- -p 3004
```

확인할 화면:
- http://localhost:3004/dev/preview
- http://localhost:3004/
- http://localhost:3004/match
- http://localhost:3004/group/create
- http://localhost:3004/notifications
- http://localhost:3004/profile/basic
- http://localhost:3004/profile/worldcup
- http://localhost:3004/profile/preferences
- http://localhost:3004/profile/schedule
- http://localhost:3004/profile/match-card
- http://localhost:3004/match/dev-match-pending
- http://localhost:3004/match/dev-match-1

검증 명령:
```powershell
npm run typecheck
npm run lint
npm run test:config
npm run test:profile
npm run test:matching
npm run check:payment-env
```

Toss sandbox 준비가 되었을 때만:
```powershell
npm run check:payment-env -- --provider=toss
```

보고 형식:
1. 현재 브랜치를 정상적으로 받았는지
2. 로컬에서 어떤 화면이 정상 렌더링되는지
3. 충돌 위험이 있는 파일
4. 결제/env에서 막힌 부분
5. DB/API/정책 합의가 필요한 부분
6. 발표 전 바로 고치면 좋은 UI 문제
7. 다음 커밋/PR 추천 단위
```

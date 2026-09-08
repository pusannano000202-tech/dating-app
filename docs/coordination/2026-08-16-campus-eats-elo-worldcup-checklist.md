# Campus Eats Elo 월드컵 구현 체크리스트

기준본: `output/campus-food-tournament-handoff/handoff_manifest.csv`

## 데이터

- [x] 커뮤니티팀 기준본 재확인
- [x] 93개 고유 매장, 94개 대진 카드 수량 확인
- [x] 돈가스 14, 피자 12, 치킨 14, 정문 커피 17, 북문 커피 13, 국밥 16, 밀면 8 연결
- [x] 피나치공 1개 매장을 피자·치킨 양쪽 카드로만 중복 노출
- [x] 원본 비율 유지 웹 이미지 생성 및 해시 연결

## 점수와 대진

- [x] 둘 다 먹어본 비교만 승패와 Elo 점수에 반영하는 기존 계약 확인
- [x] 방문 범위·유효 비교 수에 따른 0.5~1.0 근거 가중치 확인
- [x] 12·14·30개 후보의 자동 부전승 대진 구현
- [x] 동일 이벤트 중복 반영 방지와 점수 총합 보존 재검증
- [x] 사용자가 먹어본 매장만 골라 별도 월드컵 대진을 만드는 흐름 구현
- [x] 참가 매장 `N`곳이면 정확히 `N-1`번 비교 후 챔피언 1곳이 남는 계약 고정
- [x] 방문 7곳 기준 `8강 3경기 -> 준결승 2경기 -> 결승 1경기`와 자동 부전승 확인
- [x] 여섯 번의 유효 승부 모두 고유 이벤트 ID로 Elo에 한 번씩 반영

## 화면

- [x] 일곱 음식 대진을 모바일 가로 선택기로 표시하고 정문·북문 커피를 분리
- [x] 사진은 `contain`으로 전체 노출하고 방문 선택 상태를 명확히 표시
- [x] 승인 시안 색상과 정보 위계 적용
- [x] 내 기기 Elo 순위와 방문·유효 비교 근거 표시
- [x] `먹어본 곳 선택 -> 라운드 진행 -> 이번 챔피언`을 서로 다른 화면으로 분리
- [x] 현재 라운드, 라운드 경기 번호, 전체 진행 수를 동시에 표시
- [x] 결승 우승과 장기 누적 Elo 순위를 혼동하지 않도록 결과 영역 분리
- [x] 새 월드컵 만들기에서 기존 방문 기록을 유지하고 대진만 초기화

## 검증

- [x] 설정·프론트 계약 테스트 274개 통과
- [x] 매칭·도메인 테스트 410개 통과
- [x] `seven visited restaurants produce one champion after exactly six Elo comparisons` 회귀 테스트 통과
- [x] `npm run typecheck` 통과
- [x] 390x844 모바일에서 방문 7곳 선택부터 결승·재시작까지 직접 클릭 검증 및 캡처
- [x] 1440x900 독립 Playwright에서 방문 7곳 선택부터 결승까지 직접 클릭 검증 및 캡처
- [x] 이미지 누락·왜곡·겹침·버튼 동작·콘솔 오류 확인
- [x] 2026-08-18 독립 재검증에서 모든 7개 대진을 시작부터 챔피언까지 실행
- [x] 2026-08-18 출시 후보 재검증에서 정문 커피 17곳과 북문 커피 13곳의 직접 URL 분리 확인
- [x] 최초 안내 3장 확인 후 정문 커피 7곳 선택, 6경기, 챔피언 1곳까지 실제 클릭
- [x] 모바일 390x844와 데스크톱 1440x900에서 새 캡처를 만들고 브라우저 오류 로그 0건 확인
- [x] API 7종 수량, 잘못된 카테고리 400, 93개 런타임 이미지 응답 재확인
- [x] 추적·미추적 파일 전체 비밀정보 검사 통과

## 출시 경계

- [ ] 사진 사용권과 현재 영업 상태는 운영 반영 전 별도 확인
- [ ] 현재 Elo와 방문 기록은 브라우저 기기에만 저장되며 계정 동기화·학교 전체 순위는 미구현
- [x] 원격 DB, migration, Vercel 배포는 사용자 승인 전 보류
- [x] 이번 변경 파일만 별도 커밋 가능한 범위 분류

## 검증 증거

- API 수량: 돈가스 14, 피자 12, 치킨 14, 정문 커피 17, 북문 커피 13, 국밥 16, 밀면 8
- 잘못된 카테고리 요청: HTTP 400
- 모바일: 390x844, 방문 7곳, `전체 0/6 -> 6/6`, `8강 -> 준결승 -> 결승`, 가로 넘침 0
- 데스크톱: 1440x900, 별도 새 브라우저에서 방문 7곳·6경기·챔피언 1곳 확인, 가로 넘침 0
- 결과: 참가 매장 7곳, 완료한 승부 6번, 이번 챔피언 1곳, 누적 Elo 순위 별도 표시
- 재시작: `새 월드컵 만들기` 후 방문 7곳 선택 상태를 유지한 대진 설정 화면 복귀
- 콘솔 오류·경고: 0
- 캡처: `docs/qa/captures/2026-08-17-campus-eats-visited-seven-setup-mobile.png`
- 캡처: `docs/qa/captures/2026-08-17-campus-eats-bracket-progress-mobile.png`
- 캡처: `docs/qa/captures/2026-08-17-campus-eats-champion-mobile.png`
- 캡처: `docs/qa/captures/2026-08-17-campus-eats-champion-desktop.png`
- 재검증 모바일: `docs/qa/captures/2026-08-18-campus-eats-final-mobile.png`
- 재검증 데스크톱: `docs/qa/captures/2026-08-18-campus-eats-final-desktop.png`
- 출시 후보 모바일 설정: `docs/qa/captures/2026-08-18-campus-eats-release-mobile-setup.png`
- 출시 후보 모바일 우승: `docs/qa/captures/2026-08-18-campus-eats-release-mobile-champion.png`
- 출시 후보 데스크톱 우승: `docs/qa/captures/2026-08-18-campus-eats-release-desktop-champion.png`
- 커뮤니티 노출 데스크톱: `docs/qa/captures/2026-08-18-community-campus-eats-release-desktop.png`

# 사진 잘림·친목 카드 넘김 수정

2026-09-07 · 실제 로컬 앱 http://localhost:3013

## 판정

요청한 사진 프레이밍과 친목 탐색 조작을 수정하고 로컬 브라우저에서 검증했다. 물리 휴대폰의 터치 검증이나 운영 출시 완료를 뜻하지 않는다.

## 변경한 내용

- 공통 사진 캐러셀: 고정 높이 236/218/440px를 없애고 폭에 비례하는 4:3 틀과 `object-fit: contain`을 적용했다. 배달 라이더의 머리·바퀴를 포함해 전체 사진을 유지한다. 사진 비율이 다르면 여백이 생기며, 이미지 자체를 자르거나 재생성하지 않았다.
- 같은 공통 컴포넌트를 사용하는 콘텐츠·보이스·장소·학과 대항 사진에 적용했다. 전환 애니메이션도 이미지 끝이 잘리지 않는 페이드로 바꿨다.
- 모임 아이디어: 가로 단체 사진을 세로 카드 전체에 확대하던 구조를 사진 위 / 설명 아래로 분리했다. 양끝 사람을 보존하고 설명이 사진을 덮지 않게 했다.
- 남성/여성/혼성 친목: 가로 드래그, 이전/다음, 직접 선택, 현재 순서, 키보드 이동을 연결했다. 선택한 추천과 아래 활동 목록이 같이 바뀐다.
- 세로 스크롤, 드래그 후 클릭 억제, 터치의 lost-pointer-capture 순서, 화면 회전 후 선택 카드 복원, 줄어든 움직임 설정을 처리했다.
- 친목 추천과 실제 모집의 참여 성별 조건은 별개로 유지했다. DB/API/인증/참가 로직은 변경하지 않았다.

## 발견한 문제와 수정 근거

| 문제 | 재현 / 수정 |
| --- | --- |
| 중간 폭에서 배달 라이더 머리 잘림 | CSS viewport 635px에서 사진 578×236, cover로 원본 위아래 잘림. contain과 비례 높이로 변경 |
| 친목 드래그가 클릭으로 처리됨 | 390px에서 drag 후 scrollLeft 0, 첫 카드만 선택. 가로 의도 판별과 클릭 억제 연결 |
| 선택 카드와 첫 가시 카드 불일치 | 기본 혼성 선택인데 남성 사진이 첫 화면. 선택 카드로 레일 내부 수평 정렬 |
| 페이지 자체가 아래로 점프 | scrollIntoView를 rail.scrollTo로 대체해 문서 세로 위치 보존 |
| 큰 화면 → 작은 화면에서 선택 카드 이탈 | 여성 선택 후 1440→390에서 수정 전 left316/right604, scrollLeft0. ResizeObserver 후 left16/right304, scrollLeft300 |
| 모임 단체 사진 양끝 인물 잘림 | 대체로 1.6:1 가로 사진을 세로 카드 cover로 표시. 사진 전용 contain 영역 분리 |

## 검증한 내용

- 브라우저: 320/390px 휴대폰 폭, 635px 중간 폭, 1440px 데스크톱.
- 공통 캐러셀: 콘텐츠 4종, 보이스 7종, 장소 3종, 학과 대항 2종의 선택·사진 프레이밍 확인. 처음 지연 로드된 취업/헬스장 사진은 로딩 후 재확인했다.
- 320px에서 모임 아이디어 15종을 실제 다음 버튼으로 순회했다. 설명 scrollHeight가 clientHeight를 넘지 않았고 페이지 가로 넘침도 없었다.
- 320px 친목 조작: 이전/다음 44×44px, 직접 선택 약54×44px. 겹침 없음. 문서 clientWidth=scrollWidth=305px.
- 390px 친목: 남성→여성→혼성 드래그 및 역방향, 이전/다음, 직접 선택, Home/ArrowRight 확인. 여성 선택 시 카페·소품숍·산책·식사 4개 추천으로 변경된다.
- 카드 위 세로 스크롤: scrollY 1255→1508 동안 female-social 선택 유지.
- 1440px 친목: 360px 카드 3장, 카드 간 12px 간격. 가로 넘침 없음.
- 화면 재진입에서 scrollY 0 확인. 큰 폭→작은 폭 변경 후 선택 카드 복원 확인.
- 정적/회귀 테스트: 사진·공통 탐색 19/19, config 654/654 통과.
- 타입 검사 통과. 정식 빌드 214개 페이지 생성 통과. 빌드에서 확인된 effect 의존성 경고는 정렬 함수를 effect 내부에 두어 수정했으며, 프로젝트의 Next lint로 두 변경 컴포넌트 경고/오류 0을 확인했다.
- 독립 코드 검토: 회전 문제를 수정한 뒤 Critical/Important 0. 이 판정은 이번 UI 버그 수정에 한정한다.

## 남은 위험 또는 미검증 사항

- 실제 Android/iPhone의 손가락 터치는 미검증이다. 현재 제스처 증거는 브라우저 모바일 폭에서의 포인터 드래그와 스크롤이다.
- 다중 손가락·비주 포인터의 극단적인 조작은 미검증이다.
- 기존 모임 목록 연결 오류는 남아 있다. 사진/추천 탐색은 확인했지만 실제 모집·가입 성공을 이번 검증으로 주장하지 않는다.
- DB migration 적용, 운영 배포, 결제, 실계정 참가, commit/push는 하지 않았다. 보호 대상 원본 작업공간은 수정하지 않았다.
- 앱 전체 모든 이미지가 아닌 이번 커뮤니티/모임 탐색 화면과 공통 사진 컴포넌트 범위의 검증이다. 커뮤니티 대표 이미지 3장의 의도된 썸네일 구도는 유지했다.

## 실제 화면

### 배달 사진 전체 보존

![배달 모바일](C:/Users/82108/.config/superpowers/worktrees/데이팅앱만들기/social-scene-implementation-20260907/artifacts/social-scenes-crop-swipe-20260907/delivery-mobile.png)

### 여성 친목 선택과 넘김

![여성 친목 모바일](C:/Users/82108/.config/superpowers/worktrees/데이팅앱만들기/social-scene-implementation-20260907/artifacts/social-scenes-crop-swipe-20260907/friendship-female-mobile.png)

### 모임 아이디어 사진과 설명 분리

![모임 아이디어](C:/Users/82108/.config/superpowers/worktrees/데이팅앱만들기/social-scene-implementation-20260907/artifacts/social-scenes-crop-swipe-20260907/meetup-idea-photo-mobile.png)

### 데스크톱 친목

![데스크톱 친목](C:/Users/82108/.config/superpowers/worktrees/데이팅앱만들기/social-scene-implementation-20260907/artifacts/social-scenes-crop-swipe-20260907/friendship-desktop.png)

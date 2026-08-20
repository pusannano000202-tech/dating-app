# Quantum Android 및 Google Play 준비 계획

**목표:** `apps/mobile`의 Expo React Native 앱을 실제 Android 기기에 설치하고, Google Play 내부 테스트에 올릴 수 있는 상태로 만든다.

**구조:** 현재 모바일 앱은 Expo Router 기반의 독립 앱이다. 직접 설치용 `preview` APK와 Google Play 업로드용 `production` AAB를 분리하며, 이후 기존 Quantum 인증·모임·매칭 API를 같은 계약으로 연결한다.

---

## 1. 매칭 화면과 원기둥형 탐색

- [x] `오늘 밤`과 `약속 잡기`에 각각 4개 이상의 5인 활동 데이터를 제공한다.
- [x] 두 모드 모두 좌우로 넘기는 동일한 원기둥형 캐러셀을 사용한다.
- [x] 한 사용자는 한 번에 하나의 활동에만 참여할 수 있다.
- [x] 일정 전환과 다음 카드 이동을 390x844 브라우저에서 직접 확인한다.
- [x] 자동 테스트와 TypeScript 검사를 통과한다.

## 2. Android 빌드 설정

- [x] Android 패키지를 `com.quantum.campus`로 고정한다.
- [x] 직접 설치용 `preview` APK와 Play용 `production` AAB를 분리한다.
- [x] Expo 계정 `quantum-pusan`과 EAS 프로젝트 `quantum-campus`를 연결한다.
- [x] 앱 아이콘과 Android 적응형 아이콘을 적용한다.
- [x] EAS 원격 서명키를 생성·보관한다.
- [x] 설치용 APK 빌드와 로컬 다운로드를 완료한다.
- [x] Google Play용 AAB 빌드와 로컬 다운로드를 완료한다.

## 3. 현재 생성된 배포 파일

아래 파일은 모바일 API·로그인 연결 전 빌드다. 이번 연결 코드를 포함한 새 APK/AAB로 다시 빌드하기 전에는 최신 검증본으로 사용하지 않는다.

- APK: `apps/mobile/artifacts/quantum-preview-v1.apk`
- AAB: `apps/mobile/artifacts/quantum-production-v1.aab`
- Expo APK 빌드: `58d37b70-94ce-443c-a6c8-43eb487dfcb9`
- Expo AAB 빌드: `6a2e3cb5-1451-466d-99d7-1ed9bdb23c07`
- 앱 버전: `1.0.0`
- Android 빌드 버전: `2`

## 4. 실기기 설치 QA

- [ ] Android 실제 기기에 APK를 설치한다.
- [ ] 앱 아이콘, 시작 화면, 하단 5개 탭을 확인한다.
- [ ] `오늘 밤`과 `약속 잡기` 캐러셀을 손가락으로 넘긴다.
- [ ] 참여 후 다른 일정으로 바꿀 때 기존 참여가 교체되는지 확인한다.
- [ ] 360x800, 390x844, 430x932급 화면에서 글자·사진·버튼 겹침을 확인한다.
- [ ] 앱을 종료하고 다시 열었을 때 필요한 상태가 복구되는지 확인한다.

## 5. 실제 서비스 연결

- [ ] Supabase 모바일 딥링크와 Google·Kakao 로그인 공급자에 앱 주소를 등록한다.
- [x] 로그인 세션을 SecureStore에 보관하고 기존 Quantum 계정과 연결하는 앱 코드를 구현한다.
- [x] 현재 로컬 일정 데이터를 Quantum 모임 API 응답으로 교체한다.
- [x] 참여 중복 방지를 서버·DB에서도 강제하는 migration을 원격 Supabase에 적용하고 표·RLS·RPC 권한을 확인한다.
- [x] EAS preview·production 환경에 Vercel API 주소와 Supabase 공개 설정을 등록한다.
- [ ] 사진 업로드, 외모 분석, 보증금, 친구 관계를 모바일 API와 연결한다.
- [ ] 결제는 Toss 모바일 리다이렉트 계약과 환불 정책 승인 후 별도 Gate에서 연결한다.

## 6. Google Play 내부 테스트

- [ ] Google Play 개발자 계정을 준비한다.
- [ ] Play Console에 `com.quantum.campus` 앱을 만든다.
- [ ] 개인정보처리방침 URL, 데이터 보안 설문, 콘텐츠 등급을 작성한다.
- [ ] 앱 설명, 512px 아이콘, 피처 그래픽, 휴대폰 스크린샷을 등록한다.
- [ ] `quantum-production-v1.aab`를 내부 테스트 초안에 올린다.
- [ ] 계정 조건에 따라 비공개 테스트 인원과 기간 요건을 충족한다.
- [ ] 실기기·인증·DB·결제 검증이 끝나기 전에는 production 완료로 표시하지 않는다.

## 현재 판정

- **완료:** 모바일 UI 골격, 원기둥형 일정 탐색, Supabase 세션 코드, 모임 목록·참여 API와 원격 DB, EAS 공개 환경설정, Android 번들 export, 자동 검사, 로그인 브라우저 QA.
- **미완료:** 실제 Android 로그인 QA, Supabase 딥링크 등록 확인, 사진·결제 연결, 최신 APK/AAB 재빌드, Play Console 등록과 심사.
- **출시 상태:** 코드와 참여 DB 계약까지 연결됐지만 실기기 OAuth·최신 설치 파일 검증 전이므로 실제 서비스 출시는 차단 상태다.

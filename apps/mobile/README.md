# Quantum Mobile

Quantum의 Expo React Native 모바일 앱입니다. 기존 Next.js 웹을 감싸는 WebView가 아니라 Android와 iOS에서 공통으로 사용하는 네이티브 UI 코드로 구성합니다.

## 현재 범위

- 홈, 매칭, 모임, 커뮤니티, 마이의 5개 기본 탭
- 오늘 밤 활동을 원기둥처럼 좌우로 넘기는 매칭 선택 화면
- 한 번에 하나의 활동만 유지하는 로컬 참여 상태
- 모바일용 색상, 간격, 터치 영역, 앱 아이콘과 Android 빌드 설정
- 로그인, Supabase 데이터, 결제, 푸시는 다음 통합 단계에서 연결

## 로컬 실행

```powershell
npm install
npm run web
```

Expo Go가 설치된 Android 휴대폰과 같은 네트워크에서 확인하려면 다음을 실행하고 표시되는 QR을 스캔합니다.

```powershell
npm start
```

현재 프로젝트의 고정 LAN 실행 명령은 다음과 같습니다.

```powershell
npm run device
```

## 검증

```powershell
npm test
npm run typecheck
npm run doctor
npx expo export --platform android --output-dir dist-android
```

`expo export`는 Android용 JavaScript 번들을 확인하는 단계입니다. 설치 가능한 APK는 Expo 계정 연결 후 `eas build --profile preview --platform android`로 별도 생성합니다.

## Android 배포

```powershell
# 휴대폰 직접 설치용 APK
npm run build:apk

# Google Play 업로드용 AAB
npm run build:play
```

Google Play 제출은 첫 출시부터 production으로 보내지 않고 internal 테스트의 draft 상태로 시작합니다.

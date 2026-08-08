# Quantum Mobile

Quantum의 Expo React Native 모바일 앱입니다. 기존 Next.js 웹을 감싸는 WebView가 아니라 Android와 iOS에서 공통으로 사용하는 네이티브 UI 코드로 구성합니다.

## 현재 범위

- 홈, 매칭, 모임, 커뮤니티, 마이의 5개 기본 탭
- 오늘 밤 활동을 원기둥처럼 좌우로 넘기는 매칭 선택 화면
- Google·Kakao Supabase 로그인과 기기 보안 저장소 세션
- 서버 API에서 불러오는 모임 목록과 한 번에 하나만 유지되는 참여 상태
- 모바일용 색상, 간격, 터치 영역, 앱 아이콘과 Android 빌드 설정
- 결제, 사진 업로드, 푸시는 다음 통합 단계에서 연결

## 환경 설정

`.env.example`을 기준으로 `.env.local`에 공개 설정만 넣습니다. Supabase secret/service-role 키는 모바일 앱에 넣지 않습니다.

```dotenv
EXPO_PUBLIC_API_ORIGIN=https://dating-app-silk.vercel.app
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

실제 Android 휴대폰에서 로컬 Next.js 서버를 사용할 때 `localhost`는 휴대폰 자신을 뜻합니다. PC와 같은 와이파이에 연결한 뒤 `EXPO_PUBLIC_API_ORIGIN`을 `http://<PC의-LAN-IP>:3003`으로 바꾸거나 배포된 HTTPS 주소를 사용합니다.

소셜 로그인에는 Supabase Auth Redirect URLs에 `quantum://auth/callback`을 등록해야 합니다. Expo Go가 아닌 preview APK 또는 development build에서 이 딥링크를 검증합니다.

## 로컬 실행

```powershell
npm install
npm run web
```

Expo Go가 설치된 Android 휴대폰과 같은 네트워크에서 UI를 확인하려면 다음을 실행하고 표시되는 QR을 스캔합니다.

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

EAS 빌드 전에는 dashboard의 preview/production 환경에 세 공개 환경변수를 등록합니다. production API 주소에는 localhost나 사설 LAN 주소를 넣지 않습니다.

## Android 배포

```powershell
# 휴대폰 직접 설치용 APK
npm run build:apk

# Google Play 업로드용 AAB
npm run build:play
```

Google Play 제출은 첫 출시부터 production으로 보내지 않고 internal 테스트의 draft 상태로 시작합니다.

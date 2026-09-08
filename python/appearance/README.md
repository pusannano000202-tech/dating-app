# 외모 분석 서버

승인된 기준사진과 OpenAI Vision을 사용해 내부 매칭용 외모 점수와 외모 유형을 계산합니다.
이 서버는 브라우저나 모바일 앱이 직접 호출하지 않습니다. Next.js의 `/api/score`가
서버 전용 비밀값으로 호출하고, 결과는 Next.js가 Supabase 비공개 테이블에 저장합니다.

## 실행

```bash
cd python/appearance
cp .env.example .env
pip install -r requirements-runtime.txt
python main.py
```

서버: `http://localhost:8001`

## Photo URL security

`POST /api/score-photos` only accepts HTTPS image URLs from exact hostnames in
`APPEARANCE_ALLOWED_PHOTO_HOSTS` plus the hostname in
`NEXT_PUBLIC_SUPABASE_URL`. Userinfo is forbidden, and only no port or port
`443` is allowed. The combined allowlist fails closed when empty. Use storage
hostnames only, for example:

```env
APPEARANCE_ALLOWED_PHOTO_HOSTS=your-project.supabase.co
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
```

Validation responses intentionally omit submitted URLs and credentials.

## 엔드포인트

### `POST /api/score-photos`
```json
{ "user_id": "uuid", "photo_urls": ["https://..."] }
```
요청 헤더: `Authorization: Bearer <AI_SERVER_SECRET>`

응답에는 Next.js 서버가 비공개 저장에 사용하는 점수, 외모 유형, 모델·프롬프트·기준사진
버전이 포함됩니다. 이 응답을 클라이언트에 그대로 전달하면 안 됩니다.

### `GET /health`
서버/모델 상태 확인

Vercel 배포에서는 같은 응답을 `GET /api/health`에서도 확인할 수 있습니다.

## Docker로 실행

```bash
cd python/appearance
docker build -t appearance-ai .
docker run -p 8001:8001 \
  -e OPENAI_API_KEY=... \
  -e AI_SERVER_SECRET=... \
  -e NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co \
  -e APPEARANCE_ALLOWED_PHOTO_HOSTS=your-project.supabase.co \
  appearance-ai
```

## Docker Compose로 실행 (권장)

프로젝트 루트에서:

```bash
# .env 파일 준비
cp python/appearance/.env.example python/appearance/.env
# OPENAI_API_KEY, AI_SERVER_SECRET, Supabase URL 입력

docker compose up appearance-ai
```

## 테스트

```bash
cd python/appearance
pip install -r requirements-dev.txt
make test        # pytest 실행
make lint        # ruff 린트

# 서버 실행 후 통합 테스트
python test_server.py
```

## Vercel에 별도 서비스로 배포

기존 `dating-app` 웹 프로젝트와 같은 Vercel 계정을 사용하되, 새 프로젝트의 Root Directory를
`python/appearance`로 지정합니다. 별도 Render·Railway 계정은 필요하지 않습니다.

필수 환경값:

- `OPENAI_API_KEY`
- `AI_SERVER_SECRET` (웹 프로젝트의 값과 동일)
- `NEXT_PUBLIC_SUPABASE_URL`
- `APPEARANCE_ALLOWED_PHOTO_HOSTS`
- `APPEARANCE_ANCHOR_BASE_URL`

배포 후 `https://<appearance-project>.vercel.app/api/health`가
`status=ok`, `analyzer_ready=true`인지 확인하고, 웹 프로젝트의 `AI_SERVER_URL`에는
도메인만 입력합니다. 예: `https://<appearance-project>.vercel.app`.

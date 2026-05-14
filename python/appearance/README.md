# 외모 AI 추론 서버

충현 담당 모듈. SCUT-FBP5500 + ResNet50 기반 외모 점수 산출 후 Supabase에 저장.

## 실행

```bash
cd python/appearance
cp .env.example .env   # Supabase URL/Key 입력
pip install -r requirements.txt
python main.py
```

서버: `http://localhost:8001`

## 엔드포인트

### `POST /api/score-photos`
```json
{ "user_id": "uuid", "photo_urls": ["https://..."] }
```
응답: `{ "status": "ok" }` — 점수는 응답에 포함하지 않음 (Supabase에만 저장)

### `GET /health`
서버/모델 상태 확인

## Docker로 실행

```bash
cd python/appearance
docker build -t appearance-ai .
docker run -p 8001:8001 \
  -e SUPABASE_URL=https://... \
  -e SUPABASE_SERVICE_KEY=... \
  -v $(pwd)/weights:/app/weights \
  -e MODEL_WEIGHTS_PATH=/app/weights/resnet50_scut.pth \
  appearance-ai
```

## 모델 가중치

`weights/resnet50_scut.pth` 위치에 SCUT-FBP5500으로 파인튜닝된 가중치 파일을 넣으면 된다.
파일이 없으면 ImageNet pretrained backbone으로 동작 (개발/테스트용).

가중치 파일은 용량이 크므로 Git에 포함하지 않는다. 별도 공유.

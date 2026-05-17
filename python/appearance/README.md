# 외모 AI 추론 서버

충현 담당 모듈. SCUT-FBP5500 + **ResNeXt-50** 기반 외모 점수 산출 후 Supabase에 저장.

## 외모 절대점수 구현 전략 (2026-05-17 확정)

**1단계 (현재):** SCUT-FBP5500 공식 가중치 (ResNeXt-50) 적용  
→ 공식 레포: https://github.com/HCIILAB/SCUT-FBP5500-Database-Release  
→ 가중치 파일: `weights/resnext50_scut.pth`

**2단계 (출시 전):** 한국인 보정 레이어 추가  
→ SCUT 점수를 한국 대학생 기준으로 calibration

**3단계 (출시 후):** 실서비스 데이터로 fine-tuning  
→ 자체 한국형 외모 평가 모델로 진화

> ResNet50 → ResNeXt-50으로 변경한 이유: 공식 SCUT 가중치가 ResNeXt-50으로 학습됨

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

## Docker Compose로 실행 (권장)

프로젝트 루트에서:

```bash
# .env 파일 준비
cp python/appearance/.env.example python/appearance/.env
# (SUPABASE_URL, SUPABASE_SERVICE_KEY 입력)

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

## 모델 가중치

`weights/resnext50_scut.pth` 위치에 SCUT-FBP5500 공식 가중치 파일을 넣으면 된다.  
파일이 없으면 ImageNet pretrained backbone으로 동작 (개발/테스트용, 점수 의미 없음).

가중치 파일은 용량이 크므로 Git에 포함하지 않는다. 별도 공유.

**공식 가중치 출처:** https://github.com/HCIILAB/SCUT-FBP5500-Database-Release (trained_models_for_pytorch/)

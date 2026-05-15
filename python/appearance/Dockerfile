FROM python:3.11-slim

# 비-루트 사용자 생성 (보안)
RUN groupadd -r appuser && useradd -r -g appuser appuser

WORKDIR /app

# torch는 크기가 크므로 캐시 레이어 분리
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# weights 디렉토리 소유권 부여 (볼륨 마운트 대응)
RUN mkdir -p /app/weights && chown -R appuser:appuser /app

USER appuser

# 모델 가중치 파일은 볼륨 마운트로 주입 (이미지에 포함 X)
# docker run -v /host/weights:/app/weights -e MODEL_WEIGHTS_PATH=/app/weights/resnet50_scut.pth ...

EXPOSE 8001

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]

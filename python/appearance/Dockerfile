FROM python:3.11-slim

WORKDIR /app

# torch는 크기가 크므로 캐시 레이어 분리
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# 모델 가중치 파일은 볼륨 마운트로 주입 (이미지에 포함 X)
# docker run -v /host/weights:/app/weights -e MODEL_WEIGHTS_PATH=/app/weights/resnet50_scut.pth ...

EXPOSE 8001

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]

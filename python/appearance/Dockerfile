FROM python:3.11-slim

RUN groupadd -r appuser && useradd -r -g appuser appuser

WORKDIR /app/python/appearance

COPY python/appearance/requirements-runtime.txt ./requirements-runtime.txt
RUN pip install --no-cache-dir -r requirements-runtime.txt

COPY python/appearance/*.py ./
COPY data/appearance-calibration-v2/approved-anchors.json /app/data/appearance-calibration-v2/approved-anchors.json

RUN chown -R appuser:appuser /app

USER appuser

EXPOSE 8001

CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8001}"]

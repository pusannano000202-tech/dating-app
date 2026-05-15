.PHONY: dev test lint install docker-build docker-up

install:
	pip install -r requirements-dev.txt

dev:
	uvicorn main:app --reload --host 0.0.0.0 --port 8001

test:
	pytest tests/

lint:
	ruff check .

docker-build:
	docker build -t appearance-ai .

docker-up:
	docker compose -f ../../docker-compose.yml up appearance-ai

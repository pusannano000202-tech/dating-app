"""
외모 AI 추론 서버 (충현 담당)
POST /api/score-photos  →  사진 URL 목록 받아 외모 점수 산출 후 Supabase 저장
점수 결과는 응답에 포함하지 않는다. (INTERFACE_CONTRACT.md 참고)
"""
import os
import logging
import time
from contextlib import asynccontextmanager
from typing import Annotated

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator, HttpUrl

from model import build_model, score_photos
from supabase_client import save_appearance_score

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

_model = None

# 허용 오리진 (환경변수로 재정의 가능)
_ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,https://dating-app.vercel.app"
).split(",")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _model
    weights_path = os.getenv("MODEL_WEIGHTS_PATH", "")
    logger.info("외모 AI 모델 로딩 중...")
    _model = build_model(weights_path if weights_path else None)
    logger.info("외모 AI 모델 로드 완료 (weights=%s)", weights_path or "ImageNet pretrained")
    yield
    _model = None
    logger.info("서버 종료")


app = FastAPI(
    title="외모 AI 서버",
    description="SCUT-FBP5500 기반 외모 점수 산출 서버",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)


class ScoreRequest(BaseModel):
    user_id: str
    photo_urls: list[str]

    @field_validator("user_id")
    @classmethod
    def validate_user_id(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("user_id는 비어있을 수 없습니다")
        if len(v) > 128:
            raise ValueError("user_id가 너무 깁니다")
        return v

    @field_validator("photo_urls")
    @classmethod
    def validate_photos(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("사진이 최소 1장 필요합니다")
        if len(v) > 5:
            raise ValueError("사진은 최대 5장까지 허용됩니다")
        # URL 형식 기본 검증
        for url in v:
            if not url.startswith(("https://", "http://")):
                raise ValueError(f"유효하지 않은 URL: {url}")
        return v


class ScoreResponse(BaseModel):
    status: str          # "ok" | "error"
    message: str | None = None


@app.post("/api/score-photos", response_model=ScoreResponse)
async def score_photos_endpoint(req: ScoreRequest) -> ScoreResponse:
    if _model is None:
        raise HTTPException(status_code=503, detail="모델이 준비되지 않았습니다")

    t0 = time.perf_counter()
    try:
        raw_score = score_photos(_model, req.photo_urls)
        save_appearance_score(req.user_id, raw_score)
        elapsed = round((time.perf_counter() - t0) * 1000)
        logger.info(
            "점수 저장 완료: user_id=%s score=%.1f elapsed=%dms photos=%d",
            req.user_id, raw_score, elapsed, len(req.photo_urls)
        )
        return ScoreResponse(status="ok")

    except ValueError as e:
        logger.warning("입력 오류: user_id=%s error=%s", req.user_id, e)
        return ScoreResponse(status="error", message=str(e))

    except ConnectionError as e:
        logger.error("이미지 다운로드 실패: user_id=%s error=%s", req.user_id, e)
        return ScoreResponse(status="error", message="사진을 불러올 수 없습니다")

    except Exception as e:
        logger.exception("점수 산출 실패: user_id=%s", req.user_id)
        return ScoreResponse(status="error", message="점수 산출 중 오류가 발생했습니다")


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "model_loaded": _model is not None,
        "version": "1.0.0",
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8001"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)

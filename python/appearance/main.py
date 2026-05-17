"""
외모 AI 추론 서버 (충현 담당)
POST /api/score-photos  →  사진 URL 목록 받아 외모 점수 산출 후 Supabase 저장
점수 결과는 응답에 포함하지 않는다. (INTERFACE_CONTRACT.md 참고)
"""
import os
import logging
import time
import uuid
from contextlib import asynccontextmanager
from typing import Annotated

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, field_validator, HttpUrl

from model import build_model, score_photos, load_image_from_url
from supabase_client import save_appearance_score
from clip_classifier import load_clip_model, classify_type, get_top_type

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
    load_clip_model()
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


@app.middleware("http")
async def add_request_id(request: Request, call_next) -> Response:
    """각 요청에 X-Request-ID 헤더를 부여해 로그 추적을 용이하게 한다."""
    req_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    response: Response = await call_next(request)
    response.headers["X-Request-ID"] = req_id
    return response


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
async def score_photos_endpoint(
    req: ScoreRequest,
    request: Request,
) -> ScoreResponse:
    if _model is None:
        raise HTTPException(status_code=503, detail="모델이 준비되지 않았습니다")

    req_id = request.headers.get("X-Request-ID", "-")
    t0 = time.perf_counter()
    try:
        raw_score = score_photos(_model, req.photo_urls)
        save_appearance_score(req.user_id, raw_score)
        elapsed = round((time.perf_counter() - t0) * 1000)
        logger.info(
            "점수 저장 완료: req_id=%s user_id=%s score=%.1f elapsed=%dms photos=%d",
            req_id, req.user_id, raw_score, elapsed, len(req.photo_urls)
        )
        return ScoreResponse(status="ok")

    except ValueError as e:
        logger.warning("입력 오류: req_id=%s user_id=%s error=%s", req_id, req.user_id, e)
        return ScoreResponse(status="error", message=str(e))

    except ConnectionError as e:
        logger.error("이미지 다운로드 실패: req_id=%s user_id=%s error=%s", req_id, req.user_id, e)
        return ScoreResponse(status="error", message="사진을 불러올 수 없습니다")

    except Exception as e:
        logger.exception("점수 산출 실패: req_id=%s user_id=%s", req_id, req.user_id)
        return ScoreResponse(status="error", message="점수 산출 중 오류가 발생했습니다")


class AnalyzeRequest(BaseModel):
    photo_url: str
    gender: str = "female"

    @field_validator("gender")
    @classmethod
    def validate_gender(cls, v: str) -> str:
        if v not in ("female", "male"):
            raise ValueError("gender는 'female' 또는 'male'")
        return v

    @field_validator("photo_url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        if not v.startswith(("https://", "http://")):
            raise ValueError("유효하지 않은 URL")
        return v


class AnalyzeResponse(BaseModel):
    status: str
    appearance_score: float | None = None   # 0~100 절대외모점수
    top_type: str | None = None             # 최고점 타입
    type_scores: dict | None = None         # 타입별 점수 (합계 100)
    message: str | None = None


@app.post("/api/analyze", response_model=AnalyzeResponse)
async def analyze_endpoint(req: AnalyzeRequest) -> AnalyzeResponse:
    """
    성능 테스트용 — 사진 1장 URL을 받아 절대외모점수 + 타입 분류 결과를 즉시 반환.
    (실서비스용 /api/score-photos 와 달리 결과를 응답에 포함함)
    """
    if _model is None:
        raise HTTPException(status_code=503, detail="모델이 준비되지 않았습니다")
    try:
        img = load_image_from_url(req.photo_url)

        # 절대외모점수
        from model import score_image
        score = score_image(_model, img)

        # 타입 분류
        type_scores = classify_type(img, gender=req.gender)
        top = get_top_type(type_scores)

        return AnalyzeResponse(
            status="ok",
            appearance_score=round(score, 1),
            top_type=top,
            type_scores=type_scores,
        )
    except Exception as e:
        logger.exception("analyze 실패: %s", e)
        return AnalyzeResponse(status="error", message=str(e))


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

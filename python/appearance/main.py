"""
외모 AI 추론 서버 (충현 담당)
POST /api/score-photos  →  사진 URL 목록 받아 외모 점수 산출 후 Supabase 저장
점수 결과는 응답에 포함하지 않는다. (INTERFACE_CONTRACT.md 참고)
"""
import os
import logging
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, field_validator

from model import build_model, score_photos
from supabase_client import save_appearance_score

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

_model = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _model
    weights_path = os.getenv("MODEL_WEIGHTS_PATH", "")
    _model = build_model(weights_path if weights_path else None)
    logger.info("외모 AI 모델 로드 완료")
    yield
    _model = None


app = FastAPI(title="외모 AI 서버", lifespan=lifespan)


class ScoreRequest(BaseModel):
    user_id: str
    photo_urls: list[str]

    @field_validator("photo_urls")
    @classmethod
    def validate_photos(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("사진이 최소 1장 필요합니다")
        if len(v) > 5:
            raise ValueError("사진은 최대 5장까지 허용됩니다")
        return v


class ScoreResponse(BaseModel):
    status: str          # "ok" | "error"
    message: str | None = None


@app.post("/api/score-photos", response_model=ScoreResponse)
async def score_photos_endpoint(req: ScoreRequest) -> ScoreResponse:
    if _model is None:
        raise HTTPException(status_code=503, detail="모델이 준비되지 않았습니다")

    try:
        raw_score = score_photos(_model, req.photo_urls)
        save_appearance_score(req.user_id, raw_score)
        logger.info("외모 점수 저장 완료: user_id=%s", req.user_id)
        return ScoreResponse(status="ok")
    except ValueError as e:
        logger.warning("입력 오류: %s", e)
        return ScoreResponse(status="error", message=str(e))
    except Exception as e:
        logger.error("점수 산출 실패: user_id=%s, error=%s", req.user_id, e)
        return ScoreResponse(status="error", message="점수 산출 중 오류가 발생했습니다")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "model_loaded": _model is not None}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8001"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)

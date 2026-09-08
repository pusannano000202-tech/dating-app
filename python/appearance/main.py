"""Internal OpenAI-backed profile-photo analysis service."""

import logging
import os
import secrets
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Literal
from urllib.parse import urlparse

from dotenv import dotenv_values
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, field_validator

from openai_analyzer import OpenAIAppearanceAnalyzer


def find_root_env_file(module_file: Path) -> Path | None:
    """Return the nearest .env.local above the service file, if present."""
    for directory in module_file.resolve().parents:
        candidate = directory / ".env.local"
        if candidate.is_file():
            return candidate
    return None


ROOT_ENV = find_root_env_file(Path(__file__))
if ROOT_ENV:
    for _key, _value in dotenv_values(ROOT_ENV).items():
        if _key and _value and not os.environ.get(_key):
            os.environ[_key] = _value

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

_analyzer: OpenAIAppearanceAnalyzer | None = None

_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:3003,https://dating-app-silk.vercel.app",
    ).split(",")
    if origin.strip()
]


def configured_photo_hosts() -> set[str]:
    """Return the exact hosts allowed to supply profile photos."""
    hosts = {
        host.strip().lower().rstrip(".")
        for host in os.getenv("APPEARANCE_ALLOWED_PHOTO_HOSTS", "").split(",")
        if host.strip()
    }
    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "").strip()
    if supabase_url:
        try:
            hostname = urlparse(supabase_url).hostname
        except ValueError:
            hostname = None
        if hostname:
            hosts.add(hostname.lower().rstrip("."))
    return hosts


def is_allowed_photo_url(value: str) -> bool:
    """Validate a public image URL without allowing arbitrary remote fetches."""
    try:
        parsed = urlparse(value)
        port = parsed.port
    except ValueError:
        return False

    hostname = parsed.hostname.lower().rstrip(".") if parsed.hostname else ""
    return (
        parsed.scheme == "https"
        and bool(hostname)
        and "@" not in parsed.netloc
        and port in (None, 443)
        and hostname in configured_photo_hosts()
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _analyzer
    try:
        _analyzer = OpenAIAppearanceAnalyzer()
        logger.info("OpenAI appearance analyzer is ready")
    except Exception:
        _analyzer = None
        logger.exception("OpenAI appearance analyzer failed to initialize")
    yield
    _analyzer = None


app = FastAPI(
    title="Quantum appearance analysis",
    description="Internal structured profile-photo analysis service",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization", "X-Request-ID"],
)


@app.middleware("http")
async def add_request_id(request: Request, call_next) -> Response:
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    response: Response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


class ScoreRequest(BaseModel):
    user_id: str
    photo_urls: list[str]
    gender_bank: Literal["female", "male"]

    @field_validator("user_id")
    @classmethod
    def validate_user_id(cls, value: str) -> str:
        value = value.strip()
        if not value or len(value) > 128:
            raise ValueError("invalid user_id")
        return value

    @field_validator("photo_urls")
    @classmethod
    def validate_photos(cls, values: list[str]) -> list[str]:
        if not 1 <= len(values) <= 3:
            raise ValueError("one to three photos are required")
        if any(
            not isinstance(value, str) or len(value) > 2048 or not is_allowed_photo_url(value)
            for value in values
        ):
            raise ValueError("invalid photo URL")
        return values


class ScoreResponse(BaseModel):
    status: Literal["ok", "error"]
    score_0_100: float | None = None
    appearance_type: str | None = None
    confidence: float | None = None
    model_version: str | None = None
    prompt_version: str | None = None
    anchor_manifest_version: str | None = None
    reject_code: str | None = None


@app.exception_handler(RequestValidationError)
async def score_request_validation_error(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    """Keep rejected photo URLs and request data out of client responses."""
    if request.url.path == "/api/score-photos":
        return JSONResponse(
            status_code=422,
            content={"status": "error", "code": "invalid_score_request"},
        )
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


@app.post("/api/score-photos", response_model=ScoreResponse)
async def score_photos_endpoint(
    req: ScoreRequest,
    authorization: Annotated[str | None, Header()] = None,
):
    expected_secret = os.getenv("AI_SERVER_SECRET", "").strip()
    if len(expected_secret) < 32:
        raise HTTPException(status_code=503, detail="AI server auth is not configured")

    prefix = "Bearer "
    provided_secret = (
        authorization[len(prefix) :].strip()
        if authorization and authorization.startswith(prefix)
        else ""
    )
    if not provided_secret or not secrets.compare_digest(provided_secret, expected_secret):
        raise HTTPException(status_code=401, detail="Unauthorized")

    if _analyzer is None:
        raise HTTPException(status_code=503, detail="AI analyzer is not ready")

    try:
        analysis = _analyzer.analyze(req.photo_urls, gender_bank=req.gender_bank)
    except Exception as exc:
        if getattr(exc, "code", None) == "insufficient_quota":
            logger.warning("OpenAI appearance-analysis quota is unavailable")
            return JSONResponse(
                status_code=503,
                content={
                    "status": "error",
                    "code": "analysis_quota_unavailable",
                },
            )
        logger.exception("Profile-photo analysis failed")
        return JSONResponse(
            status_code=502,
            content={"status": "error", "code": "analysis_unavailable"},
        )

    if analysis.status == "reject":
        return JSONResponse(
            status_code=422,
            content={
                "status": "error",
                "code": f"photo_{analysis.reject_code}",
            },
        )

    return ScoreResponse(
        status="ok",
        score_0_100=float(analysis.score_0_100),
        appearance_type=analysis.appearance_type,
        confidence=analysis.confidence_0_1,
        model_version=analysis.analysis_metadata.model_version,
        prompt_version=analysis.analysis_metadata.prompt_version,
        anchor_manifest_version=analysis.analysis_metadata.anchor_manifest_version,
        reject_code="none",
    )


@app.get("/health")
@app.get("/api/health", include_in_schema=False)
async def health() -> dict:
    return {
        "status": "ok",
        "analyzer_ready": _analyzer is not None,
        "version": "2.0.0",
    }


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8001"))
    uvicorn.run("main:app", host="127.0.0.1", port=port, reload=True)

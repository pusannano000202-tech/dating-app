"""Service-only persistence for private appearance-analysis scores."""

import logging
import os
from datetime import datetime, timezone

from supabase import Client, create_client

logger = logging.getLogger(__name__)
PROVIDER = "openai"
MODEL_VERSION = os.getenv("OPENAI_APPEARANCE_MODEL", "gpt-5.6-terra")
PROMPT_VERSION = "calibrated-v1"
ANCHOR_VERSION = "approved-v1"
APPEARANCE_TYPES = {"cute", "pure", "chic", "warm", "stylish", "healthy"}

_client: Client | None = None


def get_client() -> Client:
    global _client
    if _client is None:
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_KEY")
        if not url or not key:
            raise EnvironmentError(
                "SUPABASE_URL and SUPABASE_SERVICE_KEY must be configured"
            )
        _client = create_client(url, key)
    return _client


def save_appearance_score(
    user_id: str,
    photo_revision: str,
    score_raw: float,
    appearance_type: str,
) -> None:
    """Store a completed score only in the service-owned private table."""
    if not isinstance(photo_revision, str) or not photo_revision.strip():
        raise ValueError("photo_revision is required")
    if not (0.0 <= score_raw <= 100.0):
        raise ValueError("score_raw must be between 0 and 100")
    if appearance_type not in APPEARANCE_TYPES:
        raise ValueError("appearance_type is invalid")

    now_iso = datetime.now(timezone.utc).isoformat()
    payload = {
        "user_id": user_id,
        "photo_revision": photo_revision,
        "status": "ready",
        "lease_expires_at": None,
        "provider": PROVIDER,
        "model_version": MODEL_VERSION,
        "prompt_version": PROMPT_VERSION,
        "anchor_version": ANCHOR_VERSION,
        "score_raw": score_raw,
        "score_normalized": round(score_raw / 100.0, 6),
        "error_code": None,
        "analyzed_at": now_iso,
        "updated_at": now_iso,
    }
    payload["appearance_type"] = appearance_type

    try:
        get_client().table("private_appearance_scores").upsert(payload).execute()
    except Exception:
        logger.error("Private appearance score save failed: user_id=%s", user_id)
        raise

    logger.debug("Private appearance score saved: user_id=%s", user_id)

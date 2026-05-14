"""
Supabase 저장 로직.
appearance_scores (raw) + profiles.appearance_score_normalized 업데이트.
"""
import os
import logging
from datetime import datetime, timezone
from supabase import create_client, Client

logger = logging.getLogger(__name__)
MODEL_VERSION = "resnet50-scut-v1"

_client: Client | None = None


def get_client() -> Client:
    global _client
    if _client is None:
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_KEY")
        if not url or not key:
            raise EnvironmentError(
                "SUPABASE_URL, SUPABASE_SERVICE_KEY 환경변수가 필요합니다"
            )
        _client = create_client(url, key)
    return _client


def save_appearance_score(user_id: str, score_raw: float) -> None:
    """
    1) appearance_scores 에 원본 점수 upsert
    2) profiles 에 0~1 정규화 점수 upsert
    절대 외부(응답)에 score_raw 를 노출하지 않는다.
    """
    if not (0.0 <= score_raw <= 100.0):
        raise ValueError(f"점수 범위 오류: {score_raw} (0~100 범위여야 함)")

    client = get_client()
    score_normalized = round(score_raw / 100.0, 6)
    now_iso = datetime.now(timezone.utc).isoformat()

    try:
        client.table("appearance_scores").upsert({
            "user_id": user_id,
            "score_raw": score_raw,
            "model_version": MODEL_VERSION,
            "scored_at": now_iso,
        }).execute()
        logger.debug("appearance_scores 저장 완료: user_id=%s", user_id)
    except Exception as e:
        logger.error("appearance_scores 저장 실패: user_id=%s error=%s", user_id, e)
        raise

    try:
        client.table("profiles").upsert({
            "user_id": user_id,
            "appearance_score_normalized": score_normalized,
            "updated_at": now_iso,
        }).execute()
        logger.debug("profiles 정규화 점수 저장 완료: user_id=%s score=%.4f", user_id, score_normalized)
    except Exception as e:
        logger.error("profiles 업데이트 실패: user_id=%s error=%s", user_id, e)
        raise

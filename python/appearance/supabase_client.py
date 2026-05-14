"""
Supabase 저장 로직.
appearance_scores (raw) + profiles.appearance_score_normalized 업데이트.
"""
import os
from datetime import datetime, timezone
from supabase import create_client, Client

MODEL_VERSION = "resnet50-scut-v1"


def get_client() -> Client:
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_KEY"]
    return create_client(url, key)


def save_appearance_score(user_id: str, score_raw: float) -> None:
    """
    1) appearance_scores 에 원본 점수 upsert
    2) profiles 에 0~1 정규화 점수 upsert
    절대 외부(응답)에 score_raw 를 노출하지 않는다.
    """
    client = get_client()
    score_normalized = round(score_raw / 100.0, 6)

    # appearance_scores upsert
    client.table("appearance_scores").upsert({
        "user_id": user_id,
        "score_raw": score_raw,
        "model_version": MODEL_VERSION,
        "scored_at": datetime.now(timezone.utc).isoformat(),
    }).execute()

    # profiles upsert (appearance_score_normalized 만 업데이트)
    client.table("profiles").upsert({
        "user_id": user_id,
        "appearance_score_normalized": score_normalized,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).execute()

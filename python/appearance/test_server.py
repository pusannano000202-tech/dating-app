"""
외모 AI 서버 로컬 테스트 스크립트.
서버가 실행 중일 때 실행: python test_server.py
"""

import os
import sys

import requests

BASE_URL = os.getenv("AI_SERVER_URL", "http://localhost:8001").rstrip("/")
AI_SERVER_SECRET = os.getenv("AI_SERVER_SECRET", "")
TEST_USER_ID = "00000000-0000-0000-0000-000000000001"
TEST_IMAGE_URL = os.getenv("APPEARANCE_TEST_PHOTO_URL", "")


def test_health():
    resp = requests.get(f"{BASE_URL}/health", timeout=5)
    assert resp.status_code == 200, f"health 실패: {resp.status_code}"
    data = resp.json()
    assert data["status"] == "ok", f"unexpected status: {data}"
    print(f"/health OK - analyzer_ready={data['analyzer_ready']}")


def test_score_photos_ok():
    if not AI_SERVER_SECRET or not TEST_IMAGE_URL:
        raise RuntimeError("AI_SERVER_SECRET and APPEARANCE_TEST_PHOTO_URL are required")
    resp = requests.post(
        f"{BASE_URL}/api/score-photos",
        json={
            "user_id": TEST_USER_ID,
            "photo_urls": [TEST_IMAGE_URL],
            "gender_bank": "male",
        },
        headers={"Authorization": f"Bearer {AI_SERVER_SECRET}"},
        timeout=90,
    )
    assert resp.status_code == 200, f"score-photos 실패: {resp.status_code} {resp.text}"
    data = resp.json()
    assert data["status"] in ("ok", "error"), f"unexpected status: {data}"
    print(f"/api/score-photos OK - status={data['status']}")


def test_score_photos_validation():
    # 빈 photo_urls 는 에러 응답 (422)
    resp = requests.post(
        f"{BASE_URL}/api/score-photos",
        json={"user_id": TEST_USER_ID, "photo_urls": [], "gender_bank": "male"},
        headers={"Authorization": f"Bearer {AI_SERVER_SECRET}"},
        timeout=5,
    )
    assert resp.status_code == 422, f"validation 에러 미반환: {resp.status_code}"
    print("empty photo list -> 422 OK")

    # 너무 많은 사진
    resp = requests.post(
        f"{BASE_URL}/api/score-photos",
        json={
            "user_id": TEST_USER_ID,
            "photo_urls": [TEST_IMAGE_URL] * 4,
            "gender_bank": "male",
        },
        headers={"Authorization": f"Bearer {AI_SERVER_SECRET}"},
        timeout=5,
    )
    assert resp.status_code == 422, f"validation 에러 미반환: {resp.status_code}"
    print("more than 3 photos -> 422 OK")


if __name__ == "__main__":
    print(f"서버 주소: {BASE_URL}\n")
    try:
        test_health()
        test_score_photos_ok()
        test_score_photos_validation()
        print("\nAll server checks passed.")
    except Exception as e:
        print(f"\nServer check failed: {e}", file=sys.stderr)
        sys.exit(1)

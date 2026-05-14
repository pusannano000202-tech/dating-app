"""
외모 AI 서버 로컬 테스트 스크립트.
서버가 실행 중일 때 실행: python test_server.py
"""
import sys
import requests

BASE_URL = "http://localhost:8001"
TEST_USER_ID = "00000000-0000-0000-0000-000000000001"
# 공개 이미지 URL (테스트용 — 실제 얼굴 아님)
TEST_IMAGE_URL = "https://picsum.photos/400/600"


def test_health():
    resp = requests.get(f"{BASE_URL}/health", timeout=5)
    assert resp.status_code == 200, f"health 실패: {resp.status_code}"
    data = resp.json()
    assert data["status"] == "ok", f"unexpected status: {data}"
    print(f"✅ /health OK — model_loaded={data['model_loaded']}")


def test_score_photos_ok():
    resp = requests.post(
        f"{BASE_URL}/api/score-photos",
        json={"user_id": TEST_USER_ID, "photo_urls": [TEST_IMAGE_URL]},
        timeout=30,
    )
    assert resp.status_code == 200, f"score-photos 실패: {resp.status_code} {resp.text}"
    data = resp.json()
    assert data["status"] in ("ok", "error"), f"unexpected status: {data}"
    print(f"✅ /api/score-photos OK — status={data['status']}")


def test_score_photos_validation():
    # 빈 photo_urls 는 에러 응답 (422)
    resp = requests.post(
        f"{BASE_URL}/api/score-photos",
        json={"user_id": TEST_USER_ID, "photo_urls": []},
        timeout=5,
    )
    assert resp.status_code == 422, f"validation 에러 미반환: {resp.status_code}"
    print("✅ 빈 사진 목록 → 422 검증 에러 OK")

    # 너무 많은 사진
    resp = requests.post(
        f"{BASE_URL}/api/score-photos",
        json={"user_id": TEST_USER_ID, "photo_urls": [TEST_IMAGE_URL] * 6},
        timeout=5,
    )
    assert resp.status_code == 422, f"validation 에러 미반환: {resp.status_code}"
    print("✅ 6장 초과 → 422 검증 에러 OK")


if __name__ == "__main__":
    print(f"서버 주소: {BASE_URL}\n")
    try:
        test_health()
        test_score_photos_ok()
        test_score_photos_validation()
        print("\n모든 테스트 통과!")
    except Exception as e:
        print(f"\n❌ 테스트 실패: {e}", file=sys.stderr)
        sys.exit(1)

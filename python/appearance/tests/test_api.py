"""Integration tests for the FastAPI appearance endpoint."""

import os
import unittest
from unittest.mock import MagicMock, patch

os.environ.setdefault("AI_SERVER_SECRET", "test-ai-secret")
os.environ.setdefault("APPEARANCE_ALLOWED_PHOTO_HOSTS", "storage.example")
os.environ.setdefault("NEXT_PUBLIC_SUPABASE_URL", "https://project-ref.supabase.co")

from fastapi.testclient import TestClient  # noqa: E402

import main as server_module  # noqa: E402
from main import app  # noqa: E402
from openai_analyzer import (  # noqa: E402
    AppearanceAnalysis,
    AppearanceAnalysisMetadata,
    PhotoQuality,
)

TEST_USER = "00000000-0000-0000-0000-000000000001"
TEST_URL = "https://storage.example/photo.jpg"


def _with_metadata(analysis: AppearanceAnalysis) -> AppearanceAnalysis:
    return analysis.with_metadata(
        AppearanceAnalysisMetadata(
            model_version="gpt-5.6-terra",
            prompt_version="appearance-anchor-v3",
            anchor_manifest_version="approved-v1",
        )
    )


def _analysis_ok(score: int = 75) -> AppearanceAnalysis:
    return _with_metadata(
        AppearanceAnalysis(
            status="ok",
            score_0_100=score,
            appearance_type="warm",
            confidence_0_1=0.84,
            reject_code="none",
            photo_quality=PhotoQuality(
                single_person=True,
                face_visible=True,
                lighting_ok=True,
                blurred=False,
                heavy_filter_suspected=False,
                face_occluded=False,
            ),
        )
    )


def _analysis_rejected(code: str = "no_face") -> AppearanceAnalysis:
    return _with_metadata(
        AppearanceAnalysis(
            status="reject",
            score_0_100=None,
            appearance_type=None,
            confidence_0_1=0.98,
            reject_code=code,
            photo_quality=PhotoQuality(
                single_person=False,
                face_visible=False,
                lighting_ok=True,
                blurred=False,
                heavy_filter_suspected=False,
                face_occluded=False,
            ),
        )
    )


def _patch_analyzer(result: AppearanceAnalysis | None = None):
    analyzer = MagicMock()
    analyzer.analyze.return_value = result or _analysis_ok()
    return patch.object(server_module, "_analyzer", analyzer), analyzer


class TestHealthEndpoint(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_health_ok_when_analyzer_ready(self):
        analyzer_patch, _ = _patch_analyzer()
        with analyzer_patch:
            response = self.client.get("/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")
        self.assertTrue(response.json()["analyzer_ready"])

    def test_health_reports_not_ready(self):
        with patch.object(server_module, "_analyzer", None):
            response = self.client.get("/health")

        self.assertFalse(response.json()["analyzer_ready"])

    def test_vercel_health_alias_uses_the_same_contract(self):
        analyzer_patch, _ = _patch_analyzer()
        with analyzer_patch:
            response = self.client.get("/api/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")
        self.assertTrue(response.json()["analyzer_ready"])


class TestRequestIdMiddleware(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_response_has_request_id_header(self):
        response = self.client.get("/health")
        self.assertIn("x-request-id", response.headers)

    def test_custom_request_id_is_echoed(self):
        response = self.client.get(
            "/health",
            headers={"X-Request-ID": "test-req-abc123"},
        )
        self.assertEqual(response.headers.get("x-request-id"), "test-req-abc123")


class TestScorePhotosEndpoint(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.auth_headers = {"Authorization": "Bearer test-ai-secret"}

    def post_score(self, payload):
        return self.client.post(
            "/api/score-photos",
            json={"gender_bank": "female", **payload},
            headers=self.auth_headers,
        )

    def test_missing_internal_auth_returns_401(self):
        response = self.client.post(
            "/api/score-photos",
            json={"user_id": TEST_USER, "photo_urls": [TEST_URL], "gender_bank": "female"},
        )
        self.assertEqual(response.status_code, 401)

    def test_wrong_internal_auth_returns_401(self):
        response = self.client.post(
            "/api/score-photos",
            json={"user_id": TEST_USER, "photo_urls": [TEST_URL], "gender_bank": "female"},
            headers={"Authorization": "Bearer wrong-secret"},
        )
        self.assertEqual(response.status_code, 401)

    def test_valid_request_returns_internal_score_contract(self):
        analyzer_patch, analyzer = _patch_analyzer(_analysis_ok(82))
        with analyzer_patch:
            response = self.post_score(
                {
                    "user_id": TEST_USER,
                    "photo_urls": [TEST_URL],
                    "gender_bank": "female",
                }
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "status": "ok",
                "score_0_100": 82.0,
                "appearance_type": "warm",
                "confidence": 0.84,
                "model_version": "gpt-5.6-terra",
                "prompt_version": "appearance-anchor-v3",
                "anchor_manifest_version": "approved-v1",
                "reject_code": "none",
            },
        )
        analyzer.analyze.assert_called_once_with([TEST_URL], gender_bank="female")

    def test_rejected_photo_returns_whitelisted_code_without_score(self):
        analyzer_patch, _ = _patch_analyzer(_analysis_rejected("no_face"))
        with analyzer_patch:
            response = self.post_score(
                {
                    "user_id": TEST_USER,
                    "photo_urls": [TEST_URL],
                }
            )

        self.assertEqual(response.status_code, 422)
        self.assertEqual(
            response.json(),
            {"status": "error", "code": "photo_no_face"},
        )

    def test_empty_urls_returns_422(self):
        response = self.post_score({"user_id": TEST_USER, "photo_urls": []})
        self.assertEqual(response.status_code, 422)

    def test_too_many_urls_returns_422(self):
        response = self.post_score(
            {
                "user_id": TEST_USER,
                "photo_urls": [TEST_URL] * 4,
            }
        )
        self.assertEqual(response.status_code, 422)

    def test_invalid_url_returns_422(self):
        response = self.post_score(
            {
                "user_id": TEST_USER,
                "photo_urls": ["not-a-url"],
            }
        )
        self.assertEqual(response.status_code, 422)

    def test_unapproved_photo_host_is_rejected_without_echoing_url(self):
        blocked_url = "https://untrusted.example/photo.jpg"
        analyzer_patch, _ = _patch_analyzer()
        with analyzer_patch:
            response = self.post_score(
                {
                    "user_id": TEST_USER,
                    "photo_urls": [blocked_url],
                }
            )

        self.assertEqual(response.status_code, 422)
        self.assertNotIn(blocked_url, response.text)

    def test_photo_url_rejects_userinfo_and_nonstandard_port(self):
        for blocked_url in (
            "https://user:password@storage.example/photo.jpg",
            "https://storage.example:8443/photo.jpg",
        ):
            with self.subTest(blocked_url=blocked_url):
                analyzer_patch, _ = _patch_analyzer()
                with analyzer_patch:
                    response = self.post_score(
                        {
                            "user_id": TEST_USER,
                            "photo_urls": [blocked_url],
                        }
                    )

                self.assertEqual(response.status_code, 422)
                self.assertNotIn(blocked_url, response.text)

    def test_supabase_hostname_is_allowed(self):
        analyzer_patch, analyzer = _patch_analyzer()
        with analyzer_patch:
            response = self.post_score(
                {
                    "user_id": TEST_USER,
                    "photo_urls": [
                        "https://project-ref.supabase.co/storage/v1/object/private/photo.jpg"
                    ],
                }
            )

        self.assertEqual(response.status_code, 200)
        analyzer.analyze.assert_called_once()

    def test_empty_photo_host_allowlist_fails_closed(self):
        with patch.dict(
            os.environ,
            {
                "APPEARANCE_ALLOWED_PHOTO_HOSTS": "",
                "NEXT_PUBLIC_SUPABASE_URL": "",
            },
            clear=False,
        ):
            analyzer_patch, _ = _patch_analyzer()
            with analyzer_patch:
                response = self.post_score(
                    {
                        "user_id": TEST_USER,
                        "photo_urls": [TEST_URL],
                    }
                )

        self.assertEqual(response.status_code, 422)
        self.assertNotIn(TEST_URL, response.text)

    def test_analyzer_not_ready_returns_503(self):
        with patch.object(server_module, "_analyzer", None):
            response = self.post_score(
                {
                    "user_id": TEST_USER,
                    "photo_urls": [TEST_URL],
                }
            )
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"], "AI analyzer is not ready")

    def test_analyzer_exception_returns_safe_error(self):
        analyzer = MagicMock()
        analyzer.analyze.side_effect = RuntimeError("provider detail")
        with patch.object(server_module, "_analyzer", analyzer):
            response = self.post_score(
                {
                    "user_id": TEST_USER,
                    "photo_urls": [TEST_URL],
                }
            )

        self.assertEqual(response.status_code, 502)
        self.assertEqual(
            response.json(),
            {"status": "error", "code": "analysis_unavailable"},
        )
        self.assertNotIn("provider detail", response.text)

    def test_provider_quota_error_returns_safe_actionable_code(self):
        class ProviderQuotaError(RuntimeError):
            code = "insufficient_quota"

        analyzer = MagicMock()
        analyzer.analyze.side_effect = ProviderQuotaError("billing detail")
        with patch.object(server_module, "_analyzer", analyzer):
            response = self.post_score(
                {
                    "user_id": TEST_USER,
                    "photo_urls": [TEST_URL],
                }
            )

        self.assertEqual(response.status_code, 503)
        self.assertEqual(
            response.json(),
            {"status": "error", "code": "analysis_quota_unavailable"},
        )
        self.assertNotIn("billing detail", response.text)


if __name__ == "__main__":
    unittest.main()

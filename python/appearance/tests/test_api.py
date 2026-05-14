"""Integration tests for the FastAPI endpoints using httpx TestClient."""
import unittest
from unittest.mock import patch, MagicMock

import torch.nn as nn
from fastapi.testclient import TestClient

import main as server_module
from main import app

TEST_USER = "00000000-0000-0000-0000-000000000001"
TEST_URL = "https://picsum.photos/400/600"

_DUMMY_MODEL = MagicMock(spec=nn.Module)
_DUMMY_MODEL.return_value.__getitem__ = lambda s, i: 3.5


def _patch_model():
    return patch.object(server_module, "_model", _DUMMY_MODEL)

def _patch_save():
    return patch("main.save_appearance_score", return_value=None)

def _patch_score():
    return patch("main.score_photos", return_value=75.0)


class TestHealthEndpoint(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_health_ok(self):
        with _patch_model():
            resp = self.client.get("/health")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "ok")
        self.assertIn("model_loaded", data)

    def test_health_model_loaded_false_when_none(self):
        with patch.object(server_module, "_model", None):
            resp = self.client.get("/health")
        data = resp.json()
        self.assertFalse(data["model_loaded"])


class TestScorePhotosEndpoint(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_valid_request_returns_ok(self):
        with _patch_model(), _patch_score(), _patch_save():
            resp = self.client.post("/api/score-photos", json={
                "user_id": TEST_USER,
                "photo_urls": [TEST_URL],
            })
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["status"], "ok")

    def test_save_called_with_correct_args(self):
        """save_appearance_score must receive the user_id and score from score_photos."""
        expected_score = 82.5
        with _patch_model(), \
             patch("main.score_photos", return_value=expected_score), \
             patch("main.save_appearance_score") as mock_save:
            self.client.post("/api/score-photos", json={
                "user_id": TEST_USER,
                "photo_urls": [TEST_URL],
            })
        mock_save.assert_called_once_with(TEST_USER, expected_score)

    def test_empty_urls_returns_422(self):
        resp = self.client.post("/api/score-photos", json={
            "user_id": TEST_USER,
            "photo_urls": [],
        })
        self.assertEqual(resp.status_code, 422)

    def test_too_many_urls_returns_422(self):
        resp = self.client.post("/api/score-photos", json={
            "user_id": TEST_USER,
            "photo_urls": [TEST_URL] * 6,
        })
        self.assertEqual(resp.status_code, 422)

    def test_empty_user_id_returns_422(self):
        resp = self.client.post("/api/score-photos", json={
            "user_id": "   ",
            "photo_urls": [TEST_URL],
        })
        self.assertEqual(resp.status_code, 422)

    def test_invalid_url_returns_422(self):
        resp = self.client.post("/api/score-photos", json={
            "user_id": TEST_USER,
            "photo_urls": ["not-a-url"],
        })
        self.assertEqual(resp.status_code, 422)

    def test_model_not_loaded_returns_503(self):
        with patch.object(server_module, "_model", None):
            resp = self.client.post("/api/score-photos", json={
                "user_id": TEST_USER,
                "photo_urls": [TEST_URL],
            })
        self.assertEqual(resp.status_code, 503)

    def test_score_connection_error_returns_ok_with_error_status(self):
        """score_photos raising ConnectionError → 200 with status=error."""
        with _patch_model(), patch("main.score_photos", side_effect=ConnectionError("timeout")):
            resp = self.client.post("/api/score-photos", json={
                "user_id": TEST_USER,
                "photo_urls": [TEST_URL],
            })
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["status"], "error")


if __name__ == "__main__":
    unittest.main()

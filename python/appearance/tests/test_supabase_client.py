"""Unit tests for supabase_client.py — no real Supabase connection required."""
import unittest
from unittest.mock import MagicMock, patch
import sys
import types

sys.modules.setdefault(
    "supabase",
    types.SimpleNamespace(Client=object, create_client=MagicMock()),
)
import supabase_client as sc


def _reset_singleton():
    """Clear the module-level _client singleton between tests."""
    sc._client = None


class TestGetClient(unittest.TestCase):
    def setUp(self):
        _reset_singleton()
        self.environment = patch.dict(
            "os.environ",
            {
                "SUPABASE_URL": "https://test.supabase.co",
                "SUPABASE_SERVICE_KEY": "test-service-key",
            },
            clear=False,
        )
        self.environment.start()

    def tearDown(self):
        self.environment.stop()

    def test_missing_env_raises(self):
        with patch.dict("os.environ", {}, clear=True):
            with self.assertRaises(EnvironmentError):
                sc.get_client()

    def test_creates_client_with_env(self):
        mock_client = MagicMock()
        with patch("supabase_client.create_client", return_value=mock_client) as mock_create:
            result = sc.get_client()
        mock_create.assert_called_once_with(
            "https://test.supabase.co", "test-service-key"
        )
        self.assertIs(result, mock_client)

    def test_singleton_returns_same_instance(self):
        mock_client = MagicMock()
        with patch("supabase_client.create_client", return_value=mock_client) as mock_create:
            first = sc.get_client()
            second = sc.get_client()
        mock_create.assert_called_once()
        self.assertIs(first, second)


class TestSaveAppearanceScore(unittest.TestCase):
    def setUp(self):
        _reset_singleton()

    def _make_mock_client(self):
        client = MagicMock()
        client.table.return_value.upsert.return_value.execute.return_value = MagicMock()
        return client

    def test_ready_score_is_upserted_only_to_private_table_with_required_metadata(self):
        mock_client = self._make_mock_client()
        photo_revision = "2a4d9200-0e3e-4cb5-bd61-2930b83ea9bc"

        with patch("supabase_client.get_client", return_value=mock_client):
            sc.save_appearance_score("user-123", photo_revision, 75.0, "warm")

        mock_client.table.assert_called_once_with("private_appearance_scores")
        payload = mock_client.table.return_value.upsert.call_args.args[0]
        self.assertEqual(payload["user_id"], "user-123")
        self.assertEqual(payload["photo_revision"], photo_revision)
        self.assertEqual(payload["status"], "ready")
        self.assertEqual(payload["score_raw"], 75.0)
        self.assertEqual(payload["score_normalized"], 0.75)
        self.assertEqual(payload["provider"], sc.PROVIDER)
        self.assertEqual(payload["model_version"], sc.MODEL_VERSION)
        self.assertEqual(payload["prompt_version"], sc.PROMPT_VERSION)
        self.assertEqual(payload["anchor_version"], sc.ANCHOR_VERSION)
        self.assertIsNotNone(payload["analyzed_at"])
        self.assertIsNone(payload["error_code"])
        self.assertIsNone(payload["lease_expires_at"])
        self.assertEqual(payload["appearance_type"], "warm")

    def test_optional_appearance_type_is_saved_with_ready_score(self):
        mock_client = self._make_mock_client()

        with patch("supabase_client.get_client", return_value=mock_client):
            sc.save_appearance_score(
                "user-123",
                "2a4d9200-0e3e-4cb5-bd61-2930b83ea9bc",
                75.0,
                appearance_type="warm",
            )

        payload = mock_client.table.return_value.upsert.call_args.args[0]
        self.assertEqual(payload["appearance_type"], "warm")

    def test_score_zero_is_valid(self):
        mock_client = self._make_mock_client()
        with patch("supabase_client.get_client", return_value=mock_client):
            sc.save_appearance_score(
                "user-abc", "2a4d9200-0e3e-4cb5-bd61-2930b83ea9bc", 0.0, "cute"
            )

    def test_score_100_is_valid(self):
        mock_client = self._make_mock_client()
        with patch("supabase_client.get_client", return_value=mock_client):
            sc.save_appearance_score(
                "user-abc", "2a4d9200-0e3e-4cb5-bd61-2930b83ea9bc", 100.0, "chic"
            )

    def test_score_below_range_raises(self):
        with patch("supabase_client.get_client", return_value=self._make_mock_client()):
            with self.assertRaises(ValueError):
                sc.save_appearance_score(
                    "user-abc", "2a4d9200-0e3e-4cb5-bd61-2930b83ea9bc", -0.1, "warm"
                )

    def test_score_above_range_raises(self):
        with patch("supabase_client.get_client", return_value=self._make_mock_client()):
            with self.assertRaises(ValueError):
                sc.save_appearance_score(
                    "user-abc", "2a4d9200-0e3e-4cb5-bd61-2930b83ea9bc", 100.1, "warm"
                )

    def test_missing_photo_revision_raises(self):
        with patch("supabase_client.get_client", return_value=self._make_mock_client()):
            with self.assertRaises(ValueError):
                sc.save_appearance_score("user-abc", "", 50.0, "warm")

    def test_invalid_appearance_type_raises(self):
        with patch("supabase_client.get_client", return_value=self._make_mock_client()):
            with self.assertRaises(ValueError):
                sc.save_appearance_score(
                    "user-abc",
                    "2a4d9200-0e3e-4cb5-bd61-2930b83ea9bc",
                    50.0,
                    "unknown",
                )

    def test_first_table_failure_raises(self):
        mock_client = MagicMock()
        mock_client.table.return_value.upsert.return_value.execute.side_effect = RuntimeError("DB error")
        with patch("supabase_client.get_client", return_value=mock_client), patch(
            "supabase_client.logger"
        ):
            with self.assertRaises(RuntimeError):
                sc.save_appearance_score(
                    "user-abc", "2a4d9200-0e3e-4cb5-bd61-2930b83ea9bc", 50.0, "warm"
                )
        self.assertEqual(mock_client.table.call_count, 1)

    def test_normalized_score_is_stored_privately(self):
        captured_args = {}

        def table_side_effect(name):
            tbl = MagicMock()
            def upsert_side_effect(data):
                captured_args[name] = data
                m = MagicMock()
                m.execute.return_value = MagicMock()
                return m
            tbl.upsert.side_effect = upsert_side_effect
            return tbl

        mock_client = MagicMock()
        mock_client.table.side_effect = table_side_effect
        with patch("supabase_client.get_client", return_value=mock_client):
            sc.save_appearance_score(
                "user-abc", "2a4d9200-0e3e-4cb5-bd61-2930b83ea9bc", 80.0, "healthy"
            )

        self.assertEqual(set(captured_args), {"private_appearance_scores"})
        normalized = captured_args["private_appearance_scores"]["score_normalized"]
        self.assertAlmostEqual(normalized, 0.8, places=4)
        self.assertGreaterEqual(normalized, 0.0)
        self.assertLessEqual(normalized, 1.0)


if __name__ == "__main__":
    unittest.main()

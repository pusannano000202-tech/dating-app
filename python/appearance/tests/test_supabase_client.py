"""Unit tests for supabase_client.py — no real Supabase connection required."""
import unittest
from unittest.mock import MagicMock, patch, call

import supabase_client as sc


def _reset_singleton():
    """Clear the module-level _client singleton between tests."""
    sc._client = None


class TestGetClient(unittest.TestCase):
    def setUp(self):
        _reset_singleton()

    def test_missing_env_raises(self):
        with patch.dict("os.environ", {}, clear=True):
            with self.assertRaises(EnvironmentError):
                sc.get_client()

    def test_creates_client_with_env(self):
        mock_client = MagicMock()
        with patch("supabase_client.create_client", return_value=mock_client) as mock_create:
            result = sc.get_client()
        mock_create.assert_called_once()
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

    def test_valid_score_calls_both_tables(self):
        mock_client = self._make_mock_client()
        with patch("supabase_client.get_client", return_value=mock_client):
            sc.save_appearance_score("user-123", 75.0)

        calls = [c[0][0] for c in mock_client.table.call_args_list]
        self.assertIn("appearance_scores", calls)
        self.assertIn("profiles", calls)

    def test_score_zero_is_valid(self):
        mock_client = self._make_mock_client()
        with patch("supabase_client.get_client", return_value=mock_client):
            sc.save_appearance_score("user-abc", 0.0)

    def test_score_100_is_valid(self):
        mock_client = self._make_mock_client()
        with patch("supabase_client.get_client", return_value=mock_client):
            sc.save_appearance_score("user-abc", 100.0)

    def test_score_below_range_raises(self):
        with patch("supabase_client.get_client", return_value=self._make_mock_client()):
            with self.assertRaises(ValueError):
                sc.save_appearance_score("user-abc", -0.1)

    def test_score_above_range_raises(self):
        with patch("supabase_client.get_client", return_value=self._make_mock_client()):
            with self.assertRaises(ValueError):
                sc.save_appearance_score("user-abc", 100.1)

    def test_first_table_failure_raises(self):
        mock_client = MagicMock()
        mock_client.table.return_value.upsert.return_value.execute.side_effect = RuntimeError("DB error")
        with patch("supabase_client.get_client", return_value=mock_client):
            with self.assertRaises(RuntimeError):
                sc.save_appearance_score("user-abc", 50.0)
        self.assertEqual(mock_client.table.call_count, 1)

    def test_second_table_failure_raises(self):
        mock_client = MagicMock()
        results = [MagicMock(), RuntimeError("profiles update failed")]

        def execute_side_effect():
            r = results.pop(0)
            if isinstance(r, Exception):
                raise r
            return r

        mock_client.table.return_value.upsert.return_value.execute.side_effect = execute_side_effect
        with patch("supabase_client.get_client", return_value=mock_client):
            with self.assertRaises(RuntimeError):
                sc.save_appearance_score("user-abc", 50.0)
        self.assertEqual(mock_client.table.call_count, 2)

    def test_normalized_score_precision(self):
        """Normalized score stored in profiles must be in 0.0~1.0."""
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
            sc.save_appearance_score("user-abc", 80.0)

        normalized = captured_args["profiles"]["appearance_score_normalized"]
        self.assertAlmostEqual(normalized, 0.8, places=4)
        self.assertGreaterEqual(normalized, 0.0)
        self.assertLessEqual(normalized, 1.0)


if __name__ == "__main__":
    unittest.main()

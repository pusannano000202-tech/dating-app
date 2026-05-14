"""unit tests for model.py — no HTTP, no GPU required"""
import io
import types
import unittest
from unittest.mock import MagicMock, patch

import torch
import torch.nn as nn
from PIL import Image

from model import build_model, score_image, score_photos, load_image_from_url, SCORE_MIN, SCORE_MAX


def _make_dummy_model(output: float = 3.0) -> nn.Module:
    """Returns a minimal nn.Module that always predicts `output`."""
    model = MagicMock(spec=nn.Module)
    model.return_value = torch.tensor([[output]])
    model.__call__ = model  # make model(x) work
    return model


def _rgb_image(w: int = 64, h: int = 64) -> Image.Image:
    return Image.new("RGB", (w, h), color=(128, 100, 80))


class TestBuildModel(unittest.TestCase):
    def test_build_model_returns_module(self):
        model = build_model(weights_path=None)
        self.assertIsInstance(model, nn.Module)

    def test_build_model_eval_mode(self):
        model = build_model(weights_path=None)
        self.assertFalse(model.training)

    def test_build_model_output_shape(self):
        model = build_model(weights_path=None)
        dummy_input = torch.zeros(1, 3, 224, 224)
        with torch.no_grad():
            out = model(dummy_input)
        self.assertEqual(out.shape, (1, 1))


class TestScoreImage(unittest.TestCase):
    def test_score_in_range(self):
        model = build_model(weights_path=None)
        img = _rgb_image()
        score = score_image(model, img)
        self.assertGreaterEqual(score, 0.0)
        self.assertLessEqual(score, 100.0)

    def test_score_clamp_low(self):
        """When model outputs below SCORE_MIN, result should be 0."""
        model = _make_dummy_model(output=SCORE_MIN - 10)
        img = _rgb_image()
        score = score_image(model, img)
        self.assertAlmostEqual(score, 0.0, places=5)

    def test_score_clamp_high(self):
        """When model outputs above SCORE_MAX, result should be 100."""
        model = _make_dummy_model(output=SCORE_MAX + 10)
        img = _rgb_image()
        score = score_image(model, img)
        self.assertAlmostEqual(score, 100.0, places=5)

    def test_score_midpoint(self):
        midpoint = (SCORE_MIN + SCORE_MAX) / 2
        model = _make_dummy_model(output=midpoint)
        img = _rgb_image()
        score = score_image(model, img)
        self.assertAlmostEqual(score, 50.0, places=3)


class TestScorePhotos(unittest.TestCase):
    def _mock_load(self, img: Image.Image):
        return patch("model.load_image_from_url", return_value=img)

    def test_single_photo(self):
        model = build_model(weights_path=None)
        img = _rgb_image()
        with self._mock_load(img):
            result = score_photos(model, ["https://example.com/a.jpg"])
        self.assertGreaterEqual(result, 0.0)
        self.assertLessEqual(result, 100.0)

    def test_average_of_multiple(self):
        """With identical images the average equals the single score."""
        model = build_model(weights_path=None)
        img = _rgb_image()
        with self._mock_load(img):
            score1 = score_photos(model, ["https://example.com/a.jpg"])
            score3 = score_photos(model, [
                "https://example.com/a.jpg",
                "https://example.com/b.jpg",
                "https://example.com/c.jpg",
            ])
        self.assertAlmostEqual(score1, score3, places=3)

    def test_empty_raises(self):
        model = build_model(weights_path=None)
        with self.assertRaises(ValueError):
            score_photos(model, [])

    def test_partial_failure_uses_successes(self):
        """If some URLs fail, result is average of the successful ones."""
        model = build_model(weights_path=None)
        img = _rgb_image()
        call_count = [0]

        def side_effect(url):
            call_count[0] += 1
            if call_count[0] == 2:
                raise ConnectionError("timeout")
            return img

        with patch("model.load_image_from_url", side_effect=side_effect):
            result = score_photos(model, [
                "https://example.com/ok1.jpg",
                "https://example.com/fail.jpg",
                "https://example.com/ok2.jpg",
            ])
        self.assertGreaterEqual(result, 0.0)
        self.assertLessEqual(result, 100.0)

    def test_all_fail_raises(self):
        model = build_model(weights_path=None)
        with patch("model.load_image_from_url", side_effect=ConnectionError("fail")):
            with self.assertRaises(ConnectionError):
                score_photos(model, ["https://example.com/a.jpg"])


if __name__ == "__main__":
    unittest.main()

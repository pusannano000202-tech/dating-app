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


class TestLoadImageFromUrl(unittest.TestCase):
    def _make_response(self, status_code=200, content_type="image/jpeg", data=None):
        resp = MagicMock()
        resp.status_code = status_code
        resp.headers = {"Content-Type": content_type}
        if data is None:
            img = Image.new("RGB", (64, 64), color=(100, 100, 100))
            buf = io.BytesIO()
            img.save(buf, format="JPEG")
            data = buf.getvalue()
        resp.raise_for_status = MagicMock()
        resp.iter_content = MagicMock(return_value=iter([data]))
        return resp

    def test_valid_image_returns_pil(self):
        resp = self._make_response()
        with patch("model.requests.get", return_value=resp):
            img = load_image_from_url("https://example.com/photo.jpg")
        self.assertIsInstance(img, Image.Image)
        self.assertEqual(img.mode, "RGB")

    def test_non_image_content_type_raises(self):
        resp = self._make_response(content_type="text/html", data=b"<html></html>")
        with patch("model.requests.get", return_value=resp):
            with self.assertRaises(ValueError) as ctx:
                load_image_from_url("https://example.com/page.html")
        self.assertIn("이미지가 아닌", str(ctx.exception))

    def test_http_error_raises(self):
        resp = MagicMock()
        resp.raise_for_status.side_effect = Exception("404 Not Found")
        with patch("model.requests.get", return_value=resp):
            with self.assertRaises(Exception):
                load_image_from_url("https://example.com/missing.jpg")

    def test_oversized_image_raises(self):
        big_chunk = b"x" * (21 * 1024 * 1024)
        resp = self._make_response(data=big_chunk)
        with patch("model.requests.get", return_value=resp):
            with self.assertRaises(ValueError) as ctx:
                load_image_from_url("https://example.com/huge.jpg")
        self.assertIn("용량 초과", str(ctx.exception))

    def test_invalid_image_data_raises(self):
        resp = self._make_response(data=b"not-an-image")
        with patch("model.requests.get", return_value=resp):
            with self.assertRaises(ValueError) as ctx:
                load_image_from_url("https://example.com/corrupt.jpg")
        self.assertIn("파싱 실패", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()

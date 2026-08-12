"""Unit tests for the OpenAI vision appearance analyzer."""

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from openai_analyzer import (
    SYSTEM_PROMPT,
    AppearanceAnalysis,
    OpenAIAppearanceAnalyzer,
    PhotoQuality,
)


class TestOpenAIAppearanceAnalyzer(unittest.TestCase):
    def setUp(self):
        self.client = MagicMock()
        self.analyzer = OpenAIAppearanceAnalyzer(
            client=self.client,
            model="gpt-5.6-terra",
        )

    def test_valid_face_returns_score_and_disables_storage(self):
        parsed = AppearanceAnalysis(
            status="ok",
            score_0_100=74,
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
        self.client.responses.parse.return_value = SimpleNamespace(output_parsed=parsed)

        result = self.analyzer.analyze(
            ["https://storage.example/photo.jpg"],
            gender_bank="female",
        )

        self.assertEqual(result.status, "ok")
        self.assertEqual(result.score_0_100, 74)
        self.assertEqual(result.appearance_type, "warm")
        kwargs = self.client.responses.parse.call_args.kwargs
        self.assertEqual(kwargs["model"], "gpt-5.6-terra")
        self.assertFalse(kwargs["store"])
        self.assertEqual(kwargs["text_format"], AppearanceAnalysis)
        self.assertEqual(
            kwargs["input"][1]["content"][1]["type"],
            "input_image",
        )

    def test_missing_face_is_rejected_without_a_score(self):
        parsed = AppearanceAnalysis(
            status="reject",
            score_0_100=None,
            appearance_type=None,
            confidence_0_1=0.99,
            reject_code="no_face",
            photo_quality=PhotoQuality(
                single_person=False,
                face_visible=False,
                lighting_ok=True,
                blurred=False,
                heavy_filter_suspected=False,
                face_occluded=False,
            ),
        )
        self.client.responses.parse.return_value = SimpleNamespace(output_parsed=parsed)

        result = self.analyzer.analyze(
            ["https://storage.example/screenshot.png"],
            gender_bank="female",
        )

        self.assertEqual(result.status, "reject")
        self.assertIsNone(result.score_0_100)
        self.assertIsNone(result.appearance_type)
        self.assertEqual(result.reject_code, "no_face")

    def test_multiple_photo_policy_uses_a_clear_face_and_ignores_context_only_photos(self):
        self.assertIn(
            "at least one supplied photo clearly shows one adult face",
            SYSTEM_PROMPT,
        )

    def test_default_anchor_base_uses_the_dedicated_supabase_public_bucket(self):
        with patch.dict(
            "os.environ",
            {
                "APPEARANCE_ANCHOR_BASE_URL": "",
                "NEXT_PUBLIC_SUPABASE_URL": "https://project-ref.supabase.co",
            },
            clear=False,
        ):
            analyzer = OpenAIAppearanceAnalyzer(
                client=self.client,
                model="gpt-5.6-terra",
            )

        self.assertEqual(
            analyzer.anchor_base_url,
            "https://project-ref.supabase.co/storage/v1/object/public/appearance-anchors",
        )
        self.assertIn(
            "Ignore context-only or unusable supplemental photos",
            SYSTEM_PROMPT,
        )
        self.assertIn(
            "Reject for no_face only when none of the supplied photos",
            SYSTEM_PROMPT,
        )

    def test_invalid_success_contract_is_rejected(self):
        parsed = AppearanceAnalysis.model_construct(
            status="ok",
            score_0_100=None,
            appearance_type="warm",
            confidence_0_1=0.9,
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
        self.client.responses.parse.return_value = SimpleNamespace(output_parsed=parsed)

        with self.assertRaises(ValueError):
            self.analyzer.analyze(
                ["https://storage.example/photo.jpg"],
                gender_bank="female",
            )

    def test_invalid_success_appearance_type_is_rejected(self):
        parsed = AppearanceAnalysis.model_construct(
            status="ok",
            score_0_100=74,
            appearance_type="unknown",
            confidence_0_1=0.9,
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
        self.client.responses.parse.return_value = SimpleNamespace(output_parsed=parsed)

        with self.assertRaises(ValueError):
            self.analyzer.analyze(
                ["https://storage.example/photo.jpg"],
                gender_bank="female",
            )

    def test_empty_model_output_is_rejected(self):
        self.client.responses.parse.return_value = SimpleNamespace(output_parsed=None)

        with self.assertRaises(RuntimeError):
            self.analyzer.analyze(
                ["https://storage.example/photo.jpg"],
                gender_bank="female",
            )

    def test_uses_approved_gender_anchor_references_after_a_provisional_pass(self):
        provisional = AppearanceAnalysis(
            status="ok",
            score_0_100=14,
            appearance_type="warm",
            confidence_0_1=0.62,
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
        calibrated = provisional.model_copy(update={"score_0_100": 12, "confidence_0_1": 0.81})
        self.client.responses.parse.side_effect = [
            SimpleNamespace(output_parsed=provisional),
            SimpleNamespace(output_parsed=calibrated),
        ]

        result = self.analyzer.analyze(
            ["https://storage.example/photo.jpg"],
            gender_bank="female",
        )

        self.assertEqual(result.score_0_100, 12)
        self.assertEqual(self.client.responses.parse.call_count, 2)
        calibrated_call = self.client.responses.parse.call_args_list[1].kwargs
        calibrated_content = calibrated_call["input"][1]["content"]
        reference_text = "\n".join(
            item["text"] for item in calibrated_content if item["type"] == "input_text"
        )
        reference_urls = [
            item["image_url"] for item in calibrated_content if item["type"] == "input_image"
        ]

        self.assertIn("human-approved reference anchors", reference_text)
        self.assertEqual(len(reference_urls), 4)
        self.assertTrue(all(url.startswith("https://") for url in reference_urls))
        self.assertEqual(result.analysis_metadata.anchor_manifest_version, "approved-v1")
        self.assertEqual(result.analysis_metadata.prompt_version, "appearance-anchor-v3")


if __name__ == "__main__":
    unittest.main()

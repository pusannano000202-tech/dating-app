"""RED contract tests for the private approved-anchor adapter."""

import importlib
import json
import tempfile
import unittest
from pathlib import Path
from types import ModuleType
from typing import Any


class TestApprovedAnchorAdapter(unittest.TestCase):
    def setUp(self):
        self._temp_dir = tempfile.TemporaryDirectory()
        self.temp_path = Path(self._temp_dir.name)

    def tearDown(self):
        self._temp_dir.cleanup()

    def test_loads_valid_schema_v1_manifest(self):
        adapter = self._require_adapter("schema version 1 loading")
        manifest_path = self._write_manifest(
            self._manifest(
                [
                    self._anchor("female-25-a", "female", 25),
                    self._anchor("male-25-a", "male", 25),
                ]
            )
        )

        anchors = adapter.load_approved_anchor_manifest(manifest_path)

        self.assertEqual(len(anchors), 2)
        self.assertEqual(
            {self._anchor_value(anchor, "anchorId", "anchor_id") for anchor in anchors},
            {"female-25-a", "male-25-a"},
        )

    def test_rejects_invalid_manifest_schema_fields_and_values(self):
        adapter = self._require_adapter("schema, field, and value validation")
        invalid_manifests = {
            "unsupported schema": self._manifest([], schema_version=2),
            "missing anchors": {"schemaVersion": 1},
            "missing anchor id": self._manifest(
                [
                    {
                        key: value
                        for key, value in self._anchor("female-25-a", "female", 25).items()
                        if key != "anchorId"
                    }
                ]
            ),
            "invalid gender": self._manifest([self._anchor("unknown-25-a", "unknown", 25)]),
            "invalid review status": self._manifest(
                [self._anchor("female-25-a", "female", 25, review_status="ready")]
            ),
            "out of range score": self._manifest([self._anchor("female-101-a", "female", 101)]),
        }

        for label, manifest in invalid_manifests.items():
            with self.subTest(label=label):
                manifest_path = self._write_manifest(manifest, name=f"{label}.json")
                with self.assertRaises(ValueError):
                    adapter.load_approved_anchor_manifest(manifest_path)

    def test_loads_only_review_status_approved(self):
        adapter = self._require_adapter("approved-only filtering")
        manifest_path = self._write_manifest(
            self._manifest(
                [
                    self._anchor("female-approved", "female", 25),
                    self._anchor(
                        "female-pending",
                        "female",
                        30,
                        review_status="pending",
                    ),
                    self._anchor(
                        "female-excluded",
                        "female",
                        35,
                        review_status="excluded",
                    ),
                ]
            )
        )

        anchors = adapter.load_approved_anchor_manifest(manifest_path)

        self.assertEqual(len(anchors), 1)
        self.assertEqual(
            self._anchor_value(anchors[0], "anchorId", "anchor_id"),
            "female-approved",
        )

    def test_separates_requested_gender_bank(self):
        adapter = self._require_adapter("requested gender-bank filtering")
        manifest_path = self._write_manifest(
            self._manifest(
                [
                    self._anchor("female-25-a", "female", 25),
                    self._anchor("female-40-a", "female", 40),
                    self._anchor("male-25-a", "male", 25),
                ]
            )
        )
        anchors = adapter.load_approved_anchor_manifest(manifest_path)

        selected = adapter.select_neighbor_anchors(
            anchors,
            gender_bank="female",
            estimated_score=30,
        )

        self.assertGreater(len(selected), 0)
        self.assertTrue(
            all(
                self._anchor_value(anchor, "genderBank", "gender_bank") == "female"
                for anchor in selected
            )
        )

    def test_selects_at_most_three_neighbors(self):
        adapter = self._require_adapter("maximum-three neighbor selection")
        manifest_path = self._write_manifest(
            self._manifest(
                [
                    self._anchor("male-reviewer-10", "male", 10, target_score=55),
                    self._anchor("male-reviewer-30", "male", 30, target_score=50),
                    self._anchor("male-reviewer-45", "male", 45, target_score=90),
                    self._anchor("male-reviewer-55", "male", 55, target_score=10),
                    self._anchor("male-reviewer-80", "male", 80, target_score=45),
                ]
            )
        )
        anchors = adapter.load_approved_anchor_manifest(manifest_path)

        selected = adapter.select_neighbor_anchors(
            anchors,
            gender_bank="male",
            estimated_score=50,
            limit=99,
        )

        self.assertEqual(len(selected), 3)
        self.assertEqual(
            [self._anchor_value(anchor, "anchorId", "anchor_id") for anchor in selected],
            ["male-reviewer-45", "male-reviewer-55", "male-reviewer-30"],
        )

    def test_missing_manifest_raises_file_not_found_error(self):
        adapter = self._require_adapter("missing-file hard failure")
        missing_path = self.temp_path / "missing-approved-anchors.json"

        with self.assertRaises(FileNotFoundError):
            adapter.load_approved_anchor_manifest(missing_path)

    def test_default_authority_is_private_approved_manifest(self):
        adapter = self._require_adapter("private-manifest authority")

        manifest_path = Path(adapter.PRIVATE_APPROVED_ANCHOR_MANIFEST_PATH)
        normalized = manifest_path.as_posix()

        self.assertTrue(normalized.endswith("data/appearance-calibration-v2/approved-anchors.json"))
        self.assertNotIn("/public/", f"/{normalized.strip('/')}")

    def test_vercel_bundle_contains_the_same_approved_manifest(self):
        adapter = self._require_adapter("Vercel manifest packaging")

        repository_manifest = Path(adapter.REPOSITORY_APPROVED_ANCHOR_MANIFEST_PATH)
        bundled_manifest = Path(adapter.BUNDLED_APPROVED_ANCHOR_MANIFEST_PATH)

        self.assertTrue(bundled_manifest.is_file())
        self.assertEqual(
            json.loads(repository_manifest.read_text(encoding="utf-8")),
            json.loads(bundled_manifest.read_text(encoding="utf-8")),
        )

    def _require_adapter(self, contract: str) -> ModuleType:
        try:
            return importlib.import_module("anchor_adapter")
        except ModuleNotFoundError as error:
            self.fail(f"anchor_adapter is not implemented; cannot verify {contract}")
            raise AssertionError from error

    def _write_manifest(self, manifest: dict[str, Any], *, name: str = "manifest.json") -> Path:
        path = self.temp_path / name
        path.write_text(json.dumps(manifest), encoding="utf-8")
        return path

    @staticmethod
    def _manifest(
        anchors: list[dict[str, Any]],
        *,
        schema_version: int = 1,
    ) -> dict[str, Any]:
        return {
            "schemaVersion": schema_version,
            "exportedAt": "2026-08-01T00:00:00.000Z",
            "anchors": anchors,
        }

    @staticmethod
    def _anchor(
        anchor_id: str,
        gender_bank: str,
        reviewer_score: int,
        *,
        review_status: str = "approved",
        target_score: int | None = None,
    ) -> dict[str, Any]:
        return {
            "anchorId": anchor_id,
            "genderBank": gender_bank,
            "targetScore": reviewer_score if target_score is None else target_score,
            "reviewerScore": reviewer_score,
            "reviewStatus": review_status,
            "imagePath": f"/appearance-calibration-v2/anchors/{anchor_id}.png",
        }

    @staticmethod
    def _anchor_value(anchor: Any, json_name: str, python_name: str) -> Any:
        if isinstance(anchor, dict):
            return anchor[json_name]
        return getattr(anchor, python_name)


if __name__ == "__main__":
    unittest.main()

"""Private approved-anchor loading and neighbor selection."""

from __future__ import annotations

import json
import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, TypeAlias

GenderBank = Literal["female", "male"]
AnchorValue: TypeAlias = str | int
AnchorRecord: TypeAlias = dict[str, AnchorValue]


@dataclass(frozen=True)
class ApprovedAnchorManifest:
    schema_version: int
    anchors: tuple[AnchorRecord, ...]

    @property
    def version(self) -> str:
        return f"approved-v{self.schema_version}"


REPOSITORY_APPROVED_ANCHOR_MANIFEST_PATH = (
    Path(__file__).resolve().parents[2]
    / "data"
    / "appearance-calibration-v2"
    / "approved-anchors.json"
)
BUNDLED_APPROVED_ANCHOR_MANIFEST_PATH = (
    Path(__file__).resolve().parent / "data" / "approved-anchors.json"
)
PRIVATE_APPROVED_ANCHOR_MANIFEST_PATH = (
    REPOSITORY_APPROVED_ANCHOR_MANIFEST_PATH
    if REPOSITORY_APPROVED_ANCHOR_MANIFEST_PATH.is_file()
    else BUNDLED_APPROVED_ANCHOR_MANIFEST_PATH
)

_ALLOWED_GENDER_BANKS = frozenset({"female", "male"})
_ALLOWED_REVIEW_STATUSES = frozenset({"pending", "approved", "excluded"})
_ANCHOR_FIELDS = (
    "anchorId",
    "genderBank",
    "targetScore",
    "reviewerScore",
    "reviewStatus",
    "imagePath",
)


def load_approved_anchor_manifest(
    manifest_path: Path = PRIVATE_APPROVED_ANCHOR_MANIFEST_PATH,
) -> list[AnchorRecord]:
    """Validate a private manifest and return only approved anchor records."""

    return [dict(anchor) for anchor in load_approved_anchor_manifest_bundle(manifest_path).anchors]


def load_approved_anchor_manifest_bundle(
    manifest_path: Path = PRIVATE_APPROVED_ANCHOR_MANIFEST_PATH,
) -> ApprovedAnchorManifest:
    """Load the approved bank together with the version used for scoring."""

    path = Path(manifest_path)
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise ValueError("anchor manifest must contain valid JSON") from error

    if not isinstance(manifest, dict):
        raise ValueError("anchor manifest must be an object")
    schema_version = manifest.get("schemaVersion")
    if (
        isinstance(schema_version, bool)
        or not isinstance(schema_version, int)
        or schema_version != 1
    ):
        raise ValueError("anchor manifest schemaVersion must be 1")
    if not isinstance(manifest.get("exportedAt"), str) or not manifest["exportedAt"].strip():
        raise ValueError("anchor manifest exportedAt must be a non-empty string")

    raw_anchors = manifest.get("anchors")
    if not isinstance(raw_anchors, list):
        raise ValueError("anchor manifest anchors must be an array")

    validated = [
        _validate_anchor_record(anchor, index=index) for index, anchor in enumerate(raw_anchors)
    ]
    return ApprovedAnchorManifest(
        schema_version=manifest["schemaVersion"],
        anchors=tuple(anchor for anchor in validated if anchor["reviewStatus"] == "approved"),
    )


def select_neighbor_anchors(
    anchors: Sequence[Mapping[str, AnchorValue]],
    *,
    gender_bank: GenderBank,
    estimated_score: float,
    limit: int = 3,
) -> list[AnchorRecord]:
    """Select at most three nearby approved anchors from one gender bank."""

    if gender_bank not in _ALLOWED_GENDER_BANKS:
        raise ValueError("gender_bank must be female or male")
    if (
        isinstance(estimated_score, bool)
        or not isinstance(estimated_score, (int, float))
        or not math.isfinite(estimated_score)
    ):
        raise ValueError("estimated_score must be a finite number")
    if isinstance(limit, bool) or not isinstance(limit, int):
        raise ValueError("limit must be an integer")

    bounded_score = min(100.0, max(0.0, float(estimated_score)))
    bounded_limit = min(3, max(1, limit))
    candidates = [
        anchor
        for anchor in anchors
        if anchor.get("genderBank") == gender_bank and anchor.get("reviewStatus") == "approved"
    ]
    candidates.sort(
        key=lambda anchor: (
            abs(int(anchor["reviewerScore"]) - bounded_score),
            int(anchor["reviewerScore"]),
            int(anchor["targetScore"]),
            str(anchor["anchorId"]),
        )
    )
    return [dict(anchor) for anchor in candidates[:bounded_limit]]


def _validate_anchor_record(anchor: object, *, index: int) -> AnchorRecord:
    if not isinstance(anchor, dict):
        raise ValueError(f"anchor at index {index} must be an object")

    missing_fields = [field for field in _ANCHOR_FIELDS if field not in anchor]
    if missing_fields:
        raise ValueError(f"anchor at index {index} is missing fields: {', '.join(missing_fields)}")

    anchor_id = anchor["anchorId"]
    gender_bank = anchor["genderBank"]
    target_score = anchor["targetScore"]
    reviewer_score = anchor["reviewerScore"]
    review_status = anchor["reviewStatus"]
    image_path = anchor["imagePath"]

    if not isinstance(anchor_id, str) or not anchor_id.strip():
        raise ValueError(f"anchor at index {index} has an invalid anchorId")
    if gender_bank not in _ALLOWED_GENDER_BANKS:
        raise ValueError(f"anchor at index {index} has an invalid genderBank")
    if not _is_valid_score(target_score):
        raise ValueError(f"anchor at index {index} has an invalid targetScore")
    if not _is_valid_score(reviewer_score):
        raise ValueError(f"anchor at index {index} has an invalid reviewerScore")
    if review_status not in _ALLOWED_REVIEW_STATUSES:
        raise ValueError(f"anchor at index {index} has an invalid reviewStatus")
    if not isinstance(image_path, str) or not image_path.strip():
        raise ValueError(f"anchor at index {index} has an invalid imagePath")

    return {field: anchor[field] for field in _ANCHOR_FIELDS}


def _is_valid_score(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and 0 <= value <= 100

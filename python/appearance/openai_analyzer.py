"""Structured OpenAI vision analysis for profile photos."""

import os
from dataclasses import dataclass
from typing import Literal

from openai import OpenAI
from pydantic import BaseModel, Field, PrivateAttr, model_validator

from anchor_adapter import (
    PRIVATE_APPROVED_ANCHOR_MANIFEST_PATH,
    GenderBank,
    load_approved_anchor_manifest_bundle,
    select_neighbor_anchors,
)

RejectCode = Literal[
    "none",
    "no_face",
    "multiple_people",
    "face_occluded",
    "low_quality",
    "minor_suspected",
]

AppearanceType = Literal[
    "cute",
    "pure",
    "chic",
    "warm",
    "stylish",
    "healthy",
]


class PhotoQuality(BaseModel):
    single_person: bool
    face_visible: bool
    lighting_ok: bool
    blurred: bool
    heavy_filter_suspected: bool
    face_occluded: bool


@dataclass(frozen=True)
class AppearanceAnalysisMetadata:
    model_version: str
    prompt_version: str
    anchor_manifest_version: str


class AppearanceAnalysis(BaseModel):
    status: Literal["ok", "reject"]
    score_0_100: int | None = Field(default=None, ge=0, le=100)
    appearance_type: AppearanceType | None = None
    confidence_0_1: float = Field(ge=0, le=1)
    reject_code: RejectCode
    photo_quality: PhotoQuality
    _analysis_metadata: AppearanceAnalysisMetadata | None = PrivateAttr(default=None)

    @model_validator(mode="after")
    def validate_status_contract(self):
        if self.status == "ok":
            if (
                self.score_0_100 is None
                or self.appearance_type is None
                or self.reject_code != "none"
            ):
                raise ValueError(
                    "successful analysis requires a score, appearance type, and no rejection"
                )
        elif (
            self.score_0_100 is not None
            or self.appearance_type is not None
            or self.reject_code == "none"
        ):
            raise ValueError("rejected analysis requires a rejection code and no appearance result")
        return self

    @property
    def analysis_metadata(self) -> AppearanceAnalysisMetadata:
        if self._analysis_metadata is None:
            raise RuntimeError("appearance analysis metadata is missing")
        return self._analysis_metadata

    def with_metadata(
        self,
        metadata: AppearanceAnalysisMetadata,
    ) -> "AppearanceAnalysis":
        self._analysis_metadata = metadata
        return self


SYSTEM_PROMPT = """
You assess whether uploaded photos are suitable for an adult dating profile and,
only when suitable, produce one conservative 0-100 appearance score for internal
matching. Apply the same visual standard to every person.

Accept a multi-photo set when at least one supplied photo clearly shows one adult face
that is suitable for evaluation. Ignore context-only or unusable supplemental photos
instead of rejecting the entire set. Reject for no_face only when none of the supplied photos
contains a clearly visible face. Reject for multiple_people only when no usable photo
isolates one person. Still reject when the usable face is substantially covered, image
quality is too poor, the subject may be a minor, or the usable photos do not reasonably
appear to show the same person.

Evaluate only visible presentation: facial clarity, grooming, expression,
lighting, composition, and consistency across the supplied photos. Do not infer
or mention identity, ethnicity, nationality, health, disability, religion,
politics, occupation, wealth, personality, or sexual behavior. Do not identify
the person. Do not include prose outside the structured result.

For a suitable adult profile, also choose exactly one visible presentation
archetype. This is not a personality judgment: cute means playful/soft styling,
pure means clean/gentle styling, chic means cool/refined styling, warm means an
approachable/relaxed presentation, stylish means fashion-forward presentation,
and healthy means energetic/active presentation. Set appearance_type to null
for every rejected set.
""".strip()

CALIBRATION_PROMPT = """
Use the user photos and the human-approved reference anchors supplied in this
request. The reference labels are internal calibration points, not descriptions
of a person. Place the user on the same 0-100 scale without flattering upward
or compressing lower scores. Do not mention anchor IDs, reference scores, or
the calibration process in the structured result.
""".strip()


def default_anchor_base_url() -> str:
    explicit = os.getenv("APPEARANCE_ANCHOR_BASE_URL", "").strip()
    if explicit:
        return explicit

    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "").strip().rstrip("/")
    if supabase_url:
        return f"{supabase_url}/storage/v1/object/public/appearance-anchors"

    return "https://dating-app-silk.vercel.app"


class OpenAIAppearanceAnalyzer:
    def __init__(
        self,
        *,
        client: OpenAI | None = None,
        model: str | None = None,
        anchor_manifest_path=PRIVATE_APPROVED_ANCHOR_MANIFEST_PATH,
        anchor_base_url: str | None = None,
        prompt_version: str | None = None,
    ):
        self.client = client or OpenAI()
        self.model = model or os.getenv("OPENAI_APPEARANCE_MODEL", "gpt-5.6-terra")
        self.prompt_version = prompt_version or os.getenv(
            "APPEARANCE_PROMPT_VERSION", "appearance-anchor-v3"
        )
        self.anchor_base_url = (anchor_base_url or default_anchor_base_url()).rstrip("/")
        if not self.anchor_base_url.startswith("https://"):
            raise ValueError("APPEARANCE_ANCHOR_BASE_URL must use HTTPS")

        manifest = load_approved_anchor_manifest_bundle(anchor_manifest_path)
        if not manifest.anchors:
            raise ValueError("approved anchor manifest must not be empty")
        self.approved_anchors = manifest.anchors
        self.metadata = AppearanceAnalysisMetadata(
            model_version=self.model,
            prompt_version=self.prompt_version,
            anchor_manifest_version=manifest.version,
        )

    def analyze(
        self,
        photo_urls: list[str],
        *,
        gender_bank: GenderBank,
    ) -> AppearanceAnalysis:
        if not 1 <= len(photo_urls) <= 3:
            raise ValueError("one to three photos are required")

        provisional = self._parse(
            self._build_user_content(photo_urls),
            SYSTEM_PROMPT,
        )
        if provisional.status == "reject":
            return provisional.with_metadata(self.metadata)

        anchors = select_neighbor_anchors(
            self.approved_anchors,
            gender_bank=gender_bank,
            estimated_score=provisional.score_0_100,
        )
        if not anchors:
            raise RuntimeError("no approved anchors available for gender bank")

        calibrated_content = self._build_user_content(photo_urls)
        calibrated_content.append(
            {
                "type": "input_text",
                "text": "human-approved reference anchors follow. Use their reviewer scores as the calibration scale.",
            }
        )
        for anchor in anchors:
            calibrated_content.extend(
                [
                    {
                        "type": "input_text",
                        "text": (
                            f"Reference anchor {anchor['anchorId']}: "
                            f"reviewer score {anchor['reviewerScore']}."
                        ),
                    },
                    {
                        "type": "input_image",
                        "image_url": self._anchor_url(str(anchor["imagePath"])),
                        "detail": "low",
                    },
                ]
            )

        return self._parse(
            calibrated_content,
            f"{SYSTEM_PROMPT}\n\n{CALIBRATION_PROMPT}",
        ).with_metadata(self.metadata)

    def _build_user_content(self, photo_urls: list[str]) -> list[dict[str, str]]:
        user_content: list[dict[str, str]] = [
            {
                "type": "input_text",
                "text": "Analyze these profile photos using the supplied policy.",
            }
        ]
        user_content.extend(
            {
                "type": "input_image",
                "image_url": photo_url,
                "detail": "low",
            }
            for photo_url in photo_urls
        )
        return user_content

    def _parse(
        self,
        user_content: list[dict[str, str]],
        system_prompt: str,
    ) -> AppearanceAnalysis:
        response = self.client.responses.parse(
            model=self.model,
            input=[
                {
                    "role": "developer",
                    "content": [{"type": "input_text", "text": system_prompt}],
                },
                {"role": "user", "content": user_content},
            ],
            text_format=AppearanceAnalysis,
            store=False,
        )
        if response.output_parsed is None:
            raise RuntimeError("OpenAI returned no structured analysis")

        return AppearanceAnalysis.model_validate(response.output_parsed.model_dump())

    def _anchor_url(self, image_path: str) -> str:
        if not image_path.startswith("/appearance-calibration-v2/anchors/"):
            raise ValueError("anchor image path is not an approved public asset")
        return f"{self.anchor_base_url}{image_path}"

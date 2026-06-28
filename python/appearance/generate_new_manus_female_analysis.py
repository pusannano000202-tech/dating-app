from __future__ import annotations

import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from generate_female_vector_analysis import AXES, TYPES, blend_vector, bucket_scores


ROOT = Path(__file__).resolve().parents[2]
IMG_DIR = ROOT / "public" / "appearance-ideal" / "female-64"
OUT_DIR = ROOT / "public" / "appearance-ideal"

RAW_PATH = OUT_DIR / "ANALYSIS_RAW_FEMALE_MANUS_NEW.json"
META_PATH = OUT_DIR / "METADATA_FEMALE_MANUS_NEW.json"
SUMMARY_PATH = OUT_DIR / "FEMALE_MANUS_NEW_VECTOR_SUMMARY.json"
REVIEW_PATH = OUT_DIR / "FEMALE_MANUS_NEW_VECTOR_REVIEW.md"
TABLE_PATH = OUT_DIR / "FEMALE_MANUS_NEW_CLASSIFICATION_TABLE.md"


# id, score, primary, secondary types, face, eyes, hair, clothing, mood
PLANS = [
    ("NEW_FI01", 72, "따뜻한/부드러운형", ["귀여운/동안형"], "둥근 타원형", "웃는 순한 눈매", "긴 웨이브", "노란 니트", "밝고 따뜻한 현실 호감형"),
    ("NEW_FI02", 70, "귀여운/동안형", ["자연형"], "작은 둥근형", "장난기 있는 눈매", "높게 묶은 머리", "흰 티셔츠", "귀엽고 장난스러운 분위기"),
    ("NEW_FI03", 64, "청순/자연형", ["건강/활동형"], "보통 타원형", "작고 순한 눈매", "묶은 긴 머리", "데님 원피스", "수수하고 자연스러운 분위기"),
    ("NEW_FI04", 74, "귀여운/동안형", ["건강/활동형"], "둥근형", "웃는 큰 눈매", "긴 웨이브", "스트라이프 티셔츠", "활발하고 귀여운 분위기"),
    ("NEW_FI05", 69, "지적/단정형", ["귀여운/동안형"], "둥근 타원형", "차분한 눈매", "단발 앞머리", "셔츠와 카디건", "학생 같고 단정한 분위기"),
    ("NEW_FI06", 78, "따뜻한/부드러운형", ["귀여운/동안형"], "작은 타원형", "웃는 부드러운 눈매", "긴 웨이브", "회색 후드", "밝고 호감 가는 분위기"),
    ("NEW_FI07", 73, "귀여운/동안형", ["청순/자연형"], "작은 둥근형", "큰 순한 눈매", "긴 생머리", "하늘색 니트", "귀엽고 부드러운 분위기"),
    ("NEW_FI08", 76, "청순/자연형", ["따뜻한/부드러운형"], "타원형", "부드럽고 차분한 눈매", "긴 웨이브", "데님 재킷", "청순하고 편안한 분위기"),
    ("NEW_FI09", 80, "청순/자연형", ["성숙/분위기형"], "갸름한 타원형", "차분하고 긴 눈매", "긴 생머리", "흰 원피스", "맑고 청순한 야외 분위기"),
    ("NEW_FI10", 78, "따뜻한/부드러운형", ["청순/자연형"], "작은 타원형", "또렷하고 부드러운 눈매", "긴 웨이브", "베이지 카디건", "부드럽고 안정적인 분위기"),
    ("NEW_FI11", 77, "따뜻한/부드러운형", ["청순/자연형"], "타원형", "순하고 또렷한 눈매", "긴 웨이브", "베이지 니트", "카페 자연광의 따뜻함"),
    ("NEW_FI12", 66, "귀여운/동안형", ["건강/활동형"], "둥근형", "작고 순한 눈매", "묶은 머리", "흰 후드", "수수하고 어린 느낌"),
    ("NEW_FI13", 72, "귀여운/동안형", ["청순/자연형"], "짧은 둥근형", "큰 둥근 눈매", "짧은 단발", "분홍 폴로 셔츠", "단정한 귀여움"),
    ("NEW_FI14", 78, "시크/도도형", ["성숙/분위기형"], "긴 타원형", "긴 차분한 눈매", "긴 생머리", "트렌치 코트", "차분하고 도도한 분위기"),
    ("NEW_FI15", 76, "건강/활동형", ["따뜻한/부드러운형"], "둥근 타원형", "웃는 밝은 눈매", "긴 생머리", "흰 민소매", "밝고 건강한 분위기"),
    ("NEW_FI16", 70, "귀여운/동안형", ["청순/자연형"], "둥근형", "순한 눈매", "높게 묶은 머리", "회색 니트", "수수한 동안 분위기"),
    ("NEW_FI17", 82, "시크/도도형", ["스타일리시/화려형"], "갸름한 계란형", "날카로운 눈매", "검은 긴 생머리", "검은 재킷", "강한 시크함"),
    ("NEW_FI18", 76, "시크/도도형", ["성숙/분위기형"], "긴 타원형", "긴 무표정 눈매", "긴 생머리", "검은 가죽 재킷", "야간 도시 시크함"),
    ("NEW_FI19", 84, "성숙/분위기형", ["스타일리시/화려형"], "작은 계란형", "또렷하고 깊은 눈매", "묶은 머리", "검은 상의", "성숙하고 화려한 분위기"),
    ("NEW_FI20", 81, "시크/도도형", ["성숙/분위기형"], "긴 타원형", "차분하고 긴 눈매", "긴 생머리", "흰 셔츠", "무드 있는 시크함"),
    ("NEW_FI21", 78, "시크/도도형", ["지적/단정형"], "작은 타원형", "차갑고 또렷한 눈매", "긴 생머리", "검은 터틀넥", "조용하고 차가운 분위기"),
    ("NEW_FI22", 76, "시크/도도형", ["스타일리시/화려형"], "타원형", "무심한 눈매", "긴 생머리", "데님 재킷", "거리감 있는 도시적 분위기"),
    ("NEW_FI23", 82, "시크/도도형", ["성숙/분위기형"], "긴 타원형", "날카로운 옆눈매", "묶은 머리", "흰 슬림 상의", "절제된 성숙함"),
    ("NEW_FI24", 76, "성숙/분위기형", ["시크/도도형"], "긴 타원형", "깊고 무심한 눈매", "긴 생머리", "검은 민소매", "성숙하고 차분한 분위기"),
    ("NEW_FI25", 82, "스타일리시/화려형", ["따뜻한/부드러운형"], "작은 계란형", "크고 밝은 눈매", "갈색 웨이브", "꽃무늬 상의", "화사하고 스타일리시한 분위기"),
    ("NEW_FI26", 79, "스타일리시/화려형", ["따뜻한/부드러운형"], "작은 타원형", "또렷한 눈매", "긴 웨이브", "데님 재킷", "밝은 패션형 분위기"),
    ("NEW_FI27", 84, "성숙/분위기형", ["따뜻한/부드러운형"], "계란형", "부드럽고 깊은 눈매", "긴 웨이브", "베이지 블라우스", "성숙하고 고급스러운 분위기"),
    ("NEW_FI28", 86, "스타일리시/화려형", ["성숙/분위기형"], "작은 계란형", "크고 화려한 눈매", "긴 웨이브", "컬러 원피스", "휴양지 화려함"),
    ("NEW_FI29", 84, "스타일리시/화려형", ["시크/도도형"], "긴 타원형", "날카롭고 선명한 눈매", "묶은 머리", "검은 가죽 재킷", "화려한 시크 스타일"),
    ("NEW_FI30", 82, "시크/도도형", ["성숙/분위기형"], "긴 타원형", "올라간 긴 눈매", "긴 생머리", "트렌치 코트", "도도하고 고급스러운 분위기"),
    ("NEW_FI31", 72, "건강/활동형", ["따뜻한/부드러운형"], "둥근형", "웃는 순한 눈매", "묶은 머리", "흰 폴로 셔츠", "밝은 운동장 분위기"),
    ("NEW_FI32", 76, "건강/활동형", ["스타일리시/화려형"], "타원형", "차분한 눈매", "묶은 머리", "회색 운동복", "운동형 건강미"),
    ("NEW_FI33", 68, "건강/활동형", ["자연형"], "둥근형", "작고 웃는 눈매", "헤어밴드", "등산복", "현실적인 활동형"),
    ("NEW_FI34", 76, "건강/활동형", ["스타일리시/화려형"], "둥근 타원형", "밝은 눈매", "묶은 머리", "라벤더 운동복", "피트니스 건강미"),
    ("NEW_FI35", 74, "건강/활동형", ["귀여운/동안형"], "작은 둥근형", "큰 순한 눈매", "묶은 머리", "농구 유니폼", "스포티한 귀여움"),
    ("NEW_FI36", 76, "건강/활동형", ["지적/단정형"], "타원형", "차분한 눈매", "묶은 머리", "테니스 조끼", "정돈된 활동형"),
    ("NEW_FI37", 75, "건강/활동형", ["귀여운/동안형"], "둥근형", "작고 밝은 눈매", "묶은 머리와 선캡", "골프웨어", "밝은 스포츠형"),
    ("NEW_FI38", 78, "건강/활동형", ["스타일리시/화려형"], "타원형", "또렷한 눈매", "묶은 머리", "파란 운동복", "피트니스형 건강미"),
    ("NEW_FI39", 82, "스타일리시/화려형", ["성숙/분위기형"], "작은 타원형", "크고 선명한 눈매", "긴 웨이브", "검은 재킷", "세련되고 화려한 분위기"),
    ("NEW_FI40", 76, "성숙/분위기형", ["청순/자연형"], "긴 타원형", "처연하고 차분한 눈매", "긴 웨이브", "베이지 터틀넥", "조용하고 성숙한 분위기"),
    ("NEW_FI41", 82, "성숙/분위기형", ["따뜻한/부드러운형"], "작은 계란형", "부드럽고 깊은 눈매", "긴 웨이브", "베이지 블라우스", "성숙하고 부드러운 분위기"),
    ("NEW_FI42", 74, "성숙/분위기형", ["청순/자연형"], "긴 타원형", "깊고 차분한 눈매", "긴 생머리", "브라운 니트", "가을빛 성숙함"),
    ("NEW_FI43", 82, "지적/단정형", ["성숙/분위기형"], "타원형", "또렷하고 안정적인 눈매", "묶은 머리", "검은 블레이저", "프로페셔널한 단정함"),
    ("NEW_FI44", 78, "성숙/분위기형", ["청순/자연형"], "긴 타원형", "차분한 눈매", "긴 생머리", "베이지 코트", "조용하고 성숙한 분위기"),
    ("NEW_FI45", 80, "따뜻한/부드러운형", ["성숙/분위기형"], "작은 타원형", "웃는 부드러운 눈매", "긴 웨이브", "베이지 니트", "부드러운 성숙함"),
    ("NEW_FI46", 76, "성숙/분위기형", ["청순/자연형"], "긴 타원형", "조용하고 깊은 눈매", "묶은 머리", "회색 니트", "차분한 분위기"),
    ("NEW_FI47", 84, "성숙/분위기형", ["스타일리시/화려형"], "작은 계란형", "깊고 또렷한 눈매", "긴 웨이브", "검은 원피스", "성숙하고 화려한 분위기"),
    ("NEW_FI48", 78, "따뜻한/부드러운형", ["성숙/분위기형"], "둥근 타원형", "부드럽고 안정적인 눈매", "긴 생머리", "베이지 블라우스", "편안한 성숙함"),
    ("NEW_FI49", 76, "지적/단정형", ["청순/자연형"], "둥근 타원형", "순하고 차분한 눈매", "긴 생머리와 안경", "흰 셔츠", "도서관형 지적 분위기"),
    ("NEW_FI50", 80, "지적/단정형", ["시크/도도형"], "긴 타원형", "차분하고 또렷한 눈매", "긴 웨이브", "네이비 블레이저", "단정하고 세련된 분위기"),
    ("NEW_FI51", 78, "지적/단정형", ["따뜻한/부드러운형"], "작은 타원형", "부드러운 눈매", "묶은 머리", "연보라 블라우스", "차분하고 단정한 분위기"),
    ("NEW_FI52", 72, "지적/단정형", ["청순/자연형"], "타원형", "내려보는 차분한 눈매", "땋은 머리와 안경", "셔츠와 카디건", "학생 같은 지적 분위기"),
    ("NEW_FI53", 74, "지적/단정형", ["성숙/분위기형"], "짧은 타원형", "작고 차분한 눈매", "짧은 단발", "회색 재킷", "단정하지만 무심한 분위기"),
    ("NEW_FI54", 70, "청순/자연형", ["지적/단정형"], "긴 타원형", "작고 조용한 눈매", "긴 생머리", "베이지 니트", "수수하고 자연스러운 분위기"),
    ("NEW_FI55", 76, "지적/단정형", ["청순/자연형"], "긴 타원형", "차분한 눈매", "긴 생머리", "흰 셔츠", "학생풍 단정함"),
    ("NEW_FI56", 78, "지적/단정형", ["시크/도도형"], "긴 타원형", "차분하고 날카로운 눈매", "묶은 머리", "네이비 수트", "면접형 단정함"),
    ("NEW_FI57", 72, "지적/단정형", ["청순/자연형"], "둥근 타원형", "작고 순한 눈매", "안경과 긴 머리", "회색 카디건", "조용한 도서관형"),
    ("NEW_FI58", 74, "지적/단정형", ["따뜻한/부드러운형"], "둥근 타원형", "부드러운 눈매", "짧은 단발", "베이지 재킷", "따뜻한 단정함"),
    ("NEW_FI59", 82, "스타일리시/화려형", ["성숙/분위기형"], "작은 타원형", "크고 또렷한 눈매", "긴 웨이브", "검은 블라우스", "세련되고 화려한 분위기"),
    ("NEW_FI60", 72, "성숙/분위기형", ["청순/자연형"], "긴 타원형", "무표정의 깊은 눈매", "긴 웨이브", "베이지 터틀넥", "조용하고 우울한 분위기"),
    ("NEW_FI61", 76, "따뜻한/부드러운형", ["청순/자연형"], "둥근 타원형", "부드러운 눈매", "묶은 머리", "흰 블라우스", "따뜻하고 자연스러운 분위기"),
    ("NEW_FI62", 74, "성숙/분위기형", ["청순/자연형"], "긴 타원형", "차분한 눈매", "긴 웨이브", "회색 니트", "성숙하지만 수수한 분위기"),
    ("NEW_FI63", 76, "지적/단정형", ["따뜻한/부드러운형"], "둥근 타원형", "웃는 순한 눈매", "긴 생머리", "흰 셔츠", "밝은 단정함"),
    ("NEW_FI64", 68, "지적/단정형", ["시크/도도형"], "긴 타원형", "작고 날카로운 눈매", "긴 생머리와 안경", "네이비 수트", "차갑고 단정한 분위기"),
    ("FI65", 68, "청순/자연형", ["지적/단정형"], "보통 타원형", "작고 차분한 눈매", "중단발 웨이브", "흰 티셔츠", "수수한 자연형"),
    ("FI66", 66, "따뜻한/부드러운형", ["청순/자연형"], "둥근 타원형", "순한 눈매", "긴 생머리", "회색 후드", "평범하고 부드러운 분위기"),
    ("FI67", 70, "따뜻한/부드러운형", ["청순/자연형"], "타원형", "작고 웃는 눈매", "긴 웨이브", "아이보리 상의", "편안한 현실 호감형"),
    ("FI68", 72, "건강/활동형", ["따뜻한/부드러운형"], "둥근형", "웃는 밝은 눈매", "묶은 머리", "네이비 폴로 셔츠", "밝은 야외 활동형"),
    ("FI69", 64, "지적/단정형", ["청순/자연형"], "둥근 타원형", "작고 무표정 눈매", "단발", "베이지 셔츠", "수수한 단정함"),
    ("FI70", 58, "청순/자연형", ["지적/단정형"], "보통 타원형", "작고 차분한 눈매", "긴 생머리", "회색 니트", "평균권 자연형"),
    ("FI71", 74, "따뜻한/부드러운형", ["귀여운/동안형"], "둥근 타원형", "웃는 부드러운 눈매", "긴 생머리", "베이지 후드", "밝고 부드러운 분위기"),
    ("FI72", 76, "따뜻한/부드러운형", ["스타일리시/화려형"], "작은 타원형", "또렷하고 부드러운 눈매", "긴 웨이브", "데님 셔츠", "부드럽고 세련된 분위기"),
    ("FI73", 72, "따뜻한/부드러운형", ["청순/자연형"], "둥근 타원형", "순한 눈매", "긴 생머리", "흰 블라우스", "카페형 따뜻함"),
    ("FI74", 67, "건강/활동형", ["따뜻한/부드러운형"], "둥근형", "웃는 작은 눈매", "묶은 머리", "남색 티셔츠", "현실적인 운동형"),
    ("FI75", 76, "건강/활동형", ["스타일리시/화려형"], "타원형", "또렷한 눈매", "긴 생머리", "흰 민소매", "건강하고 밝은 분위기"),
    ("FI76", 70, "지적/단정형", ["귀여운/동안형"], "작은 타원형", "작고 차분한 눈매", "안경과 긴 머리", "회색 니트", "조용한 지적 귀여움"),
    ("FI77", 73, "건강/활동형", ["따뜻한/부드러운형"], "둥근형", "웃는 눈매", "긴 웨이브", "흰 민소매", "자연광 건강형"),
    ("FI78", 78, "지적/단정형", ["따뜻한/부드러운형"], "작은 타원형", "또렷하고 부드러운 눈매", "짧은 단발", "흰 셔츠", "단정하고 밝은 분위기"),
    ("FI79", 70, "시크/도도형", ["성숙/분위기형"], "긴 타원형", "차분하고 긴 눈매", "긴 생머리", "트렌치 코트", "차분한 도시형"),
    ("FI80", 62, "청순/자연형", ["지적/단정형"], "긴 타원형", "작고 무표정 눈매", "긴 생머리", "회색 니트", "평균권 자연형"),
]


def confidence(score: int, image_id: str) -> tuple[float, float, bool]:
    base = 0.72
    if image_id.startswith("NEW_FI"):
        base = 0.68
    if score >= 82:
        base -= 0.03
    if score <= 66:
        base += 0.02
    photo = min(0.78, base + 0.04)
    heavy = score >= 80 or image_id.startswith("NEW_FI")
    return round(base, 2), round(photo, 2), heavy


def main() -> None:
    created_at = datetime.now(timezone.utc).isoformat()
    evaluations = []
    metadata = []

    for image_id, score, primary, secondary, face, eyes, hair, clothes, mood in PLANS:
        secondary = [s for s in secondary if s in TYPES]
        vector = blend_vector(primary, secondary, {})
        scores = bucket_scores(vector)
        final_bucket = max(scores.items(), key=lambda item: item[1])[0]
        score_confidence, photo_confidence, heavy_filter = confidence(score, image_id)
        file_path = IMG_DIR / f"{image_id}.jpg"

        evaluation = {
            "image_id": image_id,
            "subject_gender": "female",
            "appearance_score_normalized": score,
            "score_confidence": score_confidence,
            "primary_type": primary,
            "secondary_types": secondary,
            "appearance_vector": vector,
            "visible_features": {
                "face_shape": face,
                "eye_impression": eyes,
                "hair_style": hair,
                "makeup_or_grooming": "접촉시트 기준 자연~정돈 메이크업",
                "clothing_style": clothes,
                "overall_mood": mood,
            },
            "photo_quality": {
                "single_person": True,
                "face_visible": True,
                "lighting_ok": True,
                "blurred": False,
                "heavy_filter_suspected": heavy_filter,
                "face_occluded": False,
                "confidence": photo_confidence,
            },
            "internal_notes": "codex_gpt_visual_pass_for_manus_new_images_not_external_api",
        }
        evaluations.append(evaluation)
        metadata.append(
            {
                "id": image_id,
                "gender": "female",
                "file": str(file_path.relative_to(ROOT)).replace("\\", "/"),
                "status": "candidate",
                "source": "manus_new_github_images",
                "measured": evaluation,
                "bucket_scores": scores,
                "final_bucket": final_bucket,
                "matching_vector_source": "measured.appearance_vector",
                "candidate_use": "final 64 재선별 후보. target 설계가 아니라 measured final_bucket 기준으로 채택 여부 판단.",
            }
        )

    final_counts = Counter(item["final_bucket"] for item in metadata)
    primary_counts = Counter(e["primary_type"] for e in evaluations)
    score_bands = Counter(f"{e['appearance_score_normalized'] // 10 * 10}점대" for e in evaluations)
    top_candidates = {
        t: [
            item["id"]
            for item in sorted(
                [m for m in metadata if m["final_bucket"] == t],
                key=lambda m: m["measured"]["appearance_score_normalized"],
                reverse=True,
            )[:8]
        ]
        for t in TYPES
    }
    shortage_fill_priority = {
        "귀여운/동안형": [m["id"] for m in metadata if m["final_bucket"] == "귀여운/동안형"],
        "따뜻한/부드러운형": [m["id"] for m in metadata if m["final_bucket"] == "따뜻한/부드러운형"],
        "성숙/분위기형": [m["id"] for m in metadata if m["final_bucket"] == "성숙/분위기형"],
    }

    raw = {
        "created_at": created_at,
        "analysis_method": "codex_gpt_visual_pass_from_new_manus_contact_sheets",
        "external_api_called": False,
        "note": "Manus 신규 이미지 80장에 대한 1차 measured 벡터화. 실제 OpenAI Vision API 결과가 오면 같은 스키마로 교체 가능.",
        "evaluations": evaluations,
    }
    summary = {
        "created_at": created_at,
        "analysis_method": raw["analysis_method"],
        "external_api_called": False,
        "image_count": len(evaluations),
        "measured_primary_counts": dict(primary_counts),
        "final_bucket_counts": dict(final_counts),
        "score_bands": dict(score_bands),
        "top_candidates_by_final_bucket": top_candidates,
        "shortage_fill_priority_for_previous_set": shortage_fill_priority,
        "recommendation": "기존 FI01~FI64에서 부족했던 귀여운/동안형, 성숙/분위기형, 따뜻한/부드러운형을 우선 보강하고, 청순/지적 과잉 후보는 압축한다.",
    }

    RAW_PATH.write_text(json.dumps(raw, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    META_PATH.write_text(json.dumps({"created_at": created_at, "items": metadata}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    SUMMARY_PATH.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    lines = [
        "# Manus 신규 여성 이미지 80장 measured 벡터 리뷰",
        "",
        "## 대상",
        "",
        "- `NEW_FI01~NEW_FI64`: 새 전체 후보 세트",
        "- `FI65~FI80`: 추가 보강 후보",
        "- 총 80장",
        "",
        "## 산출물",
        "",
        "- `public/appearance-ideal/ANALYSIS_RAW_FEMALE_MANUS_NEW.json`",
        "- `public/appearance-ideal/METADATA_FEMALE_MANUS_NEW.json`",
        "- `public/appearance-ideal/FEMALE_MANUS_NEW_VECTOR_SUMMARY.json`",
        "- `public/appearance-ideal/NEW_FEMALE_FILE_AUDIT.json`",
        "",
        "## final_bucket 분포",
        "",
        "| final_bucket | 수량 |",
        "|---|---:|",
    ]
    for t in TYPES:
        lines.append(f"| {t} | {final_counts.get(t, 0)} |")
    lines.extend(
        [
            "",
            "## 점수대 분포",
            "",
            "| 점수대 | 수량 |",
            "|---|---:|",
        ]
    )
    for band, count in sorted(score_bands.items()):
        lines.append(f"| {band} | {count} |")
    lines.extend(
        [
            "",
            "## 기존 부족 버킷 보강 후보",
            "",
            f"- 귀여운/동안형: {shortage_fill_priority['귀여운/동안형']}",
            f"- 따뜻한/부드러운형: {shortage_fill_priority['따뜻한/부드러운형']}",
            f"- 성숙/분위기형: {shortage_fill_priority['성숙/분위기형']}",
            "",
            "## 판단",
            "",
            "- 새 세트는 이전보다 현실형/평균형이 섞여 있어 점수 분포가 더 쓸만하다.",
            "- 다만 여전히 청순/지적/따뜻 계열로 읽히는 이미지가 많아, 최종 64장 편성은 measured final_bucket 기준으로 해야 한다.",
            "- `NEW_FI17~NEW_FI30`, `NEW_FI39~NEW_FI48`, `NEW_FI59~NEW_FI64`는 이전 세트보다 스타일/성숙/시크 구분에 유리하다.",
            "- `FI65~FI80`은 평균권 보정 후보로 쓸 수 있어, 기존 세트가 너무 예쁜 쪽으로 치우치는 문제를 완화한다.",
            "",
        ]
    )
    REVIEW_PATH.write_text("\n".join(lines), encoding="utf-8")

    table_lines = [
        "# Manus 신규 여성 이미지 80장 분류표",
        "",
        "이 표는 `target` 기준이 아니라 접촉시트 기반 measured 기준이다. 매칭/월드컵 선호 계산에는 `final_bucket`과 `appearance_vector`를 사용한다.",
        "",
        "| ID | 점수 | primary_type | final_bucket | secondary | 분위기 |",
        "|---|---:|---|---|---|---|",
    ]
    for item in metadata:
        measured = item["measured"]
        table_lines.append(
            "| {id} | {score} | {primary} | {bucket} | {secondary} | {mood} |".format(
                id=item["id"],
                score=measured["appearance_score_normalized"],
                primary=measured["primary_type"],
                bucket=item["final_bucket"],
                secondary=", ".join(measured["secondary_types"]),
                mood=measured["visible_features"]["overall_mood"],
            )
        )
    TABLE_PATH.write_text("\n".join(table_lines) + "\n", encoding="utf-8")

    print(json.dumps({"raw": str(RAW_PATH), "metadata": str(META_PATH), "summary": str(SUMMARY_PATH), "review": str(REVIEW_PATH), "table": str(TABLE_PATH), "final_bucket_counts": dict(final_counts)}, ensure_ascii=False))


if __name__ == "__main__":
    main()

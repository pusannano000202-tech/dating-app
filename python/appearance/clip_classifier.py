"""
CLIP 기반 외모 타입 분류기
사용자 사진 → 6가지 외모 타입(cute/pure/chic/warm/stylish/healthy) 유사도 점수 반환
"""
import logging
from PIL import Image

logger = logging.getLogger(__name__)

# 6가지 외모 타입별 프롬프트 — 추상적 단어보다 구체적 시각 특징으로 작성
TYPE_PROMPTS = {
    "cute": (
        "Korean female college student, round face, large round eyes, "
        "soft baby-face features, youthful chubby cheeks, bright smile, "
        "pastel casual outfit"
    ),
    "pure": (
        "Korean female college student, natural minimal makeup, "
        "innocent gentle expression, clean fresh skin, calm eyes, "
        "simple white or light-colored outfit, straight hair"
    ),
    "chic": (
        "Korean female college student, sharp defined features, "
        "cool confident expression, straight neutral gaze, "
        "monochrome dark outfit, sleek hair"
    ),
    "warm": (
        "Korean female college student, warm friendly smile, "
        "soft approachable expression, kind gentle eyes, "
        "cozy knit sweater, natural wavy hair"
    ),
    "stylish": (
        "Korean female college student, trendy fashionable outfit, "
        "modern stylish appearance, confident pose, "
        "on-trend accessories, styled hair"
    ),
    "healthy": (
        "Korean female college student, athletic toned appearance, "
        "bright energetic complexion, sporty casual outfit, "
        "vibrant healthy look, natural no-makeup"
    ),
}

TYPE_PROMPTS_MALE = {
    "warm": (
        "Korean male college student, warm friendly smile, "
        "soft approachable expression, kind eyes, "
        "cozy knit sweater, natural hair"
    ),
    "dandy": (
        "Korean male college student, neat clean-cut appearance, "
        "calm confident expression, well-groomed, "
        "collared shirt, tidy hair"
    ),
    "chic": (
        "Korean male college student, sharp defined jawline, "
        "cool intense gaze, dark minimal outfit, "
        "sleek styled hair"
    ),
    "cute": (
        "Korean male college student, boyish youthful face, "
        "large soft eyes, round face, bright smile, "
        "casual hoodie, fluffy hair"
    ),
    "healthy": (
        "Korean male college student, athletic muscular build, "
        "bright skin, energetic expression, "
        "sporty outfit, short hair"
    ),
    "intellectual": (
        "Korean male college student, glasses, smart intellectual look, "
        "calm composed expression, button-up shirt, "
        "neat appearance"
    ),
}

_model = None
_processor = None


def load_clip_model():
    global _model, _processor
    if _model is not None:
        return
    try:
        from transformers import CLIPModel, CLIPProcessor
        logger.info("CLIP 모델 로딩 중 (openai/clip-vit-base-patch32)...")
        _model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
        _processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
        _model.eval()
        logger.info("CLIP 모델 로드 완료")
    except Exception as e:
        logger.error("CLIP 모델 로드 실패: %s", e)
        raise


def classify_type(image: Image.Image, gender: str = "female") -> dict:
    """
    이미지 → 외모 타입별 점수 반환
    gender: "female" | "male"
    반환: { "cute": 42.3, "pure": 31.1, ... } — 합계 100
    """
    import torch

    if _model is None or _processor is None:
        load_clip_model()

    prompts = TYPE_PROMPTS if gender == "female" else TYPE_PROMPTS_MALE
    type_keys = list(prompts.keys())
    texts = list(prompts.values())

    inputs = _processor(
        text=texts,
        images=image,
        return_tensors="pt",
        padding=True,
        truncation=True,
        max_length=77,
    )

    with torch.no_grad():
        outputs = _model(**inputs)
        image_embeds = outputs.image_embeds  # [1, 512]
        text_embeds = outputs.text_embeds    # [num_types, 512]

        # L2 정규화 후 코사인 유사도 (각 타입 독립 계산)
        image_embeds = image_embeds / image_embeds.norm(dim=-1, keepdim=True)
        text_embeds = text_embeds / text_embeds.norm(dim=-1, keepdim=True)
        similarities = (image_embeds @ text_embeds.T)[0]  # [num_types], 범위 -1~1

    # -1~1 → 0~100 선형 변환 (독립 점수, 합계 100 아님)
    scores = {
        type_keys[i]: round((float(similarities[i]) + 1) / 2 * 100, 1)
        for i in range(len(type_keys))
    }

    # 점수 내림차순 정렬
    scores = dict(sorted(scores.items(), key=lambda x: x[1], reverse=True))
    return scores


def get_top_type(scores: dict) -> str:
    return max(scores, key=scores.get)

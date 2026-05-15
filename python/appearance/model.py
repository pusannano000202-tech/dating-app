"""
ResNet50-based facial beauty scorer trained on SCUT-FBP5500.
Outputs a raw score in [0, 100].
"""
import os
import logging
from io import BytesIO

import torch
import torch.nn as nn
from torchvision import models, transforms
from PIL import Image
import requests

logger = logging.getLogger(__name__)

SCORE_MIN = 1.0  # SCUT-FBP5500 label range
SCORE_MAX = 5.0

_DOWNLOAD_TIMEOUT = int(os.getenv("IMAGE_DOWNLOAD_TIMEOUT", "15"))
_MAX_IMAGE_BYTES  = int(os.getenv("MAX_IMAGE_BYTES", str(20 * 1024 * 1024)))  # 20MB

_transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406],
                         std=[0.229, 0.224, 0.225]),
])

_HEADERS = {
    "User-Agent": "AppearanceAI/1.0 (scoring-bot)",
}


def build_model(weights_path: str | None = None) -> nn.Module:
    model = models.resnet50(weights=None)
    model.fc = nn.Linear(model.fc.in_features, 1)

    if weights_path and os.path.exists(weights_path):
        logger.info("학습된 가중치 로드: %s", weights_path)
        state = torch.load(weights_path, map_location="cpu", weights_only=True)
        model.load_state_dict(state)
    else:
        logger.warning("가중치 파일 없음 — ImageNet pretrained backbone 사용 (점수 정확도 낮음)")
        backbone = models.resnet50(weights=models.ResNet50_Weights.DEFAULT)
        backbone.fc = nn.Linear(backbone.fc.in_features, 1)
        nn.init.xavier_uniform_(backbone.fc.weight)
        nn.init.zeros_(backbone.fc.bias)
        model = backbone

    model.eval()
    return model


def load_image_from_url(url: str) -> Image.Image:
    resp = requests.get(
        url,
        timeout=_DOWNLOAD_TIMEOUT,
        headers=_HEADERS,
        stream=True,
    )
    resp.raise_for_status()

    content_type = resp.headers.get("Content-Type", "")
    if not content_type.startswith("image/"):
        raise ValueError(f"이미지가 아닌 파일: {content_type}")

    data = b""
    for chunk in resp.iter_content(chunk_size=65536):
        data += chunk
        if len(data) > _MAX_IMAGE_BYTES:
            raise ValueError(f"이미지 용량 초과 ({_MAX_IMAGE_BYTES // (1024*1024)}MB 제한)")

    try:
        img = Image.open(BytesIO(data)).convert("RGB")
    except Exception as e:
        raise ValueError(f"이미지 파싱 실패: {e}") from e

    return img


def score_image(model: nn.Module, img: Image.Image) -> float:
    """단일 이미지 → 0~100 점수"""
    tensor = _transform(img).unsqueeze(0)
    with torch.no_grad():
        raw = model(tensor).item()
    clamped = max(SCORE_MIN, min(SCORE_MAX, raw))
    return (clamped - SCORE_MIN) / (SCORE_MAX - SCORE_MIN) * 100.0


def score_photos(model: nn.Module, photo_urls: list[str]) -> float:
    """사진 여러 장 → 평균 점수 (0~100). 일부 실패 시 성공한 것만 평균."""
    if not photo_urls:
        raise ValueError("사진이 없습니다")

    scores: list[float] = []
    errors: list[str] = []

    for i, url in enumerate(photo_urls):
        try:
            img = load_image_from_url(url)
            s = score_image(model, img)
            scores.append(s)
            logger.debug("사진 %d 점수: %.1f", i, s)
        except Exception as e:
            logger.warning("사진 %d 처리 실패: %s", i, e)
            errors.append(str(e))

    if not scores:
        raise ConnectionError(f"모든 사진 처리 실패: {errors}")

    if errors:
        logger.warning("%d장 처리 실패 (성공 %d장으로 계산)", len(errors), len(scores))

    return sum(scores) / len(scores)

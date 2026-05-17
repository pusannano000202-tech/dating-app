"""
ResNet-18 based facial beauty scorer trained on SCUT-FBP5500.
Outputs a raw score in [0, 100].

가중치: Hugging Face - Gustrd/SCUT-FBP5500-PyTorch-Model (resnet18_py3.pth)
서버 최초 실행 시 자동 다운로드, 이후 로컬 캐시 사용.
"""
import os
import logging
from io import BytesIO
from pathlib import Path

import torch
import torch.nn as nn
from torchvision import models, transforms
from PIL import Image
import requests

logger = logging.getLogger(__name__)

SCORE_MIN = 1.0  # SCUT-FBP5500 레이블 범위
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

_HF_WEIGHTS_URL = (
    "https://huggingface.co/Gustrd/SCUT-FBP5500-PyTorch-Model"
    "/resolve/main/resnet18_py3.pth"
)
_DEFAULT_WEIGHTS_PATH = Path("weights/resnet18_scut.pth")


def _download_weights(dest: Path) -> None:
    """Hugging Face에서 SCUT 가중치 자동 다운로드"""
    dest.parent.mkdir(parents=True, exist_ok=True)
    logger.info("SCUT 가중치 다운로드 중 (최초 1회): %s", _HF_WEIGHTS_URL)
    resp = requests.get(_HF_WEIGHTS_URL, timeout=120, stream=True)
    resp.raise_for_status()
    with open(dest, "wb") as f:
        for chunk in resp.iter_content(chunk_size=65536):
            f.write(chunk)
    logger.info("가중치 다운로드 완료: %s (%.1f MB)", dest, dest.stat().st_size / 1e6)


def build_model(weights_path: str | None = None) -> nn.Module:
    """
    ResNet-18 모델 빌드.
    우선순위: 환경변수 경로 > 로컬 캐시 > HF 자동 다운로드 > ImageNet fallback
    """
    model = models.resnet18(weights=None)
    model.fc = nn.Linear(model.fc.in_features, 1)

    path = Path(weights_path) if weights_path else _DEFAULT_WEIGHTS_PATH

    if not path.exists():
        try:
            _download_weights(path)
        except Exception as e:
            logger.warning(
                "가중치 다운로드 실패: %s — ImageNet backbone으로 fallback (점수 의미 없음)", e
            )
            backbone = models.resnet18(weights=models.ResNet18_Weights.DEFAULT)
            backbone.fc = nn.Linear(backbone.fc.in_features, 1)
            nn.init.xavier_uniform_(backbone.fc.weight)
            nn.init.zeros_(backbone.fc.bias)
            return backbone.eval()

    logger.info("SCUT 가중치 로드: %s", path)
    checkpoint = torch.load(path, map_location="cpu", weights_only=False)
    state = checkpoint.get("state_dict", checkpoint)

    # SCUT 공식 Nets.py의 키 형식을 torchvision ResNet-18 키로 변환
    # group1.conv1 → conv1, group2.fullyconnected → fc
    # layerN.M.group1.conv1 → layerN.M.conv1
    def _remap(k: str) -> str:
        k = k.replace("module.", "")
        k = k.replace("group2.fullyconnected", "fc")
        k = k.replace(".group1.", ".")
        if k.startswith("group1."):
            k = k[len("group1."):]
        return k

    state = {_remap(k): v for k, v in state.items()}
    model.load_state_dict(state)
    model.eval()
    logger.info("외모 AI 모델 로드 완료 (ResNet-18 + SCUT-FBP5500)")
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

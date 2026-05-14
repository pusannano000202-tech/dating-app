"""
ResNet50-based facial beauty scorer trained on SCUT-FBP5500.
Outputs a raw score in [0, 100].
"""
import os
import torch
import torch.nn as nn
from torchvision import models, transforms
from PIL import Image
import requests
from io import BytesIO

SCORE_MIN = 1.0  # SCUT-FBP5500 label range
SCORE_MAX = 5.0

_transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406],
                         std=[0.229, 0.224, 0.225]),
])


def build_model(weights_path: str | None = None) -> nn.Module:
    model = models.resnet50(weights=None)
    model.fc = nn.Linear(model.fc.in_features, 1)

    if weights_path and os.path.exists(weights_path):
        state = torch.load(weights_path, map_location="cpu")
        model.load_state_dict(state)
    else:
        # 가중치 없으면 ImageNet pretrained backbone 사용 (개발/테스트용)
        backbone = models.resnet50(weights=models.ResNet50_Weights.DEFAULT)
        backbone.fc = nn.Linear(backbone.fc.in_features, 1)
        nn.init.xavier_uniform_(backbone.fc.weight)
        nn.init.zeros_(backbone.fc.bias)
        model = backbone

    model.eval()
    return model


def load_image_from_url(url: str) -> Image.Image:
    resp = requests.get(url, timeout=10)
    resp.raise_for_status()
    img = Image.open(BytesIO(resp.content)).convert("RGB")
    return img


def score_image(model: nn.Module, img: Image.Image) -> float:
    """단일 이미지 → 0~100 점수"""
    tensor = _transform(img).unsqueeze(0)
    with torch.no_grad():
        raw = model(tensor).item()
    # SCUT-FBP5500 label [1,5] → [0,100] 정규화
    clamped = max(SCORE_MIN, min(SCORE_MAX, raw))
    return (clamped - SCORE_MIN) / (SCORE_MAX - SCORE_MIN) * 100.0


def score_photos(model: nn.Module, photo_urls: list[str]) -> float:
    """사진 여러 장 → 평균 점수 (0~100)"""
    scores = []
    for url in photo_urls:
        img = load_image_from_url(url)
        scores.append(score_image(model, img))
    if not scores:
        raise ValueError("사진이 없습니다")
    return sum(scores) / len(scores)

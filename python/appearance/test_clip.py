"""
CLIP 타입 분류 빠른 테스트 스크립트
서버 없이 단독 실행 가능

사용법:
  python test_clip.py --url "https://..." --gender female
  python test_clip.py --file "사진.jpg" --gender male
"""
import argparse
import sys
from PIL import Image
import requests
from io import BytesIO

def load_from_url(url: str) -> Image.Image:
    resp = requests.get(url, timeout=15)
    resp.raise_for_status()
    return Image.open(BytesIO(resp.content)).convert("RGB")

def load_from_file(path: str) -> Image.Image:
    return Image.open(path).convert("RGB")

def main():
    parser = argparse.ArgumentParser(description="CLIP 외모 타입 분류 테스트")
    parser.add_argument("--url",    type=str, help="사진 URL")
    parser.add_argument("--file",   type=str, help="로컬 사진 파일 경로")
    parser.add_argument("--gender", type=str, default="female", choices=["female", "male"])
    args = parser.parse_args()

    if not args.url and not args.file:
        print("--url 또는 --file 중 하나를 입력하세요")
        sys.exit(1)

    print("CLIP 모델 로딩 중...")
    from clip_classifier import load_clip_model, classify_type, get_top_type
    load_clip_model()
    print("로드 완료\n")

    if args.url:
        print(f"URL에서 이미지 다운로드 중: {args.url}")
        img = load_from_url(args.url)
    else:
        print(f"파일 로드 중: {args.file}")
        img = load_from_file(args.file)

    print(f"성별: {args.gender}")
    print("분류 중...\n")

    scores = classify_type(img, gender=args.gender)
    top = get_top_type(scores)

    print("=" * 40)
    print(f"  최고 타입: {top.upper()}")
    print("=" * 40)
    for type_name, score in scores.items():
        bar = "█" * int(score / 5) + "░" * (20 - int(score / 5))
        print(f"  {type_name:12s} {bar} {score:.1f}%")
    print("=" * 40)

if __name__ == "__main__":
    main()

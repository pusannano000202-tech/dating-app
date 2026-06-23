from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
IMG_DIR = ROOT / "public" / "appearance-ideal" / "female-64"
OUT_DIR = ROOT / "public" / "appearance-ideal"


def image_ids() -> list[str]:
    return [f"NEW_FI{i:02d}" for i in range(1, 65)] + [f"FI{i:02d}" for i in range(65, 81)]


def make_sheet(ids: list[str], out_path: Path, cols: int = 8, thumb_w: int = 180) -> None:
    rows = (len(ids) + cols - 1) // cols
    label_h = 24
    thumb_h = int(thumb_w * 4 / 3)
    sheet = Image.new("RGB", (cols * thumb_w, rows * (thumb_h + label_h)), "white")
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("arial.ttf", 13)
    except OSError:
        font = ImageFont.load_default()

    for idx, image_id in enumerate(ids):
        path = IMG_DIR / f"{image_id}.jpg"
        with Image.open(path) as im:
            im = im.convert("RGB")
            im.thumbnail((thumb_w, thumb_h), Image.Resampling.LANCZOS)
            tile = Image.new("RGB", (thumb_w, thumb_h), "white")
            x = (thumb_w - im.width) // 2
            y = (thumb_h - im.height) // 2
            tile.paste(im, (x, y))
        col = idx % cols
        row = idx // cols
        px = col * thumb_w
        py = row * (thumb_h + label_h)
        sheet.paste(tile, (px, py))
        draw.text((px + 4, py + thumb_h + 4), image_id, fill="black", font=font)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out_path, quality=92)


def main() -> None:
    items = []
    for image_id in image_ids():
        path = IMG_DIR / f"{image_id}.jpg"
        with Image.open(path) as im:
            width, height = im.size
        items.append(
            {
                "id": image_id,
                "file": str(path.relative_to(ROOT)).replace("\\", "/"),
                "width": width,
                "height": height,
                "ratio": round(width / height, 4),
                "ok_ratio": abs((width / height) - 0.75) < 0.01,
                "ok_size": width >= 768 and height >= 1024,
                "bytes": path.stat().st_size,
            }
        )

    make_sheet([f"NEW_FI{i:02d}" for i in range(1, 65)], IMG_DIR / "CONTACT_SHEET_NEW_FI01_FI64.jpg")
    make_sheet([f"FI{i:02d}" for i in range(65, 81)], IMG_DIR / "CONTACT_SHEET_FI65_FI80.jpg", cols=8)
    make_sheet(image_ids(), IMG_DIR / "CONTACT_SHEET_NEW_AND_FI65_FI80.jpg", cols=8)

    audit = {
        "count": len(items),
        "problems": [item for item in items if not item["ok_ratio"] or not item["ok_size"]],
        "items": items,
        "contact_sheets": [
            "public/appearance-ideal/female-64/CONTACT_SHEET_NEW_FI01_FI64.jpg",
            "public/appearance-ideal/female-64/CONTACT_SHEET_FI65_FI80.jpg",
            "public/appearance-ideal/female-64/CONTACT_SHEET_NEW_AND_FI65_FI80.jpg",
        ],
    }
    out_path = OUT_DIR / "NEW_FEMALE_FILE_AUDIT.json"
    out_path.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"audit": str(out_path), "count": len(items), "problems": len(audit["problems"])}, ensure_ascii=False))


if __name__ == "__main__":
    main()

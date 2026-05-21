from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
IDEAL_DIR = ROOT / "public" / "appearance-ideal"
IMG_DIR = IDEAL_DIR / "female-64"
META_PATH = IDEAL_DIR / "METADATA_FEMALE_MANUS_NEW.json"
REPORT_DIR = IDEAL_DIR / "manus-new-grouped-report"
REPORT_PATH = IDEAL_DIR / "마누스_신규_여성이미지_유형별_묶음_보고서.md"

TYPE_ORDER = [
    "귀여운/동안형",
    "청순/자연형",
    "시크/도도형",
    "따뜻한/부드러운형",
    "스타일리시/화려형",
    "건강/활동형",
    "성숙/분위기형",
    "지적/단정형",
]

SAFE_NAMES = {
    "귀여운/동안형": "01_cute_young",
    "청순/자연형": "02_pure_natural",
    "시크/도도형": "03_chic_cool",
    "따뜻한/부드러운형": "04_warm_soft",
    "스타일리시/화려형": "05_stylish_glam",
    "건강/활동형": "06_healthy_active",
    "성숙/분위기형": "07_mature_mood",
    "지적/단정형": "08_intellectual_neat",
}


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT)).replace("\\", "/")


def rel_from_report(path: Path) -> str:
    return str(path.relative_to(REPORT_PATH.parent)).replace("\\", "/")


def make_contact_sheet(items: list[dict], out_path: Path, cols: int = 4, thumb_w: int = 220) -> None:
    if not items:
        return

    rows = (len(items) + cols - 1) // cols
    label_h = 44
    thumb_h = int(thumb_w * 4 / 3)
    sheet = Image.new("RGB", (cols * thumb_w, rows * (thumb_h + label_h)), "white")
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("arial.ttf", 14)
        small = ImageFont.truetype("arial.ttf", 12)
    except OSError:
        font = ImageFont.load_default()
        small = ImageFont.load_default()

    for idx, item in enumerate(items):
        measured = item["measured"]
        img_path = ROOT / item["file"]
        with Image.open(img_path) as im:
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
        draw.text((px + 6, py + thumb_h + 4), f"{item['id']} / {measured['appearance_score_normalized']}점", fill="black", font=font)
        draw.text((px + 6, py + thumb_h + 24), measured["primary_type"], fill="dimgray", font=small)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out_path, quality=92)


def main() -> None:
    data = json.loads(META_PATH.read_text(encoding="utf-8"))
    items = data["items"]

    groups: dict[str, list[dict]] = defaultdict(list)
    for item in items:
        groups[item["final_bucket"]].append(item)

    for bucket in groups:
        groups[bucket].sort(key=lambda item: (-item["measured"]["appearance_score_normalized"], item["id"]))

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    group_sheet_paths = {}
    for bucket in TYPE_ORDER:
        sheet_path = REPORT_DIR / f"{SAFE_NAMES[bucket]}.jpg"
        make_contact_sheet(groups.get(bucket, []), sheet_path)
        group_sheet_paths[bucket] = sheet_path

    lines = [
        "# 마누스 신규 여성 이미지 유형별 묶음 보고서",
        "",
        "## 기준",
        "",
        "- 대상: `NEW_FI01~NEW_FI64`, `FI65~FI80`, 총 80장",
        "- 분류 기준: 생성 의도나 파일명 순서가 아니라 measured `final_bucket` 기준",
        "- 매칭/이상형 월드컵 집계에는 이 보고서의 유형보다 `METADATA_FEMALE_MANUS_NEW.json`의 `appearance_vector`를 우선 사용",
        "- 점수는 내부 매칭용 점수이며 사용자에게 직접 노출하지 않음",
        "",
        "## 전체 분포",
        "",
        "| 유형 | 수량 |",
        "|---|---:|",
    ]
    for bucket in TYPE_ORDER:
        lines.append(f"| {bucket} | {len(groups.get(bucket, []))} |")

    lines.extend(
        [
            "",
            "## 유형별 사진 묶음",
            "",
        ]
    )

    for bucket in TYPE_ORDER:
        bucket_items = groups.get(bucket, [])
        sheet_path = group_sheet_paths[bucket]
        lines.extend(
            [
                f"## {bucket}",
                "",
                f"수량: {len(bucket_items)}장",
                "",
            ]
        )
        if bucket_items:
            lines.extend(
                [
                    f"![{bucket}]({rel_from_report(sheet_path)})",
                    "",
                    "| ID | 점수 | 사진 위치 | primary | secondary | 분위기 |",
                    "|---|---:|---|---|---|---|",
                ]
            )
            for item in bucket_items:
                measured = item["measured"]
                secondary = ", ".join(measured["secondary_types"]) if measured["secondary_types"] else "-"
                mood = measured["visible_features"]["overall_mood"]
                lines.append(
                    f"| {item['id']} | {measured['appearance_score_normalized']} | `{item['file']}` | {measured['primary_type']} | {secondary} | {mood} |"
                )
        else:
            lines.append("해당 유형으로 분류된 이미지가 없음.")
        lines.append("")

    lines.extend(
        [
            "## 실무 판단",
            "",
            "- `지적/단정형`, `건강/활동형`, `따뜻한/부드러운형`, `성숙/분위기형`은 후보가 충분하다.",
            "- `귀여운/동안형`, `청순/자연형`, `스타일리시/화려형`은 최종 64장 균형을 맞추려면 기존 FI01~FI64 후보와 함께 섞어서 봐야 한다.",
            "- 최종 선별은 각 유형에서 점수 상위만 고르면 외모 절대점수가 다시 높아지는 문제가 생기므로, 같은 유형 안에서도 60~70점대 현실형 후보를 일부 남기는 쪽이 낫다.",
            "- 사용자가 어떤 이미지를 선택했는지는 유형 라벨 하나로만 계산하지 말고, 선택 이미지들의 measured vector 평균과 pool 대비 delta를 같이 계산해야 한다.",
            "",
        ]
    )

    REPORT_PATH.write_text("\n".join(lines), encoding="utf-8")
    print(json.dumps({"report": rel(REPORT_PATH), "sheets_dir": rel(REPORT_DIR), "groups": {k: len(groups.get(k, [])) for k in TYPE_ORDER}}, ensure_ascii=False))


if __name__ == "__main__":
    main()

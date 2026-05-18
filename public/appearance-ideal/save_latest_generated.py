
from pathlib import Path
from PIL import Image
import sys
if len(sys.argv) != 2:
    raise SystemExit('usage: save_latest_generated.py FIxx')
id = sys.argv[1]
src = sorted(Path.home().joinpath('.codex/generated_images').rglob('*.png'), key=lambda p: p.stat().st_mtime, reverse=True)[0]
out = Path('public/appearance-ideal/female-64') / f'{id}.jpg'
out.parent.mkdir(parents=True, exist_ok=True)
img = Image.open(src).convert('RGB')
w, h = img.size
tr = 3 / 4
if w / h > tr:
    nw = int(h * tr)
    left = (w - nw) // 2
    img = img.crop((left, 0, left + nw, h))
elif w / h < tr:
    nh = int(w / tr)
    top = (h - nh) // 2
    img = img.crop((0, top, w, top + nh))
img = img.resize((768, 1024), Image.Resampling.LANCZOS)
img.save(out, quality=92)
print(f'{id} <- {src.name} -> {out} {img.size}')

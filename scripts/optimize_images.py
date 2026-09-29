"""Derives web-sized renditions of the brochure imagery referenced in
data/projects.json (originals stay untouched and serve the lightbox):

  assets/images/derived/<slug>/card.jpg          16:9 crop for listing cards
  assets/images/derived/<slug>/thumb-<name>.jpg  4:3 crop for the document grid
  assets/images/derived/<slug>/plan.jpg          resized master layout plan

Run: python scripts/optimize_images.py
"""
import html
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).parent.parent
SRC = ROOT / "assets" / "images" / "projects"
OUT = ROOT / "assets" / "images" / "derived"

CARD_SIZE = (1280, 720)
THUMB_SIZE = (880, 660)
PLAN_MAX_W = 1700


def center_crop(im: Image.Image, size: tuple[int, int], anchor: str = "center") -> Image.Image:
    tw, th = size
    sw, sh = im.size
    scale = max(tw / sw, th / sh)
    im = im.resize((round(sw * scale), round(sh * scale)), Image.LANCZOS)
    left = (im.width - tw) // 2
    top = 0 if anchor == "top" else (im.height - th) // 2
    return im.crop((left, top, left + tw, top + th))


def save(im: Image.Image, path: Path, quality: int = 80) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.convert("RGB").save(path, "JPEG", quality=quality, optimize=True, progressive=True)
    print(f"  {path.relative_to(ROOT)} ({path.stat().st_size // 1024}KB)")


def main() -> None:
    projects = json.loads((ROOT / "data" / "projects.json").read_text(encoding="utf-8"))
    for p in projects:
        slug = p["slug"]
        print(slug)
        out_dir = OUT / slug

        card_src = Image.open(SRC / slug / html.unescape(p["card"]))
        card_anchor = p.get("card_anchor", "center")
        save(center_crop(card_src, CARD_SIZE, card_anchor), out_dir / "card.jpg")

        plan_src = Image.open(SRC / slug / html.unescape(p["plan"]["src"]))
        if plan_src.width > PLAN_MAX_W:
            ratio = PLAN_MAX_W / plan_src.width
            plan_src = plan_src.resize((PLAN_MAX_W, round(plan_src.height * ratio)), Image.LANCZOS)
        save(plan_src, out_dir / "plan.jpg", quality=82)

        for g in p["gallery"]:
            name = html.unescape(g["src"])
            thumb = center_crop(Image.open(SRC / slug / name), THUMB_SIZE)
            save(thumb, out_dir / f"thumb-{Path(name).stem}.jpg", quality=76)


if __name__ == "__main__":
    main()

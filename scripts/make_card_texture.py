"""Build listing-card source images for projects whose only brochure imagery
is a dense plot-number grid (unreadable at card thumbnail size, and the
grid-as-texture trick used for the homepage hero doesn't work standalone —
that only reads as "pattern" behind a dark scrim and headline text, not as
a plain card tile). Instead crops each project's own clean title/logo block
from its real brochure page — same real document, a better-chosen region,
no new photography, matching CLAUDE.md's "reuse brochure imagery" decision.

Output lands in assets/images/projects/<slug>/ as a new SOURCE file; the
normal optimize_images.py pipeline still derives card.jpg from it (this
script does not touch derived/ directly).

Run: python scripts/make_card_texture.py
"""
from PIL import Image
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H = 1280, 720

# (slug, source brochure page, crop box as x0,y0,x1,y1 fractions of source,
# degrees to rotate the crop before framing — some brochures print their
# title sideways as a design flourish) — boxes hand-picked to land on that
# project's own title/logo/stamp block.
JOBS = [
    ('high-rich-county', 'assets/images/projects/high-rich-county/img-2-2.jpeg', (0.66, 0.10, 1.0, 0.34), 90),
    ('modern-premium-county', 'assets/images/projects/modern-premium-county/img-1-1.jpeg', (0.0, 0.06, 0.56, 0.37), 0),
]


def build(slug, src_path, box, rotate=0):
    im = Image.open(os.path.join(ROOT, src_path)).convert('RGB')
    w, h = im.size
    x0, y0, x1, y1 = box
    crop = im.crop((int(w * x0), int(h * y0), int(w * x1), int(h * y1)))
    if rotate:
        crop = crop.rotate(rotate, expand=True)

    scale = max(W / crop.width, H / crop.height)
    scaled = crop.resize((round(crop.width * scale), round(crop.height * scale)), Image.LANCZOS)
    left = (scaled.width - W) // 2
    top = (scaled.height - H) // 2
    frame = scaled.crop((left, top, left + W, top + H))

    out_path = os.path.join(ROOT, 'assets', 'images', 'projects', slug, 'card-survey.jpg')
    frame.save(out_path, quality=88, optimize=True)
    print(f"{os.path.relpath(out_path, ROOT)} {frame.size} {os.path.getsize(out_path)/1024:.0f}KB")


if __name__ == '__main__':
    for slug, src, box, rot in JOBS:
        build(slug, src, box, rot)

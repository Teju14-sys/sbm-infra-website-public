"""Build the homepage hero backdrop from a real DTCP-approved master layout plan.

Build-time asset prep, like extract_logo_colors.py — not part of the live site.
Re-run only if the source plan changes:

    python scripts/make_hero_texture.py
"""
from PIL import Image, ImageEnhance, ImageOps
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets/images/derived/sharanam-valley/plan.jpg')
DEST = os.path.join(ROOT, 'assets/images/hero-survey-plan.jpg')

W, H = 2560, 1440
INK = (10, 31, 51)      # --ink-deep
CREAM = (250, 247, 242)  # --cream

# Crop the plot-grid interior: excludes the title block, legend, plot-size
# table and highway labels, so it reads as texture rather than as a document.
BOX = (0.30, 0.28, 0.72, 0.58)


def main():
    im = Image.open(SRC).convert('RGB')
    w, h = im.size
    x0, y0, x1, y1 = BOX
    crop = im.crop((int(w * x0), int(h * y0), int(w * x1), int(h * y1)))

    out_w = int(W * 2.1)
    scaled = crop.resize((out_w, int(out_w * crop.height / crop.width)), Image.LANCZOS)
    if scaled.height >= H:
        top = (scaled.height - H) // 2
        frame = scaled.crop((0, top, W, top + H))
    else:
        frame = scaled.resize((W, H), Image.LANCZOS)

    grey = ImageEnhance.Contrast(ImageOps.grayscale(frame)).enhance(1.15)
    ImageOps.colorize(grey, black=INK, white=CREAM).save(DEST, quality=84, optimize=True)

    print(f"{os.path.relpath(DEST, ROOT)} {Image.open(DEST).size} "
          f"{os.path.getsize(DEST) / 1024:.0f}KB")


if __name__ == '__main__':
    main()

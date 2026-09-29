"""One-time brand color sampler. Run: python scripts/extract_logo_colors.py"""
from pathlib import Path
from collections import Counter
from PIL import Image

def sample_colors(logo_path: Path) -> dict:
    img = Image.open(logo_path).convert("RGBA")
    colors = Counter()
    for r, g, b, a in img.getdata():
        if a < 128:
            continue
        if r > 240 and g > 240 and b > 240:
            continue
        if r < 25 and g < 25 and b < 25:
            continue
        colors[(r, g, b)] += 1

    blue_votes, orange_votes, dark_votes = Counter(), Counter(), Counter()
    for (r, g, b), count in colors.items():
        if b > r and b > g:
            blue_votes[(r, g, b)] += count
        elif r > 150 and r > b + 30:
            orange_votes[(r, g, b)] += count
        elif r < 90 and g < 90 and b < 90:
            dark_votes[(r, g, b)] += count

    def hexify(rgb):
        return "#%02X%02X%02X" % rgb

    return {
        "primary_blue": hexify(blue_votes.most_common(1)[0][0]),
        "accent_orange": hexify(orange_votes.most_common(1)[0][0]),
        "text_dark": hexify(dark_votes.most_common(1)[0][0]),
    }

if __name__ == "__main__":
    result = sample_colors(Path(__file__).parent.parent / "logo.png")
    print(result)
    assert result["primary_blue"] == "#0054A3"
    assert result["accent_orange"] == "#E84C09"
    assert result["text_dark"] == "#1A1A18"
    print("OK: matches tokens.css values")

"""Extracts embedded images from each project's brochure PDF into
assets/images/projects/<slug>/. Run: python scripts/extract_project_images.py"""
from pathlib import Path
import fitz  # PyMuPDF

ROOT = Path(__file__).parent.parent

PDF_MAP = {
    "sharanam-valley": "SHARANAM VALLEY.pdf",
    "green-meadows": "GREEN MEADOWS.pdf",
    "capital-smart-city": "CAPITAL SMART CITY.pdf",
    "high-rich-county": "HIGH RICH COUNTY.pdf",
    "modern-premium-county": "MODERN PREMIUM COUNTY.pdf",
    "prakruthi-hills": "PRAKRUTHI HILLS.pdf",
    "urban-elite": "URBAN ELITE (1).pdf",
}

MIN_WIDTH = 300   # skip tiny icons/logos, keep real photos/layout maps
MIN_HEIGHT = 300

def extract(slug: str, pdf_name: str) -> int:
    pdf_path = ROOT / pdf_name
    out_dir = ROOT / "assets" / "images" / "projects" / slug
    out_dir.mkdir(parents=True, exist_ok=True)

    doc = fitz.open(pdf_path)
    count = 0
    for page_index in range(len(doc)):
        page = doc[page_index]
        for img in page.get_images(full=True):
            xref = img[0]
            base = doc.extract_image(xref)
            if base["width"] < MIN_WIDTH or base["height"] < MIN_HEIGHT:
                continue
            count += 1
            out_path = out_dir / f"img-{page_index + 1}-{count}.{base['ext']}"
            out_path.write_bytes(base["image"])
    doc.close()
    return count

if __name__ == "__main__":
    total = 0
    for slug, pdf_name in PDF_MAP.items():
        n = extract(slug, pdf_name)
        print(f"{slug}: {n} images extracted from {pdf_name}")
        assert n > 0, f"No images extracted for {slug} — check {pdf_name} exists"
        total += n
    print(f"TOTAL: {total} images across {len(PDF_MAP)} projects")

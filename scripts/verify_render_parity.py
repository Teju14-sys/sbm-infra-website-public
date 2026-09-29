"""Proves api/_lib/render-project.js (Node) produces byte-identical output
to build_project_pages.py's render() (Python) for every current project.

Run: python scripts/verify_render_parity.py

Run this after ANY edit to scripts/templates/project_template.html or to
build_project_pages.py's helper functions, and mirror the edit into
api/_lib/render-project.js before trusting the admin panel again — see
admin/README.md.
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from build_project_pages import render as py_render  # noqa: E402
from build_listing_pages import (  # noqa: E402
    build_projects_html as py_build_projects_html,
    build_index_html as py_build_index_html,
    build_contact_html as py_build_contact_html,
    build_about_html as py_build_about_html,
    build_sitemap as py_build_sitemap,
)


def check_project_pages(projects):
    template = (ROOT / "scripts" / "templates" / "project_template.html").read_text(encoding="utf-8")
    py_pages = {p["slug"]: py_render(template, projects, i) for i, p in enumerate(projects)}

    result = subprocess.run(
        ["node", str(ROOT / "scripts" / "render_project_js.mjs")],
        capture_output=True, text=True, cwd=ROOT,
    )
    if result.returncode != 0:
        print("Node project-page renderer failed:", result.stderr, file=sys.stderr)
        sys.exit(1)
    js_pages = json.loads(result.stdout)

    mismatches = []
    for slug in py_pages:
        if slug not in js_pages:
            mismatches.append(f"{slug}: missing from JS output")
            continue
        if py_pages[slug] != js_pages[slug]:
            mismatches.append(f"{slug}: output differs")
    return py_pages, mismatches


def check_listing_pages(projects):
    card_template = (ROOT / "scripts" / "templates" / "folio_card_template.html").read_text(encoding="utf-8")
    row_template = (ROOT / "scripts" / "templates" / "registry_row_template.html").read_text(encoding="utf-8")

    py_listings = {
        "projects_html": py_build_projects_html(
            (ROOT / "projects.html").read_text(encoding="utf-8"), projects, card_template
        ),
        "index_html": py_build_index_html(
            (ROOT / "index.html").read_text(encoding="utf-8"), projects, row_template
        ),
        "contact_html": py_build_contact_html(
            (ROOT / "contact.html").read_text(encoding="utf-8"), projects
        ),
        "about_html": py_build_about_html(
            (ROOT / "about.html").read_text(encoding="utf-8"), projects
        ),
        "sitemap_xml": py_build_sitemap(projects),
    }

    result = subprocess.run(
        ["node", str(ROOT / "scripts" / "render_listings_js.mjs")],
        capture_output=True, text=True, cwd=ROOT,
    )
    if result.returncode != 0:
        print("Node listing-page renderer failed:", result.stderr, file=sys.stderr)
        sys.exit(1)
    js_listings = json.loads(result.stdout)

    mismatches = []
    for name in py_listings:
        if py_listings[name] != js_listings.get(name):
            mismatches.append(f"{name}: output differs")
    return py_listings, mismatches


def main():
    projects = json.loads((ROOT / "data" / "projects.json").read_text(encoding="utf-8"))

    py_pages, project_mismatches = check_project_pages(projects)
    _, listing_mismatches = check_listing_pages(projects)

    mismatches = project_mismatches + listing_mismatches
    if mismatches:
        print("RENDER PARITY FAILED:")
        for m in mismatches:
            print(f"  - {m}")
        sys.exit(1)

    print(
        f"Render parity OK — {len(py_pages)} projects + 4 listing pages "
        "byte-identical (Python vs. JS)."
    )


if __name__ == "__main__":
    main()

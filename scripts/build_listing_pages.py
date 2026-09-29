"""Regenerates the project-listing regions of projects.html, index.html and
contact.html from data/projects.json, leaving the hand-authored hero/footer
copy on those pages untouched. Regenerated regions are delimited by
<!--MARKER:START-->...<!--MARKER:END--> comment pairs already present in
those files; inline <!--AUTOGEN:name-->value<!--/AUTOGEN--> markers handle
single-value substitutions (the "07"/"Seven" project-count text).
Run: python scripts/build_listing_pages.py"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).parent.parent

NUMBER_WORDS = [
    "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight",
    "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen",
    "Sixteen", "Seventeen", "Eighteen", "Nineteen", "Twenty",
]


def number_to_word(n: int) -> str:
    return NUMBER_WORDS[n] if 0 <= n < len(NUMBER_WORDS) else str(n)


def fill(template: str, fills: dict) -> str:
    out = template
    for key, value in fills.items():
        out = out.replace("{{" + key + "}}", value)
    return out


def build_folio_card(card_template: str, project: dict, index: int, total: int) -> str:
    sold_out_tag = (
        '            <span class="folio-tag sold-out">Fully Booked</span>\n'
        if project.get("sold_out")
        else ""
    )
    fills = {
        "slug": project["slug"],
        "card_alt": project.get("card_alt", f"{project['name']} master layout plan"),
        "index": f"{index:02d}",
        "total": f"{total:02d}",
        "sold_out_tag": sold_out_tag,
        "name": project["name"],
        "location": project["location"],
        "card_tagline": project.get("card_tagline", project["tagline"]),
        "facts": "<br>".join(project["facts"]),
        "lp_badge": project["lp_badge"],
    }
    return fill(card_template, fills).rstrip("\n")


def build_registry_row(row_template: str, project: dict) -> str:
    fills = {
        "slug": project["slug"],
        "name": project["name"],
        "location": project["location"],
        "facts": "<br>".join(project["facts"]),
        "lp_badge": project["lp_badge"],
    }
    return fill(row_template, fills).rstrip("\n")


def build_project_option(project: dict) -> str:
    return f'              <option value="{project["name"]}">{project["name"]}</option>'


def replace_block_marker(content: str, name: str, inner: str) -> str:
    pattern = re.compile(
        r"(<!--" + name + r":START-->\n)(.*?)(\n<!--" + name + r":END-->)", re.DOTALL
    )
    new_content, count = pattern.subn(lambda m: m.group(1) + inner + m.group(3), content)
    assert count == 1, f"Expected exactly one {name} block, found {count}"
    return new_content


def replace_autogen(content: str, name: str, value: str) -> str:
    pattern = re.compile(r"<!--AUTOGEN:" + name + r"-->.*?<!--/AUTOGEN-->", re.DOTALL)
    new_content, count = pattern.subn(f"<!--AUTOGEN:{name}-->{value}<!--/AUTOGEN-->", content)
    assert count >= 1, f"Expected at least one AUTOGEN:{name} marker, found {count}"
    return new_content


def build_projects_html(content: str, projects: list[dict], card_template: str) -> str:
    total = len(projects)
    content = replace_autogen(content, "total_word", number_to_word(total))
    content = replace_autogen(content, "total_word_lower", number_to_word(total).lower())
    content = replace_autogen(content, "total_padded", f"{total:02d}")
    cards = [
        build_folio_card(card_template, p, i + 1, total) for i, p in enumerate(projects)
    ]
    content = replace_block_marker(content, "FOLIO_CARDS", "\n\n".join(cards))
    return content


def build_index_html(content: str, projects: list[dict], row_template: str) -> str:
    total = len(projects)
    content = replace_autogen(content, "total_word", number_to_word(total))
    rows = [build_registry_row(row_template, p) for p in projects]
    content = replace_block_marker(content, "REGISTRY_ROWS", "\n".join(rows))
    return content


def build_contact_html(content: str, projects: list[dict]) -> str:
    options = [build_project_option(p) for p in projects]
    content = replace_block_marker(content, "PROJECT_OPTIONS", "\n".join(options))
    return content


def build_about_html(content: str, projects: list[dict]) -> str:
    total = len(projects)
    content = replace_autogen(content, "total_word", number_to_word(total))
    content = replace_autogen(content, "total_word_lower", number_to_word(total).lower())
    return content


SITE_ORIGIN = "https://sbm-infra-website.vercel.app"

# Fixed real-content pages. Deliberately excludes get-app.html (a device-detection
# redirect utility) and index-alt*.html (redirect stubs to index.html) — neither
# is a page worth Google indexing on its own.
SITEMAP_FIXED_PATHS = ["", "about.html", "projects.html", "contact.html", "news.html", "map.html"]


def build_sitemap(projects: list[dict]) -> str:
    """Regenerated from data/projects.json on every build so a project created
    via the admin panel is never missing from the sitemap again."""
    paths = list(SITEMAP_FIXED_PATHS) + [f"projects/{p['slug']}.html" for p in projects]
    urls = "\n".join(f"  <url><loc>{SITE_ORIGIN}/{path}</loc></url>" for path in paths)
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}\n</urlset>\n'


def main():
    projects = json.loads((ROOT / "data" / "projects.json").read_text(encoding="utf-8"))
    card_template = (ROOT / "scripts" / "templates" / "folio_card_template.html").read_text(encoding="utf-8")
    row_template = (ROOT / "scripts" / "templates" / "registry_row_template.html").read_text(encoding="utf-8")

    targets = [
        ("projects.html", lambda c: build_projects_html(c, projects, card_template)),
        ("index.html", lambda c: build_index_html(c, projects, row_template)),
        ("contact.html", lambda c: build_contact_html(c, projects)),
        ("about.html", lambda c: build_about_html(c, projects)),
    ]
    for filename, builder in targets:
        path = ROOT / filename
        content = path.read_text(encoding="utf-8")
        new_content = builder(content)
        path.write_text(new_content, encoding="utf-8")
        print(f"Wrote {filename}")

    (ROOT / "sitemap.xml").write_text(build_sitemap(projects), encoding="utf-8")
    print("Wrote sitemap.xml")

    print(f"TOTAL: {len(projects)} projects reflected across {len(targets)} listing pages + sitemap.xml")


if __name__ == "__main__":
    main()

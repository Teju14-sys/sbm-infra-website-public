"""Generates projects/<slug>.html for every entry in data/projects.json
from scripts/templates/project_template.html ("Land Registry" design).
Run: python scripts/build_project_pages.py"""
import html
import json
from pathlib import Path

ROOT = Path(__file__).parent.parent

# Fixed display order. Mirrored in api/_lib/render-project.js.
VIDEO_CATEGORY_ORDER = [
    "Before Development",
    "Development",
    "After Development",
    "Launch Day",
    "Drone Footage",
]


def approval_badge(label: str, value: str) -> str:
    return (
        '          <div class="approval-badge"><span class="badge-icon" aria-hidden="true">&#10003;</span>'
        f'<span class="badge-text"><strong>{label}</strong><span>{value}</span></span></div>'
    )


def build_approvals(project: dict) -> str:
    """Approval / RERA badges inside the hero brand plate."""
    blocks = []
    parts = [p.strip() for p in project["rera"].split("&middot;")]
    approvals = [p for p in parts if "RERA" not in p]
    reras = [p for p in parts if "RERA" in p]
    if approvals:
        blocks.append(approval_badge("DTCP / Layout Permission", " &middot; ".join(approvals)))
    if reras:
        blocks.append(approval_badge("RERA Registration", " &middot; ".join(reras)))
    if project.get("final_lp_approved"):
        blocks.append(approval_badge("Status", "Final LP Approved &mdash; Ready to Build"))
    return "\n".join(blocks)


def build_ledger(items: list[str]) -> str:
    return "\n".join(
        f'        <span><b class="tick">+</b> {item}</span>' for item in items
    )


# Fact-table row labels that name a place/corridor rather than a project
# attribute — highlighted so proximity claims read as a callout, not just
# another row. Hand-authored per project, so this is a closed, checked list
# rather than a heuristic. Mirrored in api/_lib/render-project.js.
LOCATION_SPEC_KEYS = {
    "Location", "Corridor", "Corridors", "Nearby", "Adjacent", "Between", "Near", "District", "Frontage",
}


def build_specs(specs: list[dict]) -> str:
    def row(s: dict) -> str:
        cls = ' class="loc-spec"' if s["k"] in LOCATION_SPEC_KEYS else ""
        return f"          <div{cls}><dt>{s['k']}</dt><dd>{s['v']}</dd></div>"

    return "\n".join(row(s) for s in specs)


def build_amenities(amenities: list[str]) -> str:
    return "\n".join(
        f'        <li class="amenity reveal">{item}</li>' for item in amenities
    )


def build_video_section(project: dict) -> str:
    """Optional YouTube walkthrough clips — most projects have none yet."""
    videos = project.get("videos", [])
    if not videos:
        return ""

    def card(v: dict) -> str:
        yt = v["youtube_id"]
        return f"""        <a class="video-card reveal" href="#" data-lightbox data-youtube="{yt}" data-caption="{v['caption']}">
          <span class="video-thumb">
            <img src="https://img.youtube.com/vi/{yt}/hqdefault.jpg" alt="{v['caption']}" loading="lazy">
            <span class="play-btn" aria-hidden="true">&#9658;</span>
          </span>
          <span class="video-cap"><span>{v['label']}</span><span class="watch">Watch Video &#8594;</span></span>
        </a>"""

    groups = []
    for name in VIDEO_CATEGORY_ORDER:
        in_category = [v for v in videos if v.get("category") == name]
        if in_category:
            groups.append((name, in_category))
    rest = [v for v in videos if v.get("category") not in VIDEO_CATEGORY_ORDER]
    if rest:
        groups.append(("More footage", rest))

    # Headings only earn their place once some category on this page holds
    # more than one video - otherwise every heading owns a single card and
    # the section reads thinner than a plain grid.
    if any(len(vs) > 1 for _, vs in groups):
        blocks = []
        for name, vs in groups:
            cards = "\n".join(card(v) for v in vs)
            blocks.append(f"""      <div class="video-group reveal">
        <h3 class="video-group-head">{name}</h3>
        <div class="video-grid stagger">
{cards}
        </div>
      </div>""")
        joined = "\n".join(blocks)
    else:
        cards = "\n".join(card(v) for v in videos)
        joined = f"""      <div class="video-grid stagger">
{cards}
      </div>"""

    return f"""
  <!-- ============ Drone footage ============ -->
  <section class="section section-paper" aria-label="Video walkthrough">
    <div class="wrap">
      <div class="section-head split reveal">
        <div>
          <span class="eyebrow">On Site</span>
          <h2>Watch the walkthrough.</h2>
        </div>
        <span class="section-note">AERIAL FOOTAGE &middot; PLAYS WITH SOUND</span>
      </div>
{joined}
    </div>
  </section>
"""


def build_docs_section(project: dict) -> str:
    """Brochure/document grid — the master plan is shown in its own section,
    so it is excluded here; projects whose gallery is only the plan skip
    this section entirely."""
    slug = project["slug"]
    plan_src = project["plan"]["src"]
    docs = [g for g in project["gallery"] if g["src"] != plan_src]
    if not docs:
        return ""
    items = []
    for g in docs:
        stem = Path(html.unescape(g["src"])).stem
        items.append(f"""        <a class="doc-item reveal" href="../assets/images/projects/{slug}/{g['src']}" data-lightbox data-caption="{project['name']} &mdash; {g['cap']}">
          <span class="doc-media"><img src="../assets/images/derived/{slug}/thumb-{stem}.jpg" alt="{project['name']} &mdash; {g['cap']}" loading="lazy"></span>
          <span class="doc-cap"><span>{g['cap']}</span><span class="plus">+</span></span>
        </a>""")
    joined = "\n".join(items)
    return f"""
  <!-- ============ From the record ============ -->
  <section class="section" aria-label="Brochure and documents">
    <div class="wrap">
      <div class="section-head split reveal">
        <div>
          <span class="eyebrow">From the Record</span>
          <h2>Brochure &amp; documents.</h2>
        </div>
        <span class="section-note">REPRODUCED FROM THE PROJECT BROCHURE</span>
      </div>
      <div class="doc-grid stagger">
{joined}
      </div>
    </div>
  </section>
"""


def build_hero_ghost(project: dict) -> str:
    """Hero backdrop: the ghosted plan image, optionally upgraded to a
    muted looping YouTube clip (alt.js swaps the video in on capable
    desktops; the plan image stays as poster/fallback)."""
    slug = project["slug"]
    poster = f'<img src="../assets/images/derived/{slug}/plan.jpg" alt="">'
    hv = project.get("hero_video")
    if not hv:
        return f'    <div class="hero-ghost" aria-hidden="true">{poster}</div>'
    end_attr = f' data-end="{hv["end"]}"' if hv.get("end") else ""
    return (
        f'    <div class="hero-ghost hero-ghost-video" aria-hidden="true" '
        f'data-hero-video="{hv["youtube_id"]}" data-start="{hv.get("start", 0)}"{end_attr}>\n'
        f'      {poster}\n'
        f'      <div class="hero-video-slot"></div>\n'
        f'    </div>'
    )


def build_location_section(project: dict) -> str:
    """Pin is optional (project["coords"] = {lat, lng}); without it the section
    is omitted rather than showing an empty map. Mirrored in
    api/_lib/render-project.js."""
    c = project.get("coords")
    if not c:
        return ""
    ll = f"{c['lat']},{c['lng']}"
    name = project["name"]
    return f"""
  <!-- ============ Find the site ============ -->
  <section class="section" aria-label="Location and directions">
    <div class="wrap">
      <div class="section-head split reveal">
        <div>
          <span class="eyebrow">Find the Site</span>
          <h2>Get there.</h2>
        </div>
        <span class="section-note">OPENS IN GOOGLE MAPS</span>
      </div>
      <div class="site-map reveal">
        <iframe src="https://maps.google.com/maps?q={ll}&amp;z=16&amp;t=h&amp;output=embed" title="Map showing {name}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
      </div>
      <div class="btn-row plan-actions reveal">
        <a class="btn btn-solid" href="https://www.google.com/maps/dir/?api=1&amp;destination={ll}" target="_blank" rel="noopener">Get Directions &#8594;</a>
        <a class="btn btn-outline" href="https://www.google.com/maps/search/?api=1&amp;query={ll}" target="_blank" rel="noopener">Open in Maps</a>
      </div>
    </div>
  </section>
"""


def build_status_chip(project: dict) -> str:
    if project.get("sold_out"):
        return '<span class="status-chip sold-out">Fully Booked</span>'
    return '<span class="status-chip">Open Plots Available</span>'


def build_brochure_cta(project: dict, where: str) -> str:
    """Brochure CTAs render only when the PDF actually exists.

    The download path is a fixed convention (assets/brochures/<slug>.pdf), so
    without this the button emits for projects that have no brochure and 404s.
    """
    if not project.get("brochure"):
        return ""
    href = f"../assets/brochures/{project['slug']}.pdf"
    label = "Download Brochure &#8595;"
    if where == "hero":
        return f'\n            <a class="btn btn-ghost" href="{href}" download>{label}</a>'
    return (
        f'\n      <div class="btn-row plan-actions reveal">'
        f'\n        <a class="btn btn-outline" href="{href}" download>{label}</a>'
        f'\n      </div>'
    )


def build_cta_note(project: dict) -> str:
    if "cta_note" in project:
        return project["cta_note"]
    return (
        f"Pricing for {project['name']} is shared directly by our team &mdash; "
        "talk to us for current availability, a site visit, or an accurate quote. "
        "Spot registration available."
    )


NUMBER_WORDS = [
    "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight",
    "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen",
    "Sixteen", "Seventeen", "Eighteen", "Nineteen", "Twenty",
]


def number_to_word(n: int) -> str:
    return NUMBER_WORDS[n] if 0 <= n < len(NUMBER_WORDS) else str(n)


def render(template: str, projects: list[dict], i: int) -> str:
    project = projects[i]
    prev_p = projects[(i - 1) % len(projects)]
    next_p = projects[(i + 1) % len(projects)]
    fills = {
        "slug": project["slug"],
        "name": project["name"],
        "tagline": project["tagline"],
        "location": project["location"],
        "about": project["about"],
        "index": f"{i + 1:02d}",
        "total": f"{len(projects):02d}",
        "total_word": number_to_word(len(projects)),
        "hero_ghost": build_hero_ghost(project),
        "status_chip": build_status_chip(project),
        "brochure_cta_hero": build_brochure_cta(project, "hero"),
        "brochure_cta_plan": build_brochure_cta(project, "plan"),
        "cta_note": build_cta_note(project),
        "approvals": build_approvals(project),
        "ledger_items": build_ledger(project["ledger"]),
        "spec_items": build_specs(project["specs"]),
        "amenity_items": build_amenities(project["amenities"]),
        "plan_src": project["plan"]["src"],
        "plan_label": project["plan"]["label"],
        "video_section": build_video_section(project),
        "docs_section": build_docs_section(project),
        "location_section": build_location_section(project),
        "prev_slug": prev_p["slug"],
        "prev_name": prev_p["name"],
        "next_slug": next_p["slug"],
        "next_name": next_p["name"],
    }
    out = template
    for key, value in fills.items():
        out = out.replace("{{" + key + "}}", value)
    return out


def main():
    projects = json.loads((ROOT / "data" / "projects.json").read_text(encoding="utf-8"))
    template = (ROOT / "scripts" / "templates" / "project_template.html").read_text(encoding="utf-8")
    out_dir = ROOT / "projects"
    out_dir.mkdir(exist_ok=True)

    for i, project in enumerate(projects):
        page = render(template, projects, i)
        assert "{{" not in page, f"Unfilled placeholder remains for {project['slug']}"
        out_path = out_dir / f"{project['slug']}.html"
        out_path.write_text(page, encoding="utf-8")
        print(f"Wrote {out_path.relative_to(ROOT)}")

    print(f"TOTAL: {len(projects)} project pages generated")


if __name__ == "__main__":
    main()

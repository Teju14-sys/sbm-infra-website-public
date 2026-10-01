"""Generates projects/<slug>.html for every entry in data/projects.json
from scripts/templates/project_template.html ("Land Registry" design).
Run: python scripts/build_project_pages.py"""
import html
import json
from pathlib import Path

ROOT = Path(__file__).parent.parent

BASE_URL = "https://sbm-infra-website.vercel.app"

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


def build_faq_items(project: dict) -> str:
    """Generate project-specific FAQ Q&A pairs as visible <details> elements.
    These match the FAQPage schema so Google sees matching visible content."""
    name = project["name"]
    location = project["location"]
    rera = clean_entities(project.get("rera", ""))
    lp_badge = clean_entities(project.get("lp_badge", ""))
    about = clean_entities(project["about"])
    sold_out = project.get("sold_out", False)

    faqs = [
        (
            f"What is {name} and where is it located?",
            f"{name} is a DTCP-approved residential open-plot layout by SBM Infra Projects, located at {location}. {about}",
        ),
        (
            f"What approvals does {name} have?",
            f"{name} is DTCP approved with 100% clear title. {'Layout permission: ' + lp_badge + '.' if lp_badge else ''}"
            + (f" RERA registration: {rera}." if rera else "")
            + " All reference numbers are shown as filed.",
        ),
    ]

    amenities = project.get("amenities", [])
    if amenities:
        amenity_text = ", ".join(clean_entities(a) for a in amenities[:6])
        faqs.append((
            f"What amenities are included in {name}?",
            f"{name} includes {amenity_text}, and more. All development is completed before plots are handed over.",
        ))

    coords = project.get("coords")
    if coords:
        faqs.append((
            f"How do I get directions to {name}?",
            f"You can get directions to {name} via Google Maps using the coordinates {coords['lat']},{coords['lng']}, or use the Get Directions button on this page.",
        ))

    if sold_out:
        faqs.append((
            f"Is {name} still available?",
            f"{name} is fully booked. Resale opportunities do come up from time to time through SBM's lifetime maintenance and resale service. Contact the team to register interest or ask about current resale listings.",
        ))
    else:
        faqs.append((
            f"How do I get pricing for {name}?",
            f"Pricing for {name} is shared directly by the SBM Infra team on request. Contact the team through the enquiry form or email info@sbminfraprojects.in for current availability and accurate quotes.",
        ))

    faqs.append((
        f"Can I arrange a site visit to {name}?",
        f"Yes. SBM Infra arranges site visits so you can see the roads, parks and compound wall already in place. Use the enquiry form on this page to schedule a visit.",
    ))

    items = []
    for q, a in faqs:
        items.append(
            f'        <details class="faq-item reveal">\n'
            f'          <summary>{q}</summary>\n'
            f'          <p>{a}</p>\n'
            f'        </details>'
        )
    return "\n".join(items)


def build_faq_schema(project: dict) -> str:
    """Generate FAQPage schema matching the visible FAQ items."""
    name = project["name"]
    location = project["location"]
    rera = clean_entities(project.get("rera", ""))
    lp_badge = clean_entities(project.get("lp_badge", ""))
    about = clean_entities(project["about"])
    sold_out = project.get("sold_out", False)

    qa_pairs = [
        (
            f"What is {name} and where is it located?",
            f"{name} is a DTCP-approved residential open-plot layout by SBM Infra Projects, located at {location}. {about}",
        ),
        (
            f"What approvals does {name} have?",
            f"{name} is DTCP approved with 100% clear title. "
            + (f"Layout permission: {lp_badge}." if lp_badge else "")
            + (f" RERA registration: {rera}." if rera else "")
            + " All reference numbers are shown as filed.",
        ),
    ]

    amenities = project.get("amenities", [])
    if amenities:
        amenity_text = ", ".join(clean_entities(a) for a in amenities[:6])
        qa_pairs.append((
            f"What amenities are included in {name}?",
            f"{name} includes {amenity_text}, and more. All development is completed before plots are handed over.",
        ))

    coords = project.get("coords")
    if coords:
        qa_pairs.append((
            f"How do I get directions to {name}?",
            f"You can get directions to {name} via Google Maps using the coordinates {coords['lat']},{coords['lng']}, or use the Get Directions button on this page.",
        ))

    if sold_out:
        qa_pairs.append((
            f"Is {name} still available?",
            f"{name} is fully booked. Resale opportunities do come up from time to time through SBM's lifetime maintenance and resale service. Contact the team to register interest or ask about current resale listings.",
        ))
    else:
        qa_pairs.append((
            f"How do I get pricing for {name}?",
            f"Pricing for {name} is shared directly by the SBM Infra team on request. Contact the team through the enquiry form or email info@sbminfraprojects.in for current availability and accurate quotes.",
        ))

    qa_pairs.append((
        f"Can I arrange a site visit to {name}?",
        f"Yes. SBM Infra arranges site visits so you can see the roads, parks and compound wall already in place. Use the enquiry form on this page to schedule a visit.",
    ))

    main_entity = [
        {
            "@type": "Question",
            "name": q,
            "acceptedAnswer": {"@type": "Answer", "text": a},
        }
        for q, a in qa_pairs
    ]

    obj = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": main_entity,
    }
    return f"""<script type="application/ld+json">
{json.dumps(obj, indent=2, ensure_ascii=False)}
</script>"""


NUMBER_WORDS = [
    "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight",
    "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen",
    "Sixteen", "Seventeen", "Eighteen", "Nineteen", "Twenty",
]


def number_to_word(n: int) -> str:
    return NUMBER_WORDS[n] if 0 <= n < len(NUMBER_WORDS) else str(n)


def clean_entities(s: str) -> str:
    """Convert HTML entities to plain Unicode for schema text."""
    return (
        s.replace("&amp;", "&")
        .replace("&middot;", "·")
        .replace("&ndash;", "–")
        .replace("&mdash;", "—")
        .replace("&times;", "×")
        .replace("&rsquo;", "\u2019")
        .replace("&ldquo;", "\u201c")
        .replace("&rdquo;", "\u201d")
        .replace("&nbsp;", " ")
        .replace("&ensp;", " ")
        .replace("&sup2;", "²")
        .replace("&deg;", "°")
    )


def build_breadcrumb_schema(project: dict) -> str:
    name = clean_entities(project["name"])
    slug = project["slug"]
    return f"""<script type="application/ld+json">
{{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {{"@type": "ListItem", "position": 1, "name": "Home", "item": "{BASE_URL}/"}},
    {{"@type": "ListItem", "position": 2, "name": "Projects", "item": "{BASE_URL}/projects.html"}},
    {{"@type": "ListItem", "position": 3, "name": "{name}", "item": "{BASE_URL}/projects/{slug}.html"}}
  ]
}}
</script>"""


def build_project_schema(project: dict) -> str:
    name = clean_entities(project["name"])
    tagline = clean_entities(project["tagline"])
    location = clean_entities(project["location"])
    slug = project["slug"]
    about = clean_entities(project["about"])
    rera = clean_entities(project.get("rera", ""))
    lp_badge = clean_entities(project.get("lp_badge", ""))

    obj = {
        "@context": "https://schema.org",
        "@type": "ResidentialProject",
        "name": name,
        "url": f"{BASE_URL}/projects/{slug}.html",
        "description": about,
        "image": f"{BASE_URL}/assets/images/derived/{slug}/card.jpg",
        "address": {
            "@type": "PostalAddress",
            "addressLocality": location,
            "addressRegion": "Telangana",
            "addressCountry": "IN",
        },
        "provider": {
            "@type": "Organization",
            "name": "SBM Infra India Pvt. Ltd.",
            "url": f"{BASE_URL}/",
        },
    }

    if rera:
        obj["identifier"] = rera
    if lp_badge:
        obj["additionalProperty"] = {
            "@type": "PropertyValue",
            "name": "Layout Permission",
            "value": lp_badge,
        }

    c = project.get("coords")
    if c:
        obj["geo"] = {
            "@type": "GeoCoordinates",
            "latitude": c["lat"],
            "longitude": c["lng"],
        }

    amenities = project.get("amenities", [])
    if amenities:
        obj["amenityFeature"] = [
            {"@type": "LocationFeatureSpecification", "name": clean_entities(a)}
            for a in amenities
        ]

    if project.get("sold_out"):
        obj["offers"] = {
            "@type": "Offer",
            "availability": "https://schema.org/OutOfStock",
            "priceCurrency": "INR",
            "seller": {"@type": "Organization", "name": "SBM Infra India Pvt. Ltd."},
        }
    else:
        obj["offers"] = {
            "@type": "Offer",
            "availability": "https://schema.org/InStock",
            "priceCurrency": "INR",
            "seller": {"@type": "Organization", "name": "SBM Infra India Pvt. Ltd."},
        }

    return f"""<script type="application/ld+json">
{json.dumps(obj, indent=2, ensure_ascii=False)}
</script>"""


def build_video_schema(project: dict) -> str:
    videos = project.get("videos", [])
    if not videos:
        return ""

    objects = []
    for v in videos:
        yt = v["youtube_id"]
        objects.append({
            "@context": "https://schema.org",
            "@type": "VideoObject",
            "name": clean_entities(v.get("label", "")),
            "description": clean_entities(v.get("caption", "")),
            "thumbnailUrl": f"https://img.youtube.com/vi/{yt}/hqdefault.jpg",
            "contentUrl": f"https://www.youtube.com/watch?v={yt}",
            "embedUrl": f"https://www.youtube.com/embed/{yt}",
            "uploadDate": "2024-01-01",
        })

    scripts = []
    for obj in objects:
        scripts.append(f"""<script type="application/ld+json">
{json.dumps(obj, indent=2, ensure_ascii=False)}
</script>""")

    return "\n".join(scripts)


def render(template: str, projects: list[dict], i: int) -> str:
    project = projects[i]
    prev_p = projects[(i - 1) % len(projects)]
    next_p = projects[(i + 1) % len(projects)]
    fills = {
        "slug": project["slug"],
        "name": project["name"],
        "name_upper": project["name"].upper(),
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
        "breadcrumb_schema": build_breadcrumb_schema(project),
        "project_schema": build_project_schema(project),
        "video_schema": build_video_schema(project),
        "faq_items": build_faq_items(project),
        "faq_schema": build_faq_schema(project),
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

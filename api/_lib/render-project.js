// JS port of scripts/build_project_pages.py's render logic, used by the
// admin panel to regenerate a single project page after a data change.
// Must stay byte-for-byte equivalent to the Python version — see
// scripts/verify_render_parity.py, which checks exactly that.

function approvalBadge(label, value) {
  return (
    '          <div class="approval-badge"><span class="badge-icon" aria-hidden="true">&#10003;</span>' +
    `<span class="badge-text"><strong>${label}</strong><span>${value}</span></span></div>`
  );
}

function buildApprovals(project) {
  const blocks = [];
  const parts = project.rera.split('&middot;').map((p) => p.trim());
  const approvals = parts.filter((p) => !p.includes('RERA'));
  const reras = parts.filter((p) => p.includes('RERA'));
  if (approvals.length) {
    blocks.push(approvalBadge('DTCP / Layout Permission', approvals.join(' &middot; ')));
  }
  if (reras.length) {
    blocks.push(approvalBadge('RERA Registration', reras.join(' &middot; ')));
  }
  if (project.final_lp_approved) {
    blocks.push(approvalBadge('Status', 'Final LP Approved &mdash; Ready to Build'));
  }
  return blocks.join('\n');
}

function buildLedger(items) {
  return items.map((item) => `        <span><b class="tick">+</b> ${item}</span>`).join('\n');
}

// Fact-table row labels that name a place/corridor rather than a project
// attribute — highlighted so proximity claims read as a callout, not just
// another row. Hand-authored per project, so this is a closed, checked list
// rather than a heuristic. Mirrored in scripts/build_project_pages.py.
export const LOCATION_SPEC_KEYS = new Set([
  'Location', 'Corridor', 'Corridors', 'Nearby', 'Adjacent', 'Between', 'Near', 'District', 'Frontage',
]);

function buildSpecs(specs) {
  return specs
    .map((s) => {
      const cls = LOCATION_SPEC_KEYS.has(s.k) ? ' class="loc-spec"' : '';
      return `          <div${cls}><dt>${s.k}</dt><dd>${s.v}</dd></div>`;
    })
    .join('\n');
}

function buildAmenities(amenities) {
  return amenities.map((item) => `        <li class="amenity reveal">${item}</li>`).join('\n');
}

// Fixed display order. Mirrored in scripts/build_project_pages.py.
export const VIDEO_CATEGORY_ORDER = [
  'Before Development',
  'Development',
  'After Development',
  'Launch Day',
  'Drone Footage',
];

/** Videos bucketed into VIDEO_CATEGORY_ORDER, with anything unrecognised last. */
function groupVideos(videos) {
  const groups = [];
  for (const name of VIDEO_CATEGORY_ORDER) {
    const inCategory = videos.filter((v) => v.category === name);
    if (inCategory.length) groups.push({ name, videos: inCategory });
  }
  const rest = videos.filter((v) => !VIDEO_CATEGORY_ORDER.includes(v.category));
  if (rest.length) groups.push({ name: 'More footage', videos: rest });
  return groups;
}

function buildVideoSection(project) {
  const videos = project.videos || [];
  if (!videos.length) return '';
  const card = (v) => {
    const yt = v.youtube_id;
    return `        <a class="video-card reveal" href="#" data-lightbox data-youtube="${yt}" data-caption="${v.caption}">
          <span class="video-thumb">
            <img src="https://img.youtube.com/vi/${yt}/hqdefault.jpg" alt="${v.caption}" loading="lazy">
            <span class="play-btn" aria-hidden="true">&#9658;</span>
          </span>
          <span class="video-cap"><span>${v.label}</span><span class="watch">Watch Video &#8594;</span></span>
        </a>`;
  };

  // Headings only earn their place once some category on this page holds
  // more than one video - otherwise every heading owns a single card and
  // the section reads thinner than a plain grid.
  const groups = groupVideos(videos);
  const joined = groups.some((g) => g.videos.length > 1)
    ? groups
        .map(
          (g) => `      <div class="video-group reveal">
        <h3 class="video-group-head">${g.name}</h3>
        <div class="video-grid stagger">
${g.videos.map(card).join('\n')}
        </div>
      </div>`
        )
        .join('\n')
    : `      <div class="video-grid stagger">
${videos.map(card).join('\n')}
      </div>`;

  return `
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
${joined}
    </div>
  </section>
`;
}

function stemOf(filename) {
  const decoded = filename.replace(/&amp;/g, '&');
  const base = decoded.split('/').pop();
  const dot = base.lastIndexOf('.');
  return dot === -1 ? base : base.slice(0, dot);
}

function buildDocsSection(project) {
  const slug = project.slug;
  const planSrc = project.plan.src;
  const docs = project.gallery.filter((g) => g.src !== planSrc);
  if (!docs.length) return '';
  const items = docs.map((g) => {
    const stem = stemOf(g.src);
    return `        <a class="doc-item reveal" href="../assets/images/projects/${slug}/${g.src}" data-lightbox data-caption="${project.name} &mdash; ${g.cap}">
          <span class="doc-media"><img src="../assets/images/derived/${slug}/thumb-${stem}.jpg" alt="${project.name} &mdash; ${g.cap}" loading="lazy"></span>
          <span class="doc-cap"><span>${g.cap}</span><span class="plus">+</span></span>
        </a>`;
  });
  const joined = items.join('\n');
  return `
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
${joined}
      </div>
    </div>
  </section>
`;
}

// Pin is optional (project.coords = {lat, lng}); without it the section is
// omitted rather than showing an empty map. Mirrored in
// scripts/build_project_pages.py.
function buildLocationSection(project) {
  const c = project.coords;
  if (!c) return '';
  const ll = `${c.lat},${c.lng}`;
  return `
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
        <iframe src="https://maps.google.com/maps?q=${ll}&amp;z=16&amp;t=h&amp;output=embed" title="Map showing ${project.name}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
      </div>
      <div class="btn-row plan-actions reveal">
        <a class="btn btn-solid" href="https://www.google.com/maps/dir/?api=1&amp;destination=${ll}" target="_blank" rel="noopener">Get Directions &#8594;</a>
        <a class="btn btn-outline" href="https://www.google.com/maps/search/?api=1&amp;query=${ll}" target="_blank" rel="noopener">Open in Maps</a>
      </div>
    </div>
  </section>
`;
}

function buildHeroGhost(project) {
  const slug = project.slug;
  const poster = `<img src="../assets/images/derived/${slug}/plan.jpg" alt="">`;
  const hv = project.hero_video;
  if (!hv) {
    return `    <div class="hero-ghost" aria-hidden="true">${poster}</div>`;
  }
  const endAttr = hv.end ? ` data-end="${hv.end}"` : '';
  return (
    `    <div class="hero-ghost hero-ghost-video" aria-hidden="true" ` +
    `data-hero-video="${hv.youtube_id}" data-start="${hv.start || 0}"${endAttr}>\n` +
    `      ${poster}\n` +
    `      <div class="hero-video-slot"></div>\n` +
    `    </div>`
  );
}

function buildStatusChip(project) {
  if (project.sold_out) return '<span class="status-chip sold-out">Fully Booked</span>';
  return '<span class="status-chip">Open Plots Available</span>';
}

// Brochure CTAs render only when the PDF actually exists. The download path is
// a fixed convention (assets/brochures/<slug>.pdf), so without this the button
// emits for projects that have no brochure and 404s.
function buildBrochureCta(project, where) {
  if (!project.brochure) return '';
  const href = `../assets/brochures/${project.slug}.pdf`;
  const label = 'Download Brochure &#8595;';
  if (where === 'hero') {
    return `\n            <a class="btn btn-ghost" href="${href}" download>${label}</a>`;
  }
  return (
    `\n      <div class="btn-row plan-actions reveal">` +
    `\n        <a class="btn btn-outline" href="${href}" download>${label}</a>` +
    `\n      </div>`
  );
}

function buildCtaNote(project) {
  if (project.cta_note) return project.cta_note;
  return (
    `Pricing for ${project.name} is shared directly by our team &mdash; ` +
    'talk to us for current availability, a site visit, or an accurate quote. ' +
    'Spot registration available.'
  );
}

const NUMBER_WORDS = [
  'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight',
  'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen',
  'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty',
];

export function numberToWord(n) {
  return n >= 0 && n < NUMBER_WORDS.length ? NUMBER_WORDS[n] : String(n);
}

const BASE_URL = 'https://sbm-infra-website.vercel.app';

function cleanEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&middot;/g, '\u00b7')
    .replace(/&ndash;/g, '\u2013')
    .replace(/&mdash;/g, '\u2014')
    .replace(/&times;/g, '\u00d7')
    .replace(/&rsquo;/g, '\u2019')
    .replace(/&ldquo;/g, '\u201c')
    .replace(/&rdquo;/g, '\u201d')
    .replace(/&nbsp;/g, ' ')
    .replace(/&ensp;/g, ' ')
    .replace(/&sup2;/g, '\u00b2')
    .replace(/&deg;/g, '\u00b0');
}

function buildBreadcrumbSchema(project) {
  const name = cleanEntities(project.name);
  const slug = project.slug;
  return `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {"@type": "ListItem", "position": 1, "name": "Home", "item": "${BASE_URL}/"},
    {"@type": "ListItem", "position": 2, "name": "Projects", "item": "${BASE_URL}/projects.html"},
    {"@type": "ListItem", "position": 3, "name": "${name}", "item": "${BASE_URL}/projects/${slug}.html"}
  ]
}
</script>`;
}

function buildProjectSchema(project) {
  const name = cleanEntities(project.name);
  const tagline = cleanEntities(project.tagline);
  const location = cleanEntities(project.location);
  const slug = project.slug;
  const about = cleanEntities(project.about);
  const rera = cleanEntities(project.rera || '');
  const lpBadge = cleanEntities(project.lp_badge || '');

  const obj = {
    '@context': 'https://schema.org',
    '@type': 'ResidentialProject',
    name,
    url: `${BASE_URL}/projects/${slug}.html`,
    description: about,
    image: `${BASE_URL}/assets/images/derived/${slug}/card.jpg`,
    address: {
      '@type': 'PostalAddress',
      addressLocality: location,
      addressRegion: 'Telangana',
      addressCountry: 'IN',
    },
    provider: {
      '@type': 'Organization',
      name: 'SBM Infra India Pvt. Ltd.',
      url: `${BASE_URL}/`,
    },
  };

  if (rera) obj.identifier = rera;
  if (lpBadge) {
    obj.additionalProperty = {
      '@type': 'PropertyValue',
      name: 'Layout Permission',
      value: lpBadge,
    };
  }

  const c = project.coords;
  if (c) {
    obj.geo = {
      '@type': 'GeoCoordinates',
      latitude: c.lat,
      longitude: c.lng,
    };
  }

  const amenities = project.amenities || [];
  if (amenities.length) {
    obj.amenityFeature = amenities.map((a) => ({
      '@type': 'LocationFeatureSpecification',
      name: cleanEntities(a),
    }));
  }

  const availability = project.sold_out
    ? 'https://schema.org/OutOfStock'
    : 'https://schema.org/InStock';
  obj.offers = {
    '@type': 'Offer',
    availability,
    priceCurrency: 'INR',
    seller: { '@type': 'Organization', name: 'SBM Infra India Pvt. Ltd.' },
  };

  return `<script type="application/ld+json">
${JSON.stringify(obj, null, 2)}
</script>`;
}

function buildVideoSchema(project) {
  const videos = project.videos || [];
  if (!videos.length) return '';

  const scripts = videos.map((v) => {
    const yt = v.youtube_id;
    const obj = {
      '@context': 'https://schema.org',
      '@type': 'VideoObject',
      name: cleanEntities(v.label || ''),
      description: cleanEntity(v.caption || ''),
      thumbnailUrl: `https://img.youtube.com/vi/${yt}/hqdefault.jpg`,
      contentUrl: `https://www.youtube.com/watch?v=${yt}`,
      embedUrl: `https://www.youtube.com/embed/${yt}`,
      uploadDate: '2024-01-01',
    };
    return `<script type="application/ld+json">
${JSON.stringify(obj, null, 2)}
</script>`;
  });

  return scripts.join('\n');
}

function buildFaqItems(project) {
  const name = project.name;
  const location = project.location;
  const rera = cleanEntities(project.rera || '');
  const lpBadge = cleanEntities(project.lp_badge || '');
  const about = cleanEntities(project.about);
  const soldOut = project.sold_out || false;

  const faqs = [
    [
      `What is ${name} and where is it located?`,
      `${name} is a DTCP-approved residential open-plot layout by SBM Infra Projects, located at ${location}. ${about}`,
    ],
    [
      `What approvals does ${name} have?`,
      `${name} is DTCP approved with 100% clear title. ${lpBadge ? 'Layout permission: ' + lpBadge + '.' : ''}${rera ? ' RERA registration: ' + rera + '.' : ''} All reference numbers are shown as filed.`,
    ],
  ];

  const amenities = project.amenities || [];
  if (amenities.length) {
    const amenityText = amenities.slice(0, 6).map((a) => cleanEntities(a)).join(', ');
    faqs.push([
      `What amenities are included in ${name}?`,
      `${name} includes ${amenityText}, and more. All development is completed before plots are handed over.`,
    ]);
  }

  const coords = project.coords;
  if (coords) {
    faqs.push([
      `How do I get directions to ${name}?`,
      `You can get directions to ${name} via Google Maps using the coordinates ${coords.lat},${coords.lng}, or use the Get Directions button on this page.`,
    ]);
  }

  if (soldOut) {
    faqs.push([
      `Is ${name} still available?`,
      `${name} is fully booked. Resale opportunities do come up from time to time through SBM's lifetime maintenance and resale service. Contact the team to register interest or ask about current resale listings.`,
    ]);
  } else {
    faqs.push([
      `How do I get pricing for ${name}?`,
      `Pricing for ${name} is shared directly by the SBM Infra team on request. Contact the team through the enquiry form or email info@sbminfraprojects.in for current availability and accurate quotes.`,
    ]);
  }

  faqs.push([
    `Can I arrange a site visit to ${name}?`,
    `Yes. SBM Infra arranges site visits so you can see the roads, parks and compound wall already in place. Use the enquiry form on this page to schedule a visit.`,
  ]);

  return faqs.map(([q, a]) =>
    `        <details class="faq-item reveal">\n          <summary>${q}</summary>\n          <p>${a}</p>\n        </details>`
  ).join('\n');
}

function buildFaqSchema(project) {
  const name = project.name;
  const location = project.location;
  const rera = cleanEntities(project.rera || '');
  const lpBadge = cleanEntities(project.lp_badge || '');
  const about = cleanEntities(project.about);
  const soldOut = project.sold_out || false;

  const qaPairs = [
    [
      `What is ${name} and where is it located?`,
      `${name} is a DTCP-approved residential open-plot layout by SBM Infra Projects, located at ${location}. ${about}`,
    ],
    [
      `What approvals does ${name} have?`,
      `${name} is DTCP approved with 100% clear title. ${lpBadge ? 'Layout permission: ' + lpBadge + '.' : ''}${rera ? ' RERA registration: ' + rera + '.' : ''} All reference numbers are shown as filed.`,
    ],
  ];

  const amenities = project.amenities || [];
  if (amenities.length) {
    const amenityText = amenities.slice(0, 6).map((a) => cleanEntities(a)).join(', ');
    qaPairs.push([
      `What amenities are included in ${name}?`,
      `${name} includes ${amenityText}, and more. All development is completed before plots are handed over.`,
    ]);
  }

  const coords = project.coords;
  if (coords) {
    qaPairs.push([
      `How do I get directions to ${name}?`,
      `You can get directions to ${name} via Google Maps using the coordinates ${coords.lat},${coords.lng}, or use the Get Directions button on this page.`,
    ]);
  }

  if (soldOut) {
    qaPairs.push([
      `Is ${name} still available?`,
      `${name} is fully booked. Resale opportunities do come up from time to time through SBM's lifetime maintenance and resale service. Contact the team to register interest or ask about current resale listings.`,
    ]);
  } else {
    qaPairs.push([
      `How do I get pricing for ${name}?`,
      `Pricing for ${name} is shared directly by the SBM Infra team on request. Contact the team through the enquiry form or email info@sbminfraprojects.in for current availability and accurate quotes.`,
    ]);
  }

  qaPairs.push([
    `Can I arrange a site visit to ${name}?`,
    `Yes. SBM Infra arranges site visits so you can see the roads, parks and compound wall already in place. Use the enquiry form on this page to schedule a visit.`,
  ]);

  const mainEntity = qaPairs.map(([q, a]) => ({
    '@type': 'Question',
    name: q,
    acceptedAnswer: { '@type': 'Answer', text: a },
  }));

  const obj = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity,
  };
  return `<script type="application/ld+json">
${JSON.stringify(obj, null, 2)}
</script>`;
}

/** Render project `projects[i]` given the full projects array and template string. */
export function render(rawTemplate, projects, i) {
  // Python's Path.read_text()/write_text() do universal-newline translation
  // (any \r\n -> \n on read); this file may be read raw (CRLF on a Windows
  // checkout, LF as actually stored in the git blob) so normalize the same
  // way here to stay byte-identical with the Python renderer.
  const template = rawTemplate.replace(/\r\n/g, '\n');
  const project = projects[i];
  const prevP = projects[(i - 1 + projects.length) % projects.length];
  const nextP = projects[(i + 1) % projects.length];

  const fills = {
    slug: project.slug,
    name: project.name,
    name_upper: project.name.toUpperCase(),
    tagline: project.tagline,
    location: project.location,
    about: project.about,
    index: String(i + 1).padStart(2, '0'),
    total: String(projects.length).padStart(2, '0'),
    total_word: numberToWord(projects.length),
    hero_ghost: buildHeroGhost(project),
    status_chip: buildStatusChip(project),
    brochure_cta_hero: buildBrochureCta(project, 'hero'),
    brochure_cta_plan: buildBrochureCta(project, 'plan'),
    cta_note: buildCtaNote(project),
    approvals: buildApprovals(project),
    ledger_items: buildLedger(project.ledger),
    spec_items: buildSpecs(project.specs),
    amenity_items: buildAmenities(project.amenities),
    plan_src: project.plan.src,
    plan_label: project.plan.label,
    video_section: buildVideoSection(project),
    docs_section: buildDocsSection(project),
    location_section: buildLocationSection(project),
    prev_slug: prevP.slug,
    prev_name: prevP.name,
    next_slug: nextP.slug,
    next_name: nextP.name,
    breadcrumb_schema: buildBreadcrumbSchema(project),
    project_schema: buildProjectSchema(project),
    video_schema: buildVideoSchema(project),
    faq_items: buildFaqItems(project),
    faq_schema: buildFaqSchema(project),
  };

  let out = template;
  for (const [key, value] of Object.entries(fills)) {
    out = out.split(`{{${key}}}`).join(value);
  }
  return out;
}

/** Render project `slug` and return the page HTML, throwing if unfilled placeholders remain. */
export function renderSlug(template, projects, slug) {
  const i = projects.findIndex((p) => p.slug === slug);
  if (i === -1) throw new Error(`Unknown project slug: ${slug}`);
  const page = render(template, projects, i);
  if (page.includes('{{')) {
    throw new Error(`Unfilled placeholder remains for ${slug}`);
  }
  return page;
}

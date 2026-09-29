// JS port of scripts/build_listing_pages.py's marker-based regeneration of
// projects.html, index.html and contact.html's project-listing regions.
// Must stay byte-for-byte equivalent to the Python version — see
// scripts/verify_render_parity.py, which checks exactly that.

import { numberToWord } from './render-project.js';

function fill(template, fills) {
  let out = template;
  for (const [key, value] of Object.entries(fills)) {
    out = out.split(`{{${key}}}`).join(value);
  }
  return out;
}

function buildFolioCard(cardTemplate, project, index, total) {
  const soldOutTag = project.sold_out
    ? '            <span class="folio-tag sold-out">Fully Booked</span>\n'
    : '';
  const fills = {
    slug: project.slug,
    card_alt: project.card_alt || `${project.name} master layout plan`,
    index: String(index).padStart(2, '0'),
    total: String(total).padStart(2, '0'),
    sold_out_tag: soldOutTag,
    name: project.name,
    location: project.location,
    card_tagline: project.card_tagline || project.tagline,
    facts: project.facts.join('<br>'),
    lp_badge: project.lp_badge,
  };
  return fill(normalize(cardTemplate), fills).replace(/\n+$/, '');
}

function buildRegistryRow(rowTemplate, project) {
  const fills = {
    slug: project.slug,
    name: project.name,
    location: project.location,
    facts: project.facts.join('<br>'),
    lp_badge: project.lp_badge,
  };
  return fill(normalize(rowTemplate), fills).replace(/\n+$/, '');
}

function buildProjectOption(project) {
  return `              <option value="${project.name}">${project.name}</option>`;
}

function replaceBlockMarker(content, name, inner) {
  const pattern = new RegExp(`(<!--${name}:START-->\\n)([\\s\\S]*?)(\\n<!--${name}:END-->)`);
  const match = content.match(pattern);
  if (!match) throw new Error(`Expected exactly one ${name} block, found none`);
  return content.replace(pattern, `$1${inner}$3`);
}

function replaceAutogen(content, name, value) {
  const pattern = new RegExp(`<!--AUTOGEN:${name}-->[\\s\\S]*?<!--/AUTOGEN-->`, 'g');
  if (!pattern.test(content)) throw new Error(`Expected at least one AUTOGEN:${name} marker, found 0`);
  return content.replace(pattern, `<!--AUTOGEN:${name}-->${value}<!--/AUTOGEN-->`);
}

function normalize(raw) {
  return raw.replace(/\r\n/g, '\n');
}

export function buildProjectsHtml(rawContent, projects, cardTemplate) {
  let content = normalize(rawContent);
  const total = projects.length;
  content = replaceAutogen(content, 'total_word', numberToWord(total));
  content = replaceAutogen(content, 'total_word_lower', numberToWord(total).toLowerCase());
  content = replaceAutogen(content, 'total_padded', String(total).padStart(2, '0'));
  const cards = projects.map((p, i) => buildFolioCard(cardTemplate, p, i + 1, total));
  content = replaceBlockMarker(content, 'FOLIO_CARDS', cards.join('\n\n'));
  return content;
}

export function buildIndexHtml(rawContent, projects, rowTemplate) {
  let content = normalize(rawContent);
  const total = projects.length;
  content = replaceAutogen(content, 'total_word', numberToWord(total));
  const rows = projects.map((p) => buildRegistryRow(rowTemplate, p));
  content = replaceBlockMarker(content, 'REGISTRY_ROWS', rows.join('\n'));
  return content;
}

export function buildContactHtml(rawContent, projects) {
  let content = normalize(rawContent);
  const options = projects.map((p) => buildProjectOption(p));
  content = replaceBlockMarker(content, 'PROJECT_OPTIONS', options.join('\n'));
  return content;
}

export function buildAboutHtml(rawContent, projects) {
  let content = normalize(rawContent);
  const total = projects.length;
  content = replaceAutogen(content, 'total_word', numberToWord(total));
  content = replaceAutogen(content, 'total_word_lower', numberToWord(total).toLowerCase());
  return content;
}

const SITE_ORIGIN = 'https://sbm-infra-website.vercel.app';

// Fixed real-content pages. Deliberately excludes get-app.html (a device-detection
// redirect utility) and index-alt*.html (redirect stubs to index.html) — neither
// is a page worth Google indexing on its own.
const SITEMAP_FIXED_PATHS = ['', 'about.html', 'projects.html', 'contact.html', 'news.html', 'map.html'];

// Regenerated from data/projects.json on every build so a project created via
// the admin panel is never missing from the sitemap again.
export function buildSitemap(projects) {
  const paths = [...SITEMAP_FIXED_PATHS, ...projects.map((p) => `projects/${p.slug}.html`)];
  const urls = paths.map((path) => `  <url><loc>${SITE_ORIGIN}/${path}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

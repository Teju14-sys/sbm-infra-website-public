// Step A of "create a new project from the browser": collects the text
// content plus three required images (logo, card/hero, master layout plan)
// and lands everything in ONE atomic GitHub commit — the new project's own
// page, every existing project page (their "X / N" denominator changes),
// projects.html, index.html, contact.html, and the processed images.
// Step B (gallery images + brochure PDF) is a separate, smaller endpoint
// added later, since those files can push a single request over Vercel's
// fixed 4.5MB body limit if bundled in here too.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { commitFiles, getFile } from '../_lib/github.js';
import { render } from '../_lib/render-project.js';
import { buildProjectsHtml, buildIndexHtml, buildContactHtml, buildAboutHtml, buildSitemap } from '../_lib/render-listings.js';
import { processCard, processPlan, processLogo } from '../_lib/image-processing.js';
import { extractYouTubeId } from '../_lib/youtube.js';

const PROJECT_TEMPLATE_PATH = path.join(process.cwd(), 'scripts', 'templates', 'project_template.html');
const CARD_TEMPLATE_PATH = path.join(process.cwd(), 'scripts', 'templates', 'folio_card_template.html');
const ROW_TEMPLATE_PATH = path.join(process.cwd(), 'scripts', 'templates', 'registry_row_template.html');

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.httpStatus = status;
  }
}
const badRequest = (message) => new HttpError(400, message);

function slugify(input) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function sanitizeFilename(name, fallback) {
  const base = (name || '').split(/[\\/]/).pop();
  const cleaned = (base || '').replace(/[^a-zA-Z0-9._-]/g, '-');
  return cleaned || fallback;
}

function requireString(body, field) {
  const value = body[field];
  if (typeof value !== 'string' || !value.trim()) throw badRequest(`"${field}" is required`);
  return value.trim();
}

function requireArray(body, field) {
  const value = body[field];
  if (!Array.isArray(value) || value.length === 0) {
    throw badRequest(`"${field}" must be a non-empty array`);
  }
  return value;
}

function requireSpecs(body) {
  const specs = requireArray(body, 'specs');
  for (const s of specs) {
    if (!s || typeof s.k !== 'string' || typeof s.v !== 'string' || !s.k.trim() || !s.v.trim()) {
      throw badRequest('Each item in "specs" needs a non-empty k and v');
    }
  }
  return specs;
}

function requireFile(body, field) {
  const file = body?.files?.[field];
  if (!file || typeof file.content !== 'string' || !file.content) {
    throw badRequest(`"files.${field}" is required`);
  }
  return file;
}

function optionalString(body, field) {
  const value = body[field];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parseHeroVideo(body) {
  const hv = body.hero_video;
  if (!hv || (!hv.youtube_id && !hv.url)) return undefined;
  const parsed = extractYouTubeId(hv.youtube_id || hv.url);
  if (!parsed.ok) throw badRequest(`hero_video: ${parsed.error}`);
  const result = { youtube_id: parsed.id };
  if (hv.start) result.start = Number(hv.start) || 0;
  if (hv.end) result.end = Number(hv.end) || undefined;
  return result;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};

  try {
    const name = requireString(body, 'name');
    const tagline = requireString(body, 'tagline');
    const location = requireString(body, 'location');
    const about = requireString(body, 'about');
    const rera = requireString(body, 'rera');
    const lp_badge = requireString(body, 'lp_badge');
    const amenities = requireArray(body, 'amenities');
    const specs = requireSpecs(body);
    const ledger = requireArray(body, 'ledger');
    const facts = requireArray(body, 'facts');
    const card_alt = optionalString(body, 'card_alt');
    const card_tagline = optionalString(body, 'card_tagline');
    const summary = optionalString(body, 'summary');
    const cta_note = optionalString(body, 'cta_note');
    const sold_out = Boolean(body.sold_out);
    const hero_video = parseHeroVideo(body);
    const cardAnchor = body.card_anchor === 'top' ? 'top' : undefined;

    const slug = slugify(optionalString(body, 'slug') || name);
    if (!SLUG_RE.test(slug)) throw badRequest(`Invalid slug derived from name: "${slug}"`);

    const logoFile = requireFile(body, 'logo');
    const cardFile = requireFile(body, 'card');
    const planFile = requireFile(body, 'plan');
    const cardFilename = sanitizeFilename(cardFile.filename, 'card-original.jpg');
    const planFilename = sanitizeFilename(planFile.filename, 'plan-original.jpg');

    const logoBuf = Buffer.from(logoFile.content, 'base64');
    const cardBuf = Buffer.from(cardFile.content, 'base64');
    const planBuf = Buffer.from(planFile.content, 'base64');

    const [processedLogo, processedCard, processedPlan] = await Promise.all([
      processLogo(logoBuf),
      processCard(cardBuf, cardAnchor),
      processPlan(planBuf),
    ]);

    const [projectTemplate, cardTemplate, rowTemplate] = await Promise.all([
      readFile(PROJECT_TEMPLATE_PATH, 'utf-8'),
      readFile(CARD_TEMPLATE_PATH, 'utf-8'),
      readFile(ROW_TEMPLATE_PATH, 'utf-8'),
    ]);

    const newProject = {
      slug,
      name,
      tagline,
      location,
      ...(summary ? { summary } : {}),
      about,
      amenities,
      rera,
      lp_badge,
      ...(card_alt ? { card_alt } : {}),
      ...(card_tagline ? { card_tagline } : {}),
      facts,
      ledger,
      specs,
      card: cardFilename,
      ...(cardAnchor ? { card_anchor: cardAnchor } : {}),
      plan: { src: planFilename, label: 'Master layout plan &mdash; as filed' },
      gallery: [{ src: planFilename, cap: 'Master layout plan' }],
      ...(sold_out ? { sold_out: true } : {}),
      ...(cta_note ? { cta_note } : {}),
      ...(hero_video ? { hero_video } : {}),
    };

    const commitResult = await commitFiles(async () => {
      const { content: projectsJsonRaw } = await getFile('data/projects.json');
      const projects = JSON.parse(projectsJsonRaw);

      if (projects.some((p) => p.slug === slug)) {
        throw new HttpError(409, `A project with slug "${slug}" already exists.`);
      }

      projects.push(newProject);

      const [
        { content: projectsHtmlRaw },
        { content: indexHtmlRaw },
        { content: contactHtmlRaw },
        { content: aboutHtmlRaw },
      ] = await Promise.all([
        getFile('projects.html'),
        getFile('index.html'),
        getFile('contact.html'),
        getFile('about.html'),
      ]);

      const files = [
        { path: 'data/projects.json', content: JSON.stringify(projects, null, 2) + '\n' },
        { path: 'projects.html', content: buildProjectsHtml(projectsHtmlRaw, projects, cardTemplate) },
        { path: 'index.html', content: buildIndexHtml(indexHtmlRaw, projects, rowTemplate) },
        { path: 'contact.html', content: buildContactHtml(contactHtmlRaw, projects) },
        { path: 'about.html', content: buildAboutHtml(aboutHtmlRaw, projects) },
        { path: 'sitemap.xml', content: buildSitemap(projects) },
        {
          path: `assets/images/projects/${slug}/img-0-logo.jpeg`,
          content: processedLogo.toString('base64'),
          encoding: 'base64',
        },
        {
          path: `assets/images/projects/${slug}/${cardFilename}`,
          content: cardBuf.toString('base64'),
          encoding: 'base64',
        },
        {
          path: `assets/images/derived/${slug}/card.jpg`,
          content: processedCard.toString('base64'),
          encoding: 'base64',
        },
        {
          path: `assets/images/derived/${slug}/plan.jpg`,
          content: processedPlan.toString('base64'),
          encoding: 'base64',
        },
      ];

      if (planFilename !== cardFilename) {
        files.push({
          path: `assets/images/projects/${slug}/${planFilename}`,
          content: planBuf.toString('base64'),
          encoding: 'base64',
        });
      }

      for (let i = 0; i < projects.length; i++) {
        const html = render(projectTemplate, projects, i);
        if (html.includes('{{')) {
          throw new Error(`Unfilled placeholder remains for ${projects[i].slug}`);
        }
        files.push({ path: `projects/${projects[i].slug}.html`, content: html });
      }

      return files;
    }, `Admin: create project "${name}" (${slug})`);

    return res.status(200).json({ ok: true, slug, commit: commitResult.commitSha, url: `/projects/${slug}.html` });
  } catch (err) {
    const status = err.httpStatus || 502;
    console.error('POST /api/admin/create-project failed:', err);
    return res.status(status).json({ error: err.message || 'Failed to create project' });
  }
}

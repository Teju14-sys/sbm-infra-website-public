// Edit an EXISTING project's text fields, logo/card/plan images, and hero
// video — the counterpart to create-project.js, which only ever handles
// brand-new slugs. Every field is optional here: only what's present in
// the request gets changed, everything else on the project is left
// untouched (so a legacy field like `badges` or `summary` that isn't part
// of this form survives an edit unharmed).
//
// Unlike create-project.js, this never changes how many projects exist or
// their order, so it never needs to touch every other project's page (the
// "X / N" survey record numbering only shifts on add/remove). What it DOES
// need to get right is the three project-level listing pages
// (projects.html/index.html/contact.html), since some of the editable
// fields (name is NOT editable here, but location/facts/lp_badge/tagline
// etc. are) are embedded in those pages too — see render-listings.js.
//
// Rather than hand-maintain a "which field affects which listing page"
// map (fragile — easy to miss a case), this renders every candidate page
// unconditionally and only commits the ones whose content actually
// changed from what's currently in the repo. That's simpler to get right
// than field-by-field reasoning, and cheaper than always recommitting
// everything regardless of whether anything changed.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { commitFiles, getFile } from '../_lib/github.js';
import { render } from '../_lib/render-project.js';
import { buildProjectsHtml, buildIndexHtml, buildContactHtml } from '../_lib/render-listings.js';
import { processCard, processPlan, processLogo } from '../_lib/image-processing.js';
import { extractYouTubeId } from '../_lib/youtube.js';

const PROJECT_TEMPLATE_PATH = path.join(process.cwd(), 'scripts', 'templates', 'project_template.html');
const CARD_TEMPLATE_PATH = path.join(process.cwd(), 'scripts', 'templates', 'folio_card_template.html');
const ROW_TEMPLATE_PATH = path.join(process.cwd(), 'scripts', 'templates', 'registry_row_template.html');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.httpStatus = status;
  }
}
const badRequest = (message) => new HttpError(400, message);

// Thrown (never caught by commitFiles' conflict-retry logic, since it's not
// a 409/422) when a save request resolves to zero actual file changes -
// e.g. re-submitting the form with nothing edited. Lets us skip creating a
// pointless empty commit while still reusing commitFiles' single code path.
class NoChangesError extends Error {}

function optionalString(body, field) {
  const value = body[field];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function optionalArray(body, field) {
  const value = body[field];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0) {
    throw badRequest(`"${field}" must be a non-empty array`);
  }
  return value;
}

function optionalSpecs(body) {
  const specs = optionalArray(body, 'specs');
  if (specs === undefined) return undefined;
  for (const s of specs) {
    if (!s || typeof s.k !== 'string' || typeof s.v !== 'string' || !s.k.trim() || !s.v.trim()) {
      throw badRequest('Each item in "specs" needs a non-empty k and v');
    }
  }
  return specs;
}

// hero_video: absent = leave as-is, null = clear it, object = set/replace it.
function parseHeroVideo(body) {
  if (!('hero_video' in body)) return { touched: false };
  const hv = body.hero_video;
  if (!hv) return { touched: true, value: undefined };
  if (!hv.youtube_id && !hv.url) throw badRequest('hero_video needs a youtube_id or url');
  const parsed = extractYouTubeId(hv.youtube_id || hv.url);
  if (!parsed.ok) throw badRequest(`hero_video: ${parsed.error}`);
  const value = { youtube_id: parsed.id };
  if (hv.start) value.start = Number(hv.start) || 0;
  if (hv.end) value.end = Number(hv.end) || undefined;
  return { touched: true, value };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};

  try {
    const slug = optionalString(body, 'slug');
    if (!slug) throw badRequest('"slug" is required');

    // Everything below is a patch: undefined means "don't touch this field."
    const patch = {
      tagline: optionalString(body, 'tagline'),
      location: optionalString(body, 'location'),
      about: optionalString(body, 'about'),
      rera: optionalString(body, 'rera'),
      lp_badge: optionalString(body, 'lp_badge'),
      amenities: optionalArray(body, 'amenities'),
      specs: optionalSpecs(body),
      ledger: optionalArray(body, 'ledger'),
      facts: optionalArray(body, 'facts'),
    };
    const soldOutTouched = 'sold_out' in body;
    const soldOutValue = Boolean(body.sold_out);
    const cardAnchor = body.card_anchor === 'top' || body.card_anchor === 'center' ? body.card_anchor : undefined;
    const heroVideo = parseHeroVideo(body);

    const logoFile = body?.files?.logo;
    const cardFile = body?.files?.card;
    const planFile = body?.files?.plan;
    const logoBuf = logoFile?.content ? Buffer.from(logoFile.content, 'base64') : undefined;
    const cardBuf = cardFile?.content ? Buffer.from(cardFile.content, 'base64') : undefined;
    const planBuf = planFile?.content ? Buffer.from(planFile.content, 'base64') : undefined;

    const [processedLogo, processedCard, processedPlan] = await Promise.all([
      logoBuf ? processLogo(logoBuf) : undefined,
      cardBuf ? processCard(cardBuf, cardAnchor) : undefined,
      planBuf ? processPlan(planBuf) : undefined,
    ]);

    const [projectTemplate, cardTemplate, rowTemplate] = await Promise.all([
      readFile(PROJECT_TEMPLATE_PATH, 'utf-8'),
      readFile(CARD_TEMPLATE_PATH, 'utf-8'),
      readFile(ROW_TEMPLATE_PATH, 'utf-8'),
    ]);

    let resultProject;

    const commitResult = await commitFiles(async () => {
      const [
        { content: projectsJsonRaw },
        { content: projectsHtmlRaw },
        { content: indexHtmlRaw },
        { content: contactHtmlRaw },
      ] = await Promise.all([
        getFile('data/projects.json'),
        getFile('projects.html'),
        getFile('index.html'),
        getFile('contact.html'),
      ]);
      const projects = JSON.parse(projectsJsonRaw);
      const idx = projects.findIndex((p) => p.slug === slug);
      if (idx === -1) {
        throw new HttpError(404, `Unknown project slug: ${slug}`);
      }

      const project = projects[idx];
      for (const [key, value] of Object.entries(patch)) {
        if (value !== undefined) project[key] = value;
      }
      if (soldOutTouched) {
        if (soldOutValue) project.sold_out = true;
        else delete project.sold_out;
      }
      if (cardAnchor === 'top') project.card_anchor = 'top';
      else if (cardAnchor === 'center') delete project.card_anchor;
      if (heroVideo.touched) {
        if (heroVideo.value) project.hero_video = heroVideo.value;
        else delete project.hero_video;
      }

      const files = [];

      // Images: fixed derived paths always get overwritten wholesale. Raw
      // originals are overwritten IN PLACE at whatever filename is already
      // on record (project.card / project.plan.src) rather than renamed —
      // renaming plan's raw file would silently orphan the auto-created
      // "Master layout plan" gallery entry that points at that exact
      // filename (see buildDocsSection in render-project.js, which matches
      // gallery entries against plan.src to keep the plan image out of the
      // separate documents grid).
      if (processedLogo) {
        files.push({
          path: `assets/images/projects/${slug}/img-0-logo.jpeg`,
          content: processedLogo.toString('base64'),
          encoding: 'base64',
        });
      }
      if (processedCard) {
        files.push(
          {
            path: `assets/images/derived/${slug}/card.jpg`,
            content: processedCard.toString('base64'),
            encoding: 'base64',
          },
          {
            path: `assets/images/projects/${slug}/${project.card || 'card-original.jpg'}`,
            content: cardBuf.toString('base64'),
            encoding: 'base64',
          }
        );
        if (!project.card) project.card = 'card-original.jpg';
      }
      if (processedPlan) {
        files.push(
          {
            path: `assets/images/derived/${slug}/plan.jpg`,
            content: processedPlan.toString('base64'),
            encoding: 'base64',
          },
          {
            path: `assets/images/projects/${slug}/${project.plan.src}`,
            content: planBuf.toString('base64'),
            encoding: 'base64',
          }
        );
      }

      // Text/JSON: only commit if something actually changed.
      const newProjectsJson = JSON.stringify(projects, null, 2) + '\n';
      if (newProjectsJson !== projectsJsonRaw) {
        files.push({ path: 'data/projects.json', content: newProjectsJson });
      }

      // This project's own page: only commit if its rendered output
      // actually differs (a pure image-only edit re-uses the same fixed
      // paths and filenames, so the HTML is byte-identical either way).
      const newOwnPage = render(projectTemplate, projects, idx);
      if (newOwnPage.includes('{{')) {
        throw new Error(`Unfilled placeholder remains for ${slug} after render`);
      }
      const { content: currentOwnPage } = await getFile(`projects/${slug}.html`);
      if (newOwnPage !== currentOwnPage) {
        files.push({ path: `projects/${slug}.html`, content: newOwnPage });
      }

      // Listing pages: same "only if changed" rule.
      const newProjectsHtml = buildProjectsHtml(projectsHtmlRaw, projects, cardTemplate);
      if (newProjectsHtml !== projectsHtmlRaw) {
        files.push({ path: 'projects.html', content: newProjectsHtml });
      }
      const newIndexHtml = buildIndexHtml(indexHtmlRaw, projects, rowTemplate);
      if (newIndexHtml !== indexHtmlRaw) {
        files.push({ path: 'index.html', content: newIndexHtml });
      }
      const newContactHtml = buildContactHtml(contactHtmlRaw, projects);
      if (newContactHtml !== contactHtmlRaw) {
        files.push({ path: 'contact.html', content: newContactHtml });
      }

      resultProject = project;
      if (files.length === 0) throw new NoChangesError('Nothing to save - no fields changed.');
      return files;
    }, `Admin: edit project details for ${slug}`);

    return res.status(200).json({ ok: true, project: resultProject, commit: commitResult.commitSha });
  } catch (err) {
    if (err instanceof NoChangesError) {
      return res.status(200).json({ ok: true, unchanged: true });
    }
    const status = err.httpStatus || 502;
    console.error('POST /api/admin/update-project failed:', err);
    return res.status(status).json({ error: err.message || 'Failed to update project' });
  }
}

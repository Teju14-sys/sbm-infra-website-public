// Reads a brochure PDF (already rendered to compressed page images client-side,
// see resizeCanvasToBase64 in assets/js/admin.js) and asks Claude to extract the
// "+ New Project" form fields from it, so the admin can review/edit pre-filled
// values instead of retyping everything from the brochure by hand. Stateless -
// no GitHub commit here, just a vision call that returns structured JSON.
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-opus-5';
const MAX_PAGES = 20;

const FIELD_NAMES = ['name', 'tagline', 'location', 'about', 'rera', 'lp_badge', 'amenities', 'specs', 'ledger', 'facts'];

const EXTRACT_TOOL = {
  name: 'extract_project_fields',
  description: 'Structured fields extracted from a real-estate open-plot brochure, matching this site\'s project data schema.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Project name as printed on the brochure, e.g. "Sharanam Valley".' },
      tagline: { type: 'string', description: 'The project\'s marketing tagline/slogan.' },
      location: { type: 'string', description: 'Location line, e.g. "Jaya Prakash Nagar, Kalwakurthy".' },
      about: {
        type: 'string',
        description: 'A 2-4 sentence paragraph describing the layout (extent, plot count/sizes, open space, roads, standout features) in the site\'s own prose style, not copied brochure marketing copy verbatim.',
      },
      rera: { type: 'string', description: 'RERA/DTCP/LP approval text exactly as filed, e.g. "LP No. 379/2021/H". If multiple numbers apply, join them.' },
      lp_badge: { type: 'string', description: 'A short badge version of the approval number for listing cards, e.g. "LP 379/2021/H".' },
      amenities: {
        type: 'array',
        items: { type: 'string' },
        description: 'Short amenity names as a flat list, e.g. "Grand Entrance Arches", "Avenue Plantation", "Compound Wall".',
      },
      specs: {
        type: 'array',
        items: {
          type: 'object',
          properties: { k: { type: 'string' }, v: { type: 'string' } },
          required: ['k', 'v'],
          additionalProperties: false,
        },
        description: 'The facts-table rows shown on the project page, e.g. {k:"Extent", v:"26.4 acres · 291 plots"}, {k:"Plot sizes", v:"160-745 sq. yds"}.',
      },
      ledger: {
        type: 'array',
        items: { type: 'string' },
        description: 'Very short, all-caps-style highlight tags shown in the hero, e.g. "26.4 ACRES", "291 PLOTS", "40% OPEN SPACE".',
      },
      facts: {
        type: 'array',
        items: { type: 'string' },
        description: '2-3 short lines shown on the listing card, e.g. "26.4 AC · 291 PLOTS".',
      },
      unresolved: {
        type: 'array',
        items: { type: 'string', enum: FIELD_NAMES },
        description:
          'Names of the fields above (from the fixed set: name, tagline, location, about, rera, lp_badge, amenities, specs, ledger, facts) that you could NOT confidently find in the brochure. For those fields still supply an empty string or empty array as a placeholder - never invent or guess a value that is not actually in the brochure.',
      },
    },
    required: ['name', 'tagline', 'location', 'about', 'rera', 'lp_badge', 'amenities', 'specs', 'ledger', 'facts', 'unresolved'],
    additionalProperties: false,
  },
  strict: true,
};

const SYSTEM_PROMPT = `You are reading scanned pages of a real-estate brochure for a residential OPEN PLOT layout (land, not built housing) in Telangana, India. Extract the fields defined by the extract_project_fields tool so an admin can pre-fill a project listing form on the developer's website.

Only use information actually present in the brochure images. Do not invent, guess, or infer values that are not shown. If a field cannot be confidently found, still include it (empty string/array) and list its name in "unresolved".

These brochures often name 2-3 different roads/highways close together (e.g. an older highway, a newer one, a ring road), each with its own number. When you cite a road/highway number, pair it only with the exact name/label it is printed next to (on the location map or in the surrounding text) - never attach one road's number to a different road's name.

Match the site's existing tone - "ledger" and "facts" are short, ALL-CAPS-style tags (e.g. "26.4 ACRES", not "The layout covers 26.4 acres"), not full sentences. Here is one real, already-published project as a style reference (do not copy its content, only its format):

${JSON.stringify(
  {
    name: 'Sharanam Valley',
    tagline: 'Recapturing the serenity of lifestyle',
    location: 'Jaya Prakash Nagar, Kalwakurthy',
    about:
      "Sharanam Valley is a fully developed, gated open-plot layout of 26.4 acres beside the Srisailam Highway (NH-765) at Jaya Prakash Nagar, Kalwakurthy. Its 291 plots range from 160 to 745 square yards, with a full 40% of the layout kept as open space — including 3.75 acres of designed parks — and 33'–40' BT roads running through the community under 24x7 security.",
    rera: 'LP No. 379/2021/H',
    lp_badge: 'LP 379/2021/H',
    amenities: ['Grand Entrance Arches', 'Avenue Plantation', 'Central Parks', 'Compound Wall', 'Designer Street Lighting'],
    specs: [
      { k: 'Extent', v: '26.4 acres · 291 plots' },
      { k: 'Plot sizes', v: '160–745 sq. yds' },
      { k: 'Approval', v: 'LP No. 379/2021/H' },
    ],
    ledger: ['26.4 ACRES', '291 PLOTS', '40% OPEN SPACE', "33'–40' BT ROADS"],
    facts: ['26.4 AC · 291 PLOTS', '160–745 SQ. YD PLOTS · 40% OPEN SPACE'],
  },
  null,
  2
)}`;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.httpStatus = status;
  }
}

function validatePages(body) {
  const pages = body?.pages;
  if (!Array.isArray(pages) || pages.length === 0) {
    throw new HttpError(400, '"pages" must be a non-empty array of rendered brochure page images');
  }
  if (pages.length > MAX_PAGES) {
    throw new HttpError(400, `Too many pages (max ${MAX_PAGES})`);
  }
  for (const p of pages) {
    if (!p || typeof p.content !== 'string' || !p.content) {
      throw new HttpError(400, 'Each page needs a non-empty base64 "content"');
    }
  }
  return pages;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(502).json({ error: 'ANTHROPIC_API_KEY is not configured' });
  }

  try {
    const pages = validatePages(req.body || {});
    const client = new Anthropic({ apiKey });

    const imageBlocks = pages.map((p) => ({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: p.content },
    }));

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      tools: [EXTRACT_TOOL],
      tool_choice: { type: 'tool', name: EXTRACT_TOOL.name },
      messages: [
        {
          role: 'user',
          content: [
            ...imageBlocks,
            { type: 'text', text: `These are the ${pages.length} pages of a project brochure, in order. Extract the fields via the extract_project_fields tool.` },
          ],
        },
      ],
    });

    if (response.stop_reason === 'refusal') {
      const category = response.stop_details?.category || 'unknown';
      throw new HttpError(502, `Extraction was declined (${category}). Please fill in the form manually.`);
    }

    const toolUse = response.content.find((b) => b.type === 'tool_use' && b.name === EXTRACT_TOOL.name);
    if (!toolUse) {
      throw new HttpError(502, 'Claude did not return structured extraction data. Please fill in the form manually.');
    }

    return res.status(200).json({ ok: true, fields: toolUse.input });
  } catch (err) {
    if (err instanceof HttpError) {
      return res.status(err.httpStatus).json({ error: err.message });
    }
    if (err instanceof Anthropic.AuthenticationError) {
      console.error('POST /api/admin/extract-brochure auth failed:', err);
      return res.status(502).json({ error: 'Anthropic API key is invalid or missing permissions' });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ error: 'Rate limited by Anthropic API - try again shortly' });
    }
    if (err instanceof Anthropic.APIError) {
      console.error('POST /api/admin/extract-brochure API error:', err);
      return res.status(502).json({ error: `Extraction failed: ${err.message}` });
    }
    console.error('POST /api/admin/extract-brochure failed:', err);
    return res.status(502).json({ error: err.message || 'Failed to extract brochure' });
  }
}

// Step B of "create a new project from the browser": upload/replace a
// project's brochure PDF. The download path is a fixed convention
// (assets/brochures/<slug>.pdf), but the CTA that points at it renders off a
// `brochure` flag — so uploading has to set that flag and re-render the page,
// or the button stays hidden on a project that now has a brochure.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { commitFiles, getFile } from '../_lib/github.js';
import { render } from '../_lib/render-project.js';

const TEMPLATE_PATH = path.join(process.cwd(), 'scripts', 'templates', 'project_template.html');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};
  const { slug, file } = body;

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: 'Missing slug' });
  }
  if (!file || typeof file.content !== 'string' || !file.content) {
    return res.status(400).json({ error: '"file" is required' });
  }
  const looksLikePdf =
    file.mime === 'application/pdf' || (file.filename || '').toLowerCase().endsWith('.pdf');
  if (!looksLikePdf) {
    return res.status(400).json({ error: 'File must be a PDF' });
  }

  let template;
  try {
    template = await readFile(TEMPLATE_PATH, 'utf-8');
  } catch (err) {
    console.error('Could not read project template:', err);
    return res.status(500).json({ error: 'Server misconfiguration: template not found' });
  }

  try {
    const commitResult = await commitFiles(async () => {
      const { content: jsonContent } = await getFile('data/projects.json');
      const projects = JSON.parse(jsonContent);
      const idx = projects.findIndex((p) => p.slug === slug);
      if (idx === -1) {
        throw Object.assign(new Error(`Unknown project slug: ${slug}`), { httpStatus: 404 });
      }

      projects[idx].brochure = true;

      const newHtml = render(template, projects, idx);
      if (newHtml.includes('{{')) {
        throw new Error(`Unfilled placeholder remains for ${slug} after render`);
      }

      return [
        { path: `assets/brochures/${slug}.pdf`, content: file.content, encoding: 'base64' },
        { path: 'data/projects.json', content: JSON.stringify(projects, null, 2) + '\n' },
        { path: `projects/${slug}.html`, content: newHtml },
      ];
    }, `Admin: upload brochure for ${slug}`);

    return res.status(200).json({ ok: true, commit: commitResult.commitSha });
  } catch (err) {
    console.error('POST /api/admin/brochure failed:', err);
    return res.status(502).json({ error: err.message || 'Failed to upload brochure' });
  }
}

// CLI wrapper around api/_lib/render-listings.js, used only by
// scripts/verify_render_parity.py to compare JS output against the
// Python listing-page generator's output. Prints
// {projects_html, index_html, contact_html, about_html} as JSON.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildProjectsHtml, buildIndexHtml, buildContactHtml, buildAboutHtml, buildSitemap } from '../api/_lib/render-listings.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

async function main() {
  const projects = JSON.parse(await readFile(path.join(ROOT, 'data', 'projects.json'), 'utf-8'));
  const cardTemplate = await readFile(
    path.join(ROOT, 'scripts', 'templates', 'folio_card_template.html'),
    'utf-8'
  );
  const rowTemplate = await readFile(
    path.join(ROOT, 'scripts', 'templates', 'registry_row_template.html'),
    'utf-8'
  );

  const projectsHtml = await readFile(path.join(ROOT, 'projects.html'), 'utf-8');
  const indexHtml = await readFile(path.join(ROOT, 'index.html'), 'utf-8');
  const contactHtml = await readFile(path.join(ROOT, 'contact.html'), 'utf-8');
  const aboutHtml = await readFile(path.join(ROOT, 'about.html'), 'utf-8');

  const out = {
    projects_html: buildProjectsHtml(projectsHtml, projects, cardTemplate),
    index_html: buildIndexHtml(indexHtml, projects, rowTemplate),
    contact_html: buildContactHtml(contactHtml, projects),
    about_html: buildAboutHtml(aboutHtml, projects),
    sitemap_xml: buildSitemap(projects),
  };
  process.stdout.write(JSON.stringify(out));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

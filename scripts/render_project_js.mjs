// CLI wrapper around api/_lib/render-project.js, used only by
// scripts/verify_render_parity.py to compare JS output against the
// Python generator's output. Prints {slug: renderedHtml, ...} as JSON.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from '../api/_lib/render-project.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

async function main() {
  const projects = JSON.parse(await readFile(path.join(ROOT, 'data', 'projects.json'), 'utf-8'));
  const template = await readFile(
    path.join(ROOT, 'scripts', 'templates', 'project_template.html'),
    'utf-8'
  );

  const out = {};
  for (let i = 0; i < projects.length; i++) {
    out[projects[i].slug] = render(template, projects, i);
  }
  process.stdout.write(JSON.stringify(out));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

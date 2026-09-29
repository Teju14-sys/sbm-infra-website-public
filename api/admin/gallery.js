// Step B of "create a new project from the browser": add/delete gallery
// images one at a time on an existing project, after it's already created
// via create-project.js. Each request is its own small atomic commit —
// unlike create-project.js this never touches the total project count, so
// only this one project's page needs regenerating, not every page on the
// site.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { commitFiles, getFile } from '../_lib/github.js';
import { render } from '../_lib/render-project.js';
import { processThumb } from '../_lib/image-processing.js';

const TEMPLATE_PATH = path.join(process.cwd(), 'scripts', 'templates', 'project_template.html');

function sanitizeFilename(name, fallback) {
  const base = (name || '').split(/[\\/]/).pop();
  const cleaned = (base || '').replace(/[^a-zA-Z0-9._-]/g, '-');
  return cleaned || fallback;
}

function stemOf(filename) {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? filename : filename.slice(0, dot);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};
  const { action, slug } = body;
  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: 'Missing slug' });
  }
  if (action !== 'add' && action !== 'delete' && action !== 'restore') {
    return res.status(400).json({ error: 'action must be "add", "delete", or "restore"' });
  }

  let filename;
  let processedThumb;
  let originalBuf;
  let commitMessage;

  if (action === 'add') {
    const { file, caption } = body;
    if (!caption || typeof caption !== 'string' || !caption.trim()) {
      return res.status(400).json({ error: 'A caption is required for the gallery image' });
    }
    if (!file || typeof file.content !== 'string' || !file.content) {
      return res.status(400).json({ error: '"file" is required' });
    }
    filename = sanitizeFilename(file.filename, `gallery-${Date.now()}.jpg`);
    originalBuf = Buffer.from(file.content, 'base64');
    try {
      processedThumb = await processThumb(originalBuf);
    } catch (err) {
      console.error('Gallery image processing failed:', err);
      return res.status(400).json({ error: 'Could not process that image — is it a valid image file?' });
    }
    commitMessage = `Admin: add gallery image to ${slug}`;
  } else {
    const { src } = body;
    if (!src || typeof src !== 'string') {
      return res.status(400).json({ error: `Missing src to ${action}` });
    }
    filename = src;
    commitMessage = action === 'delete' ? `Admin: delete gallery image from ${slug}` : `Admin: restore gallery image to ${slug}`;
  }

  let template;
  try {
    template = await readFile(TEMPLATE_PATH, 'utf-8');
  } catch (err) {
    console.error('Could not read project template:', err);
    return res.status(500).json({ error: 'Server misconfiguration: template not found' });
  }

  let resultGallery;
  let resultTrash;

  try {
    const commitResult = await commitFiles(async () => {
      const { content: jsonContent } = await getFile('data/projects.json');
      const projects = JSON.parse(jsonContent);
      const idx = projects.findIndex((p) => p.slug === slug);
      if (idx === -1) {
        throw Object.assign(new Error(`Unknown project slug: ${slug}`), { httpStatus: 404 });
      }

      const project = projects[idx];
      project.gallery = project.gallery || [];
      project.trash = project.trash || {};
      project.trash.gallery = project.trash.gallery || [];

      const files = [];

      if (action === 'add') {
        const caption = body.caption.trim();
        project.gallery.push({ src: filename, cap: caption });
        files.push(
          {
            path: `assets/images/projects/${slug}/${filename}`,
            content: originalBuf.toString('base64'),
            encoding: 'base64',
          },
          {
            path: `assets/images/derived/${slug}/thumb-${stemOf(filename)}.jpg`,
            content: processedThumb.toString('base64'),
            encoding: 'base64',
          }
        );
      } else if (action === 'delete') {
        const removed = project.gallery.find((g) => g.src === filename);
        if (!removed) {
          throw Object.assign(new Error('That gallery image was not found on this project.'), {
            httpStatus: 404,
          });
        }
        project.gallery = project.gallery.filter((g) => g.src !== filename);
        // Delete never removes the underlying image/thumb files from the
        // repo (see the file list built for "add" above vs. here - nothing
        // is pushed to delete them), so restoring is just re-adding the
        // JSON reference; no re-upload or reprocessing needed.
        project.trash.gallery.push({ ...removed, deleted_at: new Date().toISOString() });
      } else {
        const restored = project.trash.gallery.find((g) => g.src === filename);
        if (!restored) {
          throw Object.assign(new Error('That gallery image was not found in the trash.'), {
            httpStatus: 404,
          });
        }
        project.trash.gallery = project.trash.gallery.filter((g) => g.src !== filename);
        const { deleted_at, ...galleryItem } = restored;
        project.gallery.push(galleryItem);
      }

      resultGallery = project.gallery;
      resultTrash = project.trash.gallery;

      const newHtml = render(template, projects, idx);
      if (newHtml.includes('{{')) {
        throw new Error(`Unfilled placeholder remains for ${slug} after render`);
      }

      files.push(
        { path: 'data/projects.json', content: JSON.stringify(projects, null, 2) + '\n' },
        { path: `projects/${slug}.html`, content: newHtml }
      );

      return files;
    }, commitMessage);

    return res.status(200).json({ ok: true, gallery: resultGallery, trash: resultTrash, commit: commitResult.commitSha });
  } catch (err) {
    const status = err.httpStatus || 502;
    console.error('POST /api/admin/gallery failed:', err);
    return res.status(status).json({ error: err.message || 'Failed to update gallery' });
  }
}

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getFile, commitFiles } from '../_lib/github.js';
import { render, VIDEO_CATEGORY_ORDER } from '../_lib/render-project.js';
import { extractYouTubeId } from '../_lib/youtube.js';

const TEMPLATE_PATH = path.join(process.cwd(), 'scripts', 'templates', 'project_template.html');

function deriveCaption(projectName, label) {
  return `${projectName} &mdash; ${label.toLowerCase()}`;
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

  let newYoutubeId;
  let newLabel;
  let newCategory;
  let commitMessage;

  if (action === 'add') {
    const { url, label, category } = body;
    if (!label || typeof label !== 'string' || !label.trim()) {
      return res.status(400).json({ error: 'Label is required' });
    }
    if (!category || !VIDEO_CATEGORY_ORDER.includes(category)) {
      return res.status(400).json({ error: `Category must be one of: ${VIDEO_CATEGORY_ORDER.join(', ')}` });
    }
    const parsed = extractYouTubeId(url);
    if (!parsed.ok) {
      return res.status(400).json({ error: parsed.error });
    }
    newYoutubeId = parsed.id;
    newLabel = label.trim();
    newCategory = category;
    commitMessage = `Admin: add video "${newLabel}" to ${slug}`;
  } else {
    const { youtube_id } = body;
    if (!youtube_id || typeof youtube_id !== 'string') {
      return res.status(400).json({ error: `Missing youtube_id to ${action}` });
    }
    newYoutubeId = youtube_id;
    commitMessage = action === 'delete' ? `Admin: delete video from ${slug}` : `Admin: restore video to ${slug}`;
  }

  let template;
  try {
    template = await readFile(TEMPLATE_PATH, 'utf-8');
  } catch (err) {
    console.error('Could not read project template:', err);
    return res.status(500).json({ error: 'Server misconfiguration: template not found' });
  }

  let resultVideos;
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
      project.videos = project.videos || [];
      project.trash = project.trash || {};
      project.trash.videos = project.trash.videos || [];

      if (action === 'add') {
        const caption =
          (typeof body.caption === 'string' && body.caption.trim()) ||
          deriveCaption(project.name, newLabel);
        project.videos.push({ youtube_id: newYoutubeId, label: newLabel, caption, category: newCategory });
      } else if (action === 'delete') {
        const removed = project.videos.find((v) => v.youtube_id === newYoutubeId);
        if (!removed) {
          throw Object.assign(new Error('That video was not found on this project.'), {
            httpStatus: 404,
          });
        }
        project.videos = project.videos.filter((v) => v.youtube_id !== newYoutubeId);
        // The video itself lives on YouTube, not in this repo - deleting
        // never removes a file, so keeping the full entry in trash makes
        // restore a one-click, zero-re-entry operation.
        project.trash.videos.push({ ...removed, deleted_at: new Date().toISOString() });
      } else {
        const restored = project.trash.videos.find((v) => v.youtube_id === newYoutubeId);
        if (!restored) {
          throw Object.assign(new Error('That video was not found in the trash.'), {
            httpStatus: 404,
          });
        }
        project.trash.videos = project.trash.videos.filter((v) => v.youtube_id !== newYoutubeId);
        const { deleted_at, ...video } = restored;
        project.videos.push(video);
      }

      resultVideos = project.videos;

      const newHtml = render(template, projects, idx);
      if (newHtml.includes('{{')) {
        throw new Error(`Unfilled placeholder remains for ${slug} after render`);
      }

      resultTrash = project.trash.videos;

      return [
        { path: 'data/projects.json', content: JSON.stringify(projects, null, 2) + '\n' },
        { path: `projects/${slug}.html`, content: newHtml },
      ];
    }, commitMessage);

    return res.status(200).json({ ok: true, videos: resultVideos, trash: resultTrash, commit: commitResult.commitSha });
  } catch (err) {
    const status = err.httpStatus || 502;
    console.error('POST /api/admin/videos failed:', err);
    return res.status(status).json({ error: err.message || 'Failed to update videos' });
  }
}

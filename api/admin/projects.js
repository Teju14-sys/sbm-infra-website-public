import { getFile } from '../_lib/github.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { content } = await getFile('data/projects.json');
    const projects = JSON.parse(content);
    // Full project objects, not a trimmed summary - the dashboard now needs
    // every field (gallery, images, trash, hero_video, ...) to render the
    // edit forms and recently-deleted lists. Fine to expose in full: this
    // is already password-gated and holds nothing more sensitive than
    // what's already public on the live project pages.
    return res.status(200).json({ projects });
  } catch (err) {
    console.error('GET /api/admin/projects failed:', err);
    return res.status(502).json({ error: 'Could not load project data from GitHub.' });
  }
}

import { Octokit } from '@octokit/rest';

function client() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is not configured');
  return new Octokit({ auth: token });
}

function repoInfo() {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'master';
  if (!owner || !repo) throw new Error('GITHUB_OWNER/GITHUB_REPO are not configured');
  return { owner, repo, branch };
}

/** Fetch a file's current text content + sha from the given branch. */
export async function getFile(path) {
  const octokit = client();
  const { owner, repo, branch } = repoInfo();
  const { data } = await octokit.repos.getContent({ owner, repo, path, ref: branch });
  if (Array.isArray(data) || data.type !== 'file') {
    throw new Error(`${path} is not a file`);
  }
  const content = Buffer.from(data.content, data.encoding).toString('utf-8');
  return { content, sha: data.sha };
}

/**
 * Atomically commit one or more file changes to the branch's HEAD via the
 * Git Data API (blobs -> tree -> commit -> ref update), so a partial write
 * across multiple files can never land — either both files change together,
 * or nothing changes. Retries on a ref-conflict (someone else committed in
 * between) by calling `rebuildFiles` again against the fresh HEAD state.
 *
 * @param {{path: string, content: string, encoding?: 'utf-8'|'base64'}[] | (() => Promise<{path:string, content:string, encoding?: 'utf-8'|'base64'}[]>)} filesOrBuilder
 *   Either a fixed list of files to write, or an async function that
 *   re-derives the files to write given the current retry attempt — use the
 *   function form when the change depends on file content that might have
 *   moved (e.g. "add an entry to this JSON") so each retry re-reads fresh
 *   state rather than blindly reapplying a stale edit. Each file's `content`
 *   is UTF-8 text by default; pass `encoding: 'base64'` for binary files
 *   (images, PDFs) with `content` already base64-encoded, so it's written
 *   through to the blob as-is instead of being mangled by a UTF-8 round-trip.
 * @param {string} message Commit message.
 * @param {number} maxAttempts
 */
export async function commitFiles(filesOrBuilder, message, maxAttempts = 3) {
  const octokit = client();
  const { owner, repo, branch } = repoInfo();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const files =
      typeof filesOrBuilder === 'function' ? await filesOrBuilder(attempt) : filesOrBuilder;

    const { data: ref } = await octokit.git.getRef({ owner, repo, ref: `heads/${branch}` });
    const baseCommitSha = ref.object.sha;
    const { data: baseCommit } = await octokit.git.getCommit({ owner, repo, commit_sha: baseCommitSha });
    const baseTreeSha = baseCommit.tree.sha;

    const blobs = await Promise.all(
      files.map(async (f) => {
        const base64Content =
          f.encoding === 'base64' ? f.content : Buffer.from(f.content, 'utf-8').toString('base64');
        const { data: blob } = await octokit.git.createBlob({
          owner,
          repo,
          content: base64Content,
          encoding: 'base64',
        });
        return { path: f.path, sha: blob.sha };
      })
    );

    const { data: newTree } = await octokit.git.createTree({
      owner,
      repo,
      base_tree: baseTreeSha,
      tree: blobs.map((b) => ({ path: b.path, mode: '100644', type: 'blob', sha: b.sha })),
    });

    const { data: newCommit } = await octokit.git.createCommit({
      owner,
      repo,
      message,
      tree: newTree.sha,
      parents: [baseCommitSha],
    });

    try {
      await octokit.git.updateRef({
        owner,
        repo,
        ref: `heads/${branch}`,
        sha: newCommit.sha,
      });
      return { commitSha: newCommit.sha, attempts: attempt };
    } catch (err) {
      // 422/409-style "not a fast-forward" — master moved under us. Nothing
      // has published yet at this point (the ref update IS the publish),
      // so it's always safe to retry against fresh HEAD.
      const isConflict = err.status === 422 || err.status === 409;
      if (!isConflict || attempt === maxAttempts) throw err;
    }
  }

  throw new Error('commitFiles: exhausted retries');
}

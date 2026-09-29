// Extracts an 11-char YouTube video ID from a pasted URL or bare ID —
// mirrors what was done by hand throughout this project's early sessions
// (watch?v=, youtu.be/, embed/, shorts/, or a bare ID), including catching
// a too-short/garbled paste rather than silently accepting it.

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

const PATTERNS = [
  /(?:youtube(?:-nocookie)?\.com\/watch\?(?:.*&)?v=|youtube\.com\/shorts\/|youtube\.com\/embed\/|youtu\.be\/)([A-Za-z0-9_-]{11})/,
];

export function extractYouTubeId(input) {
  if (!input || typeof input !== 'string') {
    return { ok: false, error: 'No URL or ID provided.' };
  }
  const trimmed = input.trim();

  if (ID_RE.test(trimmed)) {
    return { ok: true, id: trimmed };
  }

  for (const re of PATTERNS) {
    const m = trimmed.match(re);
    if (m) return { ok: true, id: m[1] };
  }

  // Give a specific hint for the "pasted something YouTube-shaped but the
  // ID looks truncated" case — this happened repeatedly with dictated URLs.
  const idLike = trimmed.match(/(?:v=|be\/|shorts\/|embed\/)([A-Za-z0-9_-]+)/);
  if (idLike && idLike[1].length !== 11) {
    return {
      ok: false,
      error: `Found an ID-like value "${idLike[1]}" but it's ${idLike[1].length} characters, not the expected 11 — check for a dropped character.`,
    };
  }

  return { ok: false, error: 'Could not find a valid YouTube video ID in that input.' };
}

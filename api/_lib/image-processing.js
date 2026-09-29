// Node/sharp port of scripts/optimize_images.py's derived-image pipeline,
// for use by the admin panel's create-project endpoint (Vercel serverless
// functions can't shell out to the local Python/Pillow script). Produces
// the same three derived renditions per project:
//   card.jpg          16:9 crop for listing cards
//   thumb-<name>.jpg   4:3 crop for the document grid
//   plan.jpg          resized master layout plan
// Exact byte parity with Pillow's JPEG encoder is not achievable (different
// codecs) and isn't required — these are derived assets rebuilt fresh each
// time, not something scripts/verify_render_parity.py compares. Dimensions,
// crop offsets, and aspect ratio DO mirror optimize_images.py's math exactly.
import sharp from 'sharp';

export const CARD_SIZE = [1280, 720];
export const THUMB_SIZE = [880, 660];
export const PLAN_MAX_W = 1700;

/**
 * Scale `buffer` up to cover `[tw, th]` (same as Pillow's
 * `scale = max(tw/sw, th/sh)`), then crop to exactly `[tw, th]` — centered
 * horizontally always, and vertically unless `anchor === 'top'`.
 */
async function centerCrop(buffer, [tw, th], anchor = 'center') {
  const { width: sw, height: sh } = await sharp(buffer).metadata();
  const scale = Math.max(tw / sw, th / sh);
  const rw = Math.round(sw * scale);
  const rh = Math.round(sh * scale);
  const left = Math.floor((rw - tw) / 2);
  const top = anchor === 'top' ? 0 : Math.floor((rh - th) / 2);
  return sharp(buffer)
    .resize(rw, rh, { kernel: 'lanczos3' })
    .extract({ left, top, width: tw, height: th });
}

/** Composite any transparency onto white, then encode as JPEG. */
async function toJpeg(sharpInstance, quality) {
  return sharpInstance
    .flatten({ background: '#ffffff' })
    .jpeg({ quality, progressive: true, mozjpeg: true })
    .toBuffer();
}

/** assets/images/derived/<slug>/card.jpg — 16:9 crop for the listing cards. */
export async function processCard(buffer, anchor = 'center') {
  const cropped = await centerCrop(buffer, CARD_SIZE, anchor);
  return toJpeg(cropped, 80);
}

/** assets/images/derived/<slug>/plan.jpg — capped-width master layout plan, no crop. */
export async function processPlan(buffer) {
  const { width, height } = await sharp(buffer).metadata();
  let img = sharp(buffer);
  if (width > PLAN_MAX_W) {
    const ratio = PLAN_MAX_W / width;
    img = img.resize(PLAN_MAX_W, Math.round(height * ratio), { kernel: 'lanczos3' });
  }
  return toJpeg(img, 82);
}

/** assets/images/derived/<slug>/thumb-<name>.jpg — 4:3 crop for the doc grid. */
export async function processThumb(buffer) {
  const cropped = await centerCrop(buffer, THUMB_SIZE, 'center');
  return toJpeg(cropped, 76);
}

/**
 * assets/images/projects/<slug>/img-0-logo.jpeg — optimize_images.py never
 * touches the logo file (it's used raw at whatever resolution was
 * extracted); this just normalizes format so a browser-uploaded logo of any
 * type (PNG, WebP, etc.) is guaranteed valid JPEG at the hardcoded filename
 * every page references.
 */
export async function processLogo(buffer) {
  return sharp(buffer).flatten({ background: '#ffffff' }).jpeg({ quality: 90 }).toBuffer();
}

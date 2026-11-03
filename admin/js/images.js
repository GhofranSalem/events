// Photos -> WebP at the site's sizes, in the browser (Safari uses the bundled encoder).
import { h } from './dom.js';
import { S } from './state.js';
import { alertBox, busy } from './ui.js';

export let encoderPromise = null, nativeWebp = null;
export async function webpSupported() {
  if (nativeWebp !== null) return nativeWebp;
  const c = document.createElement('canvas'); c.width = c.height = 2;
  const b = await new Promise(r => c.toBlob(r, 'image/webp', 0.8));
  return (nativeWebp = !!b && b.type === 'image/webp');
}
export async function encodeWebp(canvas, quality) {
  if (await webpSupported()) return await new Promise(r => canvas.toBlob(r, 'image/webp', quality));
  // Safari can't make WebP from a canvas: use the bundled encoder (vendor/webp_enc.*, from @jsquash/webp, Apache-2.0).
  encoderPromise ||= import('../vendor/webp_enc.js').then(m => m.default({ noInitialRun: true, locateFile: f => new URL('../vendor/' + f, import.meta.url).href }));
  const mod = await encoderPromise;
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  const out = mod.encode(data.data, canvas.width, canvas.height, {
    quality: Math.round(quality * 100), target_size: 0, target_PSNR: 0, method: 4, sns_strength: 50, filter_strength: 60,
    filter_sharpness: 0, filter_type: 1, partitions: 0, segments: 4, pass: 1, show_compressed: 0, preprocessing: 0,
    autofilter: 0, partition_limit: 0, alpha_compression: 1, alpha_filtering: 1, alpha_quality: 100, lossless: 0,
    exact: 0, image_hint: 0, emulate_jpeg_size: 0, thread_level: 0, low_memory: 0, near_lossless: 100,
    use_delta_palette: 0, use_sharp_yuv: 0,
  });
  return new Blob([out], { type: 'image/webp' });
}
export async function decodeImage(blob) {
  try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch { /* SVG etc. */ }
  const url = URL.createObjectURL(blob);
  try { const img = new Image(); img.src = url; await img.decode(); return img; }
  catch { throw new Error('الصيغة دي مش مدعومة. استخدم JPG أو PNG أو WebP.'); }
  finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
export const dims = src => [src.naturalWidth || src.width, src.naturalHeight || src.height];
// mode: {width:N} keep aspect, at most N wide | {cover:[W,H]} crop to that size | {fit:[W,H]} fit inside
export async function makeWebp(src, mode, quality = 0.82) {
  const [W, H] = dims(src);
  let sx = 0, sy = 0, sw = W, sh = H, w, hgt;
  if (mode.width) { const s = Math.min(1, mode.width / W); w = Math.round(W * s); hgt = Math.round(H * s); }
  else if (mode.fit) { const s = Math.min(mode.fit[0] / W, mode.fit[1] / H); w = Math.round(W * s); hgt = Math.round(H * s); }
  else {
    [w, hgt] = mode.cover;
    const target = w / hgt;
    if (W / H > target) { sw = H * target; sx = (W - sw) / 2; } else { sh = W / target; sy = (H - sh) / 2; }
  }
  const c = document.createElement('canvas'); c.width = w; c.height = hgt;
  const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, w, hgt);
  return { blob: await encodeWebp(c, quality), w, h: hgt };
}
export let nameSeq = 0;
export function slug(s) { return (s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40); }
export function newPath(folder, base, suffix = '') {
  const stamp = Date.now().toString(36) + (nameSeq++).toString(36);
  return `assets/${folder}/${slug(base) || folder}-${stamp}${suffix}.webp`;
}
export function addImage(path, blob) { S.newImages.set(path, blob); S.urls.set(path, URL.createObjectURL(blob)); }
export function drop(...paths) { paths.filter(Boolean).forEach(p => S.dropped.add(p)); }
export function pickFiles({ multiple = false, accept = 'image/*' } = {}) {
  return new Promise(resolve => {
    const input = h('input', { type: 'file', accept, multiple });
    input.addEventListener('change', () => resolve([...input.files]));
    input.click();
  });
}
export async function withBusy(text, fn) {
  busy(text);
  try { return await fn(); }
  catch (e) { console.error(e); alertBox('حصلت مشكلة', e.message || String(e)); }
  finally { busy(false); }
}

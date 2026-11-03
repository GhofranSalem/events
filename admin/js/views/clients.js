// Client logos.
import { rerender } from '../app.js';
import { h } from '../dom.js';
import { addImage, decodeImage, drop, makeWebp, newPath, pickFiles, withBusy } from '../images.js';
import { S, imgURL, markDirty } from '../state.js';
import { arrows, confirmBox, field, pageHead, removeBtn, toast } from '../ui.js';

export function readClients() {
  return [...S.doc.querySelectorAll('.client-grid > li')].map(li => {
    const img = li.querySelector('img');
    return { src: img.getAttribute('src'), w: img.getAttribute('width'), h: img.getAttribute('height'), altAr: img.getAttribute('data-ar-alt') || '', altEn: img.getAttribute('data-en-alt') || '', css: (li.getAttribute('style') || '').match(/--w:\s*(\d+)px/)?.[1] || '150' };
  });
}
export function writeClients(list) {
  const doc = S.doc, ul = doc.querySelector('.client-grid');
  ul.replaceChildren(doc.createTextNode('\n'));
  list.forEach(c => {
    const li = doc.createElement('li'); li.className = 'client'; li.setAttribute('style', `--w:${c.css}px`);
    const img = doc.createElement('img');
    for (const [k, v] of [['src', c.src], ['width', c.w], ['height', c.h], ['fetchpriority', 'low'], ['decoding', 'async'], ['alt', c.altAr], ['data-ar-alt', c.altAr], ['data-en-alt', c.altEn]]) img.setAttribute(k, v);
    li.append(img); ul.append(li, doc.createTextNode('\n'));
  });
  markDirty();
}
export async function makeLogo(file, name) {
  const src = await decodeImage(file);
  const out = await makeWebp(src, { fit: [360, 200] }, 0.9);
  const path = newPath('clients', name || file.name.replace(/\.[^.]+$/, ''));
  addImage(path, out.blob);
  // visual width on the wall: wide logos get more room, tall ones less (same rule as the existing 36 logos)
  return { src: path, w: String(out.w), h: String(out.h), css: String(Math.min(190, Math.round(107.2 * Math.sqrt(out.w / out.h)))) };
}
export function viewClients() {
  const list = readClients();
  const cells = list.map((c, i) => h('div', { class: 'ccell' },
    h('div', { class: 'logo' }, h('img', { src: imgURL(c.src), alt: '' })),
    h('div', { class: 'body' }, field('الاسم — عربي', c.altAr, v => { c.altAr = v; writeClients(list); }, { dir: 'rtl' }), field('Name — English', c.altEn, v => { c.altEn = v; writeClients(list); }, { dir: 'ltr' })),
    h('div', { class: 'tools' },
      h('div', { style: 'display:flex;gap:4px;align-items:center' }, h('span', { class: 'num', text: i + 1 }), ...arrows(list, i, () => { writeClients(list); rerender(); })),
      h('button', { class: 'btn small ghost', type: 'button', text: 'تغيير', onclick: async () => {
        const [file] = await pickFiles(); if (!file) return;
        await withBusy('بجهّز اللوجو…', async () => { const n = await makeLogo(file, c.altEn); drop(c.src); Object.assign(c, n); writeClients(list); rerender(); });
      } }),
      removeBtn(async () => { if (!await confirmBox(`مسح لوجو ${c.altAr || ''}؟`, '', 'مسح', true)) return; drop(c.src); list.splice(i, 1); writeClients(list); rerender(); }))));
  return [
    pageHead('العملاء', `${list.length} لوجو، بيظهروا 6 في الصف (3 على الموبايل) بالترتيب ده.`,
      h('button', { class: 'btn gold', type: 'button', text: '+ إضافة لوجوهات', onclick: async () => {
        const files = await pickFiles({ multiple: true, accept: 'image/png,image/svg+xml,image/webp' }); if (!files.length) return;
        await withBusy('بجهّز اللوجوهات…', async () => { for (const f of files) list.push({ altAr: '', altEn: '', ...(await makeLogo(f)) }); writeClients(list); rerender(); scrollTo(0, document.body.scrollHeight); toast('اتضافت في الآخر — اكتب اسم كل جهة'); });
      } })),
    h('div', { class: 'note', text: 'اللوجو لازم يكون أبيض على خلفية شفافة (PNG أو SVG) زي الباقيين، لأن الخلفية في الموقع سودا.' }),
    h('div', { class: 'cgrid' }, cells),
  ];
}

// Hero photos and the typed heading.
import { rerender } from '../app.js';
import { h } from '../dom.js';
import { addImage, decodeImage, drop, makeWebp, newPath, pickFiles, withBusy } from '../images.js';
import { S, imgURL, markDirty } from '../state.js';
import { arField, arrows, confirmBox, enField, pageHead, pair, toast } from '../ui.js';
import { describe, textItemEditor } from './texts.js';

export function readSlides() {
  return [...S.doc.querySelectorAll('.hero-slide')].map(f => {
    const img = f.querySelector('img');
    const m = (f.getAttribute('style') || '').match(/--focus:\s*([\d.]+)%\s+([\d.]+)%/);
    return {
      src: img.getAttribute('src') || img.getAttribute('data-src'),
      srcset: img.getAttribute('srcset') || img.getAttribute('data-srcset') || '',
      altAr: img.getAttribute('data-ar-alt') || '', altEn: img.getAttribute('data-en-alt') || '',
      project: f.getAttribute('data-project') || '', fx: m ? +m[1] : 50, fy: m ? +m[2] : 50,
    };
  });
}
export function writeSlides(list) {
  const doc = S.doc, host = doc.querySelector('.hero-slides');
  host.replaceChildren(doc.createTextNode('\n'));
  list.forEach((s, i) => {
    const fig = doc.createElement('figure');
    fig.className = 'hero-slide' + (i ? '' : ' is-active');
    if (s.project) fig.setAttribute('data-project', s.project);
    fig.setAttribute('style', `--focus:${s.fx}% ${s.fy}%`);
    const img = doc.createElement('img');
    img.setAttribute(i ? 'data-src' : 'src', s.src);
    img.setAttribute(i ? 'data-srcset' : 'srcset', s.srcset);
    img.setAttribute('sizes', '100vw');
    img.setAttribute('alt', s.altAr); img.setAttribute('data-ar-alt', s.altAr); img.setAttribute('data-en-alt', s.altEn);
    if (!i) img.setAttribute('fetchpriority', 'high');
    img.setAttribute('decoding', 'async');
    fig.append(img); host.append(fig, doc.createTextNode('\n'));
  });
  const first = list[0];
  const preload = doc.querySelector('link[rel=preload][as=image]');
  if (preload && first) { preload.setAttribute('href', first.src); preload.setAttribute('imagesrcset', first.srcset); }
  const cap = doc.getElementById('hero-caption');
  if (cap) cap.setAttribute('href', first && first.project ? 'project.html?id=' + first.project : 'project.html');
  markDirty();
}
export const srcsetPaths = s => s.split(',').map(x => x.trim().split(/\s+/)[0]).filter(Boolean);
export async function makeHeroSlide(file) {
  const src = await decodeImage(file);
  const big = await makeWebp(src, { width: 2400 }, 0.8);
  const small = await makeWebp(src, { width: 1000 }, 0.8);
  const base = (file.name || 'hero').replace(/\.[^.]+$/, '');
  const pBig = newPath('hero', base), pSmall = pBig.replace(/\.webp$/, '-sm.webp');
  addImage(pBig, big.blob); addImage(pSmall, small.blob);
  return { src: pBig, srcset: `${pSmall} ${small.w}w, ${pBig} ${big.w}w`, altAr: '', altEn: '', project: '', fx: 50, fy: 50 };
}
export function projectSelect(value, onChange) {
  const sel = h('select', {}, h('option', { value: '', text: '— بدون (مفيش اسم مشروع تحت الصورة) —' }),
    S.projects.map((p, i) => h('option', { value: p.id, text: `${i + 1}. ${p.title.ar}` })));
  sel.value = value;
  sel.addEventListener('change', () => onChange(sel.value));
  return h('label', { class: 'field' }, h('span', { text: 'اسم المشروع اللي بيظهر تحت الصورة' }), sel);
}
export function viewHero() {
  const h1 = S.doc.querySelector('.hero h1');
  const typed = [...h1.querySelectorAll('[data-ar]')].map(el => textItemEditor({ el, kind: 'text', label: describe(el) }));
  const others = ['.hero .eyebrow', '.hero-description'].map(sel => S.doc.querySelector(sel)).filter(Boolean)
    .map(el => textItemEditor({ el, kind: 'text', label: el.matches('.eyebrow') ? 'الجملة الصغيرة اللي فوق العنوان' : 'الفقرة اللي تحت العنوان' }));
  const slides = readSlides();
  const rows = slides.map((s, i) => {
    const dot = h('span', { class: 'dot', style: `left:${s.fx}%;top:${s.fy}%` });
    const img = h('img', { src: imgURL(s.src), alt: '' });
    const thumb = h('div', { class: 'thumb hero', title: 'دوس على أهم نقطة في الصورة عشان تفضل ظاهرة لما الصورة تتقص', style: 'aspect-ratio:auto' }, img, dot, i === 0 ? h('span', { class: 'badge', text: 'الأولى' }) : null);
    thumb.addEventListener('click', e => {
      const r = img.getBoundingClientRect();
      s.fx = Math.round(Math.min(100, Math.max(0, (e.clientX - r.left) / r.width * 100)));
      s.fy = Math.round(Math.min(100, Math.max(0, (e.clientY - r.top) / r.height * 100)));
      dot.style.left = s.fx + '%'; dot.style.top = s.fy + '%';
      writeSlides(slides);
    });
    return h('div', { class: 'row' },
      h('div', {}, thumb, h('p', { class: 'hint', text: 'دوس على أهم نقطة في الصورة' })),
      h('div', {},
        projectSelect(s.project, v => { s.project = v; writeSlides(slides); }),
        pair(arField('وصف الصورة (للمكفوفين وجوجل)', s.altAr, v => { s.altAr = v; writeSlides(slides); }),
          enField('Photo description', s.altEn, v => { s.altEn = v; writeSlides(slides); })),
        h('div', { class: 'photo-actions' },
          h('button', { class: 'btn small ghost', type: 'button', text: 'تغيير الصورة', onclick: async () => {
            const [file] = await pickFiles(); if (!file) return;
            await withBusy('بجهّز الصورة…', async () => {
              const n = await makeHeroSlide(file);
              drop(s.src, ...srcsetPaths(s.srcset));
              s.src = n.src; s.srcset = n.srcset; writeSlides(slides); rerender();
            });
          } }))),
      h('div', { class: 'row-tools' },
        h('span', { class: 'num', text: i + 1 }),
        ...arrows(slides, i, () => { writeSlides(slides); rerender(); }),
        h('button', { class: 'icon-btn danger', type: 'button', title: 'مسح', disabled: slides.length < 2, text: '✕', onclick: async () => {
          if (!await confirmBox('مسح الصورة دي من الهيرو؟', '', 'مسح', true)) return;
          drop(s.src, ...srcsetPaths(s.srcset)); slides.splice(i, 1); writeSlides(slides); rerender();
        } })));
  });
  return [
    pageHead('الهيرو (أول حاجة في الموقع)', 'العنوان اللي بيتكتب حرف حرف، والصور اللي بتتقلب ورا.'),
    h('div', { class: 'card' }, h('h3', { text: 'النص اللي بيتكتب' }), typed, others,
      h('p', { class: 'hint', text: 'باقي الأزرار في تبويب «كل النصوص».' })),
    h('div', { class: 'page-head' }, h('div', {}, h('h2', { text: 'صور الهيرو', style: 'font-size:24px' }), h('p', { text: 'بتتقلب كل 6 ثواني بالترتيب ده. الأفضل صور عرضية كبيرة (2400 بكسل عرض أو أكتر).' })),
      h('button', { class: 'btn gold', type: 'button', text: '+ إضافة صور', onclick: async () => {
        const files = await pickFiles({ multiple: true }); if (!files.length) return;
        await withBusy('بجهّز الصور…', async () => { for (const f of files) slides.push(await makeHeroSlide(f)); writeSlides(slides); rerender(); toast('اتضافت ' + files.length + ' صورة — اكتب وصفها واختار المشروع'); });
      } })),
    h('div', { class: 'rows' }, rows),
  ];
}

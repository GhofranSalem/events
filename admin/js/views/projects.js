// Projects list and project editor.
import { render, rerender } from '../app.js';
import { h } from '../dom.js';
import { addImage, decodeImage, drop, makeWebp, newPath, pickFiles, withBusy } from '../images.js';
import { CATEGORIES, S, imgURL, markDirty } from '../state.js';
import { arField, arrows, confirmBox, enField, inp, listEditor, move, pageHead, pair, removeBtn } from '../ui.js';

export async function blobFor(path) { return S.newImages.get(path) || await (await fetch('../' + path, { cache: 'force-cache' })).blob(); }
export async function refreshThumb(p) {
  const first = p.images[0];
  if (!first) return;
  const want = first.replace(/\.webp$/, '-thumb.webp');
  if (p.thumb === want) return;
  const src = await decodeImage(await blobFor(first));
  const t = await makeWebp(src, { width: 720 }, 0.8);
  if (p.thumb) drop(p.thumb);
  addImage(want, t.blob);
  p.thumb = want;
}
export async function addProjectImages(p, files) {
  for (const file of files) {
    const src = await decodeImage(file);
    const out = await makeWebp(src, { width: 1600 }, 0.8);
    const path = newPath('projects', p.id);
    addImage(path, out.blob);
    p.images.push(path);
  }
  await refreshThumb(p);
}
export function viewProjects() {
  if (S.editing !== null && S.projects[S.editing]) return viewProject(S.projects[S.editing], S.editing);
  S.editing = null;
  const rows = S.projects.map((p, i) => h('div', { class: 'prow' + (p.hidden ? ' is-hidden' : '') },
    h('span', { class: 'num', text: i + 1 }),
    h('div', { class: 'thumb' }, p.thumb || p.images[0] ? h('img', { src: imgURL(p.thumb || p.images[0]), alt: '', loading: 'lazy' }) : null),
    h('div', {}, h('h4', { text: p.title.ar || '(من غير اسم)' }),
      h('p', {}, CATEGORIES[p.category] || p.category, h('span', { class: 'pill', text: p.images.length + ' صورة' }),
        p.videos?.length ? h('span', { class: 'pill', text: p.videos.length + ' فيديو' }) : null,
        p.hidden ? h('span', { class: 'pill off', text: 'مخفي' }) : null)),
    h('div', { class: 'arrows' }, ...arrows(S.projects, i, rerender),
      h('button', { class: 'btn small', type: 'button', text: 'تعديل', onclick: () => { S.editing = i; render(); scrollTo(0, 0); } }))));
  return [
    pageHead('المشروعات', `${S.projects.length} مشروع. الترتيب هنا = الترتيب في الموقع (أول صف بيظهر في الصفحة الرئيسية).`,
      h('button', { class: 'btn gold', type: 'button', text: '+ مشروع جديد', onclick: () => {
        const n = Math.max(0, ...S.projects.map(p => +(p.id.match(/\d+/) || [0])[0])) + 1;
        S.projects.unshift({ id: 'project-' + String(n).padStart(2, '0'), title: { ar: '', en: '' }, description: { ar: '', en: '' }, category: 'events', images: [], services: [], videos: [], thumb: '' });
        S.editing = 0; markDirty(); render(); scrollTo(0, 0);
      } })),
    h('div', { class: 'plist' }, rows),
  ];
}
export function viewProject(p, index) {
  const cat = h('select', {}, Object.entries(CATEGORIES).map(([k, v]) => h('option', { value: k, text: v })));
  cat.value = p.category; cat.addEventListener('change', () => { p.category = cat.value; markDirty(); });
  const hidden = h('input', { type: 'checkbox' }); hidden.checked = !!p.hidden;
  hidden.addEventListener('change', () => { if (hidden.checked) p.hidden = true; else delete p.hidden; markDirty(); });

  const strip = h('div', { class: 'strip' }, p.images.map((src, i) => h('div', { class: 'cell' },
    h('div', { class: 'thumb' }, h('img', { src: imgURL(src), alt: '', loading: 'lazy' }), i === 0 ? h('span', { class: 'badge', text: 'الغلاف' }) : null),
    h('div', { class: 'tools' },
      h('div', { style: 'display:flex;gap:4px' },
        h('button', { class: 'icon-btn', type: 'button', title: 'قبل', disabled: i === 0, text: '→', onclick: () => withBusy('لحظة…', async () => { move(p.images, i, -1); await refreshThumb(p); markDirty(); rerender(); }) }),
        h('button', { class: 'icon-btn', type: 'button', title: 'بعد', disabled: i === p.images.length - 1, text: '←', onclick: () => withBusy('لحظة…', async () => { move(p.images, i, 1); await refreshThumb(p); markDirty(); rerender(); }) })),
      i !== 0 ? h('button', { class: 'btn small ghost', type: 'button', text: 'خليها الغلاف', onclick: () => withBusy('بجهّز الغلاف…', async () => { p.images.unshift(...p.images.splice(i, 1)); await refreshThumb(p); markDirty(); rerender(); }) }) : h('span'),
      removeBtn(async () => {
        if (!await confirmBox('مسح الصورة دي؟', '', 'مسح', true)) return;
        await withBusy('لحظة…', async () => { drop(src); p.images.splice(i, 1); if (!p.images.length) { drop(p.thumb); p.thumb = ''; } else await refreshThumb(p); markDirty(); rerender(); });
      })))));

  const services = listEditor(p.services,
    (s, i, del) => h('div', { class: 'li' }, inp(s.ar, v => s.ar = v, { dir: 'rtl', placeholder: 'الخدمة بالعربي' }), inp(s.en, v => s.en = v, { dir: 'ltr', placeholder: 'Service in English' }), removeBtn(del)),
    '+ إضافة خدمة', () => ({ ar: '', en: '' }));
  p.videos ||= [];
  const videos = listEditor(p.videos,
    (v, i, del) => h('div', { class: 'li one' }, inp(v, val => p.videos[i] = val.trim(), { dir: 'ltr', placeholder: 'https://youtu.be/…  أو  https://vimeo.com/…' }), removeBtn(del)),
    '+ إضافة فيديو', () => '');

  return [
    h('div', { class: 'page-head' },
      h('div', {}, h('button', { class: 'link', type: 'button', text: '→ رجوع لكل المشروعات', onclick: () => { S.editing = null; render(); } }),
        h('h2', { text: `${index + 1}. ${p.title.ar || 'مشروع جديد'}` }), h('p', { class: 'hint', text: p.id })),
      h('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' },
        h('a', { class: 'btn small ghost', href: '../project.html?id=' + p.id, target: '_blank', rel: 'noopener', text: 'صفحته على الموقع الحالي' }),
        h('button', { class: 'btn small danger', type: 'button', text: 'مسح المشروع', onclick: async () => {
          if (!await confirmBox(`مسح «${p.title.ar || p.id}» نهائي؟`, 'هيتمسح هو وصوره لما تنشر. لو عاوز تخبيه بس، علّم على «مخفي».', 'مسح', true)) return;
          drop(...p.images, p.thumb); S.projects.splice(index, 1); S.editing = null; markDirty(); render();
        } }))),
    h('div', { class: 'card' }, h('h3', { text: 'البيانات' }),
      pair(arField('اسم المشروع', p.title.ar, v => p.title.ar = v), enField('Project name', p.title.en, v => p.title.en = v)),
      pair(arField('الوصف', p.description.ar, v => p.description.ar = v, { multiline: true }), enField('Description', p.description.en, v => p.description.en = v, { multiline: true })),
      pair(h('label', { class: 'field' }, h('span', { text: 'التصنيف' }), cat),
        h('label', { class: 'check', style: 'margin-top:22px' }, hidden, 'مخفي (مش هيظهر في الموقع)'))),
    h('div', { class: 'card' }, h('div', { class: 'page-head', style: 'margin-bottom:12px' },
      h('div', {}, h('h3', { text: 'الصور', style: 'margin:0' }), h('p', { class: 'hint', text: 'أول صورة هي الغلاف اللي بيظهر في الشبكة. الصور بتتصغر تلقائي لعرض 1600 بكسل.' })),
      h('button', { class: 'btn gold small', type: 'button', text: '+ إضافة صور', onclick: async () => {
        const files = await pickFiles({ multiple: true }); if (!files.length) return;
        await withBusy(`بجهّز ${files.length} صورة…`, async () => { await addProjectImages(p, files); markDirty(); rerender(); });
      } })), p.images.length ? strip : h('p', { class: 'hint', text: 'لسه مفيش صور.' })),
    h('div', { class: 'card' }, h('h3', { text: 'الخدمات اللي قدمناها' }), services),
    h('div', { class: 'card' }, h('h3', { text: 'الفيديوهات' }), h('p', { class: 'hint', style: 'margin-bottom:10px', text: 'ارفع الفيديو على YouTube (Unlisted) أو Vimeo وحط اللينك هنا.' }), videos),
  ];
}

// Services: list, photos, download links.
import { rerender } from '../app.js';
import { h } from '../dom.js';
import { addImage, decodeImage, drop, makeWebp, newPath, pickFiles, slug, withBusy } from '../images.js';
import { S, imgURL, markDirty } from '../state.js';
import { arField, arrows, confirmBox, enField, inp, listEditor, pageHead, pair, removeBtn, toast } from '../ui.js';
import { srcsetPaths } from './hero.js';
import { fromAttr, setElText } from './texts.js';

export function readServices() {
  const doc = S.doc;
  return [...doc.querySelectorAll('.service-list > details')].map(d => {
    const key = d.getAttribute('data-visual');
    const h3 = d.querySelector('h3'), p = d.querySelector('.service-body p'), btn = d.querySelector('.service-request');
    const img = doc.querySelector(`.service-visual img[data-visual="${key}"]`);
    const opt = doc.querySelector(`#service option[value="${key}"]`);
    const t = el => ({ ar: fromAttr(el?.getAttribute('data-ar')), en: fromAttr(el?.getAttribute('data-en')) });
    return {
      key, title: t(h3), text: t(p), button: t(btn), option: opt ? t(opt) : t(h3),
      img: img ? { src: img.getAttribute('src'), srcset: img.getAttribute('srcset') || '', altAr: img.getAttribute('data-ar-alt') || '', altEn: img.getAttribute('data-en-alt') || '' } : null,
      links: [...d.querySelectorAll('a.service-download')].map(a => ({ ar: fromAttr(a.getAttribute('data-ar')), en: fromAttr(a.getAttribute('data-en')), href: a.getAttribute('href') || '' })),
    };
  });
}
export function writeServices(list) {
  const doc = S.doc;
  const mk = (tag, attrs = {}, ar, en) => {
    const el = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (ar !== undefined) setElText(el, ar, en);
    return el;
  };
  const host = doc.querySelector('.service-list');
  host.replaceChildren(doc.createTextNode('\n'));
  list.forEach((sv, i) => {
    const d = mk('details', { name: 'service' });
    if (i === 0) d.setAttribute('open', '');
    d.setAttribute('data-visual', sv.key);
    const sum = mk('summary');
    sum.append(mk('h3', {}, sv.title.ar, sv.title.en), mk('span', { class: 'plus', 'aria-hidden': 'true' }));
    sum.lastChild.textContent = '+';
    const body = mk('div', { class: 'service-body' });
    body.append(mk('p', {}, sv.text.ar, sv.text.en), mk('button', { class: 'service-request', type: 'button', 'data-service': sv.key }, sv.button.ar, sv.button.en));
    sv.links.filter(l => l.href).forEach(l => {
      const file = l.href.startsWith('assets/files/');
      const a = mk('a', file ? { class: 'service-download', href: l.href, download: '' } : { class: 'service-download', href: l.href, target: '_blank', rel: 'noopener' }, l.ar, l.en);
      body.append(a);
    });
    d.append(sum, body);
    host.append(d, doc.createTextNode('\n'));
  });
  // photos beside the list
  const fig = doc.querySelector('.service-visual');
  fig.replaceChildren();
  list.forEach((sv, i) => {
    if (!sv.img) return;
    const img = mk('img', { 'data-visual': sv.key, src: sv.img.src, srcset: sv.img.srcset, sizes: '(max-width:700px) 100vw, 45vw', width: '1200', height: '900', loading: 'lazy', decoding: 'async', alt: sv.img.altAr, 'data-ar-alt': sv.img.altAr, 'data-en-alt': sv.img.altEn });
    if (i === 0) img.setAttribute('class', 'is-active');
    fig.append(img);
  });
  // choices in the contact form (the last "other enquiry" choice stays at the end)
  const sel = doc.getElementById('service');
  if (sel) {
    const keep = [...sel.querySelectorAll('option')].filter(o => !list.some(sv => sv.key === o.value) && !S.serviceKeys.includes(o.value));
    sel.replaceChildren(...list.map(sv => mk('option', { value: sv.key }, sv.option.ar, sv.option.en)), ...keep);
  }
  S.serviceKeys = list.map(sv => sv.key);
  markDirty();
}
export async function uploadFile(file) {
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) throw new Error('الملف لازم يكون PDF.');
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  if (String.fromCharCode(...head) !== '%PDF-') throw new Error('الملف ده مش PDF سليم.');
  if (file.size > S.maxUpload) throw new Error(`الملف حجمه ${(file.size / 1048576).toFixed(1)} ميجا، والسيرفر بيقبل لحد ${(S.maxUpload / 1048576).toFixed(0)} ميجا. صغّره (Export بجودة أقل) أو ارفعه على Google Drive وحط اللينك.`);
  const path = 'assets/files/' + (slug(file.name.replace(/\.pdf$/i, '')) || 'file') + '-' + Date.now().toString(36) + '.pdf';
  S.newImages.set(path, file); S.urls.set(path, URL.createObjectURL(file));
  return path;
}
export function linksEditor(sv, list) {
  return listEditor(sv.links, (l, i, del) => {
    const href = inp(l.href, v => { l.href = v.trim(); writeServices(list); }, { dir: 'ltr', placeholder: 'https://…  أو ارفع ملف PDF' });
    const upBtn = h('button', { class: 'btn small ghost', type: 'button', text: 'رفع PDF', onclick: async () => {
      const [file] = await pickFiles({ accept: 'application/pdf,.pdf' }); if (!file) return;
      await withBusy('بجهّز الملف…', async () => {
        const path = await uploadFile(file);
        if (l.href.startsWith('assets/files/')) drop(l.href);
        l.href = path; href.value = path; writeServices(list); toast('الملف جاهز — هيترفع لما تنشر');
      });
    } });
    return h('div', { class: 'link-item' },
      h('div', { class: 'li' }, inp(l.ar, v => { l.ar = v; writeServices(list); }, { dir: 'rtl', placeholder: 'اسم الزرار بالعربي، مثلًا: حمّل بروفايل الشركة' }),
        inp(l.en, v => { l.en = v; writeServices(list); }, { dir: 'ltr', placeholder: 'Button text, e.g. Download company profile' }),
        removeBtn(() => { if (l.href.startsWith('assets/files/')) drop(l.href); del(); writeServices(list); })),
      h('div', { class: 'li one' }, href, upBtn),
      l.href.startsWith('assets/files/') ? h('p', { class: 'hint', text: S.newImages.has(l.href) ? 'ملف جديد (هيترفع مع النشر)' : 'ملف مرفوع على الموقع: ' + l.href.split('/').pop() }) : null);
  }, '+ إضافة لينك تحميل', () => ({ ar: '', en: '', href: '' }));
}
export async function serviceImage(file, key) {
  const s = await decodeImage(file);
  const big = await makeWebp(s, { cover: [1200, 900] }, 0.8), small = await makeWebp(s, { cover: [640, 480] }, 0.8);
  const p = newPath('services', key), ps = p.replace(/\.webp$/, '-sm.webp');
  addImage(p, big.blob); addImage(ps, small.blob);
  return { src: p, srcset: `${ps} 640w, ${p} 1200w` };
}
export function viewServices() {
  const list = readServices();
  S.serviceKeys = list.map(sv => sv.key);
  const rows = list.map((sv, i) => h('div', { class: 'card' },
    h('div', { class: 'row', style: 'border:0;padding:0;background:none' },
      h('div', {}, h('div', { class: 'thumb service' }, sv.img ? h('img', { src: imgURL(sv.img.src), alt: '' }) : h('p', { class: 'hint', style: 'padding:20px', text: 'لسه مفيش صورة' })),
        h('div', { class: 'photo-actions' }, h('button', { class: 'btn small ghost', type: 'button', text: sv.img ? 'تغيير الصورة' : 'إضافة صورة', onclick: async () => {
          const [file] = await pickFiles(); if (!file) return;
          await withBusy('بجهّز الصورة…', async () => {
            const n = await serviceImage(file, sv.key);
            if (sv.img) drop(sv.img.src, ...srcsetPaths(sv.img.srcset));
            sv.img = { altAr: '', altEn: '', ...(sv.img || {}), ...n };
            writeServices(list); rerender();
          });
        } }))),
      h('div', {},
        pair(arField('اسم الخدمة', sv.title.ar, v => { sv.title.ar = v; writeServices(list); }), enField('Service name', sv.title.en, v => { sv.title.en = v; writeServices(list); })),
        pair(arField('الوصف', sv.text.ar, v => { sv.text.ar = v; writeServices(list); }, { multiline: true }), enField('Description', sv.text.en, v => { sv.text.en = v; writeServices(list); }, { multiline: true })),
        pair(arField('الزرار اللي بيودّي للفورم', sv.button.ar, v => { sv.button.ar = v; writeServices(list); }), enField('Button', sv.button.en, v => { sv.button.en = v; writeServices(list); })),
        pair(arField('اسمها في قائمة فورم التواصل', sv.option.ar, v => { sv.option.ar = v; writeServices(list); }), enField('Name in the contact form', sv.option.en, v => { sv.option.en = v; writeServices(list); })),
        sv.img ? pair(arField('وصف الصورة', sv.img.altAr, v => { sv.img.altAr = v; writeServices(list); }), enField('Photo description', sv.img.altEn, v => { sv.img.altEn = v; writeServices(list); })) : null),
      h('div', { class: 'row-tools' }, h('span', { class: 'num', text: i + 1 }), ...arrows(list, i, () => { writeServices(list); rerender(); }),
        h('button', { class: 'icon-btn danger', type: 'button', title: 'مسح', disabled: list.length < 2, text: '✕', onclick: async () => {
          if (!await confirmBox(`مسح خدمة «${sv.title.ar}»؟`, '', 'مسح', true)) return;
          if (sv.img) drop(sv.img.src, ...srcsetPaths(sv.img.srcset));
          sv.links.forEach(l => l.href.startsWith('assets/files/') && drop(l.href));
          list.splice(i, 1); writeServices(list); rerender();
        } }))),
    h('div', { class: 'links-box' }, h('h3', { text: 'لينكات تحميل تحت الخدمة (اختياري)' }),
      h('p', { class: 'hint', style: 'margin-bottom:10px', text: 'زي بروفايل الشركة أو كتالوج المعدات: ارفع PDF، أو حط لينك (Google Drive مثلًا). بيظهر زرار جنب زرار الخدمة.' }),
      linksEditor(sv, list))));
  return [
    pageHead('الخدمات', 'الخدمات اللي في قسم «حلولنا» بالترتيب ده: الاسم والوصف والصورة اللي جنبها ولينكات التحميل. الصورة بتتقص تلقائي على 4:3.',
      h('button', { class: 'btn gold', type: 'button', text: '+ إضافة خدمة', onclick: async () => {
        const [file] = await pickFiles(); if (!file) { toast('اختار صورة للخدمة الأول'); return; }
        await withBusy('بجهّز الصورة…', async () => {
          let key = 'service-' + Date.now().toString(36);
          const img = await serviceImage(file, key);
          list.push({ key, title: { ar: '', en: '' }, text: { ar: '', en: '' }, button: { ar: 'تواصل معنا', en: 'Get in touch' }, option: { ar: '', en: '' }, img: { altAr: '', altEn: '', ...img }, links: [] });
          writeServices(list); rerender(); scrollTo(0, document.body.scrollHeight); toast('اتضافت في الآخر — اكتب اسمها ووصفها');
        });
      } })),
    h('div', { class: 'rows' }, rows),
  ];
}

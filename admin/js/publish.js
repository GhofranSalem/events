// Checks, preview and publishing.
import { api, hooks } from './api.js';
import { $, h } from './dom.js';
import { S, changes, outputs } from './state.js';
import { closeDialog, dialog, toast } from './ui.js';
import { readClients } from './views/clients.js';
import { readSlides } from './views/hero.js';
import { readServices } from './views/services.js';

export function problems() {
  const list = [];
  readSlides().forEach((sl, i) => {
    if (!sl.altAr || !sl.altEn) list.push(`الهيرو: الصورة رقم ${i + 1} ناقصها الوصف بالعربي أو الإنجليزي.`);
    if (sl.project && !S.projects.some(p => p.id === sl.project)) list.push(`الهيرو: الصورة رقم ${i + 1} مربوطة بمشروع اتمسح — اختار مشروع تاني أو «بدون».`);
  });
  S.team.forEach((m, i) => { if (!m.name.ar || !m.name.en || !m.role.ar || !m.role.en) list.push(`فريق العمل: الشخص رقم ${i + 1} ناقصه اسم أو وظيفة.`); });
  S.projects.forEach((p, i) => {
    if (!p.title.ar || !p.title.en) list.push(`المشروع رقم ${i + 1}: ناقصه الاسم بالعربي أو الإنجليزي.`);
    if (!p.images.length && !p.hidden) list.push(`المشروع رقم ${i + 1}: مفيهوش صور (ضيف صور أو خليه مخفي).`);
    (p.videos || []).forEach(v => { if (v && !/^https:\/\/(www\.)?(youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com)\//.test(v)) list.push(`المشروع رقم ${i + 1}: لينك الفيديو لازم يكون YouTube أو Vimeo.`); });
  });
  readServices().forEach((sv, i) => {
    const n = `الخدمات: الخدمة رقم ${i + 1}`;
    if (!sv.title.ar || !sv.title.en) list.push(`${n} ناقصها الاسم بالعربي أو الإنجليزي.`);
    if (!sv.option.ar || !sv.option.en) list.push(`${n} ناقصها اسمها في فورم التواصل.`);
    if (!sv.img) list.push(`${n} مفيهاش صورة.`);
    sv.links.forEach(l => { if (!l.href || !l.ar || !l.en) list.push(`${n}: لينك التحميل ناقصه الاسم أو اللينك (أو امسحه).`); else if (!/^(https:\/\/|assets\/files\/)/.test(l.href)) list.push(`${n}: لينك التحميل لازم يبدأ بـ https://`); });
  });
  readClients().forEach((c, i) => { if (!c.altAr || !c.altEn) list.push(`العملاء: اللوجو رقم ${i + 1} ناقصه الاسم.`); });
  if (!/^\d{9,15}$/.test(S.phone)) list.push('التواصل: رقم الواتساب مش مظبوط.');
  if (!/^\S+@\S+\.\S+$/.test(S.email)) list.push('التواصل: الإيميل مش مظبوط.');
  return list;
}
export function cleanBeforeSave() {
  S.projects.forEach(p => { p.videos = (p.videos || []).filter(Boolean); p.services = p.services.filter(s => s.ar || s.en); });
}

export function previewHTML() {
  cleanBeforeSave();
  const o = outputs();
  const swap = s => { for (const [p, u] of S.urls) s = s.split(p).join(u); return s; };
  const js = path => URL.createObjectURL(new Blob([swap(o[path])], { type: 'text/javascript' }));
  let html = swap(o['index.html']);
  for (const p of ['js/team-data.js', 'js/projects-data.js', 'js/app.js', 'js/portfolio.js']) html = html.replace(`src="${p}"`, `src="${js(p)}"`);
  return html.replace('<head>', `<head><base href="${location.origin}/">`);
}
export function openPreview() {
  const list = problems();
  $('#preview-frame').srcdoc = previewHTML();
  $('#preview').hidden = false;
  document.body.style.overflow = 'hidden';
  if (list.length) toast('في حاجات ناقصة لازم تتظبط قبل النشر');
}
export function closePreview() { $('#preview').hidden = true; document.body.style.overflow = ''; $('#preview-frame').srcdoc = ''; }

export const FILE_NAMES = { 'index.html': 'الصفحة الرئيسية (نصوص، هيرو، عملاء، خدمات)', 'project.html': 'صفحة المشروع', 'js/team-data.js': 'فريق العمل', 'js/projects-data.js': 'المشروعات', 'js/app.js': 'رقم الواتساب', 'js/portfolio.js': 'رقم الواتساب في صفحات المشروعات' };
export function b64(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); }); }
export async function publish() {
  closePreview();
  const list = problems();
  if (list.length) {
    dialog(h('h3', { text: 'ظبّط الحاجات دي الأول' }), h('ul', {}, list.map(t => h('li', { text: t }))), h('div', { class: 'actions' }, h('button', { class: 'btn gold', type: 'button', onclick: closeDialog, text: 'تمام' })));
    return;
  }
  cleanBeforeSave();
  const c = changes();
  if (!c.files.length && !c.images.length && !c.deletes.length) { toast('مفيش تعديلات'); return; }
  const note = h('input', { placeholder: 'مثلًا: إضافة مشروع فعالية الدرعية' });
  const ok = await new Promise(resolve => {
    dialog(h('h3', { text: 'نشر التعديلات على الموقع؟' }),
      h('ul', {}, c.files.map(f => h('li', { text: FILE_NAMES[f.path] || f.path })),
        c.images.length ? h('li', { text: `${c.images.length} صورة/ملف جديد` }) : null,
        c.deletes.length ? h('li', { text: `${c.deletes.length} صورة قديمة هتتمسح` }) : null),
      h('label', { class: 'field' }, h('span', { text: 'وصف قصير للتعديل (اختياري)' }), note),
      h('div', { class: 'actions' },
        h('button', { class: 'btn gold', type: 'button', text: 'نشر', onclick: () => resolve(true) }),
        h('button', { class: 'btn ghost', type: 'button', text: 'رجوع', onclick: () => resolve(false) })));
  });
  if (!ok) { closeDialog(); return; }

  const steps = [['img', c.images.length ? `رفع الصور (0 من ${c.images.length})` : 'مفيش صور جديدة'], ['commit', 'حفظ التعديلات في GitHub'], ['deploy', 'رفعها على vevents.sa'], ['done', 'خلصنا']];
  const nodes = {};
  const stepsBox = h('div', { class: 'steps' }, steps.map(([k, t]) => { const st = h('span', { class: 'st' }), tx = h('span', { text: t }); nodes[k] = { st, tx }; return h('div', {}, st, tx); }));
  const msg = h('p', { class: 'hint', style: 'margin-top:12px' });
  const actions = h('div', { class: 'actions' });
  dialog(h('h3', { text: 'جاري النشر…' }), stepsBox, msg, actions);
  const set = (k, state, text) => { nodes[k].st.className = 'st ' + state; nodes[k].st.textContent = state === 'ok' ? '✓' : state === 'err' ? '!' : ''; if (text) nodes[k].tx.textContent = text; };
  const finish = (title, text, buttons) => { $('#dialog-body h3').textContent = title; msg.textContent = text; actions.replaceChildren(...buttons); };
  const closeBtn = h('button', { class: 'btn gold', type: 'button', text: 'تمام', onclick: closeDialog });

  try {
    set('img', 'run');
    const shas = {};
    let n = 0;
    for (const p of c.images) {
      shas[p] = (await api('blob', { content: await b64(S.newImages.get(p)) })).sha;
      set('img', 'run', `رفع الصور (${++n} من ${c.images.length})`);
    }
    set('img', 'ok');
    set('commit', 'run');
    const area = [...new Set(c.files.map(f => FILE_NAMES[f.path] ? f.path.replace(/^js\/|\.(js|html)$/g, '') : f.path))].join(', ');
    const message = (note.value.trim() || 'update ' + (area || 'images')).slice(0, 180);
    const payload = [...c.files.map(f => ({ path: f.path, text: f.text })), ...c.images.map(p => ({ path: p, blob: shas[p] })), ...c.deletes.map(p => ({ path: p, delete: true }))];
    const { commit } = await api('commit', { base: S.head, changes: payload, message });
    set('commit', 'ok');
    // saved: start fresh from the new version (the edits are now part of it)
    S.isDirty = false;
    set('deploy', 'run');
    let status = 'queued', conclusion = null;
    for (let i = 0; i < 72 && status !== 'completed'; i++) {
      await new Promise(r => setTimeout(r, 5000));
      try { ({ status, conclusion } = await api('runs', { sha: commit })); } catch { /* keep waiting */ }
      if (status === 'unknown') break;
    }
    const reload = async () => { closeDialog(); await hooks.reload(); toast('اتحمّلت آخر نسخة'); };
    if (status === 'completed' && conclusion === 'success') {
      set('deploy', 'ok'); set('done', 'ok');
      finish('اتنشر ✅', 'التعديلات بقت على vevents.sa. لو لسه شايف النسخة القديمة اعمل تحديث للصفحة (أو Clear Cache من cPanel).',
        [h('a', { class: 'btn gold', href: '../', target: '_blank', rel: 'noopener', text: 'افتح الموقع' }), h('button', { class: 'btn ghost', type: 'button', text: 'كمّل تعديل', onclick: reload })]);
    } else if (status === 'completed') {
      set('deploy', 'err');
      finish('اتحفظ بس الرفع على الموقع فشل', 'التعديلات محفوظة في GitHub، بس رفعها على الاستضافة فشل. افتح GitHub ← Actions وشوف السبب، أو جرّب تشغّله تاني من هناك.', [h('button', { class: 'btn gold', type: 'button', text: 'تمام', onclick: reload })]);
    } else {
      set('deploy', 'run');
      finish('اتحفظ ✅', 'التعديلات اتحفظت وهتنزل على الموقع خلال دقيقة أو اتنين.', [h('button', { class: 'btn gold', type: 'button', text: 'تمام', onclick: reload })]);
    }
  } catch (e) {
    const k = Object.keys(nodes).find(k => nodes[k].st.classList.contains('run')) || 'commit';
    set(k, 'err');
    if (e.code === 'conflict') {
      finish('مقدرتش أنشر', e.message + ' تعديلاتك اللي هنا هتضيع، فاكتبها في حتة الأول لو محتاجها.',
        [h('button', { class: 'btn gold', type: 'button', text: 'حمّل آخر نسخة', onclick: async () => { closeDialog(); S.isDirty = false; await hooks.reload(); } }), h('button', { class: 'btn ghost', type: 'button', text: 'رجوع', onclick: closeDialog })]);
    } else finish('حصلت مشكلة', e.message + (e.detail ? ` (${e.detail})` : '') + ' — تعديلاتك لسه موجودة هنا، جرب تنشر تاني.', [closeBtn]);
  }
}

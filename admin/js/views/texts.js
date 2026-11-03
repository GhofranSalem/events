// «كل النصوص»: every data-ar / data-en text in index.html.
import { $, h } from '../dom.js';
import { S } from '../state.js';
import { arField, enField, pageHead, pair } from '../ui.js';

export const fromAttr = v => (v || '').replace(/\\n/g, '\n');
export const toAttr = v => v.replace(/\r/g, '').replace(/\n/g, '\\n');
export function setElText(el, ar, en) {
  el.setAttribute('data-ar', toAttr(ar));
  el.setAttribute('data-en', toAttr(en));
  el.replaceChildren();
  ar.split('\n').forEach((line, i) => { if (i) el.append(el.ownerDocument.createElement('br')); el.append(el.ownerDocument.createTextNode(line)); });
}
export const GROUPS = [
  ['header', 'الهيدر والقائمة'], ['#hero', 'الهيرو (أول الصفحة)'], ['.ribbon', 'الشريط الذهبي المتحرك'], ['#about', 'عن رؤية الفعاليات'],
  ['#services', 'حلولنا (الخدمات)'], ['#work', 'أعمالنا'], ['#clients', 'العملاء'], ['#team', 'فريق العمل'], ['#contact', 'تواصل معنا'], ['footer', 'الفوتر'],
];
export function describe(el) {
  if (el.matches('.skip')) return 'رابط مخفي (بيظهر بس لمستخدمي الكيبورد وقارئ الشاشة)';
  if (el.closest('h1')) return el.tagName === 'EM' ? 'العنوان الرئيسي — السطر التاني (ذهبي) — بيتكتب' : 'العنوان الرئيسي — السطر الأول — بيتكتب';
  if (el.closest('nav')) return 'رابط في القائمة';
  if (el.closest('.ribbon')) return 'كلمة في الشريط';
  if (el.matches('.eyebrow')) return 'عنوان صغير فوق';
  if (el.tagName === 'H2') return 'عنوان القسم';
  if (el.tagName === 'H3') return 'عنوان';
  if (el.tagName === 'P') return 'فقرة';
  if (el.tagName === 'LABEL') return 'اسم حقل في الفورم';
  if (el.tagName === 'OPTION') return 'اختيار في قائمة الخدمات';
  if (el.closest('a,button')) return 'زرار / لينك';
  return 'نص';
}
export function textItems() {
  const doc = S.doc, items = [];
  const ribbonSets = [...doc.querySelectorAll('.ribbon-set')];
  doc.querySelectorAll('[data-ar]').forEach(el => {
    if (ribbonSets.length > 1 && el.closest('.ribbon-set') && el.closest('.ribbon-set') !== ribbonSets[0]) return;
    if (el.closest('.service-list') || (el.matches('#service option') && el.value !== 'other')) return; // edited in the Services tab
    const group = (GROUPS.find(([sel]) => el.closest(sel)) || [null, 'إمكانية الوصول'])[1];
    items.push({ group, label: describe(el), el, kind: 'text' });
  });
  doc.querySelectorAll('[data-ar-placeholder]').forEach(el => {
    const group = (GROUPS.find(([sel]) => el.closest(sel)) || [null, 'عام'])[1];
    items.push({ group, label: 'النص الرمادي جوه الحقل', el, kind: 'placeholder' });
  });
  return items;
}
export function textItemEditor(item) {
  const { el, kind } = item;
  if (kind === 'placeholder') {
    let ar = el.getAttribute('data-ar-placeholder'), en = el.getAttribute('data-en-placeholder');
    const set = () => { el.setAttribute('data-ar-placeholder', ar); el.setAttribute('data-en-placeholder', en); el.setAttribute('placeholder', ar); };
    return h('div', { class: 'titem' }, h('div', { class: 'titem-label', text: item.label }),
      pair(arField('النص', ar, v => { ar = v; set(); }), enField('Text', en, v => { en = v; set(); })));
  }
  let ar = fromAttr(el.getAttribute('data-ar')), en = fromAttr(el.getAttribute('data-en'));
  const multiline = ['P', 'H2'].includes(el.tagName) || ar.includes('\n');
  const apply = () => {
    setElText(el, ar, en);
    // the gold ribbon repeats its words: keep every copy the same
    const set = el.closest('.ribbon-set');
    if (set) {
      const idx = [...set.querySelectorAll('[data-ar]')].indexOf(el);
      S.doc.querySelectorAll('.ribbon-set').forEach(s => { const twin = s.querySelectorAll('[data-ar]')[idx]; if (twin && twin !== el) setElText(twin, ar, en); });
    }
  };
  return h('div', { class: 'titem' },
    h('div', { class: 'titem-label' }, item.label, multiline && el.tagName === 'H2' ? h('small', { text: '  (Enter = سطر جديد)' }) : null),
    pair(arField('النص', ar, v => { ar = v; apply(); }, { multiline }), enField('Text', en, v => { en = v; apply(); }, { multiline })));
}
export function pageMetaEditor() {
  const root = S.doc.documentElement;
  const get = k => root.getAttribute(k) || '';
  const set = (k, v) => {
    root.setAttribute(k, v);
    if (k === 'data-title-ar') S.doc.querySelector('title').textContent = v;
    if (k === 'data-description-ar') S.doc.querySelector('meta[name=description]')?.setAttribute('content', v);
  };
  return h('div', { class: 'tgroup' }, h('h3', { text: 'عنوان الصفحة في جوجل والتاب' }),
    h('div', { class: 'titem' }, h('div', { class: 'titem-label', text: 'العنوان (Title)' }),
      pair(arField('العنوان', get('data-title-ar'), v => set('data-title-ar', v)), enField('Title', get('data-title-en'), v => set('data-title-en', v)))),
    h('div', { class: 'titem' }, h('div', { class: 'titem-label', text: 'الوصف اللي بيظهر في نتايج البحث' }),
      pair(arField('الوصف', get('data-description-ar'), v => set('data-description-ar', v), { multiline: true }),
        enField('Description', get('data-description-en'), v => set('data-description-en', v), { multiline: true }))));
}
export function viewTexts() {
  const items = textItems();
  const q = S.filter.trim().toLowerCase();
  const shown = q ? items.filter(it => {
    const a = it.kind === 'text' ? it.el.getAttribute('data-ar') + ' ' + it.el.getAttribute('data-en') : it.el.getAttribute('data-ar-placeholder') + ' ' + it.el.getAttribute('data-en-placeholder');
    return a.toLowerCase().includes(q) || it.group.includes(q);
  }) : items;
  const search = h('input', { class: 'search', type: 'search', placeholder: 'دوّر على نص…' });
  search.value = S.filter;
  const body = h('div', {});
  search.addEventListener('input', () => { S.filter = search.value; const r = viewTexts(); $('#view').replaceChildren(...r); const s = $('#view .search'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); });
  const groups = new Map();
  shown.forEach(it => { if (!groups.has(it.group)) groups.set(it.group, []); groups.get(it.group).push(it); });
  groups.forEach((list, name) => body.append(h('div', { class: 'tgroup' }, h('h3', { text: name }), list.map(textItemEditor))));
  return [pageHead('كل نصوص الصفحة الرئيسية', 'كل نص في الصفحة بالعربي والإنجليزي، بنفس ترتيبه في الموقع. أسماء الفريق والمشروعات والعملاء ليهم تبويبات لوحدهم.', search),
    q ? null : pageMetaEditor(), body, shown.length ? null : h('p', { class: 'hint', text: 'مفيش نص بالكلام ده.' })];
}

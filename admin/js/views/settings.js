// WhatsApp number, email, map link.
import { h } from '../dom.js';
import { S } from '../state.js';
import { field, pageHead } from '../ui.js';

export function applyContact() {
  const doc = S.doc;
  doc.querySelectorAll('a[href^="mailto:"]').forEach(a => {
    a.setAttribute('href', 'mailto:' + S.email);
    const t = [...a.childNodes].find(n => n.nodeType === 3 && n.data.includes('@'));
    if (t) t.data = t.data.replace(/\S+@\S+/, S.email);
  });
  doc.querySelectorAll('a.map-link, a.footer-address').forEach(a => a.setAttribute('href', S.map));
}
export function viewSettings() {
  const phone = field('رقم الواتساب (بكود الدولة ومن غير + أو مسافات)', S.phone, v => { S.phone = v.replace(/\D/g, ''); }, { dir: 'ltr', placeholder: '9665XXXXXXXX', type: 'tel' });
  return [
    pageHead('التواصل', 'الرقم ده بيستقبل رسايل فورم «تواصل معنا» وزرار الواتساب في صفحات المشروعات. مش بيظهر في الموقع.'),
    h('div', { class: 'card' }, phone,
      field('الإيميل', S.email, v => { S.email = v.trim(); applyContact(); }, { dir: 'ltr', type: 'email' }),
      field('لينك اللوكيشن على جوجل ماب', S.map, v => { S.map = v.trim(); applyContact(); }, { dir: 'ltr', type: 'url' }),
      h('p', { class: 'hint', text: 'نص العنوان نفسه («المملكة العربية السعودية - الرياض …») بيتعدل من «كل النصوص» ← تواصل معنا / الفوتر.' })),
  ];
}

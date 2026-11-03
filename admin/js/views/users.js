// Accounts and passwords.
import { api } from '../api.js';
import { h } from '../dom.js';
import { withBusy } from '../images.js';
import { S } from '../state.js';
import { closeDialog, confirmBox, dialog, pageHead, toast } from '../ui.js';

export function passwordInput(placeholder) { return h('input', { type: 'password', dir: 'ltr', autocomplete: 'new-password', placeholder, minlength: 8 }); }
export function viewUsers() {
  const box = h('div', { class: 'rows' }, h('p', { class: 'hint', text: 'بحمّل…' }));
  const draw = list => box.replaceChildren(...list.map(u => h('div', { class: 'row', style: 'grid-template-columns:1fr auto;align-items:center' },
    h('div', {}, h('strong', { text: u.name, dir: 'ltr' }),
      u.owner ? h('span', { class: 'pill', text: 'أساسي' }) : u.admin ? h('span', { class: 'pill', text: 'بيضيف مستخدمين' }) : h('span', { class: 'pill off', text: 'تعديل ونشر بس' }),
      u.name === S.user ? h('span', { class: 'pill', text: 'إنت' }) : null),
    h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
      u.owner || u.name === S.user ? null : h('button', { class: 'btn small ghost', type: 'button', text: 'تعديل', onclick: () => userDialog(u, draw) }),
      u.owner || u.name === S.user ? null : h('button', { class: 'btn small danger', type: 'button', text: 'مسح', onclick: async () => {
        if (!await confirmBox(`مسح حساب ${u.name}؟`, 'مش هيقدر يدخل الداش بورد تاني.', 'مسح', true)) return;
        await withBusy('لحظة…', async () => { draw((await api('user_delete', { name: u.name })).users); toast('اتمسح'); });
      } })))));
  api('users').then(r => draw(r.users)).catch(e => box.replaceChildren(h('p', { class: 'error', text: e.message })));
  return [
    pageHead('المستخدمين', 'مين يقدر يدخل لوحة التحكم. كل واحد ليه اسم وكلمة مرور خاصين بيه، وكل نشر بيتسجل باسمه.',
      h('button', { class: 'btn gold', type: 'button', text: '+ مستخدم جديد', onclick: () => userDialog(null, draw) })),
    h('div', { class: 'note', text: 'الحسابات «الأساسية» جاية من GitHub ومينفعش تتمسح من هنا، عشان محدش يقفل الباب على الكل بالغلط.' }),
    box,
  ];
}
export function userDialog(u, draw) {
  const name = h('input', { dir: 'ltr', autocomplete: 'off', placeholder: 'مثلًا: ahmed' });
  if (u) { name.value = u.name; name.disabled = true; }
  const pass = passwordInput(u ? 'سيبها فاضية لو مش هتغيرها' : '8 حروف أو أرقام على الأقل');
  const admin = h('input', { type: 'checkbox' }); admin.checked = !!u?.admin;
  const err = h('p', { class: 'error', style: 'text-align:start' });
  const save = async () => {
    err.textContent = '';
    try { draw((await api('user_save', { name: name.value, pass: pass.value, admin: admin.checked })).users); closeDialog(); toast(u ? 'اتحفظ' : 'اتضاف — ابعتله الاسم وكلمة المرور'); }
    catch (e) { err.textContent = e.message; }
  };
  dialog(h('h3', { text: u ? `تعديل ${u.name}` : 'مستخدم جديد' }),
    h('label', { class: 'field' }, h('span', { text: 'اسم المستخدم (إنجليزي صغير من غير مسافات)' }), name),
    h('label', { class: 'field' }, h('span', { text: u ? 'كلمة مرور جديدة' : 'كلمة المرور' }), pass),
    h('label', { class: 'check' }, admin, 'يقدر يضيف ويمسح مستخدمين'),
    err,
    h('div', { class: 'actions' }, h('button', { class: 'btn gold', type: 'button', text: 'حفظ', onclick: save }), h('button', { class: 'btn ghost', type: 'button', text: 'رجوع', onclick: closeDialog })));
  (u ? pass : name).focus();
}
export function changePasswordDialog() {
  const cur = h('input', { type: 'password', dir: 'ltr', autocomplete: 'current-password' });
  const nw = passwordInput('8 حروف أو أرقام على الأقل');
  const err = h('p', { class: 'error', style: 'text-align:start' });
  dialog(h('h3', { text: 'تغيير كلمة المرور' }),
    h('label', { class: 'field' }, h('span', { text: 'كلمة المرور الحالية' }), cur),
    h('label', { class: 'field' }, h('span', { text: 'كلمة المرور الجديدة' }), nw), err,
    h('div', { class: 'actions' },
      h('button', { class: 'btn gold', type: 'button', text: 'حفظ', onclick: async () => {
        err.textContent = '';
        try { await api('password', { current: cur.value, new: nw.value }); closeDialog(); toast('اتغيرت كلمة المرور'); } catch (e) { err.textContent = e.message; }
      } }),
      h('button', { class: 'btn ghost', type: 'button', text: 'رجوع', onclick: closeDialog })));
  cur.focus();
}

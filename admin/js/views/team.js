// Team members.
import { rerender } from '../app.js';
import { h } from '../dom.js';
import { addImage, decodeImage, drop, makeWebp, newPath, pickFiles, withBusy } from '../images.js';
import { S, imgURL, markDirty } from '../state.js';
import { arField, arrows, confirmBox, enField, pageHead, pair, toast } from '../ui.js';

export async function makeTeamPhoto(file, name) {
  const src = await decodeImage(file);
  const big = await makeWebp(src, { cover: [1000, 1250] }, 0.85);
  const small = await makeWebp(src, { cover: [500, 625] }, 0.85);
  const p = newPath('team', name || file.name.replace(/\.[^.]+$/, ''));
  const ps = p.replace(/\.webp$/, '-sm.webp');
  addImage(p, big.blob); addImage(ps, small.blob);
  return { photo: p, photoSmall: ps };
}
export function viewTeam() {
  const rows = S.team.map((m, i) => h('div', { class: 'row' },
    h('div', {}, h('div', { class: 'thumb team' }, h('img', { src: imgURL(m.photo), alt: '' })),
      h('div', { class: 'photo-actions' }, h('button', { class: 'btn small ghost', type: 'button', text: 'تغيير الصورة', onclick: async () => {
        const [file] = await pickFiles(); if (!file) return;
        await withBusy('بجهّز الصورة…', async () => { const ph = await makeTeamPhoto(file, m.name.en); drop(m.photo, m.photoSmall); Object.assign(m, ph); markDirty(); rerender(); });
      } }))),
    h('div', {},
      pair(arField('الاسم', m.name.ar, v => m.name.ar = v), enField('Name', m.name.en, v => m.name.en = v)),
      pair(arField('الوظيفة', m.role.ar, v => m.role.ar = v), enField('Job title', m.role.en, v => m.role.en = v))),
    h('div', { class: 'row-tools' }, h('span', { class: 'num', text: i + 1 }), ...arrows(S.team, i, rerender),
      h('button', { class: 'icon-btn danger', type: 'button', title: 'مسح', text: '✕', onclick: async () => {
        if (!await confirmBox(`مسح ${m.name.ar || 'الشخص ده'} من الفريق؟`, '', 'مسح', true)) return;
        drop(m.photo, m.photoSmall); S.team.splice(i, 1); markDirty(); rerender();
      } }))));
  return [
    pageHead('فريق العمل', 'الترتيب هنا = الترتيب في الموقع. الأول بيظهر في النص والباقي بيلف حواليه.',
      h('button', { class: 'btn gold', type: 'button', text: '+ إضافة شخص', onclick: async () => {
        const [file] = await pickFiles(); if (!file) return;
        await withBusy('بجهّز الصورة…', async () => {
          const ph = await makeTeamPhoto(file, file.name.replace(/\.[^.]+$/, ''));
          S.team.push({ name: { ar: '', en: '' }, role: { ar: '', en: '' }, ...ph }); markDirty(); rerender();
          scrollTo(0, document.body.scrollHeight); toast('اتضاف في الآخر — اكتب الاسم والوظيفة');
        });
      } })),
    h('div', { class: 'note', text: 'الصور لازم تكون مقصوصة من غير خلفية (PNG شفاف)، والشخص واقف في نص الصورة، وراسه في نفس مكان وحجم الباقيين. الصورة بتتظبط تلقائي على مقاس 4:5.' }),
    h('div', { class: 'rows' }, rows),
  ];
}

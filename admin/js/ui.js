// Small reusable UI pieces: dialogs, fields, lists.
import { $, h } from './dom.js';
import { markDirty } from './state.js';

export function busy(text) { $('#loading').hidden = !text; if (text) $('#loading-text').textContent = text; }
export function toast(text) { const t = $('#toast'); t.textContent = text; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2600); }
export function dialog(...content) { $('#dialog-body').replaceChildren(...content); $('#dialog').hidden = false; }
export function closeDialog() { $('#dialog').hidden = true; }
export function alertBox(title, text) { dialog(h('h3', { text: title }), h('p', { text }), h('div', { class: 'actions' }, h('button', { class: 'btn gold', type: 'button', onclick: closeDialog, text: 'تمام' }))); }
export function confirmBox(title, text, okText = 'تأكيد', danger = false) {
  return new Promise(resolve => {
    const done = v => { closeDialog(); resolve(v); };
    dialog(h('h3', { text: title }), text ? h('p', { text }) : null,
      h('div', { class: 'actions' },
        h('button', { class: 'btn ' + (danger ? 'danger' : 'gold'), type: 'button', onclick: () => done(true), text: okText }),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => done(false), text: 'رجوع' })));
  });
}
export function field(label, value, onInput, { multiline = false, dir, placeholder, type } = {}) {
  const input = multiline
    ? h('textarea', { rows: Math.min(6, Math.max(2, Math.ceil((value || '').length / 70) + (value || '').split('\n').length - 1)), dir, placeholder })
    : h('input', { type: type || 'text', dir, placeholder });
  input.value = value ?? '';
  input.addEventListener('input', () => { onInput(input.value); markDirty(); });
  return h('label', { class: 'field' }, h('span', { text: label }), input);
}
export const pair = (a, b) => h('div', { class: 'pair' }, a, b);
export const arField = (label, v, on, o = {}) => field(label + ' — عربي', v, on, { ...o, dir: 'rtl' });
export const enField = (label, v, on, o = {}) => field(label + ' — English', v, on, { ...o, dir: 'ltr' });
export function move(arr, i, d) { const j = i + d; if (j < 0 || j >= arr.length) return false; [arr[i], arr[j]] = [arr[j], arr[i]]; return true; }
export function arrows(arr, i, after) {
  return [
    h('button', { class: 'icon-btn', type: 'button', title: 'لفوق', disabled: i === 0, onclick: () => { move(arr, i, -1) && (after(), markDirty()); }, text: '↑' }),
    h('button', { class: 'icon-btn', type: 'button', title: 'لتحت', disabled: i === arr.length - 1, onclick: () => { move(arr, i, 1) && (after(), markDirty()); }, text: '↓' }),
  ];
}
export function pageHead(title, text, ...extra) { return h('div', { class: 'page-head' }, h('div', {}, h('h2', { text: title }), text ? h('p', { text }) : null), ...extra); }


export function listEditor(items, makeRow, addLabel, blank, after) {
  const wrap = h('div', { class: 'list-edit' });
  const draw = () => {
    wrap.replaceChildren(...items.map((it, i) => makeRow(it, i, () => { items.splice(i, 1); markDirty(); draw(); after?.(); })),
      h('div', {}, h('button', { class: 'btn small ghost', type: 'button', text: addLabel, onclick: () => {
        items.push(blank()); markDirty(); draw();
        const last = wrap.querySelectorAll('.li');
        last[last.length - 1]?.querySelector('input')?.focus();
      } })));
  };
  draw();
  return wrap;
}
export const inp = (value, on, attrs = {}) => { const i = h('input', attrs); i.value = value || ''; i.addEventListener('input', () => { on(i.value); markDirty(); }); return i; };
export const removeBtn = fn => h('button', { class: 'icon-btn danger', type: 'button', title: 'مسح', text: '✕', onclick: fn });

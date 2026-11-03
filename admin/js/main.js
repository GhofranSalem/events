// Vision Events dashboard: entry point (login, loading, top bar buttons).
// Loads the site files from GitHub (through api.php), lets you edit texts, hero, team, projects, clients,
// services and contact settings, shows a preview of the exact files that will be published,
// then saves everything as one commit. The deploy workflow uploads that commit to vevents.sa.
import { api, hooks } from './api.js';
import { render, renderTabs } from './app.js';
import { $ } from './dom.js';
import { closePreview, openPreview, publish } from './publish.js';
import { S, parseAll, updateDirty } from './state.js';
import { alertBox, busy, closeDialog, confirmBox } from './ui.js';
import { changePasswordDialog } from './views/users.js';

function showLogin(message) {
  closePreview(); closeDialog(); busy(false);
  $('#app').hidden = true; $('#login-view').hidden = false;
  // the session ended in the middle of editing: the edits stay here until they log in again
  $('#login-error').textContent = message
    ? message + (S.isDirty ? ' تعديلاتك لسه محفوظة هنا.' : '')
    : '';
  $('#login-user').focus();
}

function showApp() {
  $('#who').textContent = S.user;
  $('#login-view').hidden = true; $('#app').hidden = false;
  renderTabs(); render(); updateDirty();
}

async function load() {
  busy('بحمّل آخر نسخة من الموقع…');
  try {
    const r = await api('load');
    S.head = r.head; S.user = r.user; S.admin = !!r.admin; S.maxUpload = r.maxUpload || 8 << 20;
    parseAll(r.files);
    showApp();
  } catch (e) {
    if (e.code !== 'login_required') alertBox('مقدرتش أحمّل الموقع', e.message + (e.detail ? ` (${e.detail})` : ''));
  } finally { busy(false); }
}

hooks.onLoginRequired = showLogin;
hooks.reload = load;

$('#login-form').addEventListener('submit', async e => {
  e.preventDefault();
  $('#login-error').textContent = '';
  busy('بدخّلك…');
  try {
    const r = await api('login', { user: $('#login-user').value, pass: $('#login-pass').value });
    $('#login-pass').value = '';
    if (S.doc && S.isDirty) { S.user = r.user; S.admin = !!r.admin; busy(false); showApp(); } // carry on with the unsaved edits
    else await load();
  } catch (err) { busy(false); $('#login-error').textContent = err.message; }
});
$('#btn-logout').addEventListener('click', async () => {
  if (S.isDirty && !await confirmBox('تخرج من غير ما تنشر؟', 'التعديلات اللي متنشرتش هتضيع.', 'خروج', true)) return;
  S.isDirty = false;
  try { await api('logout'); } catch { /* already logged out */ }
  location.reload();
});
$('#btn-discard').addEventListener('click', async () => {
  if (!await confirmBox('إلغاء كل التعديلات اللي متنشرتش؟', 'هرجع لآخر نسخة منشورة.', 'إلغاء التعديلات', true)) return;
  S.isDirty = false; S.editing = null; await load();
});
$('#btn-password').addEventListener('click', changePasswordDialog);
$('#btn-preview').addEventListener('click', openPreview);
$('#btn-publish').addEventListener('click', publish);
$('#preview-close').addEventListener('click', closePreview);
$('#preview-publish').addEventListener('click', publish);
document.querySelectorAll('#preview .seg button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('#preview .seg button').forEach(x => x.classList.toggle('on', x === b));
  $('#preview-frame').style.width = b.dataset.w + 'px';
}));
addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#preview').hidden) closePreview(); });

(async () => {
  try { await api('session'); await load(); }
  catch (e) { showLogin(e.code === 'login_required' ? '' : e.message); }
})();

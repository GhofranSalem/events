// Vision Events dashboard.
// Loads the site files from GitHub (through api.php), lets you edit texts, hero, team, projects, clients,
// services photos and contact settings, shows a preview of the exact files that will be published,
// then saves everything as one commit. The deploy workflow uploads that commit to vevents.sa.

const $ = (s, r = document) => r.querySelector(s);
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid);
  return el;
}

// ---------------------------------------------------------------- API
const ERRORS = {
  wrong_login: 'اسم المستخدم أو كلمة المرور غلط.',
  too_many_attempts: 'محاولات كتير غلط. استنى ربع ساعة وجرب تاني.',
  login_required: 'انتهت الجلسة، ادخل تاني.',
  not_configured: 'لوحة التحكم لسه متجهزتش: محتاج تضيف ADMIN_USERS و ADMIN_GITHUB_TOKEN في GitHub.',
  conflict: 'في حد تاني نشر تعديلات بعد ما فتحت الصفحة. لازم تحمّل آخر نسخة الأول.',
  github_token: 'مشكلة في توكن GitHub (ممكن يكون انتهى أو صلاحياته ناقصة).',
  github_unreachable: 'السيرفر مش قادر يوصل لـ GitHub دلوقتي. جرب كمان شوية.',
  github_error: 'GitHub رجّع خطأ.',
  bad_image: 'الصورة مش سليمة.',
  path_not_allowed: 'ملف مش مسموح بتعديله.',
};
class ApiError extends Error { constructor(code, detail) { super(ERRORS[code] || code); this.code = code; this.detail = detail; } }
async function api(action, data = {}) {
  let res;
  try {
    res = await fetch('api.php', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Admin': '1' },
      body: JSON.stringify({ action, ...data }),
    });
  } catch { throw new ApiError('github_unreachable'); }
  let json = {};
  try { json = await res.json(); } catch { throw new ApiError(res.status === 404 ? 'api_missing' : 'server_error_' + res.status); }
  if (!res.ok || json.error) {
    const err = new ApiError(json.error || 'server_error_' + res.status, json.detail);
    if (err.code === 'login_required' && action !== 'session') showLogin(err.message);
    throw err;
  }
  return json;
}

// ---------------------------------------------------------------- state
const S = {
  user: '', head: '', orig: {}, doc: null,
  team: [], projects: [],
  phone: '', email: '', map: '',
  newImages: new Map(),   // path -> Blob (made here, not on GitHub yet)
  urls: new Map(),        // path -> object URL, for showing new photos
  dropped: new Set(),     // paths removed or replaced; deleted on publish if nothing else uses them
  tab: 'hero', editing: null, filter: '',
};
const TABS = [
  ['hero', 'الهيرو والنص المتكتب'], ['texts', 'كل النصوص'], ['team', 'فريق العمل'], ['projects', 'المشروعات'],
  ['clients', 'العملاء'], ['services', 'صور الخدمات'], ['settings', 'التواصل'],
];
const CATEGORIES = { events: 'فعاليات وتجارب', exhibitions: 'معارض وأجنحة', sports: 'بطولات رياضية' };
const imgURL = p => S.urls.get(p) || '../' + p;

// ---------------------------------------------------------------- data files <-> objects
function readData(src, name) {
  const i = src.indexOf('window.' + name);
  const eq = src.indexOf('=', i);
  return JSON.parse(src.slice(eq + 1, src.lastIndexOf(']') + 1));
}
function writeData(src, name, arr, compact) {
  const i = src.indexOf('window.' + name);
  const body = compact ? '[\n' + arr.map(x => '  ' + JSON.stringify(x)).join(',\n') + '\n]' : JSON.stringify(arr, null, 2);
  return src.slice(0, i) + 'window.' + name + ' = ' + body + ';\n';
}
function serializeDoc(doc) {
  let s = '<!doctype html>\n' + doc.documentElement.outerHTML + '\n';
  s = s.replace(/<[a-zA-Z][^>]*>/g, tag => tag.replace(/ ([\w:-]+)=""/g, ' $1'));
  s = s.replace(/(<html[^>]*>)<head>/, '$1\n<head>');
  // text after </html> is moved into <body> by the parser: keep exactly one line break there so the file doesn't grow
  return s.replace(/\s*<\/body>\s*<\/html>\s*$/, '\n</body></html>\n');
}
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function parseAll(files) {
  S.orig = files;
  S.doc = new DOMParser().parseFromString(files['index.html'], 'text/html');
  S.team = readData(files['js/team-data.js'], 'VISION_TEAM');
  S.projects = readData(files['js/projects-data.js'], 'VISION_PROJECTS');
  S.phone = (files['js/app.js'].match(/const phone='(\d+)'/) || [])[1] || '';
  S.email = (S.doc.querySelector('a[href^="mailto:"]')?.getAttribute('href') || '').slice(7);
  S.map = S.doc.querySelector('.map-link')?.getAttribute('href') || '';
  S.origContact = { phone: S.phone, email: S.email, map: S.map };
  S.urls.forEach(u => URL.revokeObjectURL(u));
  S.newImages.clear(); S.urls.clear(); S.dropped.clear();
}

function outputs() {
  const o = {}, f = S.orig, oc = S.origContact;
  o['index.html'] = serializeDoc(S.doc);
  o['js/team-data.js'] = writeData(f['js/team-data.js'], 'VISION_TEAM', S.team, true);
  o['js/projects-data.js'] = writeData(f['js/projects-data.js'], 'VISION_PROJECTS', S.projects, false);
  o['js/app.js'] = f['js/app.js'];
  o['js/portfolio.js'] = f['js/portfolio.js'];
  o['project.html'] = f['project.html'];
  if (S.phone && S.phone !== oc.phone) {
    o['js/app.js'] = o['js/app.js'].replace(`const phone='${oc.phone}'`, `const phone='${S.phone}'`);
    o['js/portfolio.js'] = o['js/portfolio.js'].split('wa.me/' + oc.phone).join('wa.me/' + S.phone);
  }
  if (S.email && S.email !== oc.email) o['project.html'] = o['project.html'].split(oc.email).join(S.email);
  if (S.map && S.map !== oc.map) o['project.html'] = o['project.html'].split(oc.map).join(S.map);
  return o;
}
function changes() {
  const o = outputs();
  const list = [];
  for (const [p, text] of Object.entries(o)) if (text !== S.orig[p]) list.push({ path: p, text });
  const all = Object.values(o).join('\n');
  const before = Object.values(S.orig).join('\n');
  const images = [...S.newImages.keys()].filter(p => all.includes(p));
  const deletes = [...S.dropped].filter(p => !all.includes(p) && before.includes(p) && !S.newImages.has(p));
  return { files: list, images, deletes };
}

// ---------------------------------------------------------------- dirty state
let dirtyTimer = null;
function markDirty() { clearTimeout(dirtyTimer); dirtyTimer = setTimeout(updateDirty, 250); }
function updateDirty() {
  const c = changes();
  const n = c.files.length + c.images.length + c.deletes.length;
  const badge = $('#dirty-badge');
  badge.hidden = !n;
  badge.textContent = 'في تعديلات لسه متنشرتش';
  $('#btn-publish').disabled = !n;
  $('#btn-discard').hidden = !n;
  S.isDirty = !!n;
  return c;
}
addEventListener('beforeunload', e => { if (S.isDirty) { e.preventDefault(); e.returnValue = ''; } });

// ---------------------------------------------------------------- images
let encoderPromise = null, nativeWebp = null;
async function webpSupported() {
  if (nativeWebp !== null) return nativeWebp;
  const c = document.createElement('canvas'); c.width = c.height = 2;
  const b = await new Promise(r => c.toBlob(r, 'image/webp', 0.8));
  return (nativeWebp = !!b && b.type === 'image/webp');
}
async function encodeWebp(canvas, quality) {
  if (await webpSupported()) return await new Promise(r => canvas.toBlob(r, 'image/webp', quality));
  // Safari can't make WebP from a canvas: use the bundled encoder (vendor/webp_enc.*, from @jsquash/webp, Apache-2.0).
  encoderPromise ||= import('./vendor/webp_enc.js').then(m => m.default({ noInitialRun: true, locateFile: f => new URL('./vendor/' + f, import.meta.url).href }));
  const mod = await encoderPromise;
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  const out = mod.encode(data.data, canvas.width, canvas.height, {
    quality: Math.round(quality * 100), target_size: 0, target_PSNR: 0, method: 4, sns_strength: 50, filter_strength: 60,
    filter_sharpness: 0, filter_type: 1, partitions: 0, segments: 4, pass: 1, show_compressed: 0, preprocessing: 0,
    autofilter: 0, partition_limit: 0, alpha_compression: 1, alpha_filtering: 1, alpha_quality: 100, lossless: 0,
    exact: 0, image_hint: 0, emulate_jpeg_size: 0, thread_level: 0, low_memory: 0, near_lossless: 100,
    use_delta_palette: 0, use_sharp_yuv: 0,
  });
  return new Blob([out], { type: 'image/webp' });
}
async function decodeImage(blob) {
  try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch { /* SVG etc. */ }
  const url = URL.createObjectURL(blob);
  try { const img = new Image(); img.src = url; await img.decode(); return img; }
  catch { throw new Error('الصيغة دي مش مدعومة. استخدم JPG أو PNG أو WebP.'); }
  finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
const dims = src => [src.naturalWidth || src.width, src.naturalHeight || src.height];
// mode: {width:N} keep aspect, at most N wide | {cover:[W,H]} crop to that size | {fit:[W,H]} fit inside
async function makeWebp(src, mode, quality = 0.82) {
  const [W, H] = dims(src);
  let sx = 0, sy = 0, sw = W, sh = H, w, hgt;
  if (mode.width) { const s = Math.min(1, mode.width / W); w = Math.round(W * s); hgt = Math.round(H * s); }
  else if (mode.fit) { const s = Math.min(mode.fit[0] / W, mode.fit[1] / H); w = Math.round(W * s); hgt = Math.round(H * s); }
  else {
    [w, hgt] = mode.cover;
    const target = w / hgt;
    if (W / H > target) { sw = H * target; sx = (W - sw) / 2; } else { sh = W / target; sy = (H - sh) / 2; }
  }
  const c = document.createElement('canvas'); c.width = w; c.height = hgt;
  const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, w, hgt);
  return { blob: await encodeWebp(c, quality), w, h: hgt };
}
let nameSeq = 0;
function slug(s) { return (s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40); }
function newPath(folder, base, suffix = '') {
  const stamp = Date.now().toString(36) + (nameSeq++).toString(36);
  return `assets/${folder}/${slug(base) || folder}-${stamp}${suffix}.webp`;
}
function addImage(path, blob) { S.newImages.set(path, blob); S.urls.set(path, URL.createObjectURL(blob)); }
function drop(...paths) { paths.filter(Boolean).forEach(p => S.dropped.add(p)); }
function pickFiles({ multiple = false, accept = 'image/*' } = {}) {
  return new Promise(resolve => {
    const input = h('input', { type: 'file', accept, multiple });
    input.addEventListener('change', () => resolve([...input.files]));
    input.click();
  });
}
async function withBusy(text, fn) {
  busy(text);
  try { return await fn(); }
  catch (e) { console.error(e); alertBox('حصلت مشكلة', e.message || String(e)); }
  finally { busy(false); }
}

// ---------------------------------------------------------------- small UI pieces
function busy(text) { $('#loading').hidden = !text; if (text) $('#loading-text').textContent = text; }
function toast(text) { const t = $('#toast'); t.textContent = text; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2600); }
function dialog(...content) { $('#dialog-body').replaceChildren(...content); $('#dialog').hidden = false; }
function closeDialog() { $('#dialog').hidden = true; }
function alertBox(title, text) { dialog(h('h3', { text: title }), h('p', { text }), h('div', { class: 'actions' }, h('button', { class: 'btn gold', type: 'button', onclick: closeDialog, text: 'تمام' }))); }
function confirmBox(title, text, okText = 'تأكيد', danger = false) {
  return new Promise(resolve => {
    const done = v => { closeDialog(); resolve(v); };
    dialog(h('h3', { text: title }), text ? h('p', { text }) : null,
      h('div', { class: 'actions' },
        h('button', { class: 'btn ' + (danger ? 'danger' : 'gold'), type: 'button', onclick: () => done(true), text: okText }),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => done(false), text: 'رجوع' })));
  });
}
function field(label, value, onInput, { multiline = false, dir, placeholder, type } = {}) {
  const input = multiline
    ? h('textarea', { rows: Math.min(6, Math.max(2, Math.ceil((value || '').length / 70) + (value || '').split('\n').length - 1)), dir, placeholder })
    : h('input', { type: type || 'text', dir, placeholder });
  input.value = value ?? '';
  input.addEventListener('input', () => { onInput(input.value); markDirty(); });
  return h('label', { class: 'field' }, h('span', { text: label }), input);
}
const pair = (a, b) => h('div', { class: 'pair' }, a, b);
const arField = (label, v, on, o = {}) => field(label + ' — عربي', v, on, { ...o, dir: 'rtl' });
const enField = (label, v, on, o = {}) => field(label + ' — English', v, on, { ...o, dir: 'ltr' });
function move(arr, i, d) { const j = i + d; if (j < 0 || j >= arr.length) return false; [arr[i], arr[j]] = [arr[j], arr[i]]; return true; }
function arrows(arr, i, after) {
  return [
    h('button', { class: 'icon-btn', type: 'button', title: 'لفوق', disabled: i === 0, onclick: () => { move(arr, i, -1) && (after(), markDirty()); }, text: '↑' }),
    h('button', { class: 'icon-btn', type: 'button', title: 'لتحت', disabled: i === arr.length - 1, onclick: () => { move(arr, i, 1) && (after(), markDirty()); }, text: '↓' }),
  ];
}
function pageHead(title, text, ...extra) { return h('div', { class: 'page-head' }, h('div', {}, h('h2', { text: title }), text ? h('p', { text }) : null), ...extra); }

// ---------------------------------------------------------------- tabs
function renderTabs() {
  $('#tabs').replaceChildren(...TABS.map(([id, label]) => h('button', {
    type: 'button', role: 'tab', 'aria-selected': String(S.tab === id), text: label,
    onclick: () => { S.tab = id; S.editing = null; renderTabs(); render(); scrollTo(0, 0); },
  })));
}
function render() {
  const view = $('#view');
  const fn = { hero: viewHero, texts: viewTexts, team: viewTeam, projects: viewProjects, clients: viewClients, services: viewServices, settings: viewSettings }[S.tab];
  const y = scrollY;
  view.replaceChildren(...[fn()].flat());
  return y;
}
function rerender() { const y = scrollY; render(); scrollTo(0, y); }

// ---------------------------------------------------------------- texts (data-ar / data-en in index.html)
const fromAttr = v => (v || '').replace(/\\n/g, '\n');
const toAttr = v => v.replace(/\r/g, '').replace(/\n/g, '\\n');
function setElText(el, ar, en) {
  el.setAttribute('data-ar', toAttr(ar));
  el.setAttribute('data-en', toAttr(en));
  el.replaceChildren();
  ar.split('\n').forEach((line, i) => { if (i) el.append(el.ownerDocument.createElement('br')); el.append(el.ownerDocument.createTextNode(line)); });
}
const GROUPS = [
  ['header', 'الهيدر والقائمة'], ['#hero', 'الهيرو (أول الصفحة)'], ['.ribbon', 'الشريط الذهبي المتحرك'], ['#about', 'عن رؤية الفعاليات'],
  ['#services', 'حلولنا (الخدمات)'], ['#work', 'أعمالنا'], ['#clients', 'العملاء'], ['#team', 'فريق العمل'], ['#contact', 'تواصل معنا'], ['footer', 'الفوتر'],
];
function describe(el) {
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
function textItems() {
  const doc = S.doc, items = [];
  const ribbonSets = [...doc.querySelectorAll('.ribbon-set')];
  doc.querySelectorAll('[data-ar]').forEach(el => {
    if (ribbonSets.length > 1 && el.closest('.ribbon-set') && el.closest('.ribbon-set') !== ribbonSets[0]) return;
    const group = (GROUPS.find(([sel]) => el.closest(sel)) || [null, 'إمكانية الوصول'])[1];
    items.push({ group, label: describe(el), el, kind: 'text' });
  });
  doc.querySelectorAll('[data-ar-placeholder]').forEach(el => {
    const group = (GROUPS.find(([sel]) => el.closest(sel)) || [null, 'عام'])[1];
    items.push({ group, label: 'النص الرمادي جوه الحقل', el, kind: 'placeholder' });
  });
  return items;
}
function textItemEditor(item) {
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
function pageMetaEditor() {
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
function viewTexts() {
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

// ---------------------------------------------------------------- hero
function readSlides() {
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
function writeSlides(list) {
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
const srcsetPaths = s => s.split(',').map(x => x.trim().split(/\s+/)[0]).filter(Boolean);
async function makeHeroSlide(file) {
  const src = await decodeImage(file);
  const big = await makeWebp(src, { width: 2400 }, 0.8);
  const small = await makeWebp(src, { width: 1000 }, 0.8);
  const base = (file.name || 'hero').replace(/\.[^.]+$/, '');
  const pBig = newPath('hero', base), pSmall = pBig.replace(/\.webp$/, '-sm.webp');
  addImage(pBig, big.blob); addImage(pSmall, small.blob);
  return { src: pBig, srcset: `${pSmall} ${small.w}w, ${pBig} ${big.w}w`, altAr: '', altEn: '', project: '', fx: 50, fy: 50 };
}
function projectSelect(value, onChange) {
  const sel = h('select', {}, h('option', { value: '', text: '— بدون (مفيش اسم مشروع تحت الصورة) —' }),
    S.projects.map((p, i) => h('option', { value: p.id, text: `${i + 1}. ${p.title.ar}` })));
  sel.value = value;
  sel.addEventListener('change', () => onChange(sel.value));
  return h('label', { class: 'field' }, h('span', { text: 'اسم المشروع اللي بيظهر تحت الصورة' }), sel);
}
function viewHero() {
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

// ---------------------------------------------------------------- team
async function makeTeamPhoto(file, name) {
  const src = await decodeImage(file);
  const big = await makeWebp(src, { cover: [1000, 1250] }, 0.85);
  const small = await makeWebp(src, { cover: [500, 625] }, 0.85);
  const p = newPath('team', name || file.name.replace(/\.[^.]+$/, ''));
  const ps = p.replace(/\.webp$/, '-sm.webp');
  addImage(p, big.blob); addImage(ps, small.blob);
  return { photo: p, photoSmall: ps };
}
function viewTeam() {
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

// ---------------------------------------------------------------- projects
async function blobFor(path) { return S.newImages.get(path) || await (await fetch('../' + path, { cache: 'force-cache' })).blob(); }
async function refreshThumb(p) {
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
async function addProjectImages(p, files) {
  for (const file of files) {
    const src = await decodeImage(file);
    const out = await makeWebp(src, { width: 1600 }, 0.8);
    const path = newPath('projects', p.id);
    addImage(path, out.blob);
    p.images.push(path);
  }
  await refreshThumb(p);
}
function viewProjects() {
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
function listEditor(items, makeRow, addLabel, blank, after) {
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
const inp = (value, on, attrs = {}) => { const i = h('input', attrs); i.value = value || ''; i.addEventListener('input', () => { on(i.value); markDirty(); }); return i; };
const removeBtn = fn => h('button', { class: 'icon-btn danger', type: 'button', title: 'مسح', text: '✕', onclick: fn });
function viewProject(p, index) {
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

// ---------------------------------------------------------------- clients
function readClients() {
  return [...S.doc.querySelectorAll('.client-grid > li')].map(li => {
    const img = li.querySelector('img');
    return { src: img.getAttribute('src'), w: img.getAttribute('width'), h: img.getAttribute('height'), altAr: img.getAttribute('data-ar-alt') || '', altEn: img.getAttribute('data-en-alt') || '', css: (li.getAttribute('style') || '').match(/--w:\s*(\d+)px/)?.[1] || '150' };
  });
}
function writeClients(list) {
  const doc = S.doc, ul = doc.querySelector('.client-grid');
  ul.replaceChildren(doc.createTextNode('\n'));
  list.forEach(c => {
    const li = doc.createElement('li'); li.className = 'client'; li.setAttribute('style', `--w:${c.css}px`);
    const img = doc.createElement('img');
    for (const [k, v] of [['src', c.src], ['width', c.w], ['height', c.h], ['fetchpriority', 'low'], ['decoding', 'async'], ['alt', c.altAr], ['data-ar-alt', c.altAr], ['data-en-alt', c.altEn]]) img.setAttribute(k, v);
    li.append(img); ul.append(li, doc.createTextNode('\n'));
  });
  markDirty();
}
async function makeLogo(file, name) {
  const src = await decodeImage(file);
  const out = await makeWebp(src, { fit: [360, 200] }, 0.9);
  const path = newPath('clients', name || file.name.replace(/\.[^.]+$/, ''));
  addImage(path, out.blob);
  // visual width on the wall: wide logos get more room, tall ones less (same rule as the existing 36 logos)
  return { src: path, w: String(out.w), h: String(out.h), css: String(Math.min(190, Math.round(107.2 * Math.sqrt(out.w / out.h)))) };
}
function viewClients() {
  const list = readClients();
  const cells = list.map((c, i) => h('div', { class: 'ccell' },
    h('div', { class: 'logo' }, h('img', { src: imgURL(c.src), alt: '' })),
    h('div', { class: 'body' }, field('الاسم — عربي', c.altAr, v => { c.altAr = v; writeClients(list); }, { dir: 'rtl' }), field('Name — English', c.altEn, v => { c.altEn = v; writeClients(list); }, { dir: 'ltr' })),
    h('div', { class: 'tools' },
      h('div', { style: 'display:flex;gap:4px;align-items:center' }, h('span', { class: 'num', text: i + 1 }), ...arrows(list, i, () => { writeClients(list); rerender(); })),
      h('button', { class: 'btn small ghost', type: 'button', text: 'تغيير', onclick: async () => {
        const [file] = await pickFiles(); if (!file) return;
        await withBusy('بجهّز اللوجو…', async () => { const n = await makeLogo(file, c.altEn); drop(c.src); Object.assign(c, n); writeClients(list); rerender(); });
      } }),
      removeBtn(async () => { if (!await confirmBox(`مسح لوجو ${c.altAr || ''}؟`, '', 'مسح', true)) return; drop(c.src); list.splice(i, 1); writeClients(list); rerender(); }))));
  return [
    pageHead('العملاء', `${list.length} لوجو، بيظهروا 6 في الصف (3 على الموبايل) بالترتيب ده.`,
      h('button', { class: 'btn gold', type: 'button', text: '+ إضافة لوجوهات', onclick: async () => {
        const files = await pickFiles({ multiple: true, accept: 'image/png,image/svg+xml,image/webp' }); if (!files.length) return;
        await withBusy('بجهّز اللوجوهات…', async () => { for (const f of files) list.push({ altAr: '', altEn: '', ...(await makeLogo(f)) }); writeClients(list); rerender(); scrollTo(0, document.body.scrollHeight); toast('اتضافت في الآخر — اكتب اسم كل جهة'); });
      } })),
    h('div', { class: 'note', text: 'اللوجو لازم يكون أبيض على خلفية شفافة (PNG أو SVG) زي الباقيين، لأن الخلفية في الموقع سودا.' }),
    h('div', { class: 'cgrid' }, cells),
  ];
}

// ---------------------------------------------------------------- services photos
const SERVICE_NAMES = { events: 'إدارة الفعاليات', exhibitions: 'إدارة المعارض', equipment: 'بيع وتأجير التجهيزات' };
function viewServices() {
  const imgs = [...S.doc.querySelectorAll('.service-visual img')];
  const rows = imgs.map(img => {
    const key = img.getAttribute('data-visual');
    const src = img.getAttribute('src');
    return h('div', { class: 'row', style: 'grid-template-columns:auto 1fr' },
      h('div', {}, h('div', { class: 'thumb service' }, h('img', { src: imgURL(src), alt: '' })),
        h('div', { class: 'photo-actions' }, h('button', { class: 'btn small ghost', type: 'button', text: 'تغيير الصورة', onclick: async () => {
          const [file] = await pickFiles(); if (!file) return;
          await withBusy('بجهّز الصورة…', async () => {
            const s = await decodeImage(file);
            const big = await makeWebp(s, { cover: [1200, 900] }, 0.8), small = await makeWebp(s, { cover: [640, 480] }, 0.8);
            const p = newPath('services', key), ps = p.replace(/\.webp$/, '-sm.webp');
            addImage(p, big.blob); addImage(ps, small.blob);
            drop(src, ...srcsetPaths(img.getAttribute('srcset') || ''));
            img.setAttribute('src', p); img.setAttribute('srcset', `${ps} 640w, ${p} 1200w`);
            markDirty(); rerender();
          });
        } }))),
      h('div', {}, h('h3', { text: SERVICE_NAMES[key] || key, style: 'margin-bottom:10px' }),
        pair(arField('وصف الصورة', img.getAttribute('data-ar-alt'), v => { img.setAttribute('data-ar-alt', v); img.setAttribute('alt', v); }),
          enField('Photo description', img.getAttribute('data-en-alt'), v => img.setAttribute('data-en-alt', v)))));
  });
  return [pageHead('صور الخدمات', 'الصورة اللي بتظهر جنب كل خدمة في قسم «حلولنا». بتتقص تلقائي على مقاس 4:3. نصوص الخدمات نفسها في «كل النصوص».'), h('div', { class: 'rows' }, rows)];
}

// ---------------------------------------------------------------- contact settings
function applyContact() {
  const doc = S.doc;
  doc.querySelectorAll('a[href^="mailto:"]').forEach(a => {
    a.setAttribute('href', 'mailto:' + S.email);
    const t = [...a.childNodes].find(n => n.nodeType === 3 && n.data.includes('@'));
    if (t) t.data = t.data.replace(/\S+@\S+/, S.email);
  });
  doc.querySelectorAll('a.map-link, a.footer-address').forEach(a => a.setAttribute('href', S.map));
}
function viewSettings() {
  const phone = field('رقم الواتساب (بكود الدولة ومن غير + أو مسافات)', S.phone, v => { S.phone = v.replace(/\D/g, ''); }, { dir: 'ltr', placeholder: '9665XXXXXXXX', type: 'tel' });
  return [
    pageHead('التواصل', 'الرقم ده بيستقبل رسايل فورم «تواصل معنا» وزرار الواتساب في صفحات المشروعات. مش بيظهر في الموقع.'),
    h('div', { class: 'card' }, phone,
      field('الإيميل', S.email, v => { S.email = v.trim(); applyContact(); }, { dir: 'ltr', type: 'email' }),
      field('لينك اللوكيشن على جوجل ماب', S.map, v => { S.map = v.trim(); applyContact(); }, { dir: 'ltr', type: 'url' }),
      h('p', { class: 'hint', text: 'نص العنوان نفسه («المملكة العربية السعودية - الرياض …») بيتعدل من «كل النصوص» ← تواصل معنا / الفوتر.' })),
  ];
}

// ---------------------------------------------------------------- validation before preview / publish
function problems() {
  const list = [];
  S.team.forEach((m, i) => { if (!m.name.ar || !m.name.en || !m.role.ar || !m.role.en) list.push(`فريق العمل: الشخص رقم ${i + 1} ناقصه اسم أو وظيفة.`); });
  S.projects.forEach((p, i) => {
    if (!p.title.ar || !p.title.en) list.push(`المشروع رقم ${i + 1}: ناقصه الاسم بالعربي أو الإنجليزي.`);
    if (!p.images.length && !p.hidden) list.push(`المشروع رقم ${i + 1}: مفيهوش صور (ضيف صور أو خليه مخفي).`);
    (p.videos || []).forEach(v => { if (v && !/^https:\/\/(www\.)?(youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com)\//.test(v)) list.push(`المشروع رقم ${i + 1}: لينك الفيديو لازم يكون YouTube أو Vimeo.`); });
  });
  readClients().forEach((c, i) => { if (!c.altAr || !c.altEn) list.push(`العملاء: اللوجو رقم ${i + 1} ناقصه الاسم.`); });
  if (!/^\d{9,15}$/.test(S.phone)) list.push('التواصل: رقم الواتساب مش مظبوط.');
  if (!/^\S+@\S+\.\S+$/.test(S.email)) list.push('التواصل: الإيميل مش مظبوط.');
  return list;
}
function cleanBeforeSave() {
  S.projects.forEach(p => { p.videos = (p.videos || []).filter(Boolean); p.services = p.services.filter(s => s.ar || s.en); });
}

// ---------------------------------------------------------------- preview
function previewHTML() {
  cleanBeforeSave();
  const o = outputs();
  const swap = s => { for (const [p, u] of S.urls) s = s.split(p).join(u); return s; };
  const js = path => URL.createObjectURL(new Blob([swap(o[path])], { type: 'text/javascript' }));
  let html = swap(o['index.html']);
  for (const p of ['js/team-data.js', 'js/projects-data.js', 'js/app.js', 'js/portfolio.js']) html = html.replace(`src="${p}"`, `src="${js(p)}"`);
  return html.replace('<head>', `<head><base href="${location.origin}/">`);
}
function openPreview() {
  const list = problems();
  $('#preview-frame').srcdoc = previewHTML();
  $('#preview').hidden = false;
  document.body.style.overflow = 'hidden';
  if (list.length) toast('في حاجات ناقصة لازم تتظبط قبل النشر');
}
function closePreview() { $('#preview').hidden = true; document.body.style.overflow = ''; $('#preview-frame').srcdoc = ''; }

// ---------------------------------------------------------------- publish
const FILE_NAMES = { 'index.html': 'الصفحة الرئيسية (نصوص، هيرو، عملاء، خدمات)', 'project.html': 'صفحة المشروع', 'js/team-data.js': 'فريق العمل', 'js/projects-data.js': 'المشروعات', 'js/app.js': 'رقم الواتساب', 'js/portfolio.js': 'رقم الواتساب في صفحات المشروعات' };
function b64(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); }); }
async function publish() {
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
        c.images.length ? h('li', { text: `${c.images.length} صورة جديدة` }) : null,
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
    const reload = async () => { closeDialog(); await load(); toast('اتحمّلت آخر نسخة'); };
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
        [h('button', { class: 'btn gold', type: 'button', text: 'حمّل آخر نسخة', onclick: async () => { closeDialog(); S.isDirty = false; await load(); } }), h('button', { class: 'btn ghost', type: 'button', text: 'رجوع', onclick: closeDialog })]);
    } else finish('حصلت مشكلة', e.message + (e.detail ? ` (${e.detail})` : '') + ' — تعديلاتك لسه موجودة هنا، جرب تنشر تاني.', [closeBtn]);
  }
}

// ---------------------------------------------------------------- boot
function showLogin(message) {
  $('#app').hidden = true; $('#login-view').hidden = false; busy(false);
  $('#login-error').textContent = message || '';
  $('#login-user').focus();
}
async function load() {
  busy('بحمّل آخر نسخة من الموقع…');
  try {
    const r = await api('load');
    S.head = r.head; S.user = r.user;
    parseAll(r.files);
    $('#who').textContent = S.user;
    $('#login-view').hidden = true; $('#app').hidden = false;
    renderTabs(); render(); updateDirty();
  } catch (e) {
    if (e.code !== 'login_required') alertBox('مقدرتش أحمّل الموقع', e.message + (e.detail ? ` (${e.detail})` : ''));
  } finally { busy(false); }
}

$('#login-form').addEventListener('submit', async e => {
  e.preventDefault();
  $('#login-error').textContent = '';
  busy('بدخّلك…');
  try { await api('login', { user: $('#login-user').value, pass: $('#login-pass').value }); $('#login-pass').value = ''; await load(); }
  catch (err) { busy(false); $('#login-error').textContent = err.message; }
});
$('#btn-logout').addEventListener('click', async () => {
  if (S.isDirty && !await confirmBox('تخرج من غير ما تنشر؟', 'التعديلات اللي متنشرتش هتضيع.', 'خروج', true)) return;
  S.isDirty = false;
  try { await api('logout'); } catch { }
  location.reload();
});
$('#btn-discard').addEventListener('click', async () => {
  if (!await confirmBox('إلغاء كل التعديلات اللي متنشرتش؟', 'هرجع لآخر نسخة منشورة.', 'إلغاء التعديلات', true)) return;
  S.isDirty = false; S.editing = null; await load();
});
$('#btn-preview').addEventListener('click', openPreview);
$('#btn-publish').addEventListener('click', publish);
$('#preview-close').addEventListener('click', closePreview);
$('#preview-publish').addEventListener('click', publish);
document.querySelectorAll('#preview .seg button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('#preview .seg button').forEach(x => x.classList.toggle('on', x === b));
  $('#preview-frame').style.width = b.dataset.w + 'px';
}));
addEventListener('keydown', e => { if (e.key === 'Escape') { if (!$('#preview').hidden) closePreview(); } });

(async () => {
  try { await api('session'); await load(); }
  catch (e) { showLogin(e.code === 'login_required' ? '' : e.message); }
})();

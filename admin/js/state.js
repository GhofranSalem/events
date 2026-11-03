// Everything being edited, the site files it came from, and what would change on publish.
import { $ } from './dom.js';

export const S = {
  user: '', head: '', orig: {}, doc: null,
  team: [], projects: [],
  phone: '', email: '', map: '',
  newImages: new Map(),   // path -> Blob (made here, not on GitHub yet)
  urls: new Map(),        // path -> object URL, for showing new photos
  dropped: new Set(),     // paths removed or replaced; deleted on publish if nothing else uses them
  tab: 'hero', editing: null, filter: '',
};
export const CATEGORIES = { events: 'فعاليات وتجارب', exhibitions: 'معارض وأجنحة', sports: 'بطولات رياضية' };
export const imgURL = p => S.urls.get(p) || '../' + p;

export function readData(src, name) {
  const i = src.indexOf('window.' + name);
  const eq = src.indexOf('=', i);
  return JSON.parse(src.slice(eq + 1, src.lastIndexOf(']') + 1));
}
export function writeData(src, name, arr, compact) {
  const i = src.indexOf('window.' + name);
  const body = compact ? '[\n' + arr.map(x => '  ' + JSON.stringify(x)).join(',\n') + '\n]' : JSON.stringify(arr, null, 2);
  return src.slice(0, i) + 'window.' + name + ' = ' + body + ';\n';
}
export function serializeDoc(doc) {
  let s = '<!doctype html>\n' + doc.documentElement.outerHTML + '\n';
  s = s.replace(/<[a-zA-Z][^>]*>/g, tag => tag.replace(/ ([\w:-]+)=""/g, ' $1'));
  s = s.replace(/(<html[^>]*>)<head>/, '$1\n<head>');
  // text after </html> is moved into <body> by the parser: keep exactly one line break there so the file doesn't grow
  return s.replace(/\s*<\/body>\s*<\/html>\s*$/, '\n</body></html>\n');
}
export const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function parseAll(files) {
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

export function outputs() {
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
export function changes() {
  const o = outputs();
  const list = [];
  for (const [p, text] of Object.entries(o)) if (text !== S.orig[p]) list.push({ path: p, text });
  const all = Object.values(o).join('\n');
  const before = Object.values(S.orig).join('\n');
  const images = [...S.newImages.keys()].filter(p => all.includes(p));
  const deletes = [...S.dropped].filter(p => !all.includes(p) && before.includes(p) && !S.newImages.has(p));
  return { files: list, images, deletes };
}

export let dirtyTimer = null;
export function markDirty() { clearTimeout(dirtyTimer); dirtyTimer = setTimeout(updateDirty, 250); }
export function updateDirty() {
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

// Tabs and page rendering.
import { $, h } from './dom.js';
import { S } from './state.js';
import { viewClients } from './views/clients.js';
import { viewHero } from './views/hero.js';
import { viewProjects } from './views/projects.js';
import { viewServices } from './views/services.js';
import { viewSettings } from './views/settings.js';
import { viewTeam } from './views/team.js';
import { viewTexts } from './views/texts.js';
import { viewUsers } from './views/users.js';

export const TABS = [
  ['hero', 'الهيرو والنص المتكتب'], ['texts', 'كل النصوص'], ['team', 'فريق العمل'], ['projects', 'المشروعات'],
  ['clients', 'العملاء'], ['services', 'الخدمات'], ['settings', 'التواصل'], ['users', 'المستخدمين'],
];
export function renderTabs() {
  $('#tabs').replaceChildren(...TABS.filter(([id]) => id !== 'users' || S.admin).map(([id, label]) => h('button', {
    type: 'button', role: 'tab', 'aria-selected': String(S.tab === id), text: label,
    onclick: () => { S.tab = id; S.editing = null; renderTabs(); render(); scrollTo(0, 0); },
  })));
}
const VIEWS = { hero: viewHero, texts: viewTexts, team: viewTeam, projects: viewProjects, clients: viewClients, services: viewServices, settings: viewSettings, users: viewUsers };
export function render() { $('#view').replaceChildren(...[VIEWS[S.tab]()].flat()); }
// re-draw the current page after a structural change (add / remove / reorder) and keep the scroll position
export function rerender() { const y = scrollY; render(); scrollTo(0, y); }

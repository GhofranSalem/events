# Vision Events website (رؤية الفعاليات) — project notes

Handoff file for continuing this project in a new conversation. Read it fully before changing anything.
It is **not** uploaded to the live site (excluded in the deploy workflow and blocked in `.htaccess`).

## The owner

- Ghofran Salem, Senior 3D Visualizer at Vision Events (Riyadh events, exhibitions and AVL company).
- Talk to him in **Egyptian Arabic, masculine form**.
- In step-by-step instructions put **English UI labels on their own lines** (mixed Arabic/English on one line gets jumbled for him).
- When he must paste code/config himself, give the **complete ready-to-paste version**, not old-vs-new snippets.
- He checks results visually: send screenshots of what changed.

## What the site is

Static bilingual site, **Arabic (RTL) by default + English**, no build step, no framework.

- Live: **https://vevents.sa** (also www → redirects to the bare domain)
- Repo: **GhofranSalem/events** (public), branch `main`
- Old copies, **not used anymore**: `vevent.netlify.app` (Netlify, can be deleted; free plan forces a "Powered by Netlify" badge), and a local folder on his Mac Desktop `vision-events-website` (iCloud; may be out of date — GitHub is the source of truth).

## Deployment

- Every push to `main` runs `.github/workflows/deploy-namecom.yml` → uploads the repo over **FTPS** to Name.com shared hosting (cPanel user `fahad122`, server `hs19.name.tools`, FTP host `ftp.vevents.sa`).
- FTP account `deploy@vevents.sa` is locked to `public_html/vevents.sa/` (= the domain's document root), so `server-dir: ./`.
- Secrets in GitHub: `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD` (never ask for or print the password).
- Takes ~1–2 min. Verify with `gh run list -R GhofranSalem/events` and by comparing `curl -s https://vevents.sa/<file> | md5sum` with the repo file.
- The host has **NGINX caching**; if an old version shows, he presses **Clear Cache** in cPanel.
- **The hosting account holds many other companies' sites** (other folders in `public_html`). Never touch anything outside `public_html/vevents.sa/`.
- Commit messages end with the Claude co-author/session trailer.

## Files

```
index.html            home page (all sections)
project.html          project detail page (?id=project-NN)
.htaccess             HTTPS + bare-domain redirect, blocks dotfiles/backups/logs, security headers (CSP etc.), cache rules
css/style.css         base layout + Thmanyah @font-face
css/portfolio.css     projects grid, project page, lightbox
css/theme.css         current look (loaded last, overrides the other two)
js/boot.js            in <head>: switches to English before paint if chosen last time (kept external for the CSP)
js/language.js        AR/EN switch from data-ar / data-en attributes, fires 'vision-language'
js/projects-data.js   window.VISION_PROJECTS — all projects (titles, descriptions, images, services, videos)
js/portfolio.js       home grid (one row + "View all"), filters, search, project page, lightbox, video embeds
js/hero.js            hero photo carousel (6 s, dots, pause)
js/team-data.js       window.VISION_TEAM — order and titles
js/team.js            team carousel
js/clients.js         clients logo wall reveal (row by row)
js/app.js             WhatsApp brief form + services accordion photo swap
js/motion.js          typewriter on the main h1 only
js/nav.js             sticky header, active nav link, in-page links without #hash in the URL
assets/brand|fonts|hero|services|team|clients|projects
admin/                dashboard (vevents.sa/admin) — see "Dashboard" below
docs/DASHBOARD-HANDOFF.md  how the dashboard works, to rebuild it on another site (not deployed)
```

## Dashboard (vevents.sa/admin)

- For him and colleagues: edit texts (every data-ar/data-en in index.html, page title/description), hero photos + typewriter h1,
  team, projects (images, services, videos, hidden, order), client logos, services (add/remove/reorder, photo, contact-form choice,
  download links = PDF uploaded to `assets/files/` or any https link, shown as `a.service-download`), WhatsApp/email/map link.
- Code (no build; native ES modules):
  ```
  admin/index.html, admin.css
  admin/js/main.js        entry: login, load, top-bar buttons (sets api hooks)
  admin/js/api.js         fetch wrapper + Arabic error messages
  admin/js/state.js       S (everything being edited), read/write data files, outputs(), changes(), dirty badge
  admin/js/images.js      photos -> WebP at site sizes, new file names, drop() for removed files
  admin/js/ui.js dom.js   dialogs, fields, list editor / $ and h()
  admin/js/app.js         tabs + render/rerender
  admin/js/views/*.js     one file per tab (hero, texts, team, projects, clients, services, settings, users)
  admin/js/publish.js     problems() checks, preview, publish flow
  admin/api.php           router; admin/lib/{http,accounts,github}.php (lib/ denied by its own .htaccess)
  ```
  The browser loads the files from GitHub through the API,
  edits them in memory (index.html via DOMParser, data files as JSON), shows a **preview** (srcdoc iframe with the exact new files,
  new photos as blob: URLs), then **publishes one commit** to `main` (Git Data API) → the normal FTP deploy puts it live.
  So GitHub stays the source of truth; never edit files on the server.
- Photos are converted in the browser to WebP at the site's sizes (hero 2400/1000w, team 1000×1250/500×625, projects 1600w + 720w thumb,
  services 1200×900/640×480, logos ≤360×200 with `--w` = min(190, 107.2·√ratio)). New files always get a new name (images are cached a week).
  Removed/replaced images are deleted in the same commit if nothing else uses them. Safari fallback encoder: `admin/vendor/webp_enc.*` (@jsquash/webp 1.5.0, Apache-2.0).
- The API can only write: index.html, project.html, js/team-data.js, js/projects-data.js, js/app.js, js/portfolio.js, `assets/(hero|team|projects|clients|services)/*.webp` and `assets/files/*.pdf`
  (PDF size limit = what the host's PHP accepts in one request, shown to the user).
  It refuses to publish if `main` moved since the page loaded (conflict).
- Token: GitHub secret `ADMIN_GITHUB_TOKEN` (fine-grained, only this repo, Contents read/write + Actions read, set up 2026-11-03 with no expiration).
- Accounts: the **owner** account(s) come from secret `ADMIN_USERS` (one `username:password` per line; can't be deleted from the dashboard, so nobody gets locked out).
  Everyone else is added/edited/deleted by an admin in the dashboard's «المستخدمين» tab and stored only on the server in `admin/users.php`
  (hashes; gitignored, excluded from the deploy, denied by `.htaccess`). Everyone can change their own password («كلمة المرور» in the top bar);
  an owner who does keeps the secret password working too (recovery). Deleting a user or changing a password ends their open sessions.
- The deploy workflow writes `admin/config.php` (owner hashes + token) with `.github/scripts/admin-config.php`; gitignored and denied by `.htaccess`.
- Keep the generated formats stable when editing by hand: `js/team-data.js` = one JSON object per line; `js/projects-data.js` = `JSON.stringify(…, null, 2)`;
  index.html as the browser serializes it (boolean attributes without `=""`, `&amp;` in attributes). Otherwise the dashboard's first publish rewrites them.

## Design decisions (agreed with the owner)

- Fonts: **Thmanyah** only (Display for headings, Text for body, Sans for small labels); licence OK.
- Colours: pure black `#000` dark sections, warm sand `#f2ece1` light sections (About, Services, Team), gold `#fcc047`. Light/dark sections meet on a **clean edge** (no grey gradient fades).
- Gold ribbon marquee under the hero (solid gold words, no outline text).
- Typewriter effect on the hero h1 only.
- Team: colour photos on sand, rounded cards **without frames**, gold chevron stripes behind each person that slide on hover, light bottom gradient behind name/title. Order: CEO, CFO, finance/managers, designers last; **Ghofran is last** so he sits next to the CEO in the loop.
- Team photos: transparent WebP 1000×1250 + `-sm` 500×625, head size/position normalised to the others.
- Clients: 36 white logos on black (from his Illustrator file), 6 columns (3 on mobile).
- Projects: only the first row shows, then "عرض كل الأعمال (N)"; covers have rounded corners + chevron on hover.
- Contact goes to **WhatsApp** (number only inside js/app.js, never shown on the page). Footer: emblem only, email, short address "المملكة العربية السعودية - الرياض RQWA4655" linked to Google Maps.
- No phone number anywhere on the page.

## Team (js/team-data.js)

1. فهد الشمري / Fahad Al Shammari — الرئيس التنفيذي / CEO
2. فهد العنزي / Fahad El Anzy — المدير المالي / CFO
3. محمد شاهد / Mohamed Shahed — رئيس قسم المحاسبة / Head of Accounting
4. محمود كمال / Mahmoud Kamal — مدير عمليات أول / Senior Operations Manager
5. عبدالقادر غازي / Abdulkader Ghazi — مدير مشاريع أول / Senior Project Manager
6. رشا القرشي / Rasha Al Qurashi — مدير إدارة المشاريع / Project Management Director
7. عمار خزعل / Ammar Khazaal — مدير فعاليات / Event Manager
8. محمد أرقه دان / Mohamed Arkadan — مدير الصوت والإضاءة والمرئيات / AVL Manager
9. عبد الملك آل سنيد / Abdulmalik Al Sneed — مشرف الخدمات اللوجستية / Logistics Supervisor
10. محمود عادل / Mahmoud Adel — مصمم جرافيك / Graphic Artist
11. غفران سالم / Ghofran Salim — مصمم ثلاثي الأبعاد أول / Senior 3D Visualizer

## Projects (js/projects-data.js; numbering = order on the site, use it when he sends video links)

1. project-01 — احتفالات أمانة منطقة الرياض (يوم التأسيس واليوم الوطني السعودي) / Riyadh Municipality Celebrations (Saudi Founding Day & National Day)
2. project-03 — جناح وفعالية مجموعة روشن / ROSHN Group Pavilion & Brand Activation
3. project-04 — معرض الرياض للسيارات / Riyadh Motor Show
4. project-05 — حفل توقيع الشراكة بين نادي الهلال وشركة Unilumin / Al Hilal Club & Unilumin Sports Partnership Signing Ceremony
5. project-06 — حفل تخرج أكاديمية الدكتور سليمان الحبيب / Dr. Sulaiman Al Habib Academy Graduation Ceremony
6. project-07 — جناح مجمع الدكتور عبدالعزيز العجاجي لطب الأسنان (معرض SIDS 2026) / Dr. Abdulaziz Al Ajaji Dental Polyclinics Booth (SIDS Exhibition 2026)
7. project-08 — حفل سحور الدكتور عبدالعزيز العجاجي الرمضاني / Dr. Abdulaziz Al Ajaji Ramadan Suhoor Event
8. project-09 — فعالية يوم التأسيس السعودي — وزارة الخارجية / Saudi Founding Day Celebration — Ministry of Foreign Affairs
9. project-10 — مؤتمر ومعرض «عالم خالٍ من الأسلحة الكيميائية» — وزارة الخارجية / A World Free of Chemical Weapons Conference & Exhibition — Ministry of Foreign Affairs
10. project-11 — معرض ومنتدى الترجمة / Translation Exhibition & Forum
11. project-12 — احتفالات اليوم الوطني السعودي / Saudi National Day Celebrations
12. project-14 — فعالية 100 Welcome / 100 Welcome Event & Activation
13. project-15 — فعالية وحفل اليمامة / Al Yamamah Official Event & Ceremony
14. project-16 — فعالية ومنصة Joy / JOY Brand Activation & Event Production
15. project-17 — فعالية ومنتدى مؤسسة مسك (Misk) / Misk Foundation Forum & Exhibition
16. project-18 — فعالية RCF / RCF Official Event & Exhibition
17. project-19 — مؤتمر منظمة السياحة العالمية (UN Tourism) — وزارة السياحة / UN Tourism International Conference — Ministry of Tourism
18. project-20 — جناح وفعالية أرامكو السعودية 2025 / Saudi Aramco 2025 Exhibition Pavilion & Event
19. project-21 — بطولة الدارتس العالمية (Darts Championship) / Darts Championship — Sports Event Production
20. project-22 — بطولة الدرون والسيارات اللاسلكية (Drone & RC Championship) / Drone & RC Championship — Arena & Event Production
21. project-23 — بطولة دوري الملوك (Kings League) / Kings League Football Tournament Production
22. project-24 — فعالية ومنصة Olulou / Olulou Brand Activation & Experience
23. project-25 — بطولة السنوكر العالمية 2024 (Snooker Championship) / World Snooker Championship 2024 — Riyadh
24. project-26 — دورة الألعاب السعودية (Saudi Games) / The Saudi Games — National Sports Tournament
25. project-27 — مشروع تصميم وتنفيذ الواجهات والإضاءة المعمارية 2025 / Architectural Facades & Lighting Project 2025
26. project-28 — أجنحة وبوثات منتدى الأفلام السعودي (Saudi Film Forum) / Saudi Film Forum — Custom Exhibition Booths & Pavilions
27. project-29 — فعالية وبطولة تشالنج 2025 (Challenge 2025) / Challenge 2025 Event & Tournament
28. project-30 — بطولة جولة الجياد العربية (Arabian Horse Tour) / Arabian Horse Tour Championship
29. project-31 — احتفالات اليوم الوطني السعودي — حي البجيري (الدرعية) / Saudi National Day Celebration — Al Bujairi, Diriyah
30. project-32 — فعالية ومعرض «روابط متينة» / Strong Ties (Rawabit Mateena) Official Event & Exhibition
31. project-33 — معرض الصقور والصيد السعودي الدولي / International Saudi Falcons & Hunting Exhibition
32. project-34 — حفل العرض الأول وتفعيل فيلم «إسعاف» / Esaaf Movie Premiere & Red Carpet Activation

Almarai (old project-02) was removed on purpose. Hidden flag: add `"hidden": true` to a project to hide it without deleting.

## Open items

1. **Videos**: none yet. Plan: he uploads to **YouTube (Unlisted)** or Vimeo and sends "project number – link"; add the links to that project's `"videos": []` in projects-data.js. The page already embeds YouTube/Vimeo (allowed in the CSP). Original mp4s were deleted with an old "to be delete" folder; he may recover them from iCloud.com → Drive → Recently Deleted (30 days).
2. More hero photos (he will choose from projects).
3. Services photos are Gemini-generated placeholders he approved; replace if he sends real ones.
4. Optional: delete the Netlify project; delete his old local copy or re-sync it.

## How to work on it

- Edit in the repo, check with a local server (`python3 -m http.server`) + Playwright screenshots (desktop 1440 and mobile 390, Arabic and English) before pushing.
- Images: WebP; photos with a `-sm` size and srcset; keep file names stable or update every reference.
- Keep the CSP working: no inline `<script>`, iframes only from youtube-nocookie.com / player.vimeo.com.

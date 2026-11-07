# Handoff: Git-backed content dashboard for a static website

> **ملخص بالعربي:** الملف ده بيشرح طريقة لوحة التحكم اللي عملناها لموقع رؤية الفعاليات (vevents.sa/admin)،
> عشان تتعمل زيها على أي موقع تاني. اديه لـ Claude في المحادثة الجديدة وقوله: «اقرا الملف ده واعمل لوحة تحكم بنفس الطريقة لموقعي».
> الكود الأصلي كله موجود في الريبو العام GhofranSalem/events جوه فولدر `admin/` لو حب يرجعله.

This file is written for an AI assistant (or a developer) who will build the same kind of dashboard for **another website**.
Read the whole file before writing code. The reference implementation is public: **https://github.com/GhofranSalem/events** (folder `admin/`,
`.github/workflows/deploy-namecom.yml`, `.github/scripts/admin-config.php`). Read those files instead of guessing.

---

## 1. What it is (in one paragraph)

A password-protected page at `site.com/admin` that lets non-technical people edit a **static** website (plain HTML/CSS/JS, no CMS, no database):
texts in both languages, photos, team members, projects, client logos, services, contact details.
The dashboard **never edits files on the web server**. It loads the site's files from **GitHub**, edits them **in the browser**,
shows an exact **preview**, and publishes everything as **one Git commit**. The normal deploy pipeline (GitHub Actions → host)
then puts that commit live. GitHub stays the single source of truth, every change is versioned and can be reverted,
and developers can keep editing the same repo by hand.

```
 Browser (admin/index.html + ES modules)
   │  JSON POST  (same-origin, cookie session, X-Admin header)
   ▼
 admin/api.php  ──(fine-grained token)──►  GitHub REST API  (read files, create blobs, tree, commit, move branch)
                                                │ push to main
                                                ▼
                                   GitHub Actions deploy workflow  ──FTPS──►  hosting (live site)
```

## 2. Why this design (keep these decisions)

| Decision | Reason |
|---|---|
| Edit in the browser, save to GitHub | No database, no server-side templates. The site stays plain static files. History + undo come free from Git. |
| One commit per "Publish" | Atomic: texts + new photos + deleted photos land together. Easy to revert one publish. |
| Tiny PHP API, not a framework | Shared cPanel hosting only runs PHP. ~350 lines total. The API holds the GitHub token so the browser never sees it. |
| Whitelist of writable paths | Even a stolen session cannot change the workflow, `.htaccess`, the API itself or anything outside content. |
| Photos converted to WebP **in the browser** at the exact sizes the site uses | The server does no image work; uploads are small; every photo matches the site's design sizes. |
| New photo = new file name | Images are cached for a week; reusing a name would show the old photo. |
| Optimistic lock on the branch head | If someone else published since you opened the page, publishing is refused (`conflict`) instead of overwriting their work. |
| Preview = `srcdoc` iframe with the *exact* files to be published | What you see is what will go live, including unpublished photos (as `blob:` URLs). |
| Owner accounts from a GitHub secret, other accounts on the server | Nobody can lock the owner out from the dashboard; colleagues can be added without touching GitHub. |
| UI text in the owner's language (here Egyptian Arabic, RTL) | Users are not developers. All error codes map to friendly sentences. |

## 3. Requirements for the other site

- The site is static files in a GitHub repo, deployed automatically on every push to the main branch.
- The host can run **PHP 7.4+ with cURL** (any cPanel shared hosting). If the host has no PHP (e.g. Cloudflare Pages, Netlify), see section 10.
- Content lives in places the dashboard can parse:
  - texts in HTML elements (the reference site uses `data-ar` / `data-en` attributes on every translatable element),
  - lists (team, projects…) in small JS data files like `window.SITE_TEAM = [ … ];` that are valid JSON after the `=`.
  If the other site has text hard-coded in many places, **first refactor it into data files / data attributes**. This is most of the work.

## 4. Files (reference implementation)

```
admin/
  index.html           login view + app shell (top bar, tabs, preview overlay, dialog, toast). <meta robots noindex>.
  admin.css            dashboard styles (RTL).
  .htaccess            allow only api.php among .php files; CSP for the dashboard; X-Robots-Tag noindex; Cache-Control no-store.
  api.php              the whole API: router + rules (see section 5).
  lib/http.php         out()/fail() JSON helpers, readRequest() (POST + X-Admin + Origin check), upload size limit.
  lib/accounts.php     users (owners from config + others in users.php), password hashing, login throttling.
  lib/github.php       minimal GitHub REST client: head(), file(), blob(), commit() with conflict check, run() status.
  lib/.htaccess        "Require all denied" (never served).
  config.php           GENERATED at deploy time (owner hashes + token). gitignored, denied by .htaccess.
  users.php            created by the API when users are added. gitignored, excluded from deploy, denied.
  vendor/webp_enc.*    WebP encoder (WASM, @jsquash/webp 1.5.0, Apache-2.0) used only on Safari (canvas can't make WebP there).
  js/main.js           entry: session check, login form, load(), top-bar buttons.
  js/api.js            fetch wrapper → api.php; error code → user-friendly message; hooks for "session ended" / reload.
  js/state.js          S = everything being edited; parseAll() (files → state); outputs() (state → files); changes(); dirty badge.
  js/images.js         decode photo, crop/resize on canvas, encode WebP, new file names, drop() = mark old file for deletion.
  js/ui.js, dom.js     h() element builder, $(), dialogs, confirm, toast, bilingual field pairs, reorder arrows.
  js/app.js            tabs list + render()/rerender().
  js/views/*.js        one file per tab: hero, texts, team, projects, clients, services, settings, users.
  js/publish.js        problems() validation, preview, publish flow (upload blobs → commit → poll deploy status).
.github/scripts/admin-config.php   turns secrets into admin/config.php during deploy.
.github/workflows/deploy-*.yml     checkout → write admin/config.php → upload over FTPS (excludes users.php, docs, .github).
```

## 5. The API (`admin/api.php`) — exact behaviour

All requests: `POST admin/api.php`, JSON body `{action, ...}`, header `X-Admin: 1`, same-origin cookie.
`readRequest()` rejects anything else and rejects a foreign `Origin` (CSRF protection together with `SameSite=Strict`).

| action | who | does |
|---|---|---|
| `login` {user, pass} | anyone | throttled (8 fails / 15 min per IP+user, 40 per IP); unknown users still run a hash check (no timing leak); `session_regenerate_id`. |
| `logout` | anyone | destroys session. |
| `session` | anyone | `{user:null}` if not logged in (not an error), else `{user, admin}`. |
| `password` {current,new} | logged in | change own password (min 8 chars). Owners' new password is stored as an extra hash; the secret one keeps working (recovery). |
| `users` / `user_save` / `user_delete` | admins | list/add/edit/delete non-owner users; can't delete yourself or an owner. |
| `load` | logged in | `{head, files:{path:text}, maxUpload}` — reads every editable text file at the branch head. |
| `blob` {content: base64} | logged in | only WebP (`RIFF…WEBP`) or PDF (`%PDF-`) by magic bytes → GitHub blob → `{sha}`. |
| `commit` {base, changes[], message} | logged in | builds a tree on top of `base` (text files as content, images as blob shas, deletes as `sha:null`), commits, moves the branch with `force:false`. Every path must pass `allowedPath()`. Fails with `conflict` (409) if the branch moved. Message gets "Published from …/admin by USER". |
| `runs` {sha} | logged in | GitHub Actions status for that commit (dashboard polls it to say "live ✅"). |

Sessions: cookie `HttpOnly; Secure; SameSite=Strict; Path=/admin/`, strict mode, 8 h idle timeout,
ended automatically when the user is deleted or their password changes (a per-user "stamp" stored in the session).
`session_write_close()` before slow GitHub calls.

`allowedPath()` is the most important security line. Reference:
```php
const TEXT_FILES = ['index.html', 'project.html', 'js/team-data.js', 'js/projects-data.js', 'js/app.js', 'js/portfolio.js'];
function allowedPath(string $p): bool {
    return in_array($p, TEXT_FILES, true)
        || (bool)preg_match('#^assets/(hero|team|projects|clients|services)/[a-z0-9][a-z0-9-]{0,80}\.webp$#', $p)
        || (bool)preg_match('#^assets/files/[a-z0-9][a-z0-9-]{0,80}\.pdf$#', $p);
}
```
Text files can be changed but never deleted. Adapt the list to the new site; never allow `.github/`, `.htaccess`, `admin/`, or `*.php`.

## 6. Secrets and setup (what the owner does once)

GitHub repo → Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `ADMIN_USERS` | one owner per line: `username:password` (owners can never be deleted from the dashboard) |
| `ADMIN_GITHUB_TOKEN` | **fine-grained** token: only this repository; permissions **Contents: Read and write**, **Actions: Read**. |
| deploy secrets | whatever the deploy needs (here `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`). |

The workflow runs `php .github/scripts/admin-config.php > admin/config.php` before uploading, so passwords exist on the server only as
`password_hash()` hashes and the token is never in the repo. Until both secrets exist the API answers `not_configured` and the
dashboard shows a clear message. `.gitignore` must contain `admin/config.php` and `admin/users.php`; the deploy must **exclude**
`admin/users.php` (it lives only on the server — uploading would wipe accounts).

`.htaccess` at the site root must deny `*.php` (and dotfiles, backups, `.md`) everywhere; `admin/.htaccess` re-allows only `api.php`.
The dashboard CSP needs `blob:` (photos + preview), `'wasm-unsafe-eval'` (Safari encoder) and `frame-src 'self' blob: about:`.

## 7. Browser side — how editing works

1. **Load**: `api('load')` → `parseAll(files)`:
   - `index.html` → `new DOMParser().parseFromString(...)` = `S.doc` (edited like a normal DOM).
   - data files → `readData(src, 'SITE_TEAM')` takes the JSON after `window.SITE_TEAM =` and `JSON.parse`s it.
   - small values (WhatsApp number in `js/app.js`, email/map link in HTML) are read with a regex / querySelector.
2. **Edit**: each tab renders forms bound to `S` (or to elements of `S.doc`). Every input calls `markDirty()` → recomputes
   `changes()` (debounced) → shows "unpublished changes" badge, enables Publish/Discard. `beforeunload` warns if dirty.
3. **Photos**: `decodeImage(file)` (respects EXIF orientation) → `makeWebp(src, {cover:[W,H]} | {width:N} | {fit:[W,H]}, quality)`
   → `addImage(newPath(folder, name), blob)`; the old path goes to `drop()`. Same sizes as the live site
   (here: hero 2400 & 1000 wide, team 1000×1250 & 500×625, projects 1600 + 720 thumb, services 1200×900 & 640×480, logos ≤360×200).
4. **Outputs**: `outputs()` turns state back into file text: `serializeDoc(S.doc)` for HTML (normalised so unchanged pages produce
   byte-identical output), `writeData()` for data files. `changes()` = files whose text differs + new images that are actually
   referenced + dropped images that nothing references any more.
5. **Checks**: `problems()` lists missing translations, projects without photos, bad video links, bad phone/email — publishing is
   blocked until they're fixed, with one sentence per problem.
6. **Preview**: same outputs, new image paths swapped for their `blob:` URLs, data files injected as `blob:` scripts,
   `<base href>` to the site root, shown in an iframe at desktop (1440) or mobile (390) width.
7. **Publish**: confirm dialog (what changes + optional note) → upload each new image with `blob` → `commit` with
   `base = head loaded at start` → poll `runs` every 5 s up to 6 min → "live ✅" or "saved, deploy failed (see Actions)".
   On `conflict`: explain, offer "load latest version". On session expiry mid-edit: show login, **keep the unsaved edits**.

**Keep generated formats stable**: the dashboard re-serialises files. Hand edits must use the same format or the first dashboard
publish will produce a big noisy diff (here: team file = one JSON object per line; projects = `JSON.stringify(x, null, 2)`;
HTML as the browser serialises it — boolean attributes without `=""`, `&amp;` in attributes).

## 8. Step-by-step to build it on a new site

1. Inventory the site's editable content. Move texts into `data-*` attributes (or one JSON file) and lists into `js/*-data.js` files.
   Make the public pages render from those data files. Commit and confirm the live site still looks identical.
2. Decide the image sizes per section (look at the CSS / existing files) and the folder per type (`assets/<type>/`).
3. Copy `admin/` from the reference repo. Change: branding in `index.html`/`admin.css`, `TEXT_FILES` + `allowedPath()`,
   default repo name in `api.php` and `admin-config.php`, `TABS`/views, `parseAll()`/`outputs()`, `problems()`, `FILE_NAMES` labels,
   the session cookie name/path if the dashboard lives elsewhere.
4. Write one view per content type, reusing `ui.js` helpers (`pair(arField, enField)`, `arrows()` for ordering, `confirmBox`).
5. Add the config-writing step + exclusions to the deploy workflow; add `.gitignore` lines; add the `.htaccess` rules.
6. Owner adds the two secrets (section 6), pushes, opens `/admin`.
7. Test before handing over: login/logout, wrong password ×9 (throttle), edit each tab, add/replace/remove a photo,
   preview desktop + mobile, publish, check the commit diff on GitHub is minimal, check the live site, open two tabs and publish
   from both (second must get `conflict`), Safari photo upload (WASM encoder), session expiry while editing.

## 9. Lessons learned (avoid these)

- Shared hosting may sit behind **NGINX caching** → after a publish the old page can show for a while; tell users to refresh
  (or "Clear Cache" in cPanel). Use new file names for images.
- The FTP deploy action sometimes drops the connection → the workflow retries the upload once.
- `lazy` images that are hidden with `clip-path` before a reveal animation may never load — don't combine them.
- Netlify free plan blocks builds whose Git commits have unknown authors on **private** repos and forces a badge; this is why the
  reference site moved to PHP hosting with an FTP deploy.
- Never print or log the token or passwords; `display_errors=0` in the API so PHP warnings never leak paths into JSON.
- Arabic UI: put English technical words on their own line in instructions; the dashboard uses `dir="rtl"` and `dir="ltr"` on
  English inputs.

## 10. If the new site's host has no PHP (Cloudflare Pages, Netlify, Vercel…)

Keep everything in the browser exactly the same and replace `api.php` with a serverless function on the same domain
(e.g. Cloudflare Pages Function at `/admin/api`):
- token and owner password hashes in the platform's encrypted environment variables (not in the repo);
- sessions as a signed `HttpOnly; Secure; SameSite=Strict` cookie (HMAC with a secret) instead of PHP sessions;
- extra users and login-failure counters in the platform's KV store (Cloudflare KV / Netlify Blobs) instead of `users.php` / temp files;
- the same actions, same `allowedPath()` whitelist, same conflict check;
- no deploy step needed — those platforms rebuild on every push to the branch, so the dashboard's commit is the deploy.
  Poll the platform's deploy API (or just GitHub's commit status) for the "live" message.

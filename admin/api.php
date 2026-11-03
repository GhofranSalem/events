<?php
// Vision Events dashboard API (vevents.sa/admin/api.php).
// Logs people in, reads the site files from GitHub and saves changes back to GitHub as one commit.
// Every commit to main is uploaded to the live site by the deploy workflow, so GitHub stays the single source of truth.
// Settings (owner accounts + GitHub token) live in admin/config.php, written by the deploy workflow from GitHub secrets.
declare(strict_types=1);

ini_set('display_errors', '0'); // never leak paths or warnings into the JSON
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');

require __DIR__ . '/lib/http.php';
require __DIR__ . '/lib/accounts.php';
require __DIR__ . '/lib/github.php';

// Files the dashboard may change. Nothing else in the repository (workflows, .htaccess, this API …) can be touched.
const TEXT_FILES = ['index.html', 'project.html', 'js/team-data.js', 'js/projects-data.js', 'js/app.js', 'js/portfolio.js'];
function allowedPath(string $p): bool {
    return in_array($p, TEXT_FILES, true)
        || (bool)preg_match('#^assets/(hero|team|projects|clients|services)/[a-z0-9][a-z0-9-]{0,80}\.webp$#', $p)
        || (bool)preg_match('#^assets/files/[a-z0-9][a-z0-9-]{0,80}\.pdf$#', $p);
}

const DUMMY_HASH = '$2y$10$0fRc8mktir1hywnk4hma7.G3VgCsmSvAEJM7x4E0w1PzbHMEq0QXm'; // hash of a random string nobody knows

// ---------- settings ----------
$configFile = __DIR__ . '/config.php';
$config = is_file($configFile) ? (require $configFile) : [];
$owners = $config['users'] ?? [];
$token = (string)($config['github_token'] ?? '');
if (!$owners || $token === '') fail('not_configured', 503);
$github = new GitHub($token, (string)($config['repo'] ?? 'GhofranSalem/events'), (string)($config['branch'] ?? 'main'),
    rtrim((string)($config['api_base'] ?? 'https://api.github.com'), '/'));
$users = loadUsers($owners);

$in = readRequest();
$action = (string)($in['action'] ?? '');

// ---------- session ----------
$secure = (($_SERVER['HTTPS'] ?? '') === 'on') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
session_name('vadmin');
session_set_cookie_params(['lifetime' => 0, 'path' => '/admin/', 'secure' => $secure, 'httponly' => true, 'samesite' => 'Strict']);
session_start();

if ($action === 'login') {
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? '');
    $name = strtolower(trim((string)($in['user'] ?? '')));
    if (loginBlocked($ip, $name)) fail('too_many_attempts', 429);
    $known = isset($users[$name]);
    // unknown names still pay for a hash check, so response time doesn't reveal which names exist
    $ok = $known ? checkPassword($users[$name], (string)($in['pass'] ?? '')) : (password_verify((string)($in['pass'] ?? ''), DUMMY_HASH) && false);
    if (!$ok) { recordFailure($ip, $name); usleep(600000); fail('wrong_login', 401); }
    clearFailures($ip, $name);
    session_regenerate_id(true);
    $_SESSION = ['user' => $name, 'stamp' => userStamp($users, $name), 'seen' => time()];
    out(['user' => $name, 'admin' => $users[$name]['admin']]);
}
if ($action === 'logout') {
    $_SESSION = [];
    session_destroy();
    out(['ok' => true]);
}

// Everything below needs a logged-in user. Sessions end after 8 hours unused, when the account is deleted,
// or when its password is changed somewhere else.
$user = (string)($_SESSION['user'] ?? '');
if ($user === '' || !isset($users[$user]) || ($_SESSION['stamp'] ?? '') !== userStamp($users, $user) || time() - (int)($_SESSION['seen'] ?? 0) > 28800) {
    $_SESSION = [];
    if ($action === 'session') out(['user' => null]); // "am I logged in?" is a normal question, not an error
    fail('login_required', 401);
}
$_SESSION['seen'] = time();
$isAdmin = $users[$user]['admin'];

// ---------- accounts ----------
if ($action === 'password') { // change your own password
    if (!checkPassword($users[$user], (string)($in['current'] ?? ''))) fail('wrong_password', 400);
    $new = (string)($in['new'] ?? '');
    if (!validPassword($new)) fail('weak_password', 400);
    $users[$user][$users[$user]['owner'] ? 'alt' : 'hash'] = password_hash($new, PASSWORD_DEFAULT);
    saveUsers($users);
    $_SESSION['stamp'] = userStamp($users, $user);
    out(['ok' => true]);
}
if (in_array($action, ['users', 'user_save', 'user_delete'], true)) {
    if (!$isAdmin) fail('not_allowed', 403);
    $name = strtolower(trim((string)($in['name'] ?? '')));
    if ($action === 'user_save') {
        $pass = (string)($in['pass'] ?? '');
        $isNew = !isset($users[$name]);
        if (!validUsername($name)) fail('bad_username', 400);
        if (!$isNew && $users[$name]['owner']) fail('owner_locked', 400);
        if ($isNew) $users[$name] = ['hash' => '', 'alt' => null, 'admin' => false, 'owner' => false];
        if ($isNew || $pass !== '') {
            if (!validPassword($pass)) fail('weak_password', 400);
            $users[$name]['hash'] = password_hash($pass, PASSWORD_DEFAULT);
        }
        $users[$name]['admin'] = !empty($in['admin']);
        saveUsers($users);
    }
    if ($action === 'user_delete') {
        if (!isset($users[$name])) fail('bad_username', 400);
        if ($users[$name]['owner']) fail('owner_locked', 400);
        if ($name === $user) fail('not_allowed', 400);
        unset($users[$name]);
        saveUsers($users);
    }
    out(['users' => publicUserList($users)]);
}
session_write_close(); // don't hold the session lock during slow GitHub calls

if ($action === 'session') out(['user' => $user, 'admin' => $isAdmin]);

// ---------- site content ----------
if ($action === 'load') {
    $head = $github->head();
    $files = [];
    foreach (TEXT_FILES as $p) $files[$p] = $github->file($p, $head);
    out(['head' => $head, 'files' => $files, 'user' => $user, 'admin' => $isAdmin, 'maxUpload' => maxUploadBytes()]);
}

if ($action === 'blob') { // upload one photo (WebP) or document (PDF); returns its GitHub blob id
    $b64 = (string)($in['content'] ?? '');
    if ($b64 === '' || strlen($b64) > 90000000) fail('bad_image', 400);
    $head = base64_decode(substr($b64, 0, 24), true); // the first bytes are enough to recognise the type
    $isWebp = $head !== false && substr($head, 0, 4) === 'RIFF' && substr($head, 8, 4) === 'WEBP';
    $isPdf = $head !== false && substr($head, 0, 5) === '%PDF-';
    if (!$isWebp && !$isPdf) fail('bad_image', 400);
    out(['sha' => $github->blob($b64)]);
}

if ($action === 'commit') {
    $base = (string)($in['base'] ?? '');
    $changes = $in['changes'] ?? [];
    if (!isSha($base) || !is_array($changes) || !$changes || count($changes) > 400) fail('bad_request', 400);
    $tree = [];
    foreach ($changes as $c) {
        $path = (string)($c['path'] ?? '');
        if (!allowedPath($path)) fail('path_not_allowed', 400, ['detail' => $path]);
        $isText = in_array($path, TEXT_FILES, true);
        if (!empty($c['delete']) && !$isText) $tree[] = ['path' => $path, 'mode' => '100644', 'type' => 'blob', 'sha' => null];
        elseif (isset($c['blob']) && isSha((string)$c['blob'])) $tree[] = ['path' => $path, 'mode' => '100644', 'type' => 'blob', 'sha' => (string)$c['blob']];
        elseif (isset($c['text']) && $isText && strlen((string)$c['text']) < 5000000) $tree[] = ['path' => $path, 'mode' => '100644', 'type' => 'blob', 'content' => (string)$c['text']];
        else fail('bad_request', 400, ['detail' => $path]);
    }
    $summary = trim((string)preg_replace('/\s+/u', ' ', (string)($in['message'] ?? '')));
    $message = 'Dashboard: ' . ($summary !== '' ? strCut($summary, 200) : 'update site content') . "\n\nPublished from vevents.sa/admin by $user";
    out(['commit' => $github->commit($base, $tree, $message)]);
}

if ($action === 'runs') {
    $sha = (string)($in['sha'] ?? '');
    if (!isSha($sha)) fail('bad_request', 400);
    out($github->run($sha));
}

fail('unknown_action', 400);

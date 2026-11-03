<?php
// Vision Events dashboard API.
// Logs people in, reads the site files from GitHub and saves changes back to GitHub as one commit.
// Every commit to main is uploaded to the live site by the deploy workflow, so GitHub stays the single source of truth.
// Settings (users + GitHub token) live in admin/config.php, written by the deploy workflow from GitHub secrets.

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');

function out(array $data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function fail(string $message, int $code = 400, array $extra = []): void { out(['error' => $message] + $extra, $code); }

$configFile = __DIR__ . '/config.php';
if (!is_file($configFile)) fail('not_configured', 503);
$config = require $configFile;
// Accounts: the "owners" come from the ADMIN_USERS GitHub secret (they can never be locked out);
// everyone else is added from the dashboard and kept in admin/users.php on the server only (never in GitHub).
$owners = $config['users'] ?? [];
$usersFile = __DIR__ . '/users.php';
$saved = is_file($usersFile) ? (require $usersFile) : [];
if (!is_array($saved)) $saved = [];
$users = [];   // name => ['hash' => ..., 'alt' => ?, 'admin' => bool, 'owner' => bool]
foreach ($owners as $name => $hash) $users[$name] = ['hash' => $hash, 'alt' => null, 'admin' => true, 'owner' => true];
foreach ($saved as $name => $u) {
    if (!is_array($u) || !isset($u['hash'])) continue;
    // an owner who changed their password here: both the new one and the one in the GitHub secret work
    if (isset($users[$name])) $users[$name]['alt'] = $u['hash'];
    else $users[$name] = ['hash' => $u['hash'], 'alt' => null, 'admin' => !empty($u['admin']), 'owner' => false];
}
function saveUsers(array $users): void {
    global $usersFile;
    $keep = [];
    foreach ($users as $name => $u) {
        if ($u['owner']) { if ($u['alt']) $keep[$name] = ['hash' => $u['alt'], 'admin' => true]; }
        else $keep[$name] = ['hash' => $u['hash'], 'admin' => $u['admin']];
    }
    $tmp = $usersFile . '.' . bin2hex(random_bytes(4)) . '.tmp';
    $php = "<?php\n// Dashboard accounts added from vevents.sa/admin. Managed from the dashboard; not in GitHub.\nreturn " . var_export($keep, true) . ";\n";
    if (@file_put_contents($tmp, $php) === false || !@rename($tmp, $usersFile)) { @unlink($tmp); fail('cannot_save_users', 500); }
    @chmod($usersFile, 0600);
    if (function_exists('opcache_invalidate')) @opcache_invalidate($usersFile, true);
}
// Changes when this person's password changes (owners' secret hashes are re-salted on every deploy, so they don't count).
function stampOf(array $users, string $name): string {
    $u = $users[$name] ?? null;
    return substr(hash('sha256', $u ? ($u['owner'] ? 'owner' . ($u['alt'] ?? '') : $u['hash']) : ''), 0, 16);
}
function checkPassword(array $u, string $pass): bool {
    return password_verify($pass, $u['hash']) || ($u['alt'] && password_verify($pass, $u['alt']));
}
$token = (string)($config['github_token'] ?? '');
$repo = (string)($config['repo'] ?? 'GhofranSalem/events');
$branch = (string)($config['branch'] ?? 'main');
$apiBase = rtrim((string)($config['api_base'] ?? 'https://api.github.com'), '/');
if (!$owners || $token === '') fail('not_configured', 503);

// Only JSON POSTs with our header (blocks cross-site form posts; other sites can't add the header without CORS).
if ($_SERVER['REQUEST_METHOD'] !== 'POST' || ($_SERVER['HTTP_X_ADMIN'] ?? '') !== '1') fail('bad_request', 400);
$raw = file_get_contents('php://input');
$in = json_decode($raw ?: '{}', true);
if (!is_array($in)) fail('bad_request', 400);
$action = (string)($in['action'] ?? '');

$secure = (($_SERVER['HTTPS'] ?? '') === 'on') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
session_name('vadmin');
session_set_cookie_params(['lifetime' => 0, 'path' => '/admin/', 'secure' => $secure, 'httponly' => true, 'samesite' => 'Strict']);
session_start();

// ---------- login / logout ----------
function attemptsFile(): string { return sys_get_temp_dir() . '/vadmin-' . hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . __DIR__) . '.json'; }
function recentFailures(): array {
    $f = attemptsFile();
    $list = is_file($f) ? (json_decode((string)file_get_contents($f), true) ?: []) : [];
    return array_values(array_filter($list, fn($t) => $t > time() - 900));
}

if ($action === 'login') {
    $fails = recentFailures();
    if (count($fails) >= 8) fail('too_many_attempts', 429);
    $user = strtolower(trim((string)($in['user'] ?? '')));
    $pass = (string)($in['pass'] ?? '');
    if (!isset($users[$user]) || !checkPassword($users[$user], $pass)) {
        $fails[] = time();
        @file_put_contents(attemptsFile(), json_encode($fails));
        usleep(800000);
        fail('wrong_login', 401);
    }
    @unlink(attemptsFile());
    session_regenerate_id(true);
    $_SESSION['user'] = $user;
    $_SESSION['stamp'] = stampOf($users, $user);
    $_SESSION['seen'] = time();
    out(['user' => $user, 'admin' => $users[$user]['admin']]);
}
if ($action === 'logout') {
    $_SESSION = [];
    session_destroy();
    out(['ok' => true]);
}

// Everything below needs a logged-in user (sessions end after 8 hours without use).
$user = $_SESSION['user'] ?? null;
// (a deleted account, or a password changed somewhere else, ends the session)
if (!$user || !isset($users[$user]) || ($_SESSION['stamp'] ?? '') !== stampOf($users, $user) || time() - (int)($_SESSION['seen'] ?? 0) > 28800) {
    $_SESSION = [];
    fail('login_required', 401);
}
$_SESSION['seen'] = time();
$isAdmin = $users[$user]['admin'];

// ---------- accounts ----------
function validName(string $n): bool { return (bool)preg_match('/^[a-z0-9][a-z0-9._-]{1,29}$/', $n); }
function validPass(string $p): bool { $n = function_exists('mb_strlen') ? mb_strlen($p) : strlen($p); return $n >= 8 && $n <= 200; }
function userList(array $users): array {
    $list = [];
    foreach ($users as $name => $u) $list[] = ['name' => $name, 'admin' => $u['admin'], 'owner' => $u['owner']];
    return $list;
}
if ($action === 'password') { // change your own password
    if (!checkPassword($users[$user], (string)($in['current'] ?? ''))) fail('wrong_password', 400);
    $new = (string)($in['new'] ?? '');
    if (!validPass($new)) fail('weak_password', 400);
    $users[$user][$users[$user]['owner'] ? 'alt' : 'hash'] = password_hash($new, PASSWORD_DEFAULT);
    saveUsers($users);
    $_SESSION['stamp'] = stampOf($users, $user);
    out(['ok' => true]);
}
if (in_array($action, ['users', 'user_save', 'user_delete'], true)) {
    if (!$isAdmin) fail('not_allowed', 403);
    if ($action === 'user_save') {
        $name = strtolower(trim((string)($in['name'] ?? '')));
        $pass = (string)($in['pass'] ?? '');
        $isNew = !isset($users[$name]);
        if (!validName($name)) fail('bad_username', 400);
        if (!$isNew && $users[$name]['owner']) fail('owner_locked', 400);
        if ($isNew) $users[$name] = ['hash' => '', 'alt' => null, 'admin' => false, 'owner' => false];
        if ($isNew || $pass !== '') {
            if (!validPass($pass)) fail('weak_password', 400);
            $users[$name]['hash'] = password_hash($pass, PASSWORD_DEFAULT);
        }
        if (!$users[$name]['owner']) $users[$name]['admin'] = !empty($in['admin']);
        saveUsers($users);
        if ($name === $user) $_SESSION['stamp'] = stampOf($users, $user);
    }
    if ($action === 'user_delete') {
        $name = (string)($in['name'] ?? '');
        if (!isset($users[$name])) fail('bad_username', 400);
        if ($users[$name]['owner']) fail('owner_locked', 400);
        if ($name === $user) fail('not_allowed', 400);
        unset($users[$name]);
        saveUsers($users);
    }
    out(['users' => userList($users)]);
}
session_write_close(); // don't hold the session lock during slow GitHub calls

if ($action === 'session') out(['user' => $user, 'admin' => $isAdmin]);

// ---------- GitHub ----------
function gh(string $method, string $path, ?array $body = null): array {
    global $apiBase, $token;
    $ch = curl_init($apiBase . $path);
    $headers = [
        'Authorization: Bearer ' . $token,
        'Accept: application/vnd.github+json',
        'X-GitHub-Api-Version: 2022-11-28',
        'User-Agent: vevents-dashboard',
    ];
    if ($body !== null) $headers[] = 'Content-Type: application/json';
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_CONNECTTIMEOUT => 15,
    ]);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    $res = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($res === false) fail('github_unreachable', 502, ['detail' => $err]);
    $data = json_decode((string)$res, true);
    return [$code, is_array($data) ? $data : []];
}
function ghOk(string $method, string $path, ?array $body = null): array {
    [$code, $data] = gh($method, $path, $body);
    if ($code < 200 || $code >= 300) {
        $code === 401 || $code === 403
            ? fail('github_token', 502, ['detail' => $data['message'] ?? ''])
            : fail('github_error', 502, ['detail' => ($data['message'] ?? '') . " ($code)"]);
    }
    return $data;
}

// Files the dashboard may read or change. Nothing else in the repository (workflows, .htaccess, this API ...) can be touched.
const TEXT_FILES = ['index.html', 'project.html', 'js/team-data.js', 'js/projects-data.js', 'js/app.js', 'js/portfolio.js'];
function allowedPath(string $p): bool {
    return in_array($p, TEXT_FILES, true)
        || (bool)preg_match('#^assets/(hero|team|projects|clients|services)/[a-z0-9][a-z0-9-]{0,80}\.webp$#', $p)
        || (bool)preg_match('#^assets/files/[a-z0-9][a-z0-9-]{0,80}\.pdf$#', $p);
}

if ($action === 'load') {
    $ref = ghOk('GET', "/repos/$repo/git/ref/heads/$branch");
    $head = $ref['object']['sha'] ?? '';
    $files = [];
    foreach (TEXT_FILES as $p) {
        $c = ghOk('GET', "/repos/$repo/contents/" . $p . '?ref=' . $head);
        $files[$p] = base64_decode(str_replace("\n", '', (string)($c['content'] ?? '')));
    }
    // biggest file this server accepts in one request (the file travels as base64 inside JSON: ~1.37x)
    $bytes = function (string $v): int { $v = trim($v); $n = (int)$v; $u = strtolower(substr($v, -1)); return $u === 'g' ? $n << 30 : ($u === 'm' ? $n << 20 : ($u === 'k' ? $n << 10 : $n)); };
    $limits = array_filter([$bytes((string)ini_get('post_max_size')), (int)($bytes((string)ini_get('memory_limit')) / 4)], fn($x) => $x > 0);
    $maxUpload = $limits ? (int)(min($limits) / 1.4) : 8 << 20;
    out(['head' => $head, 'files' => $files, 'user' => $user, 'admin' => $isAdmin, 'maxUpload' => min($maxUpload, 60 << 20)]);
}

if ($action === 'blob') {
    $b64 = (string)($in['content'] ?? '');
    if ($b64 === '' || strlen($b64) > 90000000) fail('bad_image', 400);
    $bin = base64_decode($b64, true);
    $isWebp = $bin !== false && substr($bin, 0, 4) === 'RIFF' && substr($bin, 8, 4) === 'WEBP';
    $isPdf = $bin !== false && substr($bin, 0, 5) === '%PDF-';
    if (!$isWebp && !$isPdf) fail('bad_image', 400);
    unset($bin);
    $blob = ghOk('POST', "/repos/$repo/git/blobs", ['content' => $b64, 'encoding' => 'base64']);
    out(['sha' => $blob['sha'] ?? '']);
}

if ($action === 'commit') {
    $base = (string)($in['base'] ?? '');
    $changes = $in['changes'] ?? [];
    $summary = trim(preg_replace('/\s+/u', ' ', (string)($in['message'] ?? '')) ?? '');
    if (!preg_match('/^[0-9a-f]{40}$/', $base) || !is_array($changes) || !$changes || count($changes) > 400) fail('bad_request', 400);

    $tree = [];
    foreach ($changes as $c) {
        $path = (string)($c['path'] ?? '');
        if (!allowedPath($path)) fail('path_not_allowed', 400, ['detail' => $path]);
        if (!empty($c['delete'])) {
            if (in_array($path, TEXT_FILES, true)) fail('path_not_allowed', 400, ['detail' => $path]);
            $tree[] = ['path' => $path, 'mode' => '100644', 'type' => 'blob', 'sha' => null];
        } elseif (isset($c['blob'])) {
            if (!preg_match('/^[0-9a-f]{40}$/', (string)$c['blob'])) fail('bad_request', 400);
            $tree[] = ['path' => $path, 'mode' => '100644', 'type' => 'blob', 'sha' => (string)$c['blob']];
        } elseif (isset($c['text']) && in_array($path, TEXT_FILES, true)) {
            $tree[] = ['path' => $path, 'mode' => '100644', 'type' => 'blob', 'content' => (string)$c['text']];
        } else fail('bad_request', 400);
    }

    // Someone else published since this page loaded -> stop instead of overwriting their work.
    $ref = ghOk('GET', "/repos/$repo/git/ref/heads/$branch");
    if (($ref['object']['sha'] ?? '') !== $base) fail('conflict', 409);

    $baseCommit = ghOk('GET', "/repos/$repo/git/commits/$base");
    $newTree = ghOk('POST', "/repos/$repo/git/trees", ['base_tree' => $baseCommit['tree']['sha'] ?? '', 'tree' => $tree]);
    $message = 'Dashboard: ' . ($summary !== '' ? (function_exists('mb_substr') ? mb_substr($summary, 0, 200) : substr($summary, 0, 200)) : 'update site content') . "\n\nPublished from vevents.sa/admin by $user";
    $commit = ghOk('POST', "/repos/$repo/git/commits", ['message' => $message, 'tree' => $newTree['sha'] ?? '', 'parents' => [$base]]);
    [$code, $data] = gh('PATCH', "/repos/$repo/git/refs/heads/$branch", ['sha' => $commit['sha'] ?? '', 'force' => false]);
    if ($code === 422) fail('conflict', 409);
    if ($code < 200 || $code >= 300) fail('github_error', 502, ['detail' => ($data['message'] ?? '') . " ($code)"]);
    out(['commit' => $commit['sha'] ?? '']);
}

if ($action === 'runs') {
    $sha = (string)($in['sha'] ?? '');
    if (!preg_match('/^[0-9a-f]{40}$/', $sha)) fail('bad_request', 400);
    [$code, $data] = gh('GET', "/repos/$repo/actions/runs?head_sha=$sha&per_page=5");
    if ($code !== 200) out(['status' => 'unknown']);
    $run = $data['workflow_runs'][0] ?? null;
    if (!$run) out(['status' => 'queued']);
    out(['status' => $run['status'] ?? 'unknown', 'conclusion' => $run['conclusion'] ?? null]);
}

fail('unknown_action', 400);

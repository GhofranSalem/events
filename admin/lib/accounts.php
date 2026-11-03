<?php
// Dashboard accounts.
// Owners come from the ADMIN_USERS GitHub secret (admin/config.php) and can never be deleted here, so nobody gets locked out.
// Everyone else is added from the dashboard and kept only on the server in admin/users.php (password hashes).
declare(strict_types=1);

const USERS_FILE = __DIR__ . '/../users.php';

/** name => ['hash' => string, 'alt' => ?string, 'admin' => bool, 'owner' => bool] */
function loadUsers(array $owners): array {
    $saved = is_file(USERS_FILE) ? (require USERS_FILE) : [];
    $users = [];
    foreach ($owners as $name => $hash) $users[$name] = ['hash' => $hash, 'alt' => null, 'admin' => true, 'owner' => true];
    foreach (is_array($saved) ? $saved : [] as $name => $u) {
        if (!is_array($u) || !isset($u['hash'])) continue;
        // an owner who changed their password here: the new one and the one in the GitHub secret both work
        if (isset($users[$name])) $users[$name]['alt'] = $u['hash'];
        else $users[$name] = ['hash' => $u['hash'], 'alt' => null, 'admin' => !empty($u['admin']), 'owner' => false];
    }
    return $users;
}

function saveUsers(array $users): void {
    $keep = [];
    foreach ($users as $name => $u) {
        if ($u['owner']) { if ($u['alt']) $keep[$name] = ['hash' => $u['alt'], 'admin' => true]; }
        else $keep[$name] = ['hash' => $u['hash'], 'admin' => $u['admin']];
    }
    $php = "<?php\n// Dashboard accounts added from vevents.sa/admin. Managed from the dashboard; not in GitHub.\nreturn " . var_export($keep, true) . ";\n";
    $dir = dirname(USERS_FILE);
    $tmp = $dir . '/.users-' . bin2hex(random_bytes(6)) . '.php'; // dot + .php: denied by .htaccess even for the instant it exists
    $lock = fopen($dir . '/.users.lock', 'c');
    if ($lock) flock($lock, LOCK_EX);
    $ok = @file_put_contents($tmp, $php) !== false && @rename($tmp, USERS_FILE);
    if ($lock) { flock($lock, LOCK_UN); fclose($lock); }
    if (!$ok) { @unlink($tmp); fail('cannot_save_users', 500); }
    @chmod(USERS_FILE, 0600);
    if (function_exists('opcache_invalidate')) @opcache_invalidate(USERS_FILE, true);
}

function checkPassword(array $u, string $pass): bool {
    return password_verify($pass, $u['hash']) || ($u['alt'] !== null && password_verify($pass, $u['alt']));
}

/** Changes when this person's password changes, which ends their other sessions.
 *  (Owners' secret hashes are re-salted on every deploy, so only a password changed here counts for them.) */
function userStamp(array $users, string $name): string {
    $u = $users[$name] ?? null;
    return substr(hash('sha256', $u ? ($u['owner'] ? 'owner' . ($u['alt'] ?? '') : $u['hash']) : ''), 0, 16);
}

function validUsername(string $n): bool { return (bool)preg_match('/^[a-z0-9][a-z0-9._-]{1,29}$/', $n); }

function validPassword(string $p): bool { $n = strLength($p); return $n >= 8 && $n <= 200; }

function publicUserList(array $users): array {
    $list = [];
    foreach ($users as $name => $u) $list[] = ['name' => (string)$name, 'admin' => $u['admin'], 'owner' => $u['owner']];
    return $list;
}

// ---- login throttling: 8 wrong tries per address+username in 15 minutes, 40 per address ----
function throttleFile(string $key): string { return sys_get_temp_dir() . '/vadmin-' . hash('sha256', $key . __DIR__) . '.json'; }

function recentFailures(string $key): array {
    $f = throttleFile($key);
    $list = is_file($f) ? (json_decode((string)file_get_contents($f), true) ?: []) : [];
    return array_values(array_filter($list, fn($t) => is_int($t) && $t > time() - 900));
}

function loginBlocked(string $ip, string $user): bool {
    return count(recentFailures("$ip|$user")) >= 8 || count(recentFailures($ip)) >= 40;
}

function recordFailure(string $ip, string $user): void {
    foreach (["$ip|$user", $ip] as $key) {
        $list = recentFailures($key);
        $list[] = time();
        @file_put_contents(throttleFile($key), json_encode($list), LOCK_EX);
    }
}

function clearFailures(string $ip, string $user): void { @unlink(throttleFile("$ip|$user")); }

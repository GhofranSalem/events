<?php
// Writes admin/config.php for the dashboard during deploy, from two GitHub secrets:
//   ADMIN_USERS         one person per line:  username:password
//   ADMIN_GITHUB_TOKEN  fine-grained token for this repository (Contents: read & write, Actions: read)
// Passwords are stored only as hashes on the server.
$lines = preg_split('/\r\n|\r|\n/', (string)getenv('ADMIN_USERS'));
$users = [];
foreach ($lines as $line) {
    $line = trim($line);
    if ($line === '' || strpos($line, ':') === false) continue;
    [$name, $pass] = explode(':', $line, 2);
    $name = strtolower(trim($name));
    if ($name === '' || $pass === '') continue;
    $users[$name] = password_hash($pass, PASSWORD_DEFAULT);
}
$token = trim((string)getenv('ADMIN_GITHUB_TOKEN'));
if (!$users || $token === '') {
    fwrite(STDERR, "ADMIN_USERS or ADMIN_GITHUB_TOKEN is empty: the dashboard will say it is not set up yet.\n");
}
$config = [
    'users' => $users,
    'github_token' => $token,
    'repo' => (string)(getenv('GITHUB_REPOSITORY') ?: 'GhofranSalem/events'),
    'branch' => 'main',
];
echo "<?php\n// Written by the deploy workflow. Do not edit on the server; change the GitHub secrets instead.\nreturn " . var_export($config, true) . ";\n";

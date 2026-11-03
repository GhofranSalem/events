<?php
// JSON in / JSON out helpers for the dashboard API.
declare(strict_types=1);

function out(array $data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(string $error, int $code = 400, array $extra = []): void {
    out(['error' => $error] + $extra, $code);
}

/** Reads the request: only same-site JSON POSTs that carry our X-Admin header are accepted. */
function readRequest(): array {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST' || ($_SERVER['HTTP_X_ADMIN'] ?? '') !== '1') fail('bad_request', 400);
    // Browsers always send Origin on POST; it must be this site (blocks other sites even if a header slipped through).
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin !== '' && parse_url($origin, PHP_URL_HOST) !== parse_url('//' . ($_SERVER['HTTP_HOST'] ?? ''), PHP_URL_HOST)) fail('bad_request', 400);
    $in = json_decode((string)file_get_contents('php://input') ?: '{}', true);
    if (!is_array($in)) fail('bad_request', 400);
    return $in;
}

function isSha(string $s): bool { return (bool)preg_match('/^[0-9a-f]{40}$/', $s); }

function strLength(string $s): int { return function_exists('mb_strlen') ? mb_strlen($s) : strlen($s); }

function strCut(string $s, int $n): string { return function_exists('mb_substr') ? mb_substr($s, 0, $n) : substr($s, 0, $n); }

/** Largest file this server accepts in one request (files travel as base64 inside JSON, ~1.37x bigger). */
function maxUploadBytes(): int {
    $bytes = function (string $v): int {
        $v = trim($v); $n = (int)$v; $u = strtolower(substr($v, -1));
        return $u === 'g' ? $n << 30 : ($u === 'm' ? $n << 20 : ($u === 'k' ? $n << 10 : $n));
    };
    $limits = array_filter([$bytes((string)ini_get('post_max_size')), intdiv($bytes((string)ini_get('memory_limit')), 4)], fn($x) => $x > 0);
    return min($limits ? (int)(min($limits) / 1.4) : 8 << 20, 60 << 20);
}

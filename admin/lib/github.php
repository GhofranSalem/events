<?php
// Minimal GitHub REST client for the dashboard (one repository, one branch).
declare(strict_types=1);

final class GitHub {
    private string $token, $repo, $branch, $apiBase;

    public function __construct(string $token, string $repo, string $branch, string $apiBase) {
        $this->token = $token; $this->repo = $repo; $this->branch = $branch; $this->apiBase = $apiBase;
    }

    /** Returns [status code, decoded JSON array — or the raw body string when $raw]. */
    public function request(string $method, string $path, ?array $body = null, bool $raw = false): array {
        $ch = curl_init($this->apiBase . '/repos/' . $this->repo . $path);
        $headers = [
            'Authorization: Bearer ' . $this->token,
            'Accept: ' . ($raw ? 'application/vnd.github.raw' : 'application/vnd.github+json'),
            'X-GitHub-Api-Version: 2022-11-28',
            'User-Agent: vevents-dashboard',
        ];
        if ($body !== null) $headers[] = 'Content-Type: application/json';
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT => 90,
            CURLOPT_CONNECTTIMEOUT => 15,
        ]);
        if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        $res = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($res === false) fail('github_unreachable', 502, ['detail' => $err]);
        if ($raw && $code === 200) return [$code, (string)$res];
        $data = json_decode((string)$res, true);
        return [$code, is_array($data) ? $data : []];
    }

    /** Same as request() but stops with a clear error unless GitHub answered 2xx. */
    /** @return array|string */
    public function ok(string $method, string $path, ?array $body = null, bool $raw = false) {
        [$code, $data] = $this->request($method, $path, $body, $raw);
        if ($code >= 200 && $code < 300) return $data;
        $msg = is_array($data) ? ($data['message'] ?? '') : '';
        ($code === 401 || $code === 403) ? fail('github_token', 502, ['detail' => $msg]) : fail('github_error', 502, ['detail' => "$msg ($code)"]);
    }

    public function head(): string { return (string)($this->ok('GET', '/git/ref/heads/' . $this->branch)['object']['sha'] ?? ''); }

    /** File contents at a commit (raw, so files over 1 MB work too). */
    public function file(string $path, string $ref): string { return $this->ok('GET', '/contents/' . $path . '?ref=' . $ref, null, true); }

    public function blob(string $base64): string { return (string)($this->ok('POST', '/git/blobs', ['content' => $base64, 'encoding' => 'base64'])['sha'] ?? ''); }

    /** One commit on top of $base with the given tree entries; fails with 'conflict' if the branch moved. */
    public function commit(string $base, array $tree, string $message): string {
        if ($this->head() !== $base) fail('conflict', 409);
        $baseTree = $this->ok('GET', '/git/commits/' . $base)['tree']['sha'] ?? '';
        $newTree = $this->ok('POST', '/git/trees', ['base_tree' => $baseTree, 'tree' => $tree])['sha'] ?? '';
        $sha = $this->ok('POST', '/git/commits', ['message' => $message, 'tree' => $newTree, 'parents' => [$base]])['sha'] ?? '';
        [$code, $data] = $this->request('PATCH', '/git/refs/heads/' . $this->branch, ['sha' => $sha, 'force' => false]);
        if ($code === 422) fail('conflict', 409);
        if ($code < 200 || $code >= 300) fail('github_error', 502, ['detail' => ($data['message'] ?? '') . " ($code)"]);
        return $sha;
    }

    /** Deploy status of the workflow run for a commit. */
    public function run(string $sha): array {
        [$code, $data] = $this->request('GET', '/actions/runs?head_sha=' . $sha . '&per_page=5');
        if ($code !== 200) return ['status' => 'unknown'];
        $run = $data['workflow_runs'][0] ?? null;
        return $run ? ['status' => $run['status'] ?? 'unknown', 'conclusion' => $run['conclusion'] ?? null] : ['status' => 'queued'];
    }
}

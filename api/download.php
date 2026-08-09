<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/CodeGen.php';
require_once __DIR__ . '/../lib/Store.php';
require_once __DIR__ . '/../lib/RateLimiter.php';

header('X-Content-Type-Options: nosniff');

if (!RateLimiter::allow('lookup', 30, 60)) {
    http_response_code(429);
    exit;
}

$code = CodeGen::normalizeInput($_GET['code'] ?? '');
$id = isset($_GET['id']) && is_numeric($_GET['id']) ? (int) $_GET['id'] : -1;

$batch = Store::getBatch($code);
$files = $batch['files'] ?? null;
if ($batch === null || $files === null || !array_key_exists($id, array_values($files))) {
    http_response_code(404);
    exit;
}

$file = array_values($files)[$id];
$path = Store::batchDir($batch['code']) . '/' . $file['storedName'];
if (!is_file($path)) {
    http_response_code(404);
    exit;
}

$safeName = str_replace('"', "'", $file['originalName']);

header('Content-Type: ' . $file['mime']);
header('Content-Disposition: attachment; filename="' . $safeName . '"');
header('Content-Length: ' . (string) filesize($path));
header('Cache-Control: no-store');
readfile($path);

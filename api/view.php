<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/CodeGen.php';
require_once __DIR__ . '/../lib/Store.php';
require_once __DIR__ . '/../lib/RateLimiter.php';

header('X-Content-Type-Options: nosniff');

// Bucket separe de 'lookup' (devinette de code) : une seule galerie peut
// legitimement charger jusqu'a 10 vignettes d'un coup, il faut une marge
// large pour ne pas bloquer un usage normal.
if (!RateLimiter::allow('view', 180, 60)) {
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

header('Content-Type: ' . $file['mime']);
header('Cache-Control: no-store');
header('Content-Length: ' . (string) filesize($path));
readfile($path);

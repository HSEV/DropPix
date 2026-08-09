<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/CodeGen.php';
require_once __DIR__ . '/../lib/Store.php';
require_once __DIR__ . '/../lib/RateLimiter.php';
require_once __DIR__ . '/../lib/Http.php';

Http::commonHeaders();

if (!RateLimiter::allow('lookup', 30, 60)) {
    Http::json(429, ['error' => 'Trop de tentatives, reessaie dans une minute.']);
}

$code = CodeGen::normalizeInput($_GET['code'] ?? '');
if (strlen($code) !== CodeGen::CODE_LENGTH) {
    Http::json(400, ['error' => 'Code invalide.']);
}

$batch = Store::getBatch($code);
if ($batch === null) {
    Http::json(404, ['error' => 'Code introuvable ou expire.']);
}

Http::json(200, Http::batchPublicView($batch));

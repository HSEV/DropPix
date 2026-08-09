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

if (!class_exists('ZipArchive')) {
    http_response_code(500);
    echo "L'extension PHP zip n'est pas disponible sur ce serveur.";
    exit;
}

$code = CodeGen::normalizeInput($_GET['code'] ?? '');
$batch = Store::getBatch($code);
if ($batch === null || empty($batch['files'])) {
    http_response_code(404);
    exit;
}

$dir = Store::batchDir($batch['code']);
$tmpZip = tempnam(sys_get_temp_dir(), 'droppix_');
if ($tmpZip === false) {
    http_response_code(500);
    exit;
}
@unlink($tmpZip); // ZipArchive::CREATE veut creer le fichier lui-meme

$zip = new ZipArchive();
if ($zip->open($tmpZip, ZipArchive::CREATE) !== true) {
    http_response_code(500);
    exit;
}

$usedNames = [];
foreach ($batch['files'] as $file) {
    $path = $dir . '/' . $file['storedName'];
    if (!is_file($path)) {
        continue;
    }
    $name = $file['originalName'];
    // Evite d'ecraser deux fichiers dans le zip s'ils portent le meme nom.
    if (isset($usedNames[$name])) {
        $usedNames[$name]++;
        $pathinfo = pathinfo($name);
        $ext = isset($pathinfo['extension']) ? '.' . $pathinfo['extension'] : '';
        $base = $pathinfo['filename'] ?? $name;
        $name = $base . ' (' . $usedNames[$name] . ')' . $ext;
    } else {
        $usedNames[$name] = 0;
    }
    $zip->addFile($path, $name);
}
$zip->close();

header('Content-Type: application/zip');
header('Content-Disposition: attachment; filename="droppix-' . $batch['code'] . '.zip"');
header('Content-Length: ' . (string) filesize($tmpZip));
header('Cache-Control: no-store');
readfile($tmpZip);
@unlink($tmpZip);

<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/CodeGen.php';
require_once __DIR__ . '/../lib/ImageValidator.php';
require_once __DIR__ . '/../lib/RateLimiter.php';
require_once __DIR__ . '/../lib/Store.php';
require_once __DIR__ . '/../lib/Http.php';

Http::commonHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Http::json(405, ['error' => 'Methode non autorisee.']);
}

if (!RateLimiter::allow('upload', 40, 600)) {
    Http::json(429, ['error' => "Trop d'envois depuis cette adresse, reessaie dans quelques minutes."]);
}

// Filet de securite : garantit que le stockage reste borne meme si le Cron
// Job de nettoyage n'est pas configure sur l'hebergement (voir Store::maybeSweep).
Store::maybeSweep();

$maxFiles = 10;
$maxFileSize = 15 * 1024 * 1024; // 15 Mo

$incoming = $_FILES['images'] ?? null;
if (!is_array($incoming) || !isset($incoming['name']) || !is_array($incoming['name'])) {
    Http::json(400, ['error' => 'Aucun fichier recu.']);
}

$count = count($incoming['name']);
if ($count === 0) {
    Http::json(400, ['error' => 'Aucun fichier recu.']);
}
if ($count > $maxFiles) {
    Http::json(400, ['error' => "Tu peux deposer {$maxFiles} images maximum a la fois."]);
}

$accepted = [];
$rejected = [];

for ($i = 0; $i < $count; $i++) {
    $error = $incoming['error'][$i];
    $name = (string) $incoming['name'][$i];
    $tmpPath = (string) $incoming['tmp_name'][$i];
    $size = (int) $incoming['size'][$i];

    if ($error === UPLOAD_ERR_INI_SIZE || $error === UPLOAD_ERR_FORM_SIZE) {
        $rejected[] = $name;
        continue;
    }
    if ($error !== UPLOAD_ERR_OK) {
        $rejected[] = $name;
        continue;
    }
    if ($size > $maxFileSize || $size <= 0) {
        $rejected[] = $name;
        continue;
    }
    if (!is_uploaded_file($tmpPath)) {
        $rejected[] = $name;
        continue;
    }

    $detected = ImageValidator::detect($tmpPath);
    if ($detected === null) {
        $rejected[] = $name;
        continue;
    }

    $accepted[] = [
        'tmpPath' => $tmpPath,
        'originalName' => Http::sanitizeName($name),
        'storedName' => bin2hex(random_bytes(16)) . '.' . $detected['ext'],
        'size' => $size,
        'mime' => $detected['mime'],
    ];
}

if (count($accepted) === 0) {
    Http::json(400, [
        'error' => 'Aucun fichier valide : seules les images (JPG, PNG, GIF, WEBP, BMP, HEIC) sont acceptees.',
        'rejected' => $rejected,
    ]);
}

try {
    $batch = Store::createBatch($accepted);
} catch (Throwable $e) {
    Http::json(500, ['error' => "Erreur serveur pendant l'envoi."]);
}

$response = Http::batchPublicView($batch);
$response['rejected'] = $rejected;
Http::json(201, $response);

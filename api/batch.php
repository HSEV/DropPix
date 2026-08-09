<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/CodeGen.php';
require_once __DIR__ . '/../lib/Store.php';
require_once __DIR__ . '/../lib/RateLimiter.php';
require_once __DIR__ . '/../lib/Http.php';

Http::commonHeaders();

// Cette route est la seule a servir de "devinette de code" (elle repond
// juste existe/n'existe-pas) : c'est elle qu'on protege vraiment contre le
// bruteforce. 60/min laisse une marge large pour un usage normal (page qui
// se recharge, etc.) tout en restant totalement impraticable a bruteforcer
// sur une fenetre de vie de 5 min (300 essais vs ~1 milliard de codes possibles).
if (!RateLimiter::allow('lookup', 60, 60)) {
    Http::json(429, ['error' => 'Trop de tentatives, reessaie dans une minute.']);
}

// Filet de securite : voir Store::maybeSweep(). C'est la route la plus
// frequemment appelee (chaque chargement de page en fait un via la reprise
// automatique), donc le meilleur endroit pour garantir un balayage regulier
// meme sans Cron Job configure.
Store::maybeSweep();

$code = CodeGen::normalizeInput($_GET['code'] ?? '');
if (strlen($code) !== CodeGen::CODE_LENGTH) {
    Http::json(400, ['error' => 'Code invalide.']);
}

$batch = Store::getBatch($code);
if ($batch === null) {
    Http::json(404, ['error' => 'Code introuvable ou expire.']);
}

Http::json(200, Http::batchPublicView($batch));

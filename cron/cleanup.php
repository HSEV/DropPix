<?php
declare(strict_types=1);

// Script a brancher sur un Cron Job de l'hebergeur (toutes les minutes
// recommande). Sert de filet de securite pour supprimer les depots expires
// que personne n'a re-consultes entre-temps (la suppression a la consultation
// se fait deja dans lib/Store.php::getBatch).
//
// Exemple de commande Cron Job Hostinger :
//   php /home/<utilisateur>/domains/hsev.fr/droppix/cron/cleanup.php

require_once __DIR__ . '/../lib/Store.php';

$removed = Store::cleanupExpired();
echo 'DropPix cleanup : ' . $removed . " dossier(s) supprime(s).\n";

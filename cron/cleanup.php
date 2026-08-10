<?php
declare(strict_types=1);

/**
 * Nettoyage des depots expires, a brancher sur un Cron Job de l'hebergeur
 * (toutes les minutes recommande). Filet de securite pour supprimer les
 * depots que personne n'a re-consultes entre-temps (la suppression a la
 * consultation se fait deja dans lib/Store.php::getBatch).
 *
 * Deux facons de le declencher selon ce que permet ton hebergeur :
 *
 *  1) En CLI, avec le chemin absolu du fichier (a privilegier si possible) :
 *     php /chemin/absolu/vers/droppix/cron/cleanup.php
 *
 *  2) Par une requete HTTP, utile si l'hebergeur ne propose que des
 *     commandes type wget/curl (frequent sur l'hebergement mutualise) :
 *     wget -O /dev/null "https://ton-domaine/cron/cleanup.php?key=TA_CLE"
 *
 *     Dans ce cas, remplace IMPERATIVEMENT CRON_SECRET ci-dessous par une
 *     chaine aleatoire connue de toi seul, UNE FOIS LE FICHIER DEPOSE SUR
 *     TON SERVEUR. Ne mets jamais ta vraie cle dans un commit sur un depot
 *     Git public : modifie-la uniquement sur le serveur (FTP / gestionnaire
 *     de fichiers), pas dans ce repo.
 */
const CRON_SECRET = 'CHANGE_MOI_avant_utilisation_en_HTTP';

$isCli = PHP_SAPI === 'cli';

if (!$isCli) {
    header('Content-Type: text/plain; charset=utf-8');
    $key = (string) ($_GET['key'] ?? '');
    $valid = $key !== ''
        && $key !== 'CHANGE_MOI_avant_utilisation_en_HTTP'
        && hash_equals(CRON_SECRET, $key);
    if (!$valid) {
        http_response_code(403);
        exit("Acces refuse.\n");
    }
}

require_once __DIR__ . '/../lib/Store.php';

$removed = Store::cleanupExpired();
echo 'DropPix cleanup : ' . $removed . " dossier(s) supprime(s).\n";

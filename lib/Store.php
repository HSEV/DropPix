<?php
declare(strict_types=1);

require_once __DIR__ . '/CodeGen.php';

/**
 * Stockage des depots sur le systeme de fichiers, sans base de donnees.
 * Chaque code = un dossier sous storage/, contenant les images et un
 * fichier meta.json qui porte la date d'expiration.
 *
 * L'expiration est appliquee de deux facons complementaires :
 *  - paresseuse : a chaque acces (getBatch), un depot expire est supprime
 *    avant de repondre ;
 *  - active : le script cron/cleanup.php (a brancher sur un Cron Job de
 *    l'hebergeur, ex. toutes les minutes) supprime les depots expires que
 *    personne n'a re-consultes entre-temps.
 */
final class Store
{
    public const TTL_SECONDS = 300; // 5 minutes

    public static function root(): string
    {
        $root = __DIR__ . '/../storage';
        if (!is_dir($root)) {
            @mkdir($root, 0700, true);
        }
        return $root;
    }

    public static function batchDir(string $code): string
    {
        return self::root() . '/' . $code;
    }

    private static function metaPath(string $code): string
    {
        return self::batchDir($code) . '/meta.json';
    }

    /**
     * @param array<int, array{tmpPath:string, originalName:string, storedName:string, size:int, mime:string}> $files
     */
    public static function createBatch(array $files): array
    {
        $dir = null;
        $code = null;
        for ($attempts = 0; $attempts < 20; $attempts++) {
            $candidate = CodeGen::generateRawCode();
            $candidateDir = self::batchDir($candidate);
            // mkdir() echoue si le dossier existe deja : evite les collisions
            // meme en cas de requetes concurrentes (pas de verification prealable).
            if (@mkdir($candidateDir, 0700, true)) {
                $code = $candidate;
                $dir = $candidateDir;
                break;
            }
        }
        if ($code === null || $dir === null) {
            throw new RuntimeException('Impossible de generer un code unique.');
        }

        foreach ($files as $file) {
            $dest = $dir . '/' . $file['storedName'];
            $moved = is_uploaded_file($file['tmpPath'])
                ? move_uploaded_file($file['tmpPath'], $dest)
                : rename($file['tmpPath'], $dest);
            if (!$moved) {
                self::rrmdir($dir);
                throw new RuntimeException("Impossible d'enregistrer un fichier.");
            }
            @chmod($dest, 0600);
        }

        $now = time();
        $meta = [
            'code' => $code,
            'createdAt' => $now,
            'expiresAt' => $now + self::TTL_SECONDS,
            'files' => array_map(static function (array $f): array {
                return [
                    'originalName' => $f['originalName'],
                    'storedName' => $f['storedName'],
                    'size' => $f['size'],
                    'mime' => $f['mime'],
                ];
            }, $files),
        ];

        file_put_contents(
            self::metaPath($code),
            json_encode($meta, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
            LOCK_EX
        );
        @chmod(self::metaPath($code), 0600);

        return $meta;
    }

    /** Retourne les metadonnees d'un depot valide, ou null s'il est absent/expire. */
    public static function getBatch(string $rawCode): ?array
    {
        $code = CodeGen::normalizeInput($rawCode);
        if (strlen($code) !== CodeGen::CODE_LENGTH) {
            return null;
        }

        $metaFile = self::metaPath($code);
        if (!is_file($metaFile)) {
            return null;
        }

        $raw = file_get_contents($metaFile);
        $meta = $raw !== false ? json_decode($raw, true) : null;
        if (!is_array($meta) || !isset($meta['expiresAt'])) {
            self::deleteBatch($code);
            return null;
        }

        if ($meta['expiresAt'] <= time()) {
            self::deleteBatch($code);
            return null;
        }

        return $meta;
    }

    public static function deleteBatch(string $code): void
    {
        self::rrmdir(self::batchDir($code));
    }

    /** Balayage complet du dossier de stockage (utilise par le cron). */
    public static function cleanupExpired(): int
    {
        $root = self::root();
        $removed = 0;
        $now = time();

        foreach (scandir($root) ?: [] as $entry) {
            if ($entry === '.' || $entry === '..' || $entry === '_ratelimit') {
                continue;
            }
            $dir = $root . '/' . $entry;
            if (!is_dir($dir)) {
                continue;
            }

            $expired = true;
            $metaFile = $dir . '/meta.json';
            if (is_file($metaFile)) {
                $raw = file_get_contents($metaFile);
                $meta = $raw !== false ? json_decode($raw, true) : null;
                if (is_array($meta) && isset($meta['expiresAt']) && $meta['expiresAt'] > $now) {
                    $expired = false;
                }
            }

            if ($expired) {
                self::rrmdir($dir);
                $removed++;
            }
        }

        return $removed;
    }

    private static function rrmdir(string $dir): void
    {
        if (!is_dir($dir)) {
            return;
        }
        foreach (scandir($dir) ?: [] as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }
            $path = $dir . '/' . $item;
            if (is_dir($path) && !is_link($path)) {
                self::rrmdir($path);
            } else {
                @unlink($path);
            }
        }
        @rmdir($dir);
    }
}

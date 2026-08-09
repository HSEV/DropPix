<?php
declare(strict_types=1);

/**
 * Limiteur de debit a fenetre fixe, base sur de simples fichiers (pas de
 * BDD, pas de dependance externe). Suffisant pour rendre un bruteforce de
 * code impraticable sur une fenetre de vie de 5 minutes.
 */
final class RateLimiter
{
    private static function dir(): string
    {
        $dir = __DIR__ . '/../storage/_ratelimit';
        if (!is_dir($dir)) {
            @mkdir($dir, 0700, true);
        }
        return $dir;
    }

    private static function clientIp(): string
    {
        return (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    }

    /**
     * Retourne true si la requete est autorisee (et incremente le compteur),
     * false si la limite est depassee pour ce "bucket" (ex: 'upload', 'lookup').
     */
    public static function allow(string $bucket, int $max, int $windowSeconds): bool
    {
        $key = $bucket . '_' . md5(self::clientIp());
        $file = self::dir() . '/' . $key . '.json';

        $fp = @fopen($file, 'c+');
        if ($fp === false) {
            return true; // en cas de souci disque, on ne bloque pas l'utilisateur
        }

        flock($fp, LOCK_EX);

        $raw = stream_get_contents($fp);
        $data = $raw !== false && $raw !== '' ? json_decode($raw, true) : null;
        $now = time();

        if (!is_array($data) || !isset($data['windowStart']) || ($now - $data['windowStart']) >= $windowSeconds) {
            $data = ['windowStart' => $now, 'count' => 0];
        }

        $allowed = $data['count'] < $max;
        if ($allowed) {
            $data['count']++;
        }

        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, json_encode($data));
        fflush($fp);
        flock($fp, LOCK_UN);
        fclose($fp);

        return $allowed;
    }
}

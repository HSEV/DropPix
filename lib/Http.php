<?php
declare(strict_types=1);

require_once __DIR__ . '/CodeGen.php';

/** Petits utilitaires partages par les scripts sous api/. */
final class Http
{
    public static function commonHeaders(): void
    {
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: SAMEORIGIN');
        header('Referrer-Policy: no-referrer');
    }

    /** Envoie une reponse JSON et termine le script. */
    public static function json(int $status, array $data): void
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        exit;
    }

    /** Nettoie un nom de fichier utilisateur pour un usage sur disque/HTTP. */
    public static function sanitizeName(string $name): string
    {
        $base = basename($name);
        $base = substr($base, 0, 150);
        $cleaned = preg_replace('/[^a-zA-Z0-9._]+/', '_', $base) ?? '';
        $cleaned = trim($cleaned, '_');
        return $cleaned !== '' ? $cleaned : 'image';
    }

    /** Vue publique d'un depot, envoyee telle quelle au frontend. */
    public static function batchPublicView(array $batch): array
    {
        $files = [];
        foreach (array_values($batch['files']) as $i => $f) {
            $files[] = [
                'id' => $i,
                'name' => $f['originalName'],
                'size' => $f['size'],
                'mime' => $f['mime'],
            ];
        }
        return [
            'code' => $batch['code'],
            'codeFormatted' => CodeGen::formatCode($batch['code']),
            'expiresAt' => $batch['expiresAt'] * 1000, // en ms, cote frontend
            'ttlMs' => 300000,
            'files' => $files,
        ];
    }
}

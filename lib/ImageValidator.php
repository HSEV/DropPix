<?php
declare(strict_types=1);

/**
 * Validation d'images par "magic bytes" (signature binaire du fichier).
 * On ne fait jamais confiance a l'extension ou au Content-Type envoyes par
 * le navigateur : on lit les premiers octets du fichier lui-meme.
 * (Portage direct de la version Node.js du projet.)
 */
final class ImageValidator
{
    /**
     * Inspecte un fichier sur disque et retourne ['ext' => ..., 'mime' => ...]
     * si c'est une image supportee, sinon null.
     */
    public static function detect(string $path): ?array
    {
        $buf = @file_get_contents($path, false, null, 0, 32);
        if ($buf === false || $buf === '') {
            return null;
        }
        $len = strlen($buf);

        // JPEG
        if ($len > 3 && $buf[0] === "\xFF" && $buf[1] === "\xD8" && $buf[2] === "\xFF") {
            return ['ext' => 'jpg', 'mime' => 'image/jpeg'];
        }
        // PNG
        if ($len > 8 && substr($buf, 0, 8) === "\x89PNG\x0D\x0A\x1A\x0A") {
            return ['ext' => 'png', 'mime' => 'image/png'];
        }
        // GIF
        if ($len > 6 && (substr($buf, 0, 6) === 'GIF87a' || substr($buf, 0, 6) === 'GIF89a')) {
            return ['ext' => 'gif', 'mime' => 'image/gif'];
        }
        // WEBP (conteneur RIFF)
        if ($len > 12 && substr($buf, 0, 4) === 'RIFF' && substr($buf, 8, 4) === 'WEBP') {
            return ['ext' => 'webp', 'mime' => 'image/webp'];
        }
        // BMP
        if ($len > 2 && $buf[0] === 'B' && $buf[1] === 'M') {
            return ['ext' => 'bmp', 'mime' => 'image/bmp'];
        }
        // HEIC / HEIF : photos par defaut sur iPhone
        if ($len >= 12 && substr($buf, 4, 4) === 'ftyp') {
            $brand = substr($buf, 8, 4);
            if (in_array($brand, ['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1'], true)) {
                return ['ext' => 'heic', 'mime' => 'image/heic'];
            }
        }

        return null;
    }
}

<?php
declare(strict_types=1);

/**
 * Generation, formatage et normalisation des codes de depot.
 * Portage direct de la logique utilisee dans la version Node.js du projet.
 */
final class CodeGen
{
    // Alphabet lisible : pas de 0/O, 1/I/L, pour eviter les confusions a la relecture.
    public const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
    public const CODE_LENGTH = 6;

    /** Genere un code brut de CODE_LENGTH caracteres, ex: "K7P3XQ". */
    public static function generateRawCode(): string
    {
        $code = '';
        $max = strlen(self::ALPHABET) - 1;
        for ($i = 0; $i < self::CODE_LENGTH; $i++) {
            $code .= self::ALPHABET[random_int(0, $max)];
        }
        return $code;
    }

    /** Met un code en forme lisible pour l'affichage, ex: "K7P-3XQ". */
    public static function formatCode(string $code): string
    {
        $half = (int) ceil(strlen($code) / 2);
        return substr($code, 0, $half) . '-' . substr($code, $half);
    }

    /** Normalise une saisie utilisateur : majuscules, sans espaces/tirets, tronque. */
    public static function normalizeInput(?string $input): string
    {
        $input = strtoupper((string) $input);
        $input = preg_replace('/[^A-Z0-9]/', '', $input) ?? '';
        return substr($input, 0, self::CODE_LENGTH);
    }
}

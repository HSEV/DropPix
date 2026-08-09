'use strict';

const crypto = require('crypto');

// Alphabet lisible : pas de 0/O, 1/I/L, pour éviter les confusions à la relecture.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LENGTH = 6;

/** Génère un code brut de CODE_LENGTH caractères, ex: "K7P3XQ". */
function generateRawCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
  }
  return code;
}

/** Met un code en forme lisible pour l'affichage, ex: "K7P-3XQ". */
function formatCode(code) {
  const half = Math.ceil(code.length / 2);
  return `${code.slice(0, half)}-${code.slice(half)}`;
}

/** Normalise une saisie utilisateur : majuscules, sans espaces/tirets, tronqué. */
function normalizeInput(input) {
  return String(input || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, CODE_LENGTH);
}

module.exports = { generateRawCode, formatCode, normalizeInput, CODE_LENGTH, ALPHABET };

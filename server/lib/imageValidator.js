'use strict';

/**
 * Validation d'images par "magic bytes" (signature binaire du fichier).
 * On ne fait jamais confiance à l'extension ou au Content-Type envoyés par
 * le navigateur : on lit les premiers octets du fichier lui-même.
 */

const SIGNATURES = [
  {
    ext: 'jpg',
    mime: 'image/jpeg',
    test: (buf) => buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  },
  {
    ext: 'png',
    mime: 'image/png',
    test: (buf) =>
      buf.length > 8 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47 &&
      buf[4] === 0x0d &&
      buf[5] === 0x0a &&
      buf[6] === 0x1a &&
      buf[7] === 0x0a,
  },
  {
    ext: 'gif',
    mime: 'image/gif',
    test: (buf) =>
      buf.length > 6 &&
      buf.toString('ascii', 0, 6) === 'GIF87a' || buf.toString('ascii', 0, 6) === 'GIF89a',
  },
  {
    ext: 'webp',
    mime: 'image/webp',
    test: (buf) =>
      buf.length > 12 &&
      buf.toString('ascii', 0, 4) === 'RIFF' &&
      buf.toString('ascii', 8, 12) === 'WEBP',
  },
  {
    ext: 'bmp',
    mime: 'image/bmp',
    test: (buf) => buf.length > 2 && buf[0] === 0x42 && buf[1] === 0x4d,
  },
  {
    // HEIC / HEIF : photos par défaut sur iPhone
    ext: 'heic',
    mime: 'image/heic',
    test: (buf) => {
      if (buf.length < 12) return false;
      const box = buf.toString('ascii', 4, 8);
      if (box !== 'ftyp') return false;
      const brand = buf.toString('ascii', 8, 12);
      return ['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1'].includes(brand);
    },
  },
];

/**
 * Inspecte un buffer et retourne { ext, mime } si c'est une image supportée,
 * sinon null.
 */
function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;
  for (const sig of SIGNATURES) {
    if (sig.test(buffer)) return { ext: sig.ext, mime: sig.mime };
  }
  return null;
}

module.exports = { detectImageType };

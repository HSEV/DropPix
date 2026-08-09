'use strict';

const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const helmet = require('helmet');
const archiver = require('archiver');
const rateLimit = require('express-rate-limit');
const QRCode = require('qrcode');

const store = require('./lib/store');
const { detectImageType } = require('./lib/imageValidator');
const { normalizeInput, formatCode, CODE_LENGTH } = require('./lib/codeGen');

const PORT = process.env.PORT || 3000;
const MAX_FILES = 10;
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 Mo par image

const app = express();
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
  })
);
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
});

const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop d'envois depuis cette adresse, réessaie dans quelques minutes." },
});

const lookupLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives, réessaie dans une minute.' },
});

function batchPublicView(batch) {
  return {
    code: batch.code,
    codeFormatted: formatCode(batch.code),
    expiresAt: batch.expiresAt,
    ttlMs: store.TTL_MS,
    files: batch.files.map((f, i) => ({
      id: i,
      name: f.originalName,
      size: f.size,
      mime: f.mime,
    })),
  };
}

function sanitizeName(name) {
  const base = path.basename(String(name || 'image')).slice(0, 150);
  const cleaned = base.replace(/[^a-zA-Z0-9._]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned || 'image';
}

// ---- POST /api/upload : depose une ou plusieurs images, retourne un code ----
app.post('/api/upload', uploadLimiter, (req, res) => {
  upload.array('images', MAX_FILES)(req, res, async (err) => {
    if (err) {
      const msg =
        err.code === 'LIMIT_FILE_SIZE'
          ? `Une image dépasse la taille maximale autorisée (${MAX_FILE_SIZE / 1024 / 1024} Mo).`
          : err.code === 'LIMIT_FILE_COUNT'
          ? `Tu peux déposer ${MAX_FILES} images maximum à la fois.`
          : 'Envoi invalide.';
      return res.status(400).json({ error: msg });
    }

    const incoming = req.files || [];
    if (incoming.length === 0) {
      return res.status(400).json({ error: 'Aucun fichier reçu.' });
    }

    const rejected = [];
    const accepted = [];
    for (const file of incoming) {
      const detected = detectImageType(file.buffer);
      if (!detected) {
        rejected.push(file.originalname);
        continue;
      }
      accepted.push({ file, detected });
    }

    if (accepted.length === 0) {
      return res.status(400).json({
        error: 'Aucun fichier valide : seules les images (JPG, PNG, GIF, WEBP, BMP, HEIC) sont acceptées.',
        rejected,
      });
    }

    try {
      // On prépare les métadonnées, puis on écrit sur disque une fois le code réservé.
      const filesMeta = accepted.map(({ file, detected }) => ({
        originalName: sanitizeName(file.originalname),
        storedName: `${crypto.randomUUID()}.${detected.ext}`,
        size: file.size,
        mime: detected.mime,
      }));

      const batch = await store.createBatch(filesMeta);

      await Promise.all(
        accepted.map(({ file }, i) =>
          fs.writeFile(path.join(store.batchDir(batch.code), filesMeta[i].storedName), file.buffer)
        )
      );

      res.status(201).json({ ...batchPublicView(batch), rejected });
    } catch (e) {
      console.error('Upload error:', e);
      res.status(500).json({ error: "Erreur serveur pendant l'envoi." });
    }
  });
});

// ---- GET /api/batch/:code : metadonnees d'un depot ----
app.get('/api/batch/:code', lookupLimiter, (req, res) => {
  const code = normalizeInput(req.params.code);
  if (code.length !== CODE_LENGTH) {
    return res.status(400).json({ error: 'Code invalide.' });
  }
  const batch = store.getBatch(code);
  if (!batch) {
    return res.status(404).json({ error: 'Code introuvable ou expiré.' });
  }
  res.json(batchPublicView(batch));
});

// ---- GET /api/batch/:code/:id/download : telecharge une image ----
app.get('/api/batch/:code/:id/download', lookupLimiter, async (req, res) => {
  const code = normalizeInput(req.params.code);
  const batch = store.getBatch(code);
  if (!batch) return res.status(404).json({ error: 'Code introuvable ou expiré.' });

  const id = Number(req.params.id);
  const file = batch.files[id];
  if (!file) return res.status(404).json({ error: 'Fichier introuvable.' });

  const filePath = path.join(store.batchDir(code), file.storedName);
  res.download(filePath, file.originalName, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'Fichier introuvable.' });
  });
});

// ---- GET /api/batch/:code/:id/view : affiche l'image inline (pour les vignettes) ----
app.get('/api/batch/:code/:id/view', lookupLimiter, (req, res) => {
  const code = normalizeInput(req.params.code);
  const batch = store.getBatch(code);
  if (!batch) return res.status(404).end();

  const id = Number(req.params.id);
  const file = batch.files[id];
  if (!file) return res.status(404).end();

  const filePath = path.join(store.batchDir(code), file.storedName);
  res.set('Content-Type', file.mime);
  res.set('Cache-Control', 'no-store');
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) res.status(404).end();
  });
});

// ---- GET /api/batch/:code/zip : telecharge toutes les images d'un coup ----
app.get('/api/batch/:code/zip', lookupLimiter, (req, res) => {
  const code = normalizeInput(req.params.code);
  const batch = store.getBatch(code);
  if (!batch) return res.status(404).json({ error: 'Code introuvable ou expiré.' });

  res.attachment(`droppix-${code}.zip`);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => {
    console.error('Zip error:', err);
    if (!res.headersSent) res.status(500).end();
  });
  archive.pipe(res);
  for (const file of batch.files) {
    archive.file(path.join(store.batchDir(code), file.storedName), { name: file.originalName });
  }
  archive.finalize();
});

// ---- GET /api/qr/:code : QR code (PNG) pointant vers la page de recuperation ----
app.get('/api/qr/:code', lookupLimiter, async (req, res) => {
  const code = normalizeInput(req.params.code);
  if (code.length !== CODE_LENGTH) return res.status(400).end();

  const origin = `${req.protocol}://${req.get('host')}`;
  const url = `${origin}/?code=${code}`;
  try {
    const png = await QRCode.toBuffer(url, { width: 260, margin: 1 });
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-store');
    res.send(png);
  } catch (e) {
    res.status(500).end();
  }
});

app.get('/health', (_req, res) => res.json({ ok: true }));

// Fallback : SPA -> toujours servir index.html pour les routes inconnues (hors /api).
app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

async function main() {
  await store.clearUploadRoot();
  store.startCleanupSweep();
  app.listen(PORT, () => {
    console.log(`DropPix en écoute sur http://localhost:${PORT}`);
  });
}

main();

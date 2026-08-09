'use strict';

const fs = require('fs/promises');
const path = require('path');
const { generateRawCode } = require('./codeGen');

const TTL_MS = 5 * 60 * 1000; // 5 minutes
const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');
const SWEEP_INTERVAL_MS = 15 * 1000;

/** @type {Map<string, Batch>} */
const batches = new Map();

/**
 * @typedef {Object} StoredFile
 * @property {string} originalName
 * @property {string} storedName
 * @property {number} size
 * @property {string} mime
 *
 * @typedef {Object} Batch
 * @property {string} code
 * @property {StoredFile[]} files
 * @property {number} createdAt
 * @property {number} expiresAt
 * @property {NodeJS.Timeout} timer
 */

async function ensureUploadRoot() {
  await fs.mkdir(UPLOAD_ROOT, { recursive: true });
}

function batchDir(code) {
  return path.join(UPLOAD_ROOT, code);
}

/** Crée un batch avec un code unique et programme sa suppression après TTL_MS. */
async function createBatch(files) {
  await ensureUploadRoot();

  let code;
  do {
    code = generateRawCode();
  } while (batches.has(code));

  const dir = batchDir(code);
  await fs.mkdir(dir, { recursive: true });

  const now = Date.now();
  const batch = {
    code,
    files,
    createdAt: now,
    expiresAt: now + TTL_MS,
    timer: setTimeout(() => deleteBatch(code), TTL_MS),
  };
  batches.set(code, batch);
  return batch;
}

function getBatch(code) {
  const batch = batches.get(code);
  if (!batch) return null;
  if (batch.expiresAt <= Date.now()) {
    deleteBatch(code);
    return null;
  }
  return batch;
}

async function deleteBatch(code) {
  const batch = batches.get(code);
  if (!batch) return;
  clearTimeout(batch.timer);
  batches.delete(code);
  await fs.rm(batchDir(code), { recursive: true, force: true }).catch(() => {});
}

/** Filet de sécurité : balaie régulièrement les batches expirés. */
function startCleanupSweep() {
  setInterval(() => {
    const now = Date.now();
    for (const [code, batch] of batches) {
      if (batch.expiresAt <= now) deleteBatch(code);
    }
  }, SWEEP_INTERVAL_MS).unref();
}

/** Supprime tout résidu d'un précédent run (démarrage propre). */
async function clearUploadRoot() {
  await fs.rm(UPLOAD_ROOT, { recursive: true, force: true }).catch(() => {});
  await ensureUploadRoot();
}

module.exports = {
  TTL_MS,
  UPLOAD_ROOT,
  createBatch,
  getBatch,
  deleteBatch,
  batchDir,
  startCleanupSweep,
  clearUploadRoot,
};

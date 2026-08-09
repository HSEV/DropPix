(() => {
  'use strict';

  // ---------- Helpers ----------
  const $ = (id) => document.getElementById(id);
  const fmtSize = (bytes) => {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  };
  const fmtTime = (ms) => {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };
  // Racine du site (dossier contenant index.html), pour construire des URLs
  // absolues fiables quelle que soit la profondeur de déploiement.
  const BASE_URL = location.href.replace(/[^/]*(\?.*)?$/, '');

  // ---------- Mémorisation du dernier dépôt (localStorage) ----------
  // Permet de retrouver son code après un rechargement de page tant que le
  // dépôt est encore valide, sans jamais rien envoyer au serveur : la clé
  // reste uniquement dans le navigateur qui a fait l'upload.
  const LAST_BATCH_KEY = 'droppix:lastBatch';

  function saveLastBatch(code, expiresAt) {
    try {
      localStorage.setItem(LAST_BATCH_KEY, JSON.stringify({ code, expiresAt }));
    } catch {
      /* localStorage indisponible (navigation privée stricte...) : tant pis */
    }
  }

  function readLastBatch() {
    try {
      const raw = localStorage.getItem(LAST_BATCH_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data?.code || !data?.expiresAt) return null;
      if (data.expiresAt <= Date.now()) {
        localStorage.removeItem(LAST_BATCH_KEY);
        return null;
      }
      return data;
    } catch {
      return null;
    }
  }

  function clearLastBatch() {
    try {
      localStorage.removeItem(LAST_BATCH_KEY);
    } catch {
      /* rien à faire */
    }
  }

  // ---------- Tabs ----------
  const tabsEl = document.querySelector('.tabs');
  const tabDrop = $('tab-drop');
  const tabRetrieve = $('tab-retrieve');
  const panelDrop = $('panel-drop');
  const panelRetrieve = $('panel-retrieve');

  function showTab(which) {
    const isRetrieve = which === 'retrieve';
    tabDrop.classList.toggle('active', !isRetrieve);
    tabRetrieve.classList.toggle('active', isRetrieve);
    tabDrop.setAttribute('aria-selected', String(!isRetrieve));
    tabRetrieve.setAttribute('aria-selected', String(isRetrieve));
    panelDrop.hidden = isRetrieve;
    panelRetrieve.hidden = !isRetrieve;
    tabsEl.classList.toggle('is-retrieve', isRetrieve);
  }

  tabDrop.addEventListener('click', () => showTab('drop'));
  tabRetrieve.addEventListener('click', () => showTab('retrieve'));

  // ================= DEPOSER =================
  const dropzone = $('dropzone');
  const fileInput = $('file-input');
  const previewList = $('file-preview-list');
  const uploadBtn = $('upload-btn');
  const dropError = $('drop-error');

  const stepSelect = $('drop-step-select');
  const stepUploading = $('drop-step-uploading');
  const stepResult = $('drop-step-result');

  const MAX_FILES = 10;
  const MAX_SIZE = 15 * 1024 * 1024;
  let selectedFiles = [];
  let countdownTimer = null;
  let qrInstance = null;

  function setDropError(msg) {
    if (!msg) {
      dropError.hidden = true;
      dropError.textContent = '';
      return;
    }
    dropError.hidden = false;
    dropError.textContent = msg;
  }

  function renderPreviews() {
    previewList.innerHTML = '';
    previewList.hidden = selectedFiles.length === 0;
    uploadBtn.hidden = selectedFiles.length === 0;
    uploadBtn.disabled = selectedFiles.length === 0;

    selectedFiles.forEach((file, index) => {
      const item = document.createElement('div');
      item.className = 'file-preview-item';

      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      img.alt = file.name;
      img.onload = () => URL.revokeObjectURL(img.src);
      item.appendChild(img);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'file-preview-remove';
      removeBtn.type = 'button';
      removeBtn.setAttribute('aria-label', `Retirer ${file.name}`);
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedFiles.splice(index, 1);
        renderPreviews();
      });
      item.appendChild(removeBtn);

      previewList.appendChild(item);
    });
  }

  function addFiles(fileList) {
    setDropError(null);
    const incoming = Array.from(fileList).filter((f) => f.type.startsWith('image/'));

    if (incoming.length < fileList.length) {
      setDropError('Certains fichiers ont été ignorés : seules les images sont acceptées.');
    }

    for (const file of incoming) {
      if (file.size > MAX_SIZE) {
        setDropError(`"${file.name}" dépasse 15 Mo et a été ignoré.`);
        continue;
      }
      if (selectedFiles.length >= MAX_FILES) {
        setDropError(`Tu peux déposer ${MAX_FILES} images maximum à la fois.`);
        break;
      }
      selectedFiles.push(file);
    }
    renderPreviews();
  }

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });
  fileInput.addEventListener('change', () => {
    addFiles(fileInput.files);
    fileInput.value = '';
  });

  ['dragenter', 'dragover'].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    })
  );
  ['dragleave', 'drop'].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    })
  );
  dropzone.addEventListener('drop', (e) => {
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  });

  function showDropStep(step) {
    stepSelect.hidden = step !== 'select';
    stepUploading.hidden = step !== 'uploading';
    stepResult.hidden = step !== 'result';
  }

  uploadBtn.addEventListener('click', async () => {
    if (selectedFiles.length === 0) return;
    setDropError(null);
    showDropStep('uploading');

    const formData = new FormData();
    selectedFiles.forEach((f) => formData.append('images[]', f));

    try {
      const res = await fetch('api/upload.php', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Échec de l'envoi.");
      showUploadResult(data);
    } catch (e) {
      showDropStep('select');
      setDropError(e.message || 'Erreur réseau, réessaie.');
    }
  });

  function renderQrCode(code) {
    const container = $('result-qr');
    container.innerHTML = '';
    const url = `${BASE_URL}?code=${code}`;
    qrInstance = new QRCode(container, {
      text: url,
      width: 180,
      height: 180,
      colorDark: '#17172b',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M,
    });
  }

  function showUploadResult(batch) {
    showDropStep('result');
    $('result-code').textContent = batch.codeFormatted;
    renderQrCode(batch.code);
    saveLastBatch(batch.code, batch.expiresAt);
    startCountdown($('result-countdown'), batch.expiresAt, () => {
      clearLastBatch();
      showDropStep('select');
      resetDropForm();
    });

    $('result-view-btn').onclick = () => {
      showTab('retrieve');
      $('code-input').value = batch.codeFormatted;
      lookupCode(batch.code);
    };
  }

  function resetDropForm() {
    selectedFiles = [];
    renderPreviews();
    setDropError(null);
    showDropStep('select');
  }

  $('result-reset-btn').addEventListener('click', () => {
    clearLastBatch();
    resetDropForm();
  });

  /** Repli pour les contextes sans Clipboard API ou quand elle échoue. */
  function copyViaExecCommand(text) {
    const tmp = document.createElement('textarea');
    tmp.value = text;
    tmp.style.position = 'fixed';
    tmp.style.opacity = '0';
    document.body.appendChild(tmp);
    tmp.select();
    const ok = document.execCommand('copy');
    tmp.remove();
    if (!ok) throw new Error('execCommand copy a échoué');
  }

  /** Copie un code (formaté "K7P-3XQ") et affiche un retour visuel bref sur le bouton. */
  async function copyCode(formattedCode, btn) {
    const code = formattedCode.replace(/-/g, '');
    try {
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard API indisponible');
        await navigator.clipboard.writeText(code);
      } catch {
        // La Clipboard API peut manquer ou refuser (contexte non sécurisé,
        // permission, focus...) : on retente via l'ancienne méthode avant
        // d'abandonner.
        copyViaExecCommand(code);
      }
      btn.classList.add('copied');
      setTimeout(() => btn.classList.remove('copied'), 1200);
    } catch {
      /* aucune methode de copie disponible, on ignore silencieusement */
    }
  }

  $('copy-code-btn').addEventListener('click', () => {
    copyCode($('result-code').textContent, $('copy-code-btn'));
  });

  // ================= RECUPERER =================
  const codeInput = $('code-input');
  const retrieveForm = $('retrieve-form');
  const retrieveError = $('retrieve-error');
  const stepForm = $('retrieve-step-form');
  const stepLoading = $('retrieve-step-loading');
  const stepGallery = $('retrieve-step-gallery');
  const stepExpired = $('retrieve-step-expired');
  const galleryGrid = $('gallery-grid');

  codeInput.addEventListener('input', () => {
    const raw = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    codeInput.value = raw.length > 3 ? `${raw.slice(0, 3)}-${raw.slice(3)}` : raw;
  });

  function showRetrieveStep(step) {
    stepForm.hidden = step !== 'form';
    stepLoading.hidden = step !== 'loading';
    stepGallery.hidden = step !== 'gallery';
    stepExpired.hidden = step !== 'expired';
  }

  retrieveForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = codeInput.value.replace(/-/g, '');
    if (code.length !== 6) {
      retrieveError.hidden = false;
      retrieveError.textContent = 'Le code fait 6 caractères.';
      return;
    }
    retrieveError.hidden = true;
    lookupCode(code);
  });

  async function lookupCode(code) {
    showRetrieveStep('loading');
    try {
      const res = await fetch(`api/batch.php?code=${encodeURIComponent(code)}`);
      if (res.status === 404) {
        showRetrieveStep('expired');
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur.');
      renderGallery(data);
    } catch (e) {
      showRetrieveStep('form');
      retrieveError.hidden = false;
      retrieveError.textContent = e.message || 'Erreur réseau, réessaie.';
    }
  }

  function renderGallery(batch) {
    showRetrieveStep('gallery');
    galleryGrid.innerHTML = '';
    $('gallery-code-text').textContent = batch.codeFormatted;

    batch.files.forEach((file) => {
      const item = document.createElement('div');
      item.className = 'gallery-item';

      const img = document.createElement('img');
      img.className = 'gallery-thumb';
      img.loading = 'lazy';
      img.src = `api/view.php?code=${batch.code}&id=${file.id}`;
      img.alt = file.name;
      item.appendChild(img);

      const footer = document.createElement('div');
      footer.className = 'gallery-item-footer';

      const name = document.createElement('span');
      name.className = 'gallery-item-name';
      name.textContent = `${file.name} · ${fmtSize(file.size)}`;
      footer.appendChild(name);

      const dl = document.createElement('a');
      dl.className = 'gallery-download';
      dl.href = `api/download.php?code=${batch.code}&id=${file.id}`;
      dl.setAttribute('aria-label', `Télécharger ${file.name}`);
      dl.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none"><path d="M12 4v11m0 0l-4-4m4 4l4-4M5 19h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      footer.appendChild(dl);

      item.appendChild(footer);
      galleryGrid.appendChild(item);
    });

    $('download-all-btn').href = `api/zip.php?code=${batch.code}`;

    startCountdown($('gallery-countdown'), batch.expiresAt, () => {
      const last = readLastBatch();
      if (last?.code === batch.code) clearLastBatch();
      showRetrieveStep('expired');
    });
  }

  $('gallery-copy-code-btn').addEventListener('click', () => {
    copyCode($('gallery-code-text').textContent, $('gallery-copy-code-btn'));
  });

  $('gallery-back-btn').addEventListener('click', () => {
    showRetrieveStep('form');
    codeInput.value = '';
    codeInput.focus();
  });
  $('expired-retry-btn').addEventListener('click', () => {
    showRetrieveStep('form');
    codeInput.value = '';
    codeInput.focus();
  });

  // ---------- Countdown commun ----------
  function startCountdown(el, expiresAt, onExpire) {
    if (countdownTimer) clearInterval(countdownTimer);

    function tick() {
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        clearInterval(countdownTimer);
        el.textContent = 'Expiré';
        onExpire?.();
        return;
      }
      el.textContent = `Expire dans ${fmtTime(remaining)}`;
      el.classList.toggle('warning', remaining < 90 * 1000);
      el.classList.toggle('danger', remaining < 30 * 1000);
    }
    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  // ---------- Auto-remplissage depuis un QR code (?code=XXXXXX) ----------
  const params = new URLSearchParams(location.search);
  const qrCode = params.get('code');
  if (qrCode) {
    showTab('retrieve');
    codeInput.value = qrCode.toUpperCase();
    codeInput.dispatchEvent(new Event('input'));
    lookupCode(qrCode);
    history.replaceState({}, '', location.pathname);
  } else {
    // ---------- Reprise automatique du dernier dépôt (localStorage) ----------
    // Si la page est rechargée alors qu'un dépôt vient d'être fait et que
    // son délai de 5 minutes n'est pas écoulé, on le re-propose directement
    // au lieu de forcer à retaper le code de mémoire.
    restoreLastBatch();
  }

  async function restoreLastBatch() {
    const last = readLastBatch();
    if (!last) return;
    try {
      const res = await fetch(`api/batch.php?code=${encodeURIComponent(last.code)}`);
      if (!res.ok) {
        clearLastBatch();
        return;
      }
      const data = await res.json();
      showUploadResult(data);
    } catch {
      // Pas de réseau ou serveur injoignable : on laisse l'écran par défaut,
      // on retentera au prochain rechargement.
    }
  }
})();

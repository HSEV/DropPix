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
    selectedFiles.forEach((f) => formData.append('images', f));

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Échec de l'envoi.");
      showUploadResult(data);
    } catch (e) {
      showDropStep('select');
      setDropError(e.message || 'Erreur réseau, réessaie.');
    }
  });

  function showUploadResult(batch) {
    showDropStep('result');
    $('result-code').textContent = batch.codeFormatted;
    $('result-qr').src = `/api/qr/${batch.code}`;
    startCountdown($('result-countdown'), batch.expiresAt, () => {
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

  $('result-reset-btn').addEventListener('click', resetDropForm);

  $('copy-code-btn').addEventListener('click', async () => {
    const code = $('result-code').textContent;
    try {
      await navigator.clipboard.writeText(code.replace(/-/g, ''));
      const btn = $('copy-code-btn');
      btn.classList.add('copied');
      setTimeout(() => btn.classList.remove('copied'), 1200);
    } catch {
      /* clipboard indisponible, on ignore silencieusement */
    }
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
      const res = await fetch(`/api/batch/${code}`);
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

    batch.files.forEach((file) => {
      const item = document.createElement('div');
      item.className = 'gallery-item';

      const img = document.createElement('img');
      img.className = 'gallery-thumb';
      img.loading = 'lazy';
      img.src = `/api/batch/${batch.code}/${file.id}/view`;
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
      dl.href = `/api/batch/${batch.code}/${file.id}/download`;
      dl.setAttribute('aria-label', `Télécharger ${file.name}`);
      dl.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none"><path d="M12 4v11m0 0l-4-4m4 4l4-4M5 19h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      footer.appendChild(dl);

      item.appendChild(footer);
      galleryGrid.appendChild(item);
    });

    $('download-all-btn').href = `/api/batch/${batch.code}/zip`;

    startCountdown($('gallery-countdown'), batch.expiresAt, () => {
      showRetrieveStep('expired');
    });
  }

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
  }
})();

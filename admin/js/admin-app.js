/* ==========================================================================
   ADMIN-APP.JS — AS Thiais Tennis de Table — Espace Admin
   ========================================================================== */

(function () {
  'use strict';

  const STORAGE_KEY = 'asthiaistt_admin_cfg';

  // Empêche un bouton de voler le focus (et donc la sélection en cours) au clic —
  // c'est ce qui permet de cliquer sur les boutons de la barre d'outils sans jamais
  // perdre le texte sélectionné dans l'éditeur, comme dans Word.
  function preventFocusSteal(el) {
    el.addEventListener('mousedown', (e) => e.preventDefault());
  }

  // Charge le CSS réel d'une page du site et l'injecte isolé via @scope, pour que
  // l'éditeur visuel affiche le contenu exactement comme sur le site public — sans
  // jamais affecter le reste de l'interface admin (le CSS ne s'applique qu'à l'intérieur
  // du conteneur ciblé par scopeSelector).
  const pageStyleCache = {};

  async function applyRealPageStyles(filePath, scopeSelector, styleTagId) {
    try {
      let css = pageStyleCache[filePath];
      if (css === undefined) {
        const meta = await GitHubAPI.getFileMeta(cfg, filePath);
        const html = GitHubAPI.base64ToUtf8(meta.content);
        const match = html.match(/<style>([\s\S]*?)<\/style>/);
        css = match ? match[1] : '';
        pageStyleCache[filePath] = css;
      }
      let tag = document.getElementById(styleTagId);
      if (!tag) {
        tag = document.createElement('style');
        tag.id = styleTagId;
        document.head.appendChild(tag);
      }
      tag.textContent = css ? `@scope (${scopeSelector}) {\n${css}\n}` : '';
    } catch (err) {
      console.warn('Impossible de charger le style réel de la page :', err.message);
    }
  }

  /* ---------- Vérification des liens/images internes & recherche d'usages sur le site ---------- */

  function isInternalPath(value) {
    if (!value) return false;
    return !/^(https?:|mailto:|tel:|#)/i.test(value);
  }

  function normalizeInternalPath(value) {
    let p = value.split('?')[0].split('#')[0];
    p = p.replace(/^(\.\.\/|\.\/)+/, '');
    return p;
  }

  // Extrait tous les liens <a href> et images <img src> présents dans un bloc de HTML donné.
  function extractPageReferences(bodyHtml) {
    const container = document.createElement('div');
    container.innerHTML = bodyHtml || '';
    const refs = [];
    container.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href');
      if (href) refs.push({ type: 'lien', value: href, text: a.textContent.trim().slice(0, 50) });
    });
    container.querySelectorAll('img[src]').forEach((img) => {
      const src = img.getAttribute('src');
      if (src && !src.startsWith('data:')) refs.push({ type: 'image', value: src, text: img.getAttribute('alt') || '' });
    });
    return refs;
  }

  // Vérifie qu'un chemin interne pointe bien vers un fichier qui existe encore dans le dépôt.
  // Renvoie true / false, ou null si le lien est externe (non vérifiable depuis ici).
  async function checkReferenceExists(value) {
    if (!isInternalPath(value)) return null;
    const path = normalizeInternalPath(value);
    if (!path) return null;
    try {
      await GitHubAPI.getFileMeta(cfg, path);
      return true;
    } catch (err) {
      return false;
    }
  }

  // Liste des fichiers de données passés au crible lors d'une recherche d'usages sur le site.
  const SCANNABLE_DATA_FILES = [
    { path: 'data/news.json', label: 'Actualités' },
    { path: 'data/pages.json', label: 'Pages' },
    { path: 'data/page-content.json', label: 'Contenu du site' },
    { path: 'data/sponsors.json', label: 'Sponsors' },
    { path: 'data/documents.json', label: 'Documents' },
    { path: 'data/liens-utiles.json', label: 'Liens utiles' },
    { path: 'data/albums.json', label: 'Albums photo' },
    { path: 'data/videos.json', label: 'Galerie vidéo' },
    { path: 'data/homepage-settings.json', label: 'Réglages de l\'accueil' },
    { path: 'data/navigation.json', label: 'Ordre des pages' },
    { path: 'data/site-config.json', label: 'Réglages globaux' }
  ];

  // Cherche partout sur le site (fiches équipes comprises) où une adresse/chemin donné est utilisé.
  // excludePath permet d'ignorer le fichier en cours d'édition (pour ne pas se signaler lui-même).
  async function scanSiteForUsages(needle, excludePath) {
    if (!needle) return [];
    const results = [];

    for (const { path, label } of SCANNABLE_DATA_FILES) {
      if (path === excludePath) continue;
      try {
        const data = await readFile(path);
        if (JSON.stringify(data).includes(needle)) {
          results.push({ label, path });
        }
      } catch (err) { /* fichier absent ou illisible : ignoré */ }
    }

    try {
      const teamsIndex = await readFile(TEAMS_INDEX_PATH);
      for (const id of (teamsIndex.teamIds || [])) {
        const path = teamPath(id);
        if (path === excludePath) continue;
        try {
          const team = await readFile(path);
          if (JSON.stringify(team).includes(needle)) {
            results.push({ label: `Équipe : ${team.name || id}`, path });
          }
        } catch (err) { /* équipe illisible : ignorée */ }
      }
    } catch (err) { /* index des équipes indisponible */ }

    return results;
  }

  // Demande confirmation avant une suppression, en prévenant si le fichier/lien est
  // utilisé ailleurs sur le site. excludePath ignore le fichier de données en cours d'édition.
  async function confirmDeleteWithUsageCheck(value, excludePath, itemLabel) {
    let usages = [];
    if (value && isInternalPath(value)) {
      try {
        usages = await scanSiteForUsages(value, excludePath);
      } catch (err) { /* le scan a échoué : on continue sans bloquer la suppression */ }
    }

    if (usages.length === 0) {
      return showConfirmModal(`Supprimer ${itemLabel} ? Cette action est immédiate.`);
    }

    const list = usages.map((u) => `• ${u.label}`).join('\n');
    return showConfirmModal(
      `Attention : ce fichier est aussi utilisé ailleurs sur le site :\n${list}\n\nLe supprimer va casser son affichage à ces endroits. Continuer quand même ?`,
      { danger: true, confirmLabel: 'Supprimer quand même' }
    );
  }

  // Certains liens/images sont parfois collés en adresse complète (plutôt qu'en chemin relatif),
  // ex : https://redfloat.github.io/as-thiais-tt/docs/x.pdf. On les détecte partout sur le site
  // et on vérifie que le fichier visé existe bien dans le dépôt.
  const SITE_BASE_URL = 'https://redfloat.github.io/as-thiais-tt/';
  const ABSOLUTE_SITE_URL_PATTERN = /https:\/\/redfloat\.github\.io\/as-thiais-tt\/[^"'\s\\]*/g;

  async function findBrokenAbsoluteSiteLinks() {
    const occurrences = []; // { label, url }

    for (const { path, label } of SCANNABLE_DATA_FILES) {
      try {
        const data = await readFile(path);
        const matches = JSON.stringify(data).match(ABSOLUTE_SITE_URL_PATTERN) || [];
        matches.forEach((url) => occurrences.push({ label, url }));
      } catch (err) { /* fichier absent ou illisible : ignoré */ }
    }

    try {
      const teamsIndex = await readFile(TEAMS_INDEX_PATH);
      for (const id of (teamsIndex.teamIds || [])) {
        try {
          const team = await readFile(teamPath(id));
          const matches = JSON.stringify(team).match(ABSOLUTE_SITE_URL_PATTERN) || [];
          matches.forEach((url) => occurrences.push({ label: `Équipe : ${team.name || id}`, url }));
        } catch (err) { /* équipe illisible : ignorée */ }
      }
    } catch (err) { /* index des équipes indisponible */ }

    if (occurrences.length === 0) return [];

    // On ne vérifie chaque adresse unique qu'une seule fois, même si elle apparaît à plusieurs endroits
    const uniqueUrls = [...new Set(occurrences.map((o) => o.url))];
    const brokenUrls = new Set();
    for (const url of uniqueUrls) {
      const repoPath = url.slice(SITE_BASE_URL.length).split('?')[0].split('#')[0];
      if (!repoPath) continue;
      try {
        await GitHubAPI.getFileMeta(cfg, decodeURIComponent(repoPath));
      } catch (err) {
        brokenUrls.add(url);
      }
    }

    if (brokenUrls.size === 0) return [];
    return occurrences
      .filter((o) => brokenUrls.has(o.url))
      .map((o) => `${o.label} → ${o.url}`);
  }

  // Crée le lien puis ajoute un title=url sur le <a> fraîchement inséré,
  // pour que l'adresse s'affiche en infobulle native au survol.
  function createLinkWithTooltip(editor, url) {
    document.execCommand('createLink', false, url);
    editor.querySelectorAll(`a[href="${CSS.escape(url)}"]`).forEach((a) => {
      if (!a.title) a.title = url;
    });
  }

  const TEXT_COLOR_SWATCHES = [
    '#000000', '#374151', '#6b7280', '#ffffff',
    '#dc2626', '#ea580c', '#d97706', '#16a34a',
    '#0891b2', '#2563eb', '#4f46e5', '#9333ea'
  ];

  function getSelectionFontSize(editor) {
    const sel = window.getSelection();
    if (sel.rangeCount === 0) return 16;
    let node = sel.anchorNode;
    if (node && node.nodeType === 3) node = node.parentElement;
    while (node && node !== editor && editor.contains(node)) {
      if (node.style && node.style.fontSize) return parseInt(node.style.fontSize, 10);
      node = node.parentElement;
    }
    return 16;
  }

  function stepFontSize(editor, delta, readoutEl) {
    const sel = window.getSelection();
    if (sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed || !editor.contains(range.commonAncestorContainer)) return;

    // Si la sélection correspond exactement au contenu d'un span de taille déjà posé
    // par un clic précédent, on ajuste directement ce même span (pas d'empilement).
    const container = range.commonAncestorContainer;
    const wrapper = container.nodeType === 3 ? container.parentElement : container;

    if (wrapper && wrapper.tagName === 'SPAN' && wrapper.style.fontSize &&
        wrapper.textContent === range.toString() && editor.contains(wrapper)) {
      const current = parseInt(wrapper.style.fontSize, 10) || 16;
      const next = Math.max(5, Math.min(75, current + delta));
      wrapper.style.fontSize = next + 'px';
      if (readoutEl) readoutEl.textContent = next + 'px';
      return;
    }

    const current = getSelectionFontSize(editor);
    const next = Math.max(5, Math.min(75, current + delta));
    const span = document.createElement('span');
    span.style.fontSize = next + 'px';
    try {
      range.surroundContents(span);
    } catch (e) {
      const contents = range.extractContents();
      span.appendChild(contents);
      range.insertNode(span);
    }
    sel.removeAllRanges();
    const newRange = document.createRange();
    newRange.selectNodeContents(span);
    sel.addRange(newRange);
    if (readoutEl) readoutEl.textContent = next + 'px';
  }

  function setupColorPicker(toggleBtn, panelEl) {
    panelEl.innerHTML = TEXT_COLOR_SWATCHES.map((c) =>
      `<button type="button" class="color-swatch" data-color="${c}" style="background:${c};" title="${c}"></button>`
    ).join('');

    preventFocusSteal(toggleBtn);
    toggleBtn.addEventListener('click', () => {
      document.querySelectorAll('.color-swatch-panel').forEach((p) => { if (p !== panelEl) p.classList.add('hidden'); });
      panelEl.classList.toggle('hidden');
    });

    panelEl.querySelectorAll('.color-swatch').forEach((btn) => {
      preventFocusSteal(btn);
      btn.addEventListener('click', () => {
        document.execCommand('foreColor', false, btn.dataset.color);
        panelEl.classList.add('hidden');
      });
    });

    document.addEventListener('click', (e) => {
      if (!panelEl.contains(e.target) && e.target !== toggleBtn && !toggleBtn.contains(e.target)) {
        panelEl.classList.add('hidden');
      }
    });
  }

  // Câble la taille (avec affichage en direct dès qu'on sélectionne du texte) et la couleur.
  function setupRichTextExtras(editor, ids) {
    const sizeMinus = document.getElementById(ids.sizeMinus);
    const sizePlus = document.getElementById(ids.sizePlus);
    const sizeReadout = document.getElementById(ids.sizeReadout);

    preventFocusSteal(sizeMinus);
    preventFocusSteal(sizePlus);
    sizeMinus.addEventListener('click', () => stepFontSize(editor, -1, sizeReadout));
    sizePlus.addEventListener('click', () => stepFontSize(editor, 1, sizeReadout));

    document.addEventListener('selectionchange', () => {
      const sel = window.getSelection();
      if (sel.rangeCount === 0 || !sel.anchorNode || !editor.contains(sel.anchorNode)) return;
      sizeReadout.textContent = getSelectionFontSize(editor) + 'px';
    });

    setupColorPicker(document.getElementById(ids.colorToggle), document.getElementById(ids.colorPanel));
  }

  /* ---------- Fenêtre modale générique (remplace confirm() / prompt() natifs) ---------- */

  function showModal({ title, message, isPrompt, defaultValue = '', placeholder = '', danger = false, confirmLabel }) {
    return new Promise((resolve) => {
      const overlay = document.getElementById('modalOverlay');
      const inputWrap = document.getElementById('modalInputWrap');
      const input = document.getElementById('modalInput');
      const confirmBtn = document.getElementById('modalConfirmBtn');
      const cancelBtn = document.getElementById('modalCancelBtn');

      document.getElementById('modalTitle').textContent = title || (isPrompt ? 'Saisie' : 'Confirmation');
      document.getElementById('modalMessage').textContent = message || '';
      confirmBtn.textContent = confirmLabel || (isPrompt ? 'OK' : 'Confirmer');
      confirmBtn.classList.toggle('btn-danger', !!danger);
      confirmBtn.classList.toggle('btn-primary', !danger);

      if (isPrompt) {
        inputWrap.classList.remove('hidden');
        input.value = defaultValue;
        input.placeholder = placeholder;
      } else {
        inputWrap.classList.add('hidden');
      }

      overlay.classList.remove('hidden');
      if (isPrompt) setTimeout(() => input.focus(), 50);

      function cleanup(result) {
        overlay.classList.add('hidden');
        confirmBtn.removeEventListener('click', onConfirm);
        cancelBtn.removeEventListener('click', onCancel);
        overlay.removeEventListener('click', onOverlayClick);
        document.removeEventListener('keydown', onKeydown);
        resolve(result);
      }
      function onConfirm() { cleanup(isPrompt ? (input.value.trim() || null) : true); }
      function onCancel() { cleanup(isPrompt ? null : false); }
      function onOverlayClick(e) { if (e.target === overlay) onCancel(); }
      function onKeydown(e) {
        if (e.key === 'Escape') onCancel();
        if (e.key === 'Enter' && isPrompt) onConfirm();
      }

      confirmBtn.addEventListener('click', onConfirm);
      cancelBtn.addEventListener('click', onCancel);
      overlay.addEventListener('click', onOverlayClick);
      document.addEventListener('keydown', onKeydown);
    });
  }

  function showConfirmModal(message, opts = {}) {
    return showModal(Object.assign({ message, isPrompt: false }, opts));
  }

  function showPromptModal(message, defaultValue = '', opts = {}) {
    return showModal(Object.assign({ message, isPrompt: true, defaultValue }, opts));
  }

  // Paramètres techniques fixes (transparents pour l'utilisateur de l'admin)
  const REPO_OWNER = 'redfloat';
  const REPO_NAME = 'as-thiais-tt';
  const REPO_BRANCH = 'main';

  let cfg = null; // { token, owner, repo, branch }
  const fileState = {}; // cache { path: { json, sha } } des fichiers déjà lus

  /* ---------- Éléments DOM ---------- */

  const loginScreen = document.getElementById('loginScreen');
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  const loginSubmitBtn = document.getElementById('loginSubmitBtn');

  const adminApp = document.getElementById('adminApp');
  const logoutBtn = document.getElementById('logoutBtn');

  /* ---------- Stockage local de la config (facultatif) ---------- */

  function loadStoredConfig() {
    const raw = localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function storeConfig(config, remember) {
    const raw = JSON.stringify(config);
    if (remember) {
      localStorage.setItem(STORAGE_KEY, raw);
    } else {
      sessionStorage.setItem(STORAGE_KEY, raw);
    }
  }

  function clearStoredConfig() {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
  }

  /* ---------- Connexion ---------- */

  function showLoginError(message) {
    loginError.textContent = message;
    loginError.classList.remove('hidden');
  }

  function hideLoginError() {
    loginError.classList.add('hidden');
  }

  async function attemptLogin(config, remember) {
    loginSubmitBtn.disabled = true;
    loginSubmitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Connexion...';
    hideLoginError();

    try {
      await GitHubAPI.testConnection(config);
      cfg = config;
      storeConfig(config, remember);
      enterAdminApp();
    } catch (err) {
      showLoginError(err.message || 'Connexion impossible.');
    } finally {
      loginSubmitBtn.disabled = false;
      loginSubmitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Se connecter';
    }
  }

  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const config = {
      token: document.getElementById('ghToken').value.trim(),
      owner: REPO_OWNER,
      repo: REPO_NAME,
      branch: REPO_BRANCH
    };
    const remember = document.getElementById('rememberMe').checked;
    attemptLogin(config, remember);
  });

  logoutBtn.addEventListener('click', () => {
    clearStoredConfig();
    cfg = null;
    Object.keys(fileState).forEach((k) => delete fileState[k]);
    adminApp.classList.add('hidden');
    loginScreen.classList.remove('hidden');
  });

  /* ---------- Entrée dans l'app ---------- */

  function enterAdminApp() {
    loginScreen.classList.add('hidden');
    adminApp.classList.remove('hidden');
    loadDashboard();
  }

  /* ---------- Navigation entre vues ---------- */

  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('is-active'));
      document.querySelectorAll('.admin-view').forEach((v) => v.classList.remove('is-active'));
      btn.classList.add('is-active');
      document.getElementById('view-' + btn.dataset.view).classList.add('is-active');

      if (btn.dataset.view === 'settings') loadSettingsView();
      if (btn.dataset.view === 'dashboard') loadDashboard();
      if (btn.dataset.view === 'sponsors') loadSponsorsView();
      if (btn.dataset.view === 'documents') loadDocumentsView();
      if (btn.dataset.view === 'navigation') loadNavigationView();
      if (btn.dataset.view === 'teams') loadTeamsView();
      if (btn.dataset.view === 'news') loadNewsView();
      if (btn.dataset.view === 'links') loadLinksView();
      if (btn.dataset.view === 'albums') loadAlbumsView();
      if (btn.dataset.view === 'videos') loadVideosView();
      if (btn.dataset.view === 'birthdays') loadBirthdaysView();
      if (btn.dataset.view === 'pages') loadPagesView();
      if (btn.dataset.view === 'sitecontent') loadStaticContentView();
      if (btn.dataset.view === 'media') loadMediaView();
    });
  });

  /* ---------- Sélecteur d'icônes visuel (réutilisable) ---------- */

  const ICON_CHOICES = [
    'fa-file', 'fa-file-lines', 'fa-file-pdf', 'fa-file-word', 'fa-file-arrow-down',
    'fa-folder', 'fa-folder-open', 'fa-calendar-days', 'fa-calendar-check', 'fa-file-medical',
    'fa-stethoscope', 'fa-id-card', 'fa-link', 'fa-globe', 'fa-city',
    'fa-map', 'fa-flag', 'fa-trophy', 'fa-chart-line', 'fa-chart-simple',
    'fa-table-tennis-paddle-ball', 'fa-bag-shopping', 'fa-store', 'fa-magnifying-glass', 'fa-house',
    'fa-users', 'fa-people-group', 'fa-envelope', 'fa-phone', 'fa-newspaper',
    'fa-book', 'fa-graduation-cap', 'fa-heart', 'fa-star', 'fa-gear',
    'fa-circle-info', 'fa-triangle-exclamation', 'fa-download', 'fa-upload', 'fa-image',
    'fa-video', 'fa-music', 'fa-handshake', 'fa-gavel', 'fa-scale-balanced',
    'fa-clipboard', 'fa-clipboard-list', 'fa-list', 'fa-location-dot'
  ];

  function setupIconPicker(inputId, triggerId, previewId, panelId) {
    const input = document.getElementById(inputId);
    const trigger = document.getElementById(triggerId);
    const preview = document.getElementById(previewId);
    const panel = document.getElementById(panelId);

    panel.innerHTML = ICON_CHOICES.map((ic) =>
      `<button type="button" class="icon-choice" data-icon="${ic}" title="${ic}"><i class="fa-solid ${ic}"></i></button>`
    ).join('');

    function refresh() {
      const current = input.value || ICON_CHOICES[0];
      preview.className = 'fa-solid ' + current;
      panel.querySelectorAll('.icon-choice').forEach((btn) => {
        btn.classList.toggle('is-selected', btn.dataset.icon === current);
      });
    }

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.icon-picker-panel').forEach((p) => {
        if (p !== panel) p.classList.add('hidden');
      });
      panel.classList.toggle('hidden');
    });

    panel.querySelectorAll('.icon-choice').forEach((btn) => {
      btn.addEventListener('click', () => {
        input.value = btn.dataset.icon;
        refresh();
        panel.classList.add('hidden');
      });
    });

    document.addEventListener('click', (e) => {
      if (!panel.contains(e.target) && e.target !== trigger && !trigger.contains(e.target)) {
        panel.classList.add('hidden');
      }
    });

    refresh();
    return refresh;
  }

  const refreshDocIconPreview = setupIconPicker('docIcon', 'docIconTrigger', 'docIconPreview', 'docIconPanel');
  const refreshLinkIconPreview = setupIconPicker('linkIcon', 'linkIconTrigger', 'linkIconPreview', 'linkIconPanel');

  function populateSeasonSelect(selectEl, seasons, selected) {
    selectEl.innerHTML = (seasons || [])
      .map((s) => `<option value="${s}" ${s === selected ? 'selected' : ''}>${s}</option>`)
      .join('');
  }

  async function addNewSeason(inputEl, statusEl, onSuccess) {
    const season = inputEl.value.trim();
    if (!season) { setStatus(statusEl, 'error', 'Donne un nom à la saison avant de l\'ajouter.'); return; }
    setStatus(statusEl, 'loading', 'Ajout en cours…');
    try {
      if (!fileState[SEASONS_PATH]) await readFile(SEASONS_PATH);
      const seasons = fileState[SEASONS_PATH].json.seasons || [];
      if (!seasons.includes(season)) {
        const updatedSeasons = seasons.concat(season);
        const sha = fileState[SEASONS_PATH].sha;
        const result = await GitHubAPI.saveJSON(cfg, SEASONS_PATH, { seasons: updatedSeasons }, sha, `Admin : ajout de la saison "${season}"`);
        fileState[SEASONS_PATH] = { json: { seasons: updatedSeasons }, sha: result.content.sha };
      }
      onSuccess(fileState[SEASONS_PATH].json.seasons, season);
      inputEl.value = '';
      setStatus(statusEl, 'success', 'Saison disponible !');
    } catch (err) {
      setStatus(statusEl, 'error', 'Erreur : ' + err.message);
    }
  }

  /* ---------- Aide : lecture avec cache ---------- */

  async function readFile(path) {
    const result = await GitHubAPI.getJSON(cfg, path);
    fileState[path] = result;
    return result.json;
  }

  // Les chemins d'images sont stockés en relatif à la racine du site (ex: "./imgs/...")
  // pour fonctionner correctement sur les pages publiques. Cette page admin étant dans
  // un sous-dossier /admin/, il faut remonter d'un niveau pour que l'image s'affiche ici.
  function adminAssetPath(path) {
    if (!path) return path;
    return path.replace(/^\.\//, '../');
  }

  /* ---------- Tableau de bord ---------- */

  function daysBetween(dateStr) {
    const target = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((target - today) / 86400000);
  }

  document.getElementById('checkSiteLinksBtn').addEventListener('click', async () => {
    const btn = document.getElementById('checkSiteLinksBtn');
    const resultEl = document.getElementById('siteLinksCheckResult');
    btn.disabled = true;
    resultEl.innerHTML = '<p style="color:var(--color-text-muted); font-size:0.85rem;"><i class="fa-solid fa-spinner fa-spin"></i> Analyse en cours, ça peut prendre quelques instants…</p>';

    try {
      const sources = [];

      const pagesData = await readFile('data/pages.json').catch(() => ({ pages: [] }));
      (pagesData.pages || []).forEach((p) => sources.push({ label: `Page : ${p.title}`, body: p.body }));

      const contentData = await readFile(STATIC_CONTENT_PATH).catch(() => ({ pages: {} }));
      Object.values(contentData.pages || {}).forEach((p) => sources.push({ label: `Contenu du site : ${p.label}`, body: p.body }));

      const broken = [];
      for (const source of sources) {
        const refs = extractPageReferences(source.body);
        for (const ref of refs) {
          const exists = await checkReferenceExists(ref.value);
          if (exists === false) {
            broken.push(`${source.label} → ${ref.type} introuvable : ${ref.value}`);
          }
        }
      }

      resultEl.innerHTML = '';
      if (broken.length === 0) {
        resultEl.appendChild(buildAlert('alert-success', 'fa-circle-check', 'Aucun lien ni image cassé trouvé', []));
      } else {
        resultEl.appendChild(buildAlert('alert-danger', 'fa-triangle-exclamation',
          `${broken.length} lien${broken.length > 1 ? 's' : ''}/image${broken.length > 1 ? 's' : ''} introuvable${broken.length > 1 ? 's' : ''}`, broken));
      }
    } catch (err) {
      resultEl.innerHTML = '';
      resultEl.appendChild(buildAlert('alert-danger', 'fa-triangle-exclamation', 'Erreur pendant l\'analyse', [err.message]));
    } finally {
      btn.disabled = false;
    }
  });

  async function loadDashboard() {
    const alertsEl = document.getElementById('dashboardAlerts');
    const statsEl = document.getElementById('dashboardStats');
    alertsEl.innerHTML = '<p style="color:var(--color-text-muted); font-size:0.88rem;"><i class="fa-solid fa-spinner fa-spin"></i> Chargement…</p>';
    statsEl.innerHTML = '';

    try {
      const [documentsData, sponsorsData, newsData, siteConfig, teamsIndex] = await Promise.all([
        readFile('data/documents.json'),
        readFile('data/sponsors.json'),
        readFile('data/news.json'),
        readFile('data/site-config.json'),
        readFile('data/teams/index.json').catch(() => ({ teamIds: [] }))
      ]);

      const teamIds = teamsIndex.teamIds || [];
      const teams = (await Promise.all(teamIds.map((id) => readFile(`data/teams/${id}.json`).catch(() => null)))).filter(Boolean);

      /* --- Alertes documents --- */
      const expired = [];
      const soon = [];
      let totalDocs = 0;

      (documentsData.categories || []).forEach((cat) => {
        (cat.documents || []).forEach((doc) => {
          totalDocs++;
          if (!doc.expirationDate) return;
          const diff = daysBetween(doc.expirationDate);
          if (diff < 0) expired.push(doc);
          else if (diff <= 30) soon.push({ doc, diff });
        });
      });

      /* --- Alertes résultats de matchs à saisir --- */
      const pendingResults = [];
      teams.forEach((team) => {
        (team.matches || []).forEach((match) => {
          if (match.status === 'upcoming' && match.date && daysBetween(match.date) < 0) {
            pendingResults.push(`${team.name} vs ${match.opponent} (${match.date.split('-').reverse().join('/')})`);
          }
        });
      });

      /* --- Alertes classement de fin de phase à renseigner --- */
      const classificationNeeded = [];
      teams.forEach((team) => {
        const matches = team.matches || [];
        if (matches.length === 0) return;
        const lastMatchDate = matches.reduce((latest, m) => (m.date && m.date > latest ? m.date : latest), '');
        if (!lastMatchDate || daysBetween(lastMatchDate) >= 0) return;
        const c = team.classification || {};
        const hasClassification = c.rank || c.status;
        if (!hasClassification) {
          classificationNeeded.push(`${team.name} (dernier match le ${lastMatchDate.split('-').reverse().join('/')})`);
        }
      });

      alertsEl.innerHTML = '';

      if (pendingResults.length > 0) {
        alertsEl.appendChild(
          buildAlert('alert-warning', 'fa-table-tennis-paddle-ball',
            `${pendingResults.length} résultat${pendingResults.length > 1 ? 's' : ''} de match à saisir`,
            pendingResults)
        );
      }

      if (classificationNeeded.length > 0) {
        alertsEl.appendChild(
          buildAlert('alert-warning', 'fa-ranking-star',
            `${classificationNeeded.length} classement${classificationNeeded.length > 1 ? 's' : ''} de fin de phase à renseigner`,
            classificationNeeded)
        );
      }

      if (expired.length > 0) {
        alertsEl.appendChild(
          buildAlert('alert-danger', 'fa-triangle-exclamation',
            `${expired.length} document${expired.length > 1 ? 's' : ''} expiré${expired.length > 1 ? 's' : ''}`,
            expired.map((d) => d.title))
        );
      }

      if (soon.length > 0) {
        alertsEl.appendChild(
          buildAlert('alert-warning', 'fa-clock',
            `${soon.length} document${soon.length > 1 ? 's' : ''} bientôt à renouveler`,
            soon.map(({ doc, diff }) => `${doc.title} (dans ${diff} jour${diff > 1 ? 's' : ''})`))
        );
      }

      if (expired.length === 0 && soon.length === 0 && pendingResults.length === 0 && classificationNeeded.length === 0) {
        alertsEl.appendChild(
          buildAlert('alert-success', 'fa-circle-check', 'Tout est à jour, rien à traiter pour le moment', [])
        );
      }

      // Vérification des liens/images en adresse absolue cassés : en tâche de fond,
      // ajoutée séparément dès qu'elle est prête, pour ne pas ralentir l'affichage du reste.
      findBrokenAbsoluteSiteLinks()
        .then((broken) => {
          if (broken.length === 0) return;
          alertsEl.appendChild(
            buildAlert('alert-danger', 'fa-link-slash',
              `${broken.length} lien${broken.length > 1 ? 's' : ''}/image${broken.length > 1 ? 's' : ''} en adresse absolue introuvable${broken.length > 1 ? 's' : ''}`,
              broken)
          );
        })
        .catch((err) => console.warn('Vérification des liens absolus impossible :', err.message));

      /* --- Statistiques --- */
      statsEl.innerHTML = `
        <div class="stat-box">
          <div class="stat-value">${siteConfig.season || '—'}</div>
          <div class="stat-label">Saison actuelle</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${totalDocs}</div>
          <div class="stat-label">Documents</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${teams.length}</div>
          <div class="stat-label">${teams.length === 1 ? 'Équipe' : 'Équipes'}</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${(sponsorsData.sponsors || []).length}</div>
          <div class="stat-label">Sponsors</div>
        </div>
      `;
    } catch (err) {
      alertsEl.innerHTML = '';
      alertsEl.appendChild(
        buildAlert('alert-danger', 'fa-triangle-exclamation', 'Impossible de charger le tableau de bord', [err.message])
      );
    }
  }

  function buildAlert(cls, icon, title, items) {
    const div = document.createElement('div');
    div.className = 'alert-banner ' + cls;
    let html = `<i class="fa-solid ${icon}"></i><div><strong>${title}</strong>`;
    if (items && items.length > 0) {
      html += '<ul>' + items.map((i) => `<li>${i}</li>`).join('') + '</ul>';
    }
    html += '</div>';
    div.innerHTML = html;
    return div;
  }

  /* ---------- Réglages globaux ---------- */

  const settingsForm = document.getElementById('settingsForm');
  const settingsStatus = document.getElementById('settingsStatus');
  const socialsForm = document.getElementById('socialsForm');
  const socialsStatus = document.getElementById('socialsStatus');
  const logoForm = document.getElementById('logoForm');
  const logoStatus = document.getElementById('logoStatus');
  const logoInput = document.getElementById('logoInput');
  const logoPreviewWrap = document.getElementById('logoPreviewWrap');

  let pendingLogoFile = null;
  let currentLogoPath = '';

  logoInput.addEventListener('change', () => {
    const file = logoInput.files[0];
    if (!file) return;
    pendingLogoFile = file;
    const reader = new FileReader();
    reader.onload = () => {
      logoPreviewWrap.innerHTML = `<img class="logo-preview" src="${reader.result}" alt="">`;
    };
    reader.readAsDataURL(file);
  });

  async function loadSettingsView() {
    setStatus(settingsStatus, 'loading', 'Chargement…');
    try {
      const config = await readFile('data/site-config.json');
      document.getElementById('settingsSeason').value = config.season || '';
      document.getElementById('settingsCalendarUrl').value = config.calendarEmbedUrl || '';
      document.getElementById('settingsFacebook').value = config.facebookUrl || '';
      document.getElementById('settingsInstagram').value = config.instagramUrl || '';
      currentLogoPath = config.logoUrl || '';
      if (currentLogoPath) {
        logoPreviewWrap.innerHTML = `<img class="logo-preview" src="${adminAssetPath(currentLogoPath)}" alt="">`;
      }
      hideStatus(settingsStatus);
      hideStatus(socialsStatus);
      hideStatus(logoStatus);
    } catch (err) {
      setStatus(settingsStatus, 'error', 'Erreur de chargement : ' + err.message);
    }
  }

  logoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!pendingLogoFile) {
      setStatus(logoStatus, 'error', 'Choisis d\'abord une image avant d\'enregistrer.');
      return;
    }

    const saveBtn = document.getElementById('logoSaveBtn');
    saveBtn.disabled = true;
    setStatus(logoStatus, 'loading', 'Envoi du logo en cours…');

    try {
      const ext = (pendingLogoFile.name.split('.').pop() || 'png').toLowerCase();
      const path = `imgs/logo.${ext}`;
      await GitHubAPI.uploadFile(cfg, path, pendingLogoFile, 'Admin : mise à jour du logo du club');
      const logoUrl = './' + path;

      // Si l'ancien logo avait une extension différente, on nettoie le fichier devenu inutile
      if (currentLogoPath && currentLogoPath.includes('imgs/logo.') && toRepoPath(currentLogoPath) !== path) {
        await deleteFileIfExists(toRepoPath(currentLogoPath));
      }

      const settingsPath = 'data/site-config.json';
      if (!fileState[settingsPath]) await readFile(settingsPath);
      const current = fileState[settingsPath].json;
      const updated = Object.assign({}, current, { logoUrl });
      const sha = fileState[settingsPath].sha;
      const result = await GitHubAPI.saveJSON(cfg, settingsPath, updated, sha, 'Admin : mise à jour du logo du club');
      fileState[settingsPath] = { json: updated, sha: result.content.sha };

      currentLogoPath = logoUrl;
      pendingLogoFile = null;
      setStatus(logoStatus, 'success', 'Logo mis à jour ! Le site se mettra à jour d\'ici 1 à 2 minutes.');
    } catch (err) {
      setStatus(logoStatus, 'error', 'Erreur : ' + err.message);
    } finally {
      saveBtn.disabled = false;
    }
  });

  settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const saveBtn = document.getElementById('settingsSaveBtn');
    saveBtn.disabled = true;
    setStatus(settingsStatus, 'loading', 'Enregistrement en cours…');

    try {
      const path = 'data/site-config.json';
      if (!fileState[path]) await readFile(path);
      const current = fileState[path].json;
      const updated = Object.assign({}, current, {
        season: document.getElementById('settingsSeason').value.trim(),
        calendarEmbedUrl: document.getElementById('settingsCalendarUrl').value.trim()
      });

      const sha = fileState[path] ? fileState[path].sha : undefined;
      const result = await GitHubAPI.saveJSON(
        cfg, path, updated, sha,
        'Admin : mise à jour des réglages globaux (saison / calendrier)'
      );

      fileState[path] = { json: updated, sha: result.content.sha };
      setStatus(settingsStatus, 'success', 'Enregistré ! Le site se mettra à jour d\'ici 1 à 2 minutes.');
    } catch (err) {
      setStatus(settingsStatus, 'error', 'Erreur : ' + err.message);
    } finally {
      saveBtn.disabled = false;
    }
  });

  function setStatus(el, type, message) {
    el.className = 'status-msg is-visible status-' + type;
    el.textContent = message;
  }

  function hideStatus(el) {
    el.className = 'status-msg';
    el.textContent = '';
  }

  socialsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const saveBtn = document.getElementById('socialsSaveBtn');
    saveBtn.disabled = true;
    setStatus(socialsStatus, 'loading', 'Enregistrement en cours…');

    try {
      const path = 'data/site-config.json';
      if (!fileState[path]) await readFile(path);
      const current = fileState[path].json;
      const updated = Object.assign({}, current, {
        facebookUrl: document.getElementById('settingsFacebook').value.trim(),
        instagramUrl: document.getElementById('settingsInstagram').value.trim()
      });

      const sha = fileState[path] ? fileState[path].sha : undefined;
      const result = await GitHubAPI.saveJSON(
        cfg, path, updated, sha,
        'Admin : mise à jour des liens réseaux sociaux'
      );

      fileState[path] = { json: updated, sha: result.content.sha };
      setStatus(socialsStatus, 'success', 'Enregistré ! Le site se mettra à jour d\'ici 1 à 2 minutes.');
    } catch (err) {
      setStatus(socialsStatus, 'error', 'Erreur : ' + err.message);
    } finally {
      saveBtn.disabled = false;
    }
  });

  /* ---------- Sponsors ---------- */

  const SPONSORS_PATH = 'data/sponsors.json';
  const sponsorForm = document.getElementById('sponsorForm');
  const sponsorStatus = document.getElementById('sponsorStatus');
  const sponsorsList = document.getElementById('sponsorsList');
  const sponsorsCount = document.getElementById('sponsorsCount');
  const sponsorCancelBtn = document.getElementById('sponsorCancelBtn');
  const sponsorSaveLabel = document.getElementById('sponsorSaveLabel');

  async function loadSponsorsView() {
    sponsorsList.innerHTML = '<p style="color:var(--color-text-muted); font-size:0.88rem;"><i class="fa-solid fa-spinner fa-spin"></i> Chargement…</p>';
    try {
      const data = await readFile(SPONSORS_PATH);
      renderSponsorsList(data.sponsors || []);
    } catch (err) {
      sponsorsList.innerHTML = '';
      sponsorsList.appendChild(
        buildAlert('alert-danger', 'fa-triangle-exclamation', 'Impossible de charger les sponsors', [err.message])
      );
    }
  }

  function renderSponsorsList(sponsors) {
    sponsorsCount.textContent = sponsors.length;
    sponsorsList.innerHTML = '';

    if (sponsors.length === 0) {
      sponsorsList.innerHTML = '<p class="empty-list-msg">Aucun sponsor pour le moment.</p>';
      return;
    }

    sponsors.forEach((sponsor) => {
      const row = document.createElement('div');
      row.className = 'admin-list-item';
      row.innerHTML = `
        <div class="admin-list-thumb"><img src="${adminAssetPath(sponsor.logo)}" alt=""></div>
        <div class="admin-list-info">
          <strong>${sponsor.name}</strong>
          <span>${sponsor.link || 'Pas de lien renseigné'}</span>
        </div>
        <div class="admin-list-actions">
          <a href="../sponsor.html?id=${sponsor.id}" target="_blank" rel="noopener" class="view-link-btn" title="Voir sa fiche"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>
          <button type="button" class="edit-btn" title="Modifier"><i class="fa-solid fa-pen"></i></button>
          <button type="button" class="delete-btn" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
        </div>
      `;

      row.querySelector('.edit-btn').addEventListener('click', () => startEditSponsor(sponsor));
      row.querySelector('.delete-btn').addEventListener('click', () => deleteSponsor(sponsor.id));

      sponsorsList.appendChild(row);
    });
  }

  function slugify(str) {
    return str
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  function generateSponsorId(name, existingSponsors) {
    const base = slugify(name) || 'sponsor';
    let id = base;
    let counter = 2;
    const existingIds = existingSponsors.map((s) => s.id);
    while (existingIds.includes(id)) {
      id = `${base}-${counter}`;
      counter++;
    }
    return id;
  }

  let sponsorSlugManuallyEdited = false;

  function startEditSponsor(sponsor) {
    document.getElementById('sponsorId').value = sponsor.id;
    document.getElementById('sponsorName').value = sponsor.name || '';
    document.getElementById('sponsorSlug').value = sponsor.id || '';
    sponsorSlugManuallyEdited = true;
    document.getElementById('sponsorLogo').value = sponsor.logo || '';
    document.getElementById('sponsorLink').value = sponsor.link || '';
    document.getElementById('sponsorDescription').value = sponsor.description || '';
    sponsorSaveLabel.textContent = 'Enregistrer les modifications';
    sponsorCancelBtn.classList.remove('hidden');
    document.getElementById('sponsorFormTitle').textContent = 'Modifier le sponsor';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetSponsorForm() {
    sponsorForm.reset();
    document.getElementById('sponsorId').value = '';
    sponsorSlugManuallyEdited = false;
    sponsorSaveLabel.textContent = 'Ajouter le sponsor';
    sponsorCancelBtn.classList.add('hidden');
    document.getElementById('sponsorFormTitle').textContent = 'Ajouter un sponsor';
  }

  document.getElementById('sponsorSlug').addEventListener('input', () => { sponsorSlugManuallyEdited = true; });
  document.getElementById('sponsorName').addEventListener('input', () => {
    if (!sponsorSlugManuallyEdited) {
      document.getElementById('sponsorSlug').value = slugify(document.getElementById('sponsorName').value);
    }
  });

  sponsorCancelBtn.addEventListener('click', resetSponsorForm);

  sponsorForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const saveBtn = document.getElementById('sponsorSaveBtn');
    saveBtn.disabled = true;
    setStatus(sponsorStatus, 'loading', 'Enregistrement en cours…');

    try {
      if (!fileState[SPONSORS_PATH]) await readFile(SPONSORS_PATH);
      const current = fileState[SPONSORS_PATH].json;
      const sponsors = (current.sponsors || []).slice();

      const editingId = document.getElementById('sponsorId').value;
      const name = document.getElementById('sponsorName').value.trim();
      const slugInput = document.getElementById('sponsorSlug').value.trim();
      const slug = slugify(slugInput || name);
      const logo = document.getElementById('sponsorLogo').value.trim();
      const link = document.getElementById('sponsorLink').value.trim();
      const description = document.getElementById('sponsorDescription').value.trim();

      const slugTaken = sponsors.some((s) => s.id === slug && s.id !== editingId);
      if (slugTaken) {
        throw new Error('Cette adresse est déjà utilisée par un autre sponsor.');
      }

      if (editingId) {
        const idx = sponsors.findIndex((s) => s.id === editingId);
        if (idx !== -1) sponsors[idx] = { id: slug, name, logo, link, description };
      } else {
        sponsors.push({ id: slug, name, logo, link, description });
      }

      const updated = { sponsors };
      const sha = fileState[SPONSORS_PATH] ? fileState[SPONSORS_PATH].sha : undefined;
      const result = await GitHubAPI.saveJSON(
        cfg, SPONSORS_PATH, updated, sha,
        editingId ? `Admin : modification du sponsor "${name}"` : `Admin : ajout du sponsor "${name}"`
      );

      fileState[SPONSORS_PATH] = { json: updated, sha: result.content.sha };
      renderSponsorsList(sponsors);
      resetSponsorForm();
      setStatus(sponsorStatus, 'success', 'Enregistré ! Le site se mettra à jour d\'ici 1 à 2 minutes.');
    } catch (err) {
      setStatus(sponsorStatus, 'error', 'Erreur : ' + err.message);
    } finally {
      saveBtn.disabled = false;
    }
  });

  async function deleteSponsor(id) {
    if (!(await showConfirmModal('Supprimer ce sponsor ? Cette action est immédiate.'))) return;

    setStatus(sponsorStatus, 'loading', 'Suppression en cours…');
    try {
      if (!fileState[SPONSORS_PATH]) await readFile(SPONSORS_PATH);
      const current = fileState[SPONSORS_PATH].json;
      const sponsors = (current.sponsors || []).filter((s) => s.id !== id);
      const updated = { sponsors };

      const sha = fileState[SPONSORS_PATH] ? fileState[SPONSORS_PATH].sha : undefined;
      const result = await GitHubAPI.saveJSON(
        cfg, SPONSORS_PATH, updated, sha, 'Admin : suppression d\'un sponsor'
      );

      fileState[SPONSORS_PATH] = { json: updated, sha: result.content.sha };
      renderSponsorsList(sponsors);
      setStatus(sponsorStatus, 'success', 'Sponsor supprimé.');
    } catch (err) {
      setStatus(sponsorStatus, 'error', 'Erreur : ' + err.message);
    }
  }

  /* ---------- Documents ---------- */

  const DOCS_PATH = 'data/documents.json';
  const CATEGORY_LABELS = { administratifs: 'Administratifs', sportifs: 'Sportifs', divers: 'Divers' };
  const CATEGORY_ICONS = { administratifs: 'fa-folder-open', sportifs: 'fa-trophy', divers: 'fa-folder' };

  const docForm = document.getElementById('docForm');
  const docStatus = document.getElementById('docStatus');
  const docsList = document.getElementById('docsList');
  const docCancelBtn = document.getElementById('docCancelBtn');
  const docSaveLabel = document.getElementById('docSaveLabel');
  document.getElementById('docUpdatedDate').value = new Date().toISOString().slice(0, 10);

  async function loadDocumentsView() {
    docsList.innerHTML = '<p style="color:var(--color-text-muted); font-size:0.88rem;"><i class="fa-solid fa-spinner fa-spin"></i> Chargement…</p>';
    try {
      const data = await readFile(DOCS_PATH);
      renderDocsList(data.categories || []);
    } catch (err) {
      docsList.innerHTML = '';
      docsList.appendChild(
        buildAlert('alert-danger', 'fa-triangle-exclamation', 'Impossible de charger les documents', [err.message])
      );
    }
  }

  function docStatusBadge(expirationDate) {
    if (!expirationDate) return '<span class="doc-status-badge doc-status-none">Pas de date</span>';
    const diff = daysBetween(expirationDate);
    if (diff < 0) return '<span class="doc-status-badge doc-status-expired">Expiré</span>';
    if (diff <= 30) return '<span class="doc-status-badge doc-status-soon">Bientôt (' + diff + 'j)</span>';
    return '<span class="doc-status-badge doc-status-ok">OK</span>';
  }

  function renderDocsList(categories) {
    docsList.innerHTML = '';
    let total = 0;

    categories.forEach((cat) => {
      const docs = (cat.documents || []).slice().sort((a, b) => (b.updatedDate || '').localeCompare(a.updatedDate || ''));
      total += docs.length;

      const title = document.createElement('div');
      title.className = 'admin-list-category-title';
      title.textContent = `${CATEGORY_LABELS[cat.id] || cat.label} (${docs.length})`;
      docsList.appendChild(title);

      if (docs.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'empty-list-msg';
        empty.textContent = 'Aucun document dans cette catégorie.';
        docsList.appendChild(empty);
        return;
      }

      docs.forEach((doc) => {
        const row = document.createElement('div');
        row.className = 'admin-list-item';
        const updatedLabel = doc.updatedDate ? doc.updatedDate.split('-').reverse().join('/') : '—';
        row.innerHTML = `
          <div class="admin-list-thumb"><i class="fa-solid ${doc.icon || 'fa-file'}" style="color:var(--color-navy); font-size:1.3rem;"></i></div>
          <div class="admin-list-info">
            <strong>${doc.title} ${docStatusBadge(doc.expirationDate)}</strong>
            <span>${doc.file} · mis à jour le ${updatedLabel}</span>
          </div>
          <div class="admin-list-actions">
            <button type="button" class="edit-btn" title="Modifier"><i class="fa-solid fa-pen"></i></button>
            <button type="button" class="delete-btn" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
          </div>
        `;
        row.querySelector('.edit-btn').addEventListener('click', () => startEditDoc(cat.id, doc));
        row.querySelector('.delete-btn').addEventListener('click', () => deleteDoc(cat.id, doc.id));
        docsList.appendChild(row);
      });
    });

    if (total === 0) {
      docsList.innerHTML = '<p class="empty-list-msg">Aucun document pour le moment.</p>';
    }
  }

  function startEditDoc(categoryId, doc) {
    document.getElementById('docId').value = doc.id;
    document.getElementById('docCategory').value = categoryId;
    document.getElementById('docTitle').value = doc.title || '';
    document.getElementById('docDescription').value = doc.description || '';
    document.getElementById('docFile').value = doc.file || '';
    document.getElementById('docIcon').value = doc.icon || 'fa-file';
    refreshDocIconPreview();
    document.getElementById('docUpdatedDate').value = doc.updatedDate || new Date().toISOString().slice(0, 10);
    document.getElementById('docExpiration').value = doc.expirationDate || '';
    docSaveLabel.textContent = 'Enregistrer les modifications';
    docCancelBtn.classList.remove('hidden');
    document.getElementById('docFormTitle').textContent = 'Modifier le document';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetDocForm() {
    docForm.reset();
    document.getElementById('docId').value = '';
    document.getElementById('docIcon').value = 'fa-file';
    refreshDocIconPreview();
    document.getElementById('docUpdatedDate').value = new Date().toISOString().slice(0, 10);
    docSaveLabel.textContent = 'Ajouter le document';
    docCancelBtn.classList.add('hidden');
    document.getElementById('docFormTitle').textContent = 'Ajouter un document';
  }

  docCancelBtn.addEventListener('click', resetDocForm);

  function generateDocId(title, categories) {
    const base = slugify(title) || 'document';
    const allIds = categories.flatMap((c) => (c.documents || []).map((d) => d.id));
    let id = base;
    let counter = 2;
    while (allIds.includes(id)) {
      id = `${base}-${counter}`;
      counter++;
    }
    return id;
  }

  docForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const saveBtn = document.getElementById('docSaveBtn');
    saveBtn.disabled = true;
    setStatus(docStatus, 'loading', 'Enregistrement en cours…');

    try {
      if (!fileState[DOCS_PATH]) await readFile(DOCS_PATH);
      const current = fileState[DOCS_PATH].json;
      const categories = (current.categories || []).map((c) => Object.assign({}, c, { documents: (c.documents || []).slice() }));

      const editingId = document.getElementById('docId').value;
      const targetCategoryId = document.getElementById('docCategory').value;
      const title = document.getElementById('docTitle').value.trim();
      const description = document.getElementById('docDescription').value.trim();
      const file = document.getElementById('docFile').value.trim();
      const icon = document.getElementById('docIcon').value.trim() || 'fa-file';
      const updatedDate = document.getElementById('docUpdatedDate').value || new Date().toISOString().slice(0, 10);
      const expirationDate = document.getElementById('docExpiration').value || null;

      // Retire le document de son ancienne catégorie si on est en train de le modifier
      if (editingId) {
        categories.forEach((c) => {
          c.documents = c.documents.filter((d) => d.id !== editingId);
        });
      }

      const id = editingId || generateDocId(title, categories);
      const docEntry = { id, title, description, file, icon, updatedDate, expirationDate };

      let targetCategory = categories.find((c) => c.id === targetCategoryId);
      if (!targetCategory) {
        targetCategory = {
          id: targetCategoryId,
          label: CATEGORY_LABELS[targetCategoryId] || targetCategoryId,
          icon: CATEGORY_ICONS[targetCategoryId] || 'fa-folder',
          documents: []
        };
        categories.push(targetCategory);
      }
      targetCategory.documents.push(docEntry);

      const updated = { categories };
      const sha = fileState[DOCS_PATH] ? fileState[DOCS_PATH].sha : undefined;
      const result = await GitHubAPI.saveJSON(
        cfg, DOCS_PATH, updated, sha,
        editingId ? `Admin : modification du document "${title}"` : `Admin : ajout du document "${title}"`
      );

      fileState[DOCS_PATH] = { json: updated, sha: result.content.sha };
      renderDocsList(categories);
      resetDocForm();
      setStatus(docStatus, 'success', 'Enregistré ! Le site se mettra à jour d\'ici 1 à 2 minutes.');
    } catch (err) {
      setStatus(docStatus, 'error', 'Erreur : ' + err.message);
    } finally {
      saveBtn.disabled = false;
    }
  });

  async function deleteDoc(categoryId, docId) {
    if (!fileState[DOCS_PATH]) await readFile(DOCS_PATH);
    const current = fileState[DOCS_PATH].json;
    const category = current.categories.find((c) => c.id === categoryId);
    const doc = category ? (category.documents || []).find((d) => d.id === docId) : null;

    const confirmed = await confirmDeleteWithUsageCheck(doc ? doc.file : null, DOCS_PATH, 'ce document');
    if (!confirmed) return;

    setStatus(docStatus, 'loading', 'Suppression en cours…');
    try {
      const categories = current.categories.map((c) => {
        if (c.id !== categoryId) return c;
        return Object.assign({}, c, { documents: (c.documents || []).filter((d) => d.id !== docId) });
      });

      const updated = { categories };
      const sha = fileState[DOCS_PATH] ? fileState[DOCS_PATH].sha : undefined;
      const result = await GitHubAPI.saveJSON(
        cfg, DOCS_PATH, updated, sha, 'Admin : suppression d\'un document'
      );

      fileState[DOCS_PATH] = { json: updated, sha: result.content.sha };
      renderDocsList(categories);
      setStatus(docStatus, 'success', 'Document supprimé.');
    } catch (err) {
      setStatus(docStatus, 'error', 'Erreur : ' + err.message);
    }
  }

  /* ---------- Menu du site ---------- */

  const NAV_PATH = 'data/navigation.json';

  const navTree = document.getElementById('navTree');
  const navCategoryStatus = document.getElementById('navCategoryStatus');
  const navPageStatus = document.getElementById('navPageStatus');
  const navPageForm = document.getElementById('navPageForm');
  const navPageEditorCard = document.getElementById('navPageEditorCard');
  const navPageCancelBtn = document.getElementById('navPageCancelBtn');
  const navPageSaveLabel = document.getElementById('navPageSaveLabel');
  const navPageCategorySelect = document.getElementById('navPageCategory');

  async function loadNavigationView() {
    navTree.innerHTML = '<p style="color:var(--color-text-muted); font-size:0.85rem;"><i class="fa-solid fa-spinner fa-spin"></i> Chargement…</p>';
    try {
      const data = await readFile(NAV_PATH);
      renderNavigation(data.items || []);
    } catch (err) {
      navTree.innerHTML = '';
      navTree.appendChild(
        buildAlert('alert-danger', 'fa-triangle-exclamation', 'Impossible de charger le menu', [err.message])
      );
    }
  }

  async function saveNavigation(items, message) {
    const updated = { items };
    const sha = fileState[NAV_PATH].sha;
    const result = await GitHubAPI.saveJSON(cfg, NAV_PATH, updated, sha, message);
    fileState[NAV_PATH] = { json: updated, sha: result.content.sha };
    renderNavigation(items);
  }

  /* --- Glisser-déposer pour réordonner --- */

  let dragState = null;

  function makeRowDraggable(row, id, parentId) {
    row.draggable = true;

    row.addEventListener('dragstart', (e) => {
      dragState = { id, parentId };
      row.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    row.addEventListener('dragend', () => {
      row.classList.remove('is-dragging');
      navTree.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach((el) => {
        el.classList.remove('drag-over-top', 'drag-over-bottom');
      });
      dragState = null;
    });

    row.addEventListener('dragover', (e) => {
      if (!dragState || dragState.parentId !== parentId || dragState.id === id) return;
      e.preventDefault();
      const rect = row.getBoundingClientRect();
      const isAfter = (e.clientY - rect.top) > rect.height / 2;
      row.classList.toggle('drag-over-bottom', isAfter);
      row.classList.toggle('drag-over-top', !isAfter);
    });

    row.addEventListener('dragleave', () => {
      row.classList.remove('drag-over-top', 'drag-over-bottom');
    });

    row.addEventListener('drop', (e) => {
      if (!dragState || dragState.parentId !== parentId || dragState.id === id) return;
      e.preventDefault();
      const rect = row.getBoundingClientRect();
      const isAfter = (e.clientY - rect.top) > rect.height / 2;
      row.classList.remove('drag-over-top', 'drag-over-bottom');
      reorderByDrop(dragState.id, id, parentId, isAfter);
    });
  }

  async function reorderByDrop(draggedId, targetId, parentId, insertAfter) {
    if (!fileState[NAV_PATH]) await readFile(NAV_PATH);
    const items = fileState[NAV_PATH].json.items.slice();

    let list;
    let parent = null;
    if (parentId) {
      parent = items.find((it) => it.id === parentId);
      if (!parent) return;
      list = parent.children.slice();
    } else {
      list = items;
    }

    const fromIdx = list.findIndex((it) => it.id === draggedId);
    if (fromIdx === -1) return;
    const [moved] = list.splice(fromIdx, 1);
    const toIdx = list.findIndex((it) => it.id === targetId);
    if (toIdx === -1) return;
    list.splice(insertAfter ? toIdx + 1 : toIdx, 0, moved);

    if (parent) parent.children = list;
    await saveNavigation(parent ? items : list, 'Admin : réorganisation du menu');
  }

  function dragHandleHtml() {
    return '<i class="fa-solid fa-grip-vertical drag-handle" title="Glisser pour réordonner"></i>';
  }

  function renderNavigation(items) {
    navTree.innerHTML = '';

    if (items.length === 0) {
      navTree.innerHTML = '<p class="empty-list-msg">Le menu est vide.</p>';
    }

    /* --- Menu déroulant "Catégorie" du formulaire d'édition --- */
    const categories = items.filter((it) => it.type === 'dropdown');
    navPageCategorySelect.innerHTML = '<option value="">Aucune — lien direct dans le menu</option>';
    categories.forEach((cat) => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.label;
      navPageCategorySelect.appendChild(opt);
    });

    items.forEach((item) => {
      if (item.type === 'dropdown') {
        const row = document.createElement('div');
        row.className = 'page-tree-row is-folder';
        row.innerHTML = `
          ${dragHandleHtml()}
          <i class="fa-solid fa-folder folder-icon"></i>
          <strong style="flex:1;">${item.label} (${(item.children || []).length})</strong>
          <div class="admin-list-actions">
            <button type="button" class="rename-btn" title="Renommer"><i class="fa-solid fa-pen"></i></button>
            <button type="button" class="delete-btn" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
          </div>
        `;
        row.querySelector('.rename-btn').addEventListener('click', () => renameCategory(item.id, item.label));
        row.querySelector('.delete-btn').addEventListener('click', () => deleteCategory(item.id, item.label, (item.children || []).length));
        makeRowDraggable(row, item.id, null);
        navTree.appendChild(row);

        (item.children || []).forEach((child) => {
          navTree.appendChild(buildNavItemRow(child, item.id, item.label));
        });
      } else {
        navTree.appendChild(buildNavItemRow(item, null, null));
      }
    });
  }

  function buildNavItemRow(item, parentId, parentLabel) {
    const row = document.createElement('div');
    row.className = 'page-tree-row' + (parentId ? ' is-child' : '');
    row.innerHTML = `
      ${dragHandleHtml()}
      <div class="nav-item-info">
        <strong>${item.label}${parentLabel ? ' <span style="font-weight:400; color:var(--color-text-muted); font-size:0.76rem;">— ' + parentLabel + '</span>' : ''}</strong>
        <span>${item.link}</span>
      </div>
      <div class="admin-list-actions">
        <button type="button" class="edit-btn" title="Modifier"><i class="fa-solid fa-pen"></i></button>
        <button type="button" class="delete-btn" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
      </div>
    `;
    row.querySelector('.edit-btn').addEventListener('click', () => startEditNavItem(item, parentId));
    row.querySelector('.delete-btn').addEventListener('click', () => deleteNavItem(item.id, parentId));
    makeRowDraggable(row, item.id, parentId);
    return row;
  }

  /* --- Ajout / édition d'une page --- */

  function startEditNavItem(item, parentId) {
    document.getElementById('navPageId').value = item.id;
    document.getElementById('navPageParentId').value = parentId || '';
    document.getElementById('navPageLabel').value = item.label || '';
    document.getElementById('navPageLink').value = item.link || '';
    navPageCategorySelect.value = parentId || '';
    navPageSaveLabel.textContent = 'Enregistrer les modifications';
    document.getElementById('navFormTitle').textContent = 'Modifier la page';
    navPageEditorCard.classList.remove('hidden');
    navPageEditorCard.scrollIntoView({ behavior: 'smooth' });
  }

  function resetNavPageForm() {
    navPageForm.reset();
    document.getElementById('navPageId').value = '';
    document.getElementById('navPageParentId').value = '';
    navPageEditorCard.classList.add('hidden');
  }

  navPageCancelBtn.addEventListener('click', resetNavPageForm);

  function generateNavId(label, items) {
    const base = slugify(label) || 'page';
    const allIds = [];
    items.forEach((it) => {
      allIds.push(it.id);
      (it.children || []).forEach((c) => allIds.push(c.id));
    });
    let id = base;
    let counter = 2;
    while (allIds.includes(id)) {
      id = `${base}-${counter}`;
      counter++;
    }
    return id;
  }

  navPageForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const saveBtn = document.getElementById('navPageSaveBtn');
    saveBtn.disabled = true;
    setStatus(navPageStatus, 'loading', 'Enregistrement en cours…');

    try {
      if (!fileState[NAV_PATH]) await readFile(NAV_PATH);
      let items = fileState[NAV_PATH].json.items.map((it) =>
        it.type === 'dropdown' ? Object.assign({}, it, { children: (it.children || []).slice() }) : Object.assign({}, it)
      );

      const editingId = document.getElementById('navPageId').value;
      const label = document.getElementById('navPageLabel').value.trim();
      const link = document.getElementById('navPageLink').value.trim();
      const targetCategoryId = navPageCategorySelect.value;

      // Si on modifie une page existante, on la retire d'abord de son emplacement actuel
      if (editingId) {
        items = items
          .map((it) => {
            if (it.type === 'dropdown') {
              return Object.assign({}, it, { children: it.children.filter((c) => c.id !== editingId) });
            }
            return it;
          })
          .filter((it) => it.type === 'dropdown' || it.id !== editingId);
      }

      const id = editingId || generateNavId(label, items);
      const newEntry = targetCategoryId ? { id, label, link } : { id, label, link, type: 'link' };

      if (targetCategoryId) {
        const cat = items.find((it) => it.id === targetCategoryId && it.type === 'dropdown');
        if (!cat) throw new Error('Catégorie introuvable.');
        cat.children.push(newEntry);
      } else {
        items.push(newEntry);
      }

      const updated = { items };
      const sha = fileState[NAV_PATH].sha;
      const result = await GitHubAPI.saveJSON(
        cfg, NAV_PATH, updated, sha,
        editingId ? `Admin : modification de la page "${label}" dans le menu` : `Admin : ajout de la page "${label}" au menu`
      );

      fileState[NAV_PATH] = { json: updated, sha: result.content.sha };
      renderNavigation(items);
      resetNavPageForm();
      setStatus(navPageStatus, 'success', 'Enregistré ! Le menu se mettra à jour sur tout le site d\'ici 1 à 2 minutes.');
    } catch (err) {
      setStatus(navPageStatus, 'error', 'Erreur : ' + err.message);
    } finally {
      saveBtn.disabled = false;
    }
  });

  async function deleteNavItem(id, parentId) {
    if (!(await showConfirmModal('Retirer cette page du menu ? Cette action est immédiate.'))) return;

    setStatus(navPageStatus, 'loading', 'Suppression en cours…');
    try {
      if (!fileState[NAV_PATH]) await readFile(NAV_PATH);
      const items = fileState[NAV_PATH].json.items
        .map((it) => {
          if (it.type === 'dropdown') {
            return Object.assign({}, it, { children: (it.children || []).filter((c) => c.id !== id) });
          }
          return it;
        })
        .filter((it) => it.type === 'dropdown' || it.id !== id);

      const updated = { items };
      const sha = fileState[NAV_PATH].sha;
      const result = await GitHubAPI.saveJSON(cfg, NAV_PATH, updated, sha, 'Admin : suppression d\'une page du menu');

      fileState[NAV_PATH] = { json: updated, sha: result.content.sha };
      renderNavigation(items);
      setStatus(navPageStatus, 'success', 'Page retirée du menu.');
    } catch (err) {
      setStatus(navPageStatus, 'error', 'Erreur : ' + err.message);
    }
  }

  /* --- Catégories --- */

  document.getElementById('addCategoryBtn').addEventListener('click', async () => {
    const input = document.getElementById('newCategoryLabel');
    const label = input.value.trim();
    if (!label) {
      setStatus(navCategoryStatus, 'error', 'Donne un nom à la catégorie avant de la créer.');
      return;
    }

    setStatus(navCategoryStatus, 'loading', 'Création en cours…');
    try {
      if (!fileState[NAV_PATH]) await readFile(NAV_PATH);
      const items = fileState[NAV_PATH].json.items.slice();
      const id = generateNavId(label, items);
      items.push({ id, label, type: 'dropdown', children: [] });

      const updated = { items };
      const sha = fileState[NAV_PATH].sha;
      const result = await GitHubAPI.saveJSON(cfg, NAV_PATH, updated, sha, `Admin : création de la catégorie "${label}"`);

      fileState[NAV_PATH] = { json: updated, sha: result.content.sha };
      renderNavigation(items);
      input.value = '';
      setStatus(navCategoryStatus, 'success', 'Catégorie créée !');
    } catch (err) {
      setStatus(navCategoryStatus, 'error', 'Erreur : ' + err.message);
    }
  });

  async function renameCategory(id, currentLabel) {
    const newLabel = await showPromptModal('Nouveau nom de la catégorie', currentLabel);
    if (!newLabel || !newLabel.trim() || newLabel.trim() === currentLabel) return;

    setStatus(navCategoryStatus, 'loading', 'Renommage en cours…');
    try {
      if (!fileState[NAV_PATH]) await readFile(NAV_PATH);
      const items = fileState[NAV_PATH].json.items.map((it) =>
        it.id === id ? Object.assign({}, it, { label: newLabel.trim() }) : it
      );

      const updated = { items };
      const sha = fileState[NAV_PATH].sha;
      const result = await GitHubAPI.saveJSON(cfg, NAV_PATH, updated, sha, `Admin : renommage de la catégorie en "${newLabel.trim()}"`);

      fileState[NAV_PATH] = { json: updated, sha: result.content.sha };
      renderNavigation(items);
      setStatus(navCategoryStatus, 'success', 'Catégorie renommée.');
    } catch (err) {
      setStatus(navCategoryStatus, 'error', 'Erreur : ' + err.message);
    }
  }

  async function deleteCategory(id, label, childCount) {
    const message = childCount > 0
      ? `Supprimer la catégorie "${label}" ? Les ${childCount} page(s) qu'elle contient seront supprimées du menu aussi.`
      : `Supprimer la catégorie "${label}" ?`;
    if (!(await showConfirmModal(message))) return;

    setStatus(navCategoryStatus, 'loading', 'Suppression en cours…');
    try {
      if (!fileState[NAV_PATH]) await readFile(NAV_PATH);
      const items = fileState[NAV_PATH].json.items.filter((it) => it.id !== id);

      const updated = { items };
      const sha = fileState[NAV_PATH].sha;
      const result = await GitHubAPI.saveJSON(cfg, NAV_PATH, updated, sha, `Admin : suppression de la catégorie "${label}"`);

      fileState[NAV_PATH] = { json: updated, sha: result.content.sha };
      renderNavigation(items);
      setStatus(navCategoryStatus, 'success', 'Catégorie supprimée.');
    } catch (err) {
      setStatus(navCategoryStatus, 'error', 'Erreur : ' + err.message);
    }
  }

  /* ---------- Équipes & matchs ---------- */

  const TEAMS_INDEX_PATH = 'data/teams/index.json';

  const DIVISION_ABBR = {
    'Pro A': 'Pro A',
    'Pro B': 'Pro B',
    'Nationale 1A': 'N1A',
    'Nationale 1': 'N1',
    'Nationale 2': 'N2',
    'Nationale 3': 'N3',
    'Pré Nationale': 'PN',
    'Régionale 1': 'R1',
    'Régionale 2': 'R2',
    'Régionale 3': 'R3',
    'Pré Régionale': 'PR',
    'Départementale 1': 'D1',
    'Départementale 2': 'D2',
    'Départementale 3': 'D3',
    'Départementale 4': 'D4'
  };

  function divisionAbbr(division) {
    return DIVISION_ABBR[division] || division || '';
  }

  // Classement du meilleur (0) au moins bon, dans l'ordre demandé
  const DIVISION_ORDER = [
    'Pro A', 'Pro B', 'Nationale 1A', 'Nationale 1', 'Nationale 2', 'Nationale 3',
    'Pré Nationale', 'Régionale 1', 'Régionale 2', 'Régionale 3', 'Pré Régionale',
    'Départementale 1', 'Départementale 2', 'Départementale 3', 'Départementale 4'
  ];

  function divisionRank(division) {
    const idx = DIVISION_ORDER.indexOf(division);
    return idx === -1 ? DIVISION_ORDER.length : idx;
  }

  function teamNumberFromName(name) {
    const m = (name || '').match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  }

  // Recrée automatiquement la catégorie "Équipes" du menu à partir de la liste actuelle des
  // équipes, triées par division (meilleure en premier) puis par numéro d'équipe.
  async function syncTeamsInMenu(teams) {
    try {
      if (!fileState[NAV_PATH]) await readFile(NAV_PATH);
      const items = fileState[NAV_PATH].json.items.map((it) =>
        it.type === 'dropdown' ? Object.assign({}, it, { children: (it.children || []).slice() }) : Object.assign({}, it)
      );

      const sorted = teams.slice().sort((a, b) => {
        const divDiff = divisionRank(a.division) - divisionRank(b.division);
        if (divDiff !== 0) return divDiff;
        return teamNumberFromName(a.name) - teamNumberFromName(b.name);
      });

      const children = sorted.map((t) => ({
        id: t.id,
        label: `${t.name} (${divisionAbbr(t.division)})`,
        link: `./equipe.html?id=${t.id}`
      }));

      let category = items.find((it) => it.id === 'equipes' && it.type === 'dropdown');
      if (!category) {
        category = { id: 'equipes', label: 'Équipes', type: 'dropdown', children: [] };
        items.push(category);
      }
      category.children = children;

      const result = await GitHubAPI.saveJSON(
        cfg, NAV_PATH, { items }, fileState[NAV_PATH].sha, 'Admin : synchronisation des équipes dans le menu'
      );
      fileState[NAV_PATH] = { json: { items }, sha: result.content.sha };
    } catch (err) {
      console.warn('Impossible de synchroniser les équipes dans le menu :', err.message);
    }
  }

  const HOMEPAGE_SETTINGS_PATH = 'data/homepage-settings.json';

  const teamsList = document.getElementById('teamsList');
  const teamEditorCard = document.getElementById('teamEditorCard');
  const teamEditorForm = document.getElementById('teamEditorForm');
  const teamEditorStatus = document.getElementById('teamEditorStatus');
  const teamsTogglesStatus = document.getElementById('teamsTogglesStatus');
  const teamPlayersRows = document.getElementById('teamPlayersRows');
  const teamMatchesRows = document.getElementById('teamMatchesRows');
  const teamPhotoInput = document.getElementById('teamPhotoInput');
  const teamPhotoPreviewWrap = document.getElementById('teamPhotoPreviewWrap');

  let currentTeamsCache = []; // liste des équipes chargées (pour retrouver rapidement une équipe par id)
  let pendingTeamPhotoFile = null;
  let currentTeamPhotoPath = '';

  function teamPath(id) {
    return `data/teams/${id}.json`;
  }

  async function loadTeamsView() {
    setStatus(teamsTogglesStatus, 'loading', 'Chargement…');
    try {
      const settings = await readFile(HOMEPAGE_SETTINGS_PATH);
      document.getElementById('toggleResultsBlock').checked = settings.showResultsAndUpcomingMatches !== false;
      document.getElementById('toggleStandingsBlock').checked = settings.showStandingsTable === true;
      hideStatus(teamsTogglesStatus);
    } catch (err) {
      setStatus(teamsTogglesStatus, 'error', 'Erreur : ' + err.message);
    }

    teamsList.innerHTML = '<p style="color:var(--color-text-muted); font-size:0.88rem;"><i class="fa-solid fa-spinner fa-spin"></i> Chargement…</p>';
    try {
      const index = await readFile(TEAMS_INDEX_PATH);
      const ids = index.teamIds || [];
      const teams = await Promise.all(ids.map((id) => readFile(teamPath(id)).catch(() => null)));
      currentTeamsCache = teams.filter(Boolean);
      renderTeamsList(currentTeamsCache);
    } catch (err) {
      teamsList.innerHTML = '';
      teamsList.appendChild(buildAlert('alert-danger', 'fa-triangle-exclamation', 'Impossible de charger les équipes', [err.message]));
    }
  }

  async function saveToggle(key, value) {
    setStatus(teamsTogglesStatus, 'loading', 'Enregistrement…');
    try {
      if (!fileState[HOMEPAGE_SETTINGS_PATH]) await readFile(HOMEPAGE_SETTINGS_PATH);
      const current = fileState[HOMEPAGE_SETTINGS_PATH].json;
      const updated = Object.assign({}, current, { [key]: value });
      const sha = fileState[HOMEPAGE_SETTINGS_PATH].sha;
      const result = await GitHubAPI.saveJSON(cfg, HOMEPAGE_SETTINGS_PATH, updated, sha, 'Admin : mise à jour de l\'affichage de l\'accueil');
      fileState[HOMEPAGE_SETTINGS_PATH] = { json: updated, sha: result.content.sha };
      setStatus(teamsTogglesStatus, 'success', 'Enregistré !');
    } catch (err) {
      setStatus(teamsTogglesStatus, 'error', 'Erreur : ' + err.message);
    }
  }

  document.getElementById('toggleResultsBlock').addEventListener('change', (e) => {
    saveToggle('showResultsAndUpcomingMatches', e.target.checked);
  });
  document.getElementById('toggleStandingsBlock').addEventListener('change', (e) => {
    saveToggle('showStandingsTable', e.target.checked);
  });

  let teamDragState = null;

  function renderTeamsList(teams) {
    teamsList.innerHTML = '';
    if (teams.length === 0) {
      teamsList.innerHTML = '<p class="empty-list-msg">Aucune équipe pour le moment.</p>';
      return;
    }

    teams.forEach((team) => {
      const row = document.createElement('div');
      row.className = 'admin-list-item';
      row.draggable = true;
      row.innerHTML = `
        <i class="fa-solid fa-grip-vertical drag-handle" title="Glisser pour réordonner"></i>
        ${team.photo
          ? `<img class="team-row-thumb" src="${adminAssetPath(team.photo)}" alt="">`
          : `<div class="admin-list-thumb"><i class="fa-solid fa-people-group" style="color:var(--color-navy);"></i></div>`}
        <div class="admin-list-info">
          <strong>${team.name} (${divisionAbbr(team.division)})</strong>
          <span>${team.division || ''}</span>
        </div>
        <div class="admin-list-actions">
          <a href="../equipe.html?id=${team.id}" target="_blank" rel="noopener" class="view-link-btn" title="Voir la fiche"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>
          <button type="button" class="edit-btn" title="Modifier"><i class="fa-solid fa-pen"></i></button>
          <button type="button" class="delete-btn" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
        </div>
      `;
      row.querySelector('.edit-btn').addEventListener('click', () => startEditTeam(team));
      row.querySelector('.delete-btn').addEventListener('click', () => deleteTeam(team.id, team.name));

      row.addEventListener('dragstart', () => {
        teamDragState = team.id;
        row.classList.add('is-dragging');
      });
      row.addEventListener('dragend', () => {
        row.classList.remove('is-dragging');
        teamsList.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach((el) => {
          el.classList.remove('drag-over-top', 'drag-over-bottom');
        });
        teamDragState = null;
      });
      row.addEventListener('dragover', (e) => {
        if (!teamDragState || teamDragState === team.id) return;
        e.preventDefault();
        const rect = row.getBoundingClientRect();
        const isAfter = (e.clientY - rect.top) > rect.height / 2;
        row.classList.toggle('drag-over-bottom', isAfter);
        row.classList.toggle('drag-over-top', !isAfter);
      });
      row.addEventListener('dragleave', () => {
        row.classList.remove('drag-over-top', 'drag-over-bottom');
      });
      row.addEventListener('drop', (e) => {
        if (!teamDragState || teamDragState === team.id) return;
        e.preventDefault();
        const rect = row.getBoundingClientRect();
        const isAfter = (e.clientY - rect.top) > rect.height / 2;
        row.classList.remove('drag-over-top', 'drag-over-bottom');
        reorderTeams(teamDragState, team.id, isAfter);
      });

      teamsList.appendChild(row);
    });
  }

  async function reorderTeams(draggedId, targetId, insertAfter) {
    if (!fileState[TEAMS_INDEX_PATH]) await readFile(TEAMS_INDEX_PATH);
    const teamIds = fileState[TEAMS_INDEX_PATH].json.teamIds.slice();
    const fromIdx = teamIds.indexOf(draggedId);
    if (fromIdx === -1) return;
    teamIds.splice(fromIdx, 1);
    const toIdx = teamIds.indexOf(targetId);
    if (toIdx === -1) return;
    teamIds.splice(insertAfter ? toIdx + 1 : toIdx, 0, draggedId);

    const result = await GitHubAPI.saveJSON(
      cfg, TEAMS_INDEX_PATH, { teamIds }, fileState[TEAMS_INDEX_PATH].sha, 'Admin : réorganisation de l\'ordre des équipes'
    );
    fileState[TEAMS_INDEX_PATH] = { json: { teamIds }, sha: result.content.sha };

    currentTeamsCache = teamIds.map((id) => currentTeamsCache.find((t) => t.id === id)).filter(Boolean);
    renderTeamsList(currentTeamsCache);
  }

  /* --- Lignes dynamiques : joueurs --- */

  function addPlayerRow(name) {
    const row = document.createElement('div');
    row.className = 'dynamic-row player-row';
    row.innerHTML = `
      <input type="text" placeholder="Nom du joueur" value="${name || ''}">
      <button type="button" class="remove-row-btn" title="Retirer"><i class="fa-solid fa-xmark"></i></button>
    `;
    row.querySelector('.remove-row-btn').addEventListener('click', () => row.remove());
    teamPlayersRows.appendChild(row);
  }

  document.getElementById('addPlayerRowBtn').addEventListener('click', () => addPlayerRow(''));

  /* --- Lignes dynamiques : matchs --- */

  function addMatchRow(match) {
    match = match || {};
    const row = document.createElement('div');
    row.className = 'dynamic-row match-row';
    row.innerHTML = `
      <input type="date" class="match-date-input" value="${match.date || ''}">
      <input type="text" class="match-opponent-input" placeholder="Adversaire" value="${match.opponent || ''}">
      <select class="match-home-select">
        <option value="true" ${match.home !== false ? 'selected' : ''}>Domicile</option>
        <option value="false" ${match.home === false ? 'selected' : ''}>Extérieur</option>
      </select>
      <select class="match-status-select">
        <option value="upcoming" ${match.status !== 'played' ? 'selected' : ''}>À venir</option>
        <option value="played" ${match.status === 'played' ? 'selected' : ''}>Joué</option>
      </select>
      <select class="match-result-select">
        <option value="">Résultat</option>
        <option value="V" ${match.result === 'V' ? 'selected' : ''}>Victoire</option>
        <option value="N" ${match.result === 'N' ? 'selected' : ''}>Nul</option>
        <option value="D" ${match.result === 'D' ? 'selected' : ''}>Défaite</option>
      </select>
      <input type="text" class="match-score-input" placeholder="Score (ex : 8-4)" value="${match.score || ''}">
      <button type="button" class="remove-row-btn" title="Retirer"><i class="fa-solid fa-xmark"></i></button>
    `;
    row.querySelector('.remove-row-btn').addEventListener('click', () => row.remove());
    teamMatchesRows.appendChild(row);
  }

  document.getElementById('addMatchRowBtn').addEventListener('click', () => addMatchRow());

  /* --- Photo --- */

  function renderTeamPhotoPreview(src) {
    if (!src) {
      teamPhotoPreviewWrap.innerHTML = '';
      return;
    }
    teamPhotoPreviewWrap.innerHTML = `
      <img class="team-photo-preview" src="${src}" alt="">
      <button type="button" class="btn btn-ghost" id="removeTeamPhotoBtn" title="Supprimer la photo">
        <i class="fa-solid fa-trash"></i> Supprimer la photo
      </button>
    `;
    document.getElementById('removeTeamPhotoBtn').addEventListener('click', removeTeamPhoto);
  }

  async function removeTeamPhoto() {
    if (!(await showConfirmModal('Supprimer la photo de cette équipe ? Elle sera aussi supprimée de GitHub.'))) return;
    if (currentTeamPhotoPath) {
      await deleteFileIfExists(toRepoPath(currentTeamPhotoPath));
    }
    currentTeamPhotoPath = '';
    pendingTeamPhotoFile = null;
    teamPhotoInput.value = '';
    renderTeamPhotoPreview('');
  }

  teamPhotoInput.addEventListener('change', () => {
    const file = teamPhotoInput.files[0];
    if (!file) return;
    pendingTeamPhotoFile = file;
    const reader = new FileReader();
    reader.onload = () => {
      renderTeamPhotoPreview(reader.result);
    };
    reader.readAsDataURL(file);
  });

  /* --- Ouverture de l'éditeur (ajout / édition) --- */

  function generateTeamId(teams) {
    const numbers = teams
      .map((t) => parseInt((t.id.match(/(\d+)/) || [0, 0])[1], 10))
      .filter((n) => !isNaN(n));
    const next = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
    return `equipe-${next}`;
  }

  document.getElementById('addTeamBtn').addEventListener('click', () => {
    openTeamEditor(null);
  });

  let teamSlugManuallyEdited = false;

  document.getElementById('teamSlug').addEventListener('input', () => { teamSlugManuallyEdited = true; });
  document.getElementById('teamName').addEventListener('input', () => {
    if (!teamSlugManuallyEdited) {
      document.getElementById('teamSlug').value = slugify(document.getElementById('teamName').value);
    }
  });

  function openTeamEditor(team) {
    teamEditorForm.reset();
    teamPlayersRows.innerHTML = '';
    teamMatchesRows.innerHTML = '';
    teamPhotoPreviewWrap.innerHTML = '';
    pendingTeamPhotoFile = null;
    teamSlugManuallyEdited = false;

    if (team) {
      document.getElementById('teamEditId').value = team.id;
      document.getElementById('teamName').value = team.name || '';
      document.getElementById('teamSlug').value = team.id || '';
      teamSlugManuallyEdited = true;
      document.getElementById('teamDivision').value = team.division || '';
      document.getElementById('teamDescription').value = team.description || '';
      document.getElementById('teamShowPlayers').checked = team.showPlayers !== false;
      currentTeamPhotoPath = team.photo || '';
      if (team.photo) {
        renderTeamPhotoPreview(adminAssetPath(team.photo));
      }

      const c = team.classification || {};
      document.getElementById('teamRank').value = c.rank || '';
      document.getElementById('teamTotalTeams').value = c.totalTeams || '';
      document.getElementById('teamStatus').value = c.status || '';

      (team.players || []).forEach((p) => addPlayerRow(p));
      (team.matches || []).forEach((m) => addMatchRow(m));

      document.getElementById('teamEditorTitle').textContent = 'Modifier l\'équipe';
    } else {
      document.getElementById('teamEditId').value = '';
      document.getElementById('teamShowPlayers').checked = true;
      currentTeamPhotoPath = '';
      document.getElementById('teamEditorTitle').textContent = 'Ajouter une équipe';
    }

    hideStatus(teamEditorStatus);
    teamEditorCard.classList.remove('hidden');
    teamEditorCard.scrollIntoView({ behavior: 'smooth' });
  }

  function startEditTeam(team) {
    openTeamEditor(team);
  }

  document.getElementById('teamEditorCancelBtn').addEventListener('click', () => {
    teamEditorCard.classList.add('hidden');
  });

  /* --- Enregistrement --- */

  teamEditorForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const saveBtn = document.getElementById('teamSaveBtn');
    saveBtn.disabled = true;
    setStatus(teamEditorStatus, 'loading', 'Enregistrement en cours…');

    try {
      const editingId = document.getElementById('teamEditId').value;
      const isNewTeam = !editingId;

      const name = document.getElementById('teamName').value.trim();
      const slugInput = document.getElementById('teamSlug').value.trim();
      const id = slugify(slugInput || name);
      const division = document.getElementById('teamDivision').value.trim();
      const description = document.getElementById('teamDescription').value.trim();

      const slugTaken = currentTeamsCache.some((t) => t.id === id && t.id !== editingId);
      if (slugTaken) {
        throw new Error('Cette adresse est déjà utilisée par une autre équipe.');
      }

      const players = Array.from(teamPlayersRows.querySelectorAll('input'))
        .map((input) => input.value.trim())
        .filter(Boolean);

      const matches = Array.from(teamMatchesRows.querySelectorAll('.match-row')).map((row) => {
        const status = row.querySelector('.match-status-select').value;
        const result = row.querySelector('.match-result-select').value || null;
        const score = row.querySelector('.match-score-input').value.trim() || null;
        return {
          date: row.querySelector('.match-date-input').value,
          opponent: row.querySelector('.match-opponent-input').value.trim(),
          home: row.querySelector('.match-home-select').value === 'true',
          status,
          result: status === 'played' ? result : null,
          score: status === 'played' ? score : null
        };
      });

      const rank = document.getElementById('teamRank').value;
      const totalTeams = document.getElementById('teamTotalTeams').value;

      const classification = {
        rank: rank ? parseInt(rank, 10) : null,
        totalTeams: totalTeams ? parseInt(totalTeams, 10) : null,
        status: document.getElementById('teamStatus').value || null
      };

      // Photo : upload si un nouveau fichier a été choisi
      let photo = currentTeamPhotoPath;
      if (pendingTeamPhotoFile) {
        setStatus(teamEditorStatus, 'loading', 'Envoi de la photo…');
        const ext = (pendingTeamPhotoFile.name.split('.').pop() || 'jpg').toLowerCase();
        const photoPath = `imgs/teams/${id}.${ext}`;
        await GitHubAPI.uploadFile(cfg, photoPath, pendingTeamPhotoFile, `Admin : photo de l'équipe "${name}"`);
        photo = './' + photoPath;
      }

      const showPlayers = document.getElementById('teamShowPlayers').checked;
      const teamData = { id, name, division, photo, description, showPlayers, players, classification, matches };

      setStatus(teamEditorStatus, 'loading', 'Enregistrement de la fiche équipe…');
      const path = teamPath(id);
      const renamed = !isNewTeam && editingId !== id;
      const sha = (!renamed && fileState[path]) ? fileState[path].sha : undefined;
      const result = await GitHubAPI.saveJSON(
        cfg, path, teamData, sha,
        isNewTeam ? `Admin : création de l'équipe "${name}"` : `Admin : modification de l'équipe "${name}"`
      );
      fileState[path] = { json: teamData, sha: result.content.sha };

      if (!fileState[TEAMS_INDEX_PATH]) await readFile(TEAMS_INDEX_PATH);

      if (isNewTeam) {
        const teamIds = (fileState[TEAMS_INDEX_PATH].json.teamIds || []).concat(id);
        const indexResult = await GitHubAPI.saveJSON(
          cfg, TEAMS_INDEX_PATH, { teamIds }, fileState[TEAMS_INDEX_PATH].sha, `Admin : ajout de l'équipe "${name}" à l'index`
        );
        fileState[TEAMS_INDEX_PATH] = { json: { teamIds }, sha: indexResult.content.sha };
      } else if (renamed) {
        // L'adresse a changé : on déplace l'entrée dans l'index et on supprime l'ancien fichier
        const oldPath = teamPath(editingId);
        if (!fileState[oldPath]) await readFile(oldPath).catch(() => {});
        if (fileState[oldPath]) {
          await GitHubAPI.deleteFile(cfg, oldPath, fileState[oldPath].sha, `Admin : ancienne fiche équipe déplacée vers "${id}"`);
          delete fileState[oldPath];
        }
        const teamIds = fileState[TEAMS_INDEX_PATH].json.teamIds.map((tid) => (tid === editingId ? id : tid));
        const indexResult = await GitHubAPI.saveJSON(
          cfg, TEAMS_INDEX_PATH, { teamIds }, fileState[TEAMS_INDEX_PATH].sha, `Admin : renommage de l'équipe "${name}"`
        );
        fileState[TEAMS_INDEX_PATH] = { json: { teamIds }, sha: indexResult.content.sha };
      }

      await loadTeamsView();
      await syncTeamsInMenu(currentTeamsCache);
      teamEditorCard.classList.add('hidden');
      setStatus(teamEditorStatus, 'success', 'Équipe enregistrée ! Le site se mettra à jour d\'ici 1 à 2 minutes.');
    } catch (err) {
      setStatus(teamEditorStatus, 'error', 'Erreur : ' + err.message);
    } finally {
      saveBtn.disabled = false;
    }
  });

  /* --- Suppression --- */

  async function deleteTeam(id, name) {
    if (!(await showConfirmModal(`Supprimer l'équipe "${name}" ? Sa fiche, son calendrier et sa photo seront définitivement supprimés.`))) return;

    try {
      const path = teamPath(id);
      if (!fileState[path]) await readFile(path);
      const teamPhoto = fileState[path].json.photo;

      await GitHubAPI.deleteFile(cfg, path, fileState[path].sha, `Admin : suppression de l'équipe "${name}"`);
      delete fileState[path];

      if (teamPhoto) {
        await deleteFileIfExists(toRepoPath(teamPhoto));
      }

      if (!fileState[TEAMS_INDEX_PATH]) await readFile(TEAMS_INDEX_PATH);
      const teamIds = (fileState[TEAMS_INDEX_PATH].json.teamIds || []).filter((tid) => tid !== id);
      const indexSha = fileState[TEAMS_INDEX_PATH].sha;
      const indexResult = await GitHubAPI.saveJSON(
        cfg, TEAMS_INDEX_PATH, { teamIds }, indexSha, `Admin : retrait de l'équipe "${name}" de l'index`
      );
      fileState[TEAMS_INDEX_PATH] = { json: { teamIds }, sha: indexResult.content.sha };

      await loadTeamsView();
      await syncTeamsInMenu(currentTeamsCache);
    } catch (err) {
      alert('Erreur lors de la suppression : ' + err.message);
    }
  }

  /* ---------- News ---------- */

  const NEWS_PATH = 'data/news.json';
  const SEASONS_PATH = 'data/seasons.json'; // Partagé News/Vidéos/Albums
  const ALBUMS_PATH = 'data/albums.json';

  const newsList = document.getElementById('newsList');
  const newsEditorCard = document.getElementById('newsEditorCard');
  const newsEditorForm = document.getElementById('newsEditorForm');
  const newsEditorStatus = document.getElementById('newsEditorStatus');
  const newsCoverInput = document.getElementById('newsCoverInput');
  const newsCoverPreviewWrap = document.getElementById('newsCoverPreviewWrap');
  const richtextEditor = document.getElementById('richtextEditor');
  const richtextImageInput = document.getElementById('richtextImageInput');
  const newsSeasonSelect = document.getElementById('newsSeason');
  const newsAlbumSelect = document.getElementById('newsAlbum');

  let pendingNewsCoverFile = null;
  let currentNewsCoverPath = '';
  let currentNewsList = [];

  function populateNewsAlbumSelect(albums, selected) {
    const options = ['<option value="">Aucun album</option>']
      .concat((albums || []).map((a) => `<option value="${a.id}" ${a.id === selected ? 'selected' : ''}>${a.title}</option>`));
    newsAlbumSelect.innerHTML = options.join('');
  }

  function populateNewsSeasonSelect(seasons, selected) {
    newsSeasonSelect.innerHTML = seasons
      .map((s) => `<option value="${s}" ${s === selected ? 'selected' : ''}>${s}</option>`)
      .join('');
  }

  document.getElementById('addNewsSeasonBtn').addEventListener('click', async () => {
    const input = document.getElementById('newNewsSeasonInput');
    const season = input.value.trim();
    if (!season) return;

    try {
      if (!fileState[SEASONS_PATH]) await readFile(SEASONS_PATH);
      const seasons = fileState[SEASONS_PATH].json.seasons || [];
      if (seasons.includes(season)) {
        populateNewsSeasonSelect(seasons, season);
        input.value = '';
        return;
      }
      const updatedSeasons = seasons.concat(season);
      const sha = fileState[SEASONS_PATH].sha;
      const result = await GitHubAPI.saveJSON(
        cfg, SEASONS_PATH, { seasons: updatedSeasons }, sha, `Admin : ajout de la saison "${season}"`
      );
      fileState[SEASONS_PATH] = { json: { seasons: updatedSeasons }, sha: result.content.sha };
      populateNewsSeasonSelect(updatedSeasons, season);
      input.value = '';
    } catch (err) {
      setStatus(newsEditorStatus, 'error', 'Erreur : ' + err.message);
    }
  });

  async function loadNewsView() {
    newsList.innerHTML = '<p style="color:var(--color-text-muted); font-size:0.88rem;"><i class="fa-solid fa-spinner fa-spin"></i> Chargement…</p>';
    try {
      const [data, seasonsData, albumsData] = await Promise.all([
        readFile(NEWS_PATH),
        readFile(SEASONS_PATH),
        readFile(ALBUMS_PATH).catch(() => ({ albums: [] }))
      ]);
      currentNewsList = data.news || [];
      populateNewsSeasonSelect(seasonsData.seasons || [], null);
      populateNewsAlbumSelect(albumsData.albums || [], null);
      renderNewsList(currentNewsList);
    } catch (err) {
      newsList.innerHTML = '';
      newsList.appendChild(buildAlert('alert-danger', 'fa-triangle-exclamation', 'Impossible de charger les news', [err.message]));
    }
  }

  function renderNewsList(newsArray) {
    newsList.innerHTML = '';
    if (newsArray.length === 0) {
      newsList.innerHTML = '<p class="empty-list-msg">Aucune news pour le moment.</p>';
      return;
    }

    const sorted = newsArray.slice().sort((a, b) => (a.date < b.date ? 1 : -1));

    sorted.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'admin-list-item';
      row.innerHTML = `
        ${item.image
          ? `<img class="team-row-thumb" src="${adminAssetPath(item.image)}" alt="">`
          : `<div class="admin-list-thumb"><i class="fa-solid fa-newspaper" style="color:var(--color-navy);"></i></div>`}
        <div class="admin-list-info">
          <strong>${item.title}</strong>
          <span>Saison ${item.season || '—'} — ${item.date || ''}</span>
        </div>
        <label class="news-featured-toggle" title="Afficher à la une sur l'accueil">
          <input type="checkbox" class="featured-checkbox" ${item.featured !== false ? 'checked' : ''}>
          À la une
        </label>
        <div class="admin-list-actions">
          <button type="button" class="edit-btn" title="Modifier"><i class="fa-solid fa-pen"></i></button>
          <button type="button" class="delete-btn" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
        </div>
      `;
      row.querySelector('.edit-btn').addEventListener('click', () => openNewsEditor(item));
      row.querySelector('.delete-btn').addEventListener('click', () => deleteNews(item.id, item.title));
      row.querySelector('.featured-checkbox').addEventListener('change', (e) => {
        toggleNewsFeatured(item.id, e.target.checked);
      });
      newsList.appendChild(row);
    });
  }

  async function toggleNewsFeatured(id, featured) {
    try {
      if (!fileState[NEWS_PATH]) await readFile(NEWS_PATH);
      const updatedArray = fileState[NEWS_PATH].json.news.map((n) =>
        n.id === id ? Object.assign({}, n, { featured }) : n
      );
      const updated = { news: updatedArray };
      const sha = fileState[NEWS_PATH].sha;
      const result = await GitHubAPI.saveJSON(
        cfg, NEWS_PATH, updated, sha,
        `Admin : ${featured ? 'ajout à' : 'retrait de'} la une pour une news`
      );
      fileState[NEWS_PATH] = { json: updated, sha: result.content.sha };
      currentNewsList = updatedArray;
    } catch (err) {
      alert('Erreur : ' + err.message);
      loadNewsView();
    }
  }

  function generateNewsId(newsArray) {
    const numbers = newsArray
      .map((n) => parseInt((n.id.match(/(\d+)/) || [0, 0])[1], 10))
      .filter((n) => !isNaN(n));
    const next = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
    return `news-${next}`;
  }

  document.getElementById('addNewsBtn').addEventListener('click', () => openNewsEditor(null));

  function openNewsEditor(item) {
    newsEditorForm.reset();
    richtextEditor.innerHTML = '';
    newsCoverPreviewWrap.innerHTML = '';
    pendingNewsCoverFile = null;

    if (item) {
      document.getElementById('newsEditId').value = item.id;
      document.getElementById('newsTitle').value = item.title || '';
      document.getElementById('newsDate').value = item.date || new Date().toISOString().slice(0, 10);
      document.getElementById('newsFeatured').checked = item.featured !== false;
      document.getElementById('newsExcerpt').value = item.excerpt || '';
      document.getElementById('newsAlbum').value = item.albumId || '';
      richtextEditor.innerHTML = item.body || '';
      currentNewsCoverPath = item.image || '';
      populateNewsSeasonSelect(
        fileState[SEASONS_PATH] ? fileState[SEASONS_PATH].json.seasons : [],
        item.season
      );
      if (item.image) {
        newsCoverPreviewWrap.innerHTML = `<img class="news-cover-preview" src="${adminAssetPath(item.image)}" alt="">`;
      }
      document.getElementById('newsEditorTitle').textContent = 'Modifier la news';
    } else {
      document.getElementById('newsEditId').value = generateNewsId(currentNewsList);
      document.getElementById('newsDate').value = new Date().toISOString().slice(0, 10);
      currentNewsCoverPath = '';
      const seasons = fileState[SEASONS_PATH] ? fileState[SEASONS_PATH].json.seasons : [];
      populateNewsSeasonSelect(seasons, seasons[seasons.length - 1]);
      document.getElementById('newsEditorTitle').textContent = 'Écrire une news';
    }

    hideStatus(newsEditorStatus);
    newsEditorCard.classList.remove('hidden');
    newsEditorCard.scrollIntoView({ behavior: 'smooth' });
  }

  document.getElementById('newsEditorCancelBtn').addEventListener('click', () => {
    newsEditorCard.classList.add('hidden');
  });

  /* --- Aperçu de la couverture --- */

  newsCoverInput.addEventListener('change', () => {
    const file = newsCoverInput.files[0];
    if (!file) return;
    pendingNewsCoverFile = file;
    const reader = new FileReader();
    reader.onload = () => {
      newsCoverPreviewWrap.innerHTML = `<img class="news-cover-preview" src="${reader.result}" alt="">`;
    };
    reader.readAsDataURL(file);
  });

  /* --- Barre d'outils de mise en forme --- */

  document.querySelectorAll('#richtextToolbar button[data-cmd]').forEach((btn) => {
    preventFocusSteal(btn);
    btn.addEventListener('click', () => {
      const cmd = btn.dataset.cmd;
      if (cmd.startsWith('formatBlock:')) {
        document.execCommand('formatBlock', false, cmd.split(':')[1]);
      } else {
        document.execCommand(cmd, false, null);
      }
    });
  });

  setupRichTextExtras(richtextEditor, {
    sizeMinus: 'richtextSizeMinus',
    sizePlus: 'richtextSizePlus',
    sizeReadout: 'richtextSizeReadout',
    colorToggle: 'richtextColorToggle',
    colorPanel: 'richtextColorPanel'
  });

  document.getElementById('richtextLinkBtn').addEventListener('click', async () => {
    const sel = window.getSelection();
    const linkRange = (sel.rangeCount > 0 && richtextEditor.contains(sel.anchorNode))
      ? sel.getRangeAt(0).cloneRange()
      : null;
    const url = await showPromptModal('Adresse du lien à insérer', '', { placeholder: 'https://exemple.com' });
    if (!url) return;
    restoreEditorSelection(richtextEditor, linkRange);
    createLinkWithTooltip(richtextEditor, url);
  });

  let savedNewsRange = null;

  document.getElementById('richtextImageBtn').addEventListener('click', () => {
    const sel = window.getSelection();
    savedNewsRange = (sel.rangeCount > 0 && richtextEditor.contains(sel.anchorNode))
      ? sel.getRangeAt(0).cloneRange()
      : null;
    richtextImageInput.click();
  });

  function restoreEditorSelection(editor, range) {
    editor.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();
    if (range) {
      sel.addRange(range);
    } else {
      const fallback = document.createRange();
      fallback.selectNodeContents(editor);
      fallback.collapse(false);
      sel.addRange(fallback);
    }
  }

  // Applique une taille de texte précise en pixels (execCommand ne gère nativement que 7 paliers,
  // donc on passe par un <font size="7"> temporaire qu'on remplace aussitôt par un <span style>).
  // Suivi des images dont l'upload est en cours, pour attendre leur fin avant d'enregistrer
  // et ne remplacer la prévisualisation locale par le chemin définitif qu'à ce moment-là.
  const pendingImageUploads = new Map();

  async function waitForPendingImages(editor) {
    const promises = Array.from(editor.querySelectorAll('img[data-pending="true"]'))
      .map((img) => pendingImageUploads.get(img.id))
      .filter(Boolean);
    if (promises.length > 0) await Promise.all(promises);
  }

  function finalizeImagesForSave(editor) {
    editor.querySelectorAll('img[data-final-src]').forEach((img) => {
      img.src = img.dataset.finalSrc;
      img.removeAttribute('data-final-src');
      img.removeAttribute('data-pending');
      img.removeAttribute('id');
    });
  }

  function hasFailedImageUpload(editor) {
    return !!editor.querySelector('img[data-upload-failed]');
  }


  richtextImageInput.addEventListener('change', async () => {
    const file = richtextImageInput.files[0];
    if (!file) return;

    const newsId = document.getElementById('newsEditId').value || 'news-brouillon';
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `imgs/news/${newsId}-inline-${Date.now()}.${ext}`;
    const tempId = 'tmp-img-' + Date.now();

    const dataUrl = await readFileAsDataUrl(file);
    restoreEditorSelection(richtextEditor, savedNewsRange);
    document.execCommand('insertHTML', false, `<img id="${tempId}" data-pending="true" class="resizable-img" src="${dataUrl}" alt="">`);

    setStatus(newsEditorStatus, 'loading', 'Envoi de l\'image en arrière-plan…');
    const uploadPromise = GitHubAPI.uploadFile(cfg, path, file, `Admin : image insérée dans une news`)
      .then(() => {
        const img = richtextEditor.querySelector('#' + tempId);
        if (img) {
          img.dataset.finalSrc = `./${path}`;
          img.removeAttribute('data-pending');
        }
        hideStatus(newsEditorStatus);
      })
      .catch((err) => {
        const img = richtextEditor.querySelector('#' + tempId);
        if (img) img.dataset.uploadFailed = 'true';
        setStatus(newsEditorStatus, 'error', 'Erreur d\'envoi de l\'image : ' + err.message + ' (supprime-la et réessaie avant d\'enregistrer)');
      });

    pendingImageUploads.set(tempId, uploadPromise);
    richtextImageInput.value = '';
  });

  /* --- Enregistrement --- */

  newsEditorForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    deselectImage();
    const saveBtn = document.getElementById('newsSaveBtn');
    saveBtn.disabled = true;
    setStatus(newsEditorStatus, 'loading', 'Enregistrement en cours…');

    try {
      if (!fileState[NEWS_PATH]) await readFile(NEWS_PATH);
      const newsArray = fileState[NEWS_PATH].json.news.slice();

      const id = document.getElementById('newsEditId').value;
      const isNew = !newsArray.some((n) => n.id === id);

      let image = currentNewsCoverPath;
      if (pendingNewsCoverFile) {
        setStatus(newsEditorStatus, 'loading', 'Envoi de la photo de couverture…');
        const ext = (pendingNewsCoverFile.name.split('.').pop() || 'jpg').toLowerCase();
        const coverPath = `imgs/news/${id}-cover.${ext}`;
        await GitHubAPI.uploadFile(cfg, coverPath, pendingNewsCoverFile, `Admin : photo de couverture de la news "${id}"`);
        image = './' + coverPath;
      }

      setStatus(newsEditorStatus, 'loading', 'Finalisation des images du contenu…');
      await waitForPendingImages(richtextEditor);
      if (hasFailedImageUpload(richtextEditor)) {
        throw new Error('Une image du contenu n\'a pas pu être envoyée. Supprime-la (clique dessus puis sur la corbeille) et réessaie.');
      }
      finalizeImagesForSave(richtextEditor);

      const entry = {
        id,
        featured: document.getElementById('newsFeatured').checked,
        season: newsSeasonSelect.value,
        title: document.getElementById('newsTitle').value.trim(),
        excerpt: document.getElementById('newsExcerpt').value.trim(),
        body: richtextEditor.innerHTML,
        image,
        albumId: document.getElementById('newsAlbum').value || '',
        date: document.getElementById('newsDate').value
      };

      const updatedArray = isNew
        ? newsArray.concat(entry)
        : newsArray.map((n) => (n.id === id ? entry : n));

      setStatus(newsEditorStatus, 'loading', 'Enregistrement de la news…');
      const updated = { news: updatedArray };
      const sha = fileState[NEWS_PATH].sha;
      const result = await GitHubAPI.saveJSON(
        cfg, NEWS_PATH, updated, sha,
        isNew ? `Admin : publication de la news "${entry.title}"` : `Admin : modification de la news "${entry.title}"`
      );
      fileState[NEWS_PATH] = { json: updated, sha: result.content.sha };

      currentNewsList = updatedArray;
      renderNewsList(updatedArray);
      newsEditorCard.classList.add('hidden');
      setStatus(newsEditorStatus, 'success', 'News enregistrée ! Le site se mettra à jour d\'ici 1 à 2 minutes.');
      updateRSSFeed(updatedArray);
    } catch (err) {
      setStatus(newsEditorStatus, 'error', 'Erreur : ' + err.message);
    } finally {
      saveBtn.disabled = false;
    }
  });

  // Retire le "./" en tête d'un chemin stocké (image.image, image dans le body...)
  // pour obtenir le chemin brut attendu par l'API GitHub.
  function toRepoPath(path) {
    if (!path) return path;
    // URL absolue GitHub Pages (ex: images insérées dans l'éditeur riche) -> chemin relatif au dépôt
    const absolutePrefix = `https://${cfg.owner}.github.io/${cfg.repo}/`;
    if (path.startsWith(absolutePrefix)) {
      return path.slice(absolutePrefix.length);
    }
    return path.replace(/^\.\//, '');
  }

  async function deleteFileIfExists(path) {
    if (!path) return;
    try {
      const meta = await GitHubAPI.getFileMeta(cfg, path);
      await GitHubAPI.deleteFile(cfg, path, meta.sha, `Admin : suppression d'un fichier lié à une news supprimée`);
    } catch (err) {
      console.warn('Impossible de supprimer', path, '(peut-être déjà absent) :', err.message);
    }
  }

  // Repère toutes les images uploadées (imgs/news/...) référencées dans une news
  // (couverture + images insérées dans le corps de l'article) pour les nettoyer.
  function collectNewsImagePaths(item) {
    const paths = [];
    if (item.image && item.image.includes('imgs/news/')) {
      paths.push(toRepoPath(item.image));
    }
    const matches = (item.body || '').matchAll(/<img[^>]+src=["']([^"']*imgs\/news\/[^"']+)["']/g);
    for (const m of matches) {
      paths.push(toRepoPath(m[1]));
    }
    return paths;
  }

  async function deleteNews(id, title) {
    if (!(await showConfirmModal(`Supprimer la news "${title}" ? Ses photos associées seront aussi supprimées. Cette action est immédiate.`))) return;

    setStatus(newsEditorStatus, 'loading', 'Suppression en cours…');
    try {
      if (!fileState[NEWS_PATH]) await readFile(NEWS_PATH);
      const itemToDelete = fileState[NEWS_PATH].json.news.find((n) => n.id === id);
      const updatedArray = fileState[NEWS_PATH].json.news.filter((n) => n.id !== id);
      const updated = { news: updatedArray };

      const sha = fileState[NEWS_PATH].sha;
      const result = await GitHubAPI.saveJSON(cfg, NEWS_PATH, updated, sha, `Admin : suppression de la news "${title}"`);
      fileState[NEWS_PATH] = { json: updated, sha: result.content.sha };

      // Nettoyage des images uploadées qui ne servent plus à rien
      if (itemToDelete) {
        const imagePaths = collectNewsImagePaths(itemToDelete);
        for (const imgPath of imagePaths) {
          await deleteFileIfExists(imgPath);
        }
      }

      currentNewsList = updatedArray;
      renderNewsList(updatedArray);
      updateRSSFeed(updatedArray);
    } catch (err) {
      alert('Erreur lors de la suppression : ' + err.message);
    }
  }

  /* --- Flux RSS (régénéré automatiquement à chaque modification) --- */

  function escapeXml(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function toRFC822(dateStr) {
    if (!dateStr) return new Date().toUTCString();
    return new Date(dateStr + 'T00:00:00Z').toUTCString();
  }

  function buildRSSFeed(newsArray) {
    const baseUrl = `https://${cfg.owner}.github.io/${cfg.repo}`;
    const sorted = newsArray.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    const items = sorted.map((item) => {
      const link = `${baseUrl}/news-article.html?id=${item.id}`;
      return `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid>${escapeXml(link)}</guid>
      <description>${escapeXml(item.excerpt)}</description>
      <pubDate>${toRFC822(item.date)}</pubDate>
    </item>`;
    }).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>AS Thiais Tennis de Table - Actualités</title>
    <link>${baseUrl}/news.html</link>
    <description>Les actualités du club AS Thiais Tennis de Table</description>
    <language>fr-fr</language>
${items}
  </channel>
</rss>
`;
  }

  async function updateRSSFeed(newsArray) {
    try {
      const rssContent = buildRSSFeed(newsArray);
      const blob = new Blob([rssContent], { type: 'application/xml' });
      await GitHubAPI.uploadFile(cfg, 'rss.xml', blob, 'Admin : mise à jour du flux RSS');
    } catch (err) {
      console.error('Erreur lors de la mise à jour du flux RSS :', err);
    }
  }

  /* ---------- Liens Utiles ---------- */

  const LINKS_PATH = 'data/liens-utiles.json';

  const linkCategoriesList = document.getElementById('linkCategoriesList');
  const linksList = document.getElementById('linksList');
  const linkCategoryStatus = document.getElementById('linkCategoryStatus');
  const linkStatus = document.getElementById('linkStatus');
  const linkEditorForm = document.getElementById('linkEditorForm');
  const linkCancelBtn = document.getElementById('linkCancelBtn');
  const linkSaveLabel = document.getElementById('linkSaveLabel');
  const linkCategorySelect = document.getElementById('linkCategory');

  async function loadLinksView() {
    linkCategoriesList.innerHTML = '<p style="color:var(--color-text-muted); font-size:0.85rem;"><i class="fa-solid fa-spinner fa-spin"></i> Chargement…</p>';
    linksList.innerHTML = '';
    try {
      const data = await readFile(LINKS_PATH);
      renderLinksAdmin(data.categories || []);
    } catch (err) {
      linkCategoriesList.innerHTML = '';
      linksList.appendChild(buildAlert('alert-danger', 'fa-triangle-exclamation', 'Impossible de charger les liens', [err.message]));
    }
  }

  function renderLinksAdmin(categories) {
    /* --- Catégories --- */
    linkCategoriesList.innerHTML = '';
    if (categories.length === 0) {
      linkCategoriesList.innerHTML = '<p class="empty-list-msg">Aucune catégorie pour le moment.</p>';
    } else {
      categories.forEach((cat) => {
        const row = document.createElement('div');
        row.className = 'nav-category-row';
        row.innerHTML = `
          <i class="fa-solid fa-folder folder-icon"></i>
          <strong>${cat.label} (${(cat.links || []).length})</strong>
          <div class="admin-list-actions">
            <button type="button" class="rename-btn" title="Renommer"><i class="fa-solid fa-pen"></i></button>
            <button type="button" class="delete-btn" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
          </div>
        `;
        row.querySelector('.rename-btn').addEventListener('click', () => renameLinkCategory(cat.id, cat.label));
        row.querySelector('.delete-btn').addEventListener('click', () => deleteLinkCategory(cat.id, cat.label, (cat.links || []).length));
        linkCategoriesList.appendChild(row);
      });
    }

    /* --- Select du formulaire --- */
    linkCategorySelect.innerHTML = categories.map((cat) => `<option value="${cat.id}">${cat.label}</option>`).join('');

    /* --- Liste des liens --- */
    linksList.innerHTML = '';
    let total = 0;

    categories.forEach((cat) => {
      const links = cat.links || [];
      total += links.length;

      const title = document.createElement('div');
      title.className = 'admin-list-category-title';
      title.textContent = `${cat.label} (${links.length})`;
      linksList.appendChild(title);

      if (links.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'empty-list-msg';
        empty.textContent = 'Aucun lien dans cette catégorie.';
        linksList.appendChild(empty);
        return;
      }

      links.forEach((link) => {
        const row = document.createElement('div');
        row.className = 'admin-list-item';
        row.innerHTML = `
          <div class="admin-list-thumb"><i class="fa-solid ${link.icon || 'fa-link'}" style="color:var(--color-navy);"></i></div>
          <div class="admin-list-info">
            <strong>${link.title}</strong>
            <span>${link.url}</span>
          </div>
          <div class="admin-list-actions">
            <button type="button" class="edit-btn" title="Modifier"><i class="fa-solid fa-pen"></i></button>
            <button type="button" class="delete-btn" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
          </div>
        `;
        row.querySelector('.edit-btn').addEventListener('click', () => startEditLink(cat.id, link));
        row.querySelector('.delete-btn').addEventListener('click', () => deleteLink(cat.id, link.id, link.title));
        linksList.appendChild(row);
      });
    });

    if (total === 0) {
      linksList.innerHTML += '<p class="empty-list-msg">Aucun lien pour le moment.</p>';
    }
  }

  function startEditLink(categoryId, link) {
    document.getElementById('linkEditId').value = link.id;
    document.getElementById('linkTitle').value = link.title || '';
    linkCategorySelect.value = categoryId;
    document.getElementById('linkUrl').value = link.url || '';
    document.getElementById('linkDescription').value = link.description || '';
    document.getElementById('linkIcon').value = link.icon || 'fa-link';
    refreshLinkIconPreview();
    linkSaveLabel.textContent = 'Enregistrer les modifications';
    linkCancelBtn.classList.remove('hidden');
    document.getElementById('linkFormTitle').textContent = 'Modifier le lien';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetLinkForm() {
    linkEditorForm.reset();
    document.getElementById('linkEditId').value = '';
    document.getElementById('linkIcon').value = 'fa-link';
    refreshLinkIconPreview();
    linkSaveLabel.textContent = 'Ajouter le lien';
    linkCancelBtn.classList.add('hidden');
    document.getElementById('linkFormTitle').textContent = 'Ajouter un lien';
  }

  linkCancelBtn.addEventListener('click', resetLinkForm);

  function generateLinkId(title, categories) {
    const base = slugify(title) || 'lien';
    const allIds = categories.flatMap((c) => (c.links || []).map((l) => l.id));
    let id = base;
    let counter = 2;
    while (allIds.includes(id)) {
      id = `${base}-${counter}`;
      counter++;
    }
    return id;
  }

  linkEditorForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const saveBtn = document.getElementById('linkSaveBtn');
    saveBtn.disabled = true;
    setStatus(linkStatus, 'loading', 'Enregistrement en cours…');

    try {
      if (!fileState[LINKS_PATH]) await readFile(LINKS_PATH);
      const categories = fileState[LINKS_PATH].json.categories.map((c) =>
        Object.assign({}, c, { links: (c.links || []).slice() })
      );

      const editingId = document.getElementById('linkEditId').value;
      const targetCategoryId = linkCategorySelect.value;
      const title = document.getElementById('linkTitle').value.trim();
      const url = document.getElementById('linkUrl').value.trim();
      const description = document.getElementById('linkDescription').value.trim();
      const icon = document.getElementById('linkIcon').value.trim() || 'fa-link';

      if (editingId) {
        categories.forEach((c) => {
          c.links = c.links.filter((l) => l.id !== editingId);
        });
      }

      const id = editingId || generateLinkId(title, categories);
      const linkEntry = { id, title, url, description, icon };

      const targetCategory = categories.find((c) => c.id === targetCategoryId);
      if (!targetCategory) throw new Error('Catégorie introuvable.');
      targetCategory.links.push(linkEntry);

      const updated = { categories };
      const sha = fileState[LINKS_PATH].sha;
      const result = await GitHubAPI.saveJSON(
        cfg, LINKS_PATH, updated, sha,
        editingId ? `Admin : modification du lien "${title}"` : `Admin : ajout du lien "${title}"`
      );

      fileState[LINKS_PATH] = { json: updated, sha: result.content.sha };
      renderLinksAdmin(categories);
      resetLinkForm();
      setStatus(linkStatus, 'success', 'Enregistré ! Le site se mettra à jour d\'ici 1 à 2 minutes.');
    } catch (err) {
      setStatus(linkStatus, 'error', 'Erreur : ' + err.message);
    } finally {
      saveBtn.disabled = false;
    }
  });

  async function deleteLink(categoryId, linkId, title) {
    if (!(await showConfirmModal(`Supprimer le lien "${title}" ?`))) return;

    setStatus(linkStatus, 'loading', 'Suppression en cours…');
    try {
      if (!fileState[LINKS_PATH]) await readFile(LINKS_PATH);
      const categories = fileState[LINKS_PATH].json.categories.map((c) => {
        if (c.id !== categoryId) return c;
        return Object.assign({}, c, { links: (c.links || []).filter((l) => l.id !== linkId) });
      });

      const updated = { categories };
      const sha = fileState[LINKS_PATH].sha;
      const result = await GitHubAPI.saveJSON(cfg, LINKS_PATH, updated, sha, `Admin : suppression du lien "${title}"`);

      fileState[LINKS_PATH] = { json: updated, sha: result.content.sha };
      renderLinksAdmin(categories);
      setStatus(linkStatus, 'success', 'Lien supprimé.');
    } catch (err) {
      setStatus(linkStatus, 'error', 'Erreur : ' + err.message);
    }
  }

  /* --- Catégories --- */

  document.getElementById('addLinkCategoryBtn').addEventListener('click', async () => {
    const input = document.getElementById('newLinkCategoryLabel');
    const label = input.value.trim();
    if (!label) {
      setStatus(linkCategoryStatus, 'error', 'Donne un nom à la catégorie avant de la créer.');
      return;
    }

    setStatus(linkCategoryStatus, 'loading', 'Création en cours…');
    try {
      if (!fileState[LINKS_PATH]) await readFile(LINKS_PATH);
      const categories = fileState[LINKS_PATH].json.categories.slice();
      const id = generateLinkId(label, categories.map((c) => ({ links: [{ id: c.id }] })));
      categories.push({ id, label, icon: 'fa-link', links: [] });

      const updated = { categories };
      const sha = fileState[LINKS_PATH].sha;
      const result = await GitHubAPI.saveJSON(cfg, LINKS_PATH, updated, sha, `Admin : création de la catégorie de liens "${label}"`);

      fileState[LINKS_PATH] = { json: updated, sha: result.content.sha };
      renderLinksAdmin(categories);
      input.value = '';
      setStatus(linkCategoryStatus, 'success', 'Catégorie créée !');
    } catch (err) {
      setStatus(linkCategoryStatus, 'error', 'Erreur : ' + err.message);
    }
  });

  async function renameLinkCategory(id, currentLabel) {
    const newLabel = await showPromptModal('Nouveau nom de la catégorie', currentLabel);
    if (!newLabel || !newLabel.trim() || newLabel.trim() === currentLabel) return;

    setStatus(linkCategoryStatus, 'loading', 'Renommage en cours…');
    try {
      if (!fileState[LINKS_PATH]) await readFile(LINKS_PATH);
      const categories = fileState[LINKS_PATH].json.categories.map((c) =>
        c.id === id ? Object.assign({}, c, { label: newLabel.trim() }) : c
      );

      const updated = { categories };
      const sha = fileState[LINKS_PATH].sha;
      const result = await GitHubAPI.saveJSON(cfg, LINKS_PATH, updated, sha, `Admin : renommage d'une catégorie de liens en "${newLabel.trim()}"`);

      fileState[LINKS_PATH] = { json: updated, sha: result.content.sha };
      renderLinksAdmin(categories);
      setStatus(linkCategoryStatus, 'success', 'Catégorie renommée.');
    } catch (err) {
      setStatus(linkCategoryStatus, 'error', 'Erreur : ' + err.message);
    }
  }

  async function deleteLinkCategory(id, label, linkCount) {
    const message = linkCount > 0
      ? `Supprimer la catégorie "${label}" ? Les ${linkCount} lien(s) qu'elle contient seront supprimés aussi.`
      : `Supprimer la catégorie "${label}" ?`;
    if (!(await showConfirmModal(message))) return;

    setStatus(linkCategoryStatus, 'loading', 'Suppression en cours…');
    try {
      if (!fileState[LINKS_PATH]) await readFile(LINKS_PATH);
      const categories = fileState[LINKS_PATH].json.categories.filter((c) => c.id !== id);

      const updated = { categories };
      const sha = fileState[LINKS_PATH].sha;
      const result = await GitHubAPI.saveJSON(cfg, LINKS_PATH, updated, sha, `Admin : suppression de la catégorie de liens "${label}"`);

      fileState[LINKS_PATH] = { json: updated, sha: result.content.sha };
      renderLinksAdmin(categories);
      setStatus(linkCategoryStatus, 'success', 'Catégorie supprimée.');
    } catch (err) {
      setStatus(linkCategoryStatus, 'error', 'Erreur : ' + err.message);
    }
  }

  /* ---------- Albums photo ---------- */

  const albumsList = document.getElementById('albumsList');
  const albumEditorCard = document.getElementById('albumEditorCard');
  const albumEditorForm = document.getElementById('albumEditorForm');
  const albumEditorStatus = document.getElementById('albumEditorStatus');
  const albumPhotosSection = document.getElementById('albumPhotosSection');
  const albumPhotosInput = document.getElementById('albumPhotosInput');
  const albumPhotosStatus = document.getElementById('albumPhotosStatus');
  const albumPhotosGrid = document.getElementById('albumPhotosGrid');
  const albumSaveLabel = document.getElementById('albumSaveLabel');

  let currentAlbumsList = [];

  async function loadAlbumsView() {
    albumsList.innerHTML = '<p style="color:var(--color-text-muted); font-size:0.88rem;"><i class="fa-solid fa-spinner fa-spin"></i> Chargement…</p>';
    try {
      const [data, seasonsData] = await Promise.all([readFile(ALBUMS_PATH), readFile(SEASONS_PATH)]);
      populateSeasonSelect(document.getElementById('albumSeason'), seasonsData.seasons || [], null);
      currentAlbumsList = data.albums || [];
      renderAlbumsList(currentAlbumsList);
    } catch (err) {
      albumsList.innerHTML = '';
      albumsList.appendChild(buildAlert('alert-danger', 'fa-triangle-exclamation', 'Impossible de charger les albums', [err.message]));
    }
  }

  function renderAlbumsList(albums) {
    albumsList.innerHTML = '';
    if (albums.length === 0) {
      albumsList.innerHTML = '<p class="empty-list-msg">Aucun album pour le moment.</p>';
      return;
    }

    const sorted = albums.slice().sort((a, b) => (a.date < b.date ? 1 : -1));

    sorted.forEach((album) => {
      const cover = (album.photos || [])[0];
      const row = document.createElement('div');
      row.className = 'admin-list-item';
      row.innerHTML = `
        ${cover
          ? `<img class="album-cover-thumb" src="${adminAssetPath(cover)}" alt="">`
          : `<div class="admin-list-thumb"><i class="fa-solid fa-images" style="color:var(--color-navy);"></i></div>`}
        <div class="admin-list-info">
          <strong>${album.title}</strong>
          <span>${(album.photos || []).length} photo(s) — ${album.date || ''}</span>
        </div>
        <div class="admin-list-actions">
          <a href="../albums.html" target="_blank" rel="noopener" class="view-link-btn" title="Voir la page albums"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>
          <button type="button" class="edit-btn" title="Modifier"><i class="fa-solid fa-pen"></i></button>
          <button type="button" class="delete-btn" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
        </div>
      `;
      row.querySelector('.edit-btn').addEventListener('click', () => openAlbumEditor(album));
      row.querySelector('.delete-btn').addEventListener('click', () => deleteAlbum(album.id, album.title));
      albumsList.appendChild(row);
    });
  }

  function generateAlbumId(title, albums) {
    const base = slugify(title) || 'album';
    const allIds = albums.map((a) => a.id);
    let id = base;
    let counter = 2;
    while (allIds.includes(id)) {
      id = `${base}-${counter}`;
      counter++;
    }
    return id;
  }

  function renderAlbumPhotosGrid(photos) {
    albumPhotosGrid.innerHTML = '';
    (photos || []).forEach((photoPath, index) => {
      const item = document.createElement('div');
      item.className = 'album-photo-item';
      item.innerHTML = `
        <img src="${adminAssetPath(photoPath)}" alt="">
        <button type="button" class="remove-photo-btn" title="Supprimer cette photo"><i class="fa-solid fa-xmark"></i></button>
      `;
      item.querySelector('.remove-photo-btn').addEventListener('click', () => removeAlbumPhoto(index));
      albumPhotosGrid.appendChild(item);
    });
  }

  function openAlbumEditor(album) {
    albumEditorForm.reset();
    albumPhotosGrid.innerHTML = '';
    hideStatus(albumEditorStatus);
    hideStatus(albumPhotosStatus);

    if (album) {
      document.getElementById('albumEditId').value = album.id;
      document.getElementById('albumTitle').value = album.title || '';
      document.getElementById('albumDate').value = album.date || '';
      document.getElementById('albumDescription').value = album.description || '';
      document.getElementById('albumSeason').value = album.season || '';
      albumSaveLabel.textContent = 'Enregistrer les modifications';
      document.getElementById('albumEditorTitle').textContent = 'Modifier l\'album';
      albumPhotosSection.classList.remove('hidden');
      renderAlbumPhotosGrid(album.photos || []);
    } else {
      document.getElementById('albumEditId').value = '';
      document.getElementById('albumDate').value = new Date().toISOString().slice(0, 10);
      albumSaveLabel.textContent = 'Créer l\'album';
      document.getElementById('albumEditorTitle').textContent = 'Créer un album';
      albumPhotosSection.classList.add('hidden');
    }

    albumEditorCard.classList.remove('hidden');
    albumEditorCard.scrollIntoView({ behavior: 'smooth' });
  }

  document.getElementById('addAlbumBtn').addEventListener('click', () => openAlbumEditor(null));
  document.getElementById('addAlbumSeasonBtn').addEventListener('click', () => {
    addNewSeason(
      document.getElementById('newAlbumSeasonInput'),
      albumEditorStatus,
      (seasons, justAdded) => populateSeasonSelect(document.getElementById('albumSeason'), seasons, justAdded)
    );
  });
  document.getElementById('albumEditorCancelBtn').addEventListener('click', () => {
    albumEditorCard.classList.add('hidden');
  });

  albumEditorForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const saveBtn = document.getElementById('albumSaveBtn');
    saveBtn.disabled = true;
    setStatus(albumEditorStatus, 'loading', 'Enregistrement en cours…');

    try {
      if (!fileState[ALBUMS_PATH]) await readFile(ALBUMS_PATH);
      const albums = fileState[ALBUMS_PATH].json.albums.slice();

      const editingId = document.getElementById('albumEditId').value;
      const title = document.getElementById('albumTitle').value.trim();
      const date = document.getElementById('albumDate').value;
      const description = document.getElementById('albumDescription').value.trim();

      let updatedAlbums;
      let savedAlbum;

      const season = document.getElementById('albumSeason').value;

      if (editingId) {
        updatedAlbums = albums.map((a) => {
          if (a.id !== editingId) return a;
          savedAlbum = Object.assign({}, a, { title, date, season, description });
          return savedAlbum;
        });
      } else {
        const id = generateAlbumId(title, albums);
        savedAlbum = { id, title, date, season, description, photos: [] };
        updatedAlbums = albums.concat(savedAlbum);
      }

      const updated = { albums: updatedAlbums };
      const sha = fileState[ALBUMS_PATH].sha;
      const result = await GitHubAPI.saveJSON(
        cfg, ALBUMS_PATH, updated, sha,
        editingId ? `Admin : modification de l'album "${title}"` : `Admin : création de l'album "${title}"`
      );

      fileState[ALBUMS_PATH] = { json: updated, sha: result.content.sha };
      currentAlbumsList = updatedAlbums;
      renderAlbumsList(updatedAlbums);

      // Révèle / met à jour la section photos une fois l'album créé
      document.getElementById('albumEditId').value = savedAlbum.id;
      albumSaveLabel.textContent = 'Enregistrer les modifications';
      document.getElementById('albumEditorTitle').textContent = 'Modifier l\'album';
      albumPhotosSection.classList.remove('hidden');
      renderAlbumPhotosGrid(savedAlbum.photos || []);

      setStatus(albumEditorStatus, 'success', 'Album enregistré ! Tu peux maintenant ajouter des photos ci-dessous.');
    } catch (err) {
      setStatus(albumEditorStatus, 'error', 'Erreur : ' + err.message);
    } finally {
      saveBtn.disabled = false;
    }
  });

  /* --- Upload de photos (plusieurs à la fois) --- */

  albumPhotosInput.addEventListener('change', async () => {
    const files = Array.from(albumPhotosInput.files || []);
    if (files.length === 0) return;

    const albumId = document.getElementById('albumEditId').value;
    if (!albumId) return;

    setStatus(albumPhotosStatus, 'loading', `Envoi de ${files.length} photo(s)…`);

    try {
      if (!fileState[ALBUMS_PATH]) await readFile(ALBUMS_PATH);
      const albums = fileState[ALBUMS_PATH].json.albums.slice();
      const albumIndex = albums.findIndex((a) => a.id === albumId);
      if (albumIndex === -1) throw new Error('Album introuvable.');

      const newPhotoPaths = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
        const path = `imgs/albums/${albumId}/${Date.now()}-${i}.${ext}`;
        setStatus(albumPhotosStatus, 'loading', `Envoi de la photo ${i + 1} / ${files.length}…`);
        await GitHubAPI.uploadFile(cfg, path, file, `Admin : ajout d'une photo à l'album "${albums[albumIndex].title}"`);
        newPhotoPaths.push('./' + path);
      }

      const updatedAlbum = Object.assign({}, albums[albumIndex], {
        photos: (albums[albumIndex].photos || []).concat(newPhotoPaths)
      });
      albums[albumIndex] = updatedAlbum;

      const updated = { albums };
      const sha = fileState[ALBUMS_PATH].sha;
      const result = await GitHubAPI.saveJSON(cfg, ALBUMS_PATH, updated, sha, `Admin : ajout de photos à l'album "${updatedAlbum.title}"`);
      fileState[ALBUMS_PATH] = { json: updated, sha: result.content.sha };

      currentAlbumsList = albums;
      renderAlbumsList(albums);
      renderAlbumPhotosGrid(updatedAlbum.photos);
      setStatus(albumPhotosStatus, 'success', `${files.length} photo(s) ajoutée(s) !`);
    } catch (err) {
      setStatus(albumPhotosStatus, 'error', 'Erreur : ' + err.message);
    } finally {
      albumPhotosInput.value = '';
    }
  });

  /* --- Suppression d'une photo individuelle --- */

  async function removeAlbumPhoto(index) {
    if (!(await showConfirmModal('Supprimer cette photo ? Elle sera aussi retirée de GitHub.'))) return;

    const albumId = document.getElementById('albumEditId').value;
    setStatus(albumPhotosStatus, 'loading', 'Suppression en cours…');

    try {
      if (!fileState[ALBUMS_PATH]) await readFile(ALBUMS_PATH);
      const albums = fileState[ALBUMS_PATH].json.albums.slice();
      const albumIndex = albums.findIndex((a) => a.id === albumId);
      if (albumIndex === -1) throw new Error('Album introuvable.');

      const photoToRemove = (albums[albumIndex].photos || [])[index];
      const updatedPhotos = (albums[albumIndex].photos || []).filter((_, i) => i !== index);
      albums[albumIndex] = Object.assign({}, albums[albumIndex], { photos: updatedPhotos });

      const updated = { albums };
      const sha = fileState[ALBUMS_PATH].sha;
      const result = await GitHubAPI.saveJSON(cfg, ALBUMS_PATH, updated, sha, `Admin : suppression d'une photo d'album`);
      fileState[ALBUMS_PATH] = { json: updated, sha: result.content.sha };

      if (photoToRemove) {
        await deleteFileIfExists(toRepoPath(photoToRemove));
      }

      currentAlbumsList = albums;
      renderAlbumsList(albums);
      renderAlbumPhotosGrid(updatedPhotos);
      setStatus(albumPhotosStatus, 'success', 'Photo supprimée.');
    } catch (err) {
      setStatus(albumPhotosStatus, 'error', 'Erreur : ' + err.message);
    }
  }

  /* --- Suppression d'un album entier --- */

  async function deleteAlbum(id, title) {
    if (!(await showConfirmModal(`Supprimer l'album "${title}" ? Toutes ses photos seront aussi supprimées de GitHub. Cette action est immédiate.`))) return;

    try {
      if (!fileState[ALBUMS_PATH]) await readFile(ALBUMS_PATH);
      const albumToDelete = fileState[ALBUMS_PATH].json.albums.find((a) => a.id === id);
      const updatedAlbums = fileState[ALBUMS_PATH].json.albums.filter((a) => a.id !== id);

      const updated = { albums: updatedAlbums };
      const sha = fileState[ALBUMS_PATH].sha;
      const result = await GitHubAPI.saveJSON(cfg, ALBUMS_PATH, updated, sha, `Admin : suppression de l'album "${title}"`);
      fileState[ALBUMS_PATH] = { json: updated, sha: result.content.sha };

      // Nettoyage de toutes les photos de l'album
      if (albumToDelete) {
        for (const photoPath of (albumToDelete.photos || [])) {
          await deleteFileIfExists(toRepoPath(photoPath));
        }
      }

      // Retire la référence à cet album dans les news qui le pointaient
      try {
        if (!fileState[NEWS_PATH]) await readFile(NEWS_PATH);
        const affectedNews = fileState[NEWS_PATH].json.news.filter((n) => n.albumId === id);
        if (affectedNews.length > 0) {
          const updatedNews = fileState[NEWS_PATH].json.news.map((n) =>
            n.albumId === id ? Object.assign({}, n, { albumId: '' }) : n
          );
          const newsSha = fileState[NEWS_PATH].sha;
          const newsResult = await GitHubAPI.saveJSON(
            cfg, NEWS_PATH, { news: updatedNews }, newsSha, `Admin : retrait des références à l'album supprimé "${title}"`
          );
          fileState[NEWS_PATH] = { json: { news: updatedNews }, sha: newsResult.content.sha };
        }
      } catch (e) {
        console.warn('Impossible de nettoyer les références news à cet album :', e.message);
      }

      currentAlbumsList = updatedAlbums;
      renderAlbumsList(updatedAlbums);
      albumEditorCard.classList.add('hidden');
    } catch (err) {
      alert('Erreur lors de la suppression : ' + err.message);
    }
  }

  /* ---------- Galerie Vidéo ---------- */

  const VIDEOS_PATH = 'data/videos.json';

  const videosList = document.getElementById('videosList');
  const videoStatus = document.getElementById('videoStatus');
  const videoEditorForm = document.getElementById('videoEditorForm');
  const videoCancelBtn = document.getElementById('videoCancelBtn');
  const videoSaveLabel = document.getElementById('videoSaveLabel');

  function parseVideoUrl(url) {
    if (!url) return null;

    // YouTube (liens classiques, courts, Shorts, Live, embed...)
    let m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{6,})/);
    if (m) {
      return {
        provider: 'youtube',
        thumbnail: `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg`,
        embedUrl: `https://www.youtube.com/embed/${m[1]}`
      };
    }

    // Vimeo
    m = url.match(/vimeo\.com\/(\d+)/);
    if (m) {
      return {
        provider: 'vimeo',
        thumbnail: '',
        embedUrl: `https://player.vimeo.com/video/${m[1]}`
      };
    }

    // Google Drive (lien de partage classique ou lien "open?id=")
    m = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (!m) m = url.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
    if (!m) m = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (m) {
      return {
        provider: 'gdrive',
        thumbnail: `https://drive.google.com/thumbnail?id=${m[1]}&sz=w640`,
        embedUrl: `https://drive.google.com/file/d/${m[1]}/preview`
      };
    }

    return null;
  }

  async function loadVideosView() {
    videosList.innerHTML = '<p style="color:var(--color-text-muted); font-size:0.88rem;"><i class="fa-solid fa-spinner fa-spin"></i> Chargement…</p>';
    try {
      const [data, seasonsData] = await Promise.all([readFile(VIDEOS_PATH), readFile(SEASONS_PATH)]);
      populateSeasonSelect(document.getElementById('videoSeason'), seasonsData.seasons || [], null);
      renderVideosList(data.videos || []);
    } catch (err) {
      videosList.innerHTML = '';
      videosList.appendChild(buildAlert('alert-danger', 'fa-triangle-exclamation', 'Impossible de charger les vidéos', [err.message]));
    }
  }

  function renderVideosList(videos) {
    videosList.innerHTML = '';
    if (videos.length === 0) {
      videosList.innerHTML = '<p class="empty-list-msg">Aucune vidéo pour le moment.</p>';
      return;
    }

    const sorted = videos.slice().sort((a, b) => (a.date < b.date ? 1 : -1));

    sorted.forEach((video) => {
      const parsed = parseVideoUrl(video.url);
      const row = document.createElement('div');
      row.className = 'admin-list-item';
      row.innerHTML = `
        ${parsed && parsed.thumbnail
          ? `<img class="team-row-thumb" src="${parsed.thumbnail}" alt="">`
          : `<div class="admin-list-thumb"><i class="fa-solid fa-video" style="color:var(--color-navy);"></i></div>`}
        <div class="admin-list-info">
          <strong>${video.title}</strong>
          <span>${video.date || ''}</span>
        </div>
        <div class="admin-list-actions">
          <a href="${video.url}" target="_blank" rel="noopener" class="view-link-btn" title="Voir sur YouTube/Vimeo"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>
          <button type="button" class="edit-btn" title="Modifier"><i class="fa-solid fa-pen"></i></button>
          <button type="button" class="delete-btn" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
        </div>
      `;
      row.querySelector('.edit-btn').addEventListener('click', () => startEditVideo(video));
      row.querySelector('.delete-btn').addEventListener('click', () => deleteVideo(video.id, video.title));
      videosList.appendChild(row);
    });
  }

  function generateVideoId(title, videos) {
    const base = slugify(title) || 'video';
    const allIds = videos.map((v) => v.id);
    let id = base;
    let counter = 2;
    while (allIds.includes(id)) {
      id = `${base}-${counter}`;
      counter++;
    }
    return id;
  }

  function startEditVideo(video) {
    document.getElementById('videoEditId').value = video.id;
    document.getElementById('videoTitle').value = video.title || '';
    document.getElementById('videoDate').value = video.date || '';
    document.getElementById('videoUrl').value = video.url || '';
    document.getElementById('videoSeason').value = video.season || '';
    videoSaveLabel.textContent = 'Enregistrer les modifications';
    videoCancelBtn.classList.remove('hidden');
    document.getElementById('videoFormTitle').textContent = 'Modifier la vidéo';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetVideoForm() {
    videoEditorForm.reset();
    document.getElementById('videoEditId').value = '';
    document.getElementById('videoDate').value = new Date().toISOString().slice(0, 10);
    videoSaveLabel.textContent = 'Ajouter la vidéo';
    videoCancelBtn.classList.add('hidden');
    document.getElementById('videoFormTitle').textContent = 'Ajouter une vidéo';
  }

  videoCancelBtn.addEventListener('click', resetVideoForm);
  document.getElementById('addVideoSeasonBtn').addEventListener('click', () => {
    addNewSeason(
      document.getElementById('newVideoSeasonInput'),
      videoStatus,
      (seasons, justAdded) => populateSeasonSelect(document.getElementById('videoSeason'), seasons, justAdded)
    );
  });
  resetVideoForm();

  videoEditorForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const saveBtn = document.getElementById('videoSaveBtn');
    const url = document.getElementById('videoUrl').value.trim();

    if (!parseVideoUrl(url)) {
      setStatus(videoStatus, 'error', 'Ce lien ne semble pas être une vidéo YouTube, Vimeo ou Google Drive valide.');
      return;
    }

    saveBtn.disabled = true;
    setStatus(videoStatus, 'loading', 'Enregistrement en cours…');

    try {
      if (!fileState[VIDEOS_PATH]) await readFile(VIDEOS_PATH);
      const videos = fileState[VIDEOS_PATH].json.videos.slice();

      const editingId = document.getElementById('videoEditId').value;
      const title = document.getElementById('videoTitle').value.trim();
      const date = document.getElementById('videoDate').value;

      const season = document.getElementById('videoSeason').value;
      const entry = { id: editingId || generateVideoId(title, videos), title, date, season, url };
      const updatedVideos = editingId
        ? videos.map((v) => (v.id === editingId ? entry : v))
        : videos.concat(entry);

      const updated = { videos: updatedVideos };
      const sha = fileState[VIDEOS_PATH].sha;
      const result = await GitHubAPI.saveJSON(
        cfg, VIDEOS_PATH, updated, sha,
        editingId ? `Admin : modification de la vidéo "${title}"` : `Admin : ajout de la vidéo "${title}"`
      );

      fileState[VIDEOS_PATH] = { json: updated, sha: result.content.sha };
      renderVideosList(updatedVideos);
      resetVideoForm();
      setStatus(videoStatus, 'success', 'Enregistré ! Le site se mettra à jour d\'ici 1 à 2 minutes.');
    } catch (err) {
      setStatus(videoStatus, 'error', 'Erreur : ' + err.message);
    } finally {
      saveBtn.disabled = false;
    }
  });

  async function deleteVideo(id, title) {
    if (!(await showConfirmModal(`Supprimer la vidéo "${title}" ?`))) return;

    setStatus(videoStatus, 'loading', 'Suppression en cours…');
    try {
      if (!fileState[VIDEOS_PATH]) await readFile(VIDEOS_PATH);
      const updatedVideos = fileState[VIDEOS_PATH].json.videos.filter((v) => v.id !== id);

      const updated = { videos: updatedVideos };
      const sha = fileState[VIDEOS_PATH].sha;
      const result = await GitHubAPI.saveJSON(cfg, VIDEOS_PATH, updated, sha, `Admin : suppression de la vidéo "${title}"`);

      fileState[VIDEOS_PATH] = { json: updated, sha: result.content.sha };
      renderVideosList(updatedVideos);
      setStatus(videoStatus, 'success', 'Vidéo supprimée.');
    } catch (err) {
      setStatus(videoStatus, 'error', 'Erreur : ' + err.message);
    }
  }

  /* ---------- Anniversaires ---------- */

  const BIRTHDAYS_PATH = 'data/birthdays.json';
  const MONTH_NAMES_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

  const birthdaysList = document.getElementById('birthdaysList');
  const birthdayStatus = document.getElementById('birthdayStatus');
  const birthdayEditorForm = document.getElementById('birthdayEditorForm');
  const birthdayCancelBtn = document.getElementById('birthdayCancelBtn');
  const birthdaySaveLabel = document.getElementById('birthdaySaveLabel');
  const birthdaysEnabledCheckbox = document.getElementById('birthdaysEnabled');
  const birthdaysEnabledStatus = document.getElementById('birthdaysEnabledStatus');

  async function loadBirthdaysView() {
    birthdaysList.innerHTML = '<p style="color:var(--color-text-muted); font-size:0.88rem;"><i class="fa-solid fa-spinner fa-spin"></i> Chargement…</p>';
    try {
      const data = await readFile(BIRTHDAYS_PATH);
      birthdaysEnabledCheckbox.checked = data.enabled !== false;
      renderBirthdaysList(data.birthdays || []);
    } catch (err) {
      birthdaysList.innerHTML = '';
      birthdaysList.appendChild(buildAlert('alert-danger', 'fa-triangle-exclamation', 'Impossible de charger les anniversaires', [err.message]));
    }
  }

  function renderBirthdaysList(birthdays) {
    birthdaysList.innerHTML = '';
    if (birthdays.length === 0) {
      birthdaysList.innerHTML = '<p class="empty-list-msg">Aucun anniversaire enregistré.</p>';
      return;
    }

    const sorted = birthdays.slice().sort((a, b) => (a.month - b.month) || (a.day - b.day));

    sorted.forEach((b) => {
      const row = document.createElement('div');
      row.className = 'admin-list-item';
      row.innerHTML = `
        <div class="admin-list-thumb"><i class="fa-solid fa-cake-candles" style="color:var(--color-navy);"></i></div>
        <div class="admin-list-info">
          <strong>${b.name}</strong>
          <span>${b.day} ${MONTH_NAMES_FR[b.month - 1]}</span>
        </div>
        <div class="admin-list-actions">
          <button type="button" class="edit-btn" title="Modifier"><i class="fa-solid fa-pen"></i></button>
          <button type="button" class="delete-btn" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
        </div>
      `;
      row.querySelector('.edit-btn').addEventListener('click', () => startEditBirthday(b));
      row.querySelector('.delete-btn').addEventListener('click', () => deleteBirthday(b.id, b.name));
      birthdaysList.appendChild(row);
    });
  }

  function generateBirthdayId(name, birthdays) {
    const base = slugify(name) || 'anniversaire';
    const allIds = birthdays.map((b) => b.id);
    let id = base;
    let counter = 2;
    while (allIds.includes(id)) { id = `${base}-${counter}`; counter++; }
    return id;
  }

  function startEditBirthday(b) {
    document.getElementById('birthdayEditId').value = b.id;
    document.getElementById('birthdayName').value = b.name || '';
    document.getElementById('birthdayDay').value = b.day || '';
    document.getElementById('birthdayMonth').value = b.month || '1';
    birthdaySaveLabel.textContent = 'Enregistrer les modifications';
    birthdayCancelBtn.classList.remove('hidden');
    document.getElementById('birthdayFormTitle').textContent = 'Modifier l\'anniversaire';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetBirthdayForm() {
    birthdayEditorForm.reset();
    document.getElementById('birthdayEditId').value = '';
    birthdaySaveLabel.textContent = 'Ajouter';
    birthdayCancelBtn.classList.add('hidden');
    document.getElementById('birthdayFormTitle').textContent = 'Ajouter un anniversaire';
  }

  birthdayCancelBtn.addEventListener('click', resetBirthdayForm);

  birthdayEditorForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const saveBtn = document.getElementById('birthdaySaveBtn');
    saveBtn.disabled = true;
    setStatus(birthdayStatus, 'loading', 'Enregistrement en cours…');

    try {
      if (!fileState[BIRTHDAYS_PATH]) await readFile(BIRTHDAYS_PATH);
      const birthdays = fileState[BIRTHDAYS_PATH].json.birthdays.slice();

      const editingId = document.getElementById('birthdayEditId').value;
      const name = document.getElementById('birthdayName').value.trim();
      const day = parseInt(document.getElementById('birthdayDay').value, 10);
      const month = parseInt(document.getElementById('birthdayMonth').value, 10);

      const entry = { id: editingId || generateBirthdayId(name, birthdays), name, day, month };
      const updated = {
        enabled: fileState[BIRTHDAYS_PATH].json.enabled !== false,
        birthdays: editingId ? birthdays.map((b) => (b.id === editingId ? entry : b)) : birthdays.concat(entry)
      };

      const sha = fileState[BIRTHDAYS_PATH].sha;
      const result = await GitHubAPI.saveJSON(
        cfg, BIRTHDAYS_PATH, updated, sha,
        editingId ? `Admin : modification de l'anniversaire "${name}"` : `Admin : ajout de l'anniversaire "${name}"`
      );

      fileState[BIRTHDAYS_PATH] = { json: updated, sha: result.content.sha };
      renderBirthdaysList(updated.birthdays);
      resetBirthdayForm();
      setStatus(birthdayStatus, 'success', 'Enregistré !');
    } catch (err) {
      setStatus(birthdayStatus, 'error', 'Erreur : ' + err.message);
    } finally {
      saveBtn.disabled = false;
    }
  });

  async function deleteBirthday(id, name) {
    if (!(await showConfirmModal(`Supprimer l'anniversaire de "${name}" ?`))) return;

    setStatus(birthdayStatus, 'loading', 'Suppression en cours…');
    try {
      if (!fileState[BIRTHDAYS_PATH]) await readFile(BIRTHDAYS_PATH);
      const updated = {
        enabled: fileState[BIRTHDAYS_PATH].json.enabled !== false,
        birthdays: fileState[BIRTHDAYS_PATH].json.birthdays.filter((b) => b.id !== id)
      };
      const sha = fileState[BIRTHDAYS_PATH].sha;
      const result = await GitHubAPI.saveJSON(cfg, BIRTHDAYS_PATH, updated, sha, `Admin : suppression de l'anniversaire de "${name}"`);

      fileState[BIRTHDAYS_PATH] = { json: updated, sha: result.content.sha };
      renderBirthdaysList(updated.birthdays);
      setStatus(birthdayStatus, 'success', 'Supprimé.');
    } catch (err) {
      setStatus(birthdayStatus, 'error', 'Erreur : ' + err.message);
    }
  }

  birthdaysEnabledCheckbox.addEventListener('change', async () => {
    setStatus(birthdaysEnabledStatus, 'loading', 'Enregistrement…');
    try {
      if (!fileState[BIRTHDAYS_PATH]) await readFile(BIRTHDAYS_PATH);
      const updated = {
        enabled: birthdaysEnabledCheckbox.checked,
        birthdays: fileState[BIRTHDAYS_PATH].json.birthdays || []
      };
      const sha = fileState[BIRTHDAYS_PATH].sha;
      const result = await GitHubAPI.saveJSON(cfg, BIRTHDAYS_PATH, updated, sha, `Admin : ${updated.enabled ? 'activation' : 'désactivation'} de l'encadré anniversaires`);
      fileState[BIRTHDAYS_PATH] = { json: updated, sha: result.content.sha };
      setStatus(birthdaysEnabledStatus, 'success', 'Enregistré !');
    } catch (err) {
      setStatus(birthdaysEnabledStatus, 'error', 'Erreur : ' + err.message);
      birthdaysEnabledCheckbox.checked = !birthdaysEnabledCheckbox.checked;
    }
  });

  /* ---------- Pages personnalisées ---------- */

  const PAGES_PATH = 'data/pages.json';

  const pagesList = document.getElementById('pagesList');
  const pageEditorCard = document.getElementById('pageEditorCard');
  const pageEditorForm = document.getElementById('pageEditorForm');
  const pageEditorStatus = document.getElementById('pageEditorStatus');
  const pageSaveLabel = document.getElementById('pageSaveLabel');
  const pageRichtextEditor = document.getElementById('pageRichtextEditor');
  const pageRichtextImageInput = document.getElementById('pageRichtextImageInput');
  const pageCodeEditor = document.getElementById('pageCodeEditor');
  const pageVisualEditorWrap = document.getElementById('pageVisualEditorWrap');
  const pageCodeEditorWrap = document.getElementById('pageCodeEditorWrap');
  const pageTitleInput = document.getElementById('pageTitleInput');
  const pageSlugInput = document.getElementById('pageSlugInput');

  let currentPagesList = [];
  let pageEditorMode = 'visual';
  let slugManuallyEdited = false;

  async function loadPagesView() {
    pagesList.innerHTML = '<p style="color:var(--color-text-muted); font-size:0.88rem;"><i class="fa-solid fa-spinner fa-spin"></i> Chargement…</p>';
    try {
      const [data, navData] = await Promise.all([
        readFile(PAGES_PATH),
        readFile(NAV_PATH).catch(() => ({ items: [] }))
      ]);
      currentPagesList = data.pages || [];
      populatePageMenuCategorySelect(navData.items || []);
      renderPagesList(currentPagesList);
    } catch (err) {
      pagesList.innerHTML = '';
      pagesList.appendChild(buildAlert('alert-danger', 'fa-triangle-exclamation', 'Impossible de charger les pages', [err.message]));
    }
  }

  function populatePageMenuCategorySelect(items) {
    const select = document.getElementById('pageMenuCategory');
    const categories = items.filter((it) => it.type === 'dropdown');
    select.innerHTML = '<option value="">Lien direct (haut niveau)</option>' +
      categories.map((cat) => `<option value="${cat.id}">${cat.label}</option>`).join('');
  }

  // Cherche dans le menu si une page (par id) y figure déjà, où qu'elle soit
  function findNavEntryForPage(items, pageId) {
    for (const it of items) {
      if (it.id === pageId) return { entry: it, parentId: null };
      if (it.type === 'dropdown') {
        const child = (it.children || []).find((c) => c.id === pageId);
        if (child) return { entry: child, parentId: it.id };
      }
    }
    return null;
  }

  document.getElementById('pageAddToMenu').addEventListener('change', (e) => {
    document.getElementById('pageMenuOptions').classList.toggle('hidden', !e.target.checked);
  });

  function renderPagesList(pages) {
    pagesList.innerHTML = '';
    if (pages.length === 0) {
      pagesList.innerHTML = '<p class="empty-list-msg">Aucune page pour le moment.</p>';
      return;
    }

    pages.forEach((page) => {
      const row = document.createElement('div');
      row.className = 'admin-list-item';
      row.innerHTML = `
        <div class="admin-list-thumb"><i class="fa-solid fa-file-lines" style="color:var(--color-navy);"></i></div>
        <div class="admin-list-info">
          <strong>${page.title}</strong>
          <span>/${page.slug}/</span>
        </div>
        <div class="admin-list-actions">
          <a href="../${page.slug}/" target="_blank" rel="noopener" class="view-link-btn" title="Voir la page"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>
          <button type="button" class="edit-btn" title="Modifier"><i class="fa-solid fa-pen"></i></button>
          <button type="button" class="delete-btn" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
        </div>
      `;
      row.querySelector('.edit-btn').addEventListener('click', () => openPageEditor(page));
      row.querySelector('.delete-btn').addEventListener('click', () => deletePage(page.id, page.title));
      pagesList.appendChild(row);
    });
  }

  function generatePageId(title, pages) {
    const base = slugify(title) || 'page';
    const allIds = pages.map((p) => p.id);
    let id = base;
    let counter = 2;
    while (allIds.includes(id)) { id = `${base}-${counter}`; counter++; }
    return id;
  }

  /* --- Bascule mode Facile / Code --- */

  function setPageEditorMode(mode) {
    if (mode === pageEditorMode) return;

    if (mode === 'code') {
      // On passe du visuel vers le code : on récupère le HTML actuel
      pageCodeEditor.value = pageRichtextEditor.innerHTML;
    } else {
      // On passe du code vers le visuel : on réinjecte le HTML tapé
      pageRichtextEditor.innerHTML = pageCodeEditor.value;
    }

    pageEditorMode = mode;
    pageVisualEditorWrap.classList.toggle('hidden', mode !== 'visual');
    pageCodeEditorWrap.classList.toggle('hidden', mode !== 'code');
    document.querySelectorAll('#pageModeSwitch .mode-switch-btn').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.mode === mode);
    });
  }

  document.querySelectorAll('#pageModeSwitch .mode-switch-btn').forEach((btn) => {
    btn.addEventListener('click', () => setPageEditorMode(btn.dataset.mode));
  });

  function getCurrentPageBody() {
    return pageEditorMode === 'code' ? pageCodeEditor.value : pageRichtextEditor.innerHTML;
  }

  /* --- Slug automatique à partir du titre --- */

  pageSlugInput.addEventListener('input', () => { slugManuallyEdited = true; });
  pageTitleInput.addEventListener('input', () => {
    if (!slugManuallyEdited) pageSlugInput.value = slugify(pageTitleInput.value);
  });

  /* --- Ouverture de l'éditeur --- */

  // Analyse le contenu d'une page et affiche ses liens/images avec un indicateur d'existence.
  async function renderReferencesPanel(panelEl, listEl, bodyHtml) {
    const refs = extractPageReferences(bodyHtml);
    if (refs.length === 0) {
      panelEl.classList.add('hidden');
      return;
    }
    panelEl.classList.remove('hidden');
    listEl.innerHTML = refs.map(() =>
      `<div class="reference-row"><span class="reference-status unknown"><i class="fa-solid fa-circle-notch fa-spin"></i></span><span class="reference-text"></span></div>`
    ).join('');

    const rows = listEl.querySelectorAll('.reference-row');
    refs.forEach(async (ref, i) => {
      const row = rows[i];
      const statusEl = row.querySelector('.reference-status');
      const textEl = row.querySelector('.reference-text');
      const icon = ref.type === 'image' ? 'fa-image' : 'fa-link';
      textEl.innerHTML = `<i class="fa-solid ${icon}"></i> ${ref.text ? ref.text + ' — ' : ''}${ref.value}`;

      const exists = await checkReferenceExists(ref.value);
      if (exists === null) {
        statusEl.className = 'reference-status unknown';
        statusEl.innerHTML = '<i class="fa-solid fa-circle-question" title="Lien externe, non vérifiable"></i>';
      } else if (exists) {
        statusEl.className = 'reference-status ok';
        statusEl.innerHTML = '<i class="fa-solid fa-circle-check" title="Le fichier existe"></i>';
      } else {
        statusEl.className = 'reference-status broken';
        statusEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation" title="Introuvable !"></i>';
        row.style.color = '#dc2626';
      }
    });
  }

  function openPageEditor(page) {
    pageEditorForm.reset();
    pageRichtextEditor.innerHTML = '';
    pageCodeEditor.value = '';
    slugManuallyEdited = false;

    applyRealPageStyles('page.html', '#pageRichtextEditor', 'pageRealStylePreview');

    // Revient toujours en mode visuel à l'ouverture, quel que soit le mode précédent
    pageEditorMode = 'visual';
    pageVisualEditorWrap.classList.remove('hidden');
    pageCodeEditorWrap.classList.add('hidden');
    document.querySelectorAll('#pageModeSwitch .mode-switch-btn').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.mode === 'visual');
    });

    const menuCheckbox = document.getElementById('pageAddToMenu');
    const menuOptions = document.getElementById('pageMenuOptions');
    const menuLabelInput = document.getElementById('pageMenuLabel');
    const menuCategorySelect = document.getElementById('pageMenuCategory');
    menuLabelInput.value = '';
    menuCategorySelect.value = '';
    menuCheckbox.checked = false;
    menuOptions.classList.add('hidden');

    if (page) {
      document.getElementById('pageEditId').value = page.id;
      pageTitleInput.value = page.title || '';
      pageSlugInput.value = page.slug || '';
      slugManuallyEdited = true;
      pageRichtextEditor.innerHTML = page.body || '';
      pageSaveLabel.textContent = 'Enregistrer les modifications';
      document.getElementById('pageEditorTitle').textContent = 'Modifier la page';

      const navItems = fileState[NAV_PATH] ? fileState[NAV_PATH].json.items : [];
      const found = findNavEntryForPage(navItems, page.id);
      if (found) {
        menuCheckbox.checked = true;
        menuOptions.classList.remove('hidden');
        menuLabelInput.value = found.entry.label || '';
        menuCategorySelect.value = found.parentId || '';
      }

      renderReferencesPanel(
        document.getElementById('pageReferencesPanel'),
        document.getElementById('pageReferencesList'),
        page.body
      );
    } else {
      document.getElementById('pageEditId').value = '';
      pageSaveLabel.textContent = 'Créer la page';
      document.getElementById('pageEditorTitle').textContent = 'Créer une page';
      document.getElementById('pageReferencesPanel').classList.add('hidden');
    }

    pageEditorCard.classList.remove('hidden');
    pageEditorCard.scrollIntoView({ behavior: 'smooth' });
  }

  document.getElementById('addPageBtn').addEventListener('click', () => openPageEditor(null));
  document.getElementById('pageEditorCancelBtn').addEventListener('click', () => {
    pageEditorCard.classList.add('hidden');
  });

  /* --- Barre d'outils de mise en forme --- */

  document.querySelectorAll('#pageRichtextToolbar button[data-cmd]').forEach((btn) => {
    preventFocusSteal(btn);
    btn.addEventListener('click', () => {
      const cmd = btn.dataset.cmd;
      if (cmd.startsWith('formatBlock:')) {
        document.execCommand('formatBlock', false, cmd.split(':')[1]);
      } else {
        document.execCommand(cmd, false, null);
      }
    });
  });

  setupRichTextExtras(pageRichtextEditor, {
    sizeMinus: 'pageRichtextSizeMinus',
    sizePlus: 'pageRichtextSizePlus',
    sizeReadout: 'pageRichtextSizeReadout',
    colorToggle: 'pageRichtextColorToggle',
    colorPanel: 'pageRichtextColorPanel'
  });

  document.getElementById('pageRichtextLinkBtn').addEventListener('click', async () => {
    const sel = window.getSelection();
    const linkRange = (sel.rangeCount > 0 && pageRichtextEditor.contains(sel.anchorNode))
      ? sel.getRangeAt(0).cloneRange()
      : null;
    const url = await showPromptModal('Adresse du lien à insérer', '', { placeholder: 'https://exemple.com' });
    if (!url) return;
    restoreEditorSelection(pageRichtextEditor, linkRange);
    createLinkWithTooltip(pageRichtextEditor, url);
  });

  let savedPageRange = null;

  document.getElementById('pageRichtextImageBtn').addEventListener('click', () => {
    const sel = window.getSelection();
    savedPageRange = (sel.rangeCount > 0 && pageRichtextEditor.contains(sel.anchorNode))
      ? sel.getRangeAt(0).cloneRange()
      : null;
    pageRichtextImageInput.click();
  });

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  pageRichtextImageInput.addEventListener('change', async () => {
    const file = pageRichtextImageInput.files[0];
    if (!file) return;

    const pageId = document.getElementById('pageEditId').value || 'page-brouillon';
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `imgs/pages/${pageId}-inline-${Date.now()}.${ext}`;
    const tempId = 'tmp-img-' + Date.now();

    // Aperçu instantané avec le fichier local (pas d'attente réseau, ça s'affiche tout de suite
    // et ça reste affiché tel quel jusqu'à l'enregistrement de la page).
    const dataUrl = await readFileAsDataUrl(file);
    restoreEditorSelection(pageRichtextEditor, savedPageRange);
    document.execCommand('insertHTML', false, `<img id="${tempId}" data-pending="true" class="resizable-img" src="${dataUrl}" alt="">`);

    setStatus(pageEditorStatus, 'loading', 'Envoi de l\'image en arrière-plan…');
    const uploadPromise = GitHubAPI.uploadFile(cfg, path, file, `Admin : image insérée dans une page`)
      .then(() => {
        const img = pageRichtextEditor.querySelector('#' + tempId);
        if (img) {
          img.dataset.finalSrc = `./${path}`;
          img.removeAttribute('data-pending');
        }
        hideStatus(pageEditorStatus);
      })
      .catch((err) => {
        const img = pageRichtextEditor.querySelector('#' + tempId);
        if (img) img.dataset.uploadFailed = 'true';
        setStatus(pageEditorStatus, 'error', 'Erreur d\'envoi de l\'image : ' + err.message + ' (supprime-la et réessaie avant d\'enregistrer)');
      });

    pendingImageUploads.set(tempId, uploadPromise);
    pageRichtextImageInput.value = '';
  });

  /* --- Enregistrement --- */

  pageEditorForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    deselectImage();
    const saveBtn = document.getElementById('pageSaveBtn');
    saveBtn.disabled = true;
    setStatus(pageEditorStatus, 'loading', 'Enregistrement en cours…');

    try {
      if (!fileState[PAGES_PATH]) await readFile(PAGES_PATH);
      const pages = fileState[PAGES_PATH].json.pages.slice();

      const editingId = document.getElementById('pageEditId').value;
      const title = pageTitleInput.value.trim();
      const slug = slugify(pageSlugInput.value.trim() || title);

      setStatus(pageEditorStatus, 'loading', 'Finalisation des images du contenu…');
      await waitForPendingImages(pageRichtextEditor);
      if (hasFailedImageUpload(pageRichtextEditor)) {
        throw new Error('Une image du contenu n\'a pas pu être envoyée. Supprime-la (clique dessus puis sur la corbeille) et réessaie.');
      }
      finalizeImagesForSave(pageRichtextEditor);

      const body = getCurrentPageBody();

      const slugTaken = pages.some((p) => p.slug === slug && p.id !== editingId);
      if (slugTaken) {
        throw new Error('Cette adresse (slug) est déjà utilisée par une autre page.');
      }

      const previousPage = editingId ? pages.find((p) => p.id === editingId) : null;

      const id = editingId || generatePageId(title, pages);
      const entry = { id, title, slug, body, date: new Date().toISOString().slice(0, 10) };
      const updatedPages = editingId ? pages.map((p) => (p.id === editingId ? entry : p)) : pages.concat(entry);

      const updated = { pages: updatedPages };
      const sha = fileState[PAGES_PATH].sha;
      const result = await GitHubAPI.saveJSON(
        cfg, PAGES_PATH, updated, sha,
        editingId ? `Admin : modification de la page "${title}"` : `Admin : création de la page "${title}"`
      );

      fileState[PAGES_PATH] = { json: updated, sha: result.content.sha };

      // Génère (ou régénère) l'URL propre {slug}/index.html. Si le slug a changé, nettoie l'ancien dossier.
      setStatus(pageEditorStatus, 'loading', 'Mise à jour de l\'adresse de la page…');
      if (previousPage && previousPage.slug !== slug) {
        await unpublishCleanUrlPage(previousPage.slug);
      }
      await publishCleanUrlPage(slug);

      // Synchronise la présence de cette page dans le menu du site
      setStatus(pageEditorStatus, 'loading', 'Mise à jour du menu…');
      if (!fileState[NAV_PATH]) await readFile(NAV_PATH);
      let navItems = fileState[NAV_PATH].json.items.map((it) =>
        it.type === 'dropdown' ? Object.assign({}, it, { children: (it.children || []).slice() }) : Object.assign({}, it)
      );
      // Retire toute entrée existante pour cette page, où qu'elle soit
      navItems = navItems
        .map((it) => it.type === 'dropdown' ? Object.assign({}, it, { children: it.children.filter((c) => c.id !== id) }) : it)
        .filter((it) => it.type === 'dropdown' || it.id !== id);

      const addToMenu = document.getElementById('pageAddToMenu').checked;
      if (addToMenu) {
        const menuLabel = document.getElementById('pageMenuLabel').value.trim() || title;
        const targetCatId = document.getElementById('pageMenuCategory').value;
        if (targetCatId) {
          const cat = navItems.find((it) => it.id === targetCatId && it.type === 'dropdown');
          if (cat) cat.children.push({ id, label: menuLabel, link: `./${slug}/` });
        } else {
          navItems.push({ id, label: menuLabel, link: `./${slug}/`, type: 'link' });
        }
      }

      const navResult = await GitHubAPI.saveJSON(
        cfg, NAV_PATH, { items: navItems }, fileState[NAV_PATH].sha,
        `Admin : mise à jour du menu pour la page "${title}"`
      );
      fileState[NAV_PATH] = { json: { items: navItems }, sha: navResult.content.sha };

      currentPagesList = updatedPages;
      renderPagesList(updatedPages);
      pageEditorCard.classList.add('hidden');
      setStatus(pageEditorStatus, 'success', 'Page enregistrée !');
    } catch (err) {
      setStatus(pageEditorStatus, 'error', 'Erreur : ' + err.message);
    } finally {
      saveBtn.disabled = false;
    }
  });

  /* --- Suppression (avec nettoyage des images insérées) --- */

  function collectPageImagePaths(page) {
    const paths = [];
    const matches = (page.body || '').matchAll(/<img[^>]+src=["']([^"']*imgs\/pages\/[^"']+)["']/g);
    for (const m of matches) paths.push(toRepoPath(m[1]));
    return paths;
  }

  async function deletePage(id, title) {
    if (!(await showConfirmModal(`Supprimer la page "${title}" ? Ses images éventuelles seront aussi supprimées de GitHub. Cette action est immédiate.`))) return;

    try {
      if (!fileState[PAGES_PATH]) await readFile(PAGES_PATH);
      const pageToDelete = fileState[PAGES_PATH].json.pages.find((p) => p.id === id);
      const updatedPages = fileState[PAGES_PATH].json.pages.filter((p) => p.id !== id);

      const updated = { pages: updatedPages };
      const sha = fileState[PAGES_PATH].sha;
      const result = await GitHubAPI.saveJSON(cfg, PAGES_PATH, updated, sha, `Admin : suppression de la page "${title}"`);
      fileState[PAGES_PATH] = { json: updated, sha: result.content.sha };

      if (pageToDelete) {
        for (const imgPath of collectPageImagePaths(pageToDelete)) {
          await deleteFileIfExists(imgPath);
        }
        await unpublishCleanUrlPage(pageToDelete.slug);
      }

      // Retire aussi cette page du menu si elle y figurait
      if (!fileState[NAV_PATH]) await readFile(NAV_PATH);
      const navFound = findNavEntryForPage(fileState[NAV_PATH].json.items, id);
      if (navFound) {
        const navItems = fileState[NAV_PATH].json.items
          .map((it) => it.type === 'dropdown' ? Object.assign({}, it, { children: it.children.filter((c) => c.id !== id) }) : it)
          .filter((it) => it.type === 'dropdown' || it.id !== id);
        const navResult = await GitHubAPI.saveJSON(
          cfg, NAV_PATH, { items: navItems }, fileState[NAV_PATH].sha, `Admin : retrait de la page "${title}" du menu`
        );
        fileState[NAV_PATH] = { json: { items: navItems }, sha: navResult.content.sha };
      }

      currentPagesList = updatedPages;
      renderPagesList(updatedPages);
    } catch (err) {
      alert('Erreur lors de la suppression : ' + err.message);
    }
  }

  /* --- URL propre : génère un dossier {slug}/index.html qui sert la même matrice --- */

  let cachedPageTemplate = null;

  async function getPageTemplateHtml() {
    if (cachedPageTemplate) return cachedPageTemplate;
    const meta = await GitHubAPI.getFileMeta(cfg, 'page.html');
    cachedPageTemplate = GitHubAPI.base64ToUtf8(meta.content);
    return cachedPageTemplate;
  }

  async function publishCleanUrlPage(slug) {
    const template = await getPageTemplateHtml();
    // <base href="../"> fait en sorte que tous les chemins relatifs (css, js, data, liens du menu)
    // continuent de fonctionner normalement, même si ce fichier vit dans un sous-dossier /{slug}/.
    const injected = template.replace(
      '<head>',
      `<head>\n  <base href="../">\n  <script>window.__PAGE_SLUG__ = ${JSON.stringify(slug)};</script>`
    );
    const blob = new Blob([injected], { type: 'text/html' });
    await GitHubAPI.uploadFile(cfg, `${slug}/index.html`, blob, `Admin : URL propre pour la page "${slug}"`);
  }

  async function unpublishCleanUrlPage(slug) {
    await deleteFileIfExists(`${slug}/index.html`);
  }



  /* ---------- Contenu du site (pages déjà codées : le_club, entrainements...) ---------- */

  const STATIC_CONTENT_PATH = 'data/page-content.json';

  const staticPagesList = document.getElementById('staticPagesList');
  const staticPageEditorCard = document.getElementById('staticPageEditorCard');
  const staticPageEditorForm = document.getElementById('staticPageEditorForm');
  const staticPageEditorStatus = document.getElementById('staticPageEditorStatus');
  const staticPageRichtextEditor = document.getElementById('staticPageRichtextEditor');
  const staticPageCodeEditor = document.getElementById('staticPageCodeEditor');
  const staticPageVisualEditorWrap = document.getElementById('staticPageVisualEditorWrap');
  const staticPageCodeEditorWrap = document.getElementById('staticPageCodeEditorWrap');
  const staticPageImageInput = document.getElementById('staticPageImageInput');

  let staticPageEditorMode = 'visual';

  async function loadStaticContentView() {
    staticPagesList.innerHTML = '<p style="color:var(--color-text-muted); font-size:0.88rem;"><i class="fa-solid fa-spinner fa-spin"></i> Chargement…</p>';
    try {
      const data = await readFile(STATIC_CONTENT_PATH);
      renderStaticPagesList(data.pages || {});
    } catch (err) {
      staticPagesList.innerHTML = '';
      staticPagesList.appendChild(buildAlert('alert-danger', 'fa-triangle-exclamation', 'Impossible de charger le contenu du site', [err.message]));
    }
  }

  function renderStaticPagesList(pages) {
    staticPagesList.innerHTML = '';
    const keys = Object.keys(pages);
    if (keys.length === 0) {
      staticPagesList.innerHTML = '<p class="empty-list-msg">Aucune page disponible pour le moment.</p>';
      return;
    }
    keys.forEach((key) => {
      const page = pages[key];
      const row = document.createElement('div');
      row.className = 'admin-list-item';
      row.innerHTML = `
        <div class="admin-list-thumb"><i class="fa-solid fa-file-lines" style="color:var(--color-navy);"></i></div>
        <div class="admin-list-info">
          <strong>${page.label || key}</strong>
          <span>${page.file || ''}</span>
        </div>
        <div class="admin-list-actions">
          <a href="../${page.file}" target="_blank" rel="noopener" class="view-link-btn" title="Voir la page"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>
          <button type="button" class="edit-btn" title="Modifier"><i class="fa-solid fa-pen"></i></button>
        </div>
      `;
      row.querySelector('.edit-btn').addEventListener('click', () => openStaticPageEditor(key, page));
      staticPagesList.appendChild(row);
    });
  }

  function setStaticPageEditorMode(mode) {
    if (mode === staticPageEditorMode) return;
    if (mode === 'code') {
      staticPageCodeEditor.value = staticPageRichtextEditor.innerHTML;
    } else {
      staticPageRichtextEditor.innerHTML = staticPageCodeEditor.value;
    }
    staticPageEditorMode = mode;
    staticPageVisualEditorWrap.classList.toggle('hidden', mode !== 'visual');
    staticPageCodeEditorWrap.classList.toggle('hidden', mode !== 'code');
    document.querySelectorAll('#staticPageModeSwitch .mode-switch-btn').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.mode === mode);
    });
  }

  document.querySelectorAll('#staticPageModeSwitch .mode-switch-btn').forEach((btn) => {
    btn.addEventListener('click', () => setStaticPageEditorMode(btn.dataset.mode));
  });

  function getCurrentStaticPageBody() {
    return staticPageEditorMode === 'code' ? staticPageCodeEditor.value : staticPageRichtextEditor.innerHTML;
  }

  function openStaticPageEditor(key, page) {
    staticPageEditorForm.reset();
    staticPageRichtextEditor.innerHTML = page.body || '';
    staticPageCodeEditor.value = '';
    staticPageEditorMode = 'visual';
    staticPageVisualEditorWrap.classList.remove('hidden');
    staticPageCodeEditorWrap.classList.add('hidden');
    document.querySelectorAll('#staticPageModeSwitch .mode-switch-btn').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.mode === 'visual');
    });

    if (page.file) {
      applyRealPageStyles(page.file, '#staticPageRichtextEditor', 'staticPageRealStylePreview');
    }

    renderReferencesPanel(
      document.getElementById('staticPageReferencesPanel'),
      document.getElementById('staticPageReferencesList'),
      page.body
    );

    document.getElementById('staticPageEditKey').value = key;
    document.getElementById('staticPageEditorTitle').textContent = 'Modifier : ' + (page.label || key);
    hideStatus(staticPageEditorStatus);
    staticPageEditorCard.classList.remove('hidden');
    staticPageEditorCard.scrollIntoView({ behavior: 'smooth' });
  }

  document.getElementById('staticPageEditorCancelBtn').addEventListener('click', () => {
    staticPageEditorCard.classList.add('hidden');
  });

  /* --- Barre d'outils --- */

  document.querySelectorAll('#staticPageRichtextToolbar button[data-cmd]').forEach((btn) => {
    preventFocusSteal(btn);
    btn.addEventListener('click', () => {
      const cmd = btn.dataset.cmd;
      if (cmd.startsWith('formatBlock:')) {
        document.execCommand('formatBlock', false, cmd.split(':')[1]);
      } else {
        document.execCommand(cmd, false, null);
      }
    });
  });

  setupRichTextExtras(staticPageRichtextEditor, {
    sizeMinus: 'staticPageSizeMinus',
    sizePlus: 'staticPageSizePlus',
    sizeReadout: 'staticPageSizeReadout',
    colorToggle: 'staticPageColorToggle',
    colorPanel: 'staticPageColorPanel'
  });

  document.getElementById('staticPageLinkBtn').addEventListener('click', async () => {
    const sel = window.getSelection();
    const linkRange = (sel.rangeCount > 0 && staticPageRichtextEditor.contains(sel.anchorNode))
      ? sel.getRangeAt(0).cloneRange()
      : null;
    const url = await showPromptModal('Adresse du lien à insérer', '', { placeholder: 'https://exemple.com' });
    if (!url) return;
    restoreEditorSelection(staticPageRichtextEditor, linkRange);
    createLinkWithTooltip(staticPageRichtextEditor, url);
  });

  let savedStaticPageImgRange = null;
  document.getElementById('staticPageImageBtn').addEventListener('click', () => {
    const sel = window.getSelection();
    savedStaticPageImgRange = (sel.rangeCount > 0 && staticPageRichtextEditor.contains(sel.anchorNode))
      ? sel.getRangeAt(0).cloneRange()
      : null;
    staticPageImageInput.click();
  });

  staticPageImageInput.addEventListener('change', async () => {
    const file = staticPageImageInput.files[0];
    if (!file) return;

    const key = document.getElementById('staticPageEditKey').value || 'page';
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `imgs/sitecontent/${key}-inline-${Date.now()}.${ext}`;
    const tempId = 'tmp-img-' + Date.now();

    const dataUrl = await readFileAsDataUrl(file);
    restoreEditorSelection(staticPageRichtextEditor, savedStaticPageImgRange);
    document.execCommand('insertHTML', false, `<img id="${tempId}" data-pending="true" class="resizable-img" src="${dataUrl}" alt="">`);

    setStatus(staticPageEditorStatus, 'loading', 'Envoi de l\'image en arrière-plan…');
    const uploadPromise = GitHubAPI.uploadFile(cfg, path, file, `Admin : image insérée dans "${key}"`)
      .then(() => {
        const img = staticPageRichtextEditor.querySelector('#' + tempId);
        if (img) {
          img.dataset.finalSrc = `./${path}`;
          img.removeAttribute('data-pending');
        }
        hideStatus(staticPageEditorStatus);
      })
      .catch((err) => {
        const img = staticPageRichtextEditor.querySelector('#' + tempId);
        if (img) img.dataset.uploadFailed = 'true';
        setStatus(staticPageEditorStatus, 'error', 'Erreur d\'envoi de l\'image : ' + err.message + ' (supprime-la et réessaie avant d\'enregistrer)');
      });

    pendingImageUploads.set(tempId, uploadPromise);
    staticPageImageInput.value = '';
  });

  setupImageResizing(staticPageRichtextEditor);

  /* --- Enregistrement --- */

  staticPageEditorForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    deselectImage();
    const saveBtn = document.getElementById('staticPageSaveBtn');
    saveBtn.disabled = true;
    setStatus(staticPageEditorStatus, 'loading', 'Enregistrement en cours…');

    try {
      const key = document.getElementById('staticPageEditKey').value;

      setStatus(staticPageEditorStatus, 'loading', 'Finalisation des images…');
      await waitForPendingImages(staticPageRichtextEditor);
      if (hasFailedImageUpload(staticPageRichtextEditor)) {
        throw new Error('Une image n\'a pas pu être envoyée. Supprime-la (clique dessus puis sur la corbeille) et réessaie.');
      }
      finalizeImagesForSave(staticPageRichtextEditor);

      const body = getCurrentStaticPageBody();

      if (!fileState[STATIC_CONTENT_PATH]) await readFile(STATIC_CONTENT_PATH);
      const pages = Object.assign({}, fileState[STATIC_CONTENT_PATH].json.pages);
      pages[key] = Object.assign({}, pages[key], { body });

      const updated = { pages };
      const sha = fileState[STATIC_CONTENT_PATH].sha;
      const result = await GitHubAPI.saveJSON(cfg, STATIC_CONTENT_PATH, updated, sha, `Admin : modification du contenu de "${pages[key].label || key}"`);
      fileState[STATIC_CONTENT_PATH] = { json: updated, sha: result.content.sha };

      renderStaticPagesList(pages);
      staticPageEditorCard.classList.add('hidden');
      setStatus(staticPageEditorStatus, 'success', 'Contenu enregistré !');
    } catch (err) {
      setStatus(staticPageEditorStatus, 'error', 'Erreur : ' + err.message);
    } finally {
      saveBtn.disabled = false;
    }
  });

  /* ---------- Redimensionnement / placement des images dans les éditeurs ---------- */

  let selectedImg = null;
  let resizeWrapper = null;
  let resizeState = null;
  const imgFloatToolbar = document.getElementById('imgFloatToolbar');

  function positionImgToolbar(img) {
    const rect = img.getBoundingClientRect();
    imgFloatToolbar.style.top = Math.max(8, rect.top - 46) + 'px';
    imgFloatToolbar.style.left = Math.max(8, rect.left) + 'px';
    imgFloatToolbar.classList.add('is-open');
  }

  function wrapImageForResize(img) {
    const wrapper = document.createElement('span');
    wrapper.className = 'img-resize-wrapper';
    img.parentNode.insertBefore(wrapper, img);
    wrapper.appendChild(img);

    ['nw', 'ne', 'sw', 'se'].forEach((pos) => {
      const handle = document.createElement('span');
      handle.className = 'img-resize-handle ' + pos;
      handle.dataset.pos = pos;
      handle.addEventListener('mousedown', startImageResize);
      wrapper.appendChild(handle);
    });

    resizeWrapper = wrapper;
  }

  function unwrapImage(img) {
    if (!resizeWrapper) return;
    resizeWrapper.parentNode.insertBefore(img, resizeWrapper);
    resizeWrapper.remove();
    resizeWrapper = null;
  }

  function startImageResize(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedImg) return;
    resizeState = {
      pos: e.currentTarget.dataset.pos,
      startX: e.clientX,
      startWidth: selectedImg.offsetWidth
    };
    document.addEventListener('mousemove', onImageResizeMove);
    document.addEventListener('mouseup', onImageResizeEnd);
  }

  function onImageResizeMove(e) {
    if (!resizeState || !selectedImg) return;
    const dx = e.clientX - resizeState.startX;
    const direction = (resizeState.pos === 'nw' || resizeState.pos === 'sw') ? -1 : 1;
    const newWidth = Math.max(30, resizeState.startWidth + dx * direction);
    selectedImg.style.width = newWidth + 'px';
    selectedImg.style.height = 'auto';
    positionImgToolbar(selectedImg);
  }

  function onImageResizeEnd() {
    resizeState = null;
    document.removeEventListener('mousemove', onImageResizeMove);
    document.removeEventListener('mouseup', onImageResizeEnd);
  }

  function selectImage(img) {
    if (selectedImg && selectedImg !== img) deselectImage();
    selectedImg = img;
    img.classList.add('is-selected');
    wrapImageForResize(img);
    positionImgToolbar(img);
  }

  function deselectImage() {
    if (selectedImg) {
      selectedImg.classList.remove('is-selected');
      unwrapImage(selectedImg);
    }
    selectedImg = null;
    imgFloatToolbar.classList.remove('is-open');
  }

  function setupImageResizing(editor) {
    editor.addEventListener('click', (e) => {
      if (e.target.tagName === 'IMG') {
        e.preventDefault();
        selectImage(e.target);
      } else if (!e.target.classList.contains('img-resize-handle')) {
        deselectImage();
      }
    });
  }

  setupImageResizing(richtextEditor);
  setupImageResizing(pageRichtextEditor);

  document.addEventListener('click', (e) => {
    if (!imgFloatToolbar.contains(e.target) && e.target.tagName !== 'IMG') {
      deselectImage();
    }
  });

  imgFloatToolbar.querySelectorAll('button[data-size]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!selectedImg) return;
      selectedImg.style.width = btn.dataset.size + '%';
      selectedImg.style.height = 'auto';
      positionImgToolbar(selectedImg);
    });
  });

  imgFloatToolbar.querySelectorAll('button[data-align]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!selectedImg) return;
      const align = btn.dataset.align;
      selectedImg.style.float = '';
      selectedImg.style.display = '';
      selectedImg.style.margin = '';
      if (align === 'left') {
        selectedImg.style.float = 'left';
        selectedImg.style.margin = '0.3rem 1rem 0.5rem 0';
      } else if (align === 'right') {
        selectedImg.style.float = 'right';
        selectedImg.style.margin = '0.3rem 0 0.5rem 1rem';
      } else {
        selectedImg.style.display = 'block';
        selectedImg.style.margin = '0.8rem auto';
      }
      positionImgToolbar(selectedImg);
    });
  });

  async function deleteSelectedImage() {
    if (!selectedImg) return;
    const img = selectedImg;
    const src = img.getAttribute('src') || '';
    const isRealUploadedImage = isInternalPath(src) && !src.startsWith('data:') && !img.dataset.pending;

    if (!(await showConfirmModal('Retirer cette image ?'))) return;

    // On retire d'abord l'image de cette page, dans tous les cas
    if (resizeWrapper) {
      resizeWrapper.remove();
      resizeWrapper = null;
    } else {
      img.remove();
    }
    selectedImg = null;
    imgFloatToolbar.classList.remove('is-open');

    if (!isRealUploadedImage) return;

    // Le fichier a réellement été envoyé sur GitHub : on vérifie s'il sert ailleurs
    // avant de proposer de le supprimer pour de bon.
    try {
      const path = normalizeInternalPath(src);
      const usages = await scanSiteForUsages(src);
      if (usages.length > 0) {
        const list = usages.map((u) => `• ${u.label}`).join('\n');
        await showConfirmModal(
          `Image retirée de cette page.\n\nElle reste utilisée ailleurs sur le site :\n${list}\n\nLe fichier n'a donc pas été supprimé, pour ne rien casser à ces autres endroits.`,
          { confirmLabel: 'Compris' }
        );
        return;
      }
      const deleteToo = await showConfirmModal(
        'Image retirée de cette page. Elle ne semble utilisée nulle part ailleurs sur le site : veux-tu aussi supprimer le fichier du site ?',
        { danger: true, confirmLabel: 'Supprimer le fichier' }
      );
      if (deleteToo) {
        await deleteFileIfExists(path);
      }
    } catch (err) {
      console.warn('Vérification des usages de l\'image impossible :', err.message);
    }
  }

  document.getElementById('imgDeleteBtn').addEventListener('click', deleteSelectedImage);

  document.addEventListener('keydown', (e) => {
    if (!selectedImg) return;
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      deleteSelectedImage();
    }
  });

  /* ---------- Médiathèque ---------- */

  const MEDIA_LIBRARY_PATH = 'data/media-library.json';
  const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];

  function mediaFileType(filename) {
    const ext = (filename.split('.').pop() || '').toLowerCase();
    return IMAGE_EXTENSIONS.includes(ext) ? 'image' : 'document';
  }

  function mediaFolder(type) {
    return type === 'image' ? 'imgs/media' : 'docs/media';
  }

  let currentMediaFiles = [];

  async function loadMediaView() {
    const listEl = document.getElementById('mediaFilesList');
    listEl.innerHTML = '<p style="color:var(--color-text-muted); font-size:0.88rem;"><i class="fa-solid fa-spinner fa-spin"></i> Chargement…</p>';
    try {
      const data = await readFile(MEDIA_LIBRARY_PATH);
      currentMediaFiles = data.files || [];
      renderMediaFilesList(currentMediaFiles);
    } catch (err) {
      listEl.innerHTML = '';
      listEl.appendChild(buildAlert('alert-danger', 'fa-triangle-exclamation', 'Impossible de charger la médiathèque', [err.message]));
    }
  }

  function renderMediaFilesList(files) {
    const listEl = document.getElementById('mediaFilesList');
    const query = (document.getElementById('mediaSearchInput').value || '').toLowerCase().trim();
    const filtered = query
      ? files.filter((f) => (f.title || '').toLowerCase().includes(query) || (f.filename || '').toLowerCase().includes(query))
      : files;

    listEl.innerHTML = '';
    if (filtered.length === 0) {
      listEl.innerHTML = '<p class="empty-list-msg">Aucun fichier trouvé.</p>';
      return;
    }

    filtered.slice().sort((a, b) => (b.uploadedDate || '').localeCompare(a.uploadedDate || '')).forEach((file) => {
      const row = document.createElement('div');
      row.className = 'admin-list-item media-file-row';
      const dateLabel = file.uploadedDate ? file.uploadedDate.split('-').reverse().join('/') : '';
      row.innerHTML = `
        ${file.type === 'image'
          ? `<img class="media-file-thumb" src="${adminAssetPath(file.path)}" alt="">`
          : `<div class="admin-list-thumb"><i class="fa-solid fa-file-lines" style="color:var(--color-navy);"></i></div>`}
        <div class="admin-list-info">
          <strong>${file.title || file.filename}</strong>
          <span>${file.filename} · envoyé le ${dateLabel}${file.showInDocuments ? ' · <i class="fa-solid fa-circle-check" style="color:#16a34a;"></i> sur la page Documents' : ''}</span>
        </div>
        <div class="admin-list-actions">
          <a href="${adminAssetPath(file.path)}" target="_blank" rel="noopener" class="view-link-btn" title="Ouvrir"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>
          <button type="button" class="delete-btn" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
        </div>
      `;
      row.querySelector('.delete-btn').addEventListener('click', () => deleteMediaFile(file));
      listEl.appendChild(row);
    });
  }

  document.getElementById('mediaSearchInput').addEventListener('input', () => renderMediaFilesList(currentMediaFiles));

  document.getElementById('mediaShowInDocuments').addEventListener('change', (e) => {
    document.getElementById('mediaDocumentsOptions').classList.toggle('hidden', !e.target.checked);
  });

  document.getElementById('mediaUploadForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('mediaUploadBtn');
    const statusEl = document.getElementById('mediaUploadStatus');
    const fileInput = document.getElementById('mediaFileInput');
    const file = fileInput.files[0];
    if (!file) return;

    btn.disabled = true;
    setStatus(statusEl, 'loading', 'Envoi en cours…');

    try {
      const title = document.getElementById('mediaTitleInput').value.trim();
      const showInDocuments = document.getElementById('mediaShowInDocuments').checked;
      const type = mediaFileType(file.name);
      const id = 'media-' + Date.now();
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      const path = `${mediaFolder(type)}/${id}.${ext}`;
      const today = new Date().toISOString().slice(0, 10);

      await GitHubAPI.uploadFile(cfg, path, file, `Admin : ajout du fichier "${title}" à la médiathèque`);

      const mediaEntry = {
        id, filename: file.name, path: './' + path, type, title, uploadedDate: today, showInDocuments
      };

      if (!fileState[MEDIA_LIBRARY_PATH]) await readFile(MEDIA_LIBRARY_PATH).catch(() => {});
      const currentFiles = (fileState[MEDIA_LIBRARY_PATH] ? fileState[MEDIA_LIBRARY_PATH].json.files : []) || [];

      if (showInDocuments) {
        setStatus(statusEl, 'loading', 'Ajout à la page Documents…');
        if (!fileState[DOCS_PATH]) await readFile(DOCS_PATH);
        const docsJson = fileState[DOCS_PATH].json;
        const categories = (docsJson.categories || []).map((c) => Object.assign({}, c, { documents: (c.documents || []).slice() }));
        const targetCategoryId = document.getElementById('mediaDocCategory').value;
        const description = document.getElementById('mediaDocDescription').value.trim();
        const docIcon = type === 'image' ? 'fa-image' : 'fa-file-arrow-down';
        const docId = generateDocId(title, categories);

        let targetCategory = categories.find((c) => c.id === targetCategoryId);
        if (!targetCategory) {
          targetCategory = {
            id: targetCategoryId,
            label: CATEGORY_LABELS[targetCategoryId] || targetCategoryId,
            icon: CATEGORY_ICONS[targetCategoryId] || 'fa-folder',
            documents: []
          };
          categories.push(targetCategory);
        }
        targetCategory.documents.push({
          id: docId, title, description, file: mediaEntry.path, icon: docIcon, updatedDate: today, expirationDate: null
        });

        const docsResult = await GitHubAPI.saveJSON(
          cfg, DOCS_PATH, { categories }, fileState[DOCS_PATH].sha, `Admin : ajout du document "${title}" (médiathèque)`
        );
        fileState[DOCS_PATH] = { json: { categories }, sha: docsResult.content.sha };
        mediaEntry.linkedDocId = docId;
      }

      const updatedFiles = currentFiles.concat(mediaEntry);
      const sha = fileState[MEDIA_LIBRARY_PATH] ? fileState[MEDIA_LIBRARY_PATH].sha : undefined;
      const result = await GitHubAPI.saveJSON(
        cfg, MEDIA_LIBRARY_PATH, { files: updatedFiles }, sha, `Admin : ajout du fichier "${title}" à la médiathèque`
      );
      fileState[MEDIA_LIBRARY_PATH] = { json: { files: updatedFiles }, sha: result.content.sha };
      currentMediaFiles = updatedFiles;

      renderMediaFilesList(currentMediaFiles);
      document.getElementById('mediaUploadForm').reset();
      document.getElementById('mediaDocumentsOptions').classList.add('hidden');
      setStatus(statusEl, 'success', 'Fichier ajouté à la médiathèque !');
    } catch (err) {
      setStatus(statusEl, 'error', 'Erreur : ' + err.message);
    } finally {
      btn.disabled = false;
    }
  });

  async function deleteMediaFile(file) {
    const confirmed = await confirmDeleteWithUsageCheck(file.path, MEDIA_LIBRARY_PATH, `"${file.title || file.filename}"`);
    if (!confirmed) return;

    try {
      // Retire aussi l'entrée liée sur la page Documents, le cas échéant
      if (file.linkedDocId) {
        if (!fileState[DOCS_PATH]) await readFile(DOCS_PATH);
        const categories = fileState[DOCS_PATH].json.categories.map((c) =>
          Object.assign({}, c, { documents: (c.documents || []).filter((d) => d.id !== file.linkedDocId) })
        );
        const docsResult = await GitHubAPI.saveJSON(
          cfg, DOCS_PATH, { categories }, fileState[DOCS_PATH].sha, `Admin : retrait du document lié au fichier supprimé "${file.title}"`
        );
        fileState[DOCS_PATH] = { json: { categories }, sha: docsResult.content.sha };
      }

      await deleteFileIfExists(toRepoPath(file.path));

      const updatedFiles = currentMediaFiles.filter((f) => f.id !== file.id);
      const result = await GitHubAPI.saveJSON(
        cfg, MEDIA_LIBRARY_PATH, { files: updatedFiles }, fileState[MEDIA_LIBRARY_PATH].sha, `Admin : suppression du fichier "${file.title}" de la médiathèque`
      );
      fileState[MEDIA_LIBRARY_PATH] = { json: { files: updatedFiles }, sha: result.content.sha };
      currentMediaFiles = updatedFiles;
      renderMediaFilesList(currentMediaFiles);
    } catch (err) {
      alert('Erreur lors de la suppression : ' + err.message);
    }
  }

  /* --- Sélecteur de médiathèque, utilisable depuis un éditeur --- */

  let mediaPickerCallback = null;

  async function openMediaPicker(onSelect) {
    mediaPickerCallback = onSelect;
    const overlay = document.getElementById('mediaPickerOverlay');
    const listEl = document.getElementById('mediaPickerList');
    document.getElementById('mediaPickerSearch').value = '';
    listEl.innerHTML = '<p style="color:var(--color-text-muted); font-size:0.85rem;"><i class="fa-solid fa-spinner fa-spin"></i> Chargement…</p>';
    overlay.classList.remove('hidden');

    try {
      if (!fileState[MEDIA_LIBRARY_PATH]) await readFile(MEDIA_LIBRARY_PATH);
      currentMediaFiles = fileState[MEDIA_LIBRARY_PATH].json.files || [];
      renderMediaPickerGrid(currentMediaFiles);
    } catch (err) {
      listEl.innerHTML = '<p class="empty-list-msg">Impossible de charger la médiathèque.</p>';
    }
  }

  function renderMediaPickerGrid(files) {
    const listEl = document.getElementById('mediaPickerList');
    const query = (document.getElementById('mediaPickerSearch').value || '').toLowerCase().trim();
    const filtered = query
      ? files.filter((f) => (f.title || '').toLowerCase().includes(query) || (f.filename || '').toLowerCase().includes(query))
      : files;

    listEl.innerHTML = '';
    if (filtered.length === 0) {
      listEl.innerHTML = '<p class="empty-list-msg">Aucun fichier. Ajoutes-en depuis l\'onglet Médiathèque.</p>';
      return;
    }

    filtered.forEach((file) => {
      const card = document.createElement('div');
      card.className = 'media-picker-card';
      card.innerHTML = file.type === 'image'
        ? `<img src="${adminAssetPath(file.path)}" alt="">`
        : `<div class="media-picker-icon"><i class="fa-solid fa-file-lines"></i></div>`;
      const label = document.createElement('span');
      label.textContent = file.title || file.filename;
      card.appendChild(label);
      card.addEventListener('click', () => {
        document.getElementById('mediaPickerOverlay').classList.add('hidden');
        if (mediaPickerCallback) mediaPickerCallback(file);
      });
      listEl.appendChild(card);
    });
  }

  document.getElementById('mediaPickerSearch').addEventListener('input', () => renderMediaPickerGrid(currentMediaFiles));
  document.getElementById('mediaPickerCloseBtn').addEventListener('click', () => {
    document.getElementById('mediaPickerOverlay').classList.add('hidden');
  });

  // Câblage du bouton "Insérer depuis la médiathèque" pour un éditeur donné
  function setupMediaLibraryInsertButton(btnId, editor) {
    document.getElementById(btnId).addEventListener('click', () => {
      const sel = window.getSelection();
      const savedRange = (sel.rangeCount > 0 && editor.contains(sel.anchorNode))
        ? sel.getRangeAt(0).cloneRange()
        : null;

      openMediaPicker((file) => {
        restoreEditorSelection(editor, savedRange);
        if (file.type === 'image') {
          document.execCommand('insertHTML', false, `<img class="resizable-img" src="${file.path}" alt="${file.title || ''}">`);
        } else {
          const sel2 = window.getSelection();
          const hasSelection = sel2.rangeCount > 0 && !sel2.getRangeAt(0).collapsed;
          if (hasSelection) {
            createLinkWithTooltip(editor, file.path);
          } else {
            document.execCommand('insertHTML', false, `<a href="${file.path}" title="${file.path}">${file.title || file.filename}</a>`);
          }
        }
      });
    });
  }

  setupMediaLibraryInsertButton('pageMediaLibraryBtn', pageRichtextEditor);
  setupMediaLibraryInsertButton('staticPageMediaLibraryBtn', staticPageRichtextEditor);

  /* ---------- Démarrage ---------- */

  const stored = loadStoredConfig();
  if (stored) {
    document.getElementById('ghToken').value = stored.token || '';
    attemptLogin(
      { token: stored.token, owner: REPO_OWNER, repo: REPO_NAME, branch: REPO_BRANCH },
      !!localStorage.getItem(STORAGE_KEY)
    );
  }
})();

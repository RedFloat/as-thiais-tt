/* ==========================================================================
   ADMIN-APP.JS — AS Thiais Tennis de Table — Espace Admin
   ========================================================================== */

(function () {
  'use strict';

  const STORAGE_KEY = 'asthiaistt_admin_cfg';

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

      alertsEl.innerHTML = '';

      if (pendingResults.length > 0) {
        alertsEl.appendChild(
          buildAlert('alert-warning', 'fa-table-tennis-paddle-ball',
            `${pendingResults.length} résultat${pendingResults.length > 1 ? 's' : ''} de match à saisir`,
            pendingResults)
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

      if (expired.length === 0 && soon.length === 0 && pendingResults.length === 0) {
        alertsEl.appendChild(
          buildAlert('alert-success', 'fa-circle-check', 'Tout est à jour, rien à traiter pour le moment', [])
        );
      }

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

  function startEditSponsor(sponsor) {
    document.getElementById('sponsorId').value = sponsor.id;
    document.getElementById('sponsorName').value = sponsor.name || '';
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
    sponsorSaveLabel.textContent = 'Ajouter le sponsor';
    sponsorCancelBtn.classList.add('hidden');
    document.getElementById('sponsorFormTitle').textContent = 'Ajouter un sponsor';
  }

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
      const logo = document.getElementById('sponsorLogo').value.trim();
      const link = document.getElementById('sponsorLink').value.trim();
      const description = document.getElementById('sponsorDescription').value.trim();

      if (editingId) {
        const idx = sponsors.findIndex((s) => s.id === editingId);
        if (idx !== -1) sponsors[idx] = { id: editingId, name, logo, link, description };
      } else {
        const id = generateSponsorId(name, sponsors);
        sponsors.push({ id, name, logo, link, description });
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
      const docs = cat.documents || [];
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
        row.innerHTML = `
          <div class="admin-list-thumb"><i class="fa-solid ${doc.icon || 'fa-file'}" style="color:var(--color-navy); font-size:1.3rem;"></i></div>
          <div class="admin-list-info">
            <strong>${doc.title} ${docStatusBadge(doc.expirationDate)}</strong>
            <span>${doc.file}</span>
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
      const expirationDate = document.getElementById('docExpiration').value || null;

      // Retire le document de son ancienne catégorie si on est en train de le modifier
      if (editingId) {
        categories.forEach((c) => {
          c.documents = c.documents.filter((d) => d.id !== editingId);
        });
      }

      const id = editingId || generateDocId(title, categories);
      const docEntry = { id, title, description, file, icon, expirationDate };

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
    if (!(await showConfirmModal('Supprimer ce document ? Cette action est immédiate.'))) return;

    setStatus(docStatus, 'loading', 'Suppression en cours…');
    try {
      if (!fileState[DOCS_PATH]) await readFile(DOCS_PATH);
      const current = fileState[DOCS_PATH].json;
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

  const navCategoriesList = document.getElementById('navCategoriesList');
  const navItemsList = document.getElementById('navItemsList');
  const navCategoryStatus = document.getElementById('navCategoryStatus');
  const navPageStatus = document.getElementById('navPageStatus');
  const navPageForm = document.getElementById('navPageForm');
  const navPageCancelBtn = document.getElementById('navPageCancelBtn');
  const navPageSaveLabel = document.getElementById('navPageSaveLabel');
  const navPageCategorySelect = document.getElementById('navPageCategory');

  async function loadNavigationView() {
    navCategoriesList.innerHTML = '<p style="color:var(--color-text-muted); font-size:0.85rem;"><i class="fa-solid fa-spinner fa-spin"></i> Chargement…</p>';
    navItemsList.innerHTML = '';
    try {
      const data = await readFile(NAV_PATH);
      renderNavigation(data.items || []);
    } catch (err) {
      navCategoriesList.innerHTML = '';
      navItemsList.appendChild(
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

  async function moveTopLevelItem(id, direction) {
    if (!fileState[NAV_PATH]) await readFile(NAV_PATH);
    const items = fileState[NAV_PATH].json.items.slice();
    const idx = items.findIndex((it) => it.id === id);
    const newIdx = idx + direction;
    if (idx === -1 || newIdx < 0 || newIdx >= items.length) return;
    [items[idx], items[newIdx]] = [items[newIdx], items[idx]];
    await saveNavigation(items, 'Admin : réorganisation du menu');
  }

  async function moveChildItem(parentId, childId, direction) {
    if (!fileState[NAV_PATH]) await readFile(NAV_PATH);
    const items = fileState[NAV_PATH].json.items.slice();
    const parent = items.find((it) => it.id === parentId);
    if (!parent || !Array.isArray(parent.children)) return;
    const children = parent.children.slice();
    const idx = children.findIndex((c) => c.id === childId);
    const newIdx = idx + direction;
    if (idx === -1 || newIdx < 0 || newIdx >= children.length) return;
    [children[idx], children[newIdx]] = [children[newIdx], children[idx]];
    parent.children = children;
    await saveNavigation(items, 'Admin : réorganisation d\'une catégorie du menu');
  }

  function reorderArrowsHtml() {
    return `
      <button type="button" class="reorder-btn move-up-btn" title="Monter"><i class="fa-solid fa-chevron-up"></i></button>
      <button type="button" class="reorder-btn move-down-btn" title="Descendre"><i class="fa-solid fa-chevron-down"></i></button>
    `;
  }

  function renderNavigation(items) {
    /* --- Liste des catégories (dropdowns) --- */
    const categories = items.filter((it) => it.type === 'dropdown');
    navCategoriesList.innerHTML = '';

    if (categories.length === 0) {
      navCategoriesList.innerHTML = '<p class="empty-list-msg">Aucune catégorie pour le moment.</p>';
    } else {
      categories.forEach((cat) => {
        const row = document.createElement('div');
        row.className = 'nav-category-row';
        row.innerHTML = `
          <i class="fa-solid fa-folder folder-icon"></i>
          <strong>${cat.label} (${(cat.children || []).length})</strong>
          <div class="admin-list-actions">
            ${reorderArrowsHtml()}
            <button type="button" class="rename-btn" title="Renommer"><i class="fa-solid fa-pen"></i></button>
            <button type="button" class="delete-btn" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
          </div>
        `;
        row.querySelector('.move-up-btn').addEventListener('click', () => moveTopLevelItem(cat.id, -1));
        row.querySelector('.move-down-btn').addEventListener('click', () => moveTopLevelItem(cat.id, 1));
        row.querySelector('.rename-btn').addEventListener('click', () => renameCategory(cat.id, cat.label));
        row.querySelector('.delete-btn').addEventListener('click', () => deleteCategory(cat.id, cat.label, (cat.children || []).length));
        navCategoriesList.appendChild(row);
      });
    }

    /* --- Menu déroulant "Catégorie" du formulaire d'ajout de page --- */
    navPageCategorySelect.innerHTML = '<option value="">Aucune — lien direct dans le menu</option>';
    categories.forEach((cat) => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.label;
      navPageCategorySelect.appendChild(opt);
    });

    /* --- Liste de toutes les pages (liens directs + pages dans les catégories) --- */
    navItemsList.innerHTML = '';
    let total = 0;

    items.forEach((item) => {
      if (item.type === 'dropdown') {
        (item.children || []).forEach((child) => {
          total++;
          navItemsList.appendChild(buildNavItemRow(child, item.id, item.label));
        });
      } else {
        total++;
        navItemsList.appendChild(buildNavItemRow(item, null, null));
      }
    });

    if (total === 0) {
      navItemsList.innerHTML = '<p class="empty-list-msg">Aucune page dans le menu.</p>';
    }
  }

  function buildNavItemRow(item, parentId, parentLabel) {
    const row = document.createElement('div');
    row.className = 'nav-item-row' + (parentId ? ' is-child' : '');
    row.innerHTML = `
      <div class="nav-item-info">
        <strong>${item.label}${parentLabel ? ' <span style="font-weight:400; color:var(--color-text-muted); font-size:0.76rem;">— ' + parentLabel + '</span>' : ''}</strong>
        <span>${item.link}</span>
      </div>
      <div class="admin-list-actions">
        ${reorderArrowsHtml()}
        <button type="button" class="edit-btn" title="Modifier"><i class="fa-solid fa-pen"></i></button>
        <button type="button" class="delete-btn" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
      </div>
    `;
    row.querySelector('.move-up-btn').addEventListener('click', () => {
      parentId ? moveChildItem(parentId, item.id, -1) : moveTopLevelItem(item.id, -1);
    });
    row.querySelector('.move-down-btn').addEventListener('click', () => {
      parentId ? moveChildItem(parentId, item.id, 1) : moveTopLevelItem(item.id, 1);
    });
    row.querySelector('.edit-btn').addEventListener('click', () => startEditNavItem(item, parentId));
    row.querySelector('.delete-btn').addEventListener('click', () => deleteNavItem(item.id, parentId));
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
    navPageCancelBtn.classList.remove('hidden');
    document.getElementById('navFormTitle').textContent = 'Modifier la page';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetNavPageForm() {
    navPageForm.reset();
    document.getElementById('navPageId').value = '';
    document.getElementById('navPageParentId').value = '';
    navPageSaveLabel.textContent = 'Ajouter la page';
    navPageCancelBtn.classList.add('hidden');
    document.getElementById('navFormTitle').textContent = 'Ajouter une page au menu';
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

  function renderTeamsList(teams) {
    teamsList.innerHTML = '';
    if (teams.length === 0) {
      teamsList.innerHTML = '<p class="empty-list-msg">Aucune équipe pour le moment.</p>';
      return;
    }

    teams.forEach((team) => {
      const row = document.createElement('div');
      row.className = 'admin-list-item';
      row.innerHTML = `
        ${team.photo
          ? `<img class="team-row-thumb" src="${adminAssetPath(team.photo)}" alt="">`
          : `<div class="admin-list-thumb"><i class="fa-solid fa-people-group" style="color:var(--color-navy);"></i></div>`}
        <div class="admin-list-info">
          <strong>${team.name}</strong>
          <span>${team.division || ''}</span>
        </div>
        <div class="admin-list-actions">
          <button type="button" class="edit-btn" title="Modifier"><i class="fa-solid fa-pen"></i></button>
          <button type="button" class="delete-btn" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
        </div>
      `;
      row.querySelector('.edit-btn').addEventListener('click', () => startEditTeam(team));
      row.querySelector('.delete-btn').addEventListener('click', () => deleteTeam(team.id, team.name));
      teamsList.appendChild(row);
    });
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

  function openTeamEditor(team) {
    teamEditorForm.reset();
    teamPlayersRows.innerHTML = '';
    teamMatchesRows.innerHTML = '';
    teamPhotoPreviewWrap.innerHTML = '';
    pendingTeamPhotoFile = null;

    if (team) {
      document.getElementById('teamEditId').value = team.id;
      document.getElementById('teamName').value = team.name || '';
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
      const id = editingId || generateTeamId(currentTeamsCache);

      const name = document.getElementById('teamName').value.trim();
      const division = document.getElementById('teamDivision').value.trim();
      const description = document.getElementById('teamDescription').value.trim();

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
      const sha = fileState[path] ? fileState[path].sha : undefined;
      const result = await GitHubAPI.saveJSON(
        cfg, path, teamData, sha,
        isNewTeam ? `Admin : création de l'équipe "${name}"` : `Admin : modification de l'équipe "${name}"`
      );
      fileState[path] = { json: teamData, sha: result.content.sha };

      // Si nouvelle équipe : on l'ajoute à l'index
      if (isNewTeam) {
        if (!fileState[TEAMS_INDEX_PATH]) await readFile(TEAMS_INDEX_PATH);
        const indexJson = fileState[TEAMS_INDEX_PATH].json;
        const teamIds = (indexJson.teamIds || []).concat(id);
        const indexSha = fileState[TEAMS_INDEX_PATH].sha;
        const indexResult = await GitHubAPI.saveJSON(
          cfg, TEAMS_INDEX_PATH, { teamIds }, indexSha, `Admin : ajout de l'équipe "${name}" à l'index`
        );
        fileState[TEAMS_INDEX_PATH] = { json: { teamIds }, sha: indexResult.content.sha };
      }

      await loadTeamsView();
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
    btn.addEventListener('click', () => {
      richtextEditor.focus();
      const cmd = btn.dataset.cmd;
      if (cmd.startsWith('formatBlock:')) {
        document.execCommand('formatBlock', false, cmd.split(':')[1]);
      } else {
        document.execCommand(cmd, false, null);
      }
    });
  });

  let savedNewsColorRange = null;
  const richtextColorInput = document.getElementById('richtextColorInput');
  richtextColorInput.addEventListener('click', () => {
    const sel = window.getSelection();
    savedNewsColorRange = (sel.rangeCount > 0 && richtextEditor.contains(sel.anchorNode))
      ? sel.getRangeAt(0).cloneRange()
      : null;
  });
  richtextColorInput.addEventListener('input', () => {
    restoreEditorSelection(richtextEditor, savedNewsColorRange);
    document.execCommand('foreColor', false, richtextColorInput.value);
  });

  let savedNewsSizeRange = null;
  const richtextFontSizeSelect = document.getElementById('richtextFontSizeSelect');
  richtextFontSizeSelect.addEventListener('mousedown', () => {
    const sel = window.getSelection();
    savedNewsSizeRange = (sel.rangeCount > 0 && richtextEditor.contains(sel.anchorNode))
      ? sel.getRangeAt(0).cloneRange()
      : null;
  });
  richtextFontSizeSelect.addEventListener('change', () => {
    if (!richtextFontSizeSelect.value) return;
    restoreEditorSelection(richtextEditor, savedNewsSizeRange);
    document.execCommand('fontSize', false, richtextFontSizeSelect.value);
    richtextFontSizeSelect.value = '';
  });

  document.getElementById('richtextLinkBtn').addEventListener('click', async () => {
    const url = await showPromptModal('Adresse du lien à insérer', '', { placeholder: 'https://exemple.com' });
    if (!url) return;
    richtextEditor.focus();
    document.execCommand('createLink', false, url);
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

  richtextImageInput.addEventListener('change', async () => {
    const file = richtextImageInput.files[0];
    if (!file) return;

    const newsId = document.getElementById('newsEditId').value || 'news-brouillon';
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `imgs/news/${newsId}-inline-${Date.now()}.${ext}`;
    const tempId = 'tmp-img-' + Date.now();

    const dataUrl = await readFileAsDataUrl(file);
    restoreEditorSelection(richtextEditor, savedNewsRange);
    document.execCommand('insertHTML', false, `<img id="${tempId}" class="resizable-img" src="${dataUrl}" alt="">`);

    setStatus(newsEditorStatus, 'loading', 'Envoi de l\'image…');
    try {
      await GitHubAPI.uploadFile(cfg, path, file, `Admin : image insérée dans une news`);
      const insertedImg = richtextEditor.querySelector('#' + tempId);
      if (insertedImg) {
        insertedImg.src = `./${path}`;
        insertedImg.removeAttribute('id');
      }
      hideStatus(newsEditorStatus);
    } catch (err) {
      setStatus(newsEditorStatus, 'error', 'Erreur d\'envoi de l\'image : ' + err.message + ' (l\'aperçu reste affiché mais ne sera pas enregistré, réessaie l\'envoi)');
    } finally {
      richtextImageInput.value = '';
    }
  });

  /* --- Enregistrement --- */

  newsEditorForm.addEventListener('submit', async (e) => {
    e.preventDefault();
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
      const data = await readFile(PAGES_PATH);
      currentPagesList = data.pages || [];
      renderPagesList(currentPagesList);
    } catch (err) {
      pagesList.innerHTML = '';
      pagesList.appendChild(buildAlert('alert-danger', 'fa-triangle-exclamation', 'Impossible de charger les pages', [err.message]));
    }
  }

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

  function openPageEditor(page) {
    pageEditorForm.reset();
    pageRichtextEditor.innerHTML = '';
    pageCodeEditor.value = '';
    slugManuallyEdited = false;

    // Revient toujours en mode visuel à l'ouverture, quel que soit le mode précédent
    pageEditorMode = 'visual';
    pageVisualEditorWrap.classList.remove('hidden');
    pageCodeEditorWrap.classList.add('hidden');
    document.querySelectorAll('#pageModeSwitch .mode-switch-btn').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.mode === 'visual');
    });

    if (page) {
      document.getElementById('pageEditId').value = page.id;
      pageTitleInput.value = page.title || '';
      pageSlugInput.value = page.slug || '';
      slugManuallyEdited = true;
      pageRichtextEditor.innerHTML = page.body || '';
      pageSaveLabel.textContent = 'Enregistrer les modifications';
      document.getElementById('pageEditorTitle').textContent = 'Modifier la page';
    } else {
      document.getElementById('pageEditId').value = '';
      pageSaveLabel.textContent = 'Créer la page';
      document.getElementById('pageEditorTitle').textContent = 'Créer une page';
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
    btn.addEventListener('click', () => {
      pageRichtextEditor.focus();
      const cmd = btn.dataset.cmd;
      if (cmd.startsWith('formatBlock:')) {
        document.execCommand('formatBlock', false, cmd.split(':')[1]);
      } else {
        document.execCommand(cmd, false, null);
      }
    });
  });

  let savedPageColorRange = null;
  const pageRichtextColorInput = document.getElementById('pageRichtextColorInput');
  pageRichtextColorInput.addEventListener('click', () => {
    const sel = window.getSelection();
    savedPageColorRange = (sel.rangeCount > 0 && pageRichtextEditor.contains(sel.anchorNode))
      ? sel.getRangeAt(0).cloneRange()
      : null;
  });
  pageRichtextColorInput.addEventListener('input', () => {
    restoreEditorSelection(pageRichtextEditor, savedPageColorRange);
    document.execCommand('foreColor', false, pageRichtextColorInput.value);
  });

  let savedPageSizeRange = null;
  const pageRichtextFontSizeSelect = document.getElementById('pageRichtextFontSizeSelect');
  pageRichtextFontSizeSelect.addEventListener('mousedown', () => {
    const sel = window.getSelection();
    savedPageSizeRange = (sel.rangeCount > 0 && pageRichtextEditor.contains(sel.anchorNode))
      ? sel.getRangeAt(0).cloneRange()
      : null;
  });
  pageRichtextFontSizeSelect.addEventListener('change', () => {
    if (!pageRichtextFontSizeSelect.value) return;
    restoreEditorSelection(pageRichtextEditor, savedPageSizeRange);
    document.execCommand('fontSize', false, pageRichtextFontSizeSelect.value);
    pageRichtextFontSizeSelect.value = '';
  });

  document.getElementById('pageRichtextLinkBtn').addEventListener('click', async () => {
    const url = await showPromptModal('Adresse du lien à insérer', '', { placeholder: 'https://exemple.com' });
    if (!url) return;
    pageRichtextEditor.focus();
    document.execCommand('createLink', false, url);
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

    // Aperçu instantané avec le fichier local (pas d'attente réseau, ça s'affiche tout de suite)
    const dataUrl = await readFileAsDataUrl(file);
    restoreEditorSelection(pageRichtextEditor, savedPageRange);
    document.execCommand('insertHTML', false, `<img id="${tempId}" class="resizable-img" src="${dataUrl}" alt="">`);

    setStatus(pageEditorStatus, 'loading', 'Envoi de l\'image…');
    try {
      await GitHubAPI.uploadFile(cfg, path, file, `Admin : image insérée dans une page`);
      const insertedImg = pageRichtextEditor.querySelector('#' + tempId);
      if (insertedImg) {
        insertedImg.src = `./${path}`;
        insertedImg.removeAttribute('id');
      }
      hideStatus(pageEditorStatus);
    } catch (err) {
      setStatus(pageEditorStatus, 'error', 'Erreur d\'envoi de l\'image : ' + err.message + ' (l\'aperçu reste affiché mais ne sera pas enregistré, réessaie l\'envoi)');
    } finally {
      pageRichtextImageInput.value = '';
    }
  });

  /* --- Enregistrement --- */

  pageEditorForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const saveBtn = document.getElementById('pageSaveBtn');
    saveBtn.disabled = true;
    setStatus(pageEditorStatus, 'loading', 'Enregistrement en cours…');

    try {
      if (!fileState[PAGES_PATH]) await readFile(PAGES_PATH);
      const pages = fileState[PAGES_PATH].json.pages.slice();

      const editingId = document.getElementById('pageEditId').value;
      const title = pageTitleInput.value.trim();
      const slug = slugify(pageSlugInput.value.trim() || title);
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



  /* ---------- Redimensionnement / placement des images dans les éditeurs ---------- */

  let selectedImg = null;
  const imgFloatToolbar = document.getElementById('imgFloatToolbar');

  function positionImgToolbar(img) {
    const rect = img.getBoundingClientRect();
    imgFloatToolbar.style.top = Math.max(8, rect.top - 46) + 'px';
    imgFloatToolbar.style.left = Math.max(8, rect.left) + 'px';
    imgFloatToolbar.classList.add('is-open');
  }

  function selectImage(img) {
    if (selectedImg) selectedImg.classList.remove('is-selected');
    selectedImg = img;
    img.classList.add('is-selected');
    positionImgToolbar(img);
  }

  function deselectImage() {
    if (selectedImg) selectedImg.classList.remove('is-selected');
    selectedImg = null;
    imgFloatToolbar.classList.remove('is-open');
  }

  function setupImageResizing(editor) {
    editor.addEventListener('click', (e) => {
      if (e.target.tagName === 'IMG') {
        e.preventDefault();
        selectImage(e.target);
      } else {
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

  document.getElementById('imgDeleteBtn').addEventListener('click', () => {
    if (!selectedImg) return;
    selectedImg.remove();
    deselectImage();
  });

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

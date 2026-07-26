/* ==========================================================================
   ADMIN-APP.JS — AS Thiais Tennis de Table — Espace Admin
   ========================================================================== */

(function () {
  'use strict';

  const STORAGE_KEY = 'asthiaistt_admin_cfg';

  let cfg = null; // { token, owner, repo, branch }
  const fileState = {}; // cache { path: { json, sha } } des fichiers déjà lus

  /* ---------- Éléments DOM ---------- */

  const loginScreen = document.getElementById('loginScreen');
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  const loginSubmitBtn = document.getElementById('loginSubmitBtn');

  const adminApp = document.getElementById('adminApp');
  const logoutBtn = document.getElementById('logoutBtn');
  const topbarRepoInfo = document.getElementById('topbarRepoInfo');
  const aboutRepoInfo = document.getElementById('aboutRepoInfo');

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
      owner: document.getElementById('ghOwner').value.trim(),
      repo: document.getElementById('ghRepo').value.trim(),
      branch: document.getElementById('ghBranch').value.trim() || 'main'
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
    const repoLabel = `${cfg.owner}/${cfg.repo} (${cfg.branch})`;
    topbarRepoInfo.textContent = repoLabel;
    aboutRepoInfo.textContent = repoLabel;
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
    });
  });

  /* ---------- Aide : lecture avec cache ---------- */

  async function readFile(path) {
    const result = await GitHubAPI.getJSON(cfg, path);
    fileState[path] = result;
    return result.json;
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
      const [documentsData, sponsorsData, newsData, siteConfig] = await Promise.all([
        readFile('data/documents.json'),
        readFile('data/sponsors.json'),
        readFile('data/news.json'),
        readFile('data/site-config.json')
      ]);

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
          else if (diff <= 30) soon.push(doc);
        });
      });

      alertsEl.innerHTML = '';

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
            `${soon.length} document${soon.length > 1 ? 's' : ''} bientôt à renouveler (30 jours)`,
            soon.map((d) => d.title))
        );
      }

      if (expired.length === 0 && soon.length === 0) {
        alertsEl.appendChild(
          buildAlert('alert-success', 'fa-circle-check', 'Aucun document à mettre à jour pour le moment', [])
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
          <div class="stat-value">${(sponsorsData.sponsors || []).length}</div>
          <div class="stat-label">Sponsors</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${(newsData.news || []).length}</div>
          <div class="stat-label">News</div>
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

  async function loadSettingsView() {
    setStatus(settingsStatus, 'loading', 'Chargement…');
    try {
      const config = await readFile('data/site-config.json');
      document.getElementById('settingsSeason').value = config.season || '';
      document.getElementById('settingsCalendarUrl').value = config.calendarEmbedUrl || '';
      document.getElementById('settingsFacebook').value = config.facebookUrl || '';
      document.getElementById('settingsInstagram').value = config.instagramUrl || '';
      hideStatus(settingsStatus);
      hideStatus(socialsStatus);
    } catch (err) {
      setStatus(settingsStatus, 'error', 'Erreur de chargement : ' + err.message);
    }
  }

  settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const saveBtn = document.getElementById('settingsSaveBtn');
    saveBtn.disabled = true;
    setStatus(settingsStatus, 'loading', 'Enregistrement en cours…');

    try {
      const path = 'data/site-config.json';
      const current = fileState[path] ? fileState[path].json : {};
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
      const current = fileState[path] ? fileState[path].json : {};
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
        <div class="admin-list-thumb"><img src="${sponsor.logo}" alt=""></div>
        <div class="admin-list-info">
          <strong>${sponsor.name}</strong>
          <span>${sponsor.link || 'Pas de lien renseigné'}</span>
        </div>
        <div class="admin-list-actions">
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
      const current = fileState[SPONSORS_PATH] ? fileState[SPONSORS_PATH].json : { sponsors: [] };
      const sponsors = (current.sponsors || []).slice();

      const editingId = document.getElementById('sponsorId').value;
      const name = document.getElementById('sponsorName').value.trim();
      const logo = document.getElementById('sponsorLogo').value.trim();
      const link = document.getElementById('sponsorLink').value.trim();

      if (editingId) {
        const idx = sponsors.findIndex((s) => s.id === editingId);
        if (idx !== -1) sponsors[idx] = { id: editingId, name, logo, link };
      } else {
        const id = generateSponsorId(name, sponsors);
        sponsors.push({ id, name, logo, link });
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
    if (!confirm('Supprimer ce sponsor ? Cette action est immédiate.')) return;

    setStatus(sponsorStatus, 'loading', 'Suppression en cours…');
    try {
      const current = fileState[SPONSORS_PATH] ? fileState[SPONSORS_PATH].json : { sponsors: [] };
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

  /* ---------- Démarrage ---------- */

  const stored = loadStoredConfig();
  if (stored) {
    document.getElementById('ghToken').value = stored.token || '';
    document.getElementById('ghOwner').value = stored.owner || 'redfloat';
    document.getElementById('ghRepo').value = stored.repo || 'as-thiais-tt';
    document.getElementById('ghBranch').value = stored.branch || 'main';
    attemptLogin(stored, !!localStorage.getItem(STORAGE_KEY));
  }
})();

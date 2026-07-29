/* ==========================================================================
   ADMIN-APP.JS — AS Thiais Tennis de Table — Espace Admin
   ========================================================================== */

(function () {
  'use strict';

  const STORAGE_KEY = 'asthiaistt_admin_cfg';

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
    });
  });

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
      if (!fileState[SPONSORS_PATH]) await readFile(SPONSORS_PATH);
      const current = fileState[SPONSORS_PATH].json;
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
    if (!confirm('Supprimer ce document ? Cette action est immédiate.')) return;

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
            <button type="button" class="rename-btn" title="Renommer"><i class="fa-solid fa-pen"></i></button>
            <button type="button" class="delete-btn" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
          </div>
        `;
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
        <button type="button" class="edit-btn" title="Modifier"><i class="fa-solid fa-pen"></i></button>
        <button type="button" class="delete-btn" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
      </div>
    `;
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
    if (!confirm('Retirer cette page du menu ? Cette action est immédiate.')) return;

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
    const newLabel = prompt('Nouveau nom de la catégorie :', currentLabel);
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
    if (!confirm(message)) return;

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

  teamPhotoInput.addEventListener('change', () => {
    const file = teamPhotoInput.files[0];
    if (!file) return;
    pendingTeamPhotoFile = file;
    const reader = new FileReader();
    reader.onload = () => {
      teamPhotoPreviewWrap.innerHTML = `<img class="team-photo-preview" src="${reader.result}" alt="">`;
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
      currentTeamPhotoPath = team.photo || '';
      if (team.photo) {
        teamPhotoPreviewWrap.innerHTML = `<img class="team-photo-preview" src="${adminAssetPath(team.photo)}" alt="">`;
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

      const teamData = { id, name, division, photo, description, players, classification, matches };

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
    if (!confirm(`Supprimer l'équipe "${name}" ? Sa fiche, son calendrier et sa photo seront définitivement supprimés.`)) return;

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
  const NEWS_SEASONS_PATH = 'data/news-seasons.json';
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
      if (!fileState[NEWS_SEASONS_PATH]) await readFile(NEWS_SEASONS_PATH);
      const seasons = fileState[NEWS_SEASONS_PATH].json.seasons || [];
      if (seasons.includes(season)) {
        populateNewsSeasonSelect(seasons, season);
        input.value = '';
        return;
      }
      const updatedSeasons = seasons.concat(season);
      const sha = fileState[NEWS_SEASONS_PATH].sha;
      const result = await GitHubAPI.saveJSON(
        cfg, NEWS_SEASONS_PATH, { seasons: updatedSeasons }, sha, `Admin : ajout de la saison "${season}"`
      );
      fileState[NEWS_SEASONS_PATH] = { json: { seasons: updatedSeasons }, sha: result.content.sha };
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
        readFile(NEWS_SEASONS_PATH),
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
        fileState[NEWS_SEASONS_PATH] ? fileState[NEWS_SEASONS_PATH].json.seasons : [],
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
      const seasons = fileState[NEWS_SEASONS_PATH] ? fileState[NEWS_SEASONS_PATH].json.seasons : [];
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

  document.getElementById('richtextLinkBtn').addEventListener('click', () => {
    const url = prompt('Lien à insérer (https://...) :');
    if (!url) return;
    richtextEditor.focus();
    document.execCommand('createLink', false, url);
  });

  document.getElementById('richtextImageBtn').addEventListener('click', () => {
    richtextImageInput.click();
  });

  richtextImageInput.addEventListener('change', async () => {
    const file = richtextImageInput.files[0];
    if (!file) return;

    const newsId = document.getElementById('newsEditId').value || 'news-brouillon';
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `imgs/news/${newsId}-inline-${Date.now()}.${ext}`;

    setStatus(newsEditorStatus, 'loading', 'Envoi de l\'image…');
    try {
      await GitHubAPI.uploadFile(cfg, path, file, `Admin : image insérée dans une news`);
      richtextEditor.focus();
      document.execCommand('insertHTML', false, `<img src="./${path}" alt="">`);
      hideStatus(newsEditorStatus);
    } catch (err) {
      setStatus(newsEditorStatus, 'error', 'Erreur d\'envoi de l\'image : ' + err.message);
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
    return (path || '').replace(/^\.\//, '');
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
    if (!confirm(`Supprimer la news "${title}" ? Ses photos associées seront aussi supprimées. Cette action est immédiate.`)) return;

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

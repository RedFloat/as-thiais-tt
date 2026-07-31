/* ==========================================================================
   SITE-DATA.JS — AS Thiais Tennis de Table
   Charge les fichiers /data/*.json et injecte le contenu dynamique
   (saison, menu de navigation...) dans chaque page qui inclut ce script.

   Chemins relatifs volontairement en "./data/..." pour fonctionner sur
   GitHub Pages quel que soit le sous-dossier du dépôt.
   ========================================================================== */

(function () {
  'use strict';

  /* ---------- Utilitaires ---------- */

  async function loadJSON(path) {
    try {
      const res = await fetch(path, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status + ' sur ' + path);
      return await res.json();
    } catch (err) {
      console.error('[site-data] Impossible de charger', path, err);
      return null;
    }
  }

  function getCurrentPageFile() {
    const parts = window.location.pathname.split('/');
    let last = parts[parts.length - 1];
    if (!last) last = 'index.html';
    return last;
  }

  function normalizeLink(link) {
    // Retire un éventuel "./" pour comparer proprement au nom de fichier courant
    return link.replace(/^\.\//, '');
  }

  /* ---------- Saison ---------- */

  function applySeason(config) {
    if (!config || !config.season) return;

    document.querySelectorAll('[data-season-badge]').forEach((el) => {
      el.textContent = 'Saison ' + config.season;
    });

    document.querySelectorAll('[data-season]').forEach((el) => {
      el.textContent = config.season;
    });
  }

  /* ---------- Réseaux sociaux ---------- */

  function applySocialLinks(config) {
    if (!config) return;

    if (config.facebookUrl) {
      document.querySelectorAll('[data-social="facebook"]').forEach((el) => {
        el.href = config.facebookUrl;
      });
    }

    if (config.instagramUrl) {
      document.querySelectorAll('[data-social="instagram"]').forEach((el) => {
        el.href = config.instagramUrl;
      });
    }
  }

  /* ---------- Menu de navigation ---------- */

  function buildNavigation(nav) {
    const menu = document.getElementById('navMenu');
    if (!menu || !nav || !Array.isArray(nav.items)) return;

    const currentPage = getCurrentPageFile();
    menu.innerHTML = '';

    nav.items.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'nav-item';

      if (item.type === 'dropdown' && Array.isArray(item.children)) {
        li.classList.add('has-dropdown');

        const link = document.createElement('a');
        link.href = '#';
        link.className = 'nav-link';
        link.innerHTML =
          item.label + ' <i class="fa-solid fa-chevron-down" style="font-size:0.7rem;"></i>';
        li.appendChild(link);

        const dropdown = document.createElement('div');
        dropdown.className = 'dropdown';

        item.children.forEach((child) => {
          const childLink = document.createElement('a');
          childLink.href = child.link;
          childLink.textContent = child.label;
          if (normalizeLink(child.link) === currentPage) {
            childLink.classList.add('is-current');
          }
          dropdown.appendChild(childLink);
        });

        li.appendChild(dropdown);
      } else {
        const link = document.createElement('a');
        link.href = item.link;
        link.className = 'nav-link';
        link.textContent = item.label;
        if (normalizeLink(item.link) === currentPage) {
          link.classList.add('is-current');
        }
        li.appendChild(link);
      }

      menu.appendChild(li);
    });

    bindDropdownToggles();
  }

  // Réactive le clic sur les menus déroulants en version mobile
  // (doit s'exécuter APRÈS la construction du menu ci-dessus)
  function bindDropdownToggles() {
    document.querySelectorAll('.has-dropdown').forEach((item) => {
      const link = item.querySelector('.nav-link');
      if (!link) return;
      link.addEventListener('click', (e) => {
        if (window.innerWidth < 991) {
          e.preventDefault();
          item.classList.toggle('active');
        }
      });
    });
  }

  /* ---------- Sponsors ---------- */

  function buildSponsors(data) {
    const mosaic = document.getElementById('partnersMosaic');
    const featured = document.getElementById('featuredPartnerLogo');
    if (!mosaic || !data || !Array.isArray(data.sponsors)) return;

    const sponsors = data.sponsors;

    // Mosaïque
    mosaic.innerHTML = '';
    sponsors.forEach((sponsor) => {
      const item = document.createElement('div');
      item.className = 'mosaic-item';

      const img = document.createElement('img');
      img.src = sponsor.logo;
      img.alt = sponsor.name || '';

      const link = document.createElement('a');
      link.href = './sponsor.html?id=' + sponsor.id;
      link.style.display = 'contents';
      link.appendChild(img);
      item.appendChild(link);

      mosaic.appendChild(item);
    });

    // Logo mis en avant, en rotation toutes les 3 secondes
    const featuredName = document.getElementById('featuredPartnerName');
    if (featured && sponsors.length > 0) {
      let index = 0;
      const showSponsor = (i) => {
        featured.src = sponsors[i].logo;
        featured.alt = sponsors[i].name || '';
        featured.style.display = '';
        if (featuredName) featuredName.textContent = sponsors[i].name || '';
      };
      showSponsor(index);

      if (sponsors.length > 1) {
        setInterval(() => {
          index = (index + 1) % sponsors.length;
          featured.classList.add('is-fading');
          setTimeout(() => {
            showSponsor(index);
            featured.classList.remove('is-fading');
          }, 300);
        }, 3000);
      }
    }
  }

  /* ---------- Documents ---------- */

  function fileButtonLabel(filePath) {
    return filePath && filePath.toLowerCase().endsWith('.docx')
      ? 'Télécharger le document'
      : 'Télécharger le PDF';
  }

  function buildDocuments(data) {
    const container = document.getElementById('documentsContainer');
    if (!container || !data || !Array.isArray(data.categories)) return;

    container.innerHTML = '';

    data.categories.forEach((category) => {
      if (!Array.isArray(category.documents) || category.documents.length === 0) return;

      const section = document.createElement('div');
      section.className = 'doc-category-section';

      const title = document.createElement('h2');
      title.className = 'doc-category-title';
      title.innerHTML =
        '<i class="fa-solid ' + (category.icon || 'fa-folder') + '"></i> ' + category.label;
      section.appendChild(title);

      const grid = document.createElement('div');
      grid.className = 'docs-grid';

      category.documents.forEach((doc) => {
        const card = document.createElement('div');
        card.className = 'doc-card';

        card.innerHTML =
          '<div>' +
          '<div class="doc-card-header">' +
          '<h3 class="doc-title">' + doc.title + '</h3>' +
          '<div class="doc-icon"><i class="fa-solid ' + (doc.icon || 'fa-file') + '"></i></div>' +
          '</div>' +
          '<p class="doc-description">' + (doc.description || '') + '</p>' +
          '</div>' +
          '<a href="' + doc.file + '" target="_blank" rel="noopener" class="doc-link-btn">' +
          '<i class="fa-solid fa-download"></i> ' + fileButtonLabel(doc.file) +
          '</a>';

        grid.appendChild(card);
      });

      section.appendChild(grid);
      container.appendChild(section);
    });
  }

  function buildLinks(data) {
    const container = document.getElementById('linksContainer');
    if (!container || !data || !Array.isArray(data.categories)) return;

    container.innerHTML = '';

    data.categories.forEach((category) => {
      if (!Array.isArray(category.links) || category.links.length === 0) return;

      const section = document.createElement('div');
      section.className = 'links-category';

      const title = document.createElement('div');
      title.className = 'links-category-title';
      title.innerHTML =
        '<i class="fa-solid ' + (category.icon || 'fa-link') + '"></i> <h2>' + category.label + '</h2>';
      section.appendChild(title);

      const grid = document.createElement('div');
      grid.className = 'links-grid';

      category.links.forEach((link) => {
        const displayUrl = link.url.replace(/^https?:\/\//, '').replace(/\/$/, '');
        const card = document.createElement('div');
        card.className = 'link-card';
        card.innerHTML =
          '<div class="link-card-icon"><i class="fa-solid ' + (link.icon || 'fa-link') + '"></i></div>' +
          '<h3>' + link.title + '</h3>' +
          '<p>' + (link.description || '') + '</p>' +
          '<span class="link-card-url">' + displayUrl + '</span>' +
          '<a href="' + link.url + '" target="_blank" rel="noopener" class="link-card-btn">' +
          '<i class="fa-solid fa-arrow-up-right-from-square"></i> Visiter le site</a>';
        grid.appendChild(card);
      });

      section.appendChild(grid);
      container.appendChild(section);
    });
  }

  /* ---------- Embed calendrier ---------- */

  function applyCalendarEmbed(config) {
    const iframe = document.getElementById('calendarEmbed');
    if (!iframe || !config || !config.calendarEmbedUrl) return;
    iframe.src = config.calendarEmbedUrl;
  }

  /* ---------- Équipes / matchs ---------- */

  function formatDateFR(isoDate) {
    if (!isoDate) return '';
    const [y, m, d] = isoDate.split('-');
    return `${d}/${m}/${y}`;
  }

  function scoreBadge(match) {
    if (match.status === 'upcoming') {
      return { cls: 'status-upcoming', label: 'À venir' };
    }
    // On retire une éventuelle lettre V/D/N déjà présente au début du score saisi,
    // pour éviter un affichage du type "V V 8-4" si elle a été tapée par erreur.
    const cleanScore = (match.score || '').replace(/^[VDN]\s*/i, '').trim();
    const scoreText = cleanScore ? ' ' + cleanScore : '';
    if (match.result === 'V') return { cls: 'score-win', label: 'V' + scoreText };
    if (match.result === 'D') return { cls: 'score-loss', label: 'D' + scoreText };
    if (match.result === 'N') return { cls: 'score-draw', label: 'N' + scoreText };
    return { cls: 'status-upcoming', label: scoreText.trim() || '—' };
  }

  // Dernier match joué (le plus récent) + prochain match à venir (le plus proche),
  // calculés automatiquement à partir du calendrier complet de l'équipe.
  function pickLastAndNext(matches) {
    const played = (matches || [])
      .filter((m) => m.status === 'played')
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    const upcoming = (matches || [])
      .filter((m) => m.status === 'upcoming')
      .sort((a, b) => (a.date > b.date ? 1 : -1));
    return { last: played[0] || null, next: upcoming[0] || null };
  }

  // Forme sur les 5 derniers matchs joués (façon Flashscore), du plus ancien au plus récent.
  function computeForm(matches, count) {
    return (matches || [])
      .filter((m) => m.status === 'played' && m.result)
      .sort((a, b) => (a.date > b.date ? 1 : -1))
      .slice(-(count || 5));
  }

  function buildTeams(teams) {
    const grid = document.getElementById('teamsGrid');
    if (!grid || !Array.isArray(teams)) return;

    const titleEl = document.getElementById('teamsSectionTitle');
    if (titleEl) {
      titleEl.textContent = teams.length === 1
        ? "L'Équipe du Club"
        : `Les ${teams.length} Équipes du Club`;
    }

    grid.innerHTML = '';

    teams.forEach((team) => {
      if (!team) return;
      const card = document.createElement('div');
      card.className = 'mini-team-card';

      const header = document.createElement('div');
      header.className = 'mini-team-header';
      header.innerHTML =
        '<span class="mini-team-name">' + team.name + '</span>' +
        '<span class="mini-team-div">' + team.division + '</span>';
      card.appendChild(header);

      const form = computeForm(team.matches, 5);
      if (form.length > 0) {
        const formRow = document.createElement('div');
        formRow.className = 'mini-team-form';
        formRow.innerHTML = form
          .map((m) => '<span class="form-badge form-' + m.result.toLowerCase() + '">' + m.result + '</span>')
          .join('');
        card.appendChild(formRow);
      }

      const { last, next } = pickLastAndNext(team.matches);
      [last, next].forEach((match) => {
        if (!match) return;
        const badge = scoreBadge(match);
        const line = document.createElement('div');
        line.className = 'match-line';
        line.innerHTML =
          '<span class="match-date">' + formatDateFR(match.date) + '</span>' +
          '<span class="match-details">' + match.opponent + '</span>' +
          '<span class="score-badge ' + badge.cls + '">' + badge.label + '</span>';
        card.appendChild(line);
      });

      const link = document.createElement('a');
      link.className = 'mini-team-link';
      link.href = './equipe.html?id=' + team.id;
      link.textContent = 'Voir la fiche équipe';
      card.appendChild(link);

      grid.appendChild(card);
    });
  }

  const STANDINGS_LABELS = {
    up: { cls: 'standings-up', label: '▲ Monte', icon: 'fa-arrow-up' },
    maintien: { cls: 'standings-maintien', label: '= Se maintient', icon: 'fa-equals' },
    down: { cls: 'standings-down', label: '▼ Descend', icon: 'fa-arrow-down' }
  };

  function buildStandingsTable(teams) {
    const tbody = document.getElementById('standingsTableBody');
    if (!tbody || !Array.isArray(teams)) return;

    tbody.innerHTML = '';

    teams.forEach((team) => {
      if (!team) return;
      const c = team.classification || {};
      const statusInfo = STANDINGS_LABELS[c.status];
      const rankText = c.rank ? c.rank + (c.totalTeams ? ' / ' + c.totalTeams : '') : '—';

      const row = document.createElement('tr');
      row.innerHTML =
        '<td><strong>' + team.name + '</strong></td>' +
        '<td>' + team.division + '</td>' +
        '<td>' + rankText + '</td>' +
        '<td>' + (statusInfo
          ? '<span class="standings-status ' + statusInfo.cls + '">' + statusInfo.label + '</span>'
          : '—') + '</td>';
      tbody.appendChild(row);
    });
  }

  async function fetchAllTeams() {
    const index = await loadJSON('./data/teams/index.json');
    const teamIds = (index && Array.isArray(index.teamIds)) ? index.teamIds : [];
    const teams = await Promise.all(teamIds.map((id) => loadJSON(`./data/teams/${id}.json`)));
    return teams.filter(Boolean);
  }

  // Applique les interrupteurs "résultats & matchs à venir" et "classement",
  // et charge les fichiers équipes seulement si l'un des deux blocs est présent sur la page.
  async function initTeamsSection(settings) {
    const teamsSection = document.getElementById('teamsSection');
    const standingsSection = document.getElementById('standingsSection');
    if (!teamsSection && !standingsSection) return;

    const showTeams = !settings || settings.showResultsAndUpcomingMatches !== false;
    const showStandings = !!(settings && settings.showStandingsTable === true);

    if (teamsSection) teamsSection.style.display = showTeams ? '' : 'none';
    if (standingsSection) standingsSection.style.display = showStandings ? '' : 'none';

    if (!showTeams && !showStandings) return;

    const teams = await fetchAllTeams();
    if (showTeams) buildTeams(teams);
    if (showStandings) buildStandingsTable(teams);
  }

  /* ---------- Widget "Galerie Photos" (accueil) — 4 photos aléatoires ---------- */

  function shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function buildPhotoGalleryWidget(albums) {
    const widget = document.getElementById('photoGalleryWidget');
    if (!widget) return;

    const allPhotos = [];
    (albums || []).forEach((album) => {
      (album.photos || []).forEach((src) => {
        allPhotos.push({ src, albumId: album.id });
      });
    });

    if (allPhotos.length === 0) {
      widget.innerHTML = '<p style="grid-column:1/-1; color:var(--color-text-muted); font-size:0.85rem;">Aucune photo pour le moment.</p>';
      return;
    }

    const picked = shuffleArray(allPhotos).slice(0, 4);
    widget.innerHTML = picked.map((p) =>
      `<a href="./album.html?id=${p.albumId}" class="photo-item" style="display:block; background-image:url('${p.src}');"></a>`
    ).join('');
  }

  async function initPhotoGalleryWidget() {
    const widget = document.getElementById('photoGalleryWidget');
    if (!widget) return;
    const data = await loadJSON('./data/albums.json');
    buildPhotoGalleryWidget(data ? data.albums : []);
  }

  /* ---------- Liste des albums (albums.html) ---------- */

  function buildAlbumsListPage(albums) {
    const grid = document.getElementById('albumsGrid');
    if (!grid) return;

    if (!albums || albums.length === 0) {
      grid.innerHTML = '<p style="text-align:center; color:var(--color-text-muted); grid-column:1/-1;">Aucun album pour le moment.</p>';
      return;
    }

    const sorted = albums.slice().sort((a, b) => (a.date < b.date ? 1 : -1));

    grid.innerHTML = sorted.map((album) => {
      const cover = (album.photos || [])[0];
      const count = (album.photos || []).length;
      return `
        <a href="./album.html?id=${album.id}" class="album-card">
          <div class="album-card-cover">
            ${cover ? `<img src="${cover}" alt="${album.title}">` : '<i class="fa-solid fa-images"></i>'}
          </div>
          <div class="album-card-content">
            <h3>${album.title}</h3>
            <div class="album-card-meta">
              <span>${formatDateFRLong(album.date)}</span>
              <span class="photo-count">${count} photo${count > 1 ? 's' : ''}</span>
            </div>
          </div>
        </a>
      `;
    }).join('');
  }

  async function initAlbumsListPage() {
    const grid = document.getElementById('albumsGrid');
    if (!grid) return;
    const data = await loadJSON('./data/albums.json');
    buildAlbumsListPage(data ? data.albums : []);
  }

  /* ---------- Détail d'un album (album.html?id=...) + visionneuse ---------- */

  let lightboxPhotos = [];
  let lightboxIndex = 0;

  function openLightbox(photos, index) {
    lightboxPhotos = photos;
    lightboxIndex = index;
    const lightbox = document.getElementById('photoLightbox');
    document.getElementById('photoLightboxImg').src = lightboxPhotos[lightboxIndex];
    lightbox.classList.add('is-open');
  }

  function closeLightbox() {
    document.getElementById('photoLightbox').classList.remove('is-open');
  }

  function showLightboxPhoto(delta) {
    lightboxIndex = (lightboxIndex + delta + lightboxPhotos.length) % lightboxPhotos.length;
    document.getElementById('photoLightboxImg').src = lightboxPhotos[lightboxIndex];
  }

  function setupLightbox() {
    const lightbox = document.getElementById('photoLightbox');
    if (!lightbox) return;

    document.getElementById('photoLightboxClose').addEventListener('click', closeLightbox);
    document.getElementById('photoLightboxPrev').addEventListener('click', () => showLightboxPhoto(-1));
    document.getElementById('photoLightboxNext').addEventListener('click', () => showLightboxPhoto(1));

    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox) closeLightbox();
    });

    document.addEventListener('keydown', (e) => {
      if (!lightbox.classList.contains('is-open')) return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') showLightboxPhoto(-1);
      if (e.key === 'ArrowRight') showLightboxPhoto(1);
    });
  }

  function renderAlbumProfile(album) {
    document.getElementById('albumHeroTitle').textContent = album.title;
    document.getElementById('albumHeroDate').textContent = formatDateFRLong(album.date);

    const descEl = document.getElementById('albumDescriptionText');
    if (album.description) {
      descEl.textContent = album.description;
      descEl.classList.remove('hidden');
    }

    const photos = album.photos || [];
    const photoGrid = document.getElementById('albumPhotoGrid');
    photoGrid.innerHTML = photos.length > 0
      ? photos.map((src, i) => `<img src="${src}" alt="${album.title}" data-index="${i}">`).join('')
      : '<p style="color:var(--color-text-muted); grid-column:1/-1; text-align:center;">Aucune photo dans cet album pour le moment.</p>';

    photoGrid.querySelectorAll('img').forEach((img) => {
      img.addEventListener('click', () => openLightbox(photos, parseInt(img.dataset.index, 10)));
    });

    document.getElementById('albumNotFound').classList.add('hidden');
    document.getElementById('albumPageBody').classList.remove('hidden');
  }

  async function initAlbumProfilePage() {
    const hero = document.getElementById('albumHero');
    if (!hero || !document.getElementById('albumPageBody')) return;

    setupLightbox();

    const params = new URLSearchParams(window.location.search);
    const albumId = params.get('id');

    if (!albumId) {
      document.getElementById('albumNotFound').classList.remove('hidden');
      return;
    }

    const data = await loadJSON('./data/albums.json');
    const album = data && Array.isArray(data.albums)
      ? data.albums.find((a) => a.id === albumId)
      : null;

    if (!album) {
      document.getElementById('albumNotFound').classList.remove('hidden');
      return;
    }

    renderAlbumProfile(album);
  }

  /* ---------- Fiche sponsor individuelle (sponsor.html?id=...) ---------- */

  function renderSponsorProfile(sponsor) {
    document.getElementById('sponsorHeroTitle').textContent = sponsor.name;
    document.getElementById('sponsorLogo').src = sponsor.logo;
    document.getElementById('sponsorLogo').alt = sponsor.name;
    document.getElementById('sponsorName').textContent = sponsor.name;
    document.getElementById('sponsorDescription').textContent =
      sponsor.description || 'Merci à ce partenaire pour son soutien au club !';

    const linkWrap = document.getElementById('sponsorLinkWrap');
    if (sponsor.link) {
      linkWrap.innerHTML =
        `<a href="${sponsor.link}" target="_blank" rel="noopener" class="btn-primary">
          <i class="fa-solid fa-arrow-up-right-from-square"></i> Visiter le site
        </a>`;
    }

    document.getElementById('sponsorNotFound').classList.add('hidden');
    document.getElementById('sponsorCard').classList.remove('hidden');
  }

  async function initSponsorProfilePage() {
    const title = document.getElementById('sponsorHeroTitle');
    if (!title || !document.getElementById('sponsorCard')) return;

    const params = new URLSearchParams(window.location.search);
    const sponsorId = params.get('id');

    if (!sponsorId) {
      document.getElementById('sponsorNotFound').classList.remove('hidden');
      return;
    }

    const data = await loadJSON('./data/sponsors.json');
    const sponsor = data && Array.isArray(data.sponsors)
      ? data.sponsors.find((s) => s.id === sponsorId)
      : null;

    if (!sponsor) {
      document.getElementById('sponsorNotFound').classList.remove('hidden');
      return;
    }

    renderSponsorProfile(sponsor);
  }

  /* ---------- Rappel sponsors en pied de page (toutes pages sauf accueil) ---------- */

  function buildSponsorsFooterReminder(data) {
    const container = document.getElementById('sponsorsFooterReminder');
    if (!container || !data || !Array.isArray(data.sponsors)) return;

    container.innerHTML = data.sponsors.map((s) => `
      <a href="./sponsor.html?id=${s.id}" class="sponsor-reminder-item" title="${s.name}">
        <img src="${s.logo}" alt="${s.name}">
      </a>
    `).join('');
  }

  async function initSponsorsFooterReminder() {
    const container = document.getElementById('sponsorsFooterReminder');
    if (!container) return;
    const data = await loadJSON('./data/sponsors.json');
    buildSponsorsFooterReminder(data);
  }

  /* ---------- Fiche équipe individuelle (equipe.html?id=...) ---------- */

  const HOME_AWAY_LABELS = { true: 'Domicile', false: 'Extérieur' };

  function renderTeamProfile(team) {
    document.getElementById('teamHeroName').textContent = team.name;
    document.getElementById('teamHeroDivision').textContent = team.division || '';

    const photoBlock = document.getElementById('teamPhotoBlock');
    photoBlock.innerHTML = team.photo
      ? `<img src="${team.photo}" alt="Photo de l'équipe ${team.name}">`
      : `<div class="team-photo-placeholder"><i class="fa-solid fa-people-group"></i></div>`;

    document.getElementById('teamDescription').textContent =
      team.description || 'Aucune présentation renseignée pour le moment.';

    const formRow = document.getElementById('teamFormRow');
    const form = computeForm(team.matches, 5);
    formRow.innerHTML = form.length > 0
      ? form.map((m) => '<span class="team-form-badge team-form-' + m.result.toLowerCase() + '">' + m.result + '</span>').join('')
      : '<span style="color:var(--color-text-muted); font-size:0.85rem;">Pas encore de match joué.</span>';

    const playersGrid = document.getElementById('teamPlayersGrid');
    const players = team.players || [];
    playersGrid.innerHTML = players.length > 0
      ? players.map((p) => '<div class="player-chip"><i class="fa-solid fa-user"></i>' + p + '</div>').join('')
      : '<p style="color:var(--color-text-muted); font-size:0.85rem;">Effectif à venir.</p>';

    const calendarBody = document.getElementById('teamCalendarBody');
    const allMatches = (team.matches || []).slice().sort((a, b) => (a.date > b.date ? 1 : -1));
    calendarBody.innerHTML = allMatches.length > 0
      ? allMatches.map((m) => {
          const badge = scoreBadge(m);
          return '<tr>' +
            '<td>' + formatDateFR(m.date) + '</td>' +
            '<td>' + m.opponent + '</td>' +
            '<td><span class="home-away-tag">' + (HOME_AWAY_LABELS[m.home] || '—') + '</span></td>' +
            '<td><span class="score-badge ' + badge.cls + '">' + badge.label + '</span></td>' +
            '</tr>';
        }).join('')
      : '<tr><td colspan="4" style="text-align:center; color:var(--color-text-muted);">Aucun match programmé pour le moment.</td></tr>';

    document.getElementById('teamNotFound').classList.add('hidden');
    document.getElementById('teamPageBody').classList.remove('hidden');
  }

  async function initTeamProfilePage() {
    const hero = document.getElementById('teamHero');
    if (!hero) return;

    const params = new URLSearchParams(window.location.search);
    const teamId = params.get('id');

    if (!teamId) {
      document.getElementById('teamNotFound').classList.remove('hidden');
      return;
    }

    const team = await loadJSON(`./data/teams/${teamId}.json`);
    if (!team) {
      document.getElementById('teamNotFound').classList.remove('hidden');
      return;
    }

    renderTeamProfile(team);
  }

  /* ---------- News (carrousel d'accueil) ---------- */

  function buildNewsSlides(newsData) {
    const track = document.getElementById('newsTrack');
    if (!track || !newsData || !Array.isArray(newsData.news)) return false;

    const items = newsData.news
      .filter((n) => n && n.featured !== false)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    if (items.length === 0) return false;

    track.innerHTML = '';
    items.forEach((item) => {
      const slide = document.createElement('div');
      slide.className = 'news-slide';
      slide.innerHTML =
        '<div class="slide-img" style="background-image: url(\'' + item.image + '\');"></div>' +
        '<div class="slide-content">' +
        '<h3>' + item.title + '</h3>' +
        '<p>' + (item.excerpt || '') + '</p>' +
        '<div><a href="./news-article.html?id=' + item.id + '" class="btn-primary">Lire l\'article complet</a></div>' +
        '</div>';
      track.appendChild(slide);
    });

    return true;
  }

  // Logique du carrousel (swipe, dots, auto-défilement).
  // Reprise à l'identique de l'ancien script, mais exécutée seulement une fois
  // les slides injectées dans le DOM par buildNewsSlides() ci-dessus.
  function initNewsCarousel() {
    const container = document.getElementById('carouselContainer');
    const track = document.getElementById('newsTrack');
    if (!container || !track) return;

    const slides = Array.from(track.children);
    const dotsContainer = document.getElementById('carouselDots');
    let currentIndex = 0;
    let slideInterval;

    let isDragging = false;
    let startPos = 0;
    let currentTranslate = 0;
    let prevTranslate = 0;
    let animationID = 0;

    if (dotsContainer) {
      dotsContainer.innerHTML = '';
      slides.forEach((_, index) => {
        const dot = document.createElement('div');
        dot.classList.add('dot');
        if (index === 0) dot.classList.add('active');
        dot.addEventListener('click', () => {
          goToSlide(index);
          resetAutoSlide();
        });
        dotsContainer.appendChild(dot);
      });
    }

    const dots = dotsContainer ? Array.from(dotsContainer.children) : [];

    function updateDots() {
      dots.forEach((dot, index) => dot.classList.toggle('active', index === currentIndex));
    }

    function setSliderPosition() {
      track.style.transform = `translateX(${currentTranslate}px)`;
    }

    function animation() {
      setSliderPosition();
      if (isDragging) requestAnimationFrame(animation);
    }

    function goToSlide(index) {
      currentIndex = (index + slides.length) % slides.length;
      currentTranslate = currentIndex * -container.offsetWidth;
      prevTranslate = currentTranslate;
      track.style.transition = 'transform 0.4s ease-out';
      setSliderPosition();
      updateDots();
    }

    function nextSlide() {
      goToSlide(currentIndex + 1);
    }

    function startAutoSlide() {
      slideInterval = setInterval(nextSlide, 3500);
    }

    function resetAutoSlide() {
      clearInterval(slideInterval);
      startAutoSlide();
    }

    function getPositionX(event) {
      return event.type.includes('mouse') ? event.clientX : event.touches[0].clientX;
    }

    function touchStart(event) {
      isDragging = true;
      startPos = getPositionX(event);
      animationID = requestAnimationFrame(animation);
      track.style.transition = 'none';
      clearInterval(slideInterval);
    }

    function touchMove(event) {
      if (!isDragging) return;
      const currentPosition = getPositionX(event);
      currentTranslate = prevTranslate + currentPosition - startPos;
    }

    function touchEnd() {
      isDragging = false;
      cancelAnimationFrame(animationID);
      const movedBy = currentTranslate - prevTranslate;

      if (movedBy < -50) goToSlide(currentIndex + 1);
      else if (movedBy > 50) goToSlide(currentIndex - 1);
      else goToSlide(currentIndex);

      resetAutoSlide();
    }

    slides.forEach((slide) => {
      const slideImage = slide.querySelector('.slide-img');
      if (slideImage) slideImage.addEventListener('dragstart', (e) => e.preventDefault());

      slide.addEventListener('touchstart', touchStart);
      slide.addEventListener('touchend', touchEnd);
      slide.addEventListener('touchmove', touchMove);

      slide.addEventListener('mousedown', touchStart);
      slide.addEventListener('mouseup', touchEnd);
      slide.addEventListener('mouseleave', () => isDragging && touchEnd());
      slide.addEventListener('mousemove', touchMove);
    });

    window.addEventListener('resize', () => goToSlide(currentIndex));

    startAutoSlide();
  }

  async function initNews() {
    const newsData = await loadJSON('./data/news.json');
    const built = buildNewsSlides(newsData);
    if (built) initNewsCarousel();
  }

  /* ---------- Page article complète (news-article.html?id=...) ---------- */

  function formatDateFRLong(isoDate) {
    if (!isoDate) return '';
    const [y, m, d] = isoDate.split('-');
    const mois = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
    return `${parseInt(d, 10)} ${mois[parseInt(m, 10) - 1]} ${y}`;
  }

  async function renderNewsArticle(item) {
    document.getElementById('articleTitle').textContent = item.title;
    document.getElementById('articleDate').textContent = formatDateFRLong(item.date);

    const coverEl = document.getElementById('articleCover');
    if (item.image) {
      coverEl.innerHTML = `<img src="${item.image}" alt="${item.title}">`;
    }

    document.getElementById('articleBody').innerHTML = item.body || '<p>' + (item.excerpt || '') + '</p>';

    const albumWrap = document.getElementById('articleAlbumWrap');
    if (item.albumId) {
      const albumsData = await loadJSON('./data/albums.json');
      const album = albumsData && Array.isArray(albumsData.albums)
        ? albumsData.albums.find((a) => a.id === item.albumId)
        : null;

      if (album && Array.isArray(album.photos) && album.photos.length > 0) {
        albumWrap.innerHTML =
          '<h2 style="color:var(--color-navy); margin-bottom:1rem;"><i class="fa-solid fa-images" style="color:var(--color-gold);"></i> ' + album.title + '</h2>' +
          '<div class="article-album-grid">' +
          album.photos.map((src) => `<img src="${src}" alt="${album.title}">`).join('') +
          '</div>' +
          '<div style="text-align:center; margin-top:1.2rem;">' +
          '<a href="./album.html?id=' + album.id + '" class="btn-primary"><i class="fa-solid fa-up-right-and-down-left-from-center"></i> Voir l\'album complet</a>' +
          '</div>';
      }
    }

    document.getElementById('articleNotFound').classList.add('hidden');
    document.getElementById('articlePageBody').classList.remove('hidden');
  }

  async function initNewsArticlePage() {
    const hero = document.getElementById('articleHero');
    if (!hero) return;

    const params = new URLSearchParams(window.location.search);
    const newsId = params.get('id');

    if (!newsId) {
      document.getElementById('articleNotFound').classList.remove('hidden');
      return;
    }

    const newsData = await loadJSON('./data/news.json');
    const item = newsData && Array.isArray(newsData.news)
      ? newsData.news.find((n) => n.id === newsId)
      : null;

    if (!item) {
      document.getElementById('articleNotFound').classList.remove('hidden');
      return;
    }

    await renderNewsArticle(item);
  }

  /* ---------- Page liste des news par saison (news.html) ---------- */

  function seasonSortKey(season) {
    const match = (season || '').match(/(\d{4})/);
    return match ? parseInt(match[1], 10) : 0;
  }

  function buildNewsListPage(newsArray) {
    const container = document.getElementById('newsListContainer');
    const filtersEl = document.getElementById('newsSeasonFilters');
    if (!container) return;

    if (!newsArray || newsArray.length === 0) {
      if (filtersEl) filtersEl.innerHTML = '';
      container.innerHTML = '<p class="empty-list-msg" style="text-align:center; padding:2rem; color:var(--color-text-muted);">Aucune actualité pour le moment.</p>';
      return;
    }

    const bySeason = {};
    newsArray.forEach((item) => {
      const season = item.season || 'Non classé';
      if (!bySeason[season]) bySeason[season] = [];
      bySeason[season].push(item);
    });

    const seasons = Object.keys(bySeason).sort((a, b) => seasonSortKey(b) - seasonSortKey(a));

    // Boutons de filtre : "Toutes les saisons" (sélectionné par défaut) + une par saison
    if (filtersEl) {
      const allBtn = '<button type="button" class="season-filter-btn is-active" data-season="">Toutes les saisons</button>';
      const seasonBtns = seasons.map((s) => `<button type="button" class="season-filter-btn" data-season="${s}">${s}</button>`).join('');
      filtersEl.innerHTML = allBtn + seasonBtns;

      filtersEl.querySelectorAll('.season-filter-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          filtersEl.querySelectorAll('.season-filter-btn').forEach((b) => b.classList.remove('is-active'));
          btn.classList.add('is-active');
          const selected = btn.dataset.season;
          container.querySelectorAll('.news-season-block').forEach((block) => {
            block.style.display = (!selected || block.dataset.season === selected) ? '' : 'none';
          });
        });
      });
    }

    container.innerHTML = seasons.map((season) => {
      const items = bySeason[season].slice().sort((a, b) => (a.date < b.date ? 1 : -1));
      const cards = items.map((item) => `
        <a href="./news-article.html?id=${item.id}" class="news-list-card">
          <div class="news-list-card-img">
            ${item.image ? `<img src="${item.image}" alt="${item.title}">` : ''}
          </div>
          <div class="news-list-card-content">
            <h3>${item.title}</h3>
            <p>${item.excerpt || ''}</p>
            <span class="news-list-card-date">${formatDateFRLong(item.date)}</span>
          </div>
        </a>
      `).join('');

      return `
        <div class="news-season-block" data-season="${season}">
          <h2 class="news-season-title"><i class="fa-solid fa-calendar-days"></i> Saison ${season}</h2>
          <div class="news-list-grid">${cards}</div>
        </div>
      `;
    }).join('');
  }

  async function initNewsListPage() {
    const container = document.getElementById('newsListContainer');
    if (!container) return;

    const newsData = await loadJSON('./data/news.json');
    buildNewsListPage(newsData ? newsData.news : []);
  }

  async function initLinks() {
    const container = document.getElementById('linksContainer');
    if (!container) return;
    const data = await loadJSON('./data/liens-utiles.json');
    buildLinks(data);
  }

  /* ---------- Initialisation ---------- */

  async function init() {
    const [config, nav, sponsors, documents, homepageSettings] = await Promise.all([
      loadJSON('./data/site-config.json'),
      loadJSON('./data/navigation.json'),
      loadJSON('./data/sponsors.json'),
      loadJSON('./data/documents.json'),
      loadJSON('./data/homepage-settings.json')
    ]);

    applySeason(config);
    applyCalendarEmbed(config);
    applySocialLinks(config);
    buildNavigation(nav);
    buildSponsors(sponsors);
    buildDocuments(documents);
    initLinks();
    initTeamsSection(homepageSettings);
    initNews();
    initTeamProfilePage();
    initNewsArticlePage();
    initNewsListPage();
    initSponsorProfilePage();
    initSponsorsFooterReminder();
    initAlbumsListPage();
    initAlbumProfilePage();
    initPhotoGalleryWidget();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

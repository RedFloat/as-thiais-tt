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

      if (sponsor.link) {
        const link = document.createElement('a');
        link.href = sponsor.link;
        link.target = '_blank';
        link.rel = 'noopener';
        link.style.display = 'contents';
        link.appendChild(img);
        item.appendChild(link);
      } else {
        item.appendChild(img);
      }

      mosaic.appendChild(item);
    });

    // Logo mis en avant, en rotation toutes les 3 secondes
    if (featured && sponsors.length > 0) {
      let index = 0;
      const showSponsor = (i) => {
        featured.src = sponsors[i].logo;
        featured.alt = sponsors[i].name || '';
        featured.style.display = '';
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

  /* ---------- Embed calendrier ---------- */

  function applyCalendarEmbed(config) {
    const iframe = document.getElementById('calendarEmbed');
    if (!iframe || !config || !config.calendarEmbedUrl) return;
    iframe.src = config.calendarEmbedUrl;
  }

  /* ---------- Équipes / matchs ---------- */

  function scoreBadge(match) {
    if (match.status === 'upcoming') {
      return { cls: 'status-upcoming', label: 'À venir' };
    }
    const scoreText = match.score ? ' ' + match.score : '';
    if (match.result === 'V') return { cls: 'score-win', label: 'V' + scoreText };
    if (match.result === 'D') return { cls: 'score-loss', label: 'D' + scoreText };
    if (match.result === 'N') return { cls: 'score-draw', label: 'N' + scoreText };
    return { cls: 'status-upcoming', label: scoreText.trim() || '—' };
  }

  function buildTeams(teams) {
    const grid = document.getElementById('teamsGrid');
    if (!grid || !Array.isArray(teams)) return;

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

      (team.matches || []).forEach((match) => {
        const badge = scoreBadge(match);
        const line = document.createElement('div');
        line.className = 'match-line';
        line.innerHTML =
          '<span class="match-date">' + match.date + '</span>' +
          '<span class="match-details">' + match.opponent + '</span>' +
          '<span class="score-badge ' + badge.cls + '">' + badge.label + '</span>';
        card.appendChild(line);
      });

      grid.appendChild(card);
    });
  }

  // Applique l'interrupteur "afficher/masquer le bloc résultats & matchs à venir"
  // et charge les 12 fichiers équipes seulement si le bloc est présent sur la page.
  async function initTeamsSection(settings) {
    const section = document.getElementById('teamsSection');
    if (!section) return;

    if (settings && settings.showResultsAndUpcomingMatches === false) {
      section.style.display = 'none';
      return;
    }

    section.style.display = '';

    const teamIds = Array.from({ length: 12 }, (_, i) => `equipe-${i + 1}`);
    const teams = await Promise.all(
      teamIds.map((id) => loadJSON(`./data/teams/${id}.json`))
    );
    buildTeams(teams.filter(Boolean));
  }

  /* ---------- News (carrousel d'accueil) ---------- */

  function buildNewsSlides(newsData) {
    const track = document.getElementById('newsTrack');
    if (!track || !newsData || !Array.isArray(newsData.news)) return false;

    const items = newsData.news.filter((n) => n && n.featured !== false);
    if (items.length === 0) return false;

    track.innerHTML = '';
    items.forEach((item) => {
      const slide = document.createElement('div');
      slide.className = 'news-slide';
      slide.innerHTML =
        '<div class="slide-img" style="background-image: url(\'' + item.image + '\');"></div>' +
        '<div class="slide-content">' +
        '<div class="slide-tag"><span class="badge-gold">' + (item.tag || '') + '</span></div>' +
        '<h3>' + item.title + '</h3>' +
        '<p>' + item.text + '</p>' +
        '<div><a href="' + (item.buttonLink || '#') + '" class="btn-primary">' +
        (item.buttonLabel || 'Lire la suite') + '</a></div>' +
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
    buildNavigation(nav);
    buildSponsors(sponsors);
    buildDocuments(documents);
    initTeamsSection(homepageSettings);
    initNews();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

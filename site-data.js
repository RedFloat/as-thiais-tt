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

  /* ---------- Initialisation ---------- */

  async function init() {
    const [config, nav] = await Promise.all([
      loadJSON('./data/site-config.json'),
      loadJSON('./data/navigation.json')
    ]);

    applySeason(config);
    buildNavigation(nav);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

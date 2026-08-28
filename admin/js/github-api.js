/* ==========================================================================
   GITHUB-API.JS — AS Thiais Tennis de Table — Espace Admin
   Petit client pour lire et écrire des fichiers JSON dans le dépôt GitHub
   via l'API REST officielle (https://api.github.com), directement depuis
   le navigateur. Aucune dépendance, aucun serveur intermédiaire.
   ========================================================================== */

const GitHubAPI = (function () {
  'use strict';

  /* ---------- Encodage / décodage UTF-8 <-> Base64 ---------- */
  // btoa()/atob() natifs ne gèrent pas l'UTF-8 (accents) correctement,
  // d'où ce petit détour classique.

  function utf8ToBase64(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }

  function base64ToUtf8(b64) {
    return decodeURIComponent(escape(atob(b64.replace(/\n/g, ''))));
  }

  function authHeaders(token) {
    return {
      Authorization: 'token ' + token,
      Accept: 'application/vnd.github+json'
    };
  }

  function apiUrl(cfg, path) {
    return `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${path}`;
  }

  async function parseError(res) {
    let message = res.status + ' ' + res.statusText;
    try {
      const data = await res.json();
      if (data && data.message) message += ' — ' + data.message;
    } catch (e) {
      /* réponse non-JSON, on garde le message par défaut */
    }
    return message;
  }

  /* ---------- Vérifie que le token + dépôt sont valides ---------- */

  async function testConnection(cfg) {
    const res = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}`, {
      headers: authHeaders(cfg.token)
    });
    if (!res.ok) {
      throw new Error('Connexion impossible : ' + (await parseError(res)));
    }
    return res.json();
  }

  /* ---------- Lecture d'un fichier JSON ---------- */
  // Retourne { json, sha } — le "sha" est indispensable pour pouvoir
  // ensuite réécrire ce même fichier (GitHub s'en sert pour éviter les
  // écrasements accidentels de versions concurrentes).

  async function getJSON(cfg, path) {
    const url = apiUrl(cfg, path) + `?ref=${encodeURIComponent(cfg.branch)}&t=${Date.now()}`;
    const res = await fetch(url, { headers: authHeaders(cfg.token) });
    if (!res.ok) {
      throw new Error(`Lecture de "${path}" impossible : ` + (await parseError(res)));
    }
    const data = await res.json();
    const content = base64ToUtf8(data.content);
    return { json: JSON.parse(content), sha: data.sha };
  }

  /* ---------- Écriture (création ou mise à jour) d'un fichier JSON ---------- */

  async function saveJSON(cfg, path, value, sha, message) {
    const body = {
      message: message || `Admin AS Thiais TT : mise à jour de ${path}`,
      content: utf8ToBase64(JSON.stringify(value, null, 2)),
      branch: cfg.branch
    };
    if (sha) body.sha = sha;

    const res = await fetch(apiUrl(cfg, path), {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders(cfg.token)),
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      throw new Error(`Écriture de "${path}" impossible : ` + (await parseError(res)));
    }
    return res.json();
  }

  /* ---------- Upload d'un fichier binaire (ex : photo d'équipe) ---------- */

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
      reader.readAsDataURL(file);
    });
  }

  async function uploadFile(cfg, path, file, message) {
    const base64Content = await fileToBase64(file);

    // On récupère le sha si un fichier existe déjà à cet emplacement (remplacement)
    let sha;
    try {
      const existing = await fetch(apiUrl(cfg, path) + `?ref=${encodeURIComponent(cfg.branch)}`, {
        headers: authHeaders(cfg.token)
      });
      if (existing.ok) {
        const data = await existing.json();
        sha = data.sha;
      }
    } catch (e) {
      /* le fichier n'existe pas encore, ce n'est pas un problème */
    }

    const body = {
      message: message || `Admin AS Thiais TT : upload de ${path}`,
      content: base64Content,
      branch: cfg.branch
    };
    if (sha) body.sha = sha;

    const res = await fetch(apiUrl(cfg, path), {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders(cfg.token)),
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      throw new Error(`Envoi du fichier "${path}" impossible : ` + (await parseError(res)));
    }
    return res.json();
  }

  /* ---------- Suppression d'un fichier ---------- */

  async function deleteFile(cfg, path, sha, message) {
    const res = await fetch(apiUrl(cfg, path), {
      method: 'DELETE',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders(cfg.token)),
      body: JSON.stringify({
        message: message || `Admin AS Thiais TT : suppression de ${path}`,
        sha,
        branch: cfg.branch
      })
    });

    if (!res.ok) {
      throw new Error(`Suppression de "${path}" impossible : ` + (await parseError(res)));
    }
    return res.json();
  }

  /* ---------- Métadonnées d'un fichier (sha), sans parser le contenu ---------- */
  // Utile pour supprimer une image ou tout autre fichier non-JSON.

  async function getFileMeta(cfg, path) {
    const url = apiUrl(cfg, path) + `?ref=${encodeURIComponent(cfg.branch)}&t=${Date.now()}`;
    const res = await fetch(url, { headers: authHeaders(cfg.token) });
    if (!res.ok) {
      throw new Error(`Fichier introuvable "${path}" : ` + (await parseError(res)));
    }
    return res.json();
  }

  /* ---------- Liste de tous les fichiers du dépôt, en un seul appel ---------- */
  // Utile pour retrouver des fichiers déjà envoyés sur GitHub par un autre biais que l'admin.

  async function getFullTree(cfg) {
    const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/git/trees/${encodeURIComponent(cfg.branch)}?recursive=1&t=${Date.now()}`;
    const res = await fetch(url, { headers: authHeaders(cfg.token) });
    if (!res.ok) {
      throw new Error('Impossible de lister les fichiers du dépôt : ' + (await parseError(res)));
    }
    const data = await res.json();
    return (data.tree || []).filter((entry) => entry.type === 'blob').map((entry) => entry.path);
  }

  return { testConnection, getJSON, saveJSON, uploadFile, deleteFile, getFileMeta, getFullTree, utf8ToBase64, base64ToUtf8 };
})();

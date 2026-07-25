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

  return { testConnection, getJSON, saveJSON, utf8ToBase64, base64ToUtf8 };
})();

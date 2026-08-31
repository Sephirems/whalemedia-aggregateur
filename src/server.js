import { chargerConfig } from './config.js';
chargerConfig();

/**
 * Serveur du MVP : sert l'interface et l'API d'agrégation.
 *   npm start            → http://localhost:3000
 *   PORT=8080 npm start  → autre port
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { agreger } from './aggregate.js';
import { rechercher } from './recherche.js';
import { resumer, etatResumeIA } from './resume.js';
import { SITES } from './sources.js';

/**
 * N'accepte que les articles des six sites du réseau : sans ce garde-fou,
 * l'endpoint deviendrait un proxy capable d'aller chercher n'importe quelle
 * URL depuis le serveur.
 */
function urlAutorisee(brut) {
  try {
    const url = new URL(brut);
    if (url.protocol !== 'https:') return null;
    const connus = SITES.map((site) => new URL(site.home).hostname);
    return connus.includes(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(RACINE, 'public');
const PORT = Number(process.env.PORT) || 3000;

const TYPES_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

function envoyerJson(reponse, statut, donnees) {
  const corps = JSON.stringify(donnees);
  reponse.writeHead(statut, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(corps),
    'Cache-Control': 'no-store',
  });
  reponse.end(corps);
}

/** Sert un fichier de public/, en refusant toute sortie du dossier. */
async function servirFichier(reponse, cheminDemande) {
  const relatif = cheminDemande === '/' ? '/index.html' : cheminDemande;
  const absolu = path.join(PUBLIC, path.normalize(relatif).replace(/^([/\\])+/, ''));

  if (!absolu.startsWith(PUBLIC)) {
    reponse.writeHead(403).end('Accès refusé');
    return;
  }

  try {
    const contenu = await readFile(absolu);
    reponse.writeHead(200, {
      'Content-Type': TYPES_MIME[path.extname(absolu).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': contenu.length,
    });
    reponse.end(contenu);
  } catch {
    reponse.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    reponse.end('Page introuvable');
  }
}

const serveur = createServer(async (requete, reponse) => {
  const url = new URL(requete.url, `http://${requete.headers.host ?? 'localhost'}`);

  if (url.pathname === '/api/articles') {
    try {
      const donnees = await agreger({ forcer: url.searchParams.get('force') === '1' });
      envoyerJson(reponse, 200, donnees);
    } catch (erreur) {
      console.error('Échec de l’agrégation :', erreur);
      envoyerJson(reponse, 500, { erreur: "L'agrégation a échoué.", detail: erreur.message });
    }
    return;
  }

  if (url.pathname === '/api/recherche') {
    try {
      const donnees = await rechercher(url.searchParams.get('q'), {
        forcer: url.searchParams.get('force') === '1',
      });
      envoyerJson(reponse, 200, donnees);
    } catch (erreur) {
      console.error('Échec de la recherche :', erreur);
      envoyerJson(reponse, 500, { erreur: 'La recherche a échoué.', detail: erreur.message });
    }
    return;
  }

  if (url.pathname === '/api/resume') {
    const cible = urlAutorisee(url.searchParams.get('url'));
    if (!cible) {
      envoyerJson(reponse, 400, {
        erreur: 'Adresse absente ou hors du réseau WhaleMedia.',
      });
      return;
    }

    try {
      envoyerJson(reponse, 200, await resumer(cible));
    } catch (erreur) {
      console.error('Échec du résumé :', erreur);
      envoyerJson(reponse, 500, { erreur: 'Le résumé a échoué.', detail: erreur.message });
    }
    return;
  }

  // Permet à l'interface d'annoncer quel fournisseur de résumé est actif.
  if (url.pathname === '/api/config') {
    envoyerJson(reponse, 200, await etatResumeIA());
    return;
  }

  await servirFichier(reponse, url.pathname);
});

serveur.listen(PORT, () => {
  console.log(`Agrégateur WhaleMedia — http://localhost:${PORT}`);
  console.log('Ctrl+C pour arrêter.');
});

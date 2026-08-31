/**
 * Couche réseau : récupération HTTP avec cache disque.
 *
 * Un cycle complet représente environ 2,5 Mo (les flux embarquent l'article
 * entier dans content:encoded). Le cache évite de refaire ce trafic à chaque
 * affichage de la page.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER_CACHE = path.join(RACINE, '.cache');

const AGENT =
  'WhaleMediaAggregator/0.1 (+agrégateur interne ; contact cloixremy@hotmail.com)';

// Le cache périmé sert de filet, donc mieux vaut abandonner tôt que faire
// patienter : 20 s pour les flux, plus long pour la recherche (voir recherche.js).
const DELAI_MS = 20000;

/** Erreur réseau porteuse du code HTTP, pour distinguer un 404 attendu. */
export class ErreurHttp extends Error {
  constructor(message, statut) {
    super(message);
    this.name = 'ErreurHttp';
    this.statut = statut;
  }
}

function cheminCache(url) {
  const empreinte = createHash('sha1').update(url).digest('hex').slice(0, 16);
  return path.join(DOSSIER_CACHE, `${empreinte}.json`);
}

async function lireCache(url) {
  try {
    const brut = await readFile(cheminCache(url), 'utf8');
    const entree = JSON.parse(brut);
    if (typeof entree?.horodatage !== 'number') return null;
    return entree;
  } catch {
    return null;
  }
}

async function ecrireCache(url, corps) {
  try {
    await mkdir(DOSSIER_CACHE, { recursive: true });
    await writeFile(
      cheminCache(url),
      JSON.stringify({ url, horodatage: Date.now(), corps }),
      'utf8'
    );
  } catch {
    // Un cache non inscriptible ne doit pas faire échouer la récupération.
  }
}

/** Rafraîchissements déjà lancés, pour ne pas les dupliquer. */
const enCours = new Set();

/** Recharge une URL en tâche de fond, sans faire attendre l'appelant. */
function rafraichirEnFond(url, delaiMs) {
  if (enCours.has(url)) return;
  enCours.add(url);

  telecharger(url, delaiMs)
    .then((corps) => ecrireCache(url, corps))
    .catch(() => {
      // Le cache existant reste valable : un échec de fond ne casse rien.
    })
    .finally(() => enCours.delete(url));
}

async function telecharger(url, delaiMs) {
  const reponse = await fetch(url, {
    signal: AbortSignal.timeout(delaiMs),
    redirect: 'follow',
    headers: {
      'User-Agent': AGENT,
      Accept: 'application/rss+xml, application/xml, application/json;q=0.9, */*;q=0.8',
      'Accept-Language': 'fr-FR,fr;q=0.9',
    },
  });

  if (!reponse.ok) {
    throw new ErreurHttp(`HTTP ${reponse.status} sur ${url}`, reponse.status);
  }

  return reponse.text();
}

/**
 * Récupère une URL en passant par le cache disque.
 *
 * Le cache sert trois rôles :
 *  1. éviter le trafic inutile tant qu'il est frais ;
 *  2. répondre immédiatement même quand il a expiré, en se rafraîchissant en
 *     arrière-plan pour la fois suivante ;
 *  3. servir de filet quand le site ne répond plus.
 *
 * Le point 2 est ce qui rend l'affichage instantané. Sans lui, la moindre
 * entrée expirée fait attendre l'utilisateur le temps d'une requête distante —
 * jusqu'à 20 s sur les endpoints non mis en cache par les sites.
 *
 * @returns {Promise<{corps: string, depuisCache: boolean, perime: boolean}>}
 */
export async function recuperer(url, { dureeVieMs, forcer = false, delaiMs = DELAI_MS } = {}) {
  const cache = await lireCache(url);
  const frais = cache && Date.now() - cache.horodatage <= dureeVieMs;

  if (cache && !forcer) {
    if (frais) return { corps: cache.corps, depuisCache: true, perime: false };

    // Expiré mais exploitable : on répond tout de suite et on recharge derrière.
    rafraichirEnFond(url, delaiMs);
    return { corps: cache.corps, depuisCache: true, perime: true };
  }

  try {
    const corps = await telecharger(url, delaiMs);
    await ecrireCache(url, corps);
    return { corps, depuisCache: false, perime: false };
  } catch (cause) {
    // Un 404 est une réponse, pas une panne : il ne doit pas ressusciter
    // un cache périmé (cas de /tests/feed/ sur selectos).
    if (cause instanceof ErreurHttp && cause.statut === 404) throw cause;

    if (cache) {
      return { corps: cache.corps, depuisCache: true, perime: true };
    }

    if (cause instanceof ErreurHttp) throw cause;
    throw new ErreurHttp(`Requête impossible vers ${url} : ${cause.message}`, 0);
  }
}

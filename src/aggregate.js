/**
 * Agrégation : interroge chaque source, fusionne, trie et retient les N
 * articles les plus récents par site.
 */

import { ARTICLES_PAR_SITE, CACHE_TTL_MS, SITES } from './sources.js';
import { ErreurHttp, recuperer } from './http.js';
import { extraireDateModifiee, extraireOgImage } from './html.js';
import { lireFluxRss } from './rss.js';
import { construireUrlRest, lireReponseRest } from './wp-rest.js';

/** Un même article ne doit apparaître qu'une fois, même s'il est dans 2 flux. */
function cleDeDoublon(article) {
  return article.url.replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
}

/** Tri antéchronologique ; les articles sans date passent en dernier. */
function parDateDecroissante(a, b) {
  if (!a.date && !b.date) return 0;
  if (!a.date) return 1;
  if (!b.date) return -1;
  return new Date(b.date) - new Date(a.date);
}

async function interrogerEndpoint(site, endpoint, options) {
  const contexte = {
    site: site.id,
    siteNom: site.name,
    type: endpoint.type,
    source: endpoint.kind,
  };

  if (endpoint.kind === 'rest') {
    // On demande une marge : certains sites intercalent des pièces jointes.
    const url = construireUrlRest(endpoint.url, Math.max(ARTICLES_PAR_SITE * 2, 6));
    const { corps, depuisCache } = await recuperer(url, options);
    return { articles: lireReponseRest(JSON.parse(corps), contexte), depuisCache };
  }

  const { corps, depuisCache } = await recuperer(endpoint.url, options);
  return { articles: lireFluxRss(corps, contexte), depuisCache };
}

/**
 * Remplace la vignette des articles issus du RSS par l'image de
 * prévisualisation officielle du site.
 *
 * Les flux RSS ne transportent aucune image structurée : la seule chose qu'on
 * puisse en tirer est la première illustration du corps de l'article, qui n'est
 * pas la vignette affichée par le site. Celle-ci est l'image à la une, publiée
 * dans le <head> de l'article sous forme d'og:image.
 *
 * On ne paie ce coût que pour les articles réellement retenus (3 par site), et
 * le résultat passe par le même cache disque que le reste.
 */
async function enrichirVignettes(articles, options) {
  await Promise.all(
    articles
      .filter((article) => article.source === 'rss')
      .map(async (article) => {
        try {
          const { corps } = await recuperer(article.url, options);

          const officielle = extraireOgImage(corps);
          if (officielle) {
            article.image = officielle;
            article.imageOfficielle = true;
          }

          // Même page, même requête : on en profite pour lire la date de
          // dernière modification, absente des flux RSS.
          article.modifie = extraireDateModifiee(corps) ?? article.date;
        } catch {
          // Page inaccessible : on conserve l'image de repli déjà extraite.
        }
      })
  );
}

/** Récupère et normalise le contenu d'un site. */
async function traiterSite(site, options) {
  const articles = [];
  const avertissements = [];
  let toutEnCache = true;
  let donneesPerimees = false;

  const principaux = site.endpoints.filter((endpoint) => !endpoint.secours);
  const secours = site.endpoints.filter((endpoint) => endpoint.secours);

  const interroger = async (endpoint) => {
    try {
      const resultat = await interrogerEndpoint(site, endpoint, options);
      if (!resultat.depuisCache) toutEnCache = false;
      if (resultat.perime) donneesPerimees = true;
      return resultat.articles;
    } catch (erreur) {
      // Un 404 sur une source facultative est un cas de figure connu
      // (selectos.eu n'a pas de /tests/feed/), pas une panne.
      const attendu = erreur instanceof ErreurHttp && erreur.statut === 404;
      avertissements.push({ endpoint: endpoint.url, message: erreur.message, attendu });
      toutEnCache = false;
      return null;
    }
  };

  // En parallèle : un endpoint lent ne doit pas retarder les autres. L'ordre
  // de déclaration est conservé, car il fixe la priorité en cas de doublon.
  const lots = await Promise.all(principaux.map(interroger));
  for (const lot of lots) if (lot) articles.push(...lot);

  // Les sources de secours ne partent que si les sources principales
  // n'ont rien rapporté.
  if (articles.length === 0) {
    for (const endpoint of secours) {
      const lot = await interroger(endpoint);
      if (lot) articles.push(...lot);
      if (articles.length > 0) {
        avertissements.push({
          endpoint: endpoint.url,
          message: 'Source principale indisponible : contenu repris depuis la source de secours.',
          attendu: false,
          secours: true,
        });
        break;
      }
    }
  }

  const uniques = new Map();
  for (const article of articles) {
    const cle = cleDeDoublon(article);
    if (!uniques.has(cle)) uniques.set(cle, article);
  }

  const retenus = [...uniques.values()]
    .sort(parDateDecroissante)
    .slice(0, ARTICLES_PAR_SITE);

  await enrichirVignettes(retenus, options);

  return {
    id: site.id,
    nom: site.name,
    accueil: site.home,
    logo: site.logo ?? null,
    logoRatio: site.logoRatio ?? null,
    articles: retenus,
    total: uniques.size,
    avertissements,
    depuisCache: toutEnCache,
    // Vrai quand au moins une source n'a pu être rafraîchie et que le contenu
    // provient d'un cache expiré.
    perime: donneesPerimees,
    // Le site est en échec seulement si aucune source n'a rien donné.
    enEchec: retenus.length === 0,
  };
}

/**
 * Agrège les six sites en parallèle.
 * @param {{forcer?: boolean}} options
 */
export async function agreger({ forcer = false } = {}) {
  const options = { dureeVieMs: CACHE_TTL_MS, forcer };

  const sites = await Promise.all(
    SITES.map(async (site) => {
      try {
        return await traiterSite(site, options);
      } catch (erreur) {
        return {
          id: site.id,
          nom: site.name,
          accueil: site.home,
          logo: site.logo ?? null,
          logoRatio: site.logoRatio ?? null,
          articles: [],
          total: 0,
          avertissements: [{ endpoint: site.home, message: erreur.message, attendu: false }],
          depuisCache: false,
          enEchec: true,
        };
      }
    })
  );

  const tous = sites.flatMap((site) => site.articles).sort(parDateDecroissante);

  return {
    genereLe: new Date().toISOString(),
    articlesParSite: ARTICLES_PAR_SITE,
    nombreArticles: tous.length,
    sites,
    articles: tous,
  };
}

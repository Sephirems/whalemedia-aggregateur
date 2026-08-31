/**
 * Recherche fédérée sur les six sites.
 *
 * Pourquoi interroger les sites en direct plutôt que chercher dans les 18
 * articles agrégés : l'agrégateur n'affiche que les 3 derniers par site, alors
 * que la question « a-t-on déjà écrit là-dessus ? » porte sur tout le catalogue
 * (environ 900 URLs).
 *
 * Pourquoi la recherche native `?s=` plutôt qu'un index local :
 *  - elle couvre à la fois les `post` et le CPT `tests`, contrairement à la
 *    REST API qui ignore le second ;
 *  - les archives `/tests/` ne sont pas paginables (page/2, page/6 et page/9
 *    renvoient toutes les 24 mêmes cartes), donc le catalogue des tests n'est
 *    pas récupérable autrement avec ses titres ;
 *  - elle reste juste sans index à reconstruire ni à laisser vieillir.
 *
 * Chaque site annonce son total réel (« 58 sélections trouvées ») tout en
 * n'affichant que les 10 premiers résultats : on restitue les deux.
 */

import { SITES } from './sources.js';
import { recuperer } from './http.js';
import { decoderEntites, retirerBalises } from './html.js';

/**
 * Les résultats de recherche évoluent lentement, et la page `?s=` est la plus
 * coûteuse du site : non mise en cache par LiteSpeed, elle répond en 9 s à
 * chaud et tombe carrément sous charge. On la garde donc bien plus longtemps
 * que les flux, et on laisse davantage de temps à chaque requête.
 */
const CACHE_RECHERCHE_MS = 6 * 60 * 60 * 1000;
const DELAI_RECHERCHE_MS = 30000;

/** Nombre total d'articles correspondants, annoncé par la page de résultats. */
function lireTotal(html) {
  const trouve = html.match(/([0-9]+)\s*s[ée]lections?\s+trouv[ée]es?/i);
  return trouve ? Number(trouve[1]) : null;
}

const MOTS_OUTILS = new Set(['le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'a', 'au', 'aux', 'et', 'ou', 'en', 'pour', 'sur', 'avec']);

/** Minuscules sans accents, pour comparer « café » et « Cafe ». */
function normaliser(texte = '') {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Mots significatifs d'une requête, hors mots outils. */
function motsSignificatifs(requete) {
  return normaliser(requete)
    .split(/[^a-z0-9]+/)
    .filter((mot) => mot.length > 2 && !MOTS_OUTILS.has(mot));
}

/**
 * Qualifie la pertinence d'un résultat.
 *
 * WordPress cherche dans le corps entier de l'article : « café » remonte 103
 * résultats sur lavelab, qui sont tous des tests d'aspirateurs mentionnant
 * « tache de café ». Le seul signal fiable pour distinguer un article
 * *consacré* au sujet d'une simple mention est la présence des termes dans le
 * titre.
 *
 * @returns {'titre'|'contenu'}
 */
function evaluerPertinence(titre, mots) {
  if (mots.length === 0) return 'titre';
  const titreNormalise = normaliser(titre);
  return mots.every((mot) => titreNormalise.includes(mot)) ? 'titre' : 'contenu';
}

/** Extrait les résultats d'une page de recherche WordPress. */
function lireResultats(html, site, mots) {
  const resultats = [];

  for (const bloc of html.split('homepage-post-card').slice(1)) {
    const lien = bloc.match(
      /<a[^>]*class="post-card-title-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i
    );
    if (!lien) continue;

    const titre = retirerBalises(lien[2]);
    if (!titre) continue;

    const image = bloc.match(/<img[^>]+src="([^"]+)"/i);

    resultats.push({
      site: site.id,
      siteNom: site.name,
      titre,
      url: decoderEntites(lien[1]),
      image: image ? decoderEntites(image[1]).replace(/^http:\/\//i, 'https://') : null,
      // Le CPT « tests » vit sous /tests/ ; tout le reste est un comparatif.
      type: /\/tests\//.test(lien[1]) ? 'Test' : 'Comparatif',
      pertinence: evaluerPertinence(titre, mots),
    });
  }

  return resultats;
}

/** WordPress affiche 10 résultats par page de recherche. */
const PAR_PAGE = 10;

/** Garde-fou : on ne descend jamais plus loin, même si la veine continue. */
const PAGES_MAX = 8;

/** Pages récupérées de front après la première. */
const LOT = 3;

/**
 * Parcourt les pages de résultats d'un site jusqu'à épuisement des articles
 * pertinents, et ne retient que ceux-là.
 *
 * WordPress trie par pertinence, et la décroissance est nette et monotone.
 * Relevé sur « café » :
 *
 *   Selectos     page 1 : 7/10   page 2 : 0/10   → arrêt
 *   Lavelab      page 1 : 0/10                   → arrêt immédiat
 *   Coffealover  page 1 : 10/10  page 2 : 5/10   page 3 : 0/10 → arrêt
 *
 * S'arrêter à la première page sans article pertinent donne donc l'ensemble
 * complet des articles sur le sujet, sans parcourir les pages de bruit : les
 * 103 correspondances de Lavelab, toutes des mentions, coûtent une requête au
 * lieu de onze.
 */
async function chercherSurUnSite(site, requete, mots, options) {
  const requeteUrl = encodeURIComponent(requete);
  const adresse = (page) =>
    page > 1 ? `${site.home}/page/${page}/?s=${requeteUrl}` : `${site.home}/?s=${requeteUrl}`;

  const resultats = [];
  let total = 0;
  let perime = false;
  let tronque = false;
  let erreur = null;
  let pagesLues = 0;

  /** Lit une page et renvoie son contenu dépouillé, ou null en cas d'échec. */
  const lirePage = async (page) => {
    try {
      const reponse = await recuperer(adresse(page), options);
      if (reponse.perime) perime = true;
      const lot = lireResultats(reponse.corps, site, mots);
      return {
        page,
        totalAnnonce: lireTotal(reponse.corps),
        pertinents: lot.filter((article) => article.pertinence === 'titre'),
        complete: lot.length === PAR_PAGE,
      };
    } catch (cause) {
      return { page, echec: cause.message };
    }
  };

  // Première page seule : elle suffit à écarter les sites hors sujet, et son
  // total annoncé borne le nombre de pages à explorer ensuite.
  const premiere = await lirePage(1);
  if (premiere.echec) {
    return {
      id: site.id, nom: site.name, logo: site.logo ?? null, logoRatio: site.logoRatio ?? null, rechercheUrl: adresse(1),
      resultats: [], pertinents: 0, total: 0, pagesLues: 0,
      tronque: false, perime: false, erreur: premiere.echec,
    };
  }

  pagesLues = 1;
  total = premiere.totalAnnonce ?? 0;
  resultats.push(...premiere.pertinents);

  if (premiere.pertinents.length > 0 && premiere.complete) {
    const dernierePossible = Math.min(Math.ceil(total / PAR_PAGE), PAGES_MAX);

    // Pages suivantes par lots : un lot de 3 divise l'attente par trois sans
    // ouvrir une rafale de connexions vers un hébergement mutualisé fragile.
    for (let debut = 2; debut <= dernierePossible; debut += LOT) {
      const numeros = [];
      for (let n = debut; n < debut + LOT && n <= dernierePossible; n += 1) numeros.push(n);

      const pages = await Promise.all(numeros.map(lirePage));
      let epuise = false;

      for (const page of pages) {
        if (page.echec) { epuise = true; break; }
        pagesLues += 1;
        resultats.push(...page.pertinents);
        // Page sans article sur le sujet : la veine est épuisée, le reste du
        // lot est ignoré.
        if (page.pertinents.length === 0 || !page.complete) { epuise = true; break; }
      }

      if (epuise) break;
      if (debut + LOT > dernierePossible && dernierePossible === PAGES_MAX) tronque = true;
    }
  }

  return {
    id: site.id,
    nom: site.name,
    logo: site.logo ?? null,
    logoRatio: site.logoRatio ?? null,
    rechercheUrl: adresse(1),
    resultats,
    // Articles réellement consacrés au sujet.
    pertinents: resultats.length,
    // Total annoncé par le site, mentions de passage comprises.
    total,
    pagesLues,
    tronque,
    perime,
    erreur,
  };
}

async function executer(termes, options) {
  const mots = motsSignificatifs(termes);
  const sites = await Promise.all(
    SITES.map((site) => chercherSurUnSite(site, termes, mots, options))
  );

  const resultats = sites.flatMap((site) => site.resultats);
  const mentions = sites.reduce((somme, site) => somme + site.total, 0);

  return {
    requete: termes,
    // Jeu complet : la pagination qui suit est purement locale, donc le
    // nombre de pages est connu et fixe dès le premier affichage.
    resultats,
    total: resultats.length,
    // Correspondances écartées parce que le terme n'est que mentionné.
    mentionsIgnorees: Math.max(0, mentions - resultats.length),
    sitesConcernes: sites.filter((site) => site.pertinents > 0).length,
    tronque: sites.some((site) => site.tronque),
    perime: sites.some((site) => site.perime),
    requetes: sites.reduce((somme, site) => somme + site.pagesLues, 0),
    sites,
    erreurs: sites
      .filter((site) => site.erreur)
      .map((site) => ({ site: site.nom, message: site.erreur })),
  };
}

/**
 * Mot le plus porteur de sens d'une requête : le plus long, hors mots outils.
 * Sert au repli quand la recherche complète ne donne rien.
 */
function motPrincipal(termes) {
  const outils = new Set(['le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'a', 'à', 'au', 'aux', 'et', 'ou', 'en', 'pour', 'sur', 'avec']);
  const mots = termes
    .split(/\s+/)
    .filter((mot) => mot.length > 3 && !outils.has(mot.toLowerCase()));

  return mots.sort((a, b) => b.length - a.length)[0] ?? null;
}

/**
 * Interroge les six sites en parallèle.
 *
 * La recherche WordPress exige que **tous** les mots soient présents :
 * « tondeuse a gazon » ne renvoie rien alors que « tondeuse » remonte 21
 * articles. Comme un faux « aucun résultat » est le pire échec possible pour
 * vérifier si un sujet est déjà couvert, on relance automatiquement avec le
 * mot principal et on signale ce repli.
 *
 * @param {string} requete Termes recherchés
 */
export async function rechercher(requete, { forcer = false } = {}) {
  const termes = String(requete ?? '').trim();

  if (termes.length < 2) {
    return { requete: termes, trop_court: true, total: 0, sites: [], resultats: [], repli: null };
  }

  const options = {
    dureeVieMs: CACHE_RECHERCHE_MS,
    delaiMs: DELAI_RECHERCHE_MS,
    forcer,
  };
  const principal = await executer(termes, options);

  const motDeRepli = motPrincipal(termes);
  const vautLeCoup =
    principal.total === 0 &&
    motDeRepli !== null &&
    motDeRepli.toLowerCase() !== termes.toLowerCase();

  if (!vautLeCoup) return { ...principal, trop_court: false, repli: null };

  const secours = await executer(motDeRepli, options);
  return {
    ...principal,
    trop_court: false,
    repli: secours.total > 0 ? secours : null,
  };
}

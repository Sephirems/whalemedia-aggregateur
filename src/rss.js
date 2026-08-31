/**
 * Lecture des flux RSS 2.0 produits par WordPress.
 *
 * Choix assumé pour ce MVP : pas de dépendance externe. Les six flux visés ont
 * une structure connue et vérifiée pendant l'audit (RSS 2.0, espaces de noms
 * content:/dc:/slash:, valeurs en CDATA). Si le projet doit un jour accepter
 * des sources arbitraires, remplacer ce module par un vrai parseur XML.
 */

import { construireExtrait, decoderEntites, extraireImage } from './html.js';

/** Isole le contenu textuel d'une balise, en retirant l'enveloppe CDATA. */
function lireBalise(bloc, nom) {
  const motif = new RegExp(`<${nom}(?:\\s[^>]*)?>([\\s\\S]*?)</${nom}>`, 'i');
  const trouve = bloc.match(motif);
  if (!trouve) return '';
  return trouve[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1').trim();
}

/** Convertit une date RFC-822 en ISO-8601. Renvoie null si illisible. */
function lireDate(valeur) {
  if (!valeur) return null;
  const date = new Date(valeur);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Transforme un flux RSS en liste d'articles normalisés.
 * @param {string} xml   Corps du flux
 * @param {object} infos Contexte de la source (site, type éditorial)
 */
export function lireFluxRss(xml, infos = {}) {
  const blocs = xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi);
  const articles = [];

  for (const [, bloc] of blocs) {
    const url = lireBalise(bloc, 'link');
    const titre = decoderEntites(lireBalise(bloc, 'title'));
    if (!url || !titre) continue;

    const contenu = lireBalise(bloc, 'content:encoded');
    const description = lireBalise(bloc, 'description');

    articles.push({
      site: infos.site ?? null,
      siteNom: infos.siteNom ?? null,
      type: infos.type ?? 'Article',
      titre,
      url,
      date: lireDate(lireBalise(bloc, 'pubDate')),
      // Repli seulement : la vignette officielle est récupérée plus tard, via
      // l'og:image de la page de l'article (voir enrichirVignettes).
      image: extraireImage(contenu) ?? extraireImage(description),
      imageOfficielle: false,
      // Renseignée ensuite depuis la page de l'article (voir enrichirVignettes).
      modifie: null,
      extrait: construireExtrait(description),
      auteur: decoderEntites(lireBalise(bloc, 'dc:creator')) || null,
      categorie: decoderEntites(lireBalise(bloc, 'category')) || null,
      source: infos.source ?? 'rss',
    });
  }

  return articles;
}

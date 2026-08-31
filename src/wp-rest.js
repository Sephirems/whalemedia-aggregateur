/**
 * Lecture de la WordPress REST API.
 *
 * Deux précautions issues de l'audit :
 *  - `lang=fr` est indispensable (Polylang) : sans lui, les résultats français
 *    et italiens sont entrelacés.
 *  - `_fields` doit inclure `_links.wp:featuredmedia` EN PLUS de
 *    `_embedded.wp:featuredmedia`. Sans le premier, l'API répond 200 mais
 *    l'image disparaît silencieusement.
 */

import { construireExtrait, decoderEntites } from './html.js';

const CHAMPS = [
  'id',
  'date_gmt',
  'modified_gmt',
  'link',
  'title',
  'excerpt',
  '_links.wp:featuredmedia',
  '_embedded.wp:featuredmedia',
].join(',');

/** Construit l'URL de requête validée pendant l'audit. */
export function construireUrlRest(base, nombre) {
  const url = new URL(base);
  url.searchParams.set('per_page', String(nombre));
  url.searchParams.set('lang', 'fr');
  url.searchParams.set('orderby', 'date');
  url.searchParams.set('order', 'desc');
  url.searchParams.set('_embed', 'wp:featuredmedia');
  url.searchParams.set('_fields', CHAMPS);
  return url.toString();
}

/** Retient la déclinaison la plus large sous 1200 px, sinon l'originale. */
function choisirImage(media) {
  if (!media) return null;
  const tailles = media.media_details?.sizes;
  if (tailles) {
    const candidates = Object.values(tailles)
      .filter((t) => t?.source_url && typeof t.width === 'number')
      .sort((a, b) => b.width - a.width);
    const raisonnable = candidates.find((t) => t.width <= 1200);
    if (raisonnable) return raisonnable.source_url;
    if (candidates.length > 0) return candidates[candidates.length - 1].source_url;
  }
  return media.source_url ?? null;
}

/**
 * Transforme la réponse JSON de wp/v2 en liste d'articles normalisés.
 * @param {Array} donnees Réponse désérialisée de l'API
 * @param {object} infos  Contexte de la source
 */
export function lireReponseRest(donnees, infos = {}) {
  if (!Array.isArray(donnees)) return [];

  return donnees
    .map((entree) => {
      const url = entree?.link;
      const titre = decoderEntites(entree?.title?.rendered ?? '').trim();
      if (!url || !titre) return null;

      // Les dates *_gmt sont dépourvues de fuseau : on les ancre en UTC.
      const dateBrute = entree.date_gmt ? `${entree.date_gmt}Z` : null;
      const date = dateBrute && !Number.isNaN(new Date(dateBrute).getTime())
        ? new Date(dateBrute).toISOString()
        : null;

      // L'image à la une servie par la REST est bien la vignette officielle :
      // vérifié sur selectos, où elle pointe le même fichier que l'og:image.
      const image = choisirImage(entree._embedded?.['wp:featuredmedia']?.[0]);

      return {
        site: infos.site ?? null,
        siteNom: infos.siteNom ?? null,
        type: infos.type ?? 'Article',
        titre,
        url,
        date,
        image,
        modifie: entree.modified_gmt ? new Date(`${entree.modified_gmt}Z`).toISOString() : date,
        imageOfficielle: Boolean(image),
        extrait: construireExtrait(entree?.excerpt?.rendered ?? ''),
        auteur: null,
        categorie: null,
        source: 'rest',
      };
    })
    .filter(Boolean);
}

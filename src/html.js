/**
 * Utilitaires de nettoyage du HTML issu des flux WordPress.
 *
 * Les flux livrent du HTML complet dans <content:encoded> et un résumé dans
 * <description>. Les deux contiennent des entités, du balisage et, pour la
 * description, un ourlet promotionnel systématique à retirer.
 */

const ENTITES_NOMMEES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  nbsp: ' ', laquo: '«', raquo: '»', hellip: '…',
  rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”',
  ndash: '–', mdash: '—', eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë',
  agrave: 'à', acirc: 'â', ccedil: 'ç', ugrave: 'ù', ucirc: 'û', uuml: 'ü',
  icirc: 'î', iuml: 'ï', ocirc: 'ô', ouml: 'ö', deg: '°', euro: '€',
  bull: '•', middot: '·', times: '×', laquo_: '«',
};

/** Remplace les entités HTML (nommées et numériques) par leur caractère. */
export function decoderEntites(texte = '') {
  return texte
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => securiserCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => securiserCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z][a-z0-9]*);/gi, (entier, nom) => {
      const remplacement = ENTITES_NOMMEES[nom.toLowerCase()];
      return remplacement === undefined ? entier : remplacement;
    });
}

function securiserCodePoint(code) {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return '';
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

/** Retire le balisage et normalise les espaces. */
export function retirerBalises(html = '') {
  return decoderEntites(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/p>/gi, ' ')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Supprime l'ourlet ajouté par WordPress en fin de résumé :
 * « Cet article X est apparu en premier sur Y. » (ou « L'article X … »).
 */
export function retirerOurlet(html = '') {
  return html.replace(
    /<p>\s*(?:Cet\s+article|L['’]article)[\s\S]*?est\s+apparu\s+en\s+premier\s+sur[\s\S]*?<\/p>/gi,
    ''
  );
}

/** Construit un extrait lisible à partir d'une <description> de flux. */
export function construireExtrait(html = '', longueurMax = 200) {
  const texte = retirerBalises(retirerOurlet(html));
  if (texte.length <= longueurMax) return texte;
  const tronque = texte.slice(0, longueurMax);
  const dernierEspace = tronque.lastIndexOf(' ');
  return `${(dernierEspace > 60 ? tronque.slice(0, dernierEspace) : tronque).replace(/[,;:.\s]+$/, '')}…`;
}

/** Force le HTTPS : certains og:image sont déclarés en http sur ces sites. */
function normaliserUrlImage(url) {
  return url.replace(/^http:\/\//i, 'https://');
}

/**
 * Récupère l'image de prévisualisation officielle de l'article (og:image).
 *
 * C'est la seule source fiable pour la vignette : les sites l'utilisent
 * eux-mêmes dans leurs cartes d'archive, via
 * `<div class="thumbnail-container" style="background-image:url(...)">`.
 * Vérifié sur bedbedtime : la carte de /tests/ et l'og:image pointent le même
 * fichier (TediberInfinite-0.jpg), distinct de la première image du corps
 * de l'article (TediberInfinite.jpg).
 */
export function extraireOgImage(html = '') {
  const avecPropriete =
    html.match(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["']/i);

  if (!avecPropriete) return null;
  const url = normaliserUrlImage(decoderEntites(avecPropriete[1]).trim());
  return url.startsWith('http') ? url : null;
}

/**
 * Date de dernière modification, lue dans le JSON-LD de la page.
 *
 * Les flux RSS ne transportent que la date de publication. Or ces sites
 * réactualisent massivement d'anciens contenus — un comparatif publié en 2018
 * peut avoir été refondu la semaine dernière — et la distinction est utile.
 *
 * Cette date coïncide avec le `lastmod` du sitemap (vérifié sur selectos :
 * 2026-06-04 des deux côtés), mais elle ne coûte aucune requête : la page est
 * déjà récupérée pour en extraire la vignette.
 *
 * Son absence signifie que l'article n'a jamais été modifié depuis sa
 * publication.
 */
export function extraireDateModifiee(html = '') {
  const trouve = html.match(/"dateModified":"([^"]{10,40})"/);
  if (!trouve) return null;

  const date = new Date(trouve[1]);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Solution de repli : première image du corps de l'article.
 *
 * Attention, ce n'est PAS la vignette officielle — c'est l'illustration
 * d'ouverture du contenu. On ne s'en sert que si og:image est absente.
 * On écarte /plugins/ car les encarts produits injectent des pictogrammes
 * SVG (Points-Positifs-Check.svg) avant le contenu utile.
 */
export function extraireImage(html = '') {
  const sources = html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi);
  for (const [, brut] of sources) {
    const url = decoderEntites(brut);
    if (!url.includes('/wp-content/uploads/')) continue;
    if (url.includes('/plugins/')) continue;
    if (!/\.(jpe?g|png|webp|avif)(\?|$)/i.test(url)) continue;
    return normaliserUrlImage(url);
  }
  return null;
}

/**
 * Extraction du contenu exploitable d'une page d'article.
 *
 * Une page pèse ~110 Ko de HTML pour ~56 Ko de texte, dont l'essentiel est du
 * gabarit : menus, encarts produits, blocs affiliés. En envoyer la totalité à
 * un modèle coûterait cher pour un résultat moins bon.
 *
 * Ces articles suivent tous la même structure, ce qui permet d'en tirer
 * directement la substance : la note, les points positifs et négatifs, la
 * conclusion rédigée par la rédaction, et le plan de l'article. Environ 2 Ko
 * qui contiennent déjà le jugement éditorial.
 */

import { CACHE_TTL_MS } from './sources.js';
import { recuperer } from './http.js';
import { decoderEntites, retirerBalises } from './html.js';

/**
 * Liste les points forts ou faibles.
 *
 * Chaque entrée a la forme
 * `<li class="test-conclusion-box-points-positifs"><img …/><span>texte</span></li>` :
 * le texte utile est dans le <span>, l'image étant un pictogramme de plugin.
 */
function listerPoints(html, signe) {
  const entrees = html.matchAll(
    new RegExp(`class="[^"]*points-${signe}[^"]*"[^>]*>[\\s\\S]{0,400}?<span[^>]*>([\\s\\S]{0,200}?)</span>`, 'gi')
  );

  const points = [];
  for (const [, texte] of entrees) {
    const propre = retirerBalises(texte);
    if (propre.length > 5 && propre.length < 200 && !points.includes(propre)) {
      points.push(propre);
    }
  }
  return points;
}

/**
 * Tronque au dernier point de phrase, sans jamais couper au milieu d'un mot.
 *
 * Le texte est déjà décodé à ce stade, donc il n'y a plus d'entité HTML à
 * casser — mais couper en pleine phrase produit un envoi bancal au modèle et
 * un résumé local qui s'arrête au milieu d'une idée.
 */
function tronquerProprement(texte, longueurMax) {
  const propre = texte.trim();
  if (propre.length <= longueurMax) return propre;

  const coupe = propre.slice(0, longueurMax);
  const finPhrase = Math.max(coupe.lastIndexOf('. '), coupe.lastIndexOf('! '), coupe.lastIndexOf('? '));
  if (finPhrase > longueurMax * 0.5) return coupe.slice(0, finPhrase + 1);

  const finMot = coupe.lastIndexOf(' ');
  return `${(finMot > 0 ? coupe.slice(0, finMot) : coupe).trimEnd()}…`;
}

/**
 * Produits retenus par le comparatif, et gamme dans laquelle chacun est retenu.
 *
 * C'est le verdict de l'article. Sans lui, le résumé d'un comparatif ne peut
 * qu'annoncer ce qui va être dit — « nous allons vous présenter ceux qui ont
 * obtenu les meilleurs résultats » — au lieu de le dire.
 *
 * Le balisage varie selon le plugin employé par le site (`lavelab-box-title`,
 * `selectos-box-title`, `su-box-title`), mais l'attribut `data-name` qui porte
 * le nom du produit est commun aux six.
 */
function listerRecommandations(html) {
  const propre = (texte) => decoderEntites(texte).replace(/\s+/g, ' ').trim();

  const gammes = [...html.matchAll(/box-title"?[^>]*>\s*([^<]{3,60}?)\s*</gi)]
    .map((m) => ({ position: m.index, texte: propre(m[1]) }))
    .filter((e) => e.texte);

  const produits = [...html.matchAll(/data-name="([^"]{2,60})"/gi)]
    .map((m) => ({ position: m.index, texte: propre(m[1]) }))
    .filter((e) => e.texte);

  if (gammes.length === 0 || produits.length === 0) return [];

  // Les deux listes suivent le même ordre de lecture. Quand elles ont la même
  // longueur, l'appariement par rang est fiable — et c'est le seul qui marche
  // sur selectos, où les libellés sont regroupés 37 000 caractères avant les
  // produits, hors de portée de toute fenêtre de proximité.
  const apparier =
    gammes.length === produits.length
      ? produits.map((produit, i) => ({ gamme: gammes[i].texte, produit: produit.texte }))
      : // Sinon, chaque produit prend le libellé le plus proche : sur les autres
        // sites, le libellé suit le produit d'une centaine de caractères.
        produits.map((produit) => {
          const plusProche = gammes.reduce((meilleur, gamme) =>
            Math.abs(gamme.position - produit.position) < Math.abs(meilleur.position - produit.position)
              ? gamme
              : meilleur
          );
          return { gamme: plusProche.texte, produit: produit.texte };
        });

  const vus = new Set();
  return apparier
    .filter(({ produit }) => !vus.has(produit) && vus.add(produit))
    .slice(0, 6);
}

/** Première valeur trouvée pour une clé du JSON-LD. */
function champJsonLd(html, cle) {
  const trouve = html.match(new RegExp(`"${cle}":"([^"]{3,400})"`));
  return trouve ? decoderEntites(trouve[1]).trim() : null;
}

/**
 * Récupère une page d'article et en extrait la matière à résumer.
 * @param {string} url Adresse de l'article
 */
export async function extraireArticle(url, { forcer = false } = {}) {
  const { corps } = await recuperer(url, { dureeVieMs: CACHE_TTL_MS, forcer });

  const note = corps.match(/"ratingValue":\s*([0-9]+(?:\.[0-9]+)?)/);

  // La conclusion porte le jugement final : c'est le passage le plus dense.
  //
  // Elle vit dans un conteneur dédié, présent sur les six sites. Se repérer
  // dessus plutôt que couper au bout de N caractères après le titre évite
  // d'emporter le bloc suivant — la liste des points forts — et de laisser une
  // entité HTML tronquée en fin de texte.
  const blocConclusion =
    corps.match(/test-conclusion-box-text[^>]*>([\s\S]*?)<\/div>/i) ??
    corps.match(/Conclusion<\/h[23]>([\s\S]{0,1800}?)<\/div>/i);

  const conclusion = blocConclusion
    ? tronquerProprement(
        retirerBalises(blocConclusion[1]).replace(/^\s*[0-9]+\s*\/\s*10\s*/, ''),
        1200
      )
    : '';

  // Les critères d'évaluation portent la classe du thème, à ne pas confondre
  // avec les <h2> de la page, qui servent aux encarts promotionnels.
  const sections = [
    ...new Set(
      [...corps.matchAll(/<h[23][^>]*class="[^"]*divider-note-title[^"]*"[^>]*>([^<]{4,90})</gi)]
        .map(([, texte]) => decoderEntites(texte).trim())
    ),
  ].slice(0, 10);

  // Les comparatifs n'ont ni note ni points forts : leur substance tient dans
  // le paragraphe d'introduction, qui annonce le verdict, et dans les encarts
  // de recommandation par gamme de prix.
  const blocIntro = corps.match(/intro-paragraphe[^>]*>([\s\S]{0,1600}?)<\/div>/i);
  const intro = blocIntro ? tronquerProprement(retirerBalises(blocIntro[1]), 900) : '';

  const recommandations = listerRecommandations(corps);

  return {
    url,
    titre: champJsonLd(corps, 'headline') ?? champJsonLd(corps, 'name'),
    description: champJsonLd(corps, 'description'),
    auteur: champJsonLd(corps, 'author'),
    date: champJsonLd(corps, 'datePublished'),
    // « test » : un produit noté. « comparatif » : une sélection par gamme.
    genre: note ? 'test' : 'comparatif',
    note: note ? Number(note[1]) : null,
    positifs: listerPoints(corps, 'positifs').slice(0, 8),
    negatifs: listerPoints(corps, 'negatifs').slice(0, 8),
    conclusion,
    sections,
    intro,
    recommandations,
  };
}

/** Met la matière extraite en texte compact, prêt à être envoyé à un modèle. */
export function enTexte(article) {
  const parties = [`Titre : ${article.titre ?? '(inconnu)'}`];

  if (article.note !== null) parties.push(`Note attribuée : ${article.note}/10`);
  if (article.intro) parties.push(`Introduction :\n${article.intro}`);
  if (article.recommandations.length > 0) {
    const lignes = article.recommandations.map((r) => `- ${r.gamme} : ${r.produit}`);
    parties.push(`Produits retenus :\n${lignes.join('\n')}`);
  }
  if (article.sections.length > 0) parties.push(`Critères évalués : ${article.sections.join(' · ')}`);
  if (article.positifs.length > 0) parties.push(`Points positifs :\n- ${article.positifs.join('\n- ')}`);
  if (article.negatifs.length > 0) parties.push(`Points négatifs :\n- ${article.negatifs.join('\n- ')}`);
  if (article.conclusion) parties.push(`Conclusion de la rédaction :\n${article.conclusion}`);

  return parties.join('\n\n');
}

/** Vrai si l'extraction a trouvé de quoi produire un résumé utile. */
export function exploitable(article) {
  return Boolean(
    article.conclusion ||
      article.intro ||
      article.positifs.length > 0 ||
      article.recommandations.length > 0
  );
}

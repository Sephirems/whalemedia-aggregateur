/**
 * Production du résumé d'un article.
 *
 * Deux fournisseurs, choisis automatiquement :
 *
 *   local   — sans clé ni dépendance, disponible tout de suite. Compose un
 *             résumé à partir de la matière déjà structurée de l'article :
 *             note, verdict de la rédaction, points forts et faibles.
 *   claude  — dès qu'une clé API est présente. Produit un vrai texte rédigé.
 *
 * Le fournisseur local n'est pas un bouche-trou en attendant la clé : sur ces
 * articles, la rédaction écrit déjà sa conclusion et liste ses points forts.
 * Le restituer fidèlement est souvent préférable à une reformulation, et cela
 * ne coûte rien. Le modèle apporte la synthèse et la mise en perspective.
 */

import { extraireArticle, exploitable } from './article.js';

/** Coupe proprement à la fin d'une phrase. */
function tronquer(texte, longueurMax) {
  if (texte.length <= longueurMax) return texte;
  const coupe = texte.slice(0, longueurMax);
  const fin = Math.max(coupe.lastIndexOf('. '), coupe.lastIndexOf(' ! '), coupe.lastIndexOf(' ? '));
  return fin > longueurMax * 0.5 ? coupe.slice(0, fin + 1) : `${coupe.trimEnd()}…`;
}

/**
 * Nettoie un libellé de gamme. On retire « Notre choix, » — redondant, puisque
 * le premier produit cité est justement le choix principal — mais on garde
 * « meilleur », qui porte le sens.
 */
function tourner(gamme) {
  return gamme.replace(/^Notre choix,?\s*/i, '').toLowerCase().trim();
}

/**
 * Résumé d'un comparatif : le verdict, pas l'annonce.
 *
 * L'introduction de ces articles se contente souvent de présenter la démarche
 * — « nous allons vous présenter ceux qui ont obtenu les meilleurs
 * résultats » — ce qui ne résume rien. Les produits retenus, eux, sont le
 * résultat du comparatif, et se lisent en une phrase.
 */
function resumerComparatif(article) {
  const picks = article.recommandations;
  const intro = article.intro || article.description || '';

  // Deux cas de figure, et un seul doit s'exprimer :
  //
  //  - l'introduction est déjà un verdict et nomme les produits retenus
  //    (selectos) : elle se suffit, y ajouter la liste ferait doublon ;
  //  - elle se contente d'annoncer le plan (ultracooker, bedbedtime) : on n'en
  //    garde que le fait chiffré, et ce sont les produits qui résument.
  const nommeLeChoix =
    picks.length > 0 && intro.toLowerCase().includes(picks[0].produit.toLowerCase().slice(0, 18));

  if (nommeLeChoix) return tronquer(intro, 600);

  const phrases = [];
  const compte = intro.match(/(?:testé|comparé)\s+([0-9]+)\s+([^,.]{3,50})/i);
  if (compte) phrases.push(`Comparatif de ${compte[1]} ${compte[2].trim()}.`);

  if (picks.length > 0) {
    // Point-virgules plutôt que virgules : plusieurs noms de produits
    // contiennent déjà une parenthèse, comme « Tediber Hybride (140x190 cm) ».
    const liste = picks.map((r) => `${r.produit} — ${tourner(r.gamme)}`).join(' ; ');
    phrases.push(`Sélection : ${liste}.`);
  } else if (!compte && intro) {
    phrases.push(tronquer(intro, 600));
  }

  return phrases.join(' ');
}

/** Résumé composé localement, sans appel externe. */
function resumerLocalement(article) {
  const paragraphes = [];

  if (article.genre === 'test') {
    const ouverture = article.note !== null ? `Noté ${article.note}/10. ` : '';
    paragraphes.push(ouverture + tronquer(article.conclusion || article.description || '', 600));
  } else {
    paragraphes.push(resumerComparatif(article));
  }

  return {
    fournisseur: 'local',
    modele: null,
    texte: paragraphes.filter(Boolean).join('\n\n'),
    note: article.note,
    positifs: article.positifs,
    negatifs: article.negatifs,
    recommandations: article.recommandations,
  };
}

/**
 * Produit le résumé d'un article.
 * @param {string} url        Adresse de l'article
 * @param {object} options    `fournisseur` force un fournisseur précis
 */
export async function resumer(url, { forcer = false, fournisseur = null } = {}) {
  const article = await extraireArticle(url, { forcer });

  if (!exploitable(article)) {
    return {
      url,
      titre: article.titre,
      erreur: "Le contenu de cet article n'a pas pu être extrait.",
      fournisseur: null,
    };
  }

  const souhaite = fournisseur ?? (cleDisponible() ? 'claude' : 'local');
  const base = {
    url,
    titre: article.titre,
    genre: article.genre,
    date: article.date,
    erreur: null,
  };

  if (souhaite === 'claude') {
    try {
      const { resumerAvecClaude } = await import('./resume-claude.js');
      return { ...base, ...(await resumerAvecClaude(article)) };
    } catch (cause) {
      // Clé invalide, quota atteint, SDK absent : on ne prive pas
      // l'utilisateur de résumé pour autant.
      return {
        ...base,
        ...resumerLocalement(article),
        avertissement: `Résumé par IA indisponible (${cause.message}) — résumé local affiché.`,
      };
    }
  }

  return { ...base, ...resumerLocalement(article) };
}

/** Une clé API est-elle configurée ? */
export function cleDisponible() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

/** Le SDK facultatif est-il installé ? */
async function sdkInstalle() {
  try {
    await import('@anthropic-ai/sdk');
    return true;
  } catch {
    return false;
  }
}

/**
 * État du résumé par IA, pour que l'interface dise précisément ce qui manque
 * plutôt qu'un simple « indisponible ».
 */
export async function etatResumeIA() {
  const cle = cleDisponible();
  const sdk = await sdkInstalle();

  if (cle && sdk) return { actif: true, cle, sdk, manque: null };

  const manque = !sdk && !cle ? 'sdk_et_cle' : !sdk ? 'sdk' : 'cle';
  return { actif: false, cle, sdk, manque };
}

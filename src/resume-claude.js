/**
 * Résumé rédigé par Claude.
 *
 * Ce module est chargé à la demande : le SDK Anthropic est une dépendance
 * facultative, et le reste du projet tourne sans aucune dépendance.
 *
 *   npm install @anthropic-ai/sdk
 *   set ANTHROPIC_API_KEY=sk-ant-…        (PowerShell : $env:ANTHROPIC_API_KEY="…")
 *
 * On n'envoie pas la page : elle pèse 56 Ko de texte, dont l'essentiel est du
 * gabarit. On envoie la matière extraite — environ 1,2 Ko — ce qui coûte
 * quarante fois moins et donne un meilleur résumé, le modèle n'ayant pas à
 * démêler le contenu éditorial des encarts affiliés.
 */

import { enTexte } from './article.js';

const MODELE = 'claude-opus-5';

const CONSIGNE = `Tu résumes des articles de test et de comparatif produits pour un agrégateur éditorial interne.

À partir des éléments fournis, rédige en français un résumé de 3 à 4 phrases qui répond à : de quoi parle l'article, quel est le verdict, et pour qui le produit convient.

Règles :
- Reste strictement fidèle aux éléments fournis ; n'invente aucun chiffre, prix ni caractéristique.
- Va droit au fait, sans formule d'introduction ni « cet article ».
- Mentionne la note si elle est fournie, et la principale réserve s'il y en a une.
- Réponds uniquement par le résumé, sans titre ni puces.`;

/**
 * @param {object} article Matière extraite par extraireArticle()
 * @returns {Promise<{fournisseur: string, modele: string, texte: string, ...}>}
 */
export async function resumerAvecClaude(article) {
  let Anthropic;
  try {
    ({ default: Anthropic } = await import('@anthropic-ai/sdk'));
  } catch {
    throw new Error('SDK absent — lancez : npm install @anthropic-ai/sdk');
  }

  // Le constructeur sans argument résout la clé depuis l'environnement.
  const client = new Anthropic();

  const reponse = await client.messages.create({
    model: MODELE,
    // Le résumé fait quelques phrases : inutile de prévoir large.
    max_tokens: 1024,
    // Tâche simple et cadrée : l'effort minimal suffit et coûte bien moins.
    output_config: { effort: 'low' },
    system: CONSIGNE,
    messages: [{ role: 'user', content: enTexte(article) }],
  });

  if (reponse.stop_reason === 'refusal') {
    throw new Error('la requête a été déclinée par le modèle');
  }

  const texte = reponse.content
    .filter((bloc) => bloc.type === 'text')
    .map((bloc) => bloc.text)
    .join('\n')
    .trim();

  if (!texte) throw new Error('réponse vide du modèle');

  return {
    fournisseur: 'claude',
    modele: MODELE,
    texte,
    note: article.note,
    positifs: article.positifs,
    negatifs: article.negatifs,
    recommandations: article.recommandations,
    usage: {
      entree: reponse.usage.input_tokens,
      sortie: reponse.usage.output_tokens,
    },
  };
}

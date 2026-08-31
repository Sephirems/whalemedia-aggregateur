/** GET /api/resume?url= — résumé d'un article du réseau. */

import { resumer } from '../src/resume.js';
import { SITES } from '../src/sources.js';
import { envoyerErreur, envoyerJson } from './_reponse.js';

const FRAICHEUR = 3600;

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

export default async function handler(requete, reponse) {
  const cible = urlAutorisee(requete.query?.url);
  if (!cible) {
    envoyerErreur(reponse, 400, 'Adresse absente ou hors du réseau WhaleMedia.');
    return;
  }

  try {
    envoyerJson(reponse, 200, await resumer(cible), { fraicheurSecondes: FRAICHEUR });
  } catch (erreur) {
    console.error('Échec du résumé :', erreur);
    envoyerErreur(reponse, 500, 'Le résumé a échoué.', erreur.message);
  }
}

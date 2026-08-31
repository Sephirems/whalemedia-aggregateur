/** GET /api/config — quel fournisseur de résumé est actif. */

import { etatResumeIA } from '../src/resume.js';
import { envoyerErreur, envoyerJson } from './_reponse.js';

export default async function handler(_requete, reponse) {
  try {
    // Jamais mis en cache : dépend de la configuration du déploiement.
    envoyerJson(reponse, 200, await etatResumeIA());
  } catch (erreur) {
    envoyerErreur(reponse, 500, 'État indisponible.', erreur.message);
  }
}

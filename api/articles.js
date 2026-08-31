/** GET /api/articles — les 3 derniers articles de chaque site. */

import { agreger } from '../src/aggregate.js';
import { envoyerErreur, envoyerJson } from './_reponse.js';

// Une heure, comme le cache disque en local.
const FRAICHEUR = 3600;

export default async function handler(requete, reponse) {
  const forcer = requete.query?.force === '1';

  try {
    const donnees = await agreger({ forcer });
    // Une régénération forcée ne doit pas être resservie par le CDN.
    envoyerJson(reponse, 200, donnees, { fraicheurSecondes: forcer ? 0 : FRAICHEUR });
  } catch (erreur) {
    console.error('Échec de l’agrégation :', erreur);
    envoyerErreur(reponse, 500, "L'agrégation a échoué.", erreur.message);
  }
}

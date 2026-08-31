/** GET /api/recherche?q= — recherche fédérée sur les six catalogues. */

import { rechercher } from '../src/recherche.js';
import { envoyerErreur, envoyerJson } from './_reponse.js';

// Six heures : la page `?s=` des sites est leur endpoint le plus lourd.
const FRAICHEUR = 21600;

export default async function handler(requete, reponse) {
  try {
    const donnees = await rechercher(requete.query?.q, {
      forcer: requete.query?.force === '1',
    });
    envoyerJson(reponse, 200, donnees, { fraicheurSecondes: FRAICHEUR });
  } catch (erreur) {
    console.error('Échec de la recherche :', erreur);
    envoyerErreur(reponse, 500, 'La recherche a échoué.', erreur.message);
  }
}

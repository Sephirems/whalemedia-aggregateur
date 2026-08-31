import { chargerConfig } from './config.js';
chargerConfig();

/**
 * Force la mise à jour du cache : `npm run refresh`
 * Utile avant une démonstration, ou à brancher sur une tâche planifiée.
 */

import { agreger } from './aggregate.js';

const resultat = await agreger({ forcer: true });
const enEchec = resultat.sites.filter((site) => site.enEchec);

console.log(
  `Cache régénéré : ${resultat.nombreArticles} articles sur ${resultat.sites.length} sites.`
);

if (enEchec.length > 0) {
  console.warn(`Sites sans contenu : ${enEchec.map((s) => s.nom).join(', ')}`);
  process.exitCode = 1;
}

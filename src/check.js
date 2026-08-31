import { chargerConfig } from './config.js';
chargerConfig();

/**
 * Contrôle en ligne de commande : `npm run check`
 * Affiche ce que l'agrégateur a récupéré, site par site, sans lancer le serveur.
 */

import { agreger } from './aggregate.js';

const forcer = process.argv.includes('--force');

const debut = Date.now();
const resultat = await agreger({ forcer });
const duree = ((Date.now() - debut) / 1000).toFixed(1);

const dateCourte = (iso) => (iso ? iso.slice(0, 10) : '   —      ');

for (const site of resultat.sites) {
  const etat = site.enEchec ? 'ÉCHEC' : `${site.articles.length}/${site.total}`;
  const cache = site.depuisCache ? ' (cache)' : '';
  console.log(`\n${site.nom}  [${etat}]${cache}`);

  for (const article of site.articles) {
    // « officielle » = image à la une du site ; « repli » = 1re image du corps.
    const image = article.image ? (article.imageOfficielle ? 'officielle' : 'repli     ') : 'aucune    ';
    console.log(
      `   ${dateCourte(article.date)}  ${image}  ${article.type.padEnd(10)} ${article.titre.slice(0, 52)}`
    );
    if (article.image) console.log(`               ${article.image.split('/').pop()}`);
  }

  for (const avertissement of site.avertissements) {
    const etiquette = avertissement.attendu ? 'attendu' : 'ANOMALIE';
    console.log(`   ! ${etiquette} : ${avertissement.message}`);
  }
}

const sansImage = resultat.articles.filter((a) => !a.image).length;
const imageRepli = resultat.articles.filter((a) => a.image && !a.imageOfficielle).length;
const sansDate = resultat.articles.filter((a) => !a.date).length;
const sansExtrait = resultat.articles.filter((a) => !a.extrait).length;

console.log(`\n${'─'.repeat(64)}`);
console.log(`Articles         : ${resultat.nombreArticles}`);
console.log(`Sans image       : ${sansImage}`);
console.log(`Image de repli   : ${imageRepli}  (og:image introuvable)`);
console.log(`Sans date        : ${sansDate}`);
console.log(`Sans extrait     : ${sansExtrait}`);
console.log(`Sites en échec   : ${resultat.sites.filter((s) => s.enEchec).length}`);
console.log(`Durée            : ${duree}s`);

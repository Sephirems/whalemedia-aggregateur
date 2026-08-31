/**
 * Utilitaires communs aux fonctions Vercel.
 *
 * Chaque fonction du dossier `api/` n'est qu'une enveloppe HTTP autour des
 * modules de `src/`, qui restent identiques entre le serveur local et la
 * plateforme. La logique métier ne connaît pas son transport.
 */

import { chargerConfig } from '../src/config.js';

// Sur Vercel, la clé vient des variables d'environnement du projet ; en local,
// du fichier .env. Le même appel couvre les deux cas.
chargerConfig();

/**
 * Répond en JSON avec une durée de cache côté CDN.
 *
 * `s-maxage` fixe la fraîcheur pour le cache partagé de la plateforme, et
 * `stale-while-revalidate` l'autorise à servir une réponse expirée pendant
 * qu'il en récupère une neuve — exactement le comportement implémenté à la
 * main dans `src/http.js` pour le cache disque, mais appliqué ici en amont.
 *
 * L'effet est meilleur qu'en local : le cache est partagé par tous les
 * visiteurs. Cent consultations dans l'heure ne déclenchent qu'un seul
 * passage sur les six sites.
 */
export function envoyerJson(reponse, statut, donnees, { fraicheurSecondes = 0 } = {}) {
  reponse.setHeader('Content-Type', 'application/json; charset=utf-8');
  reponse.setHeader(
    'Cache-Control',
    fraicheurSecondes > 0
      ? `public, s-maxage=${fraicheurSecondes}, stale-while-revalidate=86400`
      : 'no-store'
  );
  reponse.status(statut).send(JSON.stringify(donnees));
}

/** Réponse d'erreur uniforme, jamais mise en cache. */
export function envoyerErreur(reponse, statut, message, detail) {
  envoyerJson(reponse, statut, detail ? { erreur: message, detail } : { erreur: message });
}

/**
 * Configuration des sources, dérivée directement de l'audit technique du 30/08/2026.
 *
 * Rappel des constats qui justifient ces choix :
 *  - Le CPT « tests » n'est pas exposé par la REST API (404 sur les 6 sites) et
 *    n'apparaît pas dans /feed/. Il n'est joignable que via /tests/feed/.
 *  - Sur selectos.eu le CPT est vide : la REST API y voit 100 % du contenu et
 *    fournit une image à la une structurée, donc on la préfère au RSS.
 *  - Sur glamourquest.com, /feed/ et wp/v2/posts sont vides : /tests/feed/ est
 *    la seule source viable.
 */

/** Nombre d'articles retenus par site. */
export const ARTICLES_PAR_SITE = 3;

/** Durée de validité du cache disque, en millisecondes (1 heure). */
export const CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Un « endpoint » décrit une source à interroger.
 *   kind: 'rss'  -> flux RSS 2.0 WordPress
 *   kind: 'rest' -> WordPress REST API (wp/v2/<postType>)
 *   type         -> étiquette éditoriale affichée sur la carte
 *   optional     -> un 404 sur cette source est un cas normal, pas une erreur
 */
export const SITES = [
  {
    id: 'selectos',
    name: 'Selectos',
    home: 'https://selectos.eu',
    logo: 'https://selectos.eu/wp-content/uploads/2020/06/Logo-Couleur.svg',
    logoRatio: 4.62,
    // Le flux plutôt que la REST API, alors que selectos n'a pas de CPT
    // « tests » : la REST n'est pas mise en cache par LiteSpeed et répond en
    // ~20 s, contre 0,2 s pour le flux. Elle avait pour seul avantage de
    // livrer l'image à la une structurée, ce qui ne sert plus depuis que la
    // vignette officielle est prise dans l'og:image pour tous les sites.
    endpoints: [
      { kind: 'rss', type: 'Comparatif', url: 'https://selectos.eu/feed/' },
      {
        kind: 'rest',
        type: 'Comparatif',
        postType: 'posts',
        url: 'https://selectos.eu/wp-json/wp/v2/posts',
        secours: true,
      },
    ],
  },
  {
    id: 'lavelab',
    name: 'Lavelab',
    home: 'https://lavelab.com',
    logo: 'https://lavelab.com/wp-content/uploads/2023/04/Logo-Couleur.svg',
    logoRatio: 4.35,
    endpoints: [
      { kind: 'rss', type: 'Comparatif', url: 'https://lavelab.com/feed/' },
      { kind: 'rss', type: 'Test', url: 'https://lavelab.com/tests/feed/' },
    ],
  },
  {
    id: 'ultracooker',
    name: 'Ultracooker',
    home: 'https://ultracooker.com',
    logo: 'https://ultracooker.com/wp-content/uploads/2025/01/cropped-Logo-Couleur.png',
    logoRatio: 2.58,
    endpoints: [
      { kind: 'rss', type: 'Comparatif', url: 'https://ultracooker.com/feed/' },
      { kind: 'rss', type: 'Test', url: 'https://ultracooker.com/tests/feed/' },
    ],
  },
  {
    id: 'coffealover',
    name: 'Coffealover',
    home: 'https://coffealover.com',
    logo: 'https://coffealover.com/wp-content/uploads/2024/03/Coffealover-LogoCouleur.svg',
    logoRatio: 2.75,
    endpoints: [
      { kind: 'rss', type: 'Comparatif', url: 'https://coffealover.com/feed/' },
      { kind: 'rss', type: 'Test', url: 'https://coffealover.com/tests/feed/' },
    ],
  },
  {
    id: 'bedbedtime',
    name: 'Bedbedtime',
    home: 'https://bedbedtime.com',
    logo: 'https://bedbedtime.com/wp-content/uploads/2023/07/Logo-Bedbedtime-couleur.svg',
    logoRatio: 5.36,
    endpoints: [
      { kind: 'rss', type: 'Comparatif', url: 'https://bedbedtime.com/feed/' },
      { kind: 'rss', type: 'Test', url: 'https://bedbedtime.com/tests/feed/' },
    ],
  },
  {
    id: 'glamourquest',
    name: 'Glamourquest',
    home: 'https://glamourquest.com',
    logo: 'https://glamourquest.com/wp-content/uploads/2025/12/Logo-couleur.svg',
    logoRatio: 2.79,
    endpoints: [
      // /feed/ renvoie un flux valide mais vide, et wp/v2/posts renvoie [].
      // /tests/feed/ est la seule source de contenu de ce site.
      { kind: 'rss', type: 'Test', url: 'https://glamourquest.com/tests/feed/' },
    ],
  },
];

/**
 * Logo de la maison mère, relevé sur whalemedia.eu, qui présente les six sites.
 * Tenu à l'écart de SITES : il ne désigne pas une source d'articles.
 */
export const LOGO_RESEAU = 'https://whalemedia.eu/wp-content/uploads/2024/03/cropped-logo-Whale-Media.png';

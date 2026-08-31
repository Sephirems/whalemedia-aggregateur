# Agrégateur WhaleMedia

Récupère et affiche les 3 derniers articles de six sites WordPress —
Selectos, Lavelab, Ultracooker, Coffealover, Bedbedtime et Glamourquest —
avec une recherche sur l'ensemble de leurs catalogues et un résumé par article.

Tourne avec Node seul : aucune dépendance n'est nécessaire au fonctionnement.

> **Projet personnel à but démonstratif.** Développé de façon indépendante à des
> fins de démonstration technique. Il n'est ni affilié à, ni commandité, ni
> officiellement approuvé par Whale Media. Les noms, marques, logos, articles,
> images et contenus présentés appartiennent à leurs propriétaires respectifs.
> Les données proviennent de sources publiques — flux RSS, API ouvertes, pages
> accessibles à tous — et sont affichées uniquement pour illustrer le
> fonctionnement de l'outil ; chaque article renvoie vers sa source d'origine.
> Aucun contenu n'est republié, revendiqué, ni exploité commercialement.
>
> La mention équivalente figure dans le pied de page de l'interface.

---

## Démarrer

**Prérequis : Node 20 ou plus** (`node --version`). Le mode `--watch` utilisé par
`npm start` n'est réellement stable qu'à partir de Node 22.

```bash
npm start
```

Puis ouvrir <http://localhost:3000>. Aucun `npm install` n'est requis.

Le serveur tourne en rechargement automatique : toute modification d'un fichier
source est prise en compte en trois secondes environ. Sans cela, on continue de
voir l'ancien comportement après avoir corrigé le code — Node ne recharge pas à
chaud par défaut. Pour lancer sans surveillance : `npm run start:simple`.

| Commande | Effet |
| --- | --- |
| `npm start` | Serveur + interface, avec rechargement automatique |
| `npm run check` | Affiche dans le terminal ce qui est récupéré, site par site |
| `npm run refresh` | Force la régénération du cache |

`npm run check` est le moyen le plus rapide de vérifier que les six sites
répondent toujours. Ajoutez `--force` pour ignorer le cache.

---

## Déploiement sur Vercel

Le projet est prêt à être déployé : un dossier `api/` contient les fonctions,
et `vercel.json` la configuration.

1. Sur [vercel.com](https://vercel.com) → *Add New → Project*, choisir ce dépôt.
2. Ajouter `ANTHROPIC_API_KEY` dans **Settings → Environment Variables** pour
   activer les résumés rédigés par IA (facultatif).
3. *Deploy*. Chaque `git push` redéploie ensuite automatiquement.

### Ce qui change entre le local et la plateforme

La logique de `src/` est **identique** dans les deux cas. Seul le transport
diffère :

| | Local | Vercel |
| --- | --- | --- |
| Serveur | `src/server.js`, processus permanent | `api/*.js`, fonctions à la demande |
| Cache | `.cache/` sur disque | en-têtes `Cache-Control` sur le CDN |
| Clé API | fichier `.env` | variable d'environnement du projet |
| Statique | servi par `server.js` | servi par le CDN depuis `public/` |

Les fonctions de `api/` ne sont que des enveloppes HTTP de quelques lignes
autour des mêmes modules.

### Le cache, remplacé plutôt que porté

Une fonction sans serveur permanent ne peut pas écrire durablement sur disque :
le système de fichiers y est en lecture seule sauf `/tmp`, qui n'est ni partagé
entre instances ni garanti d'un appel à l'autre.

Mais le comportement implémenté à la main dans `src/http.js` — servir une
entrée expirée, puis la rafraîchir en arrière-plan — est un standard HTTP :

```
Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400
```

Le CDN de Vercel l'applique nativement. Le résultat est **meilleur** qu'en
local, car ce cache est partagé par tous les visiteurs : cent consultations
dans l'heure ne déclenchent qu'un seul passage sur les six sites.

| Endpoint | Fraîcheur | Raison |
| --- | --- | --- |
| `/api/articles` | 1 h | même durée que le cache local |
| `/api/recherche` | 6 h | la page `?s=` est l'endpoint le plus lourd des sites |
| `/api/resume` | 1 h | |
| `/api/config` | aucune | dépend de la configuration du déploiement |

`src/http.js` bascule vers `/tmp` quand `process.env.VERCEL` est présent : le
cache disque n'y est plus qu'un gain opportuniste, la vraie protection étant en
amont, sur le CDN.

## À savoir avant de reprendre ce projet

Cette section rassemble ce qui peut surprendre quelqu'un qui récupère le dépôt.

### Ce qui dépend de sites tiers

Le projet **lit des sites qu'il ne contrôle pas**. Trois niveaux de dépendance,
du plus au moins robuste :

| Niveau | Ce qui est utilisé | Si ça change |
| --- | --- | --- |
| Standard | Flux RSS, JSON-LD, `og:image`, REST API WordPress | très peu probable |
| Convention | URL `/tests/feed/`, sitemaps | peu probable |
| **Balisage du thème** | classes `test-conclusion-box-text`, `data-name`, `post-card-title-link`… | **casse à la moindre refonte** |

Le troisième niveau est le point faible. L'extraction des conclusions, des
points forts, des produits recommandés et des résultats de recherche repose sur
les classes CSS du thème GeneratePress personnalisé de ces sites. Une refonte
graphique les ferait disparaître **silencieusement** : l'agrégateur continuerait
de fonctionner, mais les résumés deviendraient vides.

`npm run check` détecte immédiatement ce genre de dégradation — il compte les
articles sans image, sans date et sans extrait.

### Ce qui est chargé depuis l'extérieur au moment de l'affichage

- Les **vignettes des articles** et les **logos des six sites**, depuis les sites
  d'origine.
- Le **logo Whale Media**, depuis whalemedia.eu.
- Les **polices**, depuis Google Fonts.

Rien n'est copié localement. C'est cohérent avec la nature du projet — un
agrégateur qui pointe vers ses sources — mais cela signifie qu'il ne fonctionne
pas hors ligne, et que le logo d'Ultracooker pèse 162 Ko pour un affichage en
39 px.

### Le premier lancement est plus lent

Le cache disque (`.cache/`) est vide au premier démarrage : compter quelques
secondes le temps d'interroger les six sites. Ensuite, l'affichage est
instantané. Le dossier est ignoré par git.

### Le résumé par IA est facultatif

Il est déclaré en `optionalDependencies` : le projet tourne sans lui, avec des
résumés composés localement. Voir « Résumé d'article » plus bas pour l'activer.

### Configuration propre à la machine

`.claude/launch.json` contient un chemin absolu vers Node et **n'est pas
versionné** — il ne sert qu'à l'outillage local.

---

## Comment les articles sont récupérés

Les six sites tournent sur la même infrastructure : WordPress, thème
GeneratePress, Yoast SEO, Polylang FR/IT, cache LiteSpeed, même hébergeur.

Le point structurant, découvert à l'audit : chaque site publie **deux** types de
contenu.

- Les **comparatifs** (« Les Meilleurs X ») sont des `post` WordPress.
- Les **tests produits** (« Test du X ») vivent dans un *custom post type*
  `tests`, qui n'est **pas exposé par la REST API** (404) et **n'apparaît pas
  dans `/feed/`**. Il n'est joignable que par `/tests/feed/`, un flux qui n'est
  déclaré nulle part dans le HTML du site.

Or ce sont souvent les contenus les plus récents. D'où la configuration
suivante, dans [`src/sources.js`](src/sources.js) :

| Site | Source | Raison |
| --- | --- | --- |
| Selectos | `/feed/` | Son CPT `tests` est vide, un seul flux suffit |
| Lavelab, Ultracooker, Coffealover, Bedbedtime | `/feed/` + `/tests/feed/` | Seul moyen d'atteindre les deux types |
| Glamourquest | `/tests/feed/` | `/feed/` et `wp/v2/posts` renvoient du vide |

Les six sites passent par le RSS. La REST API n'est conservée que comme source
de secours pour Selectos : elle répond en **~20 s** contre 0,2 s pour le flux,
parce qu'elle n'est pas mise en cache par LiteSpeed.

Les articles des deux sources sont fusionnés, dédoublonnés par URL, triés par
date de publication décroissante, puis tronqués aux 3 plus récents par site.

### Choix retenus

- **Tri par date de publication**, pas par date de modification. Ces sites
  réactualisent massivement d'anciens comparatifs : trier par modification
  ferait remonter des articles publiés en 2018.
- **Français uniquement.** Les sites sont bilingues (Polylang). Les flux du
  domaine racine sont déjà en français ; l'italien vit sous `/it/`.
- **Contenus sponsorisés exclus.** Selectos publie 10 `article-sponso`, dont
  certains plus récents que ses comparatifs. Pour les intégrer, ajoutez un
  endpoint `wp/v2/article-sponso` dans `src/sources.js`.
- **Cache d'une heure** sur disque. Un cycle complet représente environ 2,5 Mo,
  car les flux embarquent l'article entier.

---

## Robustesse

Tous les endpoints ne se valent pas. Mesures relevées lorsque les sites sont
sous charge :

| Endpoint | Temps | Mis en cache par le site |
| --- | --- | --- |
| Flux RSS | 0,24 s | oui (LiteSpeed) |
| Page d'article | 0,17 s | oui (LiteSpeed) |
| REST API | timeout | non |
| Recherche `?s=` | 9 s | non |

Quatre mécanismes en tiennent compte :

1. **Cache expiré servi immédiatement, rechargé en arrière-plan.** Une entrée
   périmée n'est jamais une raison de faire attendre : elle est renvoyée telle
   quelle, et une requête de fond met le cache à jour pour la fois suivante.
   C'est ce qui rend l'affichage instantané — sans cela, la moindre entrée
   expirée imposait jusqu'à 20 s d'attente.
2. **Cache servi en dernier recours.** Si une source ne répond plus du tout, la
   dernière version connue est réutilisée plutôt que d'échouer. Un 404 fait
   exception : c'est une réponse, pas une panne.
3. **Source de secours par site.** Selectos passe par son flux RSS ; si celui-ci
   tombe, l'agrégateur reprend les mêmes articles via la REST API.
4. **Endpoints interrogés en parallèle.** Le cycle complet est passé de 47 s à
   4 s dans le pire cas observé, et à **~30 ms** dès que le cache est amorcé.

---

## Recherche

La barre de recherche interroge le **catalogue complet** des six sites, pas les
18 articles affichés. Elle répond à une question éditoriale : ce sujet est-il
déjà couvert, et par quels sites ?

### Pourquoi la recherche native `?s=`

- La REST API ignore le CPT `tests`, donc un index bâti dessus serait aveugle à
  la moitié du catalogue.
- Les archives `/tests/` ne sont **pas paginables** : `page/2`, `page/6` et
  `page/9` renvoient toutes les 24 mêmes cartes.
- La recherche `?s=`, elle, couvre les deux types et annonce le total réel.

### Pertinence : traiter d'un sujet ≠ le mentionner

WordPress cherche dans **le corps entier** de l'article. « café » remonte ainsi
182 correspondances, dont 103 sur Lavelab — uniquement des tests d'aspirateurs
qui mentionnent « tache de café ».

Un article n'est retenu que si **tous** les mots significatifs de la requête
figurent dans son **titre**. Les mentions de passage sont écartées, pas
masquées ; seul leur nombre reste affiché. Sur « café » : **22 articles** au lieu
de 182. La comparaison ignore casse et accents.

### Exploration jusqu'à épuisement

Pour annoncer un nombre de pages exact, il faut connaître l'ensemble complet des
résultats pertinents avant le premier affichage. Chaque site est donc parcouru
**jusqu'à la première page sans article pertinent**, ce qui est possible parce
que la pertinence de WordPress décroît de façon nette et monotone :

| Site | page 1 | page 2 | page 3 | Requêtes |
| --- | --- | --- | --- | --- |
| Selectos | 7/10 | 0/10 | — | 2 |
| Lavelab | **0/10** | — | — | **1** |
| Coffealover | 10/10 | 5/10 | 0/10 | 3 |

Les 103 correspondances de Lavelab, toutes des mentions, coûtent ainsi **une**
requête au lieu de onze. Après la première page, les suivantes sont récupérées
par lots de 3. Un garde-fou limite l'exploration à 8 pages par site, et
l'interface le signale si la limite est atteinte.

### Repli sur le mot principal

WordPress exige que **tous** les mots soient présents : « tondeuse a gazon » ne
renvoie rien alors que « tondeuse » remonte 21 articles. Un faux « aucun
résultat » étant le pire échec pour cet usage, la recherche relance
automatiquement avec le mot le plus porteur et le signale.

### Filtrer et paginer

Les pastilles de sites sont cliquables : un clic n'affiche que ce site, un
second retire le filtre. L'aperçu affiche **15 résultats à la fois**, avec des
flèches ← et →. Le jeu de résultats étant complet dès le départ, l'indicateur
affiche un total **exact et fixe** — `1 / 2`, jamais `1 / 2+` — et la navigation
ne déclenche aucune requête.

### Coût

La page `?s=` est **la plus lourde du site** : non mise en cache par LiteSpeed,
elle répond en 9 s environ. Les résultats sont donc gardés **6 heures**, contre
1 heure pour les flux.

> Enchaîner les recherches dégrade les sites : une soixantaine de requêtes `?s=`
> en quelques minutes suffit à les faire tomber en timeout. D'où la validation
> explicite par bouton ou touche Entrée, et non une recherche instantanée.

---

## Résumé d'article

Chaque carte porte un bouton **Résumer** qui déplie une synthèse : verdict, note
sur 10, points forts et points faibles. Le bouton porte une étincelle dessinée
en SVG inline, animée pendant la génération — désactivée sous
`prefers-reduced-motion`.

Le dépliage n'affecte que la carte concernée : `align-items: start` sur la
grille rend chaque carte indépendante, sans quoi ouvrir un résumé allongeait
toutes les cartes voisines.

### Deux fournisseurs

| Fournisseur | Condition | Ce qu'il produit |
| --- | --- | --- |
| `local` | aucune — actif par défaut | Verdict de la rédaction, note, points forts et faibles |
| `claude` | SDK installé et clé présente | Un résumé rédigé de 3 à 4 phrases |

Le fournisseur local n'est pas un bouche-trou. Ces articles comportent déjà une
conclusion écrite par la rédaction : la restituer fidèlement est souvent
préférable à une reformulation, et cela ne coûte rien. Le modèle apporte la
synthèse et la mise en perspective, pas l'information brute.

### Activer le résumé par IA

**1. Installer le SDK**

```bash
npm install @anthropic-ai/sdk
```

**2. Renseigner la clé**

Copiez `.env.exemple` en `.env` à la racine et remplacez la valeur par votre clé
([console.anthropic.com](https://console.anthropic.com/settings/keys)) :

```
ANTHROPIC_API_KEY=sk-ant-...
```

Relancez `npm start`. L'indicateur en pied de page passe au vert.

**Le fichier `.env` est ignoré par git** : la clé ne quitte jamais la machine,
n'entre jamais dans l'historique, et n'est jamais transmise au navigateur. Une
variable d'environnement déjà définie garde la priorité sur le fichier.

`GET /api/config` renvoie l'état exact :
`{ "actif": false, "cle": true, "sdk": false, "manque": "sdk" }`.

### Pourquoi pas un formulaire de connexion dans le site

C'est faisable, mais cela n'apporterait que du confort — et un peu moins de
sécurité : la clé transiterait par le réseau et serait stockée par le serveur,
alors qu'aujourd'hui elle ne quitte pas le disque. Un site qui réclame une clé
API dans un champ est par ailleurs la forme que prennent les tentatives
d'hameçonnage.

Surtout, la clé ne doit **jamais** atteindre le navigateur : appeler l'API
depuis le client la rendrait lisible par n'importe quel visiteur. Le SDK nomme
d'ailleurs cette possibilité `dangerouslyAllowBrowser`.

Si l'outil devient multi-utilisateur, la bonne architecture est de garder **une
seule clé côté serveur** et de contrôler l'accès au site.

### Ce qui est envoyé au modèle

Pas la page. Elle pèse 110 Ko de HTML pour 56 Ko de texte, dont l'essentiel est
du gabarit. [`src/article.js`](src/article.js) en extrait la substance — environ
**1,2 Ko**, quarante fois moins — pour un meilleur résumé : le modèle n'a pas à
démêler l'éditorial des encarts affiliés.

L'extraction se repère sur les conteneurs du thème, pas sur un nombre de
caractères après un titre. Si une troncature reste nécessaire, elle se fait à la
fin d'une phrase.

Le modèle utilisé est `claude-opus-5`, à effort `low` — la tâche est simple et
cadrée.

### Résumer un comparatif, pas l'annoncer

L'introduction d'un comparatif présente souvent la démarche sans rien conclure :
« nous allons vous présenter ceux qui ont obtenu les meilleurs résultats ». S'en
contenter produit un extrait, pas un résumé.

Le verdict est ailleurs : dans les encarts de recommandation, où chaque produit
retenu porte un attribut `data-name` et un libellé de gamme.

> Comparatif de 8 fours à pizza électriques. Sélection : Ninja Artisan —
> meilleur milieu de gamme ; G3 Ferrari Delizia — meilleur pas cher ;
> Tefal Pizza Pronto — alternative milieu de gamme.

L'appariement gamme ↔ produit demande deux stratégies, car le balisage diffère
selon le plugin : sur la plupart des sites le produit précède son libellé d'une
centaine de caractères, mais sur Selectos les libellés sont **groupés 37 000
caractères avant** les produits. Les deux listes ayant la même longueur et le
même ordre, l'appariement se fait par rang, la proximité servant de repli.

Quand l'introduction **est déjà** un verdict et nomme le produit retenu, c'est
elle qui est conservée : les deux feraient doublon.

### Garde-fou

`/api/resume` n'accepte que des URL **https des six domaines du réseau**. Sans
cette vérification, l'endpoint deviendrait un proxy capable d'aller chercher
n'importe quelle adresse depuis le serveur. Toute autre URL reçoit un 400.

---

## Interface

### En-tête et mise en page

L'en-tête porte l'identité — logo Whale Media, mention « Réseau », note
technique — et la recherche, à droite. Le titre « Derniers articles » est
descendu dans le contenu.

Le comptage et la fraîcheur sont placés **sous** les articles : ce sont des
informations de contrôle, qui se lisent après avoir parcouru la liste. La ligne
porte aussi l'action « Actualiser », qui force la régénération du cache — utile
seulement après une publication, puisque le cache se rafraîchit seul.

### Filtres

Un simple bouton texte, sans cadre ni fond : replié, le panneau ne pèse rien
visuellement. Il n'affiche son récapitulatif que lorsqu'un filtre est actif.
Deux groupes : site et format.

Le chevron est dessiné en CSS et non avec un caractère : « ▸ » n'existe pas dans
JetBrains Mono et retombait sur une police de secours.

### Palette

L'accent reprend le bleu de Whale Media, relevé sur whalemedia.eu :

| Thème | Accent | Contraste |
| --- | --- | --- |
| Clair | `#1e73be` — le bleu d'origine | 4,94 sur blanc |
| Sombre | `#2386dc` — éclairci | 4,59 sur les cartes |

Le blanc posé sur ce bleu atteint 4,94, ce qui rend les boutons pleins lisibles
sans ajustement.

> Le bleu de Selectos (`#377dff`) est proche de celui du réseau. Ils ne se
> croisent jamais dans le même rôle — l'accent habille l'interface, la couleur
> de Selectos n'apparaît que sur son filet et sa pastille de filtre.

### Logos et couleurs des sites

Chaque article porte le **logo de son site** à la place du nom, et chaque carte
un **filet vertical** à la couleur de ce site. Logos et couleurs sont relevés sur
les sites eux-mêmes (variable `--accent` de leur thème).

Les logos sont posés sur une **pastille blanche dans les deux thèmes** : dessinés
pour un en-tête blanc, ils contiennent tous des couleurs sombres — bleu nuit
chez Selectos, vert profond chez Lavelab — et disparaîtraient sur fond sombre.

Deux variables par site, parce que les contraintes diffèrent :

| Variable | Usage | Contrainte |
| --- | --- | --- |
| `--marque` | fond de l'étiquette de repli | le texte s'y adapte, la couleur reste exacte |
| `--marque-filet` | filet de la carte, pastille de filtre | posée sur le fond de page, elle est éclaircie en thème sombre |

| Site | Couleur | Contraste de l'étiquette |
| --- | --- | --- |
| Selectos | `#377dff` bleu | 4,83 |
| Lavelab | `#2bccab` turquoise | 9,00 |
| Ultracooker | `#d40092` magenta | 4,98 |
| Coffealover | `#72300c` brun | 9,80 |
| Bedbedtime | `#faaf03` jaune | 9,76 |
| Glamourquest | `#fb816f` corail | 7,38 |

Les proportions des logos vont de **2,58** à **5,36** : c'est la hauteur qui est
fixée, la largeur suivant chacun. Deux SVG n'ont ni `width` ni `height` et
étaient rendus à zéro pixel de large ; leurs proportions sont déclarées dans
`sources.js` et appliquées via `aspect-ratio`.

**Le nom du site n'est jamais perdu** : il reste porté par l'attribut `alt`, lu
par les lecteurs d'écran, et l'étiquette textuelle colorée reprend sa place si
un logo ne charge pas.

### Date de retouche

Les cartes affichent la date de dernière modification à côté de la date de
publication **quand elles diffèrent** — 7 articles sur 18 dans l'état actuel.

Les flux RSS ne transportent que la date de publication. Elle est donc lue dans
le `dateModified` du JSON-LD de la page — **sans requête supplémentaire**,
puisque cette page est déjà récupérée pour la vignette. Le sitemap l'expose
aussi dans `lastmod`, et les deux coïncident exactement, mais le
`post-sitemap.xml` de Selectos pèse 407 Ko.

---

## Structure

```
src/
  config.js     Chargement du fichier .env
  sources.js    Configuration des six sites, logos et endpoints
  http.js       Requêtes HTTP, cache disque, rafraîchissement de fond
  rss.js        Lecture des flux RSS
  wp-rest.js    Lecture de la REST API WordPress
  html.js       Nettoyage HTML, extraits, images, date de modification
  aggregate.js  Fusion, dédoublonnage, tri, enrichissement
  recherche.js  Recherche fédérée sur les six sites
  article.js    Extraction de la substance d'un article
  resume.js     Choix du fournisseur et résumé local
  resume-claude.js  Résumé rédigé par Claude (dépendance facultative)
  server.js     Serveur HTTP et API
  check.js      Contrôle en ligne de commande
  refresh.js    Régénération forcée du cache
public/         Interface web (index.html, style.css, app.js)
```

### API

| Endpoint | Rôle |
| --- | --- |
| `GET /api/articles` | Les 3 derniers articles par site (`?force=1` ignore le cache) |
| `GET /api/recherche?q=` | Recherche fédérée sur les six catalogues |
| `GET /api/resume?url=` | Résumé d'un article du réseau |
| `GET /api/config` | État du fournisseur de résumé |

---

## Limites et pistes

- **Parsing XML maison.** [`src/rss.js`](src/rss.js) s'appuie sur la structure
  connue et vérifiée de ces six flux. Pour accepter des sources arbitraires,
  le remplacer par un vrai parseur (`fast-xml-parser`).
- **Extraction liée au thème des sites.** Voir « À savoir avant de reprendre ce
  projet » : une refonte graphique casserait les résumés silencieusement. Un
  test de bout en bout comparant les compteurs de `npm run check` à des seuils
  attendus détecterait la régression automatiquement.
- **Pas de requêtes conditionnelles.** Le cache fonctionne par expiration.
  Ajouter `If-Modified-Since` réduirait nettement le trafic.
- **Pas de persistance.** Les articles ne sont pas stockés : à chaque expiration
  du cache, tout est re-téléchargé. Une base de données permettrait un
  historique et une détection des nouveautés.
- **Aucun test automatisé.** Les vérifications ont été faites à la main et par
  `npm run check`. Un jeu de pages HTML figées permettrait de tester
  l'extraction sans dépendre du réseau ni des sites.
- **Ressources externes non copiées.** Logos, vignettes et polices sont chargés
  depuis leurs serveurs d'origine ; le projet ne fonctionne pas hors ligne.

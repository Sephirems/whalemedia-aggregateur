# Agrégateur WhaleMedia

### 👉 **[Voir la démonstration en ligne](https://whalemedia-aggregateur.vercel.app)**

Rassemble les derniers articles de six sites WordPress — Selectos, Lavelab,
Ultracooker, Coffealover, Bedbedtime et Glamourquest — avec une recherche sur
l'ensemble de leurs catalogues et un résumé par article.

Tourne avec Node seul, sans aucune dépendance.

> **Projet personnel à but démonstratif.** Développé de façon indépendante à des
> fins de démonstration technique. Il n'est ni affilié à, ni commandité, ni
> officiellement approuvé par Whale Media. Les noms, marques, logos, articles,
> images et contenus appartiennent à leurs propriétaires respectifs. Les données
> proviennent de sources publiques et chaque article renvoie vers son site
> d'origine. Aucun contenu n'est republié ni exploité commercialement.

---

## Ce que fait l'outil

- **Agrège** les 3 derniers articles de chaque site, images et dates comprises.
- **Cherche** dans leurs catalogues complets — « a-t-on déjà écrit sur ce
  sujet ? » — en écartant les articles qui ne font que mentionner le terme.
- **Résume** un article à la demande : verdict, note, points forts et faibles.
- **Tient debout** quand un site ralentit ou ne répond plus.

---

## Activer les résumés rédigés par IA

Par défaut, les résumés reprennent la conclusion de la rédaction. Avec une clé
API Anthropic, ils sont **rédigés** par Claude.

### Sur le site déployé (Vercel)

1. Ouvrez votre projet → **Settings → Environment Variables**
2. Ajoutez `ANTHROPIC_API_KEY` avec votre clé
   ([console.anthropic.com](https://console.anthropic.com/settings/keys))
3. **Deployments** → menu ⋯ du dernier déploiement → **Redeploy**

Le SDK est déjà installé automatiquement. `GET /api/config` indique l'état :
`{"actif":true}` quand tout est en place.

### En local

```bash
npm install @anthropic-ai/sdk
```

Copiez `.env.exemple` en `.env` et renseignez votre clé :

```
ANTHROPIC_API_KEY=sk-ant-...
```

**Le fichier `.env` est ignoré par git** : la clé ne quitte jamais la machine et
n'est jamais transmise au navigateur. Elle ne doit d'ailleurs **jamais** y
parvenir — appeler l'API depuis le client la rendrait lisible par tout visiteur.

---

## Lancer en local

**Prérequis : Node 20 ou plus.** Aucun `npm install` n'est nécessaire.

```bash
npm start
```

Puis <http://localhost:3000>.

| Commande | Effet |
| --- | --- |
| `npm start` | Serveur et interface, avec rechargement automatique |
| `npm run check` | Vérifie en terminal ce que chaque site renvoie |
| `npm run refresh` | Force la régénération du cache |

---

## Comment ça marche

### La découverte qui a déterminé l'architecture

Les six sites publient **deux** types de contenu :

- les **comparatifs** (« Les Meilleurs X »), des `post` WordPress ;
- les **tests produits** (« Test du X »), dans un *custom post type* `tests`
  **absent de la REST API** (404) et **du flux principal**. Il n'est joignable
  que par `/tests/feed/`, un flux déclaré nulle part dans le HTML.

Or ce sont souvent les contenus les plus récents. Un agrégateur branché sur les
sources évidentes rate la production la plus fraîche de cinq sites sur six.

| Site | Source retenue |
| --- | --- |
| Selectos | `/feed/` — son CPT `tests` est vide |
| Lavelab, Ultracooker, Coffealover, Bedbedtime | `/feed/` + `/tests/feed/` |
| Glamourquest | `/tests/feed/` — le reste renvoie du vide |

### Robustesse

Tous les endpoints ne se valent pas. Mesures sous charge :

| Endpoint | Temps | Mis en cache par le site |
| --- | --- | --- |
| Flux RSS | 0,24 s | oui |
| Page d'article | 0,17 s | oui |
| REST API | timeout | non |
| Recherche `?s=` | 9 s | non |

D'où quatre mécanismes : cache expiré servi immédiatement puis rafraîchi en
arrière-plan, dernière version connue en cas de panne, source de secours par
site, et endpoints interrogés en parallèle. Le cycle complet est passé de 47 s
à 4 s dans le pire cas, et à **~30 ms** cache amorcé.

### Recherche : traiter d'un sujet ≠ le mentionner

WordPress cherche dans le corps entier de l'article. « café » remonte 182
correspondances, dont 103 sur Lavelab — uniquement des tests d'aspirateurs
mentionnant « tache de café ».

Un article n'est retenu que si tous les mots figurent dans son **titre** :
**22 articles** au lieu de 182. Chaque site est exploré jusqu'à la première page
sans résultat pertinent, ce qui donne un nombre de pages exact — et fait passer
Lavelab d'onze requêtes à une seule.

### Résumés

On n'envoie pas la page au modèle : 110 Ko de HTML pour 56 Ko de texte, dont
l'essentiel est du gabarit. `src/article.js` en extrait la substance —
**1,2 Ko**, quarante fois moins — pour un meilleur résultat.

Pour un comparatif, l'introduction annonce souvent sans conclure. Le verdict est
dans les encarts de recommandation :

> Comparatif de 8 fours à pizza électriques. Sélection : Ninja Artisan —
> meilleur milieu de gamme ; G3 Ferrari Delizia — meilleur pas cher.

`/api/resume` n'accepte que les URL des six domaines : sans ce garde-fou,
l'endpoint deviendrait un proxy ouvert.

---

## Structure

```
api/            Fonctions Vercel — enveloppes HTTP autour de src/
src/
  sources.js    Les six sites, leurs endpoints, logos et couleurs
  http.js       Requêtes, cache, rafraîchissement en arrière-plan
  rss.js        Flux RSS          wp-rest.js   REST API WordPress
  html.js       Nettoyage, images, dates
  aggregate.js  Fusion, tri, enrichissement
  recherche.js  Recherche fédérée
  article.js    Extraction de la substance d'un article
  resume.js     Fournisseur de résumé (+ resume-claude.js)
  server.js     Serveur local     check.js / refresh.js
public/         Interface (index.html, style.css, app.js)
```

| Endpoint | Rôle |
| --- | --- |
| `GET /api/articles` | Les 3 derniers articles par site |
| `GET /api/recherche?q=` | Recherche sur les six catalogues |
| `GET /api/resume?url=` | Résumé d'un article du réseau |
| `GET /api/config` | État du fournisseur de résumé |

---

## Points de vigilance

**L'extraction dépend du thème des sites.** Les conclusions, points forts et
produits recommandés sont lus dans les classes CSS de leur thème
GeneratePress. Une refonte graphique les ferait disparaître **silencieusement** :
l'agrégateur tournerait toujours, mais les résumés se videraient.
`npm run check` détecte immédiatement ce genre de dégradation.

**Les ressources sont chargées depuis l'extérieur.** Vignettes, logos et polices
viennent des serveurs d'origine : le projet ne fonctionne pas hors ligne.

**Aucun test automatisé.** Les vérifications se font à la main et via
`npm run check`. Un jeu de pages HTML figées permettrait de tester l'extraction
sans dépendre du réseau.

**Pas de persistance.** À chaque expiration du cache, tout est retéléchargé.
Une base de données permettrait un historique et une détection des nouveautés.

**Parsing XML maison.** `src/rss.js` s'appuie sur la structure connue de ces six
flux ; pour des sources arbitraires, un vrai parseur serait nécessaire.

---

## Déploiement

Le projet est configuré pour Vercel — `vercel.json` déclare les fonctions de
`api/` et le service statique de `public/`. Chaque `git push` redéploie.

La logique de `src/` est identique en local et en ligne ; seul le transport
change. Le cache disque, impossible sur une plateforme sans serveur permanent,
est remplacé par les en-têtes `Cache-Control` du CDN — même comportement, mais
partagé entre tous les visiteurs : cent consultations dans l'heure ne
déclenchent qu'un seul passage sur les six sites.

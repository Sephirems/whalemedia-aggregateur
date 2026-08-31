/** Interface de l'agrégateur : chargement, filtres et rendu des cartes. */

const grille = document.querySelector('#grille');
const resume = document.querySelector('#resume');
const compteur = document.querySelector('#compteur');
const ligneEtat = document.querySelector('.etat-ligne');
const message = document.querySelector('#message');
const boutonRafraichir = document.querySelector('#rafraichir');
const filtresSite = document.querySelector('#filtres-site');
const filtresType = document.querySelector('#filtres-type');
const resumeFiltres = document.querySelector('#filtres-resume');
const diagnostic = document.querySelector('#diagnostic');
const listeDiagnostic = document.querySelector('#liste-diagnostic');

let donnees = null;
let siteActif = 'tous';
let typeActif = 'tous';

const formatDate = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const formatHeure = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
});

/* ---------- chargement ---------- */

async function charger({ forcer = false } = {}) {
  boutonRafraichir.disabled = true;
  boutonRafraichir.textContent = forcer ? 'Actualisation…' : 'Chargement…';
  message.hidden = true;
  afficherSquelette();

  try {
    const reponse = await fetch(`/api/articles${forcer ? '?force=1' : ''}`);
    if (!reponse.ok) throw new Error(`Le serveur a répondu ${reponse.status}.`);

    donnees = await reponse.json();
    memoriserLogos(donnees.sites);
    construireFiltres();
    rendre();
    rendreDiagnostic();

    // Le nombre d'articles est déjà donné par la ligne de comptage juste
    // au-dessus : on ne garde ici que ce qu'elle ne dit pas, la fraîcheur.
    resume.textContent = `Mis à jour à ${formatHeure.format(new Date(donnees.genereLe))}`;
  } catch (erreur) {
    grille.innerHTML = '';
    compteur.textContent = '';
    resume.textContent = 'Indisponible';
    message.hidden = false;
    message.textContent = `Impossible de récupérer les articles : ${erreur.message} Vérifiez que le serveur tourne, puis réessayez.`;
  } finally {
    boutonRafraichir.disabled = false;
    boutonRafraichir.textContent = 'Actualiser';
  }
}

/* ---------- filtres ---------- */

function construireFiltres() {
  const sites = [
    { cle: 'tous', libelle: 'Tous', nombre: donnees.nombreArticles },
    ...donnees.sites.map((site) => ({
      cle: site.id,
      libelle: site.nom,
      nombre: site.articles.length,
      couleur: true,
    })),
  ];

  const types = ['Comparatif', 'Test'].filter((type) =>
    donnees.articles.some((article) => article.type === type)
  );

  const listeTypes = [
    { cle: 'tous', libelle: 'Tous', nombre: donnees.nombreArticles },
    ...types.map((type) => ({
      cle: type,
      libelle: type,
      nombre: donnees.articles.filter((article) => article.type === type).length,
    })),
  ];

  peuplerChips(filtresSite, sites, siteActif, (cle) => {
    siteActif = cle;
    construireFiltres();
    rendre();
  });

  peuplerChips(filtresType, listeTypes, typeActif, (cle) => {
    typeActif = cle;
    construireFiltres();
    rendre();
  });

  resumerFiltres();
}

/** Récapitule les filtres actifs dans l'en-tête du panneau replié. */
function resumerFiltres() {
  const actifs = [];
  if (siteActif !== 'tous') {
    actifs.push(donnees.sites.find((s) => s.id === siteActif)?.nom ?? siteActif);
  }
  if (typeActif !== 'tous') actifs.push(typeActif);

  // Sans filtre actif, le récapitulatif n'apprend rien : on le retire plutôt
  // que d'afficher « aucun » à côté du libellé.
  resumeFiltres.textContent = actifs.length > 0 ? `· ${actifs.join(' · ')}` : '';
  resumeFiltres.classList.toggle('actif', actifs.length > 0);
}

function peuplerChips(conteneur, entrees, actif, auClic) {
  conteneur.replaceChildren(
    ...entrees.map((entree) => {
      const bouton = document.createElement('button');
      bouton.type = 'button';
      bouton.className = 'chip';
      bouton.setAttribute('aria-pressed', String(entree.cle === actif));
      // Seuls les filtres de site portent une couleur ; « Tous » et les
      // formats n'en ont pas.
      if (entree.couleur) bouton.dataset.site = entree.cle;
      bouton.append(entree.libelle);

      const decompte = document.createElement('span');
      decompte.className = 'decompte';
      decompte.textContent = entree.nombre;
      bouton.append(decompte);

      bouton.addEventListener('click', () => auClic(entree.cle));
      return bouton;
    })
  );
}

function articlesVisibles() {
  return donnees.articles.filter(
    (article) =>
      (siteActif === 'tous' || article.site === siteActif) &&
      (typeActif === 'tous' || article.type === typeActif)
  );
}

/* ---------- rendu ---------- */

function rendre() {
  const articles = articlesVisibles();

  compteur.textContent = articles.length
    ? `${articles.length} article${articles.length > 1 ? 's' : ''} affiché${articles.length > 1 ? 's' : ''}, du plus récent au plus ancien`
    : '';

  if (articles.length === 0) {
    grille.replaceChildren();
    message.hidden = false;
    message.textContent = 'Aucun article ne correspond à ce filtre.';
    return;
  }

  message.hidden = true;
  grille.replaceChildren(...articles.map(construireCarte));
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Change le libellé du bouton en conservant son icône.
 * Un simple `textContent = …` l'effacerait.
 */
function etiqueterBouton(bouton, texte) {
  bouton.replaceChildren(iconeGeneration(), document.createTextNode(texte));
}

/**
 * Icône du bouton de résumé : une étincelle, signe convenu d'un contenu
 * produit à la demande.
 *
 * Dessinée en SVG inline plutôt que chargée depuis un fichier ou une police
 * d'icônes : elle hérite de `currentColor`, donc suit la couleur du bouton dans
 * les deux thèmes, et n'ajoute aucune requête.
 *
 * Purement décorative : le bouton porte déjà son libellé, l'icône est donc
 * masquée aux lecteurs d'écran.
 */
function iconeGeneration() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'icone-generation');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  // Étincelle principale, puis une seconde plus petite en retrait.
  for (const [d, classe] of [
    ['M11 2.5 L12.9 8.6 L19 10.5 L12.9 12.4 L11 18.5 L9.1 12.4 L3 10.5 L9.1 8.6 Z', 'etincelle'],
    ['M18 14 L18.9 16.6 L21.5 17.5 L18.9 18.4 L18 21 L17.1 18.4 L14.5 17.5 L17.1 16.6 Z', 'etincelle petite'],
  ]) {
    const forme = document.createElementNS(SVG_NS, 'path');
    forme.setAttribute('d', d);
    forme.setAttribute('fill', 'currentColor');
    forme.setAttribute('class', classe);
    svg.append(forme);
  }

  return svg;
}

/** Logos des sites, indexés par identifiant, renseignés au chargement. */
const logosParSite = new Map();

/** Mémorise le logo d'un site et ses proportions. */
function memoriserLogos(sites) {
  for (const site of sites ?? []) {
    if (site.logo) logosParSite.set(site.id, { url: site.logo, ratio: site.logoRatio });
  }
}

/**
 * Étiquette d'origine d'un article : le logo du site, à défaut son nom.
 *
 * Le logo est posé sur une pastille claire dans les deux thèmes. Ces logos sont
 * dessinés pour un en-tête blanc et contiennent tous des couleurs sombres —
 * le bleu nuit de Selectos, le vert profond de Lavelab — qui disparaîtraient
 * sur le fond sombre de l'interface.
 *
 * Le nom du site reste porté par l'attribut `alt` : l'information n'est jamais
 * uniquement visuelle, et elle survit à un logo qui ne charge pas.
 */
function construireBadgeSite(article) {
  const logo = logosParSite.get(article.site);

  if (!logo) {
    const texte = document.createElement('span');
    texte.className = 'badge-site';
    texte.textContent = article.siteNom;
    return texte;
  }

  const pastille = document.createElement('span');
  pastille.className = 'badge-logo';

  const image = document.createElement('img');
  image.src = logo.url;
  image.alt = article.siteNom;
  image.loading = 'lazy';
  // Deux de ces SVG n'ont ni width ni height : sans proportions déclarées,
  // le navigateur les rend à zéro pixel de large. On les lui fournit.
  if (logo.ratio) image.style.aspectRatio = String(logo.ratio);
  // Si le logo distant échoue, on retombe sur l'étiquette textuelle colorée.
  image.addEventListener(
    'error',
    () => {
      const repli = document.createElement('span');
      repli.className = 'badge-site';
      repli.textContent = article.siteNom;
      pastille.replaceWith(repli);
    },
    { once: true }
  );

  pastille.append(image);
  return pastille;
}

/* ---------- résumé d'un article ---------- */

/** Résumés déjà obtenus, pour ne pas refaire la demande. */
const resumesConnus = new Map();

/**
 * Annonce le mode de résumé actif, et ce qui manque le cas échéant.
 * La clé n'apparaît jamais ici : l'interface ne fait que lire un état.
 */
async function annoncerModeResume() {
  const zone = document.querySelector('#mode-resume');
  if (!zone) return;

  try {
    const etat = await (await fetch('/api/config')).json();

    if (etat.actif) {
      zone.className = 'mode-resume actif';
      zone.textContent = 'Résumés rédigés par Claude.';
      return;
    }

    // Les étapes d'activation vivent dans le README, pas dans l'interface :
    // elles s'adressent à qui installe le projet, pas à qui le consulte.
    zone.className = 'mode-resume';
    zone.textContent =
      'Résumés issus des conclusions de la rédaction. Voir le README pour les faire rédiger par Claude.';
  } catch {
    zone.hidden = true;
  }
}

async function afficherResume(article, panneau, bouton) {
  panneau.hidden = false;
  etiqueterBouton(bouton, 'Masquer le résumé');

  // Résumé déjà obtenu : rien à redemander au serveur.
  if (resumesConnus.has(article.url)) {
    rendreResume(resumesConnus.get(article.url), panneau);
    return;
  }

  bouton.disabled = true;
  etiqueterBouton(bouton, 'Lecture…');
  panneau.replaceChildren(paragraphe('Lecture de l’article en cours…', 'resume-attente'));

  try {
    const reponse = await fetch(`/api/resume?url=${encodeURIComponent(article.url)}`);
    const donnees = await reponse.json();
    if (!reponse.ok) throw new Error(donnees.erreur ?? `Le serveur a répondu ${reponse.status}.`);

    resumesConnus.set(article.url, donnees);
    rendreResume(donnees, panneau);
  } catch (erreur) {
    panneau.replaceChildren(paragraphe(`Résumé indisponible : ${erreur.message}`, 'resume-attente'));
  } finally {
    bouton.disabled = false;
    etiqueterBouton(bouton, 'Masquer le résumé');
  }
}

function rendreResume(donnees, panneau) {
  const morceaux = [];

  if (donnees.erreur) {
    panneau.replaceChildren(paragraphe(donnees.erreur, 'resume-attente'));
    return;
  }

  const texte = document.createElement('p');
  texte.className = 'resume-texte';
  texte.textContent = donnees.texte;
  morceaux.push(texte);

  for (const [signe, points] of [['+', donnees.positifs], ['−', donnees.negatifs]]) {
    if (!points?.length) continue;
    const liste = document.createElement('ul');
    liste.className = signe === '+' ? 'resume-points positifs' : 'resume-points negatifs';
    for (const point of points.slice(0, 4)) {
      const item = document.createElement('li');
      item.textContent = point;
      liste.append(item);
    }
    morceaux.push(liste);
  }

  const pied = document.createElement('p');
  pied.className = 'resume-source';
  // La provenance diffère selon le genre : un test a une conclusion rédigée,
  // un comparatif a une sélection de produits.
  pied.textContent =
    donnees.fournisseur === 'claude'
      ? `Résumé rédigé par ${donnees.modele}`
      : donnees.genre === 'comparatif'
        ? 'Synthèse issue de la sélection de la rédaction'
        : 'Synthèse issue de la conclusion de la rédaction';
  morceaux.push(pied);

  if (donnees.avertissement) {
    morceaux.push(paragraphe(donnees.avertissement, 'resume-attente'));
  }

  panneau.replaceChildren(...morceaux);
}

function construireCarte(article) {
  const carte = document.createElement('article');
  carte.className = 'carte';
  // Porte la couleur de marque du site (voir --marque dans la feuille de style).
  carte.dataset.site = article.site;

  const lien = document.createElement('a');
  lien.className = 'carte-lien';
  lien.href = article.url;
  lien.target = '_blank';
  lien.rel = 'noopener noreferrer';

  if (article.image) {
    const image = document.createElement('img');
    image.className = 'vignette';
    image.src = article.image;
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    // Si l'image distante échoue, on retombe sur le bloc de remplacement.
    image.addEventListener('error', () => image.replaceWith(vignetteAbsente()), { once: true });
    lien.append(image);
  } else {
    lien.append(vignetteAbsente());
  }

  const corps = document.createElement('div');
  corps.className = 'carte-corps';

  const meta = document.createElement('div');
  meta.className = 'carte-meta';

  const badgeSite = construireBadgeSite(article);

  const badgeType = document.createElement('span');
  badgeType.className = 'badge-type';
  badgeType.textContent = article.type;

  meta.append(badgeSite, badgeType);

  const titre = document.createElement('h3');
  titre.textContent = article.titre;

  const extrait = document.createElement('p');
  extrait.className = 'carte-extrait';
  extrait.textContent = article.extrait;

  const date = document.createElement('time');
  date.className = 'carte-date';
  if (article.date) {
    date.dateTime = article.date;
    date.textContent = formatDate.format(new Date(article.date));
    // La date de modification n'est montrée que si elle apporte une
    // information : sinon elle répète la date de publication.
    if (article.modifie && article.modifie.slice(0, 10) !== article.date.slice(0, 10)) {
      date.append(` · retouché le ${formatDate.format(new Date(article.modifie))}`);
    }
  } else {
    date.textContent = 'Date inconnue';
  }

  corps.append(meta, titre, extrait, date);
  lien.append(corps);
  carte.append(lien);

  // Le bouton vit hors du lien : imbriquer un bouton dans un <a> casserait
  // la navigation au clavier autant que le clic.
  const pied = document.createElement('div');
  pied.className = 'carte-pied';

  const panneau = document.createElement('div');
  panneau.className = 'resume';
  panneau.hidden = true;

  const bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.className = 'bouton-resume';
  etiqueterBouton(bouton, 'Résumer');
  bouton.addEventListener('click', () => {
    if (panneau.hidden) {
      afficherResume(article, panneau, bouton);
    } else {
      panneau.hidden = true;
      etiqueterBouton(bouton, 'Résumer');
    }
  });

  pied.append(bouton);
  carte.append(pied, panneau);
  return carte;
}

function vignetteAbsente() {
  const bloc = document.createElement('div');
  bloc.className = 'vignette-absente';
  bloc.textContent = 'Sans visuel';
  return bloc;
}

function afficherSquelette() {
  grille.replaceChildren(
    ...Array.from({ length: 6 }, () => {
      const carte = document.createElement('article');
      carte.className = 'carte squelette';
      carte.setAttribute('aria-hidden', 'true');
      carte.append(vignetteAbsente());

      const corps = document.createElement('div');
      corps.className = 'carte-corps';
      for (const classe of ['barre courte', 'barre longue', 'barre longue']) {
        const barre = document.createElement('div');
        barre.className = classe;
        corps.append(barre);
      }
      carte.append(corps);
      return carte;
    })
  );
}

/* ---------- diagnostic des sources ---------- */

function rendreDiagnostic() {
  const lignes = donnees.sites.flatMap((site) =>
    site.avertissements.map((avertissement) => ({ site, avertissement }))
  );

  if (lignes.length === 0) {
    diagnostic.hidden = true;
    return;
  }

  diagnostic.hidden = false;
  listeDiagnostic.replaceChildren(
    ...lignes.map(({ site, avertissement }) => {
      const ligne = document.createElement('li');

      const etat = document.createElement('span');
      etat.className = avertissement.attendu ? 'attendu' : 'anomalie';
      etat.textContent = avertissement.attendu ? 'Attendu' : 'Anomalie';

      const source = document.createElement('code');
      source.textContent = avertissement.endpoint;

      ligne.append(etat, ` — ${site.nom} : `, source);
      return ligne;
    })
  );
}

/* ---------- recherche fédérée ---------- */

const formulaire = document.querySelector('#formulaire-recherche');
const champ = document.querySelector('#champ-recherche');
const boutonChercher = document.querySelector('#bouton-chercher');
const boutonEffacer = document.querySelector('#bouton-effacer');
const zoneResultats = document.querySelector('#resultats');
const filtres = document.querySelector('.filtres');

/**
 * État de la recherche en cours. Les résultats s'accumulent au fil des pages
 * chargées ; le filtre par site et l'affichage des mentions sont appliqués à
 * ce stock local, sans nouvelle requête réseau.
 */
let recherche = null;

/** Résultats montrés d'un coup dans l'aperçu. */
const PAR_VUE = 15;

/** Bascule entre la vue « derniers articles » et la vue « résultats ». */
function afficherVueRecherche(active) {
  zoneResultats.hidden = !active;
  filtres.hidden = active;
  grille.hidden = active;
  compteur.hidden = active;
  ligneEtat.hidden = active;
  boutonEffacer.hidden = !active;
}

async function chercher(requete) {
  boutonChercher.disabled = true;
  boutonChercher.textContent = 'Recherche…';
  afficherVueRecherche(true);
  recherche = null;
  zoneResultats.replaceChildren(
    paragraphe(
      'Parcours des six sites jusqu’au dernier article pertinent — quelques secondes à la première recherche.',
      'titre-section'
    )
  );

  try {
    const reponse = await fetch(`/api/recherche?q=${encodeURIComponent(requete)}`);
    if (!reponse.ok) throw new Error(`Le serveur a répondu ${reponse.status}.`);

    recherche = { ...(await reponse.json()), siteFiltre: 'tous', vue: 1 };
    memoriserLogos(recherche.sites);
    rendreResultats();
  } catch (erreur) {
    zoneResultats.replaceChildren(
      bloc('message', `La recherche a échoué : ${erreur.message}`)
    );
  } finally {
    boutonChercher.disabled = false;
    boutonChercher.textContent = 'Chercher';
  }
}

/** Résultats retenus par le filtre de site. */
function resultatsAffiches() {
  return recherche.siteFiltre === 'tous'
    ? recherche.resultats
    : recherche.resultats.filter((article) => article.site === recherche.siteFiltre);
}

function rendreResultats() {
  const donnees = recherche;
  const morceaux = [];

  if (donnees.trop_court) {
    zoneResultats.replaceChildren(bloc('message', 'Saisissez au moins deux caractères.'));
    return;
  }

  const couvert = donnees.total > 0;

  /* --- verdict --- */
  const verdict = document.createElement('div');
  verdict.className = `verdict ${couvert ? 'verdict-couvert' : 'verdict-vierge'}`;

  const titre = document.createElement('p');
  titre.className = 'verdict-titre';
  titre.textContent = couvert
    ? `${donnees.total} article${donnees.total > 1 ? 's' : ''} sur « ${donnees.requete} »`
    : `Aucun article consacré à « ${donnees.requete} »`;

  const detail = document.createElement('p');
  detail.textContent = couvert
    ? `Sujet traité sur ${donnees.sitesConcernes} site${donnees.sitesConcernes > 1 ? 's' : ''} du réseau.`
    : "Aucun des six sites n'a d'article consacré à ce sujet.";

  verdict.append(titre, detail);

  // Les mentions de passage sont écartées, mais leur nombre reste une
  // information : il dit à quel point le terme circule dans le réseau.
  if (donnees.mentionsIgnorees > 0) {
    const nuance = document.createElement('p');
    nuance.className = 'nuance';
    nuance.textContent = `${donnees.mentionsIgnorees} autres articles mentionnent le terme sans y être consacrés — écartés.`;
    verdict.append(nuance);
  }

  /* --- répartition cliquable --- */
  const repartition = document.createElement('div');
  repartition.className = 'repartition';
  repartition.append(chipSite('tous', 'Tous', donnees.total));
  for (const site of donnees.sites) {
    repartition.append(chipSite(site.id, site.nom, site.pertinents, site.total));
  }
  verdict.append(repartition);
  morceaux.push(verdict);

  /* --- repli sur le mot principal --- */
  if (donnees.repli) {
    const repli = document.createElement('div');
    repli.className = 'repli';
    repli.append('La recherche exige tous les mots. En cherchant plutôt ');
    const mot = document.createElement('b');
    mot.textContent = `« ${donnees.repli.requete} »`;
    repli.append(mot, ` : ${donnees.repli.total} article${donnees.repli.total > 1 ? 's' : ''} trouvé${donnees.repli.total > 1 ? 's' : ''}.`);
    const relancer = document.createElement('button');
    relancer.type = 'button';
    relancer.className = 'lien-action';
    relancer.textContent = 'Relancer avec ce mot';
    relancer.addEventListener('click', () => {
      champ.value = donnees.repli.requete;
      chercher(donnees.repli.requete);
    });
    repli.append(' ', relancer);
    morceaux.push(repli);
  }

  /* --- liste paginée --- */
  const affiches = resultatsAffiches();

  if (affiches.length === 0) {
    morceaux.push(bloc('repli', 'Aucun résultat pour ce filtre.'));
  } else {
    const nbVues = Math.max(1, Math.ceil(affiches.length / PAR_VUE));
    donnees.vue = Math.min(Math.max(1, donnees.vue), nbVues);

    const debut = (donnees.vue - 1) * PAR_VUE;
    const tranche = affiches.slice(debut, debut + PAR_VUE);

    morceaux.push(
      paragraphe(
        `${debut + 1}–${debut + tranche.length} sur ${affiches.length}`,
        'titre-section'
      )
    );

    const liste = document.createElement('div');
    liste.className = 'liste-resultats';
    liste.append(...tranche.map(construireResultat));
    morceaux.push(liste);

    // Le jeu de résultats est complet, donc le nombre de pages est définitif.
    if (nbVues > 1) morceaux.push(construirePagineur(donnees, nbVues));
  }

  if (donnees.tronque) {
    morceaux.push(
      bloc(
        'repli',
        `Exploration limitée à 8 pages par site : il peut rester des articles au-delà.`
      )
    );
  }

  if (donnees.erreurs?.length > 0) {
    morceaux.push(
      bloc(
        'repli',
        `Sites injoignables : ${donnees.erreurs.map((e) => e.site).join(', ')}. Les totaux ci-dessus les excluent.`
      )
    );
  }

  zoneResultats.replaceChildren(...morceaux);
}

/**
 * Flèches de navigation entre les vues de 15 résultats.
 *
 * La recherche ramène l'intégralité des articles pertinents avant le premier
 * affichage : le nombre de pages est donc exact et fixe dès le départ, et la
 * navigation ne déclenche aucune requête.
 */
function construirePagineur(donnees, nbVues) {
  const pagineur = document.createElement('nav');
  pagineur.className = 'pagineur';
  pagineur.setAttribute('aria-label', 'Navigation dans les résultats');

  const precedent = document.createElement('button');
  precedent.type = 'button';
  precedent.className = 'fleche';
  precedent.textContent = '←';
  precedent.setAttribute('aria-label', 'Résultats précédents');
  precedent.disabled = donnees.vue === 1;
  precedent.addEventListener('click', () => {
    recherche.vue -= 1;
    rendreResultats();
    zoneResultats.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });

  const position = document.createElement('span');
  position.className = 'position';
  position.textContent = `${donnees.vue} / ${nbVues}`;

  const suivant = document.createElement('button');
  suivant.type = 'button';
  suivant.className = 'fleche';
  suivant.textContent = '→';
  suivant.setAttribute('aria-label', 'Résultats suivants');
  suivant.disabled = donnees.vue >= nbVues;
  suivant.addEventListener('click', () => {
    recherche.vue += 1;
    rendreResultats();
    zoneResultats.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });

  pagineur.append(precedent, position, suivant);
  return pagineur;
}

/** Pastille de site, cliquable pour n'afficher que ce site. */
function chipSite(id, nom, charges, total) {
  const bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.className = `part${charges === 0 ? ' part-vide' : ''}`;
  bouton.setAttribute('aria-pressed', String(recherche.siteFiltre === id));
  if (id !== 'tous') bouton.dataset.site = id;
  if (total !== undefined) {
    bouton.title = `${total} correspondance${total > 1 ? 's' : ''} au total sur ${nom}`;
  }
  bouton.append(`${nom} `);

  const nombre = document.createElement('b');
  nombre.textContent = charges;
  bouton.append(nombre);

  bouton.addEventListener('click', () => {
    // Un second clic sur le site actif retire le filtre.
    recherche.siteFiltre = recherche.siteFiltre === id ? 'tous' : id;
    // Changer de filtre change le nombre de vues : on repart de la première.
    recherche.vue = 1;
    rendreResultats();
  });

  return bouton;
}

function construireResultat(article) {
  const lien = document.createElement('a');
  lien.className = 'resultat';
  lien.dataset.site = article.site;
  lien.href = article.url;
  lien.target = '_blank';
  lien.rel = 'noopener noreferrer';

  if (article.image) {
    const image = document.createElement('img');
    image.src = article.image;
    image.alt = '';
    image.loading = 'lazy';
    image.addEventListener('error', () => image.replaceWith(bloc('sans-visuel', '')), { once: true });
    lien.append(image);
  } else {
    lien.append(bloc('sans-visuel', ''));
  }

  const texte = document.createElement('div');
  texte.className = 'resultat-texte';

  const meta = document.createElement('span');
  meta.className = 'resultat-meta';
  meta.append(construireBadgeSite(article), ` ${article.type}`);

  const titre = document.createElement('span');
  titre.className = 'resultat-titre';
  titre.textContent = article.titre;

  texte.append(meta, titre);
  lien.append(texte);
  return lien;
}

function bloc(classe, texte) {
  const element = document.createElement('div');
  element.className = classe;
  if (texte) element.textContent = texte;
  return element;
}

function paragraphe(texte, classe) {
  const element = document.createElement('p');
  element.className = classe;
  element.textContent = texte;
  return element;
}

formulaire.addEventListener('submit', (evenement) => {
  evenement.preventDefault();
  const requete = champ.value.trim();
  if (requete.length >= 2) chercher(requete);
});

boutonEffacer.addEventListener('click', () => {
  champ.value = '';
  afficherVueRecherche(false);
  champ.focus();
});

boutonRafraichir.addEventListener('click', () => charger({ forcer: true }));
charger();
annoncerModeResume();

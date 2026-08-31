/**
 * Chargement de la configuration locale.
 *
 * La clé API se règle une fois pour toutes dans un fichier `.env` à la racine,
 * exclu de git. Elle ne transite jamais par le navigateur et n'a pas à être
 * ressaisie à chaque ouverture de terminal.
 *
 *   .env
 *   ANTHROPIC_API_KEY=sk-ant-...
 *
 * Les variables d'environnement déjà définies gardent la priorité : le fichier
 * ne sert qu'à combler ce qui manque.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Analyse un fichier au format `CLE=valeur`, une paire par ligne. */
function analyser(contenu) {
  const valeurs = {};

  for (const ligne of contenu.split(/\r?\n/)) {
    const nette = ligne.trim();
    if (!nette || nette.startsWith('#')) continue;

    const separateur = nette.indexOf('=');
    if (separateur < 1) continue;

    const cle = nette.slice(0, separateur).trim();
    let valeur = nette.slice(separateur + 1).trim();

    // Les guillemets encadrants sont tolérés mais ne font pas partie de la valeur.
    if (/^(".*"|'.*')$/s.test(valeur)) valeur = valeur.slice(1, -1);

    if (cle) valeurs[cle] = valeur;
  }

  return valeurs;
}

/** Charge `.env` s'il existe. Son absence est un cas normal, pas une erreur. */
export function chargerConfig() {
  let contenu;
  try {
    contenu = readFileSync(path.join(RACINE, '.env'), 'utf8');
  } catch {
    return { charge: false, cles: [] };
  }

  const valeurs = analyser(contenu);
  for (const [cle, valeur] of Object.entries(valeurs)) {
    if (process.env[cle] === undefined) process.env[cle] = valeur;
  }

  return { charge: true, cles: Object.keys(valeurs) };
}

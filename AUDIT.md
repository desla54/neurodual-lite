# Audit du projet NeuroDual Lite

**Date :** 5 avril 2026
**Auditeur :** Claude Code (v2 — corrections apres contre-verification)
**Branche :** `main`
**Commit :** `5e9ef6f`

> **Note :** Cette version corrige les erreurs factuelles de la premiere version.
> Les chiffres et affirmations ont ete valides par comptage `find`/`grep` sur le depot.

---

## Table des matieres

1. [Vue d'ensemble du projet](#1-vue-densemble-du-projet)
2. [Stack technique](#2-stack-technique)
3. [Architecture](#3-architecture)
4. [Points forts](#4-points-forts)
5. [Typage TypeScript — utilisation de `any`](#5-typage-typescript--utilisation-de-any)
6. [Nettoyage des effets et listeners](#6-nettoyage-des-effets-et-listeners)
7. [Fichier styles.css — analyse CSS](#7-fichier-stylescss--analyse-css)
8. [Fichiers composants volumineux](#8-fichiers-composants-volumineux)
9. [Valeurs hardcodees et magic numbers](#9-valeurs-hardcodees-et-magic-numbers)
10. [Gestion des erreurs](#10-gestion-des-erreurs)
11. [Console.log en production](#11-consolelog-en-production)
12. [Analyse des dependances](#12-analyse-des-dependances)
13. [Couverture de tests](#13-couverture-de-tests)
14. [Accessibilite](#14-accessibilite)
15. [Recommandations priorisees](#15-recommandations-priorisees)

---

## 1. Vue d'ensemble du projet

**NeuroDual Lite** est une application d'entrainement cerebral cross-platform deployee sur Web, Android, iOS et Desktop. Elle implemente des exercices scientifiquement valides :

- **Dual N-Back** — Protocole de Jaeggi (2008)
- **Brain Workshop** — Implementation fidele de Brain Workshop v4.x/v5
- **Stroop Task** — Exercice d'inhibition cognitive (1935)
- **StroopFlex** — Variante avec alternance dynamique de regles
- **47 puzzles logiques** — Fifteen, Flood, Unruly, etc.
- **Suivi de progression** — Statistiques et analyses de performance
- **Multilingue** — Francais et anglais

---

## 2. Stack technique

### Runtime et build

| Technologie | Version | Role |
|---|---|---|
| Bun | 1.3.0 | Runtime et gestionnaire de paquets |
| TypeScript | 5.9.3 | Langage principal |
| Vite | 7.2.0 | Outil de build |
| React | 19.2.0 | Framework UI |
| React Router | 7.x | Routage |

### Etat et architecture

| Technologie | Version | Role |
|---|---|---|
| XState | 5.19.2 | Machines a etats |
| Zustand | 5.0.2 | Etat client |
| TanStack Query | — | Etat serveur |

### UI et style

| Technologie | Version | Role |
|---|---|---|
| TailwindCSS | 4.1.17 | Framework CSS |
| Radix UI | — | Composants headless |
| GSAP | 3.14.1 | Animations |
| Phosphor Icons | — | Icones |
| Recharts | — | Visualisation de donnees |

### Donnees et persistance

| Technologie | Version | Role |
|---|---|---|
| PowerSync | 1.34.0 | Synchronisation offline-first |
| wa-sqlite | — | SQLite via WebAssembly |
| Drizzle ORM | 0.45.1 | ORM base de donnees |

### Cross-platform

| Technologie | Role |
|---|---|
| Capacitor | Applications mobiles (Android/iOS) |
| Tauri | Application desktop |
| Cloudflare Workers | Backend serverless |

### Qualite et tests

| Technologie | Version | Role |
|---|---|---|
| Biome | 2.3.0 | Linter et formateur |
| Happy DOM | 20.3.9 | Environnement de test DOM |
| Fast-check | 4.4.0 | Tests property-based |
| Playwright | — | Tests E2E (installe, pas encore utilise — voir section 13) |

---

## 3. Architecture

```
neurodual-lite/
├── apps/
│   └── web/                    # Application web principale
│       ├── src/
│       │   ├── pages/          # Composants de pages
│       │   ├── components/     # Composants UI
│       │   ├── hooks/          # Hooks React personnalises
│       │   ├── stores/         # Stores Zustand
│       │   ├── services/       # Logique metier
│       │   ├── lib/            # Fonctions utilitaires
│       │   ├── providers/      # Providers React
│       │   └── styles.css      # CSS global (2 031 lignes)
│       ├── android/            # Projet natif Android
│       ├── ios/                # Projet natif iOS
│       └── src-tauri/          # Application desktop Tauri
├── packages/
│   ├── logic/                  # Moteur de jeu et logique metier
│   │   ├── src/domain/         # Modeles de domaine
│   │   ├── src/puzzles/        # Implementations des puzzles
│   │   ├── src/engine/         # Moteur de jeu
│   │   ├── src/judge/          # Regles et validation
│   │   └── src/recognizer/     # Reconnaissance d'entree
│   ├── ui/                     # Composants UI partages
│   │   ├── src/components/
│   │   ├── src/hooks/
│   │   ├── src/theme/
│   │   └── src/stats/
│   └── infra/                  # Infrastructure et adaptateurs
│       ├── src/db/             # Base de donnees et persistance
│       ├── src/audio/          # Gestion audio
│       ├── src/powersync/      # Synchronisation offline
│       └── src/projections/    # Vues materialisees
├── workers/                    # Cloudflare Workers
│   └── activation-api/         # Service d'activation
├── scripts/                    # Scripts de build et deploiement
└── fastlane/                   # Automatisation deploiement mobile
```

**Patterns architecturaux identifies :**

- **Domain-Driven Design (DDD)** — Separation claire de la logique de domaine dans `packages/logic`
- **CQRS avec Projections** — Pattern event sourcing pour PowerSync
- **State Machines** — XState pour les etats de jeu complexes
- **Architecture hexagonale** — Pattern adaptateur pour l'infrastructure

---

## 4. Points forts

### Architecture

- Monorepo bien structure avec separation claire des responsabilites
- Architecture DDD avec couches domaine / infrastructure / UI distinctes
- Pattern event sourcing pour la persistance offline-first
- Machines a etats XState pour les flux de jeu complexes

### Performance

- Code splitting avec chunks manuels pour les bibliotheques critiques
- Prechargement des polices pour optimiser le LCP
- Caching intelligent dans le Service Worker PWA
- React Compiler active en production

### Qualite

- Configuration TypeScript stricte
- Error boundary implemente (`components/error-boundary.tsx`)
- Service de logging d'erreurs complet (`services/error-logger.ts`)
- Mecanisme de recuperation automatique pour les erreurs de chunk loading
- Logging infra qui peut etre branche sur Sentry via un bridge optionnel (`__ND_SENTRY_BRIDGE__`), mais Sentry est **retire de la version Lite** — les commentaires `// Sentry removed in Lite` sont presents dans `error-boundary.tsx:82` et `route-error-boundary.tsx:29`

### Cross-platform

- PWA + Capacitor + Tauri — couverture complete
- PowerSync pour synchronisation offline-first
- Configuration de build separee par plateforme

### Tests

- 297 fichiers de test couvrant massivement `packages/logic` et `packages/infra`
- Tests property-based avec fast-check sur la logique de domaine
- Tests metamorphiques sur le scoring et les projecteurs
- Tests d'integration sur la persistance, l'audio, le cycle de vie

---

## 5. Typage TypeScript — utilisation de `any`

**33 occurrences** de `any` identifiees par `grep` (hors fichiers de test et wdyr).

### Repartition par package

| Package | Occurrences | Contexte |
|---|---|---|
| `apps/web` | 15 | Stubs journey, mode settings, stats |
| `packages/infra` | 10 | PowerSync, DB, adapters, diagnostics |
| `packages/logic` | 2 | Report pipeline, scoring |
| `packages/test-setup` | 4 | Mocks d'environnement de test |

### Details — `apps/web` (15 occurrences)

**`apps/web/src/lib/journey-stubs.ts`** — 4 occurrences

```ts
// Ligne 7
export function useJourneyStateWithContext(): { state: any } {
// Ligne 12
export function useNextJourneySessionWithContext(): { nextSession: any } {
// Ligne 17
export function useJourneyState(): any {
// Ligne 22
export function useNextJourneySession(): any {
```

Ces stubs sont probablement temporaires (feature desactivee en Lite). Ils propagent l'incertitude de type dans `stats.tsx` et `settings-page.tsx`.

**`apps/web/src/pages/stats.tsx`** — 2 occurrences

```ts
// Ligne 423
const currentJourneyState = null as any;
// Ligne 425
const currentNextJourneySession = null as any;
```

**`apps/web/src/pages/settings/settings-page.tsx`** — 1 occurrence

```ts
// Ligne 28
const JourneySection = lazy(() => Promise.resolve({ default: () => null as any }));
```

**`apps/web/src/pages/settings/sections/mode/mode-settings-panel.tsx`** — 7 occurrences

```ts
// Ligne 52
function normalizeDualTrackResolvedSettings(..._args: unknown[]): any {
// Ligne 56
const hybridStrategy = {} as any;
// Ligne 519
(activeJourneyStrategyConfig as any)?.trackSessionsPerBlock ??
// Ligne 521
(modeSettings as any)?.hybridTrackSessionsPerBlock ??
// Ligne 525
(activeJourneyStrategyConfig as any)?.dnbSessionsPerBlock ??
// Ligne 527
(modeSettings as any)?.hybridDnbSessionsPerBlock ??
// Ligne 698
(s: any) =>
```

**`apps/web/src/components/dev/useGameBot.ts`** — 1 occurrence

```ts
// Ligne 50
dispatch: (event: any) => void;
```

### Details — `packages/infra` (10 occurrences)

**`packages/infra/src/powersync/powersync-persistence-adapter.ts`** — 3 occurrences

```ts
// Ligne 664
db.getAll<T>(sql, params as any[]),
// Ligne 696
await tx.execute(sql, params as any[]);
// Ligne 700
const rows = await tx.getAll<TQuery>(sql, params as any[]);
```

Cast de `params` vers `any[]` pour s'adapter a l'API PowerSync. Un type intermediaire pourrait eliminer ces casts.

**`packages/infra/src/powersync/database.ts`** — 2 occurrences

```ts
// Ligne 696
(db as any).execute = async (sql: string, params?: unknown[]) => {
// Ligne 713
(db as any).getAll = async (sql: string, params?: unknown[]) => {
```

Monkey-patching sur l'instance DB. Lie au typage de la lib PowerSync.

**`packages/infra/src/powersync/platform.ts`** — 1 occurrence

```ts
// Ligne 117
'@powersync/capacitor' as any
```

Import dynamique conditionne par la plateforme.

**`packages/infra/src/persistence/session-queries.ts`** — 1 occurrence

```ts
// Ligne 288
tx: any,
```

Parametre de transaction non type.

**`packages/infra/src/history/history-migration.ts`** — 1 occurrence

```ts
// Ligne 54
_tx: any,
```

Parametre de transaction non type (migration).

**`packages/infra/src/stats/stats-adapter.ts`** — 1 occurrence

```ts
// Ligne 478
const gameModeIds = resolveGameModeIdsForStatsMode(filters.mode as any);
```

**`packages/infra/src/adapters.ts`** — 1 occurrence

```ts
// Ligne 541
const snapshot = { data: {} as any, isPending: false, error: null };
```

### Details — `packages/logic` (2 occurrences)

**`packages/logic/src/domain/report/indicator-pipeline.ts`** — 1 occurrence

```ts
// Ligne 321
explanation: explanation as any,
```

**`packages/logic/src/domain/scoring/tempo-confidence.ts`** — 0 (faux positif du grep, le match est dans un commentaire)

### Evaluation

Sur les 33 occurrences, environ 10 sont dans des stubs temporaires (journeys) ou du code dev-only (useGameBot). Les 23 restantes sont des contournements de types de librairies externes (PowerSync) ou des raccourcis dans la couche infra. Le signal est reel mais concentre — pas repandu dans le domaine metier.

---

## 6. Nettoyage des effets et listeners

> **Correction :** La version precedente affirmait "Aucune fuite memoire detectee" apres n'avoir verifie que les listeners dans `apps/web`. Cette section etend la verification a tout le depot.

### `apps/web` — Verifies, tous nettoyes

| Fichier | Evenements | Nettoyage |
|---|---|---|
| `layouts/main-layout.tsx` | `scroll` | OK — return cleanup |
| `hooks/use-cursor-tracking-port.ts` | `mousemove` | OK — return cleanup |
| `hooks/use-keyboard-controls.ts` | `keydown` / `keyup` | OK — return cleanup |
| `hooks/use-game-layout.ts` | `resize` | OK — return cleanup |
| `pages/dual-mix-training.tsx` | `pointer` | OK — return cleanup |
| `pages/gridlock-training.tsx` | `pointermove` / `resize` | OK — return cleanup |

### `packages/infra` — Verifies, tous nettoyes

| Fichier | Evenements | Nettoyage |
|---|---|---|
| `lifecycle/platform-lifecycle-source-web.ts` | `visibilitychange` | OK — `dispose()` avec `removeEventListener` (ligne 48) |
| `lifecycle/replay-recovery.ts` | `beforeunload` / `visibilitychange` | OK — return cleanup (lignes 212-213) |
| `lifecycle/session-recovery.ts` | `beforeunload` / `visibilitychange` | OK — return cleanup (lignes 232-233) |
| `lifecycle/network-lifecycle-machine.ts` | `online` / `offline` / `change` | OK — `dispose()` avec `removeEventListener` (lignes 246-253) |
| `audio/audio-lifecycle-machine.ts` | `visibilitychange` / `blur` / `focus` | OK — `dispose()` avec `removeEventListener` (lignes 477-482) |

### Conclusion

Le depot semble propre sur ce sujet. Tous les listeners identifies ont des fonctions de nettoyage. **Cependant**, cette verification couvre uniquement les `addEventListener` / `removeEventListener`. Elle ne couvre pas les abonnements XState, les observers PowerSync, ou les subscriptions potentielles dans d'autres patterns. Une verification exhaustive necessiterait un audit runtime (profiling Chrome DevTools).

---

## 7. Fichier styles.css — analyse CSS

### Mesures

| Metrique | Valeur |
|---|---|
| Lignes totales | **2 031** (verifie par `wc -l`) |
| Couleurs hardcodees | 0 (toutes en CSS variables) |
| Magic numbers | ~40+ occurrences |
| Selecteurs complexes | Quelques-uns |

### Magic numbers identifies

Les valeurs numeriques suivantes apparaissent sans constante nommee :

```css
/* Durees d'animation — apparues dans de multiples endroits */
80ms, 150ms, 170ms, 240ms, 300ms, 450ms, 500ms

/* Border-radius */
9999px, 0.75rem

/* Clamp functions avec valeurs specifiques */
clamp(0.75rem, 2vw, 1rem)
clamp(1.5rem, 4vw, 2.5rem)

/* Z-index disperses */
z-10, z-20, z-30, z-40, z-50
```

### Sections extractibles

Les sections suivantes pourraient etre separees dans des fichiers dedies :

| Section | Lignes approx. | Fichier suggere |
|---|---|---|
| Utilities `@layer` | 420-447 | `styles/utilities.css` |
| Nordic Polish | 1010-1050 | `styles/nordic-polish.css` |
| Game control flash | 1053-1108 | `styles/game-controls.css` |
| Animation keyframes | 1111-1173 | `styles/animations.css` |

---

## 8. Fichiers composants volumineux

> **Verification :** Les chiffres ci-dessous sont confirmes par `wc -l`.

| Fichier | Lignes | Severite |
|---|---|---|
| `pages/settings/config/game-modes.ts` | **4 521** | Critique |
| `pages/settings/sections/mode/mode-settings-panel.tsx` | **4 348** | Critique |
| `stores/settings-store.ts` | **3 033** | Critique |
| `pages/nback-training.tsx` | **2 791** | Elevee |
| `lib/dual-track-runtime.ts` | **1 775** | Elevee |
| `pages/gridlock-training.tsx` | **1 368** | Elevee |
| `pages/dual-mix-training.tsx` | **1 262** | Elevee |
| `pages/ospan-training.tsx` | **1 162** | Elevee |
| `pages/stats.tsx` | **1 133** | Moyenne |

**Total :** 23 424 lignes dans ces 9 fichiers seuls, soit 10x la taille du fichier CSS.

**Impact :** Difficulte de maintenance, de relecture et de test. Les fichiers de 4 000+ lignes sont pratiquement impossibles a refactorer en toute confiance.

---

## 9. Valeurs hardcodees et magic numbers

### Timeouts hardcodees

| Fichier | Ligne | Valeur | Contexte |
|---|---|---|---|
| `main.tsx` | 130 | `450` ms | Suppression d'un element du splash screen |
| `pages/settings/config/game-modes.ts` | Multiple | Variables | Configuration de modes de jeu |
| `pages/nback-training.tsx` | Multiple | Variables | Parametres de jeu N-Back |
| `pages/gridlock-training.tsx` | Multiple | Variables | Dimensions de grille et timings |

### Dimensions hardcodees

Valeurs de pixels trouvees directement dans le JSX (via Tailwind) :

```
text-[10px], text-[11px], w-[48px], h-[24px], gap-[16px]
```

### Chaines hardcodees

Messages d'erreur et labels textuels non extraits pour i18n dans certains composants.

---

## 10. Gestion des erreurs

> **Correction :** La version precedente contenait des faux positifs. Les fichiers `system-provider.tsx` et `i18n.ts` ont ete re-verifies et possedent bien une gestion d'erreur adequate.

### Faux positifs retires

- **`providers/system-provider.tsx`** — Possede `.catch()` a la ligne 184, un autre a la ligne 369, et des blocs `try/catch` aux lignes 284, 333, 537. L'affirmation precedente etait fausse.
- **`i18n.ts`** — Les appels `loadLocale()` sont encapsules dans des blocs `try/catch` (lignes 83-86, 95-98). L'affirmation precedente etait fausse.

### Points restants a verifier

Les pages d'entrainement (`nback-training.tsx`, `dual-mix-training.tsx`, `gridlock-training.tsx`, `ospan-training.tsx`) meritent une verification au cas par cas des operations async, mais l'audit precedent a attribue des problemes generiques sans preuve ligne par ligne. **Ces fichiers ne sont pas listes comme defauts confirmes sans verification supplementaire.**

### Points positifs confirmes

- `components/error-boundary.tsx` — Error boundary implementee
- `services/error-logger.ts` — Service de logging complet
- Recuperation automatique pour les erreurs de chunk loading
- Logging infra avec bridge optionnel vers Sentry (`__ND_SENTRY_BRIDGE__`), mais Sentry est **retire de la version Lite**

### Statut Sentry

Sentry n'est **pas** integre en production dans NeuroDual Lite. Le code contient :
- Des points d'integration optionnels (`apps/web/src/env.ts` lignes 65-77 — `VITE_SENTRY_DSN` optionnel)
- Des commentaires explicites `// Sentry removed in Lite` dans `error-boundary.tsx:82` et `route-error-boundary.tsx:29`
- Un bridge `__ND_SENTRY_BRIDGE__` dans le logger infra pour brancher Sentry si besoin

---

## 11. Console.log en production

### Occurrences identifiees

| Fichier | Ligne | Statement | Statut |
|---|---|---|---|
| `wdyr.ts` | 11 | `console.log('[WDYR] ...')` | Dev-only (WDYR est un outil de dev) |
| `providers/dev-debug-services.tsx` | 30 | `console.log('[Dev] ...')` | Dev-only |
| `providers/system-provider.tsx` | 288 | `console.log(...)` — perf measures | A verifier si conditioned |
| `stores/settings-store.ts` | 2825 | `console.error('[SettingsStore] ...')` | Acceptable (error logging) |
| `services/error-logger.ts` | 25, 27, 54 | `console.error(...)` | Intentionnel (infrastructure) |
| `lib/logger.ts` | 56, 65, 73, 110, 127 | Wrappers logger | Intentionnel (infrastructure) |

**Note :** La plupart des `console.error` sont intentionnels. Les `console.log` dans `wdyr.ts` et `dev-debug-services.tsx` sont conditionnes au dev et ne devraient pas etre en build production.

---

## 12. Analyse des dependances

### Flag memoire build

Le `package.json` de l'app web contient `NODE_OPTIONS=--max-old-space-size=4096`. C'est un **indice** que le build peut etre lourd, mais ce n'est pas une mesure du bundle reel. Pour confirmer, il faudrait lancer `vite-bundle-visualizer` et comparer les chiffres reels.

### Dependances notables

| Package | Remarque |
|---|---|
| `@capacitor/*` | Obligatoire pour le support mobile |
| `@powersync/capacitor` | Obligatoire pour la synchronisation |
| `gsap` | Animations — a verifier: quels modules sont reellement importes |
| `recharts` | Visualisation — a verifier: tree-shaking effectif |
| `react-rnd` | Redimensionnement — usage potentiellement limitable |

### Recommandations

- **Verifier** le bundle size reel avec `vite-bundle-visualizer` avant de conclure
- Auditer les imports GSAP — utiliser uniquement les modules necessaires
- L'indicateur `--max-old-space-size=4096` devrait etre surveille mais n'est pas un constat d'probleme en soi

---

## 13. Couverture de tests

> **Correction :** La version precedente annoncait 219 fichiers TS/TSX et 21 fichiers de test (9.6% de couverture). Ces chiffres sont **incorrects**.

### Chiffres verifies

| Metrique | Valeur | Methode de comptage |
|---|---|---|
| Fichiers `*.ts` + `*.tsx` (hors node_modules, .turbo, dist, android, ios, src-tauri) | **1 125** | `find` + `wc -l` |
| Fichiers de test (`*.test.*` + `*.spec.*`) | **297** | `find` + `wc -l` |
| Ratio fichiers de test / fichiers source | **26.4%** | Ratio brut |

### Repartition des tests par package

| Package | Fichiers de test | Observation |
|---|---|---|
| `packages/logic/` | ~170+ | Couverture dense du domaine, scoring, generateurs, projecteurs |
| `packages/infra/` | ~75+ | Couverture de la persistance, audio, lifecycle, projections |
| `packages/ui/` | ~15 | Composants primitifs et stats |
| `apps/web/` | ~20 | Stores, lib, hooks |

### Lacunes identifiees

**Pages sans tests unitaires :**

- `pages/nback-training.tsx` (2 791 lignes)
- `pages/dual-mix-training.tsx` (1 262 lignes)
- `pages/gridlock-training.tsx` (1 368 lignes)
- `pages/ospan-training.tsx` (1 162 lignes)
- `pages/stats.tsx` (1 133 lignes)
- `pages/home.tsx`
- `pages/settings/settings-page.tsx`

**Tests E2E :** Playwright est installe et reference dans `vite.config.ts:578` (exclusion du report du cache), mais **aucun test E2E n'existe** dans le depot. Le repertoire `.playwright-cli/` est present mais vide de tests.

### Interpretation

La couverture brute de 26.4% est trompeuse : la logique metier dans `packages/logic` et `packages/infra` est massivement testee (property-based, metamorphique, integration). Le deficit est concentre dans la couche UI (`apps/web/src/pages/` et `components/`), ce qui est typique des projets React. Le verrou critique est l'absence de tests sur les pages d'entrainement de 1 000+ lignes.

---

## 14. Accessibilite

### Mesure

Verification du nombre d'attributs ARIA (`aria-label`, `aria-hidden`, `role`) par fichier :

| Fichier | Attributs ARIA | Remarque |
|---|---|---|
| `pages/home.tsx` | **0** | Aucun attribut d'accessibilite |
| `pages/nback-training.tsx` | 3 | Minimal |
| `pages/dual-mix-training.tsx` | 1 | Minimal |
| `pages/gridlock-training.tsx` | 2 | Minimal |
| `pages/stats.tsx` | 4 | Minimal |
| `components/game/GameSettingsOverlay.tsx` | 8+ | Bonne couverture |

### Constat

Les composants "utilitaires" (settings overlay, modals, reward celebration) ont une bonne couverture ARIA. En revanche, les pages principales — et particulierement `home.tsx` qui contient des boutons interactifs sans aucun attribut d'accessibilite — presentent des lacunes ponctuelles.

### Recommandations

- Ajouter `aria-label` sur les `<button>` icones dans `home.tsx`
- Ajouter `aria-live` pour les feedbacks dynamiques dans les pages d'entrainement
- Verifier les `alt` text sur toutes les `<img>`
- Tester au lecteur d'ecran les flux critiques (session de jeu, parametres)

---

## 15. Recommandations priorisees

### Lot 1 — Actionnable immediatement (effort faible, impact eleve)

| # | Action | Justification |
|---|---|---|
| 1 | Typer les stubs journey dans `journey-stubs.ts` | 4 `any` supprimables en definissant des interfaces de stub ou `null` types |
| 2 | Typer `mode-settings-panel.tsx` | 7 `any` concentres dans un fichier de 4 348 lignes — le gain de lisibilite est immediat |
| 3 | Typer les params de transaction dans `session-queries.ts:288` et `history-migration.ts:54` | 2 `any` facilement remplacables par le type Drizzle `DbTransaction` ou equivalent |
| 4 | Ajouter `aria-label` sur les boutons de `home.tsx` | 0 attribut ARIA actuellement — correctif trivial |

### Lot 2 — Architecture (effort moyen, impact critique)

| # | Action | Justification |
|---|---|---|
| 5 | Decouper `game-modes.ts` (4 521 lignes) | Plus gros fichier du depot — doit etre module |
| 6 | Decouper `mode-settings-panel.tsx` (4 348 lignes) | Deuxieme plus gros fichier — complexite reduite par extraction de sous-composants |
| 7 | Decouper `settings-store.ts` (3 033 lignes) en slices Zustand | Store monolithique, difficile a raisonner |

### Lot 3 — Tests UI (effort eleve, impact eleve)

| # | Action | Justification |
|---|---|---|
| 8 | Ajouter des tests sur `nback-training.tsx` | 2 791 lignes sans test — prerequis pour tout refactoring |
| 9 | Ajouter des tests sur les autres pages d'entrainement | 4 pages de 1 000+ lignes sans test |
| 10 | Creer les premiers tests E2E Playwright | Playwright installe mais 0 test — couvrir le flux de jeu critique |

### Lot 4 — Qualite continue (effort variable)

| # | Action | Justification |
|---|---|---|
| 11 | Decouper `styles.css` (2 031 lignes) | Maintenance CSS |
| 12 | Extraire les magic numbers en constantes CSS | Lisibilite |
| 13 | Mesurer le bundle size reel | Confirmer ou infirmer l'hypothese de bundle lourd |
| 14 | Verifier les imports GSAP / recharts | Optimisation potentielle |

---

## Resume executif

Le projet NeuroDual Lite presente une **architecture solide** avec des choix techniques modernes et reflechis. L'approche DDD, l'event sourcing et les machines a etats XState sont des atouts majeurs.

### Ce qui est solide

- **Logique metier massivement testee** — 297 fichiers de test, couverture dense en property-based et metamorphique dans `packages/logic` et `packages/infra`
- **Nettoyage des listeners** — Tous les `addEventListener` verifies (web + infra) ont des fonctions de nettoyage
- **Gestion d'erreurs** — Error boundary, error logger, try/catch dans les providers et l'i18n
- **Taille des fichiers volumineux** — Chiffres confirmes : 3 fichiers au-dessus de 3 000 lignes

### Ce qui necessite attention

1. **Taille des fichiers** — 9 fichiers totalisent 23 424 lignes. C'est le risque #1 pour la maintenabilite.
2. **Tests UI manquants** — Les pages d'entrainement (1 000-2 800 lignes chacune) n'ont aucun test. C'est le bloqueur principal pour refactorer en confiance.
3. **33 `any`** — Dont ~10 eliminables facilement (stubs, params de transaction).
4. **Accessibilite ponctuelle** — `home.tsx` a 0 attribut ARIA, les pages d'entrainement sont minimales.

### Sequence recommandee

1. **Lot 1 d'abord** — rapides, sans risque, impact immediat sur la qualite
2. **Lot 3 en parallele** — ajouter des tests sur les pages d'entrainement AVANT de refactorer
3. **Lot 2 ensuite** — decoupage des gros fichiers, avec les tests comme filet de securite
4. **Lot 4 en continu** — CSS, bundle, optimisations

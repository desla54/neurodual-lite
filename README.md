# NeuroDual Lite

Entraînement cognitif minimaliste — Dual N-Back & Stroop.

## Modes

- **Dual N-Back Classique** — Protocole Jaeggi validé scientifiquement
- **Brain Workshop** — Implémentation fidèle du protocole Brain Workshop v4.x/v5
- **Stroop** — Tâche d'inhibition classique (Stroop, 1935)
- **StroopFlex** — Variante avec alternance dynamique des règles

## Stack

- **Runtime** : [Bun](https://bun.sh/)
- **Frontend** : React 19 + Vite + TailwindCSS
- **Persistance** : SQLite local (wa-sqlite)
- **Langues** : Français, English

## Développement

```bash
bun install
bun dev
```

## Structure

```
neurodual-lite/
├── packages/logic/   # Moteur de jeu, specs, sessions
├── packages/ui/      # Composants React partagés
├── packages/infra/   # Audio, persistance locale
└── apps/web/         # Application web (PWA)
```

## Licence

Privé — © desla54

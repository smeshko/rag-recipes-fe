# Stove — frontend

Single-user web frontend for the rag-recipes backend: search the recipe library, read a synthesised answer with citations, and manage uploads.

Vite + React + TypeScript, Tailwind CSS v4 with the "Sunday Kitchen" theme, Biome for lint and format, pnpm for packages.

## Prerequisites

- Node 22.22+ (`node -v`) — react-router v8 declares `engines: node >=22.22.0`
- pnpm 11 — pinned via `packageManager` in `package.json`, so `corepack enable` is enough
- [`just`](https://github.com/casey/just) for the task recipes

## Getting started

```sh
pnpm install
just dev
```

The dev server runs on <http://localhost:5173>.

## Recipes

| Command | What it does |
|---|---|
| `just dev` | Vite dev server with HMR |
| `just build` | Type-check (`tsc -b`) then production build to `dist/` |
| `just lint` | Biome lint + format check (`biome check .`) |
| `just format` | Biome format, safe fixes and import sorting (`biome check --write .`) |

`just` with no arguments lists everything available.

`test` and `typegen` (OpenAPI codegen against the backend) arrive with the test harness in epic 01 phase 1.2.

## Layout

```
src/
  theme.css   Tailwind v4 @theme tokens + the hand-tuned bloom / card-header layer
  main.tsx    entry point; self-hosted @fontsource imports
  App.tsx     placeholder proving the theme
design/       standalone HTML mockups — the visual spec
```

## Design and architecture

- `ARCHITECTURE.md` — stack, data layer, routing and project layout decisions.
- `design/e-sunday-kitchen.html` — the visual spec the theme tokens are derived from. Open it side by side with the app when changing `src/theme.css`.

The mockups in `design/` load fonts from Google's CDN, but the app itself does not: Petrona and Figtree are self-hosted through `@fontsource` and bundled. `design/` is excluded from both Biome and Tailwind's source scanning.

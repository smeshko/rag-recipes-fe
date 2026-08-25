# Stove — frontend

Single-user web frontend for the rag-recipes backend: search the recipe library, read a synthesised answer with citations, and manage uploads.

Vite + React + TypeScript, Tailwind CSS v4, Biome for lint and format, pnpm for packages.

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
  theme.css   Tailwind v4 @theme tokens (light) + the dark value overrides
  main.tsx    entry point — router, query client, the one stylesheet import
  ui/         Shell, Sidebar, Nav and the shared primitives
  features/   one directory per surface (search, library, recipe, …)
  api/        typed client, query hooks and the generated OpenAPI schema
design/       retired mockups — history, not the spec (see below)
```

## Design

The visual language is modelled on ChatGPT's web app: flat surfaces separated
by hairlines rather than shadow or fill, a near-white page against a faintly
grey nav rail, one near-black solid that carries every primary action, a blue
reserved for links, and no ornament — no gradients, no hover lifts, no entrance
animation. Emphasis comes from weight and whitespace, never from colour.

Start at `src/theme.css`: the token block is commented with what each role
means and why its value is what it is, and every colour in the app resolves
through it. Dark mode is a value-only override of the same token names, so it
needs no per-component work.

Type is the system sans stack, deliberately — that is the fallback the target
itself ships behind its custom face, it renders natively everywhere, and it
keeps webfonts off the critical path. There are no `@fontsource` imports.

`design/` holds the earlier "Sunday Kitchen" mockups (warm cream, a Petrona
display serif, lifted cards). They are **no longer the spec** — treat them as
history until they are replaced. They are excluded from both Biome and
Tailwind's source scanning.

`ARCHITECTURE.md` covers stack, data layer, routing and project layout.

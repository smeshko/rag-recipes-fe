# Frontend Architecture — rag-recipes

Status: agreed 2026-07-31 (grilling session). Design direction and API contract are fixed; deployment details are deliberately deferred.

## What this is

A single-user web frontend for the rag-recipes backend: search the recipe library, get grounded LLM answers with page citations, browse recipe details, and manage cookbook ingestion. Design direction is **Sunday Kitchen** — see `design/` for the four high-fidelity mockups (`index.html` to browse them). The mockups are the visual spec: cream/apricot palette, Petrona (display serif) + Figtree (body), no food photography — typography and book/page provenance carry the design.

## Decisions

### Runtime & deployment

- **Target**: home server, same machine as the backend, exposed via a **cloudflared tunnel**. Frontend protected by **Cloudflare Access**; backend will need its own protection (likely an access token). **Specifics are TBD** — deferred until after the app is built.
- Consequence for the code now: stay deployment-agnostic. API calls go to a **relative `/api` base**; the Vite dev server proxies `/api` → `http://localhost:8001`. Whatever fronts the app in production (Caddy/nginx/cloudflared config) does the same path-split. No CORS work needed on the backend as long as the origin is shared; auth header injection stays pluggable (dev: Vite proxy injects `Authorization: Bearer $PERSONAL_API_TOKEN`; prod: reverse proxy or CF Access JWT — open question).

### Stack

- **Vite + React + TypeScript**, plain SPA. No SSR framework — nothing here needs it.
- **Tailwind CSS v4** with the Sunday Kitchen tokens mapped into a custom theme (`@theme`: cream `#FBF7EF`, ink `#2B241A`, apricot `#C96F3B`, sage/butter/terra book-accents, radius/shadow scale). Hand-tuned pieces from the mockups (staggered `bloom` reveals, flat soft-fill card headers with an accent ink) live in a small CSS layer rather than being forced into utilities.
- Fonts self-hosted via `@fontsource/petrona` + `@fontsource/figtree` (the app will be tunnel-exposed; no Google CDN dependency).

### Data layer

- **TanStack Query** over a **thin hand-rolled fetch client**. The client knows two things: the error envelope (`{error: {code, message, details}}` — thrown as a typed `ApiError`) and the base path. No client-only global state beyond that — no Redux/Zustand.
- **Types are generated, not written**: `openapi-typescript` against the backend's `/openapi.json` → `src/api/schema.d.ts`, regenerated via a script when the backend changes. Zero drift with the FastAPI schemas.
- **Ingestion polling**: `GET /documents/{id}/status` with TanStack Query `refetchInterval`, stopping when `terminal: true`. Drives the library screen's stage stepper + page progress bar.

### Search & answer flow

- **Search-only by default, answer on demand.** Typing a query fires `POST /search` (fast, no LLM) and renders result cards. The grounded answer is an explicit action — an "Ask the shelf" affordance triggers `POST /answers` (`include_results: false`) and fills the answer card when the LLM returns. Keeps token spend intentional and the default interaction instant.
- **Fallback state** (designed in `sk-fallback.html`): when `/answers` returns non-empty `warnings`, render the amber notice — `answer.text` is the warning, not an answer — and show the `results` array the endpoint always returns on fallback. Never treat fallback as an error.
- Search query lives in the URL (`/?q=...`) so results are restorable and shareable.

### Routing

**React Router**, four routes:

| Route | Screen | Mockup |
|---|---|---|
| `/` (`?q=`) | Search + on-demand answer | `e-sunday-kitchen.html` (+ `sk-fallback.html` state) |
| `/recipes/:id` | Recipe detail (`GET /knowledge-items/{id}`) | `sk-recipe.html` |
| `/library` | Shelf + upload + ingestion status | `sk-library.html` |
| `/review` | Later — see v1 scope | not designed yet |

### v1 scope

The four designed screens only: search+answer, recipe detail, library (upload, per-book counts, processing/failed states, reprocess), fallback. The **review queue is out of v1** — for now a library link filters search to `needs_review` items (read-only); a real triage UI needs its own design pass *and* a backend "mark ready" endpoint that doesn't exist yet.

### Testing

**Vitest + React Testing Library + MSW**, focused on the flows where logic actually lives: fallback rendering, polling-until-terminal, error-envelope handling, 409 on reprocess. MSW fixtures mirror the real envelope shapes. No E2E suite for a personal app — "done means demonstrated" is satisfied by running against the real local backend.

### Tooling

- **pnpm** for packages, **Biome** for lint+format — one fast tool each, mirroring the backend's uv+ruff philosophy.
- `justfile` recipes (this is the frontend repo's own justfile, so no `fe-` prefix): `dev`, `build`, `lint`, `format`; `test` and `typegen` (openapi codegen) arrive with the test harness in phase 1.2.

## Project layout (planned)

```
frontend/
  ARCHITECTURE.md        this file
  design/                Sunday Kitchen mockups (visual spec, keep)
  src/
    api/                 fetch client, generated schema.d.ts, query hooks
    features/
      search/            search bar, result cards, answer card, fallback
      recipe/            detail screen
      library/           shelf, dropzone, ingestion progress
    ui/                  shared primitives (pills, panels, nav shell)
    theme.css            Tailwind @theme tokens + hand-tuned layer
  tests/                 Vitest + MSW
```

## Open questions (parked, not blocking)

1. **Production serving & backend auth**: single hostname with proxy-injected token vs. CF Access JWT validation in FastAPI vs. api subdomain. Decide when deployment starts; nothing in the app couples to the choice.
2. **Review queue**: needs design + backend endpoint (no way to promote `needs_review` → `ready` via API today).
3. **Answer streaming**: `/answers` is non-streaming today; if wait times annoy, revisit backend streaming later — the on-demand answer UX already absorbs most of the pain.
4. **PDF access**: backend has no endpoint to view the source PDF/page; citations stay text labels ("page 22") until that exists.

# Frontend Architecture — rag-recipes

Status: agreed 2026-07-31 (grilling session). Design direction and API contract are fixed; deployment details are deliberately deferred.

## What this is

A single-user web frontend for the rag-recipes backend: search the recipe library, get grounded LLM answers with page citations, browse recipe details, and manage cookbook ingestion.

- **Design direction (superseded 2026-08-25):** was **Sunday Kitchen** — cream/apricot palette, Petrona (display serif) + Figtree (body), lifted cards, staggered `bloom` reveals, with the four mockups in `design/` as the visual spec. Replaced by a re-skin modelled on **ChatGPT's web app**: flat surfaces separated by hairlines, near-white page against a grey nav rail, one near-black solid for primary actions, blue for links, the system sans stack, and no ornament. Structure moved with it — the top pill-bar header became a left sidebar, collapsible on every viewport: a column that shrinks to zero width beside the page above 880px, an overlay drawer below it. The mockups in `design/` are now history, not spec; `src/theme.css` is the authority. What carried over unchanged: no food photography, and typography plus book/page provenance still doing the work.

## Decisions

### Runtime & deployment

- **Target**: home server, same machine as the backend, exposed via a **cloudflared tunnel** as `recipes.ivot.dev`, gated by **Cloudflare Access**.
- **Settled 2026-08-24** (was open question 1): **single hostname, Caddy front, proxy-injected token.** Caddy on `127.0.0.1:8090` is the tunnel's only origin — it serves `dist/` and path-splits `/api/*` to the API on `127.0.0.1:8004`, setting `Authorization: Bearer $RAG_RECIPES_TOKEN` on the way through. Consequences: the API is absent from the tunnel ingress and unreachable from outside; the token never enters the bundle or the browser; `/openapi.json`, `/docs` and `/redoc` are not routed and so stay unreachable (FastAPI registers them as plain Starlette routes, which the app-level `require_api_token` dependency does not gate); and because the origin is shared there is still no CORS or preflight. CF Access JWT validation in FastAPI was rejected as backend work that buys nothing here — Access already gates the hostname and the bearer token is the layer behind it. See `../rag-knowledge/DEPLOY.md`.
- Consequence for the code now: stay deployment-agnostic. API calls go to a **relative `/api` base**; the Vite dev server proxies `/api` → `http://localhost:8004`. Whatever fronts the app in production (Caddy/nginx/cloudflared config) does the same path-split. No CORS work needed on the backend as long as the origin is shared; auth header injection stays pluggable (dev: Vite proxy injects `Authorization: Bearer $RAG_RECIPES_TOKEN` — the frontend-side name for the same secret the backend reads as `PERSONAL_API_TOKEN`, kept distinct so both can live in one shell; prod: reverse proxy or CF Access JWT — open question).

### Stack

- **Vite + React + TypeScript**, plain SPA. No SSR framework — nothing here needs it.
- **Tailwind CSS v4** with the design tokens mapped into a custom theme (`@theme`), and dark mode as a value-only override of the same token names under `html[data-theme="dark"]`. Because every token is named for its ROLE (surface / fg / accent / border / status) rather than its pigment, the 2026-08-25 re-skin was almost entirely a value edit — the ~250 utility call sites re-themed without a class change.
  - **Superseded 2026-08-25:** the tokens were the Sunday Kitchen set (cream `#FBF7EF`, ink `#2B241A`, apricot `#C96F3B`), and a small CSS layer carried hand-tuned pieces from the mockups — staggered `bloom` reveals and flat soft-fill card headers with an accent ink. Both are gone: the entrance animation is a no-op (nothing in the new language fades in) and the card-header fills were replaced by ink-only book accents. The layer now holds only the ingestion progress animations, which are feedback rather than decoration.
- **No webfonts.** Type is the system sans stack (`ui-sans-serif, system-ui, -apple-system, …`) — the same fallback the design target ships behind its custom face. Renders natively everywhere and stays off the critical path.
  - **Superseded 2026-08-25:** was self-hosted `@fontsource/petrona` + `@fontsource/figtree` (the app is tunnel-exposed, so a Google CDN dependency was ruled out). That constraint still holds; it is simply moot with no webfonts to host.

### Data layer

- **TanStack Query** over a **thin hand-rolled fetch client**. The client knows two things: the error envelope (`{error: {code, message, details}}` — thrown as a typed `ApiError`) and the base path. No client-only global state beyond that — no Redux/Zustand.
- **Types are generated, not written**: `openapi-typescript` against the backend's `/openapi.json` → `src/api/schema.d.ts`, regenerated via `just typegen` when the backend changes (`just typegen-check` fails on staleness). Zero drift with the FastAPI schemas for **paths, methods, params, request bodies and — since backend 21.1's `response_model` sweep — response bodies** (`SearchRequestBody`, `AnswerRequestBody` etc. are generated and are to be used directly, never hand-written; the review types in `src/api/types.ts` are aliases into the generated `components["schemas"]`). The **error envelope** still has no generated type, and the remaining hand-written response types in `types.ts` (search, documents, uploads, knowledge items, answers) are legacy pending a follow-up sweep to the generated equivalents.
- **Ingestion polling**: `GET /documents/{id}/status` with TanStack Query `refetchInterval`, stopping when `terminal: true`. Drives the library screen's stage stepper + page progress bar.

### Search & answer flow

- **Search-only by default, answer on demand.** Typing a query fires `POST /search` (fast, no LLM) and renders result cards. The grounded answer is an explicit action — an "Ask the shelf" affordance triggers `POST /answers` (`include_results: false`) and fills the answer card when the LLM returns. Keeps token spend intentional and the default interaction instant.
- **Fallback state** (designed in `sk-fallback.html`): when `/answers` returns non-empty `warnings`, render the amber notice — `answer.text` is the warning, not an answer — and show the `results` array the endpoint always returns on fallback. Never treat fallback as an error.
- Search query lives in the URL (`/?q=...`) so results are restorable and shareable. Since 2026-08-26 the composer's two settings ride there too — `asked=1` / `menu=1` (mutually exclusive) name the action that was committed and `?mode=` the retrieval mode (hybrid omitted) — so Back/Forward restore the exact ask, and nothing fires until the reader submits.
- **Compose a menu** (added 2026-08-25) is the second on-demand LLM action: `POST /menus` (`src/api/menus.ts`, a sibling of the answer hook) takes the same query and returns a course-by-course selection with citations; it degrades through the same `warnings` fallback and is never auto-fired.
- **Answer text contract** (2026-08-26): the backend's versioned answer prompt now states the shape of `answer.text` — GitHub-flavoured Markdown, citations inline as `[cite_N]` right after the sentence they support. `src/features/search/answerText.ts` parses exactly that declared format (paragraphs, ordered/bulleted lists, bold/italic, the citation token) into React segments; it never renders HTML. If the prompt version changes the format, the parser and its fixtures in `tests/msw/answers.ts` change with it.

### Routing

**React Router**. `src/routes.tsx` owns the table; this is its mirror (kept current as of 2026-08-26).

The Mockup column records which `design/` file each screen was built from. Those mockups were superseded on 2026-08-25 (see "What this is"), so the column is provenance, not a spec to check against.

| Route | Screen | Mockup (retired) |
|---|---|---|
| `/` (`?q=`, `?mode=`, `asked=1` / `menu=1`) | Search + on-demand answer or menu | `e-sunday-kitchen.html` (+ `sk-fallback.html` state) |
| `/recipes/new` | Write a recipe by hand (`POST /knowledge-items`, lands on the read page as `indexing`) | none — the edit form's chrome |
| `/recipes/:id` | Recipe detail (`GET /knowledge-items/{id}`) | `sk-recipe.html` |
| `/recipes/:id/edit` | In-place edit (`PATCH /knowledge-items/{id}`; `ready` and `needs_review` only) | none — the read page's chrome |
| `/favourites` | Saved recipes (`GET /favourites`) | no mockup — `/review`'s list chrome |
| `/library` | Shelf + upload + ingestion status | `sk-library.html` |
| `/library/:documentId` | A book's contents, with edit and delete per recipe (`GET /documents/{id}/knowledge-items`) | none — `/review`'s list chrome |
| `/review` | Review queue (`GET /review-items`, `POST /knowledge-items/{id}/review`) | none — designed in code, epic 04 |

### Favourites

A star on a recipe, and the list of starred ones. Added after v1; the backend
keeps it in its own `knowledge_item_favourites` table rather than as a column
on `knowledge_items` (a column would bump that row's `updated_at`, which the
stuck-indexing sweeper reads as lifecycle progress).

Three endpoints — `PUT`/`DELETE /knowledge-items/{id}/favourite` (both
idempotent) and `GET /favourites` — and one new field, `favourited_at`, on the
item detail and on every listing row. **Search results deliberately do not
carry it**: `/search` projects the retrieval layer, which knows nothing about
stars, so the search grid reads the `['favourites']` id set once and hands
each card a boolean, while the recipe page and book rows answer from their own
row.

The star is one component (`features/favourites/FavouriteButton`) on all four
surfaces. It holds its own optimism while a request is in flight; the toggle
hook then WRITES the server's `favourited_at` into the item and listing caches
rather than invalidating them (`useUpdateKnowledgeItem`'s D5 — invalidating
would flicker the star through a refetch). `['favourites']` itself is
invalidated on settle rather than written, because a search card has no
listing row to insert and synthesizing one would put a half-invented recipe in
a shared cache; the unstar path removes optimistically, since there the row is
real.

Known consequence, chosen deliberately: reprocessing a book supersedes its
items, so a favourite survives as a star on the superseded row rather than
following the recipe into the new generation. The list keeps showing it (with
its status) instead of the row quietly vanishing — carrying stars across
generations would need identity matching between generations, which does not
exist.

### v1 scope

The four designed screens only: search+answer, recipe detail, library (upload, per-book counts, processing/failed states, reprocess), fallback. The **review queue is out of v1** — for now a library link filters search to `needs_review` items (read-only); a real triage UI needs its own design pass *and* a backend "mark ready" endpoint that doesn't exist yet.

- **Superseded (epics 04–05, 2026-08):** the backend shipped `GET /review-items` and `POST /knowledge-items/{id}/review`, and the frontend built the queue (`/review`), in-place editing (`/recipes/:id/edit`) and the per-book contents page on top of them. The v1 line above is history; the routing table is the current scope.

### API contracts the code leans on

These used to live in per-epic `docs/*-api-contract.md` and `DECISIONS.md` files that are not tracked; the load-bearing rules are restated here so a code comment can cite a section that exists.

- **Page walk.** Every listing (`/documents`, `/review-items`, `/documents/{id}/knowledge-items`, `/favourites`) is fetched page by page with `limit`/`offset` until a short page, deduped by id — offsets shift under concurrent writes, and the backend returns no total. A hard cap (`PaginationCapError`) stops a runaway walk.
- **Edit semantics** (`PATCH /knowledge-items/{id}`). An ABSENT key is untouched; an explicit `null` clears a nullable field; line lists (ingredients, steps) are replaced wholesale and renumbered from list order; a submitted line whose text matches an existing one keeps that line's parse byte-identical, a new or rewritten line is marked human-authored. The body model is `extra="forbid"`, so presentation-only state (e.g. review marks) must never reach the request. The response IS the GET body and is written into `['knowledge-item', id]` rather than invalidated.
- **Review decision seam.** `useReviewDecision` and the edit/delete hooks accept a caller-supplied `onMutate`/`onSettled` because TanStack v5 takes per-call `onSuccess`/`onError`/`onSettled` but not `onMutate`; a card that wants an optimistic removal has to be handed the hook.
- **Warnings are backend-authored.** `review_reasons[].code` is an opaque enum used as a stable key; `message` is rendered verbatim. The frontend keeps no code→copy table, and the MSW contract mocks in `src/mocks/` model only the warnings they say they do.

### Testing

**Vitest + React Testing Library + MSW**, focused on the flows where logic actually lives: fallback rendering, polling-until-terminal, error-envelope handling, 409 on reprocess. MSW fixtures mirror the real envelope shapes. No E2E suite for a personal app — "done means demonstrated" is satisfied by running against the real local backend.

### Tooling

- **pnpm** for packages, **Biome** for lint+format — one fast tool each, mirroring the backend's uv+ruff philosophy.
- `justfile` recipes (this is the frontend repo's own justfile, so no `fe-` prefix): `dev`, `build`, `lint`, `format`, `test` (Vitest + MSW), `typegen` (openapi codegen into `src/api/schema.d.ts`) and `typegen-check` (same codegen with `--check`, to prove the committed schema is not stale). Both typegen recipes need the backend running on :8004.

## Project layout (planned)

```
frontend/
  ARCHITECTURE.md        this file
  design/                retired Sunday Kitchen mockups (history, not spec)
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

1. ~~**Review queue**: needs design + backend endpoint.~~ Resolved 2026-08 — see "v1 scope".
2. **Answer streaming**: `/answers` is non-streaming today; if wait times annoy, revisit backend streaming later — the on-demand answer UX already absorbs most of the pain.
3. **PDF access**: backend has no endpoint to view the source PDF/page; citations stay text labels ("page 22") until that exists.

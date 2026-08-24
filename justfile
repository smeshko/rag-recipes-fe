# Default: list available recipes.
default:
    @just --list

# Run the Vite dev server.
#
# Export RAG_RECIPES_TOKEN first — the dev proxy injects it as
# `Authorization: Bearer $RAG_RECIPES_TOKEN` on every /api request. It is the
# frontend-side name for the secret the backend reads as PERSONAL_API_TOKEN;
# set it in the shell, never in a .env file. Unset → header omitted → the
# backend answers 401 on every call.
dev:
    @[ -n "${RAG_RECIPES_TOKEN:-}" ] || echo "warning: RAG_RECIPES_TOKEN is not set — the proxy will omit Authorization and the backend will answer 401. Export it (same value as the backend's PERSONAL_API_TOKEN)."
    pnpm dev

# Type-check and produce the production build.
build:
    pnpm build

# Lint + format check via Biome.
lint:
    pnpm exec biome check .

# Format (and apply safe fixes / import sorting) via Biome.
format:
    pnpm exec biome check --write .

# Run the Vitest + MSW suite once.
test:
    pnpm exec vitest run

# Regenerate src/api/schema.d.ts from the running backend's OpenAPI schema.
typegen:
    @curl -sf -o /dev/null http://localhost:8004/openapi.json || (echo "backend not reachable on :8004 — start it with 'just dev-api' in ../rag-knowledge" && exit 1)
    pnpm exec openapi-typescript http://localhost:8004/openapi.json -o src/api/schema.d.ts

# Verify the committed schema.d.ts is up to date with the running backend.
typegen-check:
    @curl -sf -o /dev/null http://localhost:8004/openapi.json || (echo "backend not reachable on :8004 — start it with 'just dev-api' in ../rag-knowledge" && exit 1)
    pnpm exec openapi-typescript http://localhost:8004/openapi.json -o src/api/schema.d.ts --check

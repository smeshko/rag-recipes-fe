# Default: list available recipes.
default:
    @just --list

# Run the Vite dev server.
dev:
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
    @curl -sf -o /dev/null http://localhost:8001/openapi.json || (echo "backend not reachable on :8001 — start it with 'just dev' in ../backend" && exit 1)
    pnpm exec openapi-typescript http://localhost:8001/openapi.json -o src/api/schema.d.ts

# Verify the committed schema.d.ts is up to date with the running backend.
typegen-check:
    @curl -sf -o /dev/null http://localhost:8001/openapi.json || (echo "backend not reachable on :8001 — start it with 'just dev' in ../backend" && exit 1)
    pnpm exec openapi-typescript http://localhost:8001/openapi.json -o src/api/schema.d.ts --check

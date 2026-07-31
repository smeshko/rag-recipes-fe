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

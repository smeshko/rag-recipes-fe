/* The one file in the suite that touches the filesystem, so it pulls @types/node
   in by reference rather than widening tsconfig.test.json's `types` for every
   other test. (Vite's `?raw` would have avoided node entirely, but the Tailwind
   plugin claims .css imports and hands back an empty string.) */
/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";

/* The dark palette is a VALUE override: `html[data-theme="dark"]` redeclares
   names `@theme` already owns. A typo there — `--color-suface` — is perfectly
   valid CSS. It emits no warning, fails no build, breaks no other test, and
   simply leaves that one surface painted light in dark mode. Nothing else in
   the suite can see it, so this guard reads theme.css as text and asserts the
   dark block only ever declares names the light block declares.

   Text, not a DOM: jsdom does not run Tailwind, and `@theme` is a Tailwind
   at-rule that no CSSOM in the suite would parse into rules anyway.

   Comments are stripped up front rather than skipped in the matchers:
   theme.css groups its tokens under "--- Surfaces ---" style headers, so the
   first declaration of every group is preceded by a comment rather than by a
   semicolon, and an anchored declaration matcher would silently miss exactly
   one token per group — the failure mode this guard exists to prevent.

   The path goes through process.cwd() (vitest's cwd is the project root)
   rather than import.meta.url, which under jsdom is an http:// URL that
   fileURLToPath refuses. */

const THEME_CSS = readFileSync(
  join(process.cwd(), "src/theme.css"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

/* Returns the text between the braces of the first block whose selector /
   at-rule matches `opener`, brace-counted so a nested block (or a future one)
   cannot cut it short.

   Mind the prose here: Tailwind scans tests/ for class candidates, so a bare
   utility name written in a comment mints a real rule in dist — an earlier
   draft of this very sentence shipped an unused overflow utility that way. */
function blockBody(css: string, opener: string): string {
  const at = css.indexOf(opener);
  if (at === -1) throw new Error(`theme.css has no \`${opener}\` block`);

  const open = css.indexOf("{", at + opener.length);
  if (open === -1) throw new Error(`\`${opener}\` is not followed by a block`);

  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`\`${opener}\` block is unterminated`);
}

/* Custom-property NAMES declared in a block. A declaration has to open its
   line (or follow a `;` / `{`), which is what keeps the `var(--color-surface-
   warm)` inside --gradient-warm's multi-line value from counting as a
   declaration of that name. */
function declaredNames(body: string): Set<string> {
  return new Set(
    Array.from(
      body.matchAll(/(?:^|[;{])[^\S\n]*(--[\w-]+)\s*:/gm),
      (m) => m[1],
    ),
  );
}

const light = declaredNames(blockBody(THEME_CSS, "@theme"));
const dark = declaredNames(blockBody(THEME_CSS, 'html[data-theme="dark"]'));

describe("theme.css token parity", () => {
  it("parses both blocks", () => {
    // Guards the guard: a regex that silently matches nothing would make the
    // subset assertion below vacuously true.
    expect(light.size).toBeGreaterThan(30);
    expect(dark.size).toBeGreaterThan(20);
  });

  it("declares every dark token name in @theme too", () => {
    const orphans = [...dark].filter((name) => !light.has(name)).sort();

    expect(orphans).toEqual([]);
  });

  it("routes every shadow colour through an overridable var()", () => {
    /* Tailwind v4 inlines an @theme shadow's VALUE into --tw-shadow at build
       time, so a dark override of --shadow-card is dead CSS — but it preserves
       a var() colour inside the shadow. Every shadow must therefore carry its
       colour in a custom property, or that shadow is unreachable from the dark
       block however correct the override reads. The tints are the exception:
       they ARE the colour, so a literal is the point of them. */
    const shadows = Array.from(
      blockBody(THEME_CSS, "@theme").matchAll(
        /(?:^|[;{])[^\S\n]*(--shadow-(?!tint)[\w-]+)\s*:([^;]*);/gm,
      ),
      ([, name, value]) => ({
        shadow: name,
        literalColour: /#[0-9a-fA-F]{3,8}|rgba?\(/.test(value),
      }),
    );

    expect(shadows.length).toBeGreaterThan(0);
    expect(shadows.filter((s) => s.literalColour)).toEqual([]);
  });
});

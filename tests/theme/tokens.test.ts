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

/* Custom-property VALUES, for the one token whose value is duplicated outside
   this file. */
function declaredValue(body: string, name: string): string {
  const match = body.match(
    new RegExp(String.raw`(?:^|[;{])[^\S\n]*${name}\s*:\s*([^;]+);`, "m"),
  );
  if (match?.[1] === undefined) throw new Error(`no \`${name}\` declaration`);
  return match[1].trim().toLowerCase();
}

function hexes(source: string): string[] {
  return Array.from(source.matchAll(/#[0-9a-fA-F]{6}\b/g), (m) =>
    m[0].toLowerCase(),
  );
}

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

  it("gives every @theme colour token a dark value", () => {
    /* The other direction, and the one the plan's Risks section says already
       bit once: a token the dark block simply OMITS is not a typo, it is a
       surface that keeps its light value in dark mode. The first draft of the
       plan missed three (--color-surface-warm, --color-surface-warm-strong,
       --color-surface-glow) and only a hand review caught them.

       Scoped to --color-* on purpose. The rest of @theme is either
       theme-independent (fonts, radii), already re-toned through its own
       property (the --shadow-* tokens route their colour through
       --shadow-tint-*, guarded below), or derives from tokens that are
       overridden (--gradient-warm is var()-only, so it follows the surfaces). */
    const missing = [...light]
      .filter((name) => name.startsWith("--color-") && !dark.has(name))
      .sort();

    expect(missing).toEqual([]);
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

/* The page wash is the one token whose value is duplicated outside theme.css:
   the pre-paint script in index.html has to paint it before any stylesheet
   exists, and themeStore's stamp() has to repaint it when the theme changes.
   Plan D10 accepts the duplication and asks for the three to be kept in sync by
   comment. Comments do not fail builds — and drift here is silent in every way
   that matters: CSS still compiles, the suite still passes, and the only
   symptom is a flash of the wrong colour on a COLD load, which no warm-cache
   dev session ever shows. Hence this guard. */
describe("page wash hexes stay in sync outside theme.css", () => {
  const expected = [
    declaredValue(blockBody(THEME_CSS, "@theme"), "--color-surface"),
    declaredValue(
      blockBody(THEME_CSS, 'html[data-theme="dark"]'),
      "--color-surface",
    ),
  ].sort();

  it("matches the pre-paint script in index.html", () => {
    const html = readFileSync(join(process.cwd(), "index.html"), "utf8");

    /* Scoped to the pre-paint <script>, not to the file. The rest of <head> is
       allowed its own colours — a `<meta name="theme-color">`, a tile colour, an
       inline SVG favicon — and a guard that failed on those would be reporting
       "the pre-paint script drifted" about markup the script has nothing to do
       with. The pre-paint script is the FIRST script in the document and the
       only inline one; `main.tsx` is a module with a src. */
    const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];
    if (script === undefined) {
      throw new Error("index.html has no inline <script> to check");
    }

    /* Comments carry the hexes as prose too — strip them, or the assertion
       passes on the documentation rather than on the code. */
    const code = script.replace(/\/\*[\s\S]*?\*\//g, "");

    expect([...new Set(hexes(code))].sort()).toEqual(expected);
  });

  it("matches PAGE_COLOR in themeStore", () => {
    const store = readFileSync(
      join(process.cwd(), "src/ui/theme/themeStore.ts"),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "");

    expect([...new Set(hexes(store))].sort()).toEqual(expected);
  });
});

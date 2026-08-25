#!/usr/bin/env node
/**
 * B3 — design token gate (07_DESIGN_SYSTEM §7.3, §7.5, §7.11).
 *
 * The audit found lime serving as brand, primary and accent at once, and gold
 * serving as both brand accent and "at risk". A colour that is both a button and
 * an alarm makes every screen carry a low-level false signal, and it is the kind
 * of regression that reappears the moment nobody is looking — so it is checked
 * here rather than left to review.
 *
 * Six assertions:
 *   1. Every token in §7.3 is declared in src/index.css with the exact hex.
 *   2. Brand hexes and status hexes are disjoint sets. Same for brand vs fever.
 *   3. The --forest / --lime aliases resolve into the brand set.
 *   4. The primary button surface is brand-primary, never brand-accent.
 *   5. Space Grotesk is gone (§7.5 keeps three families, each with a job).
 *   6. src/lib/tokens.ts — the mirror SVG needs, since presentation attributes
 *      do not substitute var() — matches the CSS exactly.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const CSS_PATH = join(ROOT, "src", "index.css");
const TS_PATH = join(ROOT, "src", "lib", "tokens.ts");

const failures = [];
const fail = (msg) => failures.push(msg);

// ── §7.3 — the spec table, verbatim ─────────────────────────────────────────

const EXPECTED_BRAND = {
  "brand-ink": "#0E1F1A",
  "brand-primary": "#0E1F1A",
  "brand-accent": "#D3F36B",
  "brand-muted": "#5B6B66",
  surface: "#FFFFFF",
  bg: "#F6F8F7",
  border: "#E2E8E5",
};

const EXPECTED_STATUS = {
  "status-moving": "#2D7A9E",
  "status-ready": "#7C8B99",
  "status-waiting": "#C77D18",
  "status-review": "#5B7C99",
  "status-attention": "#B3402B",
  "status-done": "#3E7A5B",
};

const EXPECTED_FEVER = {
  "fever-ok": "#3E7A5B",
  "fever-watch": "#C77D18",
  "fever-act": "#B3402B",
};

// ── Parse the :root block ───────────────────────────────────────────────────

const css = readFileSync(CSS_PATH, "utf8");

const rootStart = css.indexOf(":root {");
if (rootStart === -1) {
  console.error("check-tokens: FAIL — no :root block in src/index.css");
  process.exit(1);
}
const rootEnd = css.indexOf("\n}", rootStart);
const rootBlock = css.slice(rootStart, rootEnd);

/** name -> declared value, comments stripped so a hex in prose never counts. */
const declared = new Map();
for (const line of rootBlock.replace(/\/\*[\s\S]*?\*\//g, "").split(/\r?\n/)) {
  const match = /^\s*--([\w-]+)\s*:\s*([^;]+);/.exec(line);
  if (match) declared.set(match[1], match[2].trim());
}

const normalize = (hex) => hex.trim().toUpperCase();
const isHex = (value) => /^#[0-9a-fA-F]{6}$/.test(value.trim());

function expect(table, label) {
  for (const [name, hex] of Object.entries(table)) {
    const actual = declared.get(name);
    if (!actual) {
      fail(`${label}: --${name} is not declared in src/index.css`);
      continue;
    }
    if (normalize(actual) !== hex) {
      fail(`${label}: --${name} is ${actual}, §7.3 says ${hex}`);
    }
  }
}

expect(EXPECTED_BRAND, "missing/incorrect brand token");
expect(EXPECTED_STATUS, "missing/incorrect status token");
expect(EXPECTED_FEVER, "missing/incorrect fever token");

// ── 2. Brand and status are disjoint sets ───────────────────────────────────

/** Every declared token under a prefix, including the -ink and -tint variants. */
function hexesWithPrefix(prefixes) {
  const out = new Map();
  for (const [name, value] of declared) {
    if (!prefixes.some((p) => name === p || name.startsWith(`${p}-`))) continue;
    if (!isHex(value)) continue;
    out.set(name, normalize(value));
  }
  return out;
}

const brandHexes = hexesWithPrefix(["brand", "surface", "bg", "border"]);
const statusHexes = hexesWithPrefix(["status"]);
const feverHexes = hexesWithPrefix(["fever"]);

function assertDisjoint(a, aLabel, b, bLabel) {
  const byHex = new Map();
  for (const [name, hex] of a) byHex.set(hex, name);
  for (const [name, hex] of b) {
    const clash = byHex.get(hex);
    if (clash) {
      fail(
        `${aLabel} and ${bLabel} share ${hex}: --${clash} and --${name}. ` +
          `§7.3 — no colour appears in both sets, ever.`,
      );
    }
  }
}

assertDisjoint(brandHexes, "brand", statusHexes, "status");
assertDisjoint(brandHexes, "brand", feverHexes, "fever");

if (statusHexes.size === 0 || brandHexes.size === 0) {
  fail("token sets came back empty — the :root parser is not seeing the tokens");
}

// ── 3. Aliases stay inside the brand set ────────────────────────────────────

for (const alias of ["forest", "lime"]) {
  const value = declared.get(alias);
  if (!value) {
    fail(`--${alias} alias is missing; it is kept for backward compatibility`);
    continue;
  }
  const target = /^var\(--([\w-]+)\)$/.exec(value)?.[1];
  if (!target || !brandHexes.has(target)) {
    fail(`--${alias} must alias a brand token, got "${value}"`);
  }
}

// ── 4. The CTA surface is forest, not lime ──────────────────────────────────

const btnPrimary = /\.btn-primary\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
if (!btnPrimary) {
  fail(".btn-primary rule not found in src/index.css");
} else {
  if (!/background:\s*var\(--brand-primary\)/.test(btnPrimary)) {
    fail(".btn-primary background must be var(--brand-primary) — §7.3");
  }
  if (btnPrimary.toUpperCase().includes(EXPECTED_BRAND["brand-accent"])) {
    fail(
      ".btn-primary uses brand-accent as a surface. Lime is ~1.5:1 on white and " +
        "cannot carry a label (§7.2).",
    );
  }
}

// ── Walk src/ once for the remaining file-level rules ───────────────────────

const SKIP_DIR = new Set(["node_modules", "dist", "build", "coverage", ".git"]);
const files = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(ts|tsx|css|html|js)$/.test(name)) files.push(full);
  }
}
walk(join(ROOT, "src"));
files.push(join(ROOT, "index.html"), join(ROOT, "tailwind.config.js"));

// ── 5. Space Grotesk is dropped (§7.5) ──────────────────────────────────────

for (const file of files) {
  const text = readFileSync(file, "utf8");
  if (/Space\s*Grotesk|Space\+Grotesk/i.test(text)) {
    fail(`${relative(ROOT, file)} still loads Space Grotesk — §7.5 keeps three families`);
  }
}

// ── 6. No status colour is hardcoded outside the token files ────────────────

const TOKEN_FILES = new Set([CSS_PATH, TS_PATH]);
const statusHexList = [...new Set([...statusHexes.values(), ...feverHexes.values()])];

for (const file of files) {
  // The token files declare the palette; the tests pin it to the spec table.
  if (TOKEN_FILES.has(file) || /\.test\.(ts|tsx)$/.test(file)) continue;
  const text = readFileSync(file, "utf8").toUpperCase();
  for (const hex of statusHexList) {
    if (text.includes(hex)) {
      fail(
        `${relative(ROOT, file)} hardcodes the status colour ${hex}. ` +
          `Use the status token so the palette stays changeable in one place.`,
      );
    }
  }
}

// ── 7. The TypeScript mirror matches the CSS ────────────────────────────────

const ts = readFileSync(TS_PATH, "utf8");
const tsHexes = new Set([...ts.matchAll(/#[0-9a-fA-F]{6}/g)].map((m) => normalize(m[0])));

for (const [name, hex] of [...statusHexes, ...feverHexes, ...brandHexes]) {
  if (!tsHexes.has(hex)) {
    fail(`src/lib/tokens.ts is missing ${hex} (--${name}) — the CSS mirror has drifted`);
  }
}

const cssHexes = new Set([...brandHexes.values(), ...statusHexes.values(), ...feverHexes.values()]);
for (const hex of tsHexes) {
  if (!cssHexes.has(hex)) {
    fail(`src/lib/tokens.ts declares ${hex}, which is not a token in src/index.css`);
  }
}

// ── Report ──────────────────────────────────────────────────────────────────

if (failures.length > 0) {
  console.error("check-tokens: FAIL — brand and status must be disjoint sets (§7.3):\n");
  console.error(failures.map((f) => `  · ${f}`).join("\n"));
  process.exit(1);
}

console.log(
  `check-tokens: OK — ${brandHexes.size} brand, ${statusHexes.size} status, ` +
    `${feverHexes.size} fever tokens, no overlap`,
);

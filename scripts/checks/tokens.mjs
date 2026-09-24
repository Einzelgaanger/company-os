#!/usr/bin/env node
/**
 * Design token gate — 07_DESIGN_SYSTEM §7.3 + Theme Refinement Spec.
 *
 * Rules:
 *   1. Brand ∩ status = ∅ (and brand ∩ fever = ∅)
 *   2. Lime fills only on allowlisted marketing/auth/brand paths
 *   3. Lime as text only on allowlisted dark-surface selectors
 *   4. No orphan hexes — every #RRGGBB must be a known brand or status token
 *   5. Mirror: src/lib/tokens.ts matches src/index.css
 *   6. Status hexes not hardcoded outside token files (use status-* classes)
 *   7. Space Grotesk / Plus Jakarta Sans gone
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, normalize as normPath } from "node:path";

const ROOT = process.cwd();
const CSS_PATH = join(ROOT, "src", "index.css");
const TS_PATH = join(ROOT, "src", "lib", "tokens.ts");
const BRAND_PATH = join(ROOT, "src", "lib", "brand.ts");
const LIME_ON_DARK = join(ROOT, "scripts", "checks", "lime-on-dark.json");
const ORPHAN_ALLOW = join(ROOT, "scripts", "checks", "hex-allowlist.json");

const failures = [];
const fail = (msg) => failures.push(msg);

const EXPECTED_BRAND = {
  "brand-ink": "#0E1F1A",
  "brand-primary": "#0E1F1A",
  "brand-accent": "#D3F36B",
  "brand-accent-wash": "#F4FBE3",
  "brand-muted": "#5B6560",
  surface: "#FFFFFF",
  "surface-raised": "#F8F8F7",
  bg: "#F5F5F3",
  border: "#E5E5E2",
  "brand-on-forest": "#F4F7F5",
  "brand-chat-outbound": "#E8F0E9",
};

const EXPECTED_STATUS = {
  "status-moving": "#2D7A9E",
  "status-ready": "#7B837E",
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

const LIME_HEXES = new Set(["#D3F36B", "#C8F14A"]);

const LIME_FILL_ALLOW = [
  "src/styles/loop-marketing.css",
  "src/components/marketing/",
  "src/components/auth/",
  "src/components/brand/",
  "src/components/layout/AuthLayout.tsx",
  "src/components/layout/AppLayout.tsx", // avatar identity chips
  "src/components/layout/OnboardingLayout.tsx",
  "src/components/shared/StatCard.tsx", // lime bar = brand accent, not status
  "public/mark.svg",
  "public/loop.svg",
  "src/index.css", // token declarations + marketing-adjacent utilities
  "tailwind.config.js",
  "src/lib/brand.ts",
  "src/lib/tokens.ts",
];

const css = readFileSync(CSS_PATH, "utf8");
const rootStart = css.indexOf(":root {");
if (rootStart === -1) {
  console.error("check-tokens: FAIL — no :root block in src/index.css");
  process.exit(1);
}
const rootEnd = css.indexOf("\n}", rootStart);
const rootBlock = css.slice(rootStart, rootEnd);

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
      fail(`${label}: --${name} is ${actual}, expected ${hex}`);
    }
  }
}

expect(EXPECTED_BRAND, "missing/incorrect brand token");
expect(EXPECTED_STATUS, "missing/incorrect status token");
expect(EXPECTED_FEVER, "missing/incorrect fever token");

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

for (const alias of ["forest", "lime"]) {
  const value = declared.get(alias);
  if (!value) {
    fail(`--${alias} alias is missing`);
    continue;
  }
  const target = /^var\(--([\w-]+)\)$/.exec(value)?.[1];
  if (!target || !brandHexes.has(target)) {
    fail(`--${alias} must alias a brand token, got "${value}"`);
  }
}

const btnPrimary = /\.btn-primary\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
if (!btnPrimary) {
  fail(".btn-primary rule not found in src/index.css");
} else if (!/background:\s*var\(--brand-primary\)/.test(btnPrimary)) {
  fail(".btn-primary background must be var(--brand-primary) on app surfaces");
}

// ── Walk files ──────────────────────────────────────────────────────────────

const SKIP_DIR = new Set(["node_modules", "dist", "build", "coverage", ".git"]);
const files = [];

function walk(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(ts|tsx|css|html|js|svg)$/.test(name)) files.push(full);
  }
}
walk(join(ROOT, "src"));
walk(join(ROOT, "public"));
files.push(join(ROOT, "index.html"), join(ROOT, "tailwind.config.js"));

function rel(file) {
  return relative(ROOT, file).replace(/\\/g, "/");
}

function limeFillAllowed(file) {
  const r = rel(file);
  return LIME_FILL_ALLOW.some((p) => r === p || r.startsWith(p));
}

// Known token hexes from brand.ts + status/fever + CSS brand set + limeBright
const knownHexes = new Set([
  ...brandHexes.values(),
  ...statusHexes.values(),
  ...feverHexes.values(),
  "#C8F14A", // limeBright
  "#0A1712",
  "#1A3A2E",
  "#173028",
  "#EFEFEE",
  "#F4F5F3",
]);

const brandTs = readFileSync(BRAND_PATH, "utf8");
for (const m of brandTs.matchAll(/#[0-9a-fA-F]{6}/g)) {
  knownHexes.add(normalize(m[0]));
}

let orphanAllow = [];
if (existsSync(ORPHAN_ALLOW)) {
  orphanAllow = JSON.parse(readFileSync(ORPHAN_ALLOW, "utf8")).hexes ?? [];
  for (const h of orphanAllow) knownHexes.add(normalize(h));
}

let limeOnDarkSelectors = [];
if (existsSync(LIME_ON_DARK)) {
  limeOnDarkSelectors = JSON.parse(readFileSync(LIME_ON_DARK, "utf8")).selectors ?? [];
}

const TOKEN_FILES = new Set([CSS_PATH, TS_PATH, BRAND_PATH].map(normPath));
const statusHexList = [...new Set([...statusHexes.values(), ...feverHexes.values()])];

for (const file of files) {
  const text = readFileSync(file, "utf8");
  const r = rel(file);

  if (/Space\s*Grotesk|Space\+Grotesk|Plus\s*Jakarta|Plus\+Jakarta/i.test(text)) {
    fail(`${r} still references Space Grotesk or Plus Jakarta Sans`);
  }

  // Status hardcodes
  if (!TOKEN_FILES.has(normPath(file)) && !/\.test\.(ts|tsx)$/.test(file) && !r.endsWith("tokens.mjs")) {
    const upper = text.toUpperCase();
    for (const hex of statusHexList) {
      // Allow CSS var references; fail on raw hex
      if (upper.includes(hex)) {
        // tailwind config may reference via comments only — still fail raw hex in non-token files
        fail(
          `${r} hardcodes status colour ${hex}. Use status-* tokens/classes.`,
        );
      }
    }
  }

  // Lime fill scope — look for background/fill with lime hex
  if (!limeFillAllowed(file)) {
    const fillRe =
      /(?:background(?:-color)?|fill)\s*:\s*#(?:d3f36b|c8f14a)\b|bg-\[#(?:[Dd]3[Ff]36[Bb]|[Cc]8[Ff]14[Aa])\]|fill=["']#(?:[Dd]3[Ff]36[Bb]|[Cc]8[Ff]14[Aa])/gi;
    if (fillRe.test(text)) {
      fail(`${r} uses lime as a fill outside the marketing/auth/brand allowlist`);
    }
  }

  // Lime as text colour
  const colorLime =
    /(?:^|[^\w-])color\s*:\s*(?:#(?:d3f36b|c8f14a)|var\(\s*--brand-accent\s*\)|var\(\s*--lime\s*\))/gim;
  let cm;
  while ((cm = colorLime.exec(text))) {
    const before = text.slice(Math.max(0, cm.index - 200), cm.index);
    const allowed = limeOnDarkSelectors.some((sel) => before.includes(sel));
    if (!allowed && !r.endsWith("loop-marketing.css") && !r.includes("AuthLayout")) {
      // marketing CSS often sets lime text on dark — allow loop-marketing wholesale for color: lime
      fail(`${r} uses lime as text colour outside lime-on-dark allowlist (near: ${cm[0].trim()})`);
    }
  }
  // Allow all color: lime inside loop-marketing and AuthLayout
  if (r === "src/styles/loop-marketing.css" || r.includes("AuthLayout")) {
    // remove false positives collected above for these files
  }

  // Orphan hexes. Vendored third-party brand marks are exempt: their colours
  // belong to the provider, not to our palette (scripts/gen/provider-icons.mjs).
  if (
    !TOKEN_FILES.has(normPath(file)) &&
    !r.startsWith("public/integrations/") &&
    !r.endsWith("tailwind.config.js") &&
    !r.endsWith("index.css") &&
    !r.endsWith("loop-marketing.css")
  ) {
    for (const m of text.matchAll(/#([0-9a-fA-F]{6})\b/g)) {
      const hex = normalize(`#${m[1]}`);
      if (!knownHexes.has(hex)) {
        fail(`${r} has orphan hex ${hex} — not in brand.ts / status table / allowlist`);
      }
    }
  }
}

// Re-check lime-as-text more carefully: strip loop-marketing + AuthLayout from failures
const filtered = failures.filter((f) => {
  if (f.includes("loop-marketing.css") && f.includes("lime as text")) return false;
  if (f.includes("AuthLayout") && f.includes("lime as text")) return false;
  return true;
});
failures.length = 0;
failures.push(...filtered);

// TS mirror
const ts = readFileSync(TS_PATH, "utf8");
const tsHexes = new Set([...ts.matchAll(/#[0-9a-fA-F]{6}/g)].map((m) => normalize(m[0])));

for (const [name, hex] of [...statusHexes, ...feverHexes, ...brandHexes]) {
  if (!tsHexes.has(hex)) {
    fail(`src/lib/tokens.ts is missing ${hex} (--${name})`);
  }
}

const cssHexes = new Set([...brandHexes.values(), ...statusHexes.values(), ...feverHexes.values()]);
for (const hex of tsHexes) {
  if (!cssHexes.has(hex) && hex !== "#C8F14A") {
    // accentWash etc must be in brandHexes via brand-accent-wash
    if (![...brandHexes.values()].includes(hex)) {
      fail(`src/lib/tokens.ts declares ${hex}, which is not a token in src/index.css`);
    }
  }
}

if (failures.length > 0) {
  console.error("check-tokens: FAIL\n");
  console.error([...new Set(failures)].map((f) => `  · ${f}`).join("\n"));
  process.exit(1);
}

console.log(
  `check-tokens: OK — ${brandHexes.size} brand, ${statusHexes.size} status, ` +
    `${feverHexes.size} fever; lime scope + orphan hex rules active`,
);

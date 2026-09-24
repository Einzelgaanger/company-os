#!/usr/bin/env node
/**
 * Connector parity gate.
 *
 * The catalog lives in four places that must agree exactly:
 *   src/lib/providers.ts                          — what the SPA renders
 *   apps/api/src/lib/providerRegistry.ts          — endpoints, scopes, env vars
 *   packages/db/migrations/*.sql                  — provider CHECK constraint
 *   public/integrations/<id>.svg                  — vendored brand mark
 *
 * A connector that exists in one and not the others is a connector that fails
 * at runtime, so this runs in ci:gates.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SPA = join(ROOT, "src", "lib", "providers.ts");
const REGISTRY = join(ROOT, "apps", "api", "src", "lib", "providerRegistry.ts");
const MIGRATIONS = join(ROOT, "packages", "db", "migrations");
const ICONS = join(ROOT, "public", "integrations");

const failures = [];
const fail = (msg) => failures.push(msg);

/** Reads a file with line endings normalised so the block regexes hold on Windows. */
function read(file) {
  return readFileSync(file, "utf8").replace(/\r\n/g, "\n");
}

/** Top-level entries of an object array literal, keyed by `id`. */
function parseEntries(file) {
  const text = read(file);
  const entries = new Map();
  for (const m of text.matchAll(/\n {2}\{\n([\s\S]*?)\n {2}\},/g)) {
    const body = m[1];
    const id = /\bid:\s*"([a-z0-9_]+)"/.exec(body)?.[1];
    if (!id) continue;
    entries.set(id, {
      auth: /\bauth:\s*"([a-z0-9_]+)"/.exec(body)?.[1] ?? null,
      orgLevel: /\borgLevel:\s*true/.test(body),
      icon: /\bicon:\s*"([^"]*)"/.exec(body)?.[1] ?? null,
      scopes: [...body.matchAll(/"([^"]+)"/g)].map((s) => s[1]),
      body,
    });
  }
  return entries;
}

const spa = parseEntries(SPA);
const registry = parseEntries(REGISTRY);

// PROVIDER_IDS must list exactly the entries the SPA defines.
const spaText = read(SPA);
const idsBlock = /export const PROVIDER_IDS = \[([\s\S]*?)\] as const;/.exec(spaText);
if (!idsBlock) {
  fail("src/lib/providers.ts: PROVIDER_IDS array not found");
} else {
  const declared = [...idsBlock[1].matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);
  const dupes = declared.filter((id, i) => declared.indexOf(id) !== i);
  if (dupes.length) fail(`PROVIDER_IDS has duplicates: ${dupes.join(", ")}`);
  for (const id of declared) {
    if (!spa.has(id)) fail(`PROVIDER_IDS lists ${id} with no PROVIDERS entry`);
  }
  for (const id of spa.keys()) {
    if (!declared.includes(id)) fail(`PROVIDERS entry ${id} is missing from PROVIDER_IDS`);
  }
}

if (spa.size === 0 || registry.size === 0) {
  console.error("check-connectors: parser found no entries — did the file format change?");
  process.exit(1);
}

// SPA ↔ API registry
for (const [id, meta] of spa) {
  const def = registry.get(id);
  if (!def) {
    fail(`${id} is in the SPA catalog but not in apps/api providerRegistry.ts`);
    continue;
  }
  if (meta.auth !== def.auth) {
    fail(`${id} auth differs: SPA ${meta.auth} vs API ${def.auth}`);
  }
  if (meta.orgLevel !== def.orgLevel) {
    fail(
      `${id} orgLevel differs: SPA ${meta.orgLevel} vs API ${def.orgLevel} — ` +
        `personal and workspace connections are stored differently`,
    );
  }
}
for (const id of registry.keys()) {
  if (!spa.has(id)) fail(`${id} is in providerRegistry.ts but not in the SPA catalog`);
}

// Provider CHECK constraint
const sql = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => read(join(MIGRATIONS, f)))
  .join("\n");
const checks = [...sql.matchAll(/CHECK\s*\(provider IN \(([\s\S]*?)\)\)/gi)];
if (checks.length === 0) {
  fail("no provider CHECK constraint found in packages/db/migrations");
} else {
  const latest = checks[checks.length - 1][1];
  const allowed = new Set([...latest.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]));
  for (const id of spa.keys()) {
    if (!allowed.has(id)) fail(`${id} is missing from the provider CHECK constraint`);
  }
  for (const id of allowed) {
    if (!spa.has(id)) fail(`the provider CHECK constraint allows ${id}, which no longer exists`);
  }
}

// Vendored brand marks
const iconFiles = existsSync(ICONS)
  ? readdirSync(ICONS).filter((f) => f.endsWith(".svg"))
  : [];
for (const [id, meta] of spa) {
  if (!meta.icon) continue; // deliberate lettermark fallback
  if (!iconFiles.includes(`${id}.svg`)) {
    fail(`${id} has icon "${meta.icon}" but public/integrations/${id}.svg is missing — run npm run gen:icons`);
  }
}
for (const file of iconFiles) {
  const id = file.replace(/\.svg$/, "");
  if (!spa.has(id)) fail(`public/integrations/${file} has no catalog entry`);
}

// Read-only scopes. Loop never asks for a write, send, or delete scope (§9.2).
const WRITE_WORDS =
  /(?:^|[.:_\b])(write|send|delete|remove|modify|update|manage|compose|admin_write|full_access)(?:$|[.:_\b])/i;
for (const [id, def] of registry) {
  const scopeBlock = /scopes:\s*\[([\s\S]*?)\]/.exec(def.body);
  const scopes = scopeBlock
    ? [...scopeBlock[1].matchAll(/"([^"]+)"/g)].map((m) => m[1])
    : [];
  for (const scope of scopes) {
    if (WRITE_WORDS.test(scope)) {
      fail(`${id} requests a non-read scope "${scope}" — read-only is not negotiable`);
    }
  }
  for (const url of [...def.body.matchAll(/(?:authorizeUrl|tokenUrl|identityUrl|revokeUrl|probeUrl):\s*"([^"]+)"/g)]) {
    if (!url[1].startsWith("https://")) {
      fail(`${id} has a non-https endpoint: ${url[1]}`);
    }
  }
}

// The Supabase edge plane runs off a projection of the registry. If it is stale,
// production and the Fastify stack disagree about a provider's endpoints.
const { buildEdgeProviders, currentEdgeProviders } = await import(
  pathToFileURL(join(ROOT, "scripts", "gen", "edge-providers.mjs")).href
);
const edgeOnDisk = currentEdgeProviders();
const edgeExpected = (await buildEdgeProviders()).replace(/\r\n/g, "\n");
if (edgeOnDisk === null) {
  fail("supabase/functions/_shared/providers.generated.ts is missing — run node scripts/gen/edge-providers.mjs");
} else if (edgeOnDisk !== edgeExpected) {
  fail(
    "supabase/functions/_shared/providers.generated.ts is stale — run node scripts/gen/edge-providers.mjs",
  );
}

if (failures.length > 0) {
  console.error("check-connectors: FAIL\n");
  console.error([...new Set(failures)].map((f) => `  · ${f}`).join("\n"));
  process.exit(1);
}

console.log(
  `check-connectors: OK — ${spa.size} connectors aligned across SPA, API, migration and ${iconFiles.length} brand marks`,
);

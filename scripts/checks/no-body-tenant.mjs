#!/usr/bin/env node
/**
 * A0 CI grep — fail if tenant is taken from request body outside tests/fixtures/archive.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_ROOTS = ["apps", "packages", "src", "scripts"].map((d) => join(ROOT, d));
const PATTERN = /\bbody\.(tenantId|orgId|tenant_id)\b/;
const SKIP_DIR = new Set([
  "node_modules",
  "dist",
  "archive",
  ".git",
  "coverage",
]);

/** @type {string[]} */
const hits = [];

/**
 * @param {string} dir
 */
function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (SKIP_DIR.has(name)) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(full);
      continue;
    }
    if (!/\.(ts|tsx|js|mjs|cjs)$/.test(name)) continue;
    if (/\.(test|spec)\.(ts|tsx|js)$/.test(name)) continue;
    if (name === "check-no-body-tenant.mjs") continue;
    const text = readFileSync(full, "utf8");
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
      if (PATTERN.test(line) && !line.trim().startsWith("//")) {
        hits.push(`${relative(ROOT, full)}:${i + 1}:${line.trim()}`);
      }
    });
  }
}

for (const root of SCAN_ROOTS) {
  walk(root);
}

if (hits.length > 0) {
  console.error(
    "check-no-body-tenant: FAIL — tenant must not come from request body:\n",
  );
  console.error(hits.join("\n"));
  process.exit(1);
}

console.log("check-no-body-tenant: OK");

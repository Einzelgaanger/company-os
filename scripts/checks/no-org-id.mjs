#!/usr/bin/env node
/**
 * A1 — fail if live org_id usage remains outside archive / supabase-compat paths.
 * Allows comments and historical type fields in SPA mock until B cutover of org→tenant naming.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN = ["apps", "packages"].map((d) => join(ROOT, d));
const SKIP_DIR = new Set([
  "node_modules",
  "dist",
  "archive",
  ".git",
  "coverage",
]);

/** Live SQL / API planes must not introduce org_id — SPA mock still uses org_id until renamed. */
const hits = [];

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
    if (!/\.(ts|sql)$/.test(name)) continue;
    if (/\.(test|spec)\./.test(name)) continue;
    if (name === "no-org-id.mjs") continue;
    const text = readFileSync(full, "utf8");
    // Flag SQL column org_id or body.orgId style in apps/packages (not comments-only lines)
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith("//") || t.startsWith("*") || t.startsWith("--")) return;
      if (/\borg_id\b/.test(line) && /\b(CREATE|ALTER|INSERT|UPDATE|SELECT|REFERENCES)\b/i.test(line)) {
        hits.push(`${relative(ROOT, full)}:${i + 1}:${t}`);
      }
    });
  }
}

for (const root of SCAN) walk(root);

if (hits.length > 0) {
  console.error("check-no-org-id: FAIL — org_id in live SQL/apps plane:\n");
  console.error(hits.join("\n"));
  process.exit(1);
}

console.log("check-no-org-id: OK");

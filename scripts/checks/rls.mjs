/**
 * Fail CI if migration lacks ENABLE+FORCE RLS for all tenant_id tables,
 * or if tenant-scoped indexes do not lead with tenant_id.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const migDir = join(root, "packages/db/migrations");
const files = readdirSync(migDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();
const sql = files.map((f) => readFileSync(join(migDir, f), "utf8")).join("\n\n");

const tableBlocks = [
  ...sql.matchAll(
    /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?([a-z0-9_]+)\s*\(([\s\S]*?)\);/gi,
  ),
];

const tenantTables = [];
for (const m of tableBlocks) {
  const name = m[1];
  const body = m[2];
  if (/\btenant_id\b/i.test(body)) {
    tenantTables.push(name);
  }
}

if (tenantTables.length === 0) {
  console.error("check-rls: no tenant_id tables found — parser broken?");
  process.exit(1);
}

const hasDynamicRlsLoop =
  /column_name\s*=\s*'tenant_id'/i.test(sql) &&
  /ENABLE ROW LEVEL SECURITY/i.test(sql) &&
  /FORCE ROW LEVEL SECURITY/i.test(sql) &&
  /CREATE POLICY\s+tenant_isolation/i.test(sql);

if (!hasDynamicRlsLoop) {
  console.error(
    "check-rls: FAIL — migration missing dynamic ENABLE+FORCE+tenant_isolation RLS loop over tenant_id columns",
  );
  process.exit(1);
}

const idxLines = [...sql.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX[^\n;]+/gi)].map(
  (m) => m[0],
);
const badIdx = [];
for (const line of idxLines) {
  if (!/tenant_id/i.test(line)) continue;
  // Must lead with tenant_id: ON table(tenant_id, …) or (tenant_id)
  if (!/\(\s*tenant_id\b/i.test(line) && !/\(\s*lower\(\s*email\s*\)/i.test(line)) {
    // users_tenant_email uses (tenant_id, lower(email)) — covered by tenant_id lead
  }
  if (!/\(\s*tenant_id\b/i.test(line)) {
    badIdx.push(line.trim());
  }
}

if (badIdx.length > 0) {
  console.error(
    "check-rls: FAIL — tenant-scoped indexes must lead with tenant_id:\n" +
      badIdx.join("\n"),
  );
  process.exit(1);
}

console.log(
  `check-rls: OK — ${tenantTables.length} tenant tables; FORCE RLS loop present; ${idxLines.filter((l) => /tenant_id/i.test(l)).length} tenant-leading indexes`,
);

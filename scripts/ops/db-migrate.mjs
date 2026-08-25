#!/usr/bin/env node
/**
 * Apply packages/db/migrations/*.sql as loop_owner, then grant loop_app.
 * Usage: pnpm db:migrate
 * Env: DATABASE_OWNER_URL (default postgres://loop_owner:loop@127.0.0.1:5433/loop)
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(join(root, "packages/db/package.json"));
const postgresPath = require.resolve("postgres");
const postgres = (await import(pathToFileURL(postgresPath).href)).default;

const dir = join(root, "packages/db/migrations");
const url =
  process.env.DATABASE_OWNER_URL ??
  "postgres://loop_owner:loop@127.0.0.1:5433/loop";

const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const sql = postgres(url, { max: 1 });

try {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  for (const file of files) {
    const [done] = await sql`SELECT 1 FROM schema_migrations WHERE id = ${file}`;
    if (done) {
      console.log(`skip ${file}`);
      continue;
    }
    const body = readFileSync(join(dir, file), "utf8");
    console.log(`apply ${file}…`);
    await sql.unsafe(body);
    await sql`INSERT INTO schema_migrations (id) VALUES (${file})`;
    console.log(`ok   ${file}`);
  }

  await sql.unsafe(`
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO loop_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO loop_app;
  `);
  console.log("grants: loop_app OK");
} finally {
  await sql.end({ timeout: 5 });
}

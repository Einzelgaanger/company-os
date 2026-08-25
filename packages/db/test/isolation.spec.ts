/**
 * Tenant isolation — real Postgres suite (A1 / 06_ENFORCEMENT §6.3).
 * Requires DATABASE_URL as loop_app (no BYPASSRLS).
 * Seed uses DATABASE_OWNER_URL (table owner) then verifies as app role.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { randomUUID } from "node:crypto";

const appUrl =
  process.env.DATABASE_URL ?? "postgres://loop_app:loop@127.0.0.1:5432/loop";
const ownerUrl =
  process.env.DATABASE_OWNER_URL ??
  "postgres://loop_owner:loop@127.0.0.1:5432/loop";

const hasDb = process.env.LOOP_ISOLATION === "1" || process.env.CI === "true";
const describeIsolation = hasDb ? describe : describe.skip;

const offlineSql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../migrations/0001_init.sql"),
  "utf8",
);

describe("RLS footguns (documentation)", () => {
  it("footgun 1: app must use non-owner loop_app role", () => {
    expect(offlineSql).toMatch(/loop_app/);
    expect(offlineSql).toMatch(/BYPASSRLS/i);
  });

  it("footgun 2: set_config with true (transaction-local)", () => {
    expect(offlineSql).toMatch(/current_setting\('app\.current_tenant_id'/);
  });

  it("footgun 3: indexes lead with tenant_id", () => {
    const idx = [...offlineSql.matchAll(/CREATE INDEX[^\n]+/gi)].map((m) => m[0]);
    const tenantIdx = idx.filter((l) => /tenant_id/i.test(l));
    expect(tenantIdx.length).toBeGreaterThan(5);
    for (const line of tenantIdx) {
      expect(line).toMatch(/\(tenant_id\b/);
    }
  });

  it("footgun 4: unset tenant fails closed via current_setting(..., true)", () => {
    expect(offlineSql).toMatch(/current_setting\('app\.current_tenant_id',\s*true\)/);
  });
});

describe("migration RLS loop (offline)", () => {
  it("ENABLE + FORCE + tenant_isolation policy via information_schema loop", () => {
    expect(offlineSql).toMatch(/column_name\s*=\s*'tenant_id'/i);
    expect(offlineSql).toMatch(/ENABLE ROW LEVEL SECURITY/i);
    expect(offlineSql).toMatch(/FORCE ROW LEVEL SECURITY/i);
    expect(offlineSql).toMatch(/CREATE POLICY\s+tenant_isolation/i);
  });
});

describeIsolation("tenant isolation (live Postgres)", () => {
  const owner = postgres(ownerUrl, { max: 1 });
  const app = postgres(appUrl, { max: 1 });
  let tenantA = "";
  let tenantB = "";
  let tables: string[] = [];

  beforeAll(async () => {
    tenantA = randomUUID();
    tenantB = randomUUID();
    const userA = randomUUID();
    const userB = randomUUID();

    await owner`
      INSERT INTO tenants (id, name, slug, status)
      VALUES
        (${tenantA}::uuid, 'Tenant A', 'tenant-a', 'active'),
        (${tenantB}::uuid, 'Tenant B', 'tenant-b', 'active')
      ON CONFLICT (id) DO NOTHING
    `;

    await owner`
      INSERT INTO users (id, tenant_id, email, full_name, role, status, password_hash)
      VALUES
        (${userA}::uuid, ${tenantA}::uuid, 'a@test.local', 'User A', 'owner', 'active', 'x'),
        (${userB}::uuid, ${tenantB}::uuid, 'b@test.local', 'User B', 'owner', 'active', 'x')
      ON CONFLICT DO NOTHING
    `;

    await owner`
      INSERT INTO commitments (
        id, tenant_id, title, source_type, status, review_required, priority, owner_user_id
      )
      VALUES
        (${randomUUID()}::uuid, ${tenantA}::uuid, 'A item', 'manual', 'open', false, 'medium', ${userA}::uuid),
        (${randomUUID()}::uuid, ${tenantB}::uuid, 'B item', 'manual', 'open', false, 'medium', ${userB}::uuid)
    `;

    const rows = await owner`
      SELECT c.table_name
      FROM information_schema.columns c
      WHERE c.column_name = 'tenant_id'
        AND c.table_schema = 'public'
      ORDER BY 1
    `;
    tables = rows.map((r) => String(r.table_name));
    expect(tables.length).toBeGreaterThan(5);
    expect(tables).toContain("commitments");
    expect(tables).toContain("users");
  }, 60_000);

  it("every tenant_id table has RLS enabled, forced, and tenant_isolation", async () => {
    for (const t of tables) {
      const [r] = await owner`
        SELECT c.relrowsecurity AS rls, c.relforcerowsecurity AS force
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = ${t}
      `;
      expect(r?.rls, t).toBe(true);
      expect(r?.force, t).toBe(true);
      const pols = await owner`
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = ${t} AND policyname = 'tenant_isolation'
      `;
      expect(pols.length, t).toBeGreaterThan(0);
    }
  });

  it("loop_app has no BYPASSRLS", async () => {
    const [r] = await app`
      SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user
    `;
    expect(r?.rolbypassrls).toBe(false);
  });

  it("SELECT as tenant A returns only A rows (non-vacuous)", async () => {
    const rows = await app.begin(async (tx) => {
      await tx`SELECT set_config('app.current_tenant_id', ${tenantA}, true)`;
      return tx`SELECT tenant_id::text AS tid FROM commitments`;
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.tid === tenantA)).toBe(true);
  });

  it("SELECT as tenant A never returns tenant B commitments", async () => {
    const rows = await app.begin(async (tx) => {
      await tx`SELECT set_config('app.current_tenant_id', ${tenantA}, true)`;
      return tx`SELECT * FROM commitments WHERE tenant_id = ${tenantB}::uuid`;
    });
    expect(rows).toHaveLength(0);
  });

  it("UPDATE as tenant A cannot touch tenant B rows", async () => {
    const before = await owner`
      SELECT title FROM commitments WHERE tenant_id = ${tenantB}::uuid
    `;
    expect(before.length).toBeGreaterThan(0);
    await app.begin(async (tx) => {
      await tx`SELECT set_config('app.current_tenant_id', ${tenantA}, true)`;
      await tx`UPDATE commitments SET title = 'hacked' WHERE tenant_id = ${tenantB}::uuid`;
    });
    const after = await owner`
      SELECT title FROM commitments WHERE tenant_id = ${tenantB}::uuid
    `;
    expect(after.map((r) => r.title)).toEqual(before.map((r) => r.title));
  });

  it("DELETE as tenant A cannot remove tenant B rows", async () => {
    const [{ n: before }] = await owner`
      SELECT count(*)::int AS n FROM commitments WHERE tenant_id = ${tenantB}::uuid
    `;
    await app.begin(async (tx) => {
      await tx`SELECT set_config('app.current_tenant_id', ${tenantA}, true)`;
      await tx`DELETE FROM commitments WHERE tenant_id = ${tenantB}::uuid`;
    });
    const [{ n: after }] = await owner`
      SELECT count(*)::int AS n FROM commitments WHERE tenant_id = ${tenantB}::uuid
    `;
    expect(after).toBe(before);
  });

  it("no tenant context returns zero commitment rows", async () => {
    const rows = await app`SELECT * FROM commitments`;
    expect(rows).toHaveLength(0);
  });
});

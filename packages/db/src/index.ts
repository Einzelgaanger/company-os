/**
 * @loop/db — Drizzle schema + tenant-scoped accessors.
 *
 * NO global `db` singleton is exported for app use.
 * Always call getTenantDb / withTenantContext.
 */
export {
  getTenantDb,
  withTenantContext,
  type TenantDb,
} from "./tenant.js";

export * as schema from "./schema/index.js";

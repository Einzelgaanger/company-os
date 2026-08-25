/**
 * Durable STOP / opt-out ledger.
 * Prefer Postgres `users.whatsapp_opt_out_at` when DATABASE_OWNER_URL is set;
 * file ledger remains as fallback / local cache.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const PATH =
  process.env.OPT_OUT_LEDGER_PATH ??
  join(process.cwd(), ".data", "whatsapp-opt-out.json");

type Ledger = Record<string, { at: string; reason: string }>;

function load(): Ledger {
  try {
    if (!existsSync(PATH)) return {};
    return JSON.parse(readFileSync(PATH, "utf8")) as Ledger;
  } catch {
    return {};
  }
}

function save(data: Ledger): void {
  mkdirSync(dirname(PATH), { recursive: true });
  writeFileSync(PATH, JSON.stringify(data, null, 2), "utf8");
}

function normalizePhone(fromE164: string): string {
  return fromE164.trim().replace(/^whatsapp:/i, "").toLowerCase();
}

async function persistToPostgres(fromE164: string): Promise<boolean> {
  const ownerUrl =
    process.env.DATABASE_OWNER_URL ?? process.env.DATABASE_URL;
  if (!ownerUrl) return false;

  try {
    const rootRequire = createRequire(
      new URL("../../../packages/db/package.json", import.meta.url),
    );
    const postgresPath = rootRequire.resolve("postgres");
    const postgres = (await import(pathToFileURL(postgresPath).href)).default as (
      u: string,
      o?: { max?: number },
    ) => {
      (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>;
      end: (o?: { timeout?: number }) => Promise<void>;
    };
    const sql = postgres(ownerUrl, { max: 1 });
    const phone = normalizePhone(fromE164);
    try {
      await sql`
        UPDATE users
        SET whatsapp_opt_out_at = now(), updated_at = now()
        WHERE deleted_at IS NULL
          AND (
            lower(phone_e164) = ${phone}
            OR lower(phone_e164) = ${"whatsapp:" + phone}
          )
      `;
      return true;
    } finally {
      await sql.end({ timeout: 2 });
    }
  } catch (err) {
    console.error("[optOutLedger] postgres write failed", err);
    return false;
  }
}

/** Sync file write + async Postgres when available. Callers should await. */
export async function recordOptOut(fromE164: string): Promise<void> {
  const key = normalizePhone(fromE164);
  if (!key) return;
  const data = load();
  data[key] = { at: new Date().toISOString(), reason: "stop" };
  save(data);
  await persistToPostgres(fromE164);
}

export function isOptedOut(fromE164: string): boolean {
  const key = normalizePhone(fromE164);
  return Boolean(load()[key]);
}

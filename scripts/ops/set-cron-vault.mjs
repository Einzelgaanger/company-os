import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "pkxnfkubgpbdbftvtgvf";
const raw = execSync(`npx supabase projects api-keys --project-ref ${PROJECT_REF} -o json`, {
  encoding: "utf8",
});
const parsed = JSON.parse(raw);
const keys = Array.isArray(parsed) ? parsed : parsed.keys || [];
const sr = keys.find((k) => k.name === "service_role" || k.id === "service_role")?.api_key;
if (!sr) {
  console.error("No service_role key found");
  process.exit(1);
}

const esc = sr.replace(/'/g, "''");
const sql = `
do $$ begin
  delete from vault.secrets where name = 'loop_service_role_key';
  perform vault.create_secret('${esc}', 'loop_service_role_key', 'Loop cron edge auth');
end $$;
select name from vault.decrypted_secrets where name = 'loop_service_role_key';
select jobname, schedule from cron.job where jobname like 'loop-%' order by jobname;
`;

const file = join(tmpdir(), "loop-vault.sql");
writeFileSync(file, sql);
try {
  const out = execSync(`npx supabase db query --linked -f "${file}"`, { encoding: "utf8" });
  console.log(out);
  console.log("Vault secret loop_service_role_key is set. Cron jobs listed above.");
} finally {
  try {
    unlinkSync(file);
  } catch {
    /* ignore */
  }
}

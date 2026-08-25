/**
 * Offline API smoke — login, review, surveys, connections.
 * Usage: node scripts/smoke/offline-api.mjs
 * Requires: API running on API_PORT (default 3001)
 */
const BASE = process.env.API_URL ?? "http://127.0.0.1:3001";

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`${opts.method ?? "GET"} ${path} → ${res.status} ${JSON.stringify(body)}`);
  }
  return body;
}

async function main() {
  const health = await req("/health");
  console.log("health", health.ok);

  const login = await req("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: "alfred@prodg.studio",
      password: "LoopDemo2026!",
    }),
  });
  const token = login.accessToken;
  const auth = { authorization: `Bearer ${token}` };

  const review = await req("/review", { headers: auth });
  console.log("review items", review.items.length);

  const surveys = await req("/surveys", { headers: auth });
  console.log("survey cycles", surveys.items.length);

  const conn = await req("/connections/health", { headers: auth });
  console.log("connection alerts", conn.alerts.length);

  const summary = await req("/flow/summary?scope=org", { headers: auth });
  console.log(
    "flow waiting now",
    `${summary.waitingNow.teamDays} team-days across ${summary.waitingNow.itemCount} items`,
  );

  const aging = await req("/flow/aging?scope=org", { headers: auth });
  console.log("aging open items", aging.items.length, "percentile sample", aging.sampleSize);

  const waiting = await req("/waiting?scope=org", { headers: auth });
  console.log("waiting holders", waiting.byHolder.length, "items", waiting.totals.itemCount);

  console.log("smoke-offline-api: OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

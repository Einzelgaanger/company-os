import { buildApp } from "./app.js";

const PORT = Number(process.env.API_PORT ?? 3001);
const HOST = process.env.API_HOST ?? "0.0.0.0";

async function main() {
  const app = await buildApp();
  await app.listen({ port: PORT, host: HOST });
  app.log.info(`@loop/api listening on ${HOST}:${PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

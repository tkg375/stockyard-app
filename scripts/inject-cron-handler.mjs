/**
 * Appends a `scheduled` export to the generated OpenNext worker so that
 * Cloudflare cron triggers can call the appointment-reminder endpoint.
 *
 * Run after `opennextjs-cloudflare build`, before `wrangler deploy`.
 */

import { readFileSync, writeFileSync } from "fs";

const WORKER_PATH = ".open-next/worker.js";

const SCHEDULED_HANDLER = `
export async function scheduled(event, env, ctx) {
  ctx.waitUntil(
    env.WORKER_SELF_REFERENCE.fetch(
      new Request("https://stockyardanimalhealth.com/api/cron/appointment-reminder", {
        headers: { "x-cron-secret": env.CRON_SECRET ?? "" },
      })
    ).catch((err) => console.error("[cron] failed:", err))
  );
}
`;

const worker = readFileSync(WORKER_PATH, "utf8");

if (worker.includes("export async function scheduled")) {
  console.log("[inject-cron] scheduled handler already present, skipping.");
} else {
  writeFileSync(WORKER_PATH, worker + SCHEDULED_HANDLER, "utf8");
  console.log("[inject-cron] scheduled handler injected into", WORKER_PATH);
}

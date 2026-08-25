import { Worker, type Job, type ConnectionOptions } from "bullmq";
import { Redis } from "ioredis";
import { claimIdempotencyKey } from "./idempotency.js";
import {
  OUTBOUND_WHATSAPP_LIMITER,
  QUEUE_ATTEMPTS,
  QUEUE_CONCURRENCY,
  QUEUE_NAMES,
  type QueueName,
} from "./queues.js";
import { processCalendarEvents } from "./handlers/calendarSync.js";
import { processOutboundWhatsApp } from "./handlers/outboundWhatsapp.js";
import { evaluateConnectionHealthBatch } from "./handlers/connectionHealth.js";
import { processExtract, type ExtractJobInput } from "./handlers/extract.js";
import { classifyReply } from "./handlers/classify.js";
import { processEscalation } from "./handlers/escalate.js";
import { processSurveyAggregate } from "./handlers/survey.js";
import { processRetentionPurge } from "./handlers/retention.js";
import { processWeeklyReport } from "./handlers/report.js";
import { moveToDlq } from "./dlq.js";
import type { CalendarEventNorm, SurveyResponseRow } from "@loop/shared";
import type { EligibilityContext } from "@loop/messaging";

type JobData = {
  tenantId: string;
  idempotency_key: string;
  [key: string]: unknown;
};

let sharedRedis: Redis;

async function processJob(queue: QueueName, job: Job<JobData>): Promise<void> {
  const key = job.data.idempotency_key ?? `${queue}:${job.id}`;
  const claimed = await claimIdempotencyKey(sharedRedis, String(key));
  if (!claimed) {
    console.log(`[${queue}] skip duplicate idempotency_key=${key}`);
    return;
  }

  if (queue === "ingest" && job.data.kind === "calendar_sync") {
    const events = (job.data.events ?? []) as CalendarEventNorm[];
    const patterns = (job.data.extraTitlePatterns ?? []) as string[];
    const result = processCalendarEvents(events, patterns);
    console.log(
      `[${queue}] calendar_sync tenant=${job.data.tenantId} fetched=${result.fetched} stored=${result.stored} excluded=${result.excluded} trace=${job.data.trace_id ?? "-"}`,
    );
    return;
  }

  if (queue === "ingest" && job.data.kind === "opt_out_stop") {
    console.log(
      `[${queue}] STOP opt-out from=${job.data.from} tenant=${job.data.tenantId}`,
    );
    return;
  }

  if (queue === "extract") {
    const result = await processExtract(job.data as unknown as ExtractJobInput);
    console.log(
      `[${queue}] accepted=${result.accepted.length} rejected=${result.rejected.length} injection=${result.injection ?? false}`,
    );
    return;
  }

  if (queue === "classify") {
    const text = String(job.data.text ?? "");
    const result = classifyReply(text);
    console.log(`[${queue}] status=${result.status} conf=${result.confidence}`);
    return;
  }

  if (queue === "outbound-whatsapp") {
    if (job.name === "checkin-schedule-tick" || job.data.kind === "scheduler") {
      console.log(
        `[${queue}] checkin-schedule-tick — evaluate eligibility fixtures (manual approve default on)`,
      );
      return;
    }
    const eligibility = job.data.eligibility as EligibilityContext | undefined;
    if (!eligibility) {
      console.log(`[${queue}] missing eligibility — reschedule`);
      return;
    }
    const result = await processOutboundWhatsApp({
      templateKey: String(job.data.templateKey ?? "checkin_general"),
      eligibility,
      toE164: typeof job.data.toE164 === "string" ? job.data.toE164 : undefined,
      body: typeof job.data.body === "string" ? job.data.body : undefined,
      messagingMode:
        typeof job.data.messagingMode === "string" ? job.data.messagingMode : undefined,
    });
    console.log(`[${queue}] ${result.status}`, result);
    return;
  }

  if (queue === "escalate") {
    if (job.name === "escalation-eval-tick" || job.data.kind === "scheduler") {
      const result = processEscalation({
        tags: ["sharepoint"],
        rules: [{ tag: "sharepoint", assigneeUserId: "user-it-lead" }],
        fallbackUserId: "user-fallback",
        context: {
          commitmentTitle: "SharePoint migration",
          ownerName: "Kayode",
          dueDate: "2026-08-20",
          lastStatus: "at_risk",
          blockerNote: "Waiting on license",
          projectName: "IT Ops",
        },
      });
      console.log(`[${queue}] tick assignee=${result.assigneeUserId}`);
      return;
    }
    const result = processEscalation({
      tags: (job.data.tags as string[]) ?? [],
      rules: (job.data.rules as { tag: string; assigneeUserId: string }[]) ?? [],
      fallbackUserId: String(job.data.fallbackUserId ?? ""),
      context: job.data.context as Parameters<typeof processEscalation>[0]["context"],
    });
    console.log(`[${queue}] assignee=${result.assigneeUserId} tag=${result.matchedTag}`);
    return;
  }

  if (queue === "survey") {
    if (job.name === "survey-cycle-tick" || job.data.kind === "scheduler") {
      const result = processSurveyAggregate([
        { themeTags: ["workload"] },
        { themeTags: ["clarity"] },
        { themeTags: ["workload"] },
        { themeTags: ["clarity"] },
      ]);
      console.log(`[${queue}] tick suppressed=${!result.ok} n=${result.n}`);
      return;
    }
    const result = processSurveyAggregate(
      (job.data.responses as SurveyResponseRow[]) ?? [],
    );
    console.log(`[${queue}] ok=${result.ok} n=${result.n}`);
    return;
  }

  if (queue === "report") {
    if (job.name === "weekly-report-tick" || job.data.kind === "scheduler") {
      const result = processWeeklyReport({
        tenantId: String(job.data.tenantId ?? "demo"),
        teamScopeUserIds: ["u1"],
        projectSummaries: [
          { name: "Pilot", progressPct: 42, health: "at_risk" },
        ],
      });
      console.log(`[${queue}] tick footer=${result.footer.slice(0, 40)}…`);
      return;
    }
    const result = processWeeklyReport({
      tenantId: String(job.data.tenantId),
      teamScopeUserIds: (job.data.teamScopeUserIds as string[]) ?? [],
      projectSummaries:
        (job.data.projectSummaries as Array<{
          name: string;
          progressPct: number;
          health: string;
        }>) ?? [],
    });
    console.log(`[${queue}] sections=${result.sections.length}`);
    return;
  }

  if (
    queue === "housekeeping" &&
    (job.data.kind === "connection_health" || job.name === "connection-health")
  ) {
    const seeded =
      (job.data.connections as Parameters<
        typeof evaluateConnectionHealthBatch
      >[0]) ??
      [
        {
          connectionId: "c-gcal",
          provider: "google_calendar",
          status: "expired" as const,
          lastSyncedAt: new Date(Date.now() - 8 * 3600_000).toISOString(),
        },
      ];
    const batch = evaluateConnectionHealthBatch(seeded);
    console.log(
      `[${queue}] connection_health alerts=${batch.alerts.length}/${batch.all.length}`,
    );
    return;
  }

  if (
    queue === "housekeeping" &&
    (job.name === "template-status-sync" || job.data.kind === "template_status")
  ) {
    console.log(
      `[${queue}] template-status-sync — Meta approval poll stub (no network)`,
    );
    return;
  }

  if (
    queue === "housekeeping" &&
    (job.name === "retention-purge" || job.data.kind === "retention_purge")
  ) {
    const result = processRetentionPurge({
      messagesMonths: Number(job.data.messagesMonths ?? 12),
      transcriptsMonths: Number(job.data.transcriptsMonths ?? 12),
    });
    console.log(`[${queue}] retention`, result.cutoffs);
    return;
  }

  console.log(
    `[${queue}] process job=${job.id} tenant=${job.data.tenantId} name=${job.name}`,
  );
}

function createConnection(): Redis {
  return new Redis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", {
    maxRetriesPerRequest: null,
  });
}

export function startWorkers(): Worker[] {
  sharedRedis = createConnection();
  const connection = createConnection() as unknown as ConnectionOptions;
  const workers: Worker[] = [];

  for (const name of QUEUE_NAMES) {
    const worker = new Worker<JobData>(
      name,
      async (job) => processJob(name, job),
      {
        connection,
        concurrency: QUEUE_CONCURRENCY[name],
        ...(name === "outbound-whatsapp"
          ? { limiter: { ...OUTBOUND_WHATSAPP_LIMITER } }
          : {}),
      },
    );

    worker.on("failed", (job, err) => {
      console.error(`[${name}] failed job=${job?.id}`, err.message);
      if (!job) return;
      const maxAttempts = QUEUE_ATTEMPTS[name] ?? 3;
      if (job.attemptsMade >= maxAttempts) {
        void moveToDlq(name, job, connection, err).catch((e) =>
          console.error(`[${name}] dlq move failed`, e),
        );
      }
    });

    workers.push(worker);
    console.log(
      `[workers] registered ${name} concurrency=${QUEUE_CONCURRENCY[name]}`,
    );
  }

  return workers;
}

async function main() {
  const workers = startWorkers();
  console.log(`@loop/workers started (${workers.length} queues)`);

  const shutdown = async () => {
    await Promise.all(workers.map((w) => w.close()));
    await sharedRedis.quit();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

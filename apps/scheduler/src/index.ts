import { Redis } from "ioredis";
import { Queue } from "bullmq";

/**
 * BullMQ repeatable jobs — only the Redis leader registers cadences.
 */
const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
const LOCK_KEY = "loop:scheduler:leader";
const LOCK_TTL_SEC = 30;

function connection() {
  return new Redis(REDIS_URL, { maxRetriesPerRequest: null });
}

const REPEATABLE = [
  {
    queue: "housekeeping",
    name: "connection-health",
    pattern: "*/30 * * * *",
  },
  {
    queue: "housekeeping",
    name: "retention-purge",
    pattern: "0 3 * * *",
  },
  {
    queue: "housekeeping",
    name: "template-status-sync",
    pattern: "0 2 * * *",
  },
  {
    queue: "report",
    name: "weekly-report-tick",
    pattern: "0 * * * *",
  },
  {
    queue: "survey",
    name: "survey-cycle-tick",
    pattern: "0 * * * *",
  },
  {
    queue: "escalate",
    name: "escalation-eval-tick",
    pattern: "*/15 * * * *",
  },
  {
    queue: "outbound-whatsapp",
    name: "checkin-schedule-tick",
    pattern: "*/5 * * * *",
  },
] as const;

async function acquireLeader(redis: Redis): Promise<boolean> {
  const token = `${process.pid}-${Date.now()}`;
  const ok = await redis.set(LOCK_KEY, token, "EX", LOCK_TTL_SEC, "NX");
  if (ok !== "OK") return false;
  const renew = setInterval(() => {
    void redis.expire(LOCK_KEY, LOCK_TTL_SEC);
  }, (LOCK_TTL_SEC / 2) * 1000);
  (renew as NodeJS.Timeout & { unref?: () => void }).unref?.();
  return true;
}

async function main() {
  const redis = connection();
  const isLeader = await acquireLeader(redis);
  if (!isLeader) {
    console.log("@loop/scheduler: not leader — standby (will not register jobs)");
    setInterval(() => {
      void acquireLeader(redis).then((won) => {
        if (won) console.log("@loop/scheduler: acquired leadership — restart process to register");
      });
    }, LOCK_TTL_SEC * 1000).unref?.();
    return;
  }

  const queues = new Map<string, Queue>();

  for (const job of REPEATABLE) {
    let q = queues.get(job.queue);
    if (!q) {
      q = new Queue(job.queue, { connection: connection() });
      queues.set(job.queue, q);
    }

    await q.add(
      job.name,
      {
        kind: "scheduler",
        idempotency_key: `sched:${job.queue}:${job.name}`,
      },
      {
        repeat: { pattern: job.pattern },
        removeOnComplete: 100,
        jobId: `repeat:${job.queue}:${job.name}`,
      },
    );

    console.log(
      `[scheduler] repeatable ${job.queue}/${job.name} cron=${job.pattern}`,
    );
  }

  console.log(
    `@loop/scheduler leader registered ${REPEATABLE.length} repeatable jobs`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

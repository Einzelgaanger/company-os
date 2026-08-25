import { Queue, type Job } from "bullmq";
import type { ConnectionOptions } from "bullmq";

/** Move exhausted jobs to `${queue}-dlq` for ops replay. */
export async function moveToDlq(
  queueName: string,
  job: Job,
  connection: ConnectionOptions,
  err: Error,
): Promise<void> {
  const dlq = new Queue(`${queueName}-dlq`, { connection });
  try {
    await dlq.add(
      "dead",
      {
        originalQueue: queueName,
        originalJobId: job.id,
        name: job.name,
        data: job.data,
        failedReason: err.message,
        failedAt: new Date().toISOString(),
        attemptsMade: job.attemptsMade,
      },
      { removeOnComplete: 5000 },
    );
  } finally {
    await dlq.close();
  }
}

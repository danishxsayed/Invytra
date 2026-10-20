import type { Prisma, PrismaClient } from "@invytra/db";
import { Queue, type ConnectionOptions } from "bullmq";
import { validateSpec, type ActionSpec } from "../actions/registry.js";

export const QUEUE_NAME = "invytra-linkedin-actions";

export interface ActionJob {
  actionId: string;
}

export function createQueue(connection: ConnectionOptions): Queue<ActionJob> {
  return new Queue<ActionJob>(QUEUE_NAME, {
    connection,
    defaultJobOptions: { removeOnComplete: 2000, removeOnFail: 2000 },
  });
}

/** BullMQ job ids are derived from the action and its run time, so re-adding the same schedule is a no-op. */
const jobIdFor = (actionId: string, runAt: Date) => `${actionId}-${runAt.getTime()}`;

/** Add (or re-add) the job that will run this action at `runAt`. */
export async function scheduleAction(queue: Queue<ActionJob>, actionId: string, runAt: Date): Promise<void> {
  await queue.add("action", { actionId }, { jobId: jobIdFor(actionId, runAt), delay: Math.max(0, runAt.getTime() - Date.now()) });
}

/**
 * Every LinkedIn action is a queued job (CLAUDE.md rule 1): this creates the
 * QUEUED row in `actions` and the delayed job that will run it.
 */
export async function enqueueAction(
  prisma: PrismaClient,
  queue: Queue<ActionJob>,
  spec: ActionSpec & { accountId: string; runAt?: Date },
): Promise<string> {
  validateSpec(spec);
  const runAt = spec.runAt ?? new Date();
  const action = await prisma.action.create({
    data: {
      accountId: spec.accountId,
      type: spec.type,
      targetUrl: spec.targetUrl ?? null,
      payload: (spec.payload ?? {}) as Prisma.InputJsonValue,
      status: "QUEUED",
      scheduledAt: runAt,
    },
  });
  await scheduleAction(queue, action.id, runAt);
  return action.id;
}

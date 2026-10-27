import type { PrismaClient } from "@invytra/db";
import type { WorkingHours } from "@invytra/shared";

const ALWAYS: WorkingHours = { days: [1, 2, 3, 4, 5, 6, 7], startHour: 0, endHour: 24 };

/**
 * Which hours an action may run in. Days and hours come from the sender account's
 * working hours (Accounts → Settings), for campaign steps too. A reply the user typed,
 * and an inbox check asked for by the open dashboard inbox, run at any hour (still one
 * action at a time, with a short gap) — like you opening LinkedIn yourself.
 */
export async function hoursForAction(
  _prisma: PrismaClient,
  action: { type: string; accountId: string; campaignLeadId: string | null; payload?: unknown },
  accountHours: WorkingHours,
): Promise<WorkingHours> {
  if (action.type === "REPLY" || isOnDemandInboxCheck(action)) return ALWAYS;
  return accountHours;
}

/** An inbox check the dashboard asked for (someone has the inbox open). */
export function isOnDemandInboxCheck(action: { type: string; payload?: unknown }): boolean {
  return action.type === "INBOX_SYNC" && (action.payload as { onDemand?: unknown } | null)?.onDemand === true;
}

/** "Fetch all prospects at once": a search page queued for a campaign that wants its whole list now. */
export function isFetchAllPage(action: { type: string; payload?: unknown }): boolean {
  return action.type === "SEARCH_PAGE" && (action.payload as { fetchAll?: unknown } | null)?.fetchAll === true;
}

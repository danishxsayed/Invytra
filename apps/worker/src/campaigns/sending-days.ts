import type { PrismaClient } from "@invytra/db";
import { campaignSettingsSchema, type WorkingHours } from "@invytra/shared";

/**
 * Which hours an action may run in. Hours always come from the sender account;
 * the DAYS of a campaign step come from its campaign (so a campaign can send on
 * weekends, or only on some days). An inbox check may also run on any day one of
 * the account's running campaigns sends on — a weekend follow-up needs a fresh
 * inbox read first.
 */
export async function hoursForAction(
  prisma: PrismaClient,
  action: { type: string; accountId: string; campaignLeadId: string | null },
  accountHours: WorkingHours,
): Promise<WorkingHours> {
  if (action.campaignLeadId) {
    const lead = await prisma.campaignLead.findUnique({
      where: { id: action.campaignLeadId },
      select: { campaign: { select: { settings: true } } },
    });
    if (!lead) return accountHours;
    return { ...accountHours, days: daysOf(lead.campaign.settings) };
  }
  if (action.type === "INBOX_SYNC") {
    const running = await prisma.campaign.findMany({
      where: { status: "ACTIVE", senders: { some: { accountId: action.accountId } } },
      select: { settings: true },
    });
    const days = new Set(accountHours.days);
    for (const c of running) daysOf(c.settings).forEach((d) => days.add(d));
    return { ...accountHours, days: [...days].sort((a, b) => a - b) };
  }
  return accountHours;
}

function daysOf(settings: unknown): number[] {
  return campaignSettingsSchema.safeParse(settings ?? {}).data?.days ?? [1, 2, 3, 4, 5];
}

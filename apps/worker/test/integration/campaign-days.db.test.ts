/**
 * Campaign sending days and start dates (only with TEST_DATABASE_URL — it is wiped).
 */
import { PrismaClient } from "@invytra/db";
import { DEFAULT_WORKING_HOURS } from "@invytra/shared";
import type { Queue } from "bullmq";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { campaignTick } from "../../src/campaigns/engine.js";
import { hoursForAction } from "../../src/campaigns/sending-days.js";
import type { ActionJob } from "../../src/queue/queue.js";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("campaign days", () => {
  let prisma: PrismaClient;
  const WS = "ws-days";
  const queue = { add: async () => undefined } as unknown as Queue<ActionJob>;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.workspace.create({ data: { id: WS, name: "Days" } });
    await prisma.linkedinAccount.create({
      data: { id: "acc-d", workspaceId: WS, label: "d", proxyUrl: "", workingHours: DEFAULT_WORKING_HOURS, limits: {}, status: "ACTIVE" },
    });
    await prisma.leadList.create({ data: { id: "list-d", workspaceId: WS, name: "L" } });
    await prisma.lead.create({ data: { workspaceId: WS, listId: "list-d", profileUrl: "https://www.linkedin.com/in/wanda/", firstName: "Wanda" } });
    await prisma.campaign.create({
      data: {
        id: "camp-weekend",
        workspaceId: WS,
        name: "Weekend",
        listId: "list-d",
        status: "ACTIVE",
        steps: [{ type: "VISIT", delayDays: 0 }],
        settings: { days: [1, 2, 3, 4, 5, 6, 7], startAt: "2026-10-26T00:00:00.000Z" },
        senders: { create: { accountId: "acc-d" } },
      },
    });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.$disconnect();
  });

  it("waits for the start date before adding leads or sending", async () => {
    await campaignTick({ prisma, queue, now: () => new Date("2026-10-25T10:00:00Z") });
    expect(await prisma.campaignLead.count({ where: { campaignId: "camp-weekend" } })).toBe(0);
    await campaignTick({ prisma, queue, now: () => new Date("2026-10-26T04:00:00Z") });
    expect(await prisma.campaignLead.count({ where: { campaignId: "camp-weekend" } })).toBe(1);
  });

  it("uses the campaign's days for its steps, with the account's hours", async () => {
    const action = await prisma.action.findFirstOrThrow({ where: { accountId: "acc-d", campaignLeadId: { not: null } } });
    expect(await hoursForAction(prisma, action, DEFAULT_WORKING_HOURS)).toEqual({ days: [1, 2, 3, 4, 5, 6, 7], startHour: 9, endHour: 18 });
  });

  it("lets inbox checks run on the days a running campaign sends, but other actions keep the account's days", async () => {
    expect((await hoursForAction(prisma, { type: "INBOX_SYNC", accountId: "acc-d", campaignLeadId: null }, DEFAULT_WORKING_HOURS)).days).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect((await hoursForAction(prisma, { type: "PROFILE_VISIT", accountId: "acc-d", campaignLeadId: null }, DEFAULT_WORKING_HOURS)).days).toEqual([1, 2, 3, 4, 5]);
    await prisma.campaign.update({ where: { id: "camp-weekend" }, data: { status: "PAUSED" } });
    expect((await hoursForAction(prisma, { type: "INBOX_SYNC", accountId: "acc-d", campaignLeadId: null }, DEFAULT_WORKING_HOURS)).days).toEqual([1, 2, 3, 4, 5]);
  });
});

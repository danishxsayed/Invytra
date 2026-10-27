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

  it("campaign steps and inbox checks follow the account's days and hours; replies run any time", async () => {
    const action = await prisma.action.findFirstOrThrow({ where: { accountId: "acc-d", campaignLeadId: { not: null } } });
    expect(await hoursForAction(prisma, action, DEFAULT_WORKING_HOURS)).toEqual(DEFAULT_WORKING_HOURS);
    expect(await hoursForAction(prisma, { type: "INBOX_SYNC", accountId: "acc-d", campaignLeadId: null }, DEFAULT_WORKING_HOURS)).toEqual(DEFAULT_WORKING_HOURS);
    expect((await hoursForAction(prisma, { type: "REPLY", accountId: "acc-d", campaignLeadId: null }, DEFAULT_WORKING_HOURS)).endHour).toBe(24);
  });

  it("an account with a start date in the future sends nothing until then", async () => {
    await prisma.lead.create({ data: { workspaceId: WS, listId: "list-d", profileUrl: "https://www.linkedin.com/in/xena/", firstName: "Xena" } });
    await prisma.campaign.update({ where: { id: "camp-weekend" }, data: { status: "ACTIVE", leadsSyncedAt: null } });
    await prisma.linkedinAccount.update({ where: { id: "acc-d" }, data: { workingHours: { ...DEFAULT_WORKING_HOURS, startAt: "2026-11-02T00:00:00.000Z" } } });
    const xena = () => prisma.action.count({ where: { targetUrl: "https://www.linkedin.com/in/xena/" } });
    await campaignTick({ prisma, queue, now: () => new Date("2026-10-28T06:00:00Z") });
    expect(await xena()).toBe(0);
    await campaignTick({ prisma, queue, now: () => new Date("2026-11-02T06:00:00Z") });
    expect(await xena()).toBe(1);
  });
});

d("Sales Navigator leads", () => {
  let prisma: PrismaClient;
  const WS = "ws-sn";
  const queue = { add: async () => undefined } as unknown as Queue<ActionJob>;
  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.workspace.create({ data: { id: WS, name: "SN" } });
    await prisma.linkedinAccount.create({ data: { id: "acc-sn", workspaceId: WS, label: "sn", proxyUrl: "", workingHours: {}, limits: {}, status: "ACTIVE" } });
    await prisma.leadList.create({ data: { id: "list-sn", workspaceId: WS, name: "SN" } });
    await prisma.lead.create({ data: { workspaceId: WS, listId: "list-sn", profileUrl: "https://www.linkedin.com/in/ACwAAAalice0001XyZ/", firstName: "Alice" } });
    await prisma.campaign.create({
      data: {
        id: "camp-sn",
        workspaceId: WS,
        name: "SN",
        listId: "list-sn",
        status: "ACTIVE",
        steps: [{ type: "VISIT", delayDays: 0 }, { type: "LIKE_POST", delayDays: 0 }, { type: "INVITE", delayDays: 0, note: "" }],
        settings: { days: [1, 2, 3, 4, 5, 6, 7] },
        senders: { create: { accountId: "acc-sn" } },
      },
    });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.$disconnect();
  });

  it("swaps the member-id link for the real profile link after the first visit, then likes a post", async () => {
    await campaignTick({ prisma, queue });
    const visit = await prisma.action.findFirstOrThrow({ where: { accountId: "acc-sn", type: "PROFILE_VISIT" } });
    await prisma.action.update({
      where: { id: visit.id },
      data: { status: "SUCCEEDED", executedAt: new Date(), payload: { result: { url: "https://www.linkedin.com/in/alice-smith-42/", name: "Alice Smith" } } },
    });
    await campaignTick({ prisma, queue, now: () => new Date(Date.now() + 2 * 3600_000) });
    await campaignTick({ prisma, queue, now: () => new Date(Date.now() + 4 * 3600_000) });
    const lead = await prisma.campaignLead.findFirstOrThrow({ where: { campaignId: "camp-sn" } });
    expect(lead.profileUrl).toBe("https://www.linkedin.com/in/alice-smith-42/");
    expect(await prisma.lead.count({ where: { listId: "list-sn", profileUrl: "https://www.linkedin.com/in/alice-smith-42/" } })).toBe(1);
    expect(await prisma.action.findFirst({ where: { accountId: "acc-sn", type: "LIKE_POST", status: "QUEUED" } })).toMatchObject({
      targetUrl: "https://www.linkedin.com/in/alice-smith-42/",
    });
  });
});

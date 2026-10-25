/**
 * One campaign, several senders (only with TEST_DATABASE_URL — it is wiped).
 * We play the worker's part by finishing actions by hand.
 */
import { PrismaClient } from "@invytra/db";
import type { Queue } from "bullmq";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { campaignTick } from "../../src/campaigns/engine.js";
import type { ActionJob } from "../../src/queue/queue.js";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const DAY = 86400_000;

d("campaign with several senders", () => {
  let prisma: PrismaClient;
  const queue = { add: async () => undefined } as unknown as Queue<ActionJob>;
  let clock = new Date("2026-10-20T06:00:00Z");
  const tick = () => campaignTick({ prisma, queue, now: () => clock, random: () => 0 });
  const later = (days: number) => (clock = new Date(clock.getTime() + days * DAY + 60_000));
  const WS = "ws-senders";
  const U = (s: string) => `https://www.linkedin.com/in/${s}/`;
  const SLUGS = ["ann", "ben", "cat", "dan"];

  const leads = () => prisma.campaignLead.findMany({ where: { campaignId: "camp-s" }, orderBy: { profileUrl: "asc" } });
  const queued = () => prisma.action.findMany({ where: { status: "QUEUED", account: { workspaceId: WS } }, orderBy: { targetUrl: "asc" } });
  const finish = async (pick: (a: { accountId: string; targetUrl: string | null }) => boolean = () => true) => {
    for (const a of await queued()) {
      if (!pick(a)) continue;
      const name = a.targetUrl!.split("/in/")[1]!.replace("/", "") + " Test";
      await prisma.action.update({ where: { id: a.id }, data: { status: "SUCCEEDED", executedAt: clock, payload: { ...(a.payload as object), result: { name } } } });
    }
  };

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.workspace.create({ data: { id: WS, name: "Senders" } });
    await prisma.linkedinAccount.createMany({
      data: ["acc-s1", "acc-s2", "acc-s3"].map((id) => ({ id, workspaceId: WS, label: id, proxyUrl: "", workingHours: {}, limits: {}, status: "ACTIVE" as const })),
    });
    await prisma.leadList.create({ data: { id: "list-s", workspaceId: WS, name: "L" } });
    await prisma.lead.createMany({ data: SLUGS.map((s) => ({ workspaceId: WS, listId: "list-s", profileUrl: U(s), firstName: s })) });
    await prisma.campaign.create({
      data: {
        id: "camp-s",
        workspaceId: WS,
        name: "Shared",
        listId: "list-s",
        status: "ACTIVE",
        steps: [
          { type: "VISIT", delayDays: 0 },
          { type: "INVITE", delayDays: 1, note: "" },
        ],
        senders: { create: [{ accountId: "acc-s1" }, { accountId: "acc-s2" }] },
      },
    });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.$disconnect();
  });

  it("shares leads out evenly between the senders", async () => {
    expect((await tick()).queued).toBe(4);
    const byAccount = (await queued()).reduce<Record<string, number>>((m, a) => ((m[a.accountId] = (m[a.accountId] ?? 0) + 1), m), {});
    expect(byAccount).toEqual({ "acc-s1": 2, "acc-s2": 2 });
    for (const l of await leads()) {
      expect((await queued()).find((a) => a.campaignLeadId === l.id)!.accountId).toBe(l.accountId);
    }
  });

  it("keeps each lead with its sender for the next step", async () => {
    const before = new Map((await leads()).map((l) => [l.id, l.accountId]));
    await finish();
    await tick();
    later(1);
    expect((await tick()).queued).toBe(4);
    for (const a of await queued()) {
      expect(a.type).toBe("CONNECTION_REQUEST");
      expect(a.accountId).toBe(before.get(a.campaignLeadId!));
    }
  });

  it("when a sender is removed, moves its uncontacted leads to the others and stops the ones it already invited", async () => {
    const s2Leads = (await leads()).filter((l) => l.accountId === "acc-s2");
    const [invitedLead, waitingLead] = s2Leads;
    // acc-s2 managed one invite before it was taken off the campaign
    await finish((a) => a.targetUrl === invitedLead!.profileUrl);
    await tick();
    await prisma.campaignSender.delete({ where: { campaignId_accountId: { campaignId: "camp-s", accountId: "acc-s2" } } });
    // a third sender joins
    await prisma.campaignSender.create({ data: { campaignId: "camp-s", accountId: "acc-s3" } });

    const t = await tick();
    expect(t.cancelled).toBe(1); // acc-s2's other invite never runs
    const moved = await prisma.campaignLead.findUniqueOrThrow({ where: { id: waitingLead!.id } });
    expect(moved.accountId).toBe("acc-s3");
    const invite = (await queued()).find((a) => a.campaignLeadId === moved.id)!;
    expect(invite).toMatchObject({ type: "CONNECTION_REQUEST", accountId: "acc-s3" });

    later(1);
    await tick();
    expect(await prisma.campaignLead.findUniqueOrThrow({ where: { id: invitedLead!.id } })).toMatchObject({ state: "SKIPPED", reason: "SENDER_REMOVED" });
    expect((await queued()).every((a) => a.accountId !== "acc-s2")).toBe(true);
  });

  it("matches replies against the lead's own sender's inbox", async () => {
    const s1Lead = (await leads()).find((l) => l.accountId === "acc-s1")!;
    await finish();
    await tick();
    // The same name in another sender's inbox is not their reply
    await prisma.inboxMessage.create({
      data: { accountId: "acc-s3", linkedinMessageId: "x1", fromName: s1Lead.linkedinName!, text: "hi", sentAt: clock, fetchedAt: clock },
    });
    await tick();
    expect((await prisma.campaignLead.findUniqueOrThrow({ where: { id: s1Lead.id } })).state).not.toBe("REPLIED");
    await prisma.inboxMessage.create({
      data: { accountId: "acc-s1", linkedinMessageId: "x2", fromName: s1Lead.linkedinName!, text: "hi", sentAt: clock, fetchedAt: clock },
    });
    await tick();
    expect((await prisma.campaignLead.findUniqueOrThrow({ where: { id: s1Lead.id } })).state).toBe("REPLIED");
  });
});

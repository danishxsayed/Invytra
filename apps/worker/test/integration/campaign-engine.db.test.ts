/**
 * Campaign engine against a real database (only with TEST_DATABASE_URL — it is wiped).
 * LinkedIn isn't involved: we play the worker's part by finishing actions by hand.
 */
import { PrismaClient } from "@invytra/db";
import type { Queue } from "bullmq";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { campaignTick } from "../../src/campaigns/engine.js";
import type { ActionJob } from "../../src/queue/queue.js";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const DAY = 86400_000;

d("campaign engine", () => {
  let prisma: PrismaClient;
  const jobs: string[] = [];
  const queue = { add: async (_n: string, data: ActionJob) => void jobs.push(data.actionId) } as unknown as Queue<ActionJob>;
  let clock = new Date("2026-10-20T06:00:00Z");
  const tick = () => campaignTick({ prisma, queue, now: () => clock, random: () => 0 });
  const later = (days: number) => (clock = new Date(clock.getTime() + days * DAY + 60_000));
  const WS = "ws-campaign";
  const U = (s: string) => `https://www.linkedin.com/in/${s}/`;

  const lead = (slug: string) => prisma.campaignLead.findFirstOrThrow({ where: { profileUrl: U(slug) } });
  const queued = () => prisma.action.findMany({ where: { status: "QUEUED", account: { workspaceId: WS } }, orderBy: { targetUrl: "asc" } });
  /** Plays the worker: finish every queued action with the given outcome. */
  const finishAll = async (status: "SUCCEEDED" | "SKIPPED" | "FAILED", result: Record<string, unknown> = {}, error: string | null = null) => {
    for (const a of await queued()) {
      const slug = a.targetUrl!.split("/in/")[1]!.replace("/", "");
      const name = slug === "jane" ? "Jane Doe" : slug.charAt(0).toUpperCase() + slug.slice(1) + " Test";
      await prisma.action.update({
        where: { id: a.id },
        data: { status, error, executedAt: clock, payload: { ...(a.payload as object), result: { name, ...result } } },
      });
    }
  };

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.workspace.create({ data: { id: WS, name: "Campaign test" } });
    await prisma.linkedinAccount.create({
      data: { id: "acc-c", workspaceId: WS, label: "sender", proxyUrl: "", workingHours: {}, limits: {}, status: "ACTIVE" },
    });
    // Someone this workspace already invited by hand
    await prisma.action.create({ data: { accountId: "acc-c", type: "CONNECTION_REQUEST", status: "SUCCEEDED", targetUrl: U("old"), executedAt: clock } });
    const list = await prisma.leadList.create({ data: { id: "list-c", workspaceId: WS, name: "Prospects" } });
    await prisma.lead.createMany({
      data: [
        { workspaceId: WS, listId: list.id, profileUrl: U("jane"), firstName: "Jane", lastName: "Doe", company: "Acme" },
        { workspaceId: WS, listId: list.id, profileUrl: U("kim"), firstName: "Kim", company: "Beta" },
        { workspaceId: WS, listId: list.id, profileUrl: U("old"), firstName: "Old", company: "Gamma" },
        { workspaceId: WS, listId: list.id, profileUrl: U("nocompany"), firstName: "Nora" },
      ],
    });
    await prisma.campaign.create({
      data: {
        id: "camp-1",
        workspaceId: WS,
        name: "Q4",
        senders: { create: { accountId: "acc-c" } },
        listId: list.id,
        status: "ACTIVE",
        steps: [
          { type: "VISIT", delayDays: 0 },
          { type: "INVITE", delayDays: 1, note: "Hi {firstName}, fellow {company} fan here." },
          { type: "MESSAGE", delayDays: 1, text: "Thanks for connecting, {firstName}!" },
          { type: "MESSAGE", delayDays: 3, text: "Quick follow-up." },
        ],
        settings: { acceptWithinDays: 21 },
      },
    });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.$disconnect();
  });

  it("copies the list in, skips people already contacted or missing details, and visits the rest", async () => {
    const t = await tick();
    expect(t.queued).toBe(2);
    expect(await prisma.campaignLead.count({ where: { campaignId: "camp-1" } })).toBe(4);
    expect(await lead("old")).toMatchObject({ state: "SKIPPED", reason: "ALREADY_CONTACTED" });
    expect(await lead("nocompany")).toMatchObject({ state: "SKIPPED", reason: "MISSING_DETAIL:company" });
    const q = await queued();
    expect(q.map((a) => [a.type, a.targetUrl])).toEqual([
      ["PROFILE_VISIT", U("jane")],
      ["PROFILE_VISIT", U("kim")],
    ]);
    expect(q[0]!.campaignLeadId).toBe((await lead("jane")).id);
    expect(jobs).toHaveLength(2);
    // Nothing is queued twice while those are waiting
    expect((await tick()).queued).toBe(0);
  });

  it("invites a day after the visit, with the lead's details", async () => {
    await finishAll("SUCCEEDED");
    expect((await tick()).applied).toBe(2);
    expect(await lead("jane")).toMatchObject({ state: "IN_PROGRESS", step: 1, linkedinName: "Jane Doe", actionId: null });
    expect((await tick()).queued).toBe(0); // not due yet
    later(1);
    expect((await tick()).queued).toBe(2);
    const invite = (await queued())[0]!;
    expect(invite).toMatchObject({ type: "CONNECTION_REQUEST" });
    expect(invite.payload).toMatchObject({ note: "Hi {firstName}, fellow {company} fan here.", vars: { firstName: "Jane", company: "Acme" } });
  });

  it("waits for acceptance, checking about once a day", async () => {
    await finishAll("SUCCEEDED");
    await tick();
    expect(await lead("jane")).toMatchObject({ state: "WAITING_ACCEPT", step: 2 });
    later(1);
    await tick();
    expect((await queued()).map((a) => a.type)).toEqual(["CHECK_CONNECTION", "CHECK_CONNECTION"]);
    // Jane accepted, Kim hasn't yet
    for (const a of await queued()) {
      const accepted = a.targetUrl === U("jane");
      await prisma.action.update({ where: { id: a.id }, data: { status: "SUCCEEDED", executedAt: clock, payload: { result: { status: accepted ? "CONNECTED" : "PENDING" } } } });
    }
    await tick();
    expect(await lead("jane")).toMatchObject({ state: "IN_PROGRESS", step: 2 });
    expect((await lead("jane")).connectedAt).not.toBeNull();
    expect(await lead("kim")).toMatchObject({ state: "WAITING_ACCEPT" });
  });

  it("messages after acceptance, then stops following up when they reply", async () => {
    later(1);
    await tick();
    const msg = (await queued()).find((a) => a.type === "MESSAGE")!;
    expect(msg).toMatchObject({ targetUrl: U("jane"), payload: expect.objectContaining({ text: "Thanks for connecting, {firstName}!" }) });
    await prisma.action.update({ where: { id: msg.id }, data: { status: "SUCCEEDED", executedAt: clock, payload: { ...(msg.payload as object), result: { name: "Jane Doe" } } } });
    await tick();
    expect(await lead("jane")).toMatchObject({ state: "IN_PROGRESS", step: 3 });
    expect((await lead("jane")).messagedAt).not.toBeNull();

    // An old message from Jane (before we contacted her) doesn't count…
    await prisma.inboxMessage.create({ data: { accountId: "acc-c", linkedinMessageId: "old", fromName: "Jane Doe", text: "hi", sentAt: clock, fetchedAt: new Date("2026-01-01") } });
    expect((await tick()).replied).toBe(0);
    // …a new one does.
    await prisma.inboxMessage.create({ data: { accountId: "acc-c", linkedinMessageId: "new", fromName: "jane  doe 👋", text: "Sounds good!", sentAt: clock, fetchedAt: clock } });
    expect((await tick()).replied).toBe(1);
    expect(await lead("jane")).toMatchObject({ state: "REPLIED", nextAt: null });
    later(5);
    await tick();
    expect((await queued()).filter((a) => a.targetUrl === U("jane"))).toEqual([]);
  });

  it("gives up on invites not accepted within the window", async () => {
    for (let i = 0; i < 25; i++) {
      later(1);
      await tick();
      await finishAll("SUCCEEDED", { status: "PENDING" });
    }
    await tick();
    expect(await lead("kim")).toMatchObject({ state: "NOT_ACCEPTED", reason: "EXPIRED" });
  });

  it("skips people already in another campaign, but not ones the other campaign skipped", async () => {
    await prisma.campaign.create({
      data: { id: "camp-2", workspaceId: WS, name: "Dup", senders: { create: { accountId: "acc-c" } }, listId: "list-c", status: "ACTIVE", steps: [{ type: "INVITE", delayDays: 0, note: "" }] },
    });
    await tick();
    const rows = await prisma.campaignLead.findMany({ where: { campaignId: "camp-2" }, select: { profileUrl: true, state: true, reason: true } });
    const by = Object.fromEntries(rows.map((r) => [r.profileUrl.split("/in/")[1], [r.state, r.reason]]));
    expect(by).toEqual({
      "jane/": ["SKIPPED", "IN_OTHER_CAMPAIGN"],
      "kim/": ["SKIPPED", "IN_OTHER_CAMPAIGN"],
      "old/": ["SKIPPED", "ALREADY_CONTACTED"],
      "nocompany/": ["IN_PROGRESS", null], // skipped by camp-1 only for a missing {company}; camp-2 needs none
    });
    await finishAll("SUCCEEDED");
    await tick();
  });

  it("pausing cancels queued steps; resuming picks them up again", async () => {
    await prisma.lead.create({ data: { workspaceId: WS, listId: "list-c", profileUrl: U("lee"), firstName: "Lee", company: "Delta" } });
    await prisma.leadList.update({ where: { id: "list-c" }, data: { updatedAt: new Date(clock.getTime() + DAY) } });
    await prisma.campaign.update({ where: { id: "camp-2" }, data: { status: "PAUSED" } });
    await tick();
    const lee = await lead("lee");
    expect(lee).toMatchObject({ state: "IN_PROGRESS", step: 0 });
    expect((await queued()).map((a) => a.targetUrl)).toEqual([U("lee")]);

    await prisma.campaign.update({ where: { id: "camp-1" }, data: { status: "PAUSED" } });
    const t = await tick();
    expect(t.cancelled).toBe(1);
    await tick();
    expect(await lead("lee")).toMatchObject({ state: "IN_PROGRESS", step: 0, actionId: null });
    expect(await queued()).toEqual([]);

    await prisma.campaign.update({ where: { id: "camp-1" }, data: { status: "ACTIVE" } });
    await tick();
    expect((await queued()).map((a) => [a.type, a.targetUrl])).toEqual([["PROFILE_VISIT", U("lee")]]);
  });
});

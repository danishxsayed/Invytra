/**
 * Campaigns against a real database (only with TEST_DATABASE_URL — it is wiped).
 */
import { PrismaClient } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CampaignNotFoundError,
  campaignLeadsPage,
  campaignStats,
  createCampaign,
  deleteCampaign,
  duplicateCampaign,
  getCampaign,
  launchProblems,
  listCampaigns,
  setCampaignStatus,
  updateCampaign,
  type CampaignInput,
} from "../src/lib/campaigns";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("campaigns", () => {
  let prisma: PrismaClient;
  const A = "ws-camp-a";
  const B = "ws-camp-b";
  let id = "";
  const input = (o: Partial<CampaignInput> = {}): CampaignInput => ({
    name: "Q4 founders",
    accountIds: ["acc-camp-a"],
    listId: "list-camp-a",
    steps: [
      { type: "VISIT", delayDays: 0 },
      { type: "INVITE", delayDays: 1, note: "" },
      { type: "MESSAGE", delayDays: 1, text: "Thanks for connecting, {firstName}!" },
    ],
    settings: { acceptWithinDays: 21 },
    ...o,
  });

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: { in: [A, B] } } });
    await prisma.workspace.createMany({ data: [{ id: A, name: "A" }, { id: B, name: "B" }] });
    await prisma.linkedinAccount.createMany({
      data: [
        { id: "acc-camp-a", workspaceId: A, label: "a", proxyUrl: "", workingHours: {}, limits: {}, status: "ACTIVE" },
        { id: "acc-camp-b", workspaceId: B, label: "b", proxyUrl: "", workingHours: {}, limits: {}, status: "ACTIVE" },
        { id: "acc-camp-off", workspaceId: A, label: "Offline", proxyUrl: "", workingHours: {}, limits: {}, status: "DISCONNECTED" },
      ],
    });
    await prisma.leadList.createMany({ data: [{ id: "list-camp-a", workspaceId: A, name: "LA" }, { id: "list-camp-b", workspaceId: B, name: "LB" }] });
    await prisma.lead.create({ data: { workspaceId: A, listId: "list-camp-a", profileUrl: "https://www.linkedin.com/in/x/" } });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: { in: [A, B] } } });
    await prisma.$disconnect();
  });

  it("creates a draft with its own account and list only", async () => {
    expect(await createCampaign(prisma, A, input({ accountIds: ["acc-camp-a", "acc-camp-b"] }))).toMatchObject({ ok: false });
    expect(await createCampaign(prisma, A, input({ listId: "list-camp-b" }))).toMatchObject({ ok: false });
    // Only connected accounts can be chosen.
    expect(await createCampaign(prisma, A, input({ accountIds: ["acc-camp-off"] }))).toEqual({ ok: false, error: "“Offline” isn't connected. Reconnect it in Accounts, or choose another account." });
    const r = await createCampaign(prisma, A, input());
    expect(r.ok).toBe(true);
    id = r.ok ? r.value : "";
    expect((await getCampaign(prisma, A, id)).status).toBe("DRAFT");
  });

  it("explains what blocks a launch, and launches when ready", async () => {
    await updateCampaign(prisma, A, id, input({ steps: [{ type: "INVITE", delayDays: 0, note: "" }, { type: "MESSAGE", delayDays: 1, text: "" }] }));
    expect(await launchProblems(prisma, A, await getCampaign(prisma, A, id))).toEqual(["Step 2: write the message."]);
    expect(await setCampaignStatus(prisma, A, id, "ACTIVE")).toMatchObject({ ok: false });
    await updateCampaign(prisma, A, id, input());
    expect(await setCampaignStatus(prisma, A, id, "ACTIVE")).toEqual({ ok: true, value: undefined });
    expect((await getCampaign(prisma, A, id)).startedAt).not.toBeNull();
  });

  it("after launch, keeps steps, sender and list in place but allows text changes and new follow-ups", async () => {
    const steps = input().steps;
    expect(await updateCampaign(prisma, A, id, input({ steps: steps.slice(1) }))).toMatchObject({ ok: false });
    expect(await updateCampaign(prisma, A, id, input({ accountIds: [] }))).toMatchObject({ ok: false });
    const more = [...steps.slice(0, 2), { type: "MESSAGE" as const, delayDays: 2, text: "New text" }, { type: "MESSAGE" as const, delayDays: 4, text: "One more" }];
    expect(await updateCampaign(prisma, A, id, input({ steps: more }))).toEqual({ ok: true, value: undefined });
  });

  it("lets senders be added and removed while it runs", async () => {
    const a2 = await prisma.linkedinAccount.create({
      data: { id: "acc-camp-a2", workspaceId: A, label: "a2", proxyUrl: "", workingHours: {}, limits: {}, status: "ACTIVE" },
    });
    const steps = (await getCampaign(prisma, A, id)).steps;
    expect(await updateCampaign(prisma, A, id, input({ steps, accountIds: ["acc-camp-a", a2.id, a2.id] }))).toEqual({ ok: true, value: undefined });
    expect((await getCampaign(prisma, A, id)).senders.map((s) => s.id).sort()).toEqual(["acc-camp-a", "acc-camp-a2"]);
    expect(await updateCampaign(prisma, A, id, input({ steps, accountIds: [a2.id] }))).toEqual({ ok: true, value: undefined });
    expect((await getCampaign(prisma, A, id)).senders.map((s) => s.id)).toEqual(["acc-camp-a2"]);
    expect((await listCampaigns(prisma, A))[0]!.senders.map((s) => s.label)).toEqual(["a2"]);
    await updateCampaign(prisma, A, id, input({ steps }));
  });

  it("never lets another workspace see, change, start, stop or delete it", async () => {
    await expect(getCampaign(prisma, B, id)).rejects.toBeInstanceOf(CampaignNotFoundError);
    await expect(updateCampaign(prisma, B, id, input({ accountIds: ["acc-camp-b"], listId: "list-camp-b" }))).rejects.toBeInstanceOf(CampaignNotFoundError);
    await expect(setCampaignStatus(prisma, B, id, "PAUSED")).rejects.toBeInstanceOf(CampaignNotFoundError);
    await expect(deleteCampaign(prisma, B, id)).rejects.toBeInstanceOf(CampaignNotFoundError);
    await expect(campaignLeadsPage(prisma, B, id)).rejects.toBeInstanceOf(CampaignNotFoundError);
    expect(await listCampaigns(prisma, B)).toEqual([]);
    expect((await campaignStats(prisma, B, [id])).get(id)!.total).toBe(0);
  });

  it("counts progress, pauses, and deletes with its queued steps cancelled", async () => {
    const cl = await prisma.campaignLead.create({
      data: { campaignId: id, workspaceId: A, profileUrl: "https://www.linkedin.com/in/x/", state: "WAITING_ACCEPT", invitedAt: new Date() },
    });
    const queued = await prisma.action.create({ data: { accountId: "acc-camp-a", type: "CHECK_CONNECTION", status: "QUEUED", campaignLeadId: cl.id } });
    expect((await campaignStats(prisma, A, [id])).get(id)).toMatchObject({ total: 1, invited: 1, byState: { WAITING_ACCEPT: 1 } });
    expect((await campaignLeadsPage(prisma, A, id, { filter: "waiting" })).total).toBe(1);
    expect((await campaignLeadsPage(prisma, A, id, { filter: "replied" })).total).toBe(0);
    expect(await setCampaignStatus(prisma, A, id, "PAUSED")).toMatchObject({ ok: true });
    expect(await deleteCampaign(prisma, A, id)).toMatchObject({ ok: true });
    expect(await prisma.action.findUnique({ where: { id: queued.id } })).toMatchObject({ status: "SKIPPED", error: "CANCELLED", campaignLeadId: null });
  });

  it("a sender that disconnects later can stay on its campaign (but can't be added to another)", async () => {
    const r = await createCampaign(prisma, A, input({ name: "Keeps sender" }));
    const cid = r.ok ? r.value : "";
    await prisma.campaignSender.create({ data: { campaignId: cid, accountId: "acc-camp-off" } }).catch(() => undefined);
    expect(await updateCampaign(prisma, A, cid, input({ name: "Keeps sender", accountIds: ["acc-camp-a", "acc-camp-off"] }))).toMatchObject({ ok: true });
  });

  it("duplicates as a draft with connected senders only, and never across workspaces", async () => {
    const r = await createCampaign(prisma, A, input({ name: "Original", settings: { acceptWithinDays: 14, startAt: "2030-01-01T09:00:00.000Z" } }));
    const cid = r.ok ? r.value : "";
    await prisma.campaignSender.create({ data: { campaignId: cid, accountId: "acc-camp-off" } });
    await setCampaignStatus(prisma, A, cid, "ACTIVE");

    await expect(duplicateCampaign(prisma, B, cid)).rejects.toThrow(CampaignNotFoundError);
    const d = await duplicateCampaign(prisma, A, cid);
    expect(d.ok).toBe(true);
    const copy = await getCampaign(prisma, A, d.ok ? d.value : "");
    expect(copy).toMatchObject({ name: "Original (copy)", status: "DRAFT", listId: "list-camp-a", startedAt: null });
    expect(copy.senders.map((s) => s.id)).toEqual(["acc-camp-a"]);
    expect(copy.steps).toEqual((await getCampaign(prisma, A, cid)).steps);
    expect(copy.settings).toMatchObject({ acceptWithinDays: 14, startAt: null });

    const long = await createCampaign(prisma, A, input({ name: "x".repeat(80) }));
    const d2 = await duplicateCampaign(prisma, A, long.ok ? long.value : "");
    expect(d2.ok && (await getCampaign(prisma, A, d2.value)).name).toBe("x".repeat(73) + " (copy)");
  });
});

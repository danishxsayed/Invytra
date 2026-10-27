/** Lead imports from search links (only with TEST_DATABASE_URL — it is wiped). */
import { PrismaClient } from "@invytra/db";
import type { Queue } from "bullmq";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importTick } from "../../src/imports/importer.js";
import type { ActionJob } from "../../src/queue/queue.js";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const U = (s: string) => `https://www.linkedin.com/in/${s}/`;
const person = (slug: string, first: string) => ({ profileUrl: U(slug), firstName: first, lastName: "Test", title: "Founder at Acme", company: "Acme", location: "Pune" });

d("search imports", () => {
  let prisma: PrismaClient;
  const WS = "ws-import";
  const queue = { add: async () => undefined } as unknown as Queue<ActionJob>;
  const tick = () => importTick({ prisma, queue });
  const imp = () => prisma.leadImport.findUniqueOrThrow({ where: { id: "imp-1" } });
  const finishPage = async (result: unknown, status: "SUCCEEDED" | "SKIPPED" | "FAILED" = "SUCCEEDED", error: string | null = null) => {
    const a = await prisma.action.findUniqueOrThrow({ where: { id: (await imp()).actionId! } });
    await prisma.action.update({ where: { id: a.id }, data: { status, error, executedAt: new Date(), payload: { ...(a.payload as object), result } as object } });
  };

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.workspace.create({ data: { id: WS, name: "Import" } });
    await prisma.linkedinAccount.create({ data: { id: "acc-i", workspaceId: WS, label: "i", proxyUrl: "", workingHours: {}, limits: {}, status: "ACTIVE" } });
    await prisma.leadList.create({ data: { id: "list-i", workspaceId: WS, name: "Founders" } });
    await prisma.lead.create({ data: { workspaceId: WS, listId: "list-i", profileUrl: U("already") } });
    await prisma.leadImport.create({
      data: { id: "imp-1", workspaceId: WS, listId: "list-i", accountId: "acc-i", kind: "LINKEDIN_SEARCH", url: "https://www.linkedin.com/search/results/people/?keywords=founder", maxLeads: 5 },
    });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.$disconnect();
  });

  it("queues the first page as a search action", async () => {
    expect((await tick()).queued).toBe(1);
    const a = await prisma.action.findUniqueOrThrow({ where: { id: (await imp()).actionId! } });
    expect(a).toMatchObject({ type: "SEARCH_PAGE", status: "QUEUED", targetUrl: "https://www.linkedin.com/search/results/people/?keywords=founder" });
    expect((await tick()).queued).toBe(0); // nothing twice while it waits
  });

  it("adds new people to the list and moves to the next page", async () => {
    await finishPage({ people: [person("ann", "Ann"), person("already", "Al"), person("ben", "Ben")], hasNext: true });
    const t = await tick();
    expect(t).toMatchObject({ added: 2, queued: 1 });
    expect(await imp()).toMatchObject({ pages: 1, found: 3, added: 2, nextPage: 2, status: "RUNNING" });
    const a = await prisma.action.findUniqueOrThrow({ where: { id: (await imp()).actionId! } });
    expect(a.targetUrl).toBe("https://www.linkedin.com/search/results/people/?keywords=founder&page=2");
    expect(await prisma.lead.findFirst({ where: { listId: "list-i", profileUrl: U("ann") } })).toMatchObject({ firstName: "Ann", company: "Acme", location: "Pune" });
  });

  it("counts a finished page once, even when two runs see it at the same moment", async () => {
    await prisma.leadImport.update({ where: { id: "imp-1" }, data: { maxLeads: 50 } });
    await finishPage({ people: [person("fay", "Fay")], hasNext: true });
    await Promise.all([tick(), tick()]);
    expect(await imp()).toMatchObject({ pages: 2, found: 4, added: 3, nextPage: 3 });
    expect(await prisma.action.count({ where: { type: "SEARCH_PAGE", status: "QUEUED", account: { workspaceId: WS } } })).toBe(1);
    await prisma.leadImport.update({ where: { id: "imp-1" }, data: { maxLeads: 5 } });
  });

  it("stops at the number of people asked for", async () => {
    await finishPage({ people: [person("cy", "Cy"), person("di", "Di"), person("ed", "Ed")], hasNext: true });
    await tick();
    expect(await imp()).toMatchObject({ status: "DONE", reason: "MAX_LEADS", found: 5, added: 4 });
    expect(await prisma.lead.count({ where: { listId: "list-i" } })).toBe(5);
  });

  it("ends with the search's reason when LinkedIn refuses", async () => {
    await prisma.leadImport.create({
      data: { id: "imp-2", workspaceId: WS, listId: "list-i", accountId: "acc-i", kind: "SALES_NAV_SEARCH", url: "https://www.linkedin.com/sales/search/people?query=x" },
    });
    await tick();
    const i2 = await prisma.leadImport.findUniqueOrThrow({ where: { id: "imp-2" } });
    await prisma.action.update({ where: { id: i2.actionId! }, data: { status: "SKIPPED", error: "NO_SALES_NAV", executedAt: new Date() } });
    await tick();
    expect(await prisma.leadImport.findUniqueOrThrow({ where: { id: "imp-2" } })).toMatchObject({ status: "FAILED", reason: "NO_SALES_NAV", actionId: null });
  });
});

d("search imports: facts and fetch-all", () => {
  let prisma: PrismaClient;
  const WS = "ws-import2";
  const queue = { add: async () => undefined } as unknown as Queue<ActionJob>;
  const imp = () => prisma.leadImport.findUniqueOrThrow({ where: { id: "imp-2" } });

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.workspace.create({ data: { id: WS, name: "Import 2" } });
    await prisma.linkedinAccount.create({ data: { id: "acc-i2", workspaceId: WS, label: "i2", proxyUrl: "", workingHours: {}, limits: {}, status: "ACTIVE" } });
    await prisma.leadList.create({ data: { id: "list-i2", workspaceId: WS, name: "Flooring" } });
    await prisma.leadImport.create({
      data: { id: "imp-2", workspaceId: WS, listId: "list-i2", accountId: "acc-i2", kind: "LINKEDIN_SEARCH", url: "https://www.linkedin.com/search/results/people/?keywords=floor", maxLeads: 50 },
    });
    await prisma.campaign.create({ data: { id: "camp-fetch", workspaceId: WS, name: "Fetch", listId: "list-i2", steps: [], settings: { fetchAllAtOnce: true } } });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.$disconnect();
  });

  it("keeps connection level and Premium from the results; a 'fetch all at once' campaign lifts the daily page allowance", async () => {
    await importTick({ prisma, queue });
    const first = await prisma.action.findUniqueOrThrow({ where: { id: (await imp()).actionId! } });
    expect(first.payload).toMatchObject({ fetchAll: true });
    await prisma.action.update({
      where: { id: first.id },
      data: {
        status: "SUCCEEDED",
        executedAt: new Date(),
        payload: { ...(first.payload as object), result: { people: [{ ...person("gus", "Gus"), degree: 3, premium: true }, { ...person("hal", "Hal"), degree: 2, premium: false }], hasNext: true } },
      },
    });
    await importTick({ prisma, queue });
    expect(await prisma.lead.findFirst({ where: { listId: "list-i2", profileUrl: U("gus") } })).toMatchObject({ degree: 3, premium: true });
    // No badge in a search result isn't proof they lack Premium.
    expect(await prisma.lead.findFirst({ where: { listId: "list-i2", profileUrl: U("hal") } })).toMatchObject({ degree: 2, premium: null });
    // Without such a campaign, pages keep the normal allowance.
    await prisma.campaign.delete({ where: { id: "camp-fetch" } });
    const second = await prisma.action.findUniqueOrThrow({ where: { id: (await imp()).actionId! } });
    expect(second.payload).toMatchObject({ fetchAll: true }); // queued before the change
    await prisma.action.update({ where: { id: second.id }, data: { status: "SUCCEEDED", executedAt: new Date(), payload: { ...(second.payload as object), result: { people: [person("ivy", "Ivy")], hasNext: true } } } });
    await importTick({ prisma, queue });
    const third = await prisma.action.findUniqueOrThrow({ where: { id: (await imp()).actionId! } });
    expect(third.payload).not.toHaveProperty("fetchAll");
  });
});

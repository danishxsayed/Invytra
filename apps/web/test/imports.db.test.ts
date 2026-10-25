import { PrismaClient } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { launchProblems, getCampaign, createCampaign } from "../src/lib/campaigns";
import { cancelSearchImport, importsForList, startSearchImport } from "../src/lib/imports";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const SEARCH = "https://www.linkedin.com/search/results/people/?keywords=founder&page=4";

d("search imports", () => {
  let prisma: PrismaClient;
  const A = "ws-imp-a";
  const B = "ws-imp-b";
  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: { in: [A, B] } } });
    await prisma.workspace.createMany({ data: [{ id: A, name: "A" }, { id: B, name: "B" }] });
    await prisma.linkedinAccount.createMany({
      data: [
        { id: "acc-imp-a", workspaceId: A, label: "a", proxyUrl: "", workingHours: {}, limits: {}, status: "ACTIVE" },
        { id: "acc-imp-off", workspaceId: A, label: "off", proxyUrl: "", workingHours: {}, limits: {}, status: "DISCONNECTED" },
        { id: "acc-imp-b", workspaceId: B, label: "b", proxyUrl: "", workingHours: {}, limits: {}, status: "ACTIVE" },
      ],
    });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: { in: [A, B] } } });
    await prisma.$disconnect();
  });

  let listId = "";
  let importId = "";
  it("starts collecting into a new list, from a cleaned-up search link", async () => {
    const r = await startSearchImport(prisma, A, { name: "Founders", url: SEARCH, accountId: "acc-imp-a", maxLeads: 100 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    ({ listId, importId } = r.value);
    expect(await importsForList(prisma, A, listId)).toMatchObject([
      { id: importId, kind: "LINKEDIN_SEARCH", status: "RUNNING", url: "https://www.linkedin.com/search/results/people/?keywords=founder", maxLeads: 100 },
    ]);
  });

  it("refuses bad links, other workspaces' accounts and disconnected accounts", async () => {
    expect(await startSearchImport(prisma, A, { name: "x", url: "https://www.linkedin.com/in/jane/", accountId: "acc-imp-a", maxLeads: 10 })).toMatchObject({ ok: false });
    expect(await startSearchImport(prisma, A, { name: "x", url: SEARCH, accountId: "acc-imp-b", maxLeads: 10 })).toMatchObject({ ok: false });
    expect(await startSearchImport(prisma, A, { name: "x", url: SEARCH, accountId: "acc-imp-off", maxLeads: 10 })).toMatchObject({ ok: false });
    await expect(startSearchImport(prisma, B, { listId, url: SEARCH, accountId: "acc-imp-b", maxLeads: 10 })).rejects.toThrow();
  });

  it("lets a campaign launch on a list that is still being collected", async () => {
    const c = await createCampaign(prisma, A, {
      name: "From search",
      accountIds: ["acc-imp-a"],
      listId,
      steps: [{ type: "INVITE", delayDays: 0, note: "" }],
      settings: {},
    });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(await launchProblems(prisma, A, await getCampaign(prisma, A, c.value))).toEqual([]);
  });

  it("can be stopped, only by its own workspace", async () => {
    expect(await cancelSearchImport(prisma, B, importId)).toMatchObject({ ok: false });
    expect(await cancelSearchImport(prisma, A, importId)).toEqual({ ok: true, value: undefined });
    expect((await importsForList(prisma, A, listId))[0]).toMatchObject({ status: "CANCELLED" });
  });
});

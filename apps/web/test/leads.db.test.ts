/**
 * Lead lists against a real database (only with TEST_DATABASE_URL — it is wiped).
 */
import { PrismaClient } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  LeadListNotFoundError,
  deleteList,
  getList,
  importLeads,
  leadCount,
  leadsPage,
  listSummaries,
  removeLeads,
  renameList,
} from "../src/lib/leads";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("lead lists", () => {
  let prisma: PrismaClient;
  const A = "ws-leads-a";
  const B = "ws-leads-b";
  let listA = "";

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: { in: [A, B] } } });
    await prisma.workspace.createMany({ data: [{ id: A, name: "A" }, { id: B, name: "B" }] });
    await prisma.linkedinAccount.create({
      data: { id: "acc-leads-a", workspaceId: A, label: "a1", proxyUrl: "", workingHours: {}, limits: {}, status: "ACTIVE" },
    });
    const at = (m: number) => new Date(Date.now() - m * 60_000);
    await prisma.action.createMany({
      data: [
        { accountId: "acc-leads-a", type: "PROFILE_VISIT", status: "SUCCEEDED", targetUrl: "https://www.linkedin.com/in/jane/", executedAt: at(30), createdAt: at(31) },
        { accountId: "acc-leads-a", type: "CONNECTION_REQUEST", status: "SUCCEEDED", targetUrl: "https://www.linkedin.com/in/jane/", executedAt: at(20), createdAt: at(21) },
        { accountId: "acc-leads-a", type: "CONNECTION_REQUEST", status: "FAILED", error: "Timeout\nstack", targetUrl: "https://www.linkedin.com/in/bob/", createdAt: at(10) },
        { accountId: "acc-leads-a", type: "MESSAGE", status: "QUEUED", targetUrl: "https://www.linkedin.com/in/carl/", createdAt: at(5) },
      ],
    });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: { in: [A, B] } } });
    await prisma.$disconnect();
  });

  it("creates a list from a CSV, re-parsing it on the server", async () => {
    const csv = "Name,Company,LinkedIn\nJane Doe,Acme,https://www.linkedin.com/in/Jane\nBob Roe,Beta,linkedin.com/in/bob?x=1\nCarl,Gamma,https://linkedin.com/in/carl/\nNo,One,\n";
    const r = await importLeads(prisma, A, { name: "  Founders  ", kind: "csv", text: csv });
    expect(r).toMatchObject({ ok: true, value: { added: 3, alreadyInList: 0, inOtherLists: 0, invalid: 1 } });
    listA = r.ok ? r.value.listId : "";
    expect((await getList(prisma, A, listA)).name).toBe("Founders");
  });

  it("adds only new people to an existing list and flags people already in other lists", async () => {
    const again = await importLeads(prisma, A, { listId: listA, kind: "paste", text: "https://linkedin.com/in/jane\nhttps://linkedin.com/in/dana" });
    expect(again).toMatchObject({ ok: true, value: { added: 1, alreadyInList: 1 } });
    const other = await importLeads(prisma, A, { name: "Second", kind: "paste", text: "linkedin.com/in/jane linkedin.com/in/erin" });
    expect(other).toMatchObject({ ok: true, value: { added: 2, inOtherLists: 1 } });
    expect(await leadCount(prisma, A)).toBe(6);
  });

  it("refuses an import with no profile links or no list name", async () => {
    expect(await importLeads(prisma, A, { name: "X", kind: "paste", text: "hello" })).toMatchObject({ ok: false });
    expect(await importLeads(prisma, A, { name: " ", kind: "paste", text: "linkedin.com/in/zed" })).toMatchObject({ ok: false });
  });

  it("shows each lead's status from the workspace's own actions", async () => {
    const { total, rows } = await leadsPage(prisma, A, listA);
    expect(total).toBe(4);
    const stage = Object.fromEntries(rows.map((r) => [r.profileUrl.split("/in/")[1], r.status.stage]));
    expect(stage).toEqual({ "jane/": "INVITED", "bob/": "FAILED", "carl/": "QUEUED", "dana/": "NONE" });
    expect(rows.find((r) => r.profileUrl.endsWith("/bob/"))!.status.detail).toBe("Timeout");
    const [summary] = (await listSummaries(prisma, A)).filter((s) => s.id === listA);
    expect(summary).toMatchObject({ total: 4, contacted: 1, name: "Founders" });
  });

  it("searches by name, company and title", async () => {
    expect((await leadsPage(prisma, A, listA, { q: "acme" })).rows.map((r) => r.firstName)).toEqual(["Jane"]);
    expect((await leadsPage(prisma, A, listA, { q: "zzz" })).total).toBe(0);
  });

  it("never shows, changes or deletes another workspace's lists", async () => {
    expect(await listSummaries(prisma, B)).toEqual([]);
    expect(await leadCount(prisma, B)).toBe(0);
    await expect(getList(prisma, B, listA)).rejects.toBeInstanceOf(LeadListNotFoundError);
    await expect(leadsPage(prisma, B, listA)).rejects.toBeInstanceOf(LeadListNotFoundError);
    await expect(renameList(prisma, B, listA, "Mine now")).rejects.toBeInstanceOf(LeadListNotFoundError);
    await expect(deleteList(prisma, B, listA)).rejects.toBeInstanceOf(LeadListNotFoundError);
    await expect(importLeads(prisma, B, { listId: listA, kind: "paste", text: "linkedin.com/in/x" })).rejects.toBeInstanceOf(LeadListNotFoundError);
    const ids = (await leadsPage(prisma, A, listA)).rows.map((r) => r.id);
    await expect(removeLeads(prisma, B, listA, ids)).rejects.toBeInstanceOf(LeadListNotFoundError);
    expect((await leadsPage(prisma, A, listA)).total).toBe(4);
  });

  it("does not show another workspace's actions as a lead's status", async () => {
    const r = await importLeads(prisma, B, { name: "B list", kind: "paste", text: "https://www.linkedin.com/in/jane/" });
    const listB = r.ok ? r.value.listId : "";
    expect((await leadsPage(prisma, B, listB)).rows[0]!.status.stage).toBe("NONE");
    expect((await listSummaries(prisma, B))[0]).toMatchObject({ total: 1, contacted: 0 });
  });

  it("renames, removes leads and deletes its own list", async () => {
    expect(await renameList(prisma, A, listA, "Founders Q4")).toMatchObject({ ok: true });
    const ids = (await leadsPage(prisma, A, listA)).rows.slice(0, 2).map((r) => r.id);
    expect(await removeLeads(prisma, A, listA, ids)).toEqual({ ok: true, value: 2 });
    expect(await deleteList(prisma, A, listA)).toMatchObject({ ok: true });
    await expect(getList(prisma, A, listA)).rejects.toBeInstanceOf(LeadListNotFoundError);
    expect(await leadCount(prisma, A)).toBe(2); // the "Second" list remains
  });
});

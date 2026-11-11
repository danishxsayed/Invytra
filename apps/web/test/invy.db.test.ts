/**
 * Ask Invy in the dashboard against a real database (only with TEST_DATABASE_URL — it is wiped).
 */
import { PrismaClient } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteSearch, emailBusinesses, followUp, getSearch, listSaved, listSearches, renameSearch, saveBusinesses, searchCsv, startSearch } from "../src/lib/invy";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const A = "ws-invy-a";
const B = "ws-invy-b";

d("Ask Invy (dashboard)", () => {
  let prisma: PrismaClient;
  let id = "";
  const biz = (n: number, extra: object = {}) => ({
    searchId: id, workspaceId: A, placeId: `p${n}`, name: `Biz ${n}`, lat: 12.9, lng: 77.6, position: n, match: true, charged: true,
    phone: `+91 9000 00000${n}`, reasons: [{ text: "No website on its Google Business listing.", source: "listing" }], ...extra,
  });

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: { in: [A, B] } } });
    await prisma.workspace.createMany({ data: [{ id: A, name: "A", plan: "pro" }, { id: B, name: "B" }] });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: { in: [A, B] } } });
    await prisma.$disconnect();
  });

  it("starts a search and takes follow-ups only when Invy is free", async () => {
    expect(await startSearch(prisma, A, "u1", "hi")).toMatchObject({ ok: false });
    const r = await startSearch(prisma, A, "u1", "  Find 5 cafes   in Pune ");
    expect(r.ok).toBe(true);
    id = r.ok ? r.value.id : "";
    const s = await prisma.invySearch.findUniqueOrThrow({ where: { id } });
    expect(s).toMatchObject({ status: "QUEUED", messages: [expect.objectContaining({ role: "user", text: "Find 5 cafes in Pune" })] });
    expect(await followUp(prisma, A, id, "5 more")).toEqual({ ok: false, error: "Invy is still working on the last message." });
    await prisma.invySearch.update({ where: { id }, data: { status: "DONE", title: "Cafes in Pune" } });
    expect(await followUp(prisma, A, id, "5 more")).toEqual({ ok: true, value: undefined });
    expect(await followUp(prisma, B, id, "5 more")).toMatchObject({ ok: false });
    await prisma.invySearch.update({ where: { id }, data: { status: "DONE" } });
  });

  it("shows only the businesses shown, only to its workspace", async () => {
    await prisma.invyBusiness.createMany({
      data: [biz(1, { emails: ["hello@biz1.in"], check: { status: "ok", checkedAt: "2026-11-01", socials: [{ network: "instagram", url: "https://instagram.com/biz1" }] } }), biz(2, { name: "=HYPERLINK(\"evil\")" }), biz(3, { emails: ["team@biz3.in"] }), { ...biz(4), position: null, match: false }],
    });
    const s = await getSearch(prisma, A, id);
    expect(s!.cards.map((c) => c.n)).toEqual([1, 2, 3]);
    expect(s!.looked).toBe(4);
    expect(s!.cards[0]!.socials).toEqual([{ network: "instagram", url: "https://instagram.com/biz1" }]);
    expect(s!.cards[1]!.socials).toEqual([]);
    expect(await getSearch(prisma, B, id)).toBeNull();
    expect((await listSearches(prisma, A))[0]).toMatchObject({ id, title: "Cafes in Pune", found: 3 });
    expect(await listSearches(prisma, B)).toEqual([]);
  });

  it("CSV: chosen rows, and a cell can't run as a formula", async () => {
    const csv = (await searchCsv(prisma, A, id, null))!;
    expect(csv.split("\n")).toHaveLength(4);
    expect(csv).toContain(`"'=HYPERLINK(""evil"")"`);
    expect(csv).toContain("hello@biz1.in,instagram: https://instagram.com/biz1,");
    const p1 = (await prisma.invyBusiness.findFirstOrThrow({ where: { searchId: id, placeId: "p1" } })).id;
    expect((await searchCsv(prisma, A, id, [p1]))!.split("\n")).toHaveLength(2);
    expect(await searchCsv(prisma, B, id, null)).toBeNull();
  });

  it("saves businesses (once), and sends those with an email to a draft campaign", async () => {
    const ids = (await prisma.invyBusiness.findMany({ where: { searchId: id, position: { not: null } }, orderBy: { position: "asc" } })).map((b) => b.id);
    expect(await saveBusinesses(prisma, A, id, ids.slice(0, 2))).toEqual({ ok: true, value: 2 });
    expect(await saveBusinesses(prisma, A, id, ids.slice(0, 2))).toEqual({ ok: true, value: 2 });
    expect(await listSaved(prisma, A)).toHaveLength(2);
    expect((await listSaved(prisma, A)).find((p) => p.placeId === "p1")?.socials).toEqual([{ network: "instagram", url: "https://instagram.com/biz1" }]);
    expect(await saveBusinesses(prisma, B, id, ids)).toEqual({ ok: true, value: 0 });

    const r = await emailBusinesses(prisma, A, id, ids);
    expect(r).toMatchObject({ ok: true, value: { added: 2, noEmail: 1 } });
    const campaignId = r.ok ? r.value.campaignId : "";
    const camp = await prisma.emailCampaign.findUniqueOrThrow({ where: { id: campaignId } });
    expect(camp).toMatchObject({ workspaceId: A, status: "DRAFT", name: "Ask Invy: Cafes in Pune" });
    const leads = await prisma.emailLead.findMany({ where: { campaignId }, select: { email: true } });
    expect(leads.map((l) => l.email).sort()).toEqual(["hello@biz1.in", "team@biz3.in"]);
    const contact = await prisma.emailContact.findFirstOrThrow({ where: { workspaceId: A, email: "hello@biz1.in" } });
    expect(contact).toMatchObject({ company: "Biz 1", vars: expect.objectContaining({ phone: "+91 9000 000001" }) });
    expect((await listSaved(prisma, A)).filter((p) => p.emailedAt)).toHaveLength(2);
    const p2 = (await prisma.invyBusiness.findFirstOrThrow({ where: { searchId: id, placeId: "p2" } })).id;
    expect(await emailBusinesses(prisma, A, id, [p2])).toMatchObject({ ok: false, error: expect.stringContaining("public email") });
  });

  it("renames and deletes (saved businesses stay)", async () => {
    expect(await renameSearch(prisma, A, id, "Pune cafes")).toEqual({ ok: true, value: undefined });
    expect(await renameSearch(prisma, B, id, "x")).toMatchObject({ ok: false });
    expect(await deleteSearch(prisma, B, id)).toMatchObject({ ok: false });
    expect(await deleteSearch(prisma, A, id)).toEqual({ ok: true, value: undefined });
    expect(await prisma.invyBusiness.count({ where: { searchId: id } })).toBe(0);
    expect(await listSaved(prisma, A)).toHaveLength(3);
  });
});

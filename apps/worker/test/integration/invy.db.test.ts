/**
 * Ask Invy searches against a real database (only with TEST_DATABASE_URL — it is wiped), with
 * stand-ins for Google Maps, websites and the AI.
 */
import { PrismaClient } from "@invytra/db";
import { monthlyAiCredits, type InvyCriteria, type SiteCheck } from "@invytra/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { InvyBrain } from "../../src/invy/brain";
import type { Place, PlacesSearch } from "../../src/invy/places";
import { runNextInvySearch, type InvyMessage } from "../../src/invy/run";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const WS = "ws-invy";

/** 45 restaurants over 3 pages; every third has no website. */
const place = (i: number): Place => ({
  placeId: `pl-${i}`, name: `Restaurant ${i}`, category: "Restaurant", address: `${i} MG Road, Bangalore`, lat: 12.9 + i / 1000, lng: 77.5 + i / 1000,
  phone: `+91 80 0000 ${String(i).padStart(4, "0")}`, website: i % 3 === 0 ? null : `https://r${i}.in`, mapsUrl: `https://maps.google.com/?cid=${i}`,
  rating: 3 + (i % 20) / 10, reviews: i * 3, businessStatus: "OPERATIONAL",
});
const pages = [0, 1, 2].map((p) => Array.from({ length: 15 }, (_, i) => place(p * 15 + i + 1)));

d("Ask Invy search", () => {
  let prisma: PrismaClient;
  const calls: { q: string; token: string | null }[] = [];
  const places: PlacesSearch = {
    async search(q, token) {
      calls.push({ q, token: token ?? null });
      const i = token ? Number(token) : 0;
      return { places: pages[i] ?? [], next: i < 2 ? String(i + 1) : null };
    },
  };
  const checkSite = async (w: string | null): Promise<SiteCheck> => (w ? { status: "ok", url: w, https: true, mobileFriendly: true, copyrightYear: 2026, emails: [`hi@${new URL(w).hostname}`], checkedAt: "" } : { status: "none", checkedAt: "" });
  let criteria: InvyCriteria = { category: "restaurants", location: "Bangalore", count: 5, website: "none", needs: [], minRating: null, queries: ["restaurants in Bangalore"], offer: null };
  let question: string | null = null;
  const brain: InvyBrain = {
    async understand() {
      return question ? { question } : { criteria, reply: "Looking for restaurants without a website." };
    },
    async explain(_k, bs) {
      return { summary: `Found ${bs.length}.`, items: Object.fromEntries(bs.map((b) => [b.id, { why: `${b.name}: no website on its Google listing.`, opportunity: "Website development" }])) };
    },
  };
  const deps = { places, brain, checkSite, monthlyCredits: monthlyAiCredits };
  const start = (id: string, text: string) =>
    prisma.invySearch.create({ data: { id, workspaceId: WS, title: "", status: "QUEUED", messages: [{ role: "user", text, at: new Date().toISOString() }] } });
  const ask = async (id: string, text: string) => {
    const s = await prisma.invySearch.findUniqueOrThrow({ where: { id } });
    await prisma.invySearch.update({ where: { id }, data: { status: "QUEUED", messages: [...(s.messages as InvyMessage[]), { role: "user", text, at: new Date().toISOString() }] } });
  };
  const shown = (id: string) => prisma.invyBusiness.findMany({ where: { searchId: id, position: { not: null } }, orderBy: { position: "asc" } });
  const credits = () => prisma.aiCreditUse.aggregate({ where: { workspaceId: WS, action: "INVY" }, _sum: { credits: true } }).then((r) => r._sum.credits ?? 0);

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.workspace.create({ data: { id: WS, name: "Invy", plan: "pro" } });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.$disconnect();
  });

  it("finds 5 without a website, with evidence, Invy's words, and 5 credits", async () => {
    await start("is-1", "Find 5 restaurants in Bangalore without a website");
    expect(await runNextInvySearch(prisma, deps)).toBe(true);
    const s = await prisma.invySearch.findUniqueOrThrow({ where: { id: "is-1" } });
    expect(s).toMatchObject({ status: "DONE", title: "Restaurants in Bangalore without a website", summary: "Found 5.", creditsUsed: 5, progress: null });
    expect((s.messages as InvyMessage[]).at(-1)!.text).toBe("Looking for restaurants without a website. Here are 5 restaurants.");
    const b = await shown("is-1");
    expect(b.map((x) => x.position)).toEqual([1, 2, 3, 4, 5]);
    expect(b.every((x) => !x.website && x.match && x.charged)).toBe(true);
    expect(b[0]).toMatchObject({ opportunity: "Website development", reasons: [{ text: "No website on its Google Business listing.", source: "listing" }] });
    expect(b[0]!.why).toContain("no website on its Google listing");
    // One page (15 looked at, 5 matched) was enough.
    expect(calls).toEqual([{ q: "restaurants in Bangalore", token: null }]);
    expect(await credits()).toBe(5);
  });

  it("“5 more”: continues on the next page, pays only for the new ones", async () => {
    criteria = { ...criteria, count: 10 };
    await ask("is-1", "5 more");
    await runNextInvySearch(prisma, deps);
    const b = await shown("is-1");
    expect(b).toHaveLength(10);
    expect(new Set(b.map((x) => x.placeId)).size).toBe(10);
    expect(await credits()).toBe(10);
  });

  it("asks back when the request is unclear (no charge)", async () => {
    question = "Which city should I look in?";
    await start("is-2", "find cafes");
    await runNextInvySearch(prisma, deps);
    const s = await prisma.invySearch.findUniqueOrThrow({ where: { id: "is-2" } });
    expect(s.status).toBe("DONE");
    expect((s.messages as InvyMessage[]).at(-1)).toMatchObject({ role: "invy", text: "Which city should I look in?" });
    expect(await credits()).toBe(10);
    question = null;
  });

  it("skips businesses already saved, stops at the page budget, and says how many it found", async () => {
    await prisma.invyProspect.create({ data: { workspaceId: WS, placeId: "pl-3", name: "Restaurant 3", lat: 0, lng: 0 } });
    criteria = { ...criteria, count: 40 };
    calls.length = 0;
    await start("is-3", "Find 40 restaurants in Bangalore without a website");
    await runNextInvySearch(prisma, deps);
    const b = await shown("is-3");
    // 45 places, 15 without a website, one of them saved already: 14.
    expect(b).toHaveLength(14);
    expect(b.some((x) => x.placeId === "pl-3")).toBe(false);
    expect(calls).toHaveLength(3);
    const s = await prisma.invySearch.findUniqueOrThrow({ where: { id: "is-3" } });
    expect((s.messages as InvyMessage[]).at(-1)!.text).toContain("I found 14 of the 40 you asked for after checking 44 businesses");
  });

  it("out of credits: shows what's paid for and says so", async () => {
    await prisma.workspace.update({ where: { id: WS }, data: { aiUsed: monthlyAiCredits("pro") - 2, aiExtra: 0 } });
    criteria = { ...criteria, count: 5 };
    await start("is-4", "Find 5 restaurants in Bangalore without a website");
    // Fresh page results: the saved one and those in other searches are still allowed here.
    await runNextInvySearch(prisma, deps);
    expect(await shown("is-4")).toHaveLength(2);
    const s = await prisma.invySearch.findUniqueOrThrow({ where: { id: "is-4" } });
    expect((s.messages as InvyMessage[]).at(-1)!.text).toContain("out of AI credits");
  });

  it("fails clearly when Google refuses, and when it isn't set up", async () => {
    await start("is-5", "Find cafes in Pune");
    const { PlacesError } = await import("../../src/invy/places");
    await runNextInvySearch(prisma, { ...deps, places: { search: async () => Promise.reject(new PlacesError("Google Maps refused the key.")) } });
    expect(await prisma.invySearch.findUniqueOrThrow({ where: { id: "is-5" } })).toMatchObject({ status: "FAILED", error: "Google Maps refused the key." });
    await start("is-6", "Find cafes in Pune");
    await runNextInvySearch(prisma, { ...deps, places: null });
    expect(await prisma.invySearch.findUniqueOrThrow({ where: { id: "is-6" } })).toMatchObject({ status: "FAILED" });
  });
});

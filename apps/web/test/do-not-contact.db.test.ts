/**
 * The do-not-contact list against a real database (only with TEST_DATABASE_URL — it is wiped).
 */
import { PrismaClient } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDnc, dncCsv, listDnc, removeDnc } from "../src/lib/do-not-contact";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const U = (s: string) => `https://www.linkedin.com/in/${s}/`;

d("do-not-contact list", () => {
  let prisma: PrismaClient;
  const WS = "ws-dnc";
  const OTHER = "ws-dnc-other";

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: { in: [WS, OTHER] } } });
    await prisma.workspace.createMany({ data: [{ id: WS, name: "D" }, { id: OTHER, name: "O" }] });
    for (const ws of [WS, OTHER]) {
      await prisma.linkedinAccount.create({ data: { id: `acc-${ws}`, workspaceId: ws, label: "a", proxyUrl: "", workingHours: {}, limits: {}, status: "ACTIVE" } });
      await prisma.leadList.create({ data: { id: `list-${ws}`, workspaceId: ws, name: "L" } });
      await prisma.campaign.create({ data: { id: `camp-${ws}`, workspaceId: ws, name: "C", listId: `list-${ws}`, status: "ACTIVE", steps: [], settings: {} } });
      await prisma.campaignLead.create({ data: { id: `cl-${ws}`, campaignId: `camp-${ws}`, workspaceId: ws, profileUrl: U("jane"), state: "WAITING_ACCEPT", accountId: `acc-${ws}` } });
      await prisma.emailCampaign.create({ data: { id: `ec-${ws}`, workspaceId: ws, name: "E", status: "ACTIVE", leads: { create: [{ workspaceId: ws, email: "a@acme.com", nextAt: new Date() }, { workspaceId: ws, email: "b@other.com", nextAt: new Date() }] } } });
    }
    await prisma.action.create({ data: { id: "dnc-act", accountId: `acc-${WS}`, type: "CHECK_CONNECTION", status: "QUEUED", targetUrl: U("jane"), scheduledAt: new Date(), campaignLeadId: `cl-${WS}` } });
    await prisma.campaignLead.update({ where: { id: `cl-${WS}` }, data: { actionId: "dnc-act" } });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: { in: [WS, OTHER] } } });
    await prisma.$disconnect();
  });

  it("adds entries of every kind and stops matching people in running campaigns (this workspace only)", async () => {
    const r = await addDnc(prisma, WS, "u1", "https://www.linkedin.com/in/jane\nacme.com\nAcme Inc\n!!\nacme.com", "Customers");
    expect(r).toMatchObject({ ok: true, value: { added: 3, alreadyThere: 0, unreadable: ["!!"], stopped: { linkedin: 1, email: 1 } } });
    expect(await prisma.campaignLead.findUniqueOrThrow({ where: { id: `cl-${WS}` } })).toMatchObject({ state: "SKIPPED", reason: "On your do-not-contact list", actionId: null });
    expect(await prisma.action.findUniqueOrThrow({ where: { id: "dnc-act" } })).toMatchObject({ status: "SKIPPED", error: "DO_NOT_CONTACT" });
    expect(await prisma.emailLead.findFirstOrThrow({ where: { workspaceId: WS, email: "a@acme.com" } })).toMatchObject({ status: "SKIPPED" });
    expect(await prisma.emailLead.findFirstOrThrow({ where: { workspaceId: WS, email: "b@other.com" } })).toMatchObject({ status: "ACTIVE" });
    // Another workspace's campaigns are untouched.
    expect(await prisma.campaignLead.findUniqueOrThrow({ where: { id: `cl-${OTHER}` } })).toMatchObject({ state: "WAITING_ACCEPT" });
    expect(await prisma.emailLead.findFirstOrThrow({ where: { workspaceId: OTHER, email: "a@acme.com" } })).toMatchObject({ status: "ACTIVE" });

    expect(await addDnc(prisma, WS, "u1", "ACME.com")).toMatchObject({ ok: true, value: { added: 0, alreadyThere: 1 } });
    expect(await addDnc(prisma, WS, "u1", "!!")).toMatchObject({ ok: false });
  });

  it("lists, filters, exports and removes (only its own entries)", async () => {
    const all = await listDnc(prisma, WS);
    expect(all.total).toBe(3);
    expect(all.byKind).toEqual({ LINKEDIN: 1, DOMAIN: 1, COMPANY: 1 });
    expect((await listDnc(prisma, WS, { kind: "DOMAIN" })).rows.map((r) => r.label)).toEqual(["acme.com"]);
    expect((await listDnc(prisma, WS, { q: "jane" })).total).toBe(1);
    expect(await dncCsv(prisma, WS)).toMatch(/^type,entry,note,added\nlinkedin,https:\/\/www\.linkedin\.com\/in\/jane,Customers,/);
    expect(await removeDnc(prisma, OTHER, all.rows.map((r) => r.id))).toEqual({ ok: true, value: 0 });
    expect(await removeDnc(prisma, WS, all.rows.map((r) => r.id))).toEqual({ ok: true, value: 3 });
  });
});

/** Public unsubscribe (only with TEST_DATABASE_URL). */
import { PrismaClient, unsubscribeToken } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { routeRequest } from "../src/lib/routing";
import { unsubscribeByToken, unsubscribeInfo } from "../src/lib/unsubscribe";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

describe("unsubscribe pages are public", () => {
  it("on every host, without signing in", () => {
    const cfg = { root: "invytra.com", protocol: "https:" as const };
    for (const host of ["invytra.com", "app.invytra.com", "email.invytra.com", "localhost:3000"]) {
      expect(routeRequest({ host, pathname: "/unsubscribe/abc.def", search: "", hasSession: false }, cfg as never)).toEqual({ type: "next" });
    }
  });
});

d("unsubscribe", () => {
  let prisma: PrismaClient;
  const WS = "ws-unsub";
  let leadId = "";
  let otherLead = "";
  beforeAll(async () => {
    process.env.SESSION_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.workspace.create({ data: { id: WS, name: "U" } });
    await prisma.emailAccount.create({ data: { id: "unsub-box", workspaceId: WS, email: "tom@trycrawlers.pro", fromName: "Tom", provider: "OTHER", smtpHost: "s", smtpPort: 465, smtpSecure: true, imapHost: "i", imapPort: 993, username: "t", secret: "x" } });
    const contact = await prisma.emailContact.create({ data: { workspaceId: WS, email: "priya@acme.io" } });
    const c1 = await prisma.emailCampaign.create({ data: { workspaceId: WS, name: "One", status: "ACTIVE" } });
    const c2 = await prisma.emailCampaign.create({ data: { workspaceId: WS, name: "Two", status: "ACTIVE" } });
    leadId = (await prisma.emailLead.create({ data: { workspaceId: WS, campaignId: c1.id, email: "priya@acme.io", contactId: contact.id, emailAccountId: "unsub-box", nextAt: new Date() } })).id;
    otherLead = (await prisma.emailLead.create({ data: { workspaceId: WS, campaignId: c2.id, email: "priya@acme.io", nextAt: new Date() } })).id;
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.$disconnect();
  });

  it("shows who the link is for, refuses forged links, and unsubscribes everywhere", async () => {
    const token = unsubscribeToken(leadId, process.env.SESSION_ENCRYPTION_KEY!);
    expect(await unsubscribeInfo(prisma, token)).toEqual({ email: "priya@acme.io", sender: "Tom (trycrawlers.pro)", done: false });
    expect(await unsubscribeInfo(prisma, token.replace(/.$/, (c) => (c === "A" ? "B" : "A")))).toBeNull();
    expect(await unsubscribeByToken(prisma, `${otherLead}.forged`, "x")).toBe(false);
    expect(await unsubscribeByToken(prisma, token, "Clicked the unsubscribe link")).toBe(true);
    expect(await prisma.emailLead.findMany({ where: { workspaceId: WS }, select: { status: true, nextAt: true } })).toEqual([
      { status: "UNSUBSCRIBED", nextAt: null },
      { status: "UNSUBSCRIBED", nextAt: null },
    ]);
    expect(await prisma.emailContact.findFirstOrThrow({ where: { workspaceId: WS } })).toMatchObject({ subscribed: false });
    expect(await prisma.emailSuppression.findFirstOrThrow({ where: { workspaceId: WS } })).toMatchObject({ reason: "UNSUBSCRIBED", detail: "Clicked the unsubscribe link (campaign “One”)" });
    expect((await unsubscribeInfo(prisma, token))!.done).toBe(true);
    // Repeating is harmless.
    expect(await unsubscribeByToken(prisma, token, "One-click unsubscribe")).toBe(true);
  });
});

/**
 * The WhatsApp campaign report email (only with TEST_DATABASE_URL): 3 hours after a campaign
 * starts, owners and the campaign's maker get its numbers, once.
 */
import { PrismaClient, type PlatformEmail } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { whatsappCampaignReports } from "../../src/whatsapp/reports";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const WS = "ws-wa-report";
const env = { WEB_ORIGIN: "https://app.invytra.com", ROOT_DOMAIN: "invytra.com" };

d("WhatsApp campaign report", () => {
  let prisma: PrismaClient;
  const mails: PlatformEmail[] = [];
  const send = async (m: PlatformEmail) => void mails.push(m);
  const t0 = new Date("2026-11-15T10:00:00Z");

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.user.deleteMany({ where: { email: { in: ["owner@report.test", "maker@report.test"] } } });
    await prisma.workspace.create({ data: { id: WS, name: "Acme" } });
    const owner = await prisma.user.create({ data: { email: "owner@report.test", name: "Sara Khan", passwordHash: "x" } });
    const maker = await prisma.user.create({ data: { email: "maker@report.test", name: "Omar", passwordHash: "x" } });
    await prisma.membership.createMany({ data: [{ userId: owner.id, workspaceId: WS, role: "OWNER" }, { userId: maker.id, workspaceId: WS, role: "MEMBER" }] });
    const c = await prisma.whatsappCampaign.create({
      data: { id: "camp-report", workspaceId: WS, name: "Diwali", templateName: "t", language: "en", components: [], varMap: {}, status: "SENDING", startedAt: t0, createdBy: maker.id },
    });
    const at = new Date(t0.getTime() + 60_000);
    await prisma.whatsappMessage.createMany({
      data: [
        { workspaceId: WS, campaignId: c.id, phone: "1", status: "READ", sentAt: at, deliveredAt: at, readAt: at, repliedAt: at },
        { workspaceId: WS, campaignId: c.id, phone: "2", status: "DELIVERED", sentAt: at, deliveredAt: at },
        { workspaceId: WS, campaignId: c.id, phone: "3", status: "FAILED", sentAt: at, failedAt: at },
        { workspaceId: WS, campaignId: c.id, phone: "4", status: "QUEUED" },
      ],
    });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.user.deleteMany({ where: { email: { in: ["owner@report.test", "maker@report.test"] } } });
    await prisma.$disconnect();
  });

  it("waits 3 hours, then emails the owner and the maker once", async () => {
    expect(await whatsappCampaignReports({ prisma, send, now: new Date(t0.getTime() + 2 * 3_600_000), env })).toBe(0);
    expect(await whatsappCampaignReports({ prisma, send, now: new Date(t0.getTime() + 3 * 3_600_000 + 60_000), env })).toBe(2);
    expect(mails.map((m) => m.to).sort()).toEqual(["maker@report.test", "owner@report.test"]);
    const m = mails.find((x) => x.to === "owner@report.test")!;
    expect(m.subject).toBe('Your WhatsApp campaign "Diwali": 33% read, 1 reply');
    expect(m.text).toContain("3 sent, 67% delivered, 33% read and 33% replied.");
    expect(m.text).toContain("1 person is waiting");
    expect(m.text).toContain("1 couldn't be delivered");
    expect(m.html).toContain("https://whatsapp.invytra.com/whatsapp/campaigns/camp-report");
    // And in the bell, for the same two people.
    const bell = await prisma.notification.findMany({ where: { kind: "CAMPAIGN", href: "/whatsapp/campaigns/camp-report" } });
    expect(bell).toHaveLength(2);
    expect(bell[0]!.title).toBe("Diwali after 3 hours: 67% delivered, 33% read, 1 reply");
    expect(await whatsappCampaignReports({ prisma, send, now: new Date(t0.getTime() + 5 * 3_600_000), env })).toBe(0);
    expect(mails).toHaveLength(2);
  });
});

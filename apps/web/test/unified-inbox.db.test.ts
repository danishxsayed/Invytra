/**
 * The workspace inbox against a real database (only with TEST_DATABASE_URL — it is wiped):
 * LinkedIn and email conversations in one list, filters, search, meetings.
 */
import { PrismaClient } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { numbersBetween } from "../src/lib/overview";
import { parseKey, setEmailMeeting, unifiedList, unifiedNeedsCount } from "../src/lib/unified-inbox";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const H = 3_600_000;

d("unified inbox", () => {
  let prisma: PrismaClient;
  const WS = "ws-uni";
  const both = ["linkedin", "email"];
  const now = Date.now();

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.workspace.create({ data: { id: WS, name: "U", channels: both } });
    await prisma.linkedinAccount.create({ data: { id: "uni-a", workspaceId: WS, label: "Main", proxyUrl: "", workingHours: {}, limits: {}, status: "ACTIVE" } });
    await prisma.conversation.createMany({
      data: [
        { id: "uni-c1", accountId: "uni-a", participantName: "Lina Park", lastMessageText: "Sounds good, let's talk", lastFromMe: false, lastMessageAt: new Date(now - 1 * H), unread: true },
        { id: "uni-c2", accountId: "uni-a", participantName: "Omar Ali", lastMessageText: "Thanks!", lastFromMe: true, lastMessageAt: new Date(now - 5 * H) },
      ],
    });
    await prisma.emailAccount.create({ data: { id: "uni-m", workspaceId: WS, email: "me@uni.co", fromName: "Me", provider: "OTHER", smtpHost: "s", smtpPort: 465, smtpSecure: true, imapHost: "i", imapPort: 993, username: "me@uni.co", secret: "x" } });
    await prisma.emailCampaign.create({ data: { id: "uni-ec", workspaceId: WS, name: "Q4 email", status: "ACTIVE" } });
    await prisma.emailLead.create({ data: { id: "uni-l1", workspaceId: WS, campaignId: "uni-ec", email: "sara@acme.io", firstName: "Sara", company: "Acme", emailAccountId: "uni-m", status: "REPLIED", repliedAt: new Date(now - 2 * H) } });
    await prisma.emailReply.create({ data: { workspaceId: WS, emailAccountId: "uni-m", emailLeadId: "uni-l1", kind: "REPLY", fromEmail: "sara@acme.io", subject: "Re: Hi", text: "Interested, send details", receivedAt: new Date(now - 2 * H) } });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.$disconnect();
  });

  it("lists both channels newest first, with needs-reply, channel and search filters", async () => {
    const needs = await unifiedList(prisma, WS, both);
    expect(needs.map((r) => [r.key, r.channel, r.name])).toEqual([
      ["li:uni-c1", "linkedin", "Lina Park"],
      ["em:uni-l1", "email", "Sara"],
    ]);
    expect(needs[1]).toMatchObject({ company: "Acme", campaign: "Q4 email", via: "me@uni.co", needsReply: true, unread: true });
    expect((await unifiedList(prisma, WS, both, { filter: "all" })).map((r) => r.key)).toEqual(["li:uni-c1", "em:uni-l1", "li:uni-c2"]);
    expect((await unifiedList(prisma, WS, both, { filter: "done" })).map((r) => r.key)).toEqual(["li:uni-c2"]);
    expect((await unifiedList(prisma, WS, both, { channel: "email" })).map((r) => r.key)).toEqual(["em:uni-l1"]);
    expect((await unifiedList(prisma, WS, both, { filter: "all", q: "acme" })).map((r) => r.key)).toEqual(["em:uni-l1"]);
    // A workspace without Email sees only LinkedIn.
    expect((await unifiedList(prisma, WS, ["linkedin"])).map((r) => r.channel)).toEqual(["linkedin"]);
    expect(await unifiedNeedsCount(prisma, WS, both)).toBe(2);
  });

  it("marks a meeting booked on an email conversation (counted on the overview)", async () => {
    expect(await setEmailMeeting(prisma, "someone-else", "uni-l1", true)).toBe(false);
    expect(await setEmailMeeting(prisma, WS, "uni-l1", true)).toBe(true);
    expect((await unifiedList(prisma, WS, both, { channel: "email" }))[0]!.meeting).toBe(true);
    expect((await numbersBetween(prisma, WS, new Date(now - H), new Date(Date.now() + H))).meetings).toBe(1);
    await setEmailMeeting(prisma, WS, "uni-l1", false);
    expect((await numbersBetween(prisma, WS, new Date(now - H), new Date(Date.now() + H))).meetings).toBe(0);
  });

  it("reads conversation keys strictly", () => {
    expect(parseKey("li:abc123")).toEqual({ channel: "linkedin", id: "abc123" });
    expect(parseKey("em:x_1")).toEqual({ channel: "email", id: "x_1" });
    expect(parseKey("wa:1")).toBeNull();
    expect(parseKey("li:a b")).toBeNull();
  });
});

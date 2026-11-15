import { appLink, noticeEmail, sendNotices, waCampaignStats, workspaceOwners, type PlatformEmail, type PlatformMailer, type PrismaClient } from "@invytra/db";

/*
 * The campaign report: 3 hours after a WhatsApp campaign starts sending, its owners (and the
 * teammate who made it) get its numbers by email: sent, delivered, read, replied, failed.
 * Sent once per campaign (report_sent_at). Run every minute by the worker with the campaigns.
 */

export const REPORT_AFTER_MS = 3 * 3_600_000;
/** Campaigns that started longer ago than this are marked, not emailed (e.g. right after this shipped). */
const TOO_OLD_MS = 2 * 86_400_000;

const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "0%");
const num = (n: number) => n.toLocaleString("en-US");

export async function whatsappCampaignReports(d: { prisma: PrismaClient; send: PlatformMailer | null; now?: Date; env?: Record<string, string | undefined> }): Promise<number> {
  const { prisma } = d;
  const now = d.now ?? new Date();
  const due = await prisma.whatsappCampaign.findMany({
    where: { reportSentAt: null, startedAt: { lte: new Date(now.getTime() - REPORT_AFTER_MS) }, status: { in: ["SENDING", "PAUSED", "DONE"] } },
    take: 20,
  });
  let sent = 0;
  for (const c of due) {
    // Claim it first so two workers never send the same report.
    const claimed = await prisma.whatsappCampaign.updateMany({ where: { id: c.id, reportSentAt: null }, data: { reportSentAt: now } });
    if (!claimed.count || !d.send || now.getTime() - c.startedAt!.getTime() > TOO_OLD_MS) continue;
    const s = (await waCampaignStats(prisma, [c.id])).get(c.id);
    if (!s || !s.sent) continue;
    const people = await workspaceOwners(prisma, c.workspaceId);
    if (c.createdBy) {
      const u = await prisma.user.findFirst({ where: { id: c.createdBy, memberships: { some: { workspaceId: c.workspaceId } } }, select: { email: true, name: true } });
      if (u && !people.some((p) => p.email === u.email)) people.push({ email: u.email, first: u.name.trim().split(/\s+/)[0] || "there" });
    }
    const state =
      c.status === "DONE"
        ? `It has finished: every recipient has been sent the message.`
        : c.status === "PAUSED"
          ? `It's paused${c.note ? `: ${c.note}` : "."}`
          : `It's still sending: ${num(s.queued)} ${s.queued === 1 ? "person is" : "people are"} waiting, within your number's daily limit.`;
    const mails: PlatformEmail[] = people.map((p) =>
      noticeEmail(
        {
          to: p.email,
          first: p.first,
          subject: `Your WhatsApp campaign "${c.name}": ${pct(s.read, s.sent)} read, ${num(s.replied)} ${s.replied === 1 ? "reply" : "replies"}`,
          title: `"${c.name}" after its first 3 hours`,
          lines: [
            `${num(s.sent)} sent, ${pct(s.delivered, s.sent)} delivered, ${pct(s.read, s.sent)} read and ${pct(s.replied, s.sent)} replied.`,
            state,
            ...(s.failed ? [`${num(s.failed)} couldn't be delivered (for example the number isn't on WhatsApp). See who on the campaign page.`] : []),
          ],
          stats: [
            ["Sent", num(s.sent)],
            ["Delivered", num(s.delivered)],
            ["Read", num(s.read)],
            ["Replied", num(s.replied)],
          ],
          button: { label: "See the campaign", href: appLink("whatsapp", `/whatsapp/campaigns/${c.id}`, d.env) },
          why: "You're getting this because you own this Invytra workspace or made this campaign.",
        },
        d.env,
      ),
    );
    sent += await sendNotices(d.send, mails, "WhatsApp campaign report");
  }
  return sent;
}

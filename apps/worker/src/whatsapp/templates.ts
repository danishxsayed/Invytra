import { MetaClient, openSecret, templateNotices, type MetaApp, type PlatformEmail, type PrismaClient } from "@invytra/db";

/*
 * Templates in review: every few minutes, ask Meta for the latest status of each account
 * that has one, so an approval or rejection shows (and is emailed) even if Meta's template
 * webhook isn't subscribed or a delivery was missed. The webhook stays the fast path.
 */

export interface TemplateCheckDeps {
  prisma: PrismaClient;
  key: string;
  app: MetaApp | null;
  fetch?: typeof fetch;
  /** Gets the emails to send (owners of each workspace). */
  notify: (mails: PlatformEmail[]) => Promise<unknown>;
}

const IN_REVIEW = ["PENDING", "IN_APPEAL", "PENDING_DELETION"];

export async function checkTemplatesInReview(d: TemplateCheckDeps): Promise<{ checked: number; changed: number }> {
  if (!d.app) return { checked: 0, changed: 0 };
  const waiting = await d.prisma.whatsappTemplate.findMany({ where: { status: { in: IN_REVIEW } }, select: { id: true, workspaceId: true, wabaId: true, metaId: true, name: true, language: true, status: true } });
  const accounts = [...new Set(waiting.map((t) => `${t.workspaceId}|${t.wabaId}`))];
  let changed = 0;
  for (const acc of accounts) {
    const [workspaceId, wabaId] = acc.split("|") as [string, string];
    const number = await d.prisma.whatsappNumber.findFirst({ where: { workspaceId, wabaId } });
    if (!number || number.status === "DISCONNECTED") continue;
    let list;
    try {
      list = await new MetaClient(d.app, openSecret(number.accessToken, d.key), d.fetch).templates(wabaId);
    } catch {
      continue; // try again next round
    }
    for (const t of waiting.filter((x) => x.workspaceId === workspaceId && x.wabaId === wabaId)) {
      const m = list.find((x) => (t.metaId && x.id === t.metaId) || (x.name === t.name && x.language === t.language));
      const status = m?.status?.toUpperCase();
      if (!m || !status || status === t.status) continue;
      const reason = m.rejected_reason && m.rejected_reason !== "NONE" ? m.rejected_reason : null;
      // Only if nothing (e.g. the webhook) changed it meanwhile.
      const r = await d.prisma.whatsappTemplate.updateMany({
        where: { id: t.id, status: t.status },
        data: { status, rejectedReason: reason, category: m.category, metaId: m.id, quality: m.quality_score?.score ?? null },
      });
      if (!r.count) continue;
      changed++;
      await d.notify(await templateNotices(d.prisma, t, status, reason));
    }
  }
  return { checked: waiting.length, changed };
}

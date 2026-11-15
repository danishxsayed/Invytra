import { MetaClient, MetaError, openSecret, type MetaApp, type PrismaClient } from "@invytra/db";
import { canSend, previewBody, readMetaComponents, sendComponents, templateNeeds, waDailyLimit, waSendError, type WaSlot, type WaVarSource } from "@invytra/shared";

/*
 * WhatsApp campaign engine, run every minute by the worker. A scheduled campaign that's due
 * gets its recipients (subscribed contacts with its tags, never anyone on the do-not-contact
 * list), then sends in batches through the workspace's number on Meta's Cloud API, never
 * past the number's 24-hour limit of new people. Meta's webhook then reports delivered,
 * read and failed (lib/whatsapp-webhook.ts in the web app).
 */

export interface WaTickDeps {
  prisma: PrismaClient;
  key: string;
  app: MetaApp | null;
  fetch?: typeof fetch;
  now?: Date;
  /** Messages sent per campaign per tick. */
  batch?: number;
}

export interface WaTickResult {
  started: number;
  sent: number;
  failed: number;
  skipped: number;
  completed: number;
  paused: number;
}

const DAY = 86_400_000;
const STOP_ALL = new Set([190, 10, 200]); // the connection to the number is gone
const SLOW_DOWN = new Set([4, 80007, 130429, 131056]); // rate limits: try next minute
const TEMPLATE_BROKEN = new Set([132001, 132015, 132016, 132000]);

/** The campaign's recipients: subscribed contacts with its tags, minus the do-not-contact list. */
export async function addRecipients(prisma: PrismaClient, c: { id: string; workspaceId: string; tags: string[] }) {
  const contacts = await prisma.whatsappContact.findMany({
    where: { workspaceId: c.workspaceId, optedOutAt: null, consentSource: { not: null }, ...(c.tags.length && { tags: { hasSome: c.tags } }) },
    select: { id: true, phone: true },
  });
  const blocked = new Set(
    (await prisma.doNotContact.findMany({ where: { workspaceId: c.workspaceId, kind: "PHONE", value: { in: contacts.map((x) => x.phone) } }, select: { value: true } })).map((r) => r.value),
  );
  const ok = contacts.filter((x) => !blocked.has(x.phone));
  for (let i = 0; i < ok.length; i += 1000)
    await prisma.whatsappMessage.createMany({ data: ok.slice(i, i + 1000).map((x) => ({ workspaceId: c.workspaceId, campaignId: c.id, contactId: x.id, phone: x.phone })), skipDuplicates: true });
  return ok.length;
}

const pause = (prisma: PrismaClient, id: string, note: string) => prisma.whatsappCampaign.update({ where: { id }, data: { status: "PAUSED", note } });

export async function whatsappCampaignTick(d: WaTickDeps): Promise<WaTickResult> {
  const { prisma } = d;
  const now = d.now ?? new Date();
  const out: WaTickResult = { started: 0, sent: 0, failed: 0, skipped: 0, completed: 0, paused: 0 };

  for (const c of await prisma.whatsappCampaign.findMany({ where: { status: "SCHEDULED", scheduledAt: { lte: now } }, take: 20 })) {
    await addRecipients(prisma, c);
    await prisma.whatsappCampaign.update({ where: { id: c.id }, data: { status: "SENDING", startedAt: now, note: null } });
    out.started++;
  }

  for (const c of await prisma.whatsappCampaign.findMany({ where: { status: "SENDING" }, orderBy: { startedAt: "asc" }, take: 50 })) {
    const sub = await prisma.subscription.findUnique({ where: { workspaceId: c.workspaceId } });
    if (sub && !canSend(sub, now)) {
      await pause(prisma, c.id, "Paused: the plan has ended. Choose a plan to send again.");
      out.paused++;
      continue;
    }
    const number = await prisma.whatsappNumber.findFirst({ where: { workspaceId: c.workspaceId } });
    if (!number || number.status !== "CONNECTED" || !d.app) {
      await pause(prisma, c.id, !d.app ? "Paused: WhatsApp isn't set up on the server." : "Paused: the WhatsApp number isn't connected. Check it on the Number page.");
      out.paused++;
      continue;
    }
    const queued = await prisma.whatsappMessage.count({ where: { campaignId: c.id, status: "QUEUED" } });
    if (!queued) {
      await prisma.whatsappCampaign.update({ where: { id: c.id }, data: { status: "DONE", finishedAt: now } });
      out.completed++;
      continue;
    }
    // Meta's limit counts new people per 24 hours on this number.
    const limit = waDailyLimit(number.messagingTier) ?? Infinity;
    const used = (await prisma.whatsappMessage.findMany({ where: { workspaceId: c.workspaceId, direction: "OUT", sentAt: { gt: new Date(now.getTime() - DAY) } }, distinct: ["phone"], select: { phone: true } })).length;
    const room = Math.max(0, Math.min(d.batch ?? 50, limit - used));
    if (!room) continue;

    const meta = new MetaClient(d.app, openSecret(number.accessToken, d.key), d.fetch);
    const needs = templateNeeds(c.components);
    const map = (c.varMap ?? {}) as Partial<Record<WaSlot, WaVarSource>>;
    const body = readMetaComponents(c.components).body;
    const batch = await prisma.whatsappMessage.findMany({ where: { campaignId: c.id, status: "QUEUED" }, orderBy: { createdAt: "asc" }, take: room, include: { contact: true } });
    for (const m of batch) {
      const contact = m.contact;
      if (!contact || contact.optedOutAt) {
        await prisma.whatsappMessage.update({ where: { id: m.id }, data: { status: "SKIPPED", error: contact ? "Opted out before it was sent" : "Contact was deleted" } });
        out.skipped++;
        continue;
      }
      try {
        const wamid = await meta.sendTemplate(number.phoneNumberId, m.phone, { name: c.templateName, language: c.language, components: sendComponents(needs, map, contact, c.mediaUrl ?? "") });
        await prisma.whatsappMessage.update({ where: { id: m.id }, data: { status: "SENT", wamid, sentAt: new Date(), body: previewBody(body, map, contact) } });
        out.sent++;
      } catch (e) {
        const code = e instanceof MetaError ? e.code : undefined;
        if (code !== undefined && STOP_ALL.has(code)) {
          await prisma.whatsappNumber.update({ where: { id: number.id }, data: { status: "ERROR", lastError: (e as MetaError).message } });
          await pause(prisma, c.id, `Paused: ${(e as MetaError).message}`);
          out.paused++;
          break;
        }
        if (code !== undefined && SLOW_DOWN.has(code)) break;
        if (code !== undefined && TEMPLATE_BROKEN.has(code)) {
          await pause(prisma, c.id, `Paused: ${waSendError(code, "Meta refused the template")}. Check it on the Templates page.`);
          out.paused++;
          break;
        }
        await prisma.whatsappMessage.update({ where: { id: m.id }, data: { status: "FAILED", failedAt: new Date(), error: waSendError(code, e instanceof MetaError ? (e.raw ?? e.message) : "Couldn't send") } });
        out.failed++;
      }
    }
  }
  return out;
}

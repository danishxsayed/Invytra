import { segmentWhere, waCampaignStats, type Prisma, type PrismaClient, type WaCampaignStats } from "@invytra/db";
import { WA_FIELDS, checkSources, templateNeeds, waTag, type WaSlot, type WaVarSource } from "@invytra/shared";
import { z } from "zod";
import type { Result } from "./accounts";
import { sendingProblem } from "./subscriptions";

/*
 * WhatsApp campaigns in the web app: creating one (an approved template, who gets it by tag,
 * what fills each variable, when), the list with results, one campaign's numbers and
 * recipients, and pausing / resuming / cancelling. The worker sends (apps/worker/src/whatsapp).
 * Every query is scoped to the workspace (CLAUDE.md rule 0).
 */

const sourceSchema: z.ZodType<WaVarSource> = z.union([
  z.object({ kind: z.literal("field"), field: z.enum(Object.keys(WA_FIELDS) as [keyof typeof WA_FIELDS, ...(keyof typeof WA_FIELDS)[]]), fallback: z.string().max(200) }),
  z.object({ kind: z.literal("custom"), key: z.string().min(1).max(60), fallback: z.string().max(200) }),
  z.object({ kind: z.literal("text"), value: z.string().max(900) }),
]);

const createSchema = z.object({
  name: z.string().trim().min(1, "Name the campaign.").max(120),
  templateId: z.string().min(1, "Choose a template."),
  tags: z.array(z.string().max(40)).max(50).default([]),
  /** Send to a segment's contacts instead of tags */
  segmentId: z.string().max(40).default(""),
  varMap: z.record(z.string(), sourceSchema).default({}),
  mediaUrl: z.string().trim().max(1000).default(""),
  /** ISO time, or empty for "send now" */
  sendAt: z.string().max(40).default(""),
});

/** Subscribed contacts with any of these tags (all subscribed when no tags), minus the do-not-contact list. */
export async function audienceCount(prisma: PrismaClient, workspaceId: string, tagsIn: string[], segmentId = "", now = new Date()) {
  const tags = tagsIn.map(waTag).filter(Boolean);
  let target: Prisma.WhatsappContactWhereInput = tags.length ? { tags: { hasSome: tags } } : {};
  if (segmentId) {
    const seg = await prisma.whatsappSegment.findFirst({ where: { id: segmentId, workspaceId } });
    if (!seg) return { count: 0, sample: null };
    target = segmentWhere(seg, now);
  }
  const blocked = (await prisma.doNotContact.findMany({ where: { workspaceId, kind: "PHONE" }, select: { value: true } })).map((d) => d.value);
  const where: Prisma.WhatsappContactWhereInput = { workspaceId, optedOutAt: null, consentSource: { not: null }, AND: [target, blocked.length ? { phone: { notIn: blocked } } : {}] };
  const [count, sample] = await Promise.all([
    prisma.whatsappContact.count({ where }),
    prisma.whatsappContact.findFirst({ where, orderBy: [{ firstName: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }], select: { phone: true, firstName: true, lastName: true, profileName: true, company: true, email: true, vars: true } }),
  ]);
  return { count, sample };
}

export async function createWaCampaign(prisma: PrismaClient, workspaceId: string, by: string, input: unknown, now = new Date()): Promise<Result<{ id: string }>> {
  const p = createSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]!.message };
  const problem = await sendingProblem(prisma, workspaceId, now);
  if (problem) return { ok: false, error: problem };
  const number = await prisma.whatsappNumber.findFirst({ where: { workspaceId }, select: { status: true } });
  if (!number) return { ok: false, error: "Connect a WhatsApp number first." };
  if (number.status !== "CONNECTED") return { ok: false, error: "Your WhatsApp number needs attention. Check it on the Number page first." };
  const t = await prisma.whatsappTemplate.findFirst({ where: { id: p.data.templateId, workspaceId } });
  if (!t) return { ok: false, error: "That template isn't in your account any more." };
  if (t.status !== "APPROVED") return { ok: false, error: "Only an approved template can be sent. This one is still in review or was rejected." };
  const needs = templateNeeds(t.components);
  const map = Object.fromEntries(needs.slots.map((s) => [s.slot, p.data.varMap[s.slot]]).filter((e) => e[1])) as Partial<Record<WaSlot, WaVarSource>>;
  const errs = checkSources(needs, map, p.data.mediaUrl);
  if (errs.length) return { ok: false, error: errs[0]! };
  const segmentId = p.data.segmentId || null;
  const tags = segmentId ? [] : [...new Set(p.data.tags.map(waTag).filter(Boolean))];
  const { count } = await audienceCount(prisma, workspaceId, tags, segmentId ?? "", now);
  if (!count) return { ok: false, error: segmentId ? "Nobody opted in is in this segment right now." : tags.length ? "No subscribed contacts have these tags." : "You have no subscribed contacts yet. Import some first." };
  let at = now;
  if (p.data.sendAt) {
    const d = new Date(p.data.sendAt);
    if (Number.isNaN(d.getTime())) return { ok: false, error: "Choose a valid date and time." };
    if (d.getTime() > now.getTime() + 60 * 86_400_000) return { ok: false, error: "Schedule it within the next 60 days." };
    at = d < now ? now : d;
  }
  const c = await prisma.whatsappCampaign.create({
    data: {
      workspaceId,
      name: p.data.name,
      templateId: t.id,
      templateName: t.name,
      language: t.language,
      components: t.components as object,
      tags,
      segmentId,
      varMap: map as object,
      mediaUrl: needs.media ? p.data.mediaUrl : null,
      status: "SCHEDULED",
      scheduledAt: at,
      createdBy: by,
    },
  });
  return { ok: true, value: { id: c.id } };
}

export type { WaCampaignStats };

/** Results per campaign: sent counts everything that left (delivered and read included). */
const statsFor = waCampaignStats;
const EMPTY: WaCampaignStats = { total: 0, queued: 0, sent: 0, delivered: 0, read: 0, replied: 0, failed: 0, skipped: 0 };

export async function listWaCampaigns(prisma: PrismaClient, workspaceId: string) {
  const list = await prisma.whatsappCampaign.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, take: 100 });
  const stats = await statsFor(prisma, list.map((c) => c.id));
  const segs = new Map((await prisma.whatsappSegment.findMany({ where: { workspaceId }, select: { id: true, name: true } })).map((x) => [x.id, x.name]));
  return list.map((c) => ({ ...c, segmentName: c.segmentId ? (segs.get(c.segmentId) ?? "a deleted segment") : null, stats: stats.get(c.id) ?? EMPTY }));
}

export async function getWaCampaign(prisma: PrismaClient, workspaceId: string, id: string) {
  const c = await prisma.whatsappCampaign.findFirst({ where: { id, workspaceId } });
  if (!c) return null;
  const seg = c.segmentId ? await prisma.whatsappSegment.findFirst({ where: { id: c.segmentId, workspaceId }, select: { name: true } }) : null;
  return { ...c, segmentName: c.segmentId ? (seg?.name ?? "a deleted segment") : null, stats: (await statsFor(prisma, [c.id])).get(c.id) ?? EMPTY };
}

export const RECIPIENT_FILTERS = { all: "All", replied: "Replied", read: "Read", delivered: "Delivered", sent: "Sent", failed: "Failed", queued: "Waiting" } as const;
export type RecipientFilter = keyof typeof RECIPIENT_FILTERS;

export async function listRecipients(prisma: PrismaClient, workspaceId: string, campaignId: string, filter: RecipientFilter, page = 1) {
  const f =
    filter === "replied"
      ? { repliedAt: { not: null } }
      : filter === "read"
        ? { readAt: { not: null } }
        : filter === "delivered"
          ? { status: "DELIVERED" }
          : filter === "sent"
            ? { status: "SENT" }
            : filter === "failed"
              ? { status: { in: ["FAILED", "SKIPPED"] } }
              : filter === "queued"
                ? { status: "QUEUED" }
                : {};
  const where = { workspaceId, campaignId, ...f };
  const [total, rows] = await Promise.all([
    prisma.whatsappMessage.count({ where }),
    prisma.whatsappMessage.findMany({ where, orderBy: [{ sentAt: { sort: "desc", nulls: "last" } }, { createdAt: "asc" }], skip: (page - 1) * 50, take: 50, include: { contact: { select: { firstName: true, lastName: true, profileName: true, company: true } } } }),
  ]);
  return { total, rows, pages: Math.max(1, Math.ceil(total / 50)) };
}

/** Pause, resume or cancel (cancelling drops the messages not sent yet). */
export async function changeWaCampaign(prisma: PrismaClient, workspaceId: string, id: string, to: "pause" | "resume" | "cancel", now = new Date()): Promise<Result> {
  const c = await prisma.whatsappCampaign.findFirst({ where: { id, workspaceId } });
  if (!c) return { ok: false, error: "That campaign is gone." };
  if (to === "pause") {
    if (!["SENDING", "SCHEDULED"].includes(c.status)) return { ok: false, error: "Only a sending or scheduled campaign can be paused." };
    await prisma.whatsappCampaign.update({ where: { id }, data: { status: "PAUSED", note: c.startedAt ? null : "Paused before it started." } });
  } else if (to === "resume") {
    if (c.status !== "PAUSED") return { ok: false, error: "Only a paused campaign can be resumed." };
    const problem = await sendingProblem(prisma, workspaceId, now);
    if (problem) return { ok: false, error: problem };
    await prisma.whatsappCampaign.update({ where: { id }, data: c.startedAt ? { status: "SENDING", note: null } : { status: "SCHEDULED", scheduledAt: now, note: null } });
  } else {
    if (["DONE", "CANCELLED"].includes(c.status)) return { ok: false, error: "It has already ended." };
    await prisma.$transaction([
      prisma.whatsappMessage.deleteMany({ where: { campaignId: id, status: "QUEUED" } }),
      prisma.whatsappCampaign.update({ where: { id }, data: { status: "CANCELLED", finishedAt: now } }),
    ]);
  }
  return { ok: true, value: undefined };
}

import { segmentWhere, type PrismaClient } from "@invytra/db";
import { WA_CONSENT, phoneKey, prettyPhone, splitName, waTag, type WaConsentSource } from "@invytra/shared";
import { z } from "zod";
import type { Result } from "./accounts";

/*
 * One WhatsApp contact: the side panel (details, consent on file, segments it is in, what
 * happened with it) and editing it. Scoped to the workspace (CLAUDE.md rule 0).
 */

export interface WaActivity {
  kind: "added" | "sent" | "delivered" | "read" | "failed" | "replied" | "wrote" | "opted_out";
  text: string;
  at: string;
}

export interface WaContactDetail {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  phone: string;
  phonePretty: string;
  email: string | null;
  userId: string | null;
  company: string | null;
  location: string | null;
  tags: string[];
  vars: Record<string, string>;
  lastActive: string | null;
  wa: string | null;
  consent: { given: boolean; source: string | null; date: string | null; proof: string | null };
  optedOut: { at: string; reason: string | null } | null;
  segments: { id: string; name: string; color: string }[];
  activity: WaActivity[];
}

export async function getWaContactDetail(prisma: PrismaClient, workspaceId: string, id: string, now = new Date()): Promise<WaContactDetail | null> {
  const c = await prisma.whatsappContact.findFirst({ where: { id, workspaceId } });
  if (!c) return null;
  const [segs, msgs] = await Promise.all([
    prisma.whatsappSegment.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } }),
    prisma.whatsappMessage.findMany({ where: { workspaceId, contactId: c.id }, orderBy: { createdAt: "desc" }, take: 30, include: { campaign: { select: { name: true } } } }),
  ]);
  const inSeg = await Promise.all(segs.map((s) => prisma.whatsappContact.count({ where: { id: c.id, workspaceId, ...segmentWhere(s, now) } })));
  const activity: (WaActivity & { t: number })[] = [];
  const push = (kind: WaActivity["kind"], text: string, at: Date | null) => at && activity.push({ kind, text, at: at.toISOString(), t: at.getTime() });
  for (const m of msgs) {
    if (m.direction === "IN") {
      push("wrote", m.body ? `Wrote: “${m.body.slice(0, 80)}”` : "Wrote to you", m.createdAt);
      continue;
    }
    const what = m.campaign?.name ?? "a message";
    if (m.repliedAt) push("replied", `Replied to ${what}`, m.repliedAt);
    if (m.readAt) push("read", `Read ${what}`, m.readAt);
    else if (m.deliveredAt) push("delivered", `Received ${what}`, m.deliveredAt);
    else if (m.sentAt && m.status !== "FAILED") push("sent", `Sent ${what}`, m.sentAt);
    if (m.status === "FAILED") push("failed", `${what === "a message" ? "A message" : what} didn't reach them${m.error ? `: ${m.error}` : ""}`, m.failedAt ?? m.createdAt);
  }
  if (c.lastInboundAt && !msgs.some((m) => m.direction === "IN")) push("wrote", "Wrote to you", c.lastInboundAt);
  if (c.optedOutAt) push("opted_out", c.optOutReason ? `Opted out (${c.optOutReason.replace(/^Replied /, "replied ")})` : "Opted out", c.optedOutAt);
  const src = c.consentSource as WaConsentSource | null;
  push("added", src === "IMPORT" ? "Added by import" : src === "INBOUND" ? "Messaged you first" : src === "LINK" ? "Came from a chat link" : "Added", c.createdAt);
  activity.sort((a, b) => b.t - a.t);

  return {
    id: c.id,
    name: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.profileName || "No name",
    firstName: c.firstName ?? "",
    lastName: c.lastName ?? "",
    phone: c.phone,
    phonePretty: prettyPhone(c.phone),
    email: c.email,
    userId: c.externalId,
    company: c.company,
    location: c.location,
    tags: c.tags,
    vars: Object.fromEntries(Object.entries((c.vars as Record<string, string>) ?? {}).filter(([k]) => k !== "location")),
    lastActive: c.lastInboundAt?.toISOString() ?? null,
    wa: c.waStatus,
    consent: { given: !!src, source: src ? (WA_CONSENT[src] ?? src) : null, date: c.consentAt?.toISOString() ?? null, proof: c.consentBy ? (src === "INBOUND" ? null : `Confirmed by ${c.consentBy}`) : null },
    optedOut: c.optedOutAt ? { at: c.optedOutAt.toISOString(), reason: c.optOutReason } : null,
    segments: segs.filter((_, i) => inSeg[i]).map((s) => ({ id: s.id, name: s.name, color: s.color })),
    activity: activity.slice(0, 20).map(({ kind, text, at }) => ({ kind, text, at })),
  };
}

const editSchema = z.object({
  name: z.string().trim().min(1, "Enter the name.").max(160),
  phone: z.string().trim().min(1, "Enter the WhatsApp number."),
  email: z.union([z.literal(""), z.string().trim().email("Enter a valid email or leave it empty.")]).default(""),
  userId: z.string().trim().max(120).default(""),
  company: z.string().trim().max(200).default(""),
  location: z.string().trim().max(200).default(""),
  tags: z.array(z.string().max(60)).max(20).default([]),
  /** Template variables: { key: value } (empty values are removed) */
  vars: z.record(z.string().max(60), z.string().max(1000)).default({}),
  /** Opted in on WhatsApp (ignored for an opted-out number) */
  consent: z.boolean(),
});

export async function updateWaContact(prisma: PrismaClient, workspaceId: string, id: string, by: string, input: unknown, now = new Date()): Promise<Result> {
  const p = editSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]!.message };
  const c = await prisma.whatsappContact.findFirst({ where: { id, workspaceId } });
  if (!c) return { ok: false, error: "That contact is gone." };
  const phone = phoneKey(p.data.phone);
  if (!phone) return { ok: false, error: "Enter the full number with its country code, like +91 98765 43210." };
  if (phone !== c.phone) {
    if (await prisma.whatsappContact.findFirst({ where: { workspaceId, phone, NOT: { id } }, select: { id: true } })) return { ok: false, error: "Another contact has this number." };
    if (await prisma.doNotContact.findFirst({ where: { workspaceId, kind: "PHONE", value: phone }, select: { id: true } })) return { ok: false, error: "That number is on your do-not-contact list." };
  }
  if (p.data.userId && (await prisma.whatsappContact.findFirst({ where: { workspaceId, externalId: p.data.userId, NOT: { id } }, select: { id: true } }))) return { ok: false, error: "Another contact already has this User ID." };
  const [firstName, lastName] = splitName(p.data.name);
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(p.data.vars)) {
    const key = k.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
    if (key && v.trim()) vars[key] = v.trim();
  }
  if (p.data.location) vars.location = p.data.location;
  await prisma.whatsappContact.update({
    where: { id: c.id },
    data: {
      phone,
      firstName: firstName?.slice(0, 80) ?? null,
      lastName: lastName?.slice(0, 80) ?? null,
      email: p.data.email.toLowerCase() || null,
      externalId: p.data.userId || null,
      company: p.data.company || null,
      location: p.data.location || null,
      tags: [...new Set(p.data.tags.map(waTag).filter(Boolean))],
      vars,
      // An opted-out person stays opted out: consent can't be changed here.
      ...(!c.optedOutAt && p.data.consent && !c.consentSource && { consentSource: "MANUAL", consentAt: now, consentBy: by }),
      ...(!c.optedOutAt && !p.data.consent && c.consentSource && { consentSource: null, consentAt: null, consentBy: null }),
      ...(phone !== c.phone && { waStatus: null }),
    },
  });
  return { ok: true, value: undefined };
}
